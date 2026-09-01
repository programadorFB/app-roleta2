import * as Sentry from '@sentry/node';
import { httpIntegration, expressIntegration } from '@sentry/node';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';

import { loadAllExistingSignalIds, saveNewSignals, getFullHistory, getLatestSpins, getNewSignalsSince } from './dbService.js';
import { SOURCES } from './constants.js';
import { testConnection, poolStats, query } from './db.js';
import { initRedis, redisHealthCheck, closeRedis, cacheSet, cacheDel, KEY, TTL, getPubSubClients, publishSignals } from './redisService.js';
import {
  hasActiveAccess, processHublaWebhook, verifyHublaWebhook,
  processKirvanoWebhook, verifyKirvanoWebhook,
  getSubscriptionStats, getActiveSubscriptions, getWebhookLogs,
  getSubscriptionByEmail, getSubscriptionAuditLog, getAllAuditLogs,
  sendExpirationReminders, createTrialSubscription,
  upsertSubscription, logSubscriptionAudit,
  ACTIVE_STATUSES,
} from './subscriptionService.js';
import { detectAbuse, getActiveBan, banUser, revokeBan, listBans, BAN_DAYS, BAN_MODE } from './abuseService.js';
import { verifyToken, extractBearer, peekEmailFromToken, tokenStats, TOKEN_AUTH_MODE } from './authService.js';
import { processSource, initMotorEngine, getLatestMotorAnalysis, computeMotorAnalysisOnDemand, computeFilteredMotorScore, backfillMotorScores } from './motorScoreEngine.js';
// O motor de gatilhos não emite mais nada ao usuário (Portarias 1.964/2026 e 73/2026);
// só persiste o placar interno, então não precisa mais do Socket.IO.
import { processTriggerSource } from './triggerScoreEngine.js';
import { gerenciamentoAuthMiddleware, gerenciamentoProxy } from './gerenciamentoGateway.js';
import { login as adminLogin, logout as adminLogout, resolveSession as resolveAdminSession, logAdminAction, listAdminAudit } from './adminAuthService.js';
import { getOverview, getRetention, getEngagement, getFunnel, listUsers, getUserDetail } from './adminService.js';
import { adminNetworkGate, gateAtivo } from './adminGate.js';
import { recordEvents, hashIp, startSession, touchSession, endSession, closeOrphanSessions, runDailyRollup, purgeOldTelemetry } from './telemetryService.js';
import { capturePlatformData, platformSyncStats, getPlatformRaw, getPlatformPii } from './platformProfileService.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const IS_PROD    = process.env.NODE_ENV === 'production';

const app    = express();
if (IS_PROD) app.set('trust proxy', 1);
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.error('❌ FATAL: CORS_ORIGINS não definido — nenhuma origem permitida');
}

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout:  20000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
});

Sentry.init({
  dsn:              process.env.SENTRY_DSN,
  integrations:     [httpIntegration(), expressIntegration({ app })],
  tracesSampleRate: IS_PROD ? 0.2 : 1.0,
});

const CRAWLER_SECRET      = process.env.CRAWLER_SECRET;
const FRONTEND_URL        = process.env.FRONTEND_URL;
const BACKEND_PUBLIC_URL  = process.env.BACKEND_PUBLIC_URL;
const HUBLA_WEBHOOK_TOKEN = process.env.HUBLA_WEBHOOK_TOKEN;
const HUBLA_CHECKOUT_URL  = process.env.HUBLA_CHECKOUT_URL;
const KIRVANO_WEBHOOK_TOKEN = process.env.KIRVANO_WEBHOOK_TOKEN;
const ADMIN_SECRET        = process.env.ADMIN_SECRET;
const AUTH_PROXY_TARGET   = process.env.AUTH_PROXY_TARGET;
const FETCH_INTERVAL_MS   = 1000;

if (!CRAWLER_SECRET)     console.error('❌ FATAL: CRAWLER_SECRET não definido — /api/report-spin bloqueado');
if (!BACKEND_PUBLIC_URL) console.error('❌ FATAL: BACKEND_PUBLIC_URL não definido — CSP rejeitará conexões');
if (!AUTH_PROXY_TARGET)  console.error('❌ FATAL: AUTH_PROXY_TARGET não definido');

const API_URLS = {
  immersivevip: process.env.API_URL_IMMERSIVEVIP,
  immersive:    process.env.API_URL_IMMERSIVE,
  brasileira:   process.env.API_URL_BRASILEIRA,
  brasilPlay:   process.env.API_URL_BRASILPLAY,
  speed:        process.env.API_URL_SPEED,
  xxxtreme:     process.env.API_URL_XXXTREME,
  vipauto:      process.env.API_URL_VIPAUTO,
  auto:         process.env.API_URL_AUTO,
  vip:          process.env.API_URL_VIP,
  lightning:    process.env.API_URL_LIGHTNING,
  aovivo:       process.env.API_URL_AOVIVO,
  speedauto:    process.env.API_URL_SPEEDAUTO,
  relampago:    process.env.API_URL_RELAMPAGO,
  // viproulette e malta removidos: feeds mortos na API (sem giro desde ~05-20 e
  // ~05-16 respectivamente) e sem UUID novo descobrível. Historico fica no DB.
};

// ── Helpers de segurança ──────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email) && email.length <= 320;
}

function crawlerAuthCheck(req) {
  if (!CRAWLER_SECRET) return false;
  try {
    const a = Buffer.from(String(req.headers['x-crawler-secret'] || ''));
    const b = Buffer.from(CRAWLER_SECRET);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateETag(data) {
  const hash = crypto.createHash('md5');
  if (Array.isArray(data) && data.length > 0) {
    hash.update(`${data[0]?.signalId || data[0]?.signalid || ''}:${data.length}`);
  } else {
    hash.update('empty');
  }
  return `"${hash.digest('hex').substring(0, 16)}"`;
}

// Grita no boot quando o painel esta so atras da senha. Sem isso ninguem
// percebe que /api/admin esta aberto para a internet ate alguem achar a URL.
if (!gateAtivo) {
  console.warn('⚠️  [admin] CERCA DE REDE DESLIGADA — /api/admin aceita qualquer IP; só a senha protege.');
  console.warn('⚠️  [admin] Ligue ADMIN_ALLOWED_IPS (IPs/CIDRs da equipe) ou ADMIN_REQUIRE_CF_ACCESS=true no .env.');
}

// ── Rate limiters ─────────────────────────────────────────────

const crawlerLimiter = rateLimit({
  windowMs: 60_000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições do crawler.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60_000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de webhooks excedido.' },
});

// Leitura do painel. O adminLimiter (30/min) foi dimensionado para chamadas de
// script; uma UI faz dezenas por minuto so navegando entre abas — e o
// StrictMode do React em dev ainda dobra cada uma. 240/min cobre uso humano
// intenso sem abrir espaco para varredura automatizada.
const adminReadLimiter = rateLimit({
  windowMs: 60_000, max: 240,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de leitura do painel excedido.' },
});

const adminLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite admin excedido.' },
});

// Revelacao de dado pessoal (CPF, telefone, respostas cruas da casa).
//
// Deliberadamente APERTADO. O uso legitimo e "abri a ficha de quem me ligou":
// alguns por hora. Uma sessao de admin roubada tentando raspar a base bate
// nesta parede em 40 pessoas e deixa 40 linhas na auditoria — em vez de levar
// a base inteira numa requisicao.
const adminPiiLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 40,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de revelacao de dado pessoal excedido. Aguarde alguns minutos.' },
});

// Limiter proprio e apertado para o login do painel: e o alvo natural de forca
// bruta, e o adminLimiter geral e generoso demais para esta rota.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

// Telemetria: o cliente manda lotes a cada 15s, mais o flush ao trocar de aba.
// 30/min por IP cobre uso normal com folga e ainda contem quem tentar usar a
// rota como canal de escrita barato no banco.
const telemetryLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de telemetria excedido.' },
});

const subscriptionStatusLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas consultas de status.' },
});

const globalLimiter = rateLimit({
  windowMs: 60_000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de requisições excedido.' },
  skip: (req) => req.url === '/health',
});

// ── Middleware ────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", BACKEND_PUBLIC_URL, BACKEND_PUBLIC_URL?.replace(/^https:/, 'wss:')].filter(Boolean),
      fontSrc:    ["'self'", "data:"],
      frameSrc:   ["'self'", "https://api.appbackend.tech"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// ── Rate limit global ───────────────────────────────
app.use(globalLimiter);

// ── Anti-bot / Anti-clone ───────────────────────────
const BLOCKED_UA = /wget|curl|scrapy|python-requests|httpclient|crawler|spider|headless|phantomjs|selenium/i;
const API_SIGNING_SECRET = process.env.API_SIGNING_SECRET || '';
// Chave anterior, aceita durante a rotacao: a chave vai embutida no bundle,
// entao quem esta com o bundle antigo em cache assina com a velha.
const API_SIGNING_SECRET_PREVIOUS = process.env.API_SIGNING_SECRET_PREVIOUS || '';
// 300s (nao 60): relogio de usuario final erra e reprovava gente legitima.
const HMAC_WINDOW_SECONDS = Number(process.env.HMAC_WINDOW_SECONDS) || 300;
// 'observe' valida e registra sem bloquear; 'enforce' bloqueia.
const API_SIGNING_MODE = (process.env.API_SIGNING_MODE || 'observe').toLowerCase();
const ACCOUNT_CHECK_MODE = (process.env.ACCOUNT_CHECK_MODE || 'observe').toLowerCase();
const signingStats = { ok: 0, missing: 0, expired: 0, bad: 0, previousKey: 0 };
const accountStats = { known: 0, unknown: 0, errors: 0, trialBlocked: 0, registeredOnLogin: 0, loginNoEmail: 0, loginRegisterErrors: 0 };
const abuseStats = { checked: 0, flagged: 0, banned: 0, blocked: 0, errors: 0 };

app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || '';

  // Bloquear bots/scrapers conhecidos nas rotas da API
  if (req.url.startsWith('/api/') && BLOCKED_UA.test(ua)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Bloquear requests sem User-Agent em endpoints protegidos
  // (webhooks Hubla/Kirvano são server-to-server e podem vir sem UA)
  if (req.url.startsWith('/api/') && !ua && !req.headers['x-crawler-secret']
      && !req.headers['x-hubla-token'] && !req.headers['x-kirvano-token']) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  next();
});

// ── HMAC Request Signing Verification ───────────────
// Verifica X-Sig e X-Ts em rotas /api/ (produção).
// Pula rotas que já possuem autenticação própria (crawler, webhooks).
app.use((req, res, next) => {
  // Preflight CORS nunca carrega X-Sig/X-Ts — o browser so manda na requisicao
  // real. Este middleware roda ANTES do cors(), entao barrar o OPTIONS aqui faz
  // o navegador abortar tudo e o app reportar "sem conexao".
  if (req.method === 'OPTIONS') return next();
  if (!IS_PROD || !API_SIGNING_SECRET) return next();

  const isApiRoute = req.url.startsWith('/api/') || req.url.startsWith('/login') || req.url.startsWith('/start-game');
  if (!isApiRoute) return next();

  // Rotas com autenticação própria — não precisam de HMAC
  if (req.headers['x-crawler-secret'] || req.headers['x-hubla-token'] || req.headers['x-kirvano-token']) return next();
  // Gerenciamento: app separado, em outro dominio, que nao assina. Tem auth
  // propria (gerenciamentoAuthMiddleware + GATEWAY_SECRET).
  if (req.url.startsWith('/api/gerenciamento')) return next();
  // Health check
  if (req.url === '/api/health' || req.url === '/health') return next();

  const sig = req.headers['x-sig'];
  const ts = parseInt(req.headers['x-ts'], 10);

  const reject = (reason) => {
    signingStats[reason] = (signingStats[reason] || 0) + 1;
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '?';
    if (API_SIGNING_MODE === 'enforce') {
      if (signingStats[reason] % 25 === 1) {
        console.warn(`⛔ [signing:enforce] BLOQUEADO ${reason} — ${req.method} ${req.path} user="${req.query.userEmail || '-'}" ip=${ip} ua="${String(req.headers['user-agent'] || '').slice(0, 45)}"`);
      }
      return res.status(403).json({ error: 'Acesso negado' });
    }
    console.log(`🔍 [signing:observe] ${reason} — ${req.method} ${req.path} user="${req.query.userEmail || '-'}" ip=${ip} ua="${String(req.headers['user-agent'] || '').slice(0, 45)}"`);
    return next();
  };

  if (!sig || !ts) return reject('missing');

  // Timestamp dentro da janela permitida
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > HMAC_WINDOW_SECONDS) return reject('expired');

  // Verifica HMAC — timing-safe, contra a chave atual e a anterior (rotacao).
  const urlPath = req.path; // pathname sem query string
  const msg = `${ts}:${urlPath}`;
  const sigBuf = Buffer.from(String(sig));

  const matches = (secret) => {
    if (!secret) return false;
    const expBuf = Buffer.from(crypto.createHmac('sha256', secret).update(msg).digest('hex'));
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  };

  if (matches(API_SIGNING_SECRET)) { signingStats.ok++; return next(); }
  if (matches(API_SIGNING_SECRET_PREVIOUS)) { signingStats.previousKey++; return next(); }

  return reject('bad');
});

// ── Origin Enforcement (além do CORS) ───────────────
// Rejeita requests com Origin/Referer de domínios não autorizados.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();   // preflight: quem responde e o cors()
  if (!IS_PROD) return next();

  const isApiRoute = req.url.startsWith('/api/') || req.url.startsWith('/login') || req.url.startsWith('/start-game');
  if (!isApiRoute) return next();
  if (req.headers['x-crawler-secret'] || req.headers['x-hubla-token'] || req.headers['x-kirvano-token']) return next();

  const origin = req.headers['origin'] || '';
  const referer = req.headers['referer'] || '';

  // Requests sem origin (server-to-server, mobile, etc.) são cobertos pelo HMAC acima
  if (!origin && !referer) return next();

  const isAllowed = (url) => {
    if (!url) return true;
    return allowedOrigins.some(ao => url.startsWith(ao)) ||
           (FRONTEND_URL && url.startsWith(FRONTEND_URL));
  };

  if (!isAllowed(origin) || !isAllowed(referer)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  next();
});

app.use((req, res, next) => {
  req._startTime = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - req._startTime;
    if (ms > 500 || res.statusCode >= 400) {
      const emoji = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '🐢';
      console.log(`${emoji} ${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (FRONTEND_URL && origin.startsWith(FRONTEND_URL)) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Email', 'x-hubla-token', 'x-kirvano-token', 'x-crawler-secret', 'X-Sig', 'X-Ts'],
}));

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// ── Auth middleware ───────────────────────────────────────────

const requireActiveSubscription = async (req, res, next) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(401).json({ error: 'userEmail obrigatório', requiresSubscription: true });

    const cleanEmail = userEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Email inválido', requiresSubscription: true });

    let subscription = await getSubscriptionByEmail(cleanEmail);
    // Primeiro acesso (ou conta free do login): concede 7 dias de trial em vez de barrar.
    if (!subscription || !ACTIVE_STATUSES.includes(subscription.status) || (subscription.expires_at && new Date(subscription.expires_at) < new Date())) {
      subscription = await createTrialSubscription(cleanEmail);
    }
    if (!subscription) {
      return res.status(403).json({ error: 'Assinatura não encontrada', requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL });
    }

    if (!ACTIVE_STATUSES.includes(subscription.status)) {
      return res.status(403).json({ error: `Assinatura inativa (${subscription.status})`, requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL });
    }
    if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Assinatura expirada', requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL });
    }

    req.subscription = subscription;
    next();
  } catch (err) {
    console.error(`❌ [requireActiveSubscription] ${err.message}`);
    Sentry.captureException(err);
    res.status(500).json({ error: 'Erro ao verificar assinatura' });
  }
};

// Modo free unificado: rotas de DADOS exigem só email válido (sem assinatura).
// Rotas premium (triggers, fetch manual) seguem com requireActiveSubscription.
/**
 * Autenticacao de verdade: o email deixa de ser AFIRMADO na query e passa a ser
 * PROVADO pelo token. Ate aqui bastava saber o email de um assinante para usar
 * a API como ele.
 *
 * O token e HS256 e o segredo e do provedor, entao a validacao acontece no
 * emissor (GET /profile), com cache no Redis.
 *
 * Retorna 'blocked' se ja respondeu; qualquer outra coisa = segue o fluxo.
 */
async function requireProvenIdentity(req, res, cleanEmail) {
  const token = extractBearer(req);

  const deny = (reason, status, body) => {
    tokenStats[reason] = (tokenStats[reason] || 0) + 1;
    if (TOKEN_AUTH_MODE !== 'enforce') {
      if ((tokenStats[reason] || 0) % 25 === 1) {
        const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '?';
        console.log(`🔑 [token:observe] ${reason} — ${req.method} ${req.path} user="${cleanEmail}" ip=${ip}`);
      }
      return 'pass';
    }
    res.status(status).json(body);
    return 'blocked';
  };

  if (!token) return deny('missing', 401, { error: 'Autenticação obrigatória', code: 'NO_TOKEN' });

  // Atalho barato: se o proprio payload ja diz outro dono, nem consulta o
  // upstream. Nao e prova (payload nao e verificado), so economia.
  const claimed = peekEmailFromToken(token);
  if (claimed && claimed !== cleanEmail) {
    return deny('mismatch', 403, { error: 'Token não pertence a este usuário', code: 'TOKEN_MISMATCH' });
  }

  const result = await verifyToken(token);

  // Instabilidade do upstream (5xx, timeout, Redis fora) NAO derruba usuario.
  if (result.transient) {
    tokenStats.upstreamError++;
    console.warn(`⚠️ [token] validacao indisponivel, liberando: ${result.reason} ${result.error || ''}`);
    return 'pass';
  }

  if (!result.valid) {
    return deny('invalid', 401, { error: 'Sessão expirada ou token inválido', code: 'INVALID_TOKEN' });
  }
  if (result.email !== cleanEmail) {
    return deny('mismatch', 403, { error: 'Token não pertence a este usuário', code: 'TOKEN_MISMATCH' });
  }

  tokenStats.ok++;
  return 'pass';
}

// Texto unico da advertencia — usado na resposta da API e exibido pelo app.
const BAN_WARNING = `ADVERTÊNCIA! Detectamos acesso automatizado (scraping) na sua conta, o que viola os Termos de Uso. Seu acesso está suspenso por ${BAN_DAYS} dias. Se você acredita que houve engano, fale com o suporte.`;

/**
 * Politica anti-scraping. Roda depois de confirmada a conta: so faz sentido
 * banir quem tem identidade. Nunca lanca — erro aqui libera a request, porque
 * falha de infraestrutura nao pode tirar o acesso de assinante.
 */
async function enforceAbusePolicy(req, res, next, email) {
  try {
    abuseStats.checked++;

    const ban = await getActiveBan(email);
    if (ban) {
      abuseStats.blocked++;
      return res.status(403).json({ error: BAN_WARNING, code: 'ACCESS_BANNED', reason: ban.reason, bannedUntil: ban.banned_until });
    }

    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '?';
    const verdict = detectAbuse({ email, userAgent: req.headers['user-agent'], ip, path: req.path });
    if (!verdict.abusive) return next();

    abuseStats.flagged++;
    console.warn(`🚨 [abuse:${BAN_MODE}] ${verdict.reason} — user="${email}" ${verdict.evidence}`);
    Sentry.captureMessage(`Abuso detectado: ${verdict.reason} — ${email}`, 'warning');

    if (BAN_MODE !== 'enforce') return next();

    const applied = await banUser(email, verdict.reason, verdict.evidence);
    abuseStats.banned++;
    console.warn(`⛔ [abuse] BANIDO ate ${applied.banned_until} — user="${email}"`);
    return res.status(403).json({ error: BAN_WARNING, code: 'ACCESS_BANNED', reason: applied.reason, bannedUntil: applied.banned_until });
  } catch (err) {
    abuseStats.errors++;
    console.error(`⚠️ [abuse] policy falhou, liberando: ${err.message}`);
    Sentry.captureException(err, { tags: { context: 'abuse-policy' } });
    return next();
  }
}

// Antes isto validava só o FORMATO do email: qualquer string com '@' liberava
// o historico de giros. Agora a conta precisa EXISTIR — ela nasce no login.
const requireValidUser = async (req, res, next) => {
  const userEmail = req.query.userEmail;
  if (!userEmail) return res.status(401).json({ error: 'userEmail obrigatório' });

  const cleanEmail = userEmail.trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Email inválido' });

  try {
    const sub = await getSubscriptionByEmail(cleanEmail);
    if (sub) {
      accountStats.known++;
      const authed = await requireProvenIdentity(req, res, cleanEmail);
      if (authed === 'blocked') return;   // ja respondeu 401/403
      return enforceAbusePolicy(req, res, next, cleanEmail);
    }

    accountStats.unknown++;
    const who = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '?';
    console.log(`🔒 [account:${ACCOUNT_CHECK_MODE}] conta inexistente — ${req.method} ${req.path} user="${cleanEmail}" ip=${who} ua="${String(req.headers['user-agent'] || '').slice(0, 45)}"`);

    if (ACCOUNT_CHECK_MODE === 'enforce') {
      return res.status(403).json({ error: 'Conta não encontrada', requiresSubscription: true });
    }
    return next();
  } catch (err) {
    // Fail-open deliberado: instabilidade de DB/Redis nao pode derrubar
    // usuario legitimo.
    accountStats.errors++;
    console.error(`⚠️ [account] lookup falhou, liberando: ${err.message}`);
    Sentry.captureException(err, { tags: { context: 'requireValidUser' } });
    return next();
  }
};

// requireAdminAuth foi removido: requireAdminSession o substitui e aceita tanto
// a sessao nominal do painel quanto o mesmo x-admin-secret de antes, entao os
// scripts existentes seguem funcionando sem duas portas de entrada.

/**
 * Sessão do painel administrativo.
 *
 * Aceita também o x-admin-secret: os scripts e o curl que já usam as rotas
 * /api/admin continuam funcionando sem mudança. A diferença é o rastro — a
 * sessão sabe QUAL admin agiu, o secret compartilhado não, e por isso as ações
 * feitas por secret ficam registradas como 'secret' na auditoria.
 */
const requireAdminSession = async (req, res, next) => {
  const token = extractBearer(req);

  if (token) {
    try {
      const session = await resolveAdminSession(token);
      if (session) {
        req.admin = session;
        return next();
      }
    } catch (err) {
      // Redis fora não pode virar porta aberta: cai para o secret e, sem ele, 403.
      console.error('⚠️ [admin] resolveSession falhou:', err.message);
    }
  }

  if (ADMIN_SECRET && req.headers['x-admin-secret']) {
    try {
      const a = Buffer.from(String(req.headers['x-admin-secret']));
      const b = Buffer.from(ADMIN_SECRET);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        req.admin = { email: 'secret', name: 'Acesso por secret', role: 'admin' };
        return next();
      }
    } catch { /* cai no 403 */ }
  }

  Sentry.captureMessage(`Admin session negada — IP: ${req.ip}`, 'warning');
  return res.status(403).json({ error: 'Acesso negado' });
};

/** Hash do IP de quem executou a ação, para a auditoria. */
const adminIpHash = (req) =>
  hashIp(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip);

/**
 * Exige sessão NOMINAL — não aceita o x-admin-secret.
 *
 * Vai nas ações que recaem sobre uma pessoa (mexer em assinatura, banir,
 * derrubar sessão, abrir a ficha completa). O secret compartilhado responde
 * "é um admin?", nunca "qual admin?", e para esse tipo de ação a auditoria
 * precisa de nome próprio. Scripts que usam o secret seguem funcionando nas
 * rotas operacionais e de leitura agregada.
 */
const requireAdminIdentity = (req, res, next) => {
  if (!req.admin || req.admin.email === 'secret') {
    return res.status(403).json({
      error: 'Esta ação exige login nominal no painel — o acesso por secret não identifica quem agiu.',
    });
  }
  next();
};

/**
 * Registra CONSULTA a dado pessoal.
 *
 * A auditoria só cobre alteração por natureza. Como a ficha mostra banca,
 * transações e objetivos, quem abriu a ficha de quem também é informação que
 * precisa existir — para investigar uso indevido e para responder por ela sob
 * a LGPD. Não bloqueia nada: apenas deixa rastro.
 */
const auditarLeitura = (acao) => (req, res, next) => {
  logAdminAction({
    adminEmail:  req.admin?.email || 'desconhecido',
    action:      acao,
    targetEmail: req.params?.email ? String(req.params.email).trim().toLowerCase() : null,
    payload:     req.query?.search ? { busca: String(req.query.search).slice(0, 80) } : null,
    ipHash:      adminIpHash(req),
  });
  next();
};

// ── Subscription fallback helper ──────────────────────────────

async function checkSubscriptionWithFallback(email) {
  const isActive = (sub) =>
    sub && ACTIVE_STATUSES.includes(sub.status) &&
    (!sub.expires_at || new Date(sub.expires_at) >= new Date());

  let cached = null;
  try {
    cached = await getSubscriptionByEmail(email);
  } catch (cacheErr) {
    console.error('[checkSub] Erro no cached lookup - fail-open:', cacheErr.message);
    Sentry.captureException(cacheErr, { tags: { context: 'subscription-cached-check' }, extra: { email } });
    return { canPlay: true, subscription: null };
  }
  if (!cached || !isActive(cached)) {
    try {
      const trialSub = await createTrialSubscription(email);
      if (isActive(trialSub)) return { canPlay: true, subscription: trialSub };
    } catch { /* fail open / continua a checagem */ }
  } else if (isActive(cached)) {
    return { canPlay: true, subscription: cached };
  }

  try {
    const { rows } = await query('SELECT * FROM subscriptions WHERE email = $1', [email]);
    const fresh = rows[0] || null;
    if (isActive(fresh)) {
      console.log(`🔄 [checkSub] Cache stale para ${email} — atualizando`);
      await cacheSet(KEY.sub(email), fresh, TTL.SUBSCRIPTION);
      return { canPlay: true, subscription: fresh };
    }
    return { canPlay: false, subscription: fresh };
  } catch (dbErr) {
    console.error('⚠️ [checkSub] Erro no fresh DB check — fail-open:', dbErr.message);
    Sentry.captureException(dbErr, { tags: { context: 'subscription-fresh-check' }, extra: { email } });
    return { canPlay: true, subscription: null };
  }
}

// ── Proxy: /login ─────────────────────────────────────────────

app.use('/login', createProxyMiddleware({
  target: AUTH_PROXY_TARGET,
  changeOrigin: true,
  followRedirects: true,
  timeout: 60000,
  pathRewrite: { '^/': '/login' },
  selfHandleResponse: true,
  // Entrada validada SOMENTE pelo proxy de entrada (auth externo).
  // Free e premium entram igual; o plano e resolvido via
  // /api/subscription/status e as rotas premium por requireActiveSubscription.
  on: {
    // O upstream comprime com zstd, que o responseInterceptor NÃO descomprime
    // (só gzip/deflate/brotli). Sem isto o corpo chega corrompido no browser
    // (Content-Encoding removido, mas bytes ainda zstd) → response.json() quebra
    // com "Erro de rede". Forçamos um encoding que o interceptor trata.
    proxyReq: (proxyReq) => {
      proxyReq.setHeader('Accept-Encoding', 'gzip, deflate');
    },
    // O auth externo responde 5xx (errCode LOGIN_ERROR) para credencial
    // invalida. Traduzimos para 400 + code INVALID_CREDENTIALS, que o
    // frontend ja mapeia para "E-mail ou senha incorretos.". Evitamos 401
    // de proposito: ele dispara auto-logout no front.
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const status = proxyRes.statusCode || 0;
      if (status >= 500) {
        try {
          const j = JSON.parse(responseBuffer.toString('utf8'));
          const detail = String(j.details || j.message || '');
          if (j.errCode === 'LOGIN_ERROR' && /incorret|senha|password|credenc|invalid/i.test(detail)) {
            res.statusCode = 400;
            return JSON.stringify({ error: true, code: 'INVALID_CREDENTIALS', message: detail || 'E-mail ou senha incorretos.' });
          }
        } catch { /* corpo nao-JSON: repassa intacto */ }
      }

      // Login OK: e AQUI que a conta passa a existir. So ganha trial quem
      // consegue autenticar no proxy.
      if (status >= 200 && status < 300) {
        try {
          const body = JSON.parse(responseBuffer.toString('utf8'));
          const token = body.jwt || body.token || body.access_token || body.data?.token || body.data?.jwt;
          let email = body.email || body.data?.email || null;

          if (!email && token) {
            const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf-8'));
            email = payload.email || payload.sub || null;
          }

          if (email && isValidEmail(String(email).trim().toLowerCase())) {
            const cleanEmail = String(email).trim().toLowerCase();
            await createTrialSubscription(cleanEmail);
            accountStats.registeredOnLogin++;
            console.log(`✅ [login] conta registrada: ${cleanEmail}`);
          } else {
            accountStats.loginNoEmail++;
            console.warn('⚠️ [login] sucesso sem email identificavel — conta nao registrada');
          }

          // Espelha /profile e /wallet da casa no nosso banco. Este e o UNICO
          // momento em que temos o token da pessoa — a casa nao deixa o
          // servidor consultar terceiros.
          //
          // FORA do `if` do e-mail de proposito: a captura descobre sozinha de
          // quem e o token (o /profile devolve o e-mail) e o que passamos aqui
          // e so um palpite de partida. Quando nem esse palpite existe, o
          // espelho ainda funciona — e continua sendo a unica pista de quem
          // entrou.
          //
          // Sem await: a resposta do login nao espera duas idas a casa de
          // apostas. A funcao nunca lanca, mas o .catch fica como rede contra
          // unhandled rejection.
          if (token) {
            const jaRegistrada = !!email;
            capturePlatformData(email, token)
              .then(async (r) => {
                // Rede de seguranca: se o corpo do login nao deu o e-mail mas a
                // captura conseguiu, a conta nasce aqui — mantendo a regra de
                // que quem autentica passa a existir.
                if (!jaRegistrada && r?.ok && r.email) {
                  await createTrialSubscription(r.email);
                  accountStats.registeredOnLogin++;
                  console.log(`✅ [login] conta registrada pelo espelho: ${r.email}`);
                }
              })
              .catch((e) => console.error(`⚠️ [plataforma] captura falhou: ${e.message}`));
          }
        } catch (err) {
          // Nunca derrubar o login por causa disto: o usuario autenticou.
          accountStats.loginRegisterErrors++;
          console.error(`⚠️ [login] falha ao registrar conta: ${err.message}`);
          Sentry.captureException(err, { tags: { context: 'login-register-account' } });
        }
      }

      return responseBuffer;
    }),
    error: (err, req, res) => {
      console.error('[login] proxy error (conexao upstream):', err && err.message);
      Sentry.captureException(err);
      if (res && !res.headersSent && typeof res.status === 'function') {
        res.status(502).json({ error: true, message: 'Servico de login indisponivel. Tente novamente em instantes.' });
      }
    },
  },
}));

// ── Proxy: /start-game ────────────────────────────────────────

app.use('/start-game', async (req, res, next) => {
  let email = req.query.userEmail || null;

  if (!email && req.headers.authorization) {
    try {
      const token   = req.headers.authorization.replace('Bearer ', '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
      email = payload.email || payload.sub || null;
    } catch { /* JWT inválido */ }
  }

  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    // Modo free unificado: free também pode lançar o jogo (só loga).
    const { canPlay } = await checkSubscriptionWithFallback(cleanEmail);
    if (!canPlay) console.log(`🆓 [start-game] Usuário free lançando jogo: ${cleanEmail}`);
  } else {
    console.warn('⚠️ [start-game] Email não encontrado — pulando verificação');
  }

  next();
}, createProxyMiddleware({
  target: AUTH_PROXY_TARGET,
  changeOrigin: true,
  timeout: 60000,
  pathRewrite: (p) => `/start-game${p}`,

  onProxyReq: (proxyReq, req) => {
    if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    proxyReq.setHeader('Accept', 'application/json');
  },

  onProxyRes: (proxyRes, req, res) => {
    const chunks = [];
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (proxyRes.statusCode >= 400) console.error(`❌ [start-game] Proxy ${proxyRes.statusCode}:`, body.substring(0, 200));
      Object.keys(proxyRes.headers).forEach(k => { try { res.setHeader(k, proxyRes.headers[k]); } catch { /* ignore */ } });
      res.status(proxyRes.statusCode).end(body);
    });
  },

  onError: (err, req, res) => {
    Sentry.captureException(err, { tags: { context: 'start-game-proxy' } });
    const errorMap = {
      ECONNREFUSED:    { status: 503, message: 'Servidor de jogos indisponível.' },
      ETIMEDOUT:       { status: 504, message: 'Timeout ao conectar com o servidor de jogos.' },
      ESOCKETTIMEDOUT: { status: 504, message: 'Timeout de socket.' },
      ECONNRESET:      { status: 502, message: 'Conexão interrompida.' },
      ENOTFOUND:       { status: 502, message: 'Servidor não encontrado.' },
      EHOSTUNREACH:    { status: 503, message: 'Host inacessível.' },
      ENETUNREACH:     { status: 503, message: 'Rede inacessível.' },
    };
    const { status, message } = errorMap[err.code] || { status: 500, message: 'Erro interno.' };
    if (!res.headersSent) res.status(status).json({ error: true, message, code: err.code });
  },

  logLevel: 'warn',
}));

// ── Proxy: /api/gerenciamento/* (gateway HMAC -> gerenciamento_backend Flask) ──
app.use('/api/gerenciamento', gerenciamentoAuthMiddleware, gerenciamentoProxy);

app.use(express.static(path.join(__dirname, '..', 'dist')));

// ── Crawler endpoints ─────────────────────────────────────────

app.post('/api/report-spin', crawlerLimiter, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    if (!crawlerAuthCheck(req)) return res.status(403).json({ error: 'Acesso negado' });

    const { signal, source } = req.body;
    if (!signal || !source)        return res.status(400).json({ error: 'Payload inválido' });
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'Source inválido' });

    await saveNewSignals([req.body], source);
    io.emit('novo-giro', { source, data: req.body });
    res.json({ success: true, saved: signal });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-croupier', crawlerLimiter, express.json({ limit: '4kb' }), (req, res) => {
  if (!crawlerAuthCheck(req)) return res.status(403).json({ error: 'Acesso negado' });

  const { croupier, source } = req.body;
  if (croupier !== undefined && (typeof croupier !== 'string' || croupier.length > 100)) {
    return res.status(400).json({ error: 'Campo croupier inválido' });
  }

  const safeSource = source && SOURCES.includes(source) ? source : 'brasileira';
  if (croupier) io.emit('troca-croupier', { source: safeSource, croupier });
  res.json({ status: 'ok' });
});

// ── Webhook Hubla ─────────────────────────────────────────────

app.post('/api/webhooks/hubla', webhookLimiter, express.json({ limit: '64kb' }), async (req, res) => {
  try {
    if (!verifyHublaWebhook(req.headers['x-hubla-token'], HUBLA_WEBHOOK_TOKEN)) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const result = await processHublaWebhook(req.body.type, req.body);
    res.json({ success: true, result });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Webhook Kirvano ───────────────────────────────────────────
// A Kirvano envia o evento no campo `event` e (quando configurado) o token
// no header `x-kirvano-token`. Espelha a integração do roleta3, adaptada.
// Validação "se-configurado": se KIRVANO_WEBHOOK_TOKEN estiver setado no
// .env, o token é exigido; caso contrário aceita com aviso (rollout).
// Para travar: setar KIRVANO_WEBHOOK_TOKEN e cadastrar o mesmo token na Kirvano.
app.post('/api/webhooks/kirvano', webhookLimiter, express.json({ limit: '64kb' }), async (req, res) => {
  try {
    if (KIRVANO_WEBHOOK_TOKEN) {
      if (!verifyKirvanoWebhook(req.headers['x-kirvano-token'], KIRVANO_WEBHOOK_TOKEN)) {
        return res.status(401).json({ error: 'Token inválido' });
      }
    } else {
      console.warn('⚠️ [KIRVANO] KIRVANO_WEBHOOK_TOKEN não configurado — webhook aceito sem verificação');
    }
    const result = await processKirvanoWebhook(req.body.event, req.body);
    res.json({ success: true, result });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Subscription status ───────────────────────────────────────

app.get('/api/subscription/status', subscriptionStatusLimiter, async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: 'userEmail obrigatório' });

    const cleanEmail = userEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Email inválido' });

    let subscription = await getSubscriptionByEmail(cleanEmail);

    // Trial NAO nasce de chamada de API anonima: bastava um email inventado
    // para ganhar 7 dias e destrancar os dados. Conta nasce no login.
    // Esta rota e a porta de entrada: e aqui que a conta de um usuario NOVO
    // nasce, porque o app a chama logo apos o login. Mas so pode criar conta
    // para quem realmente autenticou — o Bearer e a prova, ele so existe apos
    // login bem-sucedido no emissor.
    if (!subscription) {
      const token = extractBearer(req);
      const verified = token ? await verifyToken(token) : { valid: false, reason: 'missing' };

      const provado = verified.valid && verified.email === cleanEmail;
      const indisponivel = verified.transient === true;   // fail-open

      if (!provado && !indisponivel) {
        accountStats.trialBlocked++;
        const who = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '?';
        console.log(`🔒 [account:${ACCOUNT_CHECK_MODE}] conta nova negada (sem token valido) — user="${cleanEmail}" ip=${who} motivo=${verified.reason || 'mismatch'}`);
        if (ACCOUNT_CHECK_MODE === 'enforce') {
          return res.status(401).json({ error: 'Autenticação obrigatória', code: 'NO_TOKEN' });
        }
      } else {
        accountStats.registeredOnLogin++;
        console.log(`✅ [account] conta criada para usuario autenticado: ${cleanEmail}`);
      }

      subscription = await createTrialSubscription(cleanEmail);
    } else if (!ACTIVE_STATUSES.includes(subscription.status) || (subscription.expires_at && new Date(subscription.expires_at) < new Date())) {
      // Conta conhecida: politica de trial normal, intacta.
      subscription = await createTrialSubscription(cleanEmail);
    }

    if (!subscription) return res.json({ hasAccess: false, subscription: null, checkoutUrl: HUBLA_CHECKOUT_URL });

    const hasAccess = ACTIVE_STATUSES.includes(subscription.status) &&
      (!subscription.expires_at || new Date(subscription.expires_at) >= new Date());

    res.json({ hasAccess, subscription, checkoutUrl: HUBLA_CHECKOUT_URL });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

// ── Data endpoints ────────────────────────────────────────────

app.get('/api/full-history', requireValidUser, async (req, res) => {
  try {
    const source = req.query.source;
    if (!source || !SOURCES.includes(source)) return res.status(400).json({ error: 'source inválido' });

    const result = await getFullHistory(source) || [];
    const etag   = generateETag(result);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=3, must-revalidate');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(result);
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history-delta', requireValidUser, async (req, res) => {
  try {
    const source = req.query.source;
    if (!source || !SOURCES.includes(source)) return res.status(400).json({ error: 'source inválido' });

    const lastSignalId = req.query.since;
    if (!lastSignalId) {
      const data = await getFullHistory(source);
      return res.json({ full: true, data: data || [] });
    }

    const newData = await getNewSignalsSince(source, lastSignalId);
    const etag    = `"d:${source}:${newData.length > 0 ? newData[0]?.signalId : lastSignalId}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=3, must-revalidate');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json({ full: false, data: newData });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/latest', requireValidUser, async (req, res) => {
  try {
    const source   = req.query.source;
    const rawLimit = parseInt(req.query.limit, 10);
    const limit    = (!isNaN(rawLimit) && rawLimit > 0 && rawLimit <= 500) ? rawLimit : 100;
    if (!source || !SOURCES.includes(source)) return res.status(400).json({ error: 'source inválido' });
    res.json(await getLatestSpins(source, limit));
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fetch/all', requireActiveSubscription, async (req, res) => {
  try { await fetchAllData(); res.json({ status: 'ok' }); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/fetch/:source', requireActiveSubscription, async (req, res) => {
  const url = API_URLS[req.params.source];
  if (!url) return res.status(400).json({ error: 'Fonte inválida' });
  try { await fetchAndSaveFromSource(url, req.params.source); res.json({ status: 'ok' }); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

// ── Admin endpoints ───────────────────────────────────────────

// Cerca de rede na frente do painel inteiro, login incluso: se ADMIN_ALLOWED_IPS
// ou ADMIN_REQUIRE_CF_ACCESS estiverem configurados, quem vem de fora nem chega
// a ver a tela de senha. Sem eles configurados, nao muda nada. Fica ANTES de
// qualquer rota /api/admin de proposito — inclusive das que ja existiam.
app.use('/api/admin', adminNetworkGate);

// ── Sessão do painel ────────────────────────────────────

app.post('/api/admin/auth/login', adminLoginLimiter, express.json({ limit: '1kb' }), async (req, res) => {
  const { email, password } = req.body || {};

  try {
    const result = await adminLogin(email, password);
    // Mensagem única para email inexistente e senha errada: distinguir os dois
    // entrega a lista de quem é admin.
    if (!result) return res.status(401).json({ error: 'Credenciais inválidas' });

    await logAdminAction({
      adminEmail: result.admin.email,
      action: 'login',
      ipHash: adminIpHash(req),
    });

    res.json({ token: result.token, admin: result.admin });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'admin-login' } });
    res.status(500).json({ error: 'Falha no login' });
  }
});

app.post('/api/admin/auth/logout', requireAdminSession, async (req, res) => {
  await adminLogout(extractBearer(req));
  res.json({ ok: true });
});

app.get('/api/admin/auth/me', requireAdminSession, (req, res) => {
  res.json({ admin: req.admin });
});

// ── Métricas ────────────────────────────────────────────

app.get('/api/admin/metrics/overview', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    res.json(await getOverview());
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/metrics/retention', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    res.json(await getRetention(Math.min(parseInt(req.query.weeks) || 8, 26)));
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/metrics/engagement', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    res.json(await getEngagement(Math.min(parseInt(req.query.days) || 14, 90)));
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/metrics/funnel', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    res.json(await getFunnel());
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Usuários ────────────────────────────────────────────

app.get('/api/admin/users', adminReadLimiter, requireAdminSession, auditarLeitura('lista_usuarios'), async (req, res) => {
  try {
    res.json(await listUsers({
      search:     req.query.search || '',
      limit:      Math.min(parseInt(req.query.limit) || 50, 200),
      offset:     parseInt(req.query.offset) || 0,
      // Filtros por coluna. Os valores sao validados dentro de listUsers:
      // status por whitelist, numericos por Number.isFinite, e a coluna de
      // ordenacao por um mapa fixo — nada do cliente entra na query como SQL.
      status:     req.query.status || '',
      banido:     req.query.banido || '',
      comBanca:   req.query.comBanca || '',
      sessoesMin: req.query.sessoesMin ?? null,
      saldoMin:   req.query.saldoMin ?? null,
      acesso:     req.query.acesso || '',
      ordenarPor: req.query.ordenarPor || 'ultimo_acesso',
      direcao:    req.query.direcao || 'desc',
    }));
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/users/:email', adminReadLimiter, requireAdminSession, auditarLeitura('ficha_usuario'), async (req, res) => {
  try {
    res.json(await getUserDetail(req.params.email));
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * CPF e telefone INTEIROS de uma pessoa.
 *
 * A lista e a ficha entregam esses campos mascarados quando ADMIN_MASK_PII esta
 * ligado (ver mascararLinha em platformProfileService.js). O número completo sai
 * só por aqui, e por aqui só passa admin NOMINAL — o x-admin-secret responde "é
 * um admin?", nunca "qual admin?", e revelar CPF alheio é exatamente o tipo de
 * ato que precisa de nome próprio na auditoria. Uma pessoa por requisição, com
 * limite de 40 a cada 15 minutos: raspar a base por aqui é lento e ruidoso.
 */
app.get('/api/admin/users/:email/pii', adminPiiLimiter, requireAdminSession, requireAdminIdentity, auditarLeitura('revelou_dado_pessoal'), async (req, res) => {
  try {
    const dados = await getPlatformPii(req.params.email);
    if (!dados) return res.status(404).json({ error: 'Sem espelho para este e-mail' });
    res.json(dados);
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * As respostas cruas da casa (/profile e /wallet) que o espelho guardou.
 *
 * Fica numa rota à parte porque são centenas de campos: carregá-los junto com a
 * ficha pesaria toda abertura para servir a minoria das consultas.
 *
 * Entra no MESMO regime da rota de PII (nominal, limite estreito, auditada):
 * o JSON cru traz CPF, telefone e endereço sem máscara nenhuma, então deixá-lo
 * mais barato de obter do que o campo mascarado ao lado anularia a máscara.
 */
app.get('/api/admin/users/:email/plataforma', adminPiiLimiter, requireAdminSession, requireAdminIdentity, auditarLeitura('campos_da_casa'), async (req, res) => {
  try {
    const dados = await getPlatformRaw(req.params.email);
    if (!dados) return res.status(404).json({ error: 'Sem espelho para este e-mail' });
    res.json(dados);
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Ajuste manual de assinatura. Reusa upsertSubscription/logSubscriptionAudit
 * para que a alteração feita à mão apareça no mesmo histórico das mudanças
 * vindas de webhook — senão o histórico do usuário mentiria.
 */
app.post('/api/admin/users/:email/subscription', adminLimiter, requireAdminSession, requireAdminIdentity, express.json({ limit: '2kb' }), async (req, res) => {
  const email = String(req.params.email).trim().toLowerCase();
  const { status, planName, days, mainAppEmail } = req.body || {};

  // Vale tambem para CRIAR: o upsert insere quem ainda nao existe, entao dar
  // acesso a alguem de fora e so cadastrar aqui. Sem isso, o painel so sabia
  // editar quem ja estava.
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalido' });
  if (mainAppEmail && !isValidEmail(String(mainAppEmail).trim().toLowerCase())) {
    return res.status(400).json({ error: 'Email de login invalido' });
  }

  const PERMITIDOS = ['active', 'trialing', 'paid', 'canceled'];
  if (!PERMITIDOS.includes(status)) {
    return res.status(400).json({ error: `status deve ser um de: ${PERMITIDOS.join(', ')}` });
  }

  try {
    const atual = await getSubscriptionByEmail(email);
    const expiresAt = days
      ? new Date(Date.now() + Number(days) * 86_400_000)
      : atual?.expires_at || null;

    await upsertSubscription({
      userId:         atual?.user_id || `admin-${email}`,
      email,
      status,
      planName:       planName || atual?.plan_name || 'Ajuste manual',
      expiresAt,
      subscriptionId: atual?.subscription_id || null,
      source:         'admin',
      mainAppEmail:   mainAppEmail ? String(mainAppEmail).trim().toLowerCase() : undefined,
    });

    await logSubscriptionAudit(atual?.user_id || null, email, atual?.status || null, status, `admin:${req.admin.email}`);
    await logAdminAction({
      adminEmail:  req.admin.email,
      action:      atual ? 'subscription_update' : 'user_create',
      targetEmail: email,
      payload:     { de: atual?.status || null, para: status, dias: days || null, novo: !atual },
      ipHash:      adminIpHash(req),
    });

    res.json({ ok: true, email, status, criado: !atual });
  } catch (e) {
    Sentry.captureException(e, { tags: { context: 'admin-subscription' } });
    res.status(500).json({ error: e.message });
  }
});

/**
 * Derruba as sessões do usuário: desconecta os sockets e limpa o cache de
 * validação de token, para que o próximo request tenha que revalidar no
 * emissor em vez de aproveitar os até 300s de TTL.
 */
app.post('/api/admin/users/:email/disconnect', adminLimiter, requireAdminSession, requireAdminIdentity, async (req, res) => {
  const email = String(req.params.email).trim().toLowerCase();

  try {
    let derrubados = 0;
    // fetchSockets() cobre o cluster inteiro via adapter do Redis — em PM2 os
    // sockets do usuário podem estar em outro worker que não este.
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.data?.userEmail === email || s.userEmail === email) {
        s.disconnect(true);
        derrubados++;
      }
    }

    await cacheDel(KEY.sub(email));

    await logAdminAction({
      adminEmail:  req.admin.email,
      action:      'force_disconnect',
      targetEmail: email,
      payload:     { sockets: derrubados },
      ipHash:      adminIpHash(req),
    });

    res.json({ ok: true, derrubados });
  } catch (e) {
    Sentry.captureException(e, { tags: { context: 'admin-disconnect' } });
    res.status(500).json({ error: e.message });
  }
});

// ── Auditoria do painel ─────────────────────────────────

app.get('/api/admin/audit-log', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    res.json(await listAdminAudit(Math.min(parseInt(req.query.limit) || 100, 500)));
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Rotas admin anteriores ao painel ────────────────────
// Continuam aceitando o x-admin-secret (scripts e curl existentes) atraves do
// requireAdminSession, que trata as duas formas de entrada.

app.get('/api/admin/subscriptions/stats',  adminReadLimiter, requireAdminSession, async (req, res) => {
  try { res.json(await getSubscriptionStats()); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/subscriptions/active', adminReadLimiter, requireAdminSession, async (req, res) => {
  try { res.json(await getActiveSubscriptions()); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/webhooks/logs', adminReadLimiter, requireAdminSession, async (req, res) => {
  try { res.json(await getWebhookLogs(parseInt(req.query.limit) || 100)); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

// Disparo manual do aviso de vencimento.
// Use `?dryRun=1` para listar quem seria avisado sem enviar nada.
app.post('/api/admin/expiration-reminders/run', adminLimiter, requireAdminSession, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const result = await sendExpirationReminders({ dryRun });
    res.json({ ok: true, dryRun, ...result });
  } catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

// ── Banimentos por abuso (admin) ──────────────────────────────

app.get('/api/admin/bans', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    res.json({ bans: await listBans(200), mode: BAN_MODE, banDays: BAN_DAYS });
  } catch (err) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

// Revoga o ban de um email — o caminho de saida para falso positivo.
app.post('/api/admin/bans/revoke', adminLimiter, requireAdminSession, requireAdminIdentity, express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
    const revoked = await revokeBan(email, req.admin?.email || 'admin');
    console.log(`♻️ [abuse] ban revogado para ${email} (${revoked} registro(s))`);

    await logAdminAction({
      adminEmail:  req.admin.email,
      action:      'ban_revoke',
      targetEmail: email,
      payload:     { registros: revoked },
      ipHash:      adminIpHash(req),
    });

    res.json({ success: true, revoked });
  } catch (err) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/bans', adminLimiter, requireAdminSession, requireAdminIdentity, express.json({ limit: '4kb' }), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
    const reason = String(req.body?.reason || 'scraping').slice(0, 64);
    const ban = await banUser(email, reason, String(req.body?.evidence || 'ban manual via admin').slice(0, 2000));
    console.warn(`⛔ [abuse] ban manual ate ${ban.banned_until} — user="${email}"`);

    await logAdminAction({
      adminEmail:  req.admin.email,
      action:      'ban_manual',
      targetEmail: email,
      payload:     { motivo: reason, ate: ban.banned_until },
      ipHash:      adminIpHash(req),
    });

    res.status(201).json({ success: true, ban });
  } catch (err) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/audit', adminReadLimiter, requireAdminSession, async (req, res) => {
  try {
    const { email, limit } = req.query;
    const logs = email
      ? await getSubscriptionAuditLog(email.trim().toLowerCase(), parseInt(limit) || 50)
      : await getAllAuditLogs(parseInt(limit) || 100);
    res.json(logs);
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Motor Score (wins/losses persistence — PostgreSQL) ────────
// Lógica de check/signal movida para motorScoreEngine.js (processamento passivo)

const emptyScores = () => ({
  "0": { wins: 0, losses: 0 },
  "1": { wins: 0, losses: 0 },
  "2": { wins: 0, losses: 0 },
});

const getMotorScores = async (source) => {
  const { rows } = await query(
    'SELECT neighbor_mode, wins, losses FROM motor_scores WHERE source = $1',
    [source]
  );
  const scores = emptyScores();
  for (const r of rows) {
    scores[String(r.neighbor_mode)] = { wins: r.wins, losses: r.losses };
  }
  return scores;
};

// Retorna placar por modo de vizinho para uma roleta
app.get('/api/motor-score', requireValidUser, async (req, res) => {
  const source = req.query.source;
  if (!source) return res.status(400).json({ error: 'source required' });
  const limit = req.query.limit || 'all';
  try {
    const result = await computeFilteredMotorScore(source, limit);
    console.log(`[DEBUG /api/motor-score] source=${source} limit=${limit} signalHistory=${result.signalHistory?.length ?? 'MISSING'} scores=`, JSON.stringify({ '0': result['0'], '1': result['1'], '2': result['2'] }));
    res.json(result);
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /signal e /check removidos — backend processa passivamente via motorScoreEngine

// Reset do placar de uma roleta
app.post('/api/motor-score/reset', adminLimiter, requireAdminSession, express.json({ limit: '1kb' }), async (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: 'source required' });
  try {
    await query('DELETE FROM motor_scores WHERE source = $1', [source]);
    await query('DELETE FROM motor_pending_signals WHERE source = $1', [source]);
    res.json({ ok: true });
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Gatilhos: endpoints descontinuados ───────────────────────
//
// Os gatilhos saíram do ar em adequação à Portaria SPA/MF nº 1.964, de 3 de julho
// de 2026, e à Portaria Interministerial MF/SECOM/MJSP nº 73, de 10 de julho de
// 2026 (art. 4º, VII, "b", "c" e "d"). 410 e não 404: clientes com bundle antigo
// em cache recebem o motivo em vez de um erro genérico.
//
// O motor de gatilhos continua rodando internamente (triggerScoreEngine alimenta
// o placar) — o que foi cortado é a exposição ao usuário.
const GATILHOS_DESCONTINUADOS = Object.freeze({
  error: 'Recurso descontinuado',
  reason: 'Os gatilhos foram desativados em adequação à Portaria SPA/MF nº 1.964/2026 e à Portaria Interministerial MF/SECOM/MJSP nº 73/2026.',
  sources: [
    'https://www.in.gov.br/web/dou/-/portaria-spa/mf-n-1.964-de-3-de-julho-de-2026-718408857',
    'https://www.in.gov.br/en/web/dou/-/portaria-interministerial-mf/secom/mjsp-n-73-de-10-de-julho-de-2026-718408679',
  ],
});

const gatilhosGone = (_req, res) => res.status(410).json(GATILHOS_DESCONTINUADOS);

app.get('/api/trigger-score', gatilhosGone);
app.post('/api/trigger-score/reset', gatilhosGone);

app.post('/api/admin/backfill-motor', adminLimiter, requireAdminSession, express.json({ limit: '1kb' }), async (req, res) => {
  const { source } = req.body;
  try {
    if (source) {
      const result = await backfillMotorScores(source);
      return res.json({ ok: true, results: [result] });
    }
    // Todas as sources: responde imediato, roda em background
    res.json({ ok: true, message: 'Backfill iniciado para todas as sources' });
    const { rows } = await query('SELECT DISTINCT source FROM signals ORDER BY source');
    for (const r of rows) {
      try { await backfillMotorScores(r.source); }
      catch (err) { console.error(`[Backfill ${r.source}] Erro:`, err.message); }
    }
    console.log('[Backfill] Todas as sources concluídas');
  } catch (e) {
    Sentry.captureException(e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Analysis endpoints (carga inicial — Socket.IO cuida do real-time) ──

app.get('/api/motor-analysis', requireValidUser, async (req, res) => {
  const source = req.query.source;
  if (!source) return res.status(400).json({ error: 'source required' });
  const data = getLatestMotorAnalysis(source) || await computeMotorAnalysisOnDemand(source);
  res.json(data || { source, timestamp: 0, globalAssertiveness: 0, totalSignals: 0, strategyScores: [], entrySignal: null, motorScores: emptyScores() });
});

// Descontinuado — ver GATILHOS_DESCONTINUADOS acima.
app.get('/api/trigger-analysis', gatilhosGone);

// ── Health & debug ────────────────────────────────────────────

// ── Telemetria de uso ─────────────────────────────────
// Alimenta a área administrativa. Passa pelo mesmo requireValidUser das rotas
// de dados (e portanto pelo HMAC, token e política de abuso) — telemetria é
// escrita no banco vinda do cliente, seria a rota mais atraente para abuso se
// ficasse aberta.
app.post('/api/telemetry', telemetryLimiter, requireValidUser, express.json({ limit: '8kb' }), async (req, res) => {
  const email  = req.query.userEmail.trim().toLowerCase();
  const events = req.body?.events;

  if (!Array.isArray(events)) return res.status(400).json({ error: 'events[] obrigatório' });
  // Cap por lote: o cliente faz flush a cada 20. Um lote muito maior que isso
  // é cliente adulterado, não uso normal.
  if (events.length > 50) return res.status(400).json({ error: 'Lote grande demais' });

  try {
    const saved = await recordEvents(email, events);

    // 'alive' é o batimento de presença: só é emitido com a aba visível, e é o
    // que faz duration_seconds medir tempo de uso em vez de tempo de socket.
    if (req.body.sessionId && events.some(e => e?.event === 'alive')) {
      await touchSession(req.body.sessionId);
    }

    res.json({ saved });
  } catch (err) {
    // Nunca propaga erro de telemetria para o app do usuário.
    Sentry.captureException(err, { tags: { context: 'telemetry' } });
    res.json({ saved: 0 });
  }
});

// ── Health & debug ───────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    await testConnection();
    const redis = await redisHealthCheck();
    res.json({
      status: 'OK',
      uptime: Math.round(process.uptime()),
      worker: process.env.NODE_APP_INSTANCE || '0',
      database: '✅',
      redis: redis.status === 'ok' ? `✅ (${redis.latency})` : '⚠️ degraded',
      pool:  poolStats(),
      signing: { mode: API_SIGNING_SECRET ? API_SIGNING_MODE : 'off', windowSec: HMAC_WINDOW_SECONDS, ...signingStats },
      account: { mode: ACCOUNT_CHECK_MODE, ...accountStats },
      abuse: { mode: BAN_MODE, banDays: BAN_DAYS, ...abuseStats },
      token: { mode: TOKEN_AUTH_MODE, ...tokenStats },
      plataforma: platformSyncStats,
      hubla: HUBLA_WEBHOOK_TOKEN ? '✅' : '⚠️',
      pid: process.pid,
    });
  } catch {
    res.status(503).json({ status: 'ERROR', database: '❌' });
  }
});

if (!IS_PROD) {
  app.get('/api/test-sentry', (req, res) => {
    try { throw new Error('🧪 Teste Sentry'); }
    catch (e) { Sentry.captureException(e); res.json({ success: true }); }
  });
}

// SPA fallback
app.get(/.*/, (req, res) => {
  if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint não encontrado' });
  // '..' porque o dist e irmao de server/, nao filho — o express.static la
  // em cima ja aponta para o mesmo lugar. Sem isto, QUALQUER rota de SPA
  // servida pelo proprio Express (inclusive /admin) devolve erro de arquivo
  // ausente; em producao passava batido porque quem entrega o SPA e o nginx.
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

Sentry.setupExpressErrorHandler(app);

// ── Scraper ───────────────────────────────────────────────────

const normalizeData = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.games)         return data.games;
  if (data?.signalId)      return [data];
  return [];
};

async function fetchAndSaveFromSource(url, sourceName) {
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);
    const response   = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data       = await response.json();
    const normalized = normalizeData(data);
    if (normalized.length > 0) {
      // brasilPlay (Playtech) retorna recente→antigo. Inserir nessa ordem
      // faz o id PK do PG ficar inverso da cronologia, e o delta `ORDER BY
      // id DESC` entrega lotes de recovery invertidos pro frontend. Reverter
      // antes do INSERT garante id crescente == cronologia crescente.
      const toSave = sourceName === 'brasilPlay'
        ? normalized.slice().reverse()
        : normalized;
      await saveNewSignals(toSave, sourceName);
      await publishSignals(sourceName, normalized);
    }
    // Engines passivos: analisa e pontua automaticamente após cada fetch
    await processSource(sourceName);
    await processTriggerSource(sourceName);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(`❌ [FETCH ${sourceName}]:`, err.message);
      Sentry.captureException(err, { tags: { source: sourceName } });
    }
  }
}

async function fetchAllData() {
  await Promise.allSettled(
    Object.entries(API_URLS)
      .filter(([, url]) => url)
      .map(([name, url]) => fetchAndSaveFromSource(url, name)),
  );
}

// ── Socket.IO ─────────────────────────────────────────────────

io.use(async (socket, next) => {
  try {
    const rawEmail = socket.handshake.auth?.email || socket.handshake.query?.userEmail;
    if (!rawEmail) return next(new Error('auth:email_required'));

    const email = String(rawEmail).trim().toLowerCase();
    if (!isValidEmail(email)) return next(new Error('auth:email_invalid'));

    // Modo free unificado: free conecta normalmente, mas só premium entra
    // na sala que recebe os eventos de gatilho (trigger-analysis).
    const { canPlay } = await checkSubscriptionWithFallback(email);

    socket.userEmail = email;
    socket.isPremium = canPlay;
    if (canPlay) socket.join('premium');
    next();
  } catch (err) {
    console.warn('⚠️ [Socket.IO] Erro na autenticação — fail-open:', err.message);
    Sentry.captureException(err, { tags: { context: 'socket-auth' } });
    // Fail-open mantém acesso completo para não degradar premium em
    // instabilidade de DB/Redis.
    try { socket.join('premium'); } catch { /* ignore */ }
    next();
  }
});

io.on('connection', async (socket) => {
  if (!IS_PROD) console.log('🔌 Socket conectado:', socket.id, socket.userEmail || '(anon)');

  // Telemetria de sessão. A conexão do socket já é autenticada por email no
  // io.use acima, então medir a visita aqui não custa nenhuma chamada extra do
  // cliente. Socket sem email (fail-open do middleware) não vira sessão: sem
  // identidade a linha não serve para nada e ainda distorce o DAU.
  if (!socket.userEmail) return;

  const hs = socket.handshake;
  const ip = hs.headers['cf-connecting-ip'] || hs.headers['x-forwarded-for'] || hs.address;

  socket.sessionId = await startSession({
    email:     socket.userEmail,
    socketId:  socket.id,
    isPremium: socket.isPremium,
    userAgent: hs.headers['user-agent'],
    ip,
  });

  // O cliente devolve este id no /api/telemetry para marcar presença.
  if (socket.sessionId) socket.emit('session:started', { sessionId: socket.sessionId });

  socket.on('disconnect', () => {
    endSession(socket.sessionId);
  });
});

// ── Startup ───────────────────────────────────────────────────

const startServer = async () => {
  const PORT = process.env.PORT || 3001;
  try {
    await initRedis();

    // Socket.IO Redis adapter — necessário para cluster mode (PM2)
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { pubClient, subClient } = getPubSubClients();
      if (pubClient && subClient) {
        io.adapter(createAdapter(pubClient, subClient, { key: process.env.REDIS_PREFIX }));
        console.log('🔌 [Socket.IO] Redis adapter ativo — cluster mode OK');
      }
    } catch (err) {
      console.warn('⚠️ [Socket.IO] Redis adapter indisponível — single instance mode:', err.message);
    }

    await testConnection();
    await loadAllExistingSignalIds();

    // Inicializa engines com acesso ao Socket.IO
    await initMotorEngine(io);

    // Em cluster mode, só o worker 0 faz fetch para evitar duplicação
    const isMainWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

    server.listen(PORT, '0.0.0.0', () => {
      const workerId = process.env.NODE_APP_INSTANCE || '0';
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`🚀 Worker ${workerId} rodando na porta ${PORT}`);
      console.log(`📡 Crawler: POST /api/report-spin`);
      console.log(`📦 Delta:   GET /api/history-delta`);
      console.log(`🔒 Audit:   GET /api/admin/audit`);
      if (isMainWorker) console.log(`🔄 Fetch: worker principal — polling ativo`);
      console.log(`${'═'.repeat(50)}\n`);

      if (isMainWorker) {
        fetchAllData();
        setInterval(fetchAllData, FETCH_INTERVAL_MS);

        // Aviso de vencimento de assinatura (2 dias antes)
        // Roda 1x ao subir + a cada 6h. Idempotente por DB.
        const EXPIRATION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
        const runExpirationCheck = () => {
          sendExpirationReminders().catch(err =>
            console.error('❌ [REMINDER] Erro no job de vencimento:', err.message),
          );
        };
        // Espera 30s após o boot para não competir com o warmup
        setTimeout(runExpirationCheck, 30_000);
        setInterval(runExpirationCheck, EXPIRATION_CHECK_INTERVAL_MS);
        console.log(`📧 Aviso de vencimento: agendado a cada ${EXPIRATION_CHECK_INTERVAL_MS / 3600000}h`);

        // Manutencao da telemetria. De hora em hora porque o rollup do dia
        // corrente alimenta o painel "hoje"; o do dia anterior e reprocessado
        // junto (idempotente) para incorporar sessoes que fecharam depois da
        // virada.
        const TELEMETRY_JOB_INTERVAL_MS = 60 * 60 * 1000;
        const runTelemetryMaintenance = async () => {
          try {
            const orphans = await closeOrphanSessions();
            if (orphans) console.log(`🧹 [telemetry] ${orphans} sessão(ões) órfã(s) fechada(s)`);

            const ontem = await runDailyRollup();
            const { rows } = await query("SELECT CURRENT_DATE::text AS d");
            const hoje = await runDailyRollup(rows[0].d);
            console.log(`📊 [telemetry] rollup — ontem: ${ontem.dau} DAU / hoje: ${hoje.dau} DAU`);

            const purged = await purgeOldTelemetry();
            if (purged.events || purged.sessions) {
              console.log(`🗑️  [telemetry] purge — ${purged.events} eventos, ${purged.sessions} sessões`);
            }
          } catch (err) {
            console.error('❌ [telemetry] job falhou:', err.message);
            Sentry.captureException(err, { tags: { context: 'telemetry-job' } });
          }
        };
        setTimeout(runTelemetryMaintenance, 60_000);
        setInterval(runTelemetryMaintenance, TELEMETRY_JOB_INTERVAL_MS);
        console.log(`📊 Telemetria: rollup + purge a cada ${TELEMETRY_JOB_INTERVAL_MS / 3600000}h`);
      }
    });
  } catch (err) {
    console.error('❌ ERRO CRÍTICO:', err);
    await Sentry.captureException(err);
    await Sentry.close(2000);
    process.exit(1);
  }
};

startServer();

// ── Graceful shutdown ─────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n${signal} — encerrando...`);
  server.close();
  await closeRedis();
  await Sentry.close(2000);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => Sentry.captureException(reason));
process.on('uncaughtException',  (err)    => { Sentry.captureException(err); Sentry.close(2000).then(() => process.exit(1)); });
