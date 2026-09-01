import crypto from 'crypto';
import { query } from './db.js';

// Retenção dos dados crus. metrics_daily é agregado e não expira — é o que
// mantém a série histórica viva depois do purge. Ver LGPD no README.
export const EVENT_RETENTION_DAYS   = Number(process.env.TELEMETRY_EVENT_RETENTION_DAYS)   || 90;
export const SESSION_RETENTION_DAYS = Number(process.env.TELEMETRY_SESSION_RETENTION_DAYS) || 180;

// Salt do hash de IP. Sem ele o hash de um IPv4 é quebrável por força bruta em
// segundos (só existem 2^32). Sem a var configurada não guardamos IP nenhum.
const IP_SALT = process.env.TELEMETRY_IP_SALT || '';

// Whitelist fechada: o cliente não escolhe o que vira linha no banco. Nome fora
// da lista é descartado silenciosamente — não vale devolver erro e ensinar um
// scraper quais eventos existem.
// Cada nome aqui tem um emissor de verdade no front — nome sem emissor vira
// um numero que fica em zero para sempre no painel, e ninguem sabe dizer se e
// falta de uso ou falta de instrumentacao.
//   login       -> App.jsx, ao autenticar
//   view_change -> App.jsx, efeito sobre activeView
//   game_open   -> useGameLauncher.js, quando a mesa abre de fato
//   alive       -> telemetry.js, batimento so com a aba visivel
export const ALLOWED_EVENTS = new Set([
  'login',
  'view_change',
  'game_open',
  'alive',
]);

// Views do app: dashboard, tutorial, gerenciamento, tools (ver App.jsx).
const VIEW_MAX_LEN = 40;
const META_MAX_BYTES = 500;

/** Hash estável do IP. Retorna null se não houver salt configurado. */
export function hashIp(ip) {
  if (!IP_SALT || !ip) return null;
  return crypto.createHash('sha256').update(`${ip}${IP_SALT}`).digest('hex');
}

/**
 * Normaliza um evento vindo do cliente. Retorna null se deve ser descartado.
 * Puro de propósito: é o ponto onde payload hostil é contido, então precisa
 * ser testável sem banco.
 */
export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const event = String(raw.event || '').trim();
  if (!ALLOWED_EVENTS.has(event)) return null;

  const view = raw.view ? String(raw.view).trim().slice(0, VIEW_MAX_LEN) : null;

  let meta = null;
  if (raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta)) {
    const json = JSON.stringify(raw.meta);
    // Corta em vez de truncar: meta pela metade vira JSON inválido no banco.
    if (Buffer.byteLength(json) <= META_MAX_BYTES) meta = raw.meta;
  }

  return { event, view, meta };
}

/**
 * Grava um lote de eventos. Um único INSERT com UNNEST — com flush de 20
 * eventos por cliente, uma query por lote em vez de 20 idas ao banco.
 */
export async function recordEvents(email, rawEvents) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) return 0;

  const clean = rawEvents.map(sanitizeEvent).filter(Boolean);
  if (clean.length === 0) return 0;

  await query(
    `INSERT INTO app_events (user_email, event, view, meta)
     SELECT $1, e, v, m::jsonb
       FROM UNNEST($2::text[], $3::text[], $4::text[]) AS t(e, v, m)`,
    [
      email,
      clean.map(e => e.event),
      clean.map(e => e.view),
      clean.map(e => (e.meta ? JSON.stringify(e.meta) : null)),
    ],
  );

  return clean.length;
}

/** Abre a sessão no connect do socket. Nunca lança — telemetria não derruba conexão. */
export async function startSession({ email, socketId, isPremium, userAgent, ip }) {
  try {
    const { rows } = await query(
      `INSERT INTO app_sessions (user_email, socket_id, is_premium, user_agent, ip_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, socketId, !!isPremium, userAgent ? String(userAgent).slice(0, 400) : null, hashIp(ip)],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.warn('⚠️ [telemetry] startSession falhou:', err.message);
    return null;
  }
}

/** Marca presença. Chamado pelo evento 'alive', que só é emitido com aba visível. */
export async function touchSession(sessionId) {
  if (!sessionId) return;
  try {
    await query('UPDATE app_sessions SET last_seen_at = NOW() WHERE id = $1', [sessionId]);
  } catch (err) {
    console.warn('⚠️ [telemetry] touchSession falhou:', err.message);
  }
}

/**
 * Fecha a sessão no disconnect.
 *
 * duration_seconds usa last_seen_at, NÃO ended_at: o socket continua conectado
 * com a aba em segundo plano, e contar isso como uso infla a permanência média.
 * O que medimos é tempo com a aba à frente.
 */
export async function endSession(sessionId) {
  if (!sessionId) return;
  try {
    await query(
      `UPDATE app_sessions
          SET ended_at = NOW(),
              duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - started_at))::int)
        WHERE id = $1 AND ended_at IS NULL`,
      [sessionId],
    );
  } catch (err) {
    console.warn('⚠️ [telemetry] endSession falhou:', err.message);
  }
}

/**
 * Fecha sessões que ficaram abertas (worker morto sem disconnect, queda de rede
 * sem FIN). Sem isso elas contariam como "online" para sempre.
 */
export async function closeOrphanSessions(staleMinutes = 15) {
  const { rowCount } = await query(
    `UPDATE app_sessions
        SET ended_at = last_seen_at,
            duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - started_at))::int)
      WHERE ended_at IS NULL
        AND last_seen_at < NOW() - ($1 || ' minutes')::interval`,
    [String(staleMinutes)],
  );
  return rowCount;
}

/**
 * Costura reconexões numa visita só.
 *
 * Uma queda de rede de 3s vira duas linhas em app_sessions; contadas cruas,
 * viram "2 sessões de 4min" no lugar de "1 visita de 8min". A costura é feita
 * aqui na leitura porque na escrita exigiria coordenação entre workers do PM2.
 *
 * Função pura: recebe as linhas ordenadas por started_at e devolve as visitas.
 */
export function stitchSessions(rows, gapSeconds = 60) {
  const out = [];

  for (const row of rows) {
    const started = new Date(row.started_at).getTime();
    const ended   = new Date(row.ended_at || row.last_seen_at).getTime();
    const prev    = out[out.length - 1];

    if (prev && started - prev.endedAt <= gapSeconds * 1000) {
      // Mesma visita: estende a anterior em vez de abrir outra.
      prev.endedAt = Math.max(prev.endedAt, ended);
      prev.reconnects++;
      continue;
    }

    out.push({
      email: row.user_email,
      startedAt: started,
      endedAt: ended,
      reconnects: 0,
      isPremium: !!row.is_premium,
    });
  }

  return out.map(v => ({
    ...v,
    durationSeconds: Math.max(0, Math.round((v.endedAt - v.startedAt) / 1000)),
  }));
}

/** Purge por retenção. Roda no mesmo job do rollup. */
export async function purgeOldTelemetry() {
  const events = await query(
    `DELETE FROM app_events WHERE created_at < NOW() - ($1 || ' days')::interval`,
    [String(EVENT_RETENTION_DAYS)],
  );
  const sessions = await query(
    `DELETE FROM app_sessions WHERE started_at < NOW() - ($1 || ' days')::interval`,
    [String(SESSION_RETENTION_DAYS)],
  );
  return { events: events.rowCount, sessions: sessions.rowCount };
}

/**
 * Agrega um dia em metrics_daily.
 *
 * As sessões são costuradas por usuário antes de contar: o número que interessa
 * é "visitas", não "conexões de socket". Idempotente — reprocessar o mesmo dia
 * sobrescreve a linha.
 */
export async function runDailyRollup(day) {
  // O dia vem do banco, nao do Node: started_at e gravado com NOW() do
  // Postgres, e derivar a data em UTC no processo faria o rollup agregar a
  // janela errada sempre que os dois fusos discordarem.
  let target = day;
  if (!target) {
    const { rows } = await query("SELECT (CURRENT_DATE - 1)::text AS d");
    target = rows[0].d;
  }

  const { rows } = await query(
    `SELECT user_email, is_premium, started_at, ended_at, last_seen_at
       FROM app_sessions
      WHERE started_at >= $1::date
        AND started_at <  $1::date + INTERVAL '1 day'
      ORDER BY user_email, started_at`,
    [target],
  );

  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_email)) byUser.set(row.user_email, []);
    byUser.get(row.user_email).push(row);
  }

  let sessions = 0;
  let totalSeconds = 0;
  let premium = 0;
  let free = 0;

  for (const [, userRows] of byUser) {
    const visits = stitchSessions(userRows);
    sessions += visits.length;
    totalSeconds += visits.reduce((acc, v) => acc + v.durationSeconds, 0);
    if (visits.some(v => v.isPremium)) premium++; else free++;
  }

  const dau = byUser.size;

  // Novo = nunca teve sessão antes deste dia. Consulta separada porque depende
  // de todo o histórico, não só da janela do dia.
  const { rows: newRows } = await query(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT user_email
         FROM app_sessions
        GROUP BY user_email
       HAVING MIN(started_at) >= $1::date
          AND MIN(started_at) <  $1::date + INTERVAL '1 day'
     ) t`,
    [target],
  );

  const avg = sessions > 0 ? Math.round(totalSeconds / sessions) : 0;

  await query(
    `INSERT INTO metrics_daily
       (day, dau, premium_dau, free_dau, new_users, sessions, total_seconds, avg_session_seconds, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (day) DO UPDATE SET
       dau = EXCLUDED.dau,
       premium_dau = EXCLUDED.premium_dau,
       free_dau = EXCLUDED.free_dau,
       new_users = EXCLUDED.new_users,
       sessions = EXCLUDED.sessions,
       total_seconds = EXCLUDED.total_seconds,
       avg_session_seconds = EXCLUDED.avg_session_seconds,
       computed_at = NOW()`,
    [target, dau, premium, free, newRows[0].n, sessions, totalSeconds, avg],
  );

  return { day: target, dau, sessions, totalSeconds, avgSessionSeconds: avg, newUsers: newRows[0].n };
}
