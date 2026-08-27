import { query } from './db.js';

// Duracao do banimento, em dias.
export const BAN_DAYS = Number(process.env.BAN_DAYS) || 15;

// 'observe' registra o que SERIA banido sem banir; 'enforce' bane de verdade.
// Comecar sempre em observe: um falso positivo aqui tira o acesso de um
// assinante pagante por 15 dias.
export const BAN_MODE = (process.env.BAN_MODE || 'observe').toLowerCase();

// User-agents de biblioteca HTTP. Um usuario de verdade acessa por navegador;
// nenhum navegador se identifica como axios ou python-requests. Esta e a
// evidencia mais forte e de menor falso positivo que temos.
const BOT_UA = /axios|python-requests|node-fetch|okhttp|Go-http-client|scrapy|httpx|aiohttp|libwww|java\/|Apache-HttpClient|PostmanRuntime|insomnia|got\/|superagent/i;

// Taxa acima do humano. O app faz polling de 5s por fonte (~12 req/min). Uma
// pessoa com varias abas chega a algumas dezenas; 240/min sustentado nao e
// gente. Limiar alto de proposito — preferimos deixar passar a banir errado.
const RATE_LIMIT_PER_MIN = Number(process.env.ABUSE_RATE_PER_MIN) || 240;

// Janela deslizante em memoria: email -> { count, windowStart }.
// Em memoria basta: PM2 roda em cluster, mas cada worker ve uma fatia e o
// limiar e por worker, o que so torna a deteccao mais conservadora.
const rateWindow = new Map();

export function recordHit(email) {
  const now = Date.now();
  const entry = rateWindow.get(email);

  if (!entry || now - entry.windowStart > 60_000) {
    rateWindow.set(email, { count: 1, windowStart: now });
    return 1;
  }
  entry.count++;
  return entry.count;
}

// Evita que o Map cresca sem limite com emails que sumiram.
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [email, entry] of rateWindow) {
    if (entry.windowStart < cutoff) rateWindow.delete(email);
  }
}, 120_000).unref?.();

/**
 * Decide se a requisicao caracteriza abuso.
 * Retorna { abusive, reason, evidence } — nunca lanca.
 */
export function detectAbuse({ email, userAgent, ip, path }) {
  const ua = String(userAgent || '');

  if (BOT_UA.test(ua)) {
    return {
      abusive: true,
      reason: 'bot_user_agent',
      evidence: `UA de biblioteca HTTP: "${ua.slice(0, 80)}" ip=${ip} path=${path}`,
    };
  }

  const rate = recordHit(email);
  if (rate > RATE_LIMIT_PER_MIN) {
    return {
      abusive: true,
      reason: 'rate_abuse',
      evidence: `${rate} req/min (limite ${RATE_LIMIT_PER_MIN}) ip=${ip} ua="${ua.slice(0, 60)}" path=${path}`,
    };
  }

  return { abusive: false };
}

/** Ban ativo do email, ou null. */
export async function getActiveBan(email) {
  const { rows } = await query(
    `SELECT id, reason, banned_until, created_at
       FROM access_bans
      WHERE user_email = $1
        AND revoked_at IS NULL
        AND banned_until > NOW()
      ORDER BY banned_until DESC
      LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

/**
 * Aplica o ban. Se ja houver um ativo, mantem o existente (nao empilha nem
 * estende a cada request — senao o ban seria perpetuo enquanto o bot insiste).
 */
export async function banUser(email, reason, evidence) {
  const existing = await getActiveBan(email);
  if (existing) return existing;

  const { rows } = await query(
    `INSERT INTO access_bans (user_email, reason, evidence, banned_until)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
     RETURNING id, reason, banned_until, created_at`,
    [email, reason, evidence, String(BAN_DAYS)],
  );
  return rows[0];
}

/** Revoga bans ativos do email (falso positivo). */
export async function revokeBan(email, revokedBy = 'admin') {
  const { rowCount } = await query(
    `UPDATE access_bans SET revoked_at = NOW(), revoked_by = $2
      WHERE user_email = $1 AND revoked_at IS NULL AND banned_until > NOW()`,
    [email, revokedBy],
  );
  return rowCount;
}

/** Bans recentes, para a rota de admin. */
export async function listBans(limit = 100) {
  const { rows } = await query(
    `SELECT id, user_email, reason, evidence, banned_until, created_at, revoked_at, revoked_by
       FROM access_bans
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}
