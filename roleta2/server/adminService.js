/**
 * adminService.js — Consultas que alimentam o painel administrativo.
 *
 * Regra geral: série histórica sai de metrics_daily (rollup), não dos dados
 * crus. app_events tem retenção de 90 dias e volume alto; varrer a tabela a
 * cada abertura do painel seria caro e daria resposta diferente depois do purge.
 */

import { query } from './db.js';
import { getPlatformProfile, mascararLinha } from './platformProfileService.js';

/**
 * O painel e ferramenta interna: por decisao do dono do produto, ele mostra CPF
 * e telefone INTEIROS — quem atende precisa ler o numero, nao adivinha-lo.
 *
 * A protecao contra invasor mora nas camadas de acesso, nao em esconder da
 * propria equipe: cerca de rede (adminGate), sessao nominal com TTL, limites de
 * requisicao e auditoria de QUEM abriu a ficha de QUEM.
 *
 * A mascara continua implementada e a um `ADMIN_MASK_PII=true` de distancia,
 * para o dia em que o painel for aberto a perfis menos confiaveis (suporte
 * terceirizado, por exemplo). Ligada, o numero completo passa a sair so pela
 * rota /pii, que exige admin nominal e registra a revelacao.
 */
const MASCARAR_PII = String(process.env.ADMIN_MASK_PII || '').toLowerCase() === 'true';
const talvezMascarar = (linha) => (MASCARAR_PII ? mascararLinha(linha) : linha);
import { stitchSessions } from './telemetryService.js';

/** KPIs do topo do painel. */
export async function getOverview() {
  const [daily, active, subs] = await Promise.all([
    // 30 dias de série. O dia corrente vem do rollup horário, então é parcial.
    query(
      `SELECT day::text, dau, premium_dau, free_dau, new_users, sessions,
              total_seconds, avg_session_seconds
         FROM metrics_daily
        WHERE day >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY day`,
    ),
    // "Agora" não pode sair do rollup: precisa ser leitura ao vivo.
    query(
      `SELECT COUNT(DISTINCT user_email)::int AS online
         FROM app_sessions
        WHERE ended_at IS NULL
          AND last_seen_at > NOW() - INTERVAL '5 minutes'`,
    ),
    query(
      `SELECT status, COUNT(*)::int AS n
         FROM subscriptions
        GROUP BY status`,
    ),
  ]);

  // Janelas móveis a partir das sessões cruas (dentro da retenção de 180 dias).
  const { rows: windows } = await query(
    `SELECT
       COUNT(DISTINCT user_email) FILTER (WHERE started_at > NOW() - INTERVAL '1 day')::int  AS dau,
       COUNT(DISTINCT user_email) FILTER (WHERE started_at > NOW() - INTERVAL '7 days')::int AS wau,
       COUNT(DISTINCT user_email) FILTER (WHERE started_at > NOW() - INTERVAL '30 days')::int AS mau
     FROM app_sessions`,
  );

  return {
    series: daily.rows,
    online: active.rows[0].online,
    dau: windows[0].dau,
    wau: windows[0].wau,
    mau: windows[0].mau,
    // Proporção de quem volta: DAU baixo com MAU alto = gente que entrou e sumiu.
    stickiness: windows[0].mau > 0 ? Math.round((windows[0].dau / windows[0].mau) * 100) : 0,
    subscriptions: subs.rows,
  };
}

/**
 * Retenção por coorte semanal.
 * Linha = semana do primeiro acesso; coluna = quantas voltaram N semanas depois.
 */
export async function getRetention(weeks = 8) {
  const { rows } = await query(
    `WITH firsts AS (
       SELECT user_email, DATE_TRUNC('week', MIN(started_at)) AS cohort
         FROM app_sessions
        GROUP BY user_email
     ),
     activity AS (
       SELECT DISTINCT user_email, DATE_TRUNC('week', started_at) AS week
         FROM app_sessions
     )
     SELECT f.cohort::date::text AS cohort,
            (EXTRACT(EPOCH FROM (a.week - f.cohort)) / 604800)::int AS week_offset,
            COUNT(DISTINCT f.user_email)::int AS users
       FROM firsts f
       JOIN activity a ON a.user_email = f.user_email
      WHERE f.cohort >= DATE_TRUNC('week', NOW()) - ($1 || ' weeks')::interval
        AND a.week >= f.cohort
      GROUP BY f.cohort, week_offset
      ORDER BY f.cohort, week_offset`,
    [String(weeks)],
  );

  // Pivot em JS: matriz de coorte é apresentação, não trabalho de banco.
  const byCohort = new Map();
  for (const r of rows) {
    if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, { cohort: r.cohort, size: 0, offsets: {} });
    const c = byCohort.get(r.cohort);
    c.offsets[r.week_offset] = r.users;
    if (r.week_offset === 0) c.size = r.users;
  }

  return [...byCohort.values()].map(c => ({
    ...c,
    // Percentuais só fazem sentido contra a semana 0.
    percents: Object.fromEntries(
      Object.entries(c.offsets).map(([k, v]) => [k, c.size ? Math.round((v / c.size) * 100) : 0]),
    ),
  }));
}

/** Onde as pessoas passam o tempo. */
export async function getEngagement(days = 14) {
  const [views, hours, games] = await Promise.all([
    query(
      `SELECT view, COUNT(*)::int AS hits, COUNT(DISTINCT user_email)::int AS users
         FROM app_events
        WHERE event = 'view_change'
          AND view IS NOT NULL
          AND created_at > NOW() - ($1 || ' days')::interval
        GROUP BY view
        ORDER BY hits DESC`,
      [String(days)],
    ),
    query(
      `SELECT EXTRACT(HOUR FROM started_at)::int AS hour, COUNT(*)::int AS sessions
         FROM app_sessions
        WHERE started_at > NOW() - ($1 || ' days')::interval
        GROUP BY hour ORDER BY hour`,
      [String(days)],
    ),
    query(
      `SELECT COUNT(*)::int AS opens, COUNT(DISTINCT user_email)::int AS users
         FROM app_events
        WHERE event = 'game_open'
          AND created_at > NOW() - ($1 || ' days')::interval`,
      [String(days)],
    ),
  ]);

  return { views: views.rows, byHour: hours.rows, games: games.rows[0] };
}

/**
 * Funil comercial. Sai de subscriptions/subscription_audit, que têm histórico
 * desde antes da telemetria — é o único painel útil no dia 1.
 */
export async function getFunnel() {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int                                                        AS total,
       COUNT(*) FILTER (WHERE status = 'trialing')::int                     AS trial,
       COUNT(*) FILTER (WHERE status IN ('active', 'paid'))::int            AS pagante,
       COUNT(*) FILTER (WHERE status = 'canceled')::int                     AS cancelado,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS novos_30d
     FROM subscriptions`,
  );

  const { rows: conv } = await query(
    `SELECT COUNT(DISTINCT email)::int AS n
       FROM subscription_audit
      WHERE from_status = 'trialing' AND to_status IN ('active', 'paid')`,
  );

  return { ...rows[0], trial_convertido: conv[0].n };
}

/**
 * Lista paginada com busca, filtros por coluna e ordenação.
 *
 * A primeira versão só tinha busca por e-mail e um LIMIT fixo — com 1.500+
 * assinaturas, isso mostrava as primeiras e escondia o resto sem dizer.
 *
 * Os filtros são montados como fragmentos parametrizados: nada de interpolar
 * valor em SQL. A ordenação é a única parte que entra na query como texto, e
 * por isso passa por uma whitelist — coluna vinda do cliente é injeção pronta.
 */

// Chave da UI -> expressão SQL. Só o que está aqui pode ordenar.
const ORDENACOES = {
  email:         's.email',
  status:        's.status',
  plano:         's.plan_name',
  ultimo_acesso: 'ls.last_seen',
  sessoes:       'ls.sessions',
  banca:         'fin.balance_after',
  casa:          'pp.saldo',
  nome:          'pp.nome',
  ftd:           'pp.ftd_valor',
  expira:        's.expires_at',
  criado:        's.created_at',
};

export async function listUsers({
  search = '',
  limit = 50,
  offset = 0,
  status = '',
  banido = '',
  comBanca = '',
  sessoesMin = null,
  saldoMin = null,
  acesso = '',
  ordenarPor = 'ultimo_acesso',
  direcao = 'desc',
} = {}) {
  const term = String(search || '').trim().toLowerCase();
  const like = `%${term}%`;
  // Flag separada em vez de comparar o LIKE com '%%': com busca vazia o
  // planejador ignora o filtro inteiro em vez de varrer casando tudo.
  const searching = term.length > 0;

  // Buscar por CPF ou telefone é o caso real do suporte: a pessoa liga sem
  // lembrar com que e-mail se cadastrou. Como ela dita "111.222.333-44" e o
  // banco guarda só dígitos, comparamos as duas pontas sem pontuação.
  const soDigitos = term.replace(/\D/g, '');
  const likeDigitos = `%${soDigitos}%`;
  // 4 dígitos evitam que um "11" digitado por engano case com meia base.
  const buscandoDigitos = soDigitos.length >= 4;

  const params = [searching, like, buscandoDigitos, likeDigitos];
  const filtros = [`(NOT $1 OR LOWER(s.email) LIKE $2
                        OR LOWER(COALESCE(s.main_app_email, '')) LIKE $2
                        OR LOWER(COALESCE(pp.nome, '')) LIKE $2
                        OR ($3 AND (COALESCE(pp.documento, '') LIKE $4
                                    OR COALESCE(pp.telefone_completo, '') LIKE $4)))`];

  const add = (sql, valor) => {
    params.push(valor);
    filtros.push(sql.replace('?', `$${params.length}`));
  };

  const STATUS_VALIDOS = ['active', 'trialing', 'paid', 'canceled', 'pending', 'failed'];
  if (status && STATUS_VALIDOS.includes(status)) add('s.status = ?', status);

  if (banido === 'sim') filtros.push('b.id IS NOT NULL');
  if (banido === 'nao') filtros.push('b.id IS NULL');

  if (comBanca === 'sim') filtros.push('fin.balance_after IS NOT NULL');
  if (comBanca === 'nao') filtros.push('fin.balance_after IS NULL');

  if (sessoesMin !== null && sessoesMin !== '' && Number.isFinite(Number(sessoesMin))) {
    add('COALESCE(ls.sessions, 0) >= ?', Number(sessoesMin));
  }

  if (saldoMin !== null && saldoMin !== '' && Number.isFinite(Number(saldoMin))) {
    add('COALESCE(fin.balance_after, 0) >= ?', Number(saldoMin));
  }

  // Janela de último acesso. 'nunca' é o filtro mais útil da tela: assinante
  // pagante que nunca entrou é problema de ativação, não de produto.
  if (acesso === 'nunca')  filtros.push('ls.last_seen IS NULL');
  if (acesso === '7d')     filtros.push(`ls.last_seen > NOW() - INTERVAL '7 days'`);
  if (acesso === '30d')    filtros.push(`ls.last_seen > NOW() - INTERVAL '30 days'`);
  if (acesso === 'sumiu')  filtros.push(`ls.last_seen < NOW() - INTERVAL '30 days'`);

  const where = filtros.join(' AND ');
  const coluna = ORDENACOES[ordenarPor] || ORDENACOES.ultimo_acesso;
  const dir = String(direcao).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Os LATERAL joins são repetidos na contagem porque os filtros de banca,
  // sessões e ban dependem deles.
  const FROM = `
       FROM subscriptions s
       LEFT JOIN LATERAL (
         SELECT MAX(started_at) AS last_seen, COUNT(*)::int AS sessions
           FROM app_sessions a
          WHERE a.user_email = s.email
       ) ls ON TRUE
       LEFT JOIN LATERAL (
         SELECT id FROM access_bans ab
          WHERE ab.user_email = s.email AND ab.revoked_at IS NULL AND ab.banned_until > NOW()
          LIMIT 1
       ) b ON TRUE
       -- Saldo da banca. As tabelas gerenciamento_* usam o e-mail como user_id.
       -- LIMIT 1 sobre o índice de data: não varre o histórico inteiro por linha.
       LEFT JOIN LATERAL (
         SELECT balance_after, date
           FROM gerenciamento_transactions gt
          WHERE gt.user_id = s.email
          ORDER BY gt.date DESC
          LIMIT 1
       ) fin ON TRUE
       -- Espelho da casa de apostas, capturado no login (platformProfileService).
       -- Join direto pela PK: e o e-mail com que a pessoa entra na casa, o mesmo
       -- que vira subscriptions.email quando a conta nasce no /login.
       LEFT JOIN platform_profiles pp ON pp.email = s.email
      WHERE ${where}`;

  const { rows } = await query(
    `SELECT s.email, s.main_app_email, s.status, s.plan_name, s.expires_at, s.created_at,
            ls.last_seen, ls.sessions,
            fin.balance_after AS saldo, fin.date AS ultima_transacao,
            -- Espelho da casa: é o que transforma uma lista de e-mails numa
            -- lista de PESSOAS. Sem isto o suporte abre a ficha de cada linha
            -- só para descobrir de quem ela é.
            pp.nome, pp.cidade, pp.estado, pp.documento,
            pp.telefone, pp.telefone_completo,
            pp.saldo AS saldo_casa, pp.saldo_em, pp.ftd_valor, pp.ftd_em,
            pp.is_trial, pp.mkt_aceito_em, pp.assinatura_expira_em,
            (b.id IS NOT NULL) AS banido
     ${FROM}
      ORDER BY ${coluna} ${dir} NULLS LAST, s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const { rows: count } = await query(`SELECT COUNT(*)::int AS n ${FROM}`, params);

  return {
    users: rows.map(talvezMascarar),
    total: count[0].n,
    ordenacoes: Object.keys(ORDENACOES),
  };
}

/** Ficha completa de um usuário. */
export async function getUserDetail(email) {
  const clean = String(email).trim().toLowerCase();

  const [sub, audit, sessions, events, bans, financeiro, plataforma] = await Promise.all([
    query('SELECT * FROM subscriptions WHERE email = $1 OR main_app_email = $1 LIMIT 1', [clean]),
    query(
      `SELECT from_status, to_status, triggered_by, created_at
         FROM subscription_audit WHERE email = $1 ORDER BY created_at DESC LIMIT 20`,
      [clean],
    ),
    query(
      `SELECT user_email, started_at, ended_at, last_seen_at, is_premium, duration_seconds
         FROM app_sessions WHERE user_email = $1 ORDER BY started_at DESC LIMIT 200`,
      [clean],
    ),
    query(
      `SELECT event, view, meta, created_at
         FROM app_events WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50`,
      [clean],
    ),
    query(
      `SELECT id, reason, evidence, banned_until, created_at, revoked_at, revoked_by
         FROM access_bans WHERE user_email = $1 ORDER BY created_at DESC LIMIT 10`,
      [clean],
    ),
    getUserFinance(clean),
    getPlatformProfile(clean).then(talvezMascarar),
  ]);

  // As sessões cruas são costuradas antes de virar número na tela — é o que
  // transforma reconexão de socket em visita. stitchSessions espera ordem
  // cronológica; a consulta vem invertida para o LIMIT pegar as mais recentes.
  const visits = stitchSessions([...sessions.rows].reverse());
  const totalSeconds = visits.reduce((acc, v) => acc + v.durationSeconds, 0);

  return {
    email: clean,
    subscription: sub.rows[0] || null,
    statusHistory: audit.rows,
    visits: visits.slice(-30).reverse(),
    totalVisits: visits.length,
    totalSeconds,
    avgVisitSeconds: visits.length ? Math.round(totalSeconds / visits.length) : 0,
    recentEvents: events.rows,
    bans: bans.rows,
    financeiro,
    plataforma,
  };
}

/**
 * Tudo que o módulo de Gerenciamento sabe sobre a pessoa.
 *
 * As tabelas gerenciamento_* vivem no mesmo Postgres e usam `user_id`, que ali
 * é o PRÓPRIO E-MAIL (diferente de subscriptions.user_id, que às vezes é o id
 * do provedor de pagamento). Por isso o cruzamento é por e-mail, não por id.
 *
 * Leitura apenas: quem escreve nessas tabelas é o backend Flask do
 * gerenciamento. O painel não altera banca de ninguém.
 */
export async function getUserFinance(email) {
  const clean = String(email).trim().toLowerCase();

  const [profile, objectives, sessions, stats, transactions, prefs, totals] = await Promise.all([
    query(
      `SELECT profile_type, title, risk_level, initial_balance, stop_loss,
              stop_loss_percentage, profit_target, is_active, created_at
         FROM gerenciamento_betting_profiles
        WHERE user_id = $1
        ORDER BY is_active DESC, created_at DESC
        LIMIT 5`,
      [clean],
    ),
    query(
      `SELECT title, target_amount, current_amount, target_date, priority, status,
              is_achieved, achievement_date, category
         FROM gerenciamento_objectives
        WHERE user_id = $1
        ORDER BY is_achieved, target_date NULLS LAST
        LIMIT 20`,
      [clean],
    ),
    query(
      `SELECT session_id, game_type, start_balance, end_balance, total_bets,
              winning_bets, losing_bets, total_wagered, net_result, started_at,
              ended_at, duration_seconds, stop_loss_hit, profit_target_hit, status
         FROM gerenciamento_betting_sessions
        WHERE user_id = $1
        ORDER BY started_at DESC
        LIMIT 30`,
      [clean],
    ),
    query(
      `SELECT period_type, period_date, starting_balance, ending_balance,
              total_deposits, total_withdrawals, net_profit_loss, total_sessions,
              winning_sessions, losing_sessions, total_bets, win_rate,
              stop_losses_hit, profit_targets_hit, max_drawdown, max_profit
         FROM gerenciamento_betting_stats
        WHERE user_id = $1
        ORDER BY period_date DESC
        LIMIT 12`,
      [clean],
    ),
    query(
      `SELECT type, amount, category, description, is_initial_bank, game_type,
              balance_before, balance_after, date
         FROM gerenciamento_transactions
        WHERE user_id = $1
        ORDER BY date DESC
        LIMIT 50`,
      [clean],
    ),
    query(
      `SELECT profile_photo, last_bank_reset, created_at
         FROM gerenciamento_user_preferences
        WHERE user_id = $1`,
      [clean],
    ),
    // Consolidado por tipo. Feito no banco porque a lista de transações é
    // truncada em 50 — somar só o que veio daria um total errado.
    query(
      `SELECT type,
              COUNT(*)::int      AS n,
              SUM(amount)::float AS total
         FROM gerenciamento_transactions
        WHERE user_id = $1
        GROUP BY type`,
      [clean],
    ),
  ]);

  // Saldo atual = balance_after da transação mais recente. É o número que o
  // próprio app mostra para o usuário, então bate com o que ele vê.
  const saldoAtual = transactions.rows[0]?.balance_after ?? null;

  const porTipo = Object.fromEntries(totals.rows.map(r => [r.type, { n: r.n, total: r.total }]));

  return {
    saldoAtual: saldoAtual !== null ? Number(saldoAtual) : null,
    bancaInicial: transactions.rows.find(t => t.is_initial_bank)?.amount ?? null,
    totaisPorTipo: porTipo,
    perfil: profile.rows[0] || null,
    perfis: profile.rows,
    objetivos: objectives.rows,
    sessoes: sessions.rows,
    estatisticas: stats.rows,
    transacoes: transactions.rows,
    preferencias: prefs.rows[0] || null,
    temDados: !!(profile.rows.length || objectives.rows.length || sessions.rows.length || transactions.rows.length),
  };
}
