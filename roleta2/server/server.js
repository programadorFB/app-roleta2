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
import { createProxyMiddleware } from 'http-proxy-middleware';

import { loadAllExistingSignalIds, saveNewSignals, getFullHistory, getLatestSpins, getNewSignalsSince } from './dbService.js';
import { SOURCES } from './constants.js';
import { testConnection, poolStats, query } from './db.js';
import { initRedis, redisHealthCheck, closeRedis, cacheSet, cacheDel, KEY, TTL, getPubSubClients, publishSignals } from './redisService.js';
import {
  hasActiveAccess, processHublaWebhook, verifyHublaWebhook,
  getSubscriptionStats, getActiveSubscriptions, getWebhookLogs,
  getSubscriptionByEmail, getSubscriptionAuditLog, getAllAuditLogs,
  sendExpirationReminders,
  ACTIVE_STATUSES,
} from './subscriptionService.js';
import { processSource, initMotorEngine, getLatestMotorAnalysis, computeMotorAnalysisOnDemand, computeFilteredMotorScore, backfillMotorScores } from './motorScoreEngine.js';
import { processTriggerSource, initTriggerEngine, getLatestTriggerAnalysis } from './triggerScoreEngine.js';

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
  viproulette:  process.env.API_URL_VIPROULETTE,
  relampago:    process.env.API_URL_RELAMPAGO,
  malta:        process.env.API_URL_MALTA,
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

const adminLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite admin excedido.' },
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
const HMAC_WINDOW_SECONDS = 60;

app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || '';

  // Bloquear bots/scrapers conhecidos nas rotas da API
  if (req.url.startsWith('/api/') && BLOCKED_UA.test(ua)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Bloquear requests sem User-Agent em endpoints protegidos
  if (req.url.startsWith('/api/') && !ua && !req.headers['x-crawler-secret']) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  next();
});

// ── HMAC Request Signing Verification ───────────────
// Verifica X-Sig e X-Ts em rotas /api/ (produção).
// Pula rotas que já possuem autenticação própria (crawler, webhooks).
app.use((req, res, next) => {
  if (!IS_PROD || !API_SIGNING_SECRET) return next();

  const isApiRoute = req.url.startsWith('/api/') || req.url.startsWith('/login') || req.url.startsWith('/start-game');
  if (!isApiRoute) return next();

  // Rotas com autenticação própria — não precisam de HMAC
  if (req.headers['x-crawler-secret'] || req.headers['x-hubla-token']) return next();
  // Health check
  if (req.url === '/api/health' || req.url === '/health') return next();

  const sig = req.headers['x-sig'];
  const ts = parseInt(req.headers['x-ts'], 10);

  if (!sig || !ts) return res.status(403).json({ error: 'Acesso negado' });

  // Timestamp dentro da janela permitida
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > HMAC_WINDOW_SECONDS) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Verifica HMAC — timing-safe
  const urlPath = req.path; // pathname sem query string
  const msg = `${ts}:${urlPath}`;
  const expected = crypto.createHmac('sha256', API_SIGNING_SECRET).update(msg).digest('hex');

  const sigBuf = Buffer.from(String(sig));
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  next();
});

// ── Origin Enforcement (além do CORS) ───────────────
// Rejeita requests com Origin/Referer de domínios não autorizados.
app.use((req, res, next) => {
  if (!IS_PROD) return next();

  const isApiRoute = req.url.startsWith('/api/') || req.url.startsWith('/login') || req.url.startsWith('/start-game');
  if (!isApiRoute) return next();
  if (req.headers['x-crawler-secret'] || req.headers['x-hubla-token']) return next();

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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hubla-token', 'x-crawler-secret', 'X-Sig', 'X-Ts'],
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

    const subscription = await getSubscriptionByEmail(cleanEmail);
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

const requireAdminAuth = (req, res, next) => {
  if (!ADMIN_SECRET) return res.status(500).json({ error: 'ADMIN_SECRET não configurado' });
  try {
    const a = Buffer.from(String(req.headers['x-admin-secret'] || ''));
    const b = Buffer.from(ADMIN_SECRET);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      Sentry.captureMessage(`Admin access denied — IP: ${req.ip}`, 'warning');
      return res.status(403).json({ error: 'Acesso negado' });
    }
  } catch {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
};

// ── Subscription fallback helper ──────────────────────────────

async function checkSubscriptionWithFallback(email) {
  const isActive = (sub) =>
    sub && ACTIVE_STATUSES.includes(sub.status) &&
    (!sub.expires_at || new Date(sub.expires_at) >= new Date());

  const cached = await getSubscriptionByEmail(email);
  if (isActive(cached)) return { canPlay: true, subscription: cached };

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
  timeout: 60000,
  followRedirects: true,
  pathRewrite: { '^/': '/login' },

  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    proxyReq.setHeader('Accept', 'application/json');
  },

  onProxyRes: (proxyRes, req, res) => {
    const chunks = [];
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', async () => {
      const body       = Buffer.concat(chunks).toString('utf8');
      const statusCode = proxyRes.statusCode;

      if (statusCode < 200 || statusCode >= 300) {
        Object.keys(proxyRes.headers).forEach(k => res.setHeader(k, proxyRes.headers[k]));
        return res.status(statusCode).send(body);
      }

      try {
        let email = null;
        if (req.headers.authorization?.startsWith('Basic ')) {
          const decoded = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8');
          email = decoded.split(':')[0];
        }
        if (!email) {
          try { email = JSON.parse(body).user?.email || JSON.parse(body).email; } catch { /* ignore */ }
        }
        if (!email) return res.status(500).json({ error: true, message: 'Email não identificado' });

        const cleanEmail = email.trim().toLowerCase();
        const { canPlay } = await checkSubscriptionWithFallback(cleanEmail);

        if (canPlay) {
          Object.keys(proxyRes.headers).forEach(k => res.setHeader(k, proxyRes.headers[k]));
          res.status(statusCode).send(body);
        } else {
          res.status(403).json({ error: true, message: 'Assinatura inválida. Renove para jogar.', code: 'FORBIDDEN_SUBSCRIPTION', checkoutUrl: HUBLA_CHECKOUT_URL });
        }
      } catch (dbErr) {
        Sentry.captureException(dbErr);
        res.status(500).json({ error: true, message: 'Erro ao verificar assinatura' });
      }
    });
  },

  onError: (err, req, res) => {
    Sentry.captureException(err);
    if (!res.headersSent) res.status(500).json({ error: true, message: 'Erro no proxy de login' });
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
    const { canPlay } = await checkSubscriptionWithFallback(cleanEmail);
    if (!canPlay) {
      console.warn(`🚫 [start-game] Assinatura inválida: ${cleanEmail}`);
      return res.status(403).json({
        error: true, message: 'Assinatura inválida ou expirada.', code: 'FORBIDDEN_SUBSCRIPTION',
        requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL,
      });
    }
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

// ── Subscription status ───────────────────────────────────────

app.get('/api/subscription/status', subscriptionStatusLimiter, async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: 'userEmail obrigatório' });

    const cleanEmail = userEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Email inválido' });

    const subscription = await getSubscriptionByEmail(cleanEmail);
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

app.get('/api/full-history', requireActiveSubscription, async (req, res) => {
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

app.get('/api/history-delta', requireActiveSubscription, async (req, res) => {
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

app.get('/api/latest', requireActiveSubscription, async (req, res) => {
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

app.get('/api/admin/subscriptions/stats',  adminLimiter, requireAdminAuth, async (req, res) => {
  try { res.json(await getSubscriptionStats()); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/subscriptions/active', adminLimiter, requireAdminAuth, async (req, res) => {
  try { res.json(await getActiveSubscriptions()); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/webhooks/logs', adminLimiter, requireAdminAuth, async (req, res) => {
  try { res.json(await getWebhookLogs(parseInt(req.query.limit) || 100)); }
  catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

// Disparo manual do aviso de vencimento.
// Use `?dryRun=1` para listar quem seria avisado sem enviar nada.
app.post('/api/admin/expiration-reminders/run', adminLimiter, requireAdminAuth, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const result = await sendExpirationReminders({ dryRun });
    res.json({ ok: true, dryRun, ...result });
  } catch (e) { Sentry.captureException(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/audit', adminLimiter, requireAdminAuth, async (req, res) => {
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
app.get('/api/motor-score', requireActiveSubscription, async (req, res) => {
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
app.post('/api/motor-score/reset', adminLimiter, requireAdminAuth, express.json({ limit: '1kb' }), async (req, res) => {
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

// ── Trigger Score (wins/losses persistence — PostgreSQL) ─────

app.get('/api/trigger-score', requireActiveSubscription, async (req, res) => {
  const source = req.query.source;
  if (!source) return res.status(400).json({ error: 'source required' });
  const limit = req.query.limit;
  try {
    // Quando limit é um número, filtra sinais resolvidos dentro das últimas N rodadas
    if (limit && limit !== 'all' && Number.isFinite(Number(limit)) && Number(limit) > 0) {
      const offset = Math.max(0, Number(limit) - 1);
      const { rows } = await query(
        `WITH cutoff AS (
           SELECT "timestamp" FROM signals
           WHERE source = $1
           ORDER BY "timestamp" DESC
           OFFSET $2 LIMIT 1
         )
         SELECT
           COUNT(*) FILTER (WHERE result = 'win') AS wins,
           COUNT(*) FILTER (WHERE result = 'loss') AS losses
         FROM trigger_pending_signals
         WHERE source = $1
           AND resolved = TRUE
           AND created_at >= COALESCE((SELECT "timestamp" FROM cutoff), '1970-01-01')`,
        [source, offset]
      );
      const r = rows[0] || { wins: 0, losses: 0 };
      return res.json({ wins: parseInt(r.wins, 10), losses: parseInt(r.losses, 10) });
    }

    // Sem limit ou 'all': retorna total acumulado
    const { rows } = await query(
      'SELECT wins, losses FROM trigger_scores WHERE source = $1',
      [source]
    );
    const score = rows[0] || { wins: 0, losses: 0 };
    res.json({ wins: score.wins, losses: score.losses });
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trigger-score/reset', adminLimiter, requireAdminAuth, express.json({ limit: '1kb' }), async (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: 'source required' });
  try {
    await query('DELETE FROM trigger_scores WHERE source = $1', [source]);
    await query('DELETE FROM trigger_pending_signals WHERE source = $1', [source]);
    res.json({ ok: true });
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/backfill-motor', adminLimiter, requireAdminAuth, express.json({ limit: '1kb' }), async (req, res) => {
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

app.get('/api/motor-analysis', requireActiveSubscription, async (req, res) => {
  const source = req.query.source;
  if (!source) return res.status(400).json({ error: 'source required' });
  const data = getLatestMotorAnalysis(source) || await computeMotorAnalysisOnDemand(source);
  res.json(data || { source, timestamp: 0, globalAssertiveness: 0, totalSignals: 0, strategyScores: [], entrySignal: null, motorScores: emptyScores() });
});

app.get('/api/trigger-analysis', requireActiveSubscription, async (req, res) => {
  const source = req.query.source;
  if (!source) return res.status(400).json({ error: 'source required' });
  const data = getLatestTriggerAnalysis(source);
  res.json(data || { source, timestamp: 0, activeSignals: [], topTriggers: [], activeTrigger: null, scoreboard: { wins: 0, losses: 0 }, assertivity: { types: [], totals: { g1: 0, g2: 0, g3: 0, red: 0, total: 0, pct: 0 }, perTrigger: {} }, allTriggersCount: 0 });
});

// ── Health & debug ────────────────────────────────────────────

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
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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

    const { canPlay } = await checkSubscriptionWithFallback(email);
    if (!canPlay) return next(new Error('auth:subscription_inactive'));

    socket.userEmail = email;
    next();
  } catch (err) {
    console.warn('⚠️ [Socket.IO] Erro na autenticação — fail-open:', err.message);
    Sentry.captureException(err, { tags: { context: 'socket-auth' } });
    next();
  }
});

io.on('connection', (socket) => {
  if (!IS_PROD) console.log('🔌 Socket conectado:', socket.id, socket.userEmail || '(anon)');
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
    initTriggerEngine(io);

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
