
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
import { createProxyMiddleware } from 'http-proxy-middleware';

import { loadAllExistingSignalIds, saveNewSignals, getFullHistory, getLatestSpins, getNewSignalsSince } from './src/utils/dbService.js';
import { SOURCES } from './src/utils/constants.js';
import { testConnection, poolStats, query } from './db.js';
import { initRedis, redisHealthCheck, closeRedis, cacheSet, cacheDel, KEY, TTL } from './redisService.js';
import {
  hasActiveAccess, processHublaWebhook, verifyHublaWebhook,
  getSubscriptionStats, getActiveSubscriptions, getWebhookLogs,
  getSubscriptionByEmail,
} from './subscriptionService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Express + Socket.IO setup ─────────────────────────────────
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'https://fuza.onrender.com',
  'https://roleta3-1.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://ferramenta.smartanalise.com.br',
  'https://testes123.smartanalise.com.br',
  'https://ferramenta1.smartanalise.com.br',
  'https://ferramenta2.smartanalise.com.br',
  'https://free.smartanalise.com.br',
  'https://sortenabet.smartanalise.com.br',
  'http://76.13.174.229',
  'https://76.13.174.229',
];

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000,
});

// ── Sentry ────────────────────────────────────────────────────
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [httpIntegration(), expressIntegration({ app })],
  tracesSampleRate: IS_PROD ? 0.2 : 1.0,
});

// ── Constantes ────────────────────────────────────────────────
const CRAWLER_SECRET = process.env.CRAWLER_SECRET || 'minha_senha_secreta_python';
const FRONTEND_URL = process.env.FRONTEND_URL;
const HUBLA_WEBHOOK_TOKEN = process.env.HUBLA_WEBHOOK_TOKEN;
const HUBLA_CHECKOUT_URL = process.env.HUBLA_CHECKOUT_URL;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';
const FETCH_INTERVAL_MS = 1000;

const API_URLS = {
  immersivevip:'https://apptemporario-production.up.railway.app/api/bd9c8298-1453-4694-8d9c-b32be9f972e7',
  immersive:   'https://apptemporario-production.up.railway.app/api/0194b479-654d-70bd-ac50-9c5a9b4d14c5',
  brasileira:  'https://apptemporario-production.up.railway.app/api/0194b473-2ab3-778f-89ee-236e803f3c8e',
  speed:       'https://apptemporario-production.up.railway.app/api/0194b473-c347-752f-9eaf-783721339479',
  xxxtreme:    'https://apptemporario-production.up.railway.app/api/0194b478-5ba0-7110-8179-d287b2301e2e',
  vipauto:     'https://apptemporario-production.up.railway.app/api/0194b473-9044-772b-a6fc-38236eb08b42',
  auto:        'https://apptemporario-production.up.railway.app/api/0194b471-1645-749e-9214-be0342035f6f',
  vip:         'https://apptemporario-production.up.railway.app/api/0194b472-6b93-74be-9260-7e407f5f1103',
  lightning:   'https://apptemporario-production.up.railway.app/api/0194b472-7d68-75ea-b249-1422258f4d4c',
  aovivo:      'https://apptemporario-production.up.railway.app/api/0194b473-1738-70dd-84a9-f1ddd4f00678',
  speedauto:   'https://apptemporario-production.up.railway.app/api/0194b473-3139-770c-841f-d026ce7ed01f',
  viproulette: 'https://apptemporario-production.up.railway.app/api/0194b474-bb9a-7451-b430-c451b14de1de',
  relampago:   'https://apptemporario-production.up.railway.app/api/0194b474-d82f-76e0-9242-70f601984069',
  malta:       'https://apptemporario-production.up.railway.app/api/0194b476-6091-730c-b971-7e66d9d8c44a',
};

// ══════════════════════════════════════════════════════════════
// HELPER: ETag generator
// ══════════════════════════════════════════════════════════════

function generateETag(data) {
  const hash = crypto.createHash('md5');
  if (Array.isArray(data) && data.length > 0) {
    hash.update(`${data[0]?.signalId || data[0]?.signalid || ''}:${data.length}`);
  } else {
    hash.update('empty');
  }
  return `"${hash.digest('hex').substring(0, 16)}"`;
}

// ══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════

// 1. Request logging (LEAN — sem headers/body dump)
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

// 2. CORS
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (FRONTEND_URL && origin.startsWith(FRONTEND_URL)) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hubla-token', 'x-crawler-secret'],
}));

// 3. ✅ NOVO: Compression (gzip/brotli) — reduz payloads JSON em ~70-80%
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// ══════════════════════════════════════════════════════════════
// MIDDLEWARE: Autenticação de subscription
// ══════════════════════════════════════════════════════════════

const requireActiveSubscription = async (req, res, next) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) {
      return res.status(401).json({ error: 'userEmail obrigatório', requiresSubscription: true });
    }

    const cleanEmail = userEmail.trim().toLowerCase();
    const subscription = await getSubscriptionByEmail(cleanEmail);

    if (!subscription) {
      return res.status(403).json({
        error: 'Assinatura não encontrada',
        requiresSubscription: true,
        checkoutUrl: HUBLA_CHECKOUT_URL
      });
    }

    const activeStatuses = ['active', 'trialing', 'paid'];
    if (!activeStatuses.includes(subscription.status)) {
      return res.status(403).json({
        error: `Assinatura inativa (${subscription.status})`,
        requiresSubscription: true,
        checkoutUrl: HUBLA_CHECKOUT_URL
      });
    }

    if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
      return res.status(403).json({
        error: 'Assinatura expirada',
        requiresSubscription: true,
        checkoutUrl: HUBLA_CHECKOUT_URL
      });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: 'Erro ao verificar assinatura' });
  }
};

// Admin auth
const requireAdminAuth = (req, res, next) => {
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'ADMIN_SECRET não configurado' });
  }
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    Sentry.captureMessage(`Admin access denied — IP: ${req.ip}`, 'warning');
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
};

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: Helper — verifica assinatura com fresh DB fallback
// Evita que cache stale bloqueie usuário que acabou de pagar
// ══════════════════════════════════════════════════════════════

async function checkSubscriptionWithFallback(email) {
  const activeStatuses = ['active', 'trialing', 'paid'];

  const isActive = (sub) => {
    if (!sub) return false;
    return activeStatuses.includes(sub.status) &&
      (!sub.expires_at || new Date(sub.expires_at) >= new Date());
  };

  // 1) Primeiro check: via cache (rápido)
  const cached = await getSubscriptionByEmail(email);
  if (isActive(cached)) {
    return { canPlay: true, subscription: cached };
  }

  // 2) Cache disse NÃO → faz fresh query direto no DB (bypass de cache stale)
  try {
    const { rows } = await query('SELECT * FROM subscriptions WHERE email = $1', [email]);
    const fresh = rows[0] || null;

    if (isActive(fresh)) {
      // 🔧 FIX: Cache estava stale! Atualiza o cache com dado fresco
      console.log(`🔄 [checkSub] Cache stale para ${email} — DB diz ativo. Atualizando cache.`);
      await cacheSet(KEY.sub(email), fresh, TTL.SUBSCRIPTION);
      return { canPlay: true, subscription: fresh };
    }

    return { canPlay: false, subscription: fresh };
  } catch (dbError) {
    // 🔧 FIX: Se DB falha, permite o acesso (melhor UX que bloquear)
    console.error('⚠️ [checkSub] Erro no fresh DB check — permitindo acesso:', dbError.message);
    Sentry.captureException(dbError, {
      tags: { context: 'subscription-fresh-check' },
      extra: { email },
    });
    return { canPlay: true, subscription: null }; // Fail-open
  }
}

// ══════════════════════════════════════════════════════════════
// PROXY ROUTES (login + start-game)
// ══════════════════════════════════════════════════════════════

// ── Proxy /login ──────────────────────────────────────────────
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
      const body = Buffer.concat(chunks).toString('utf8');
      const statusCode = proxyRes.statusCode;

      // Se o backend retornou erro, repassa direto
      if (statusCode < 200 || statusCode >= 300) {
        Object.keys(proxyRes.headers).forEach(k => res.setHeader(k, proxyRes.headers[k]));
        return res.status(statusCode).send(body);
      }

      try {
        // Extrai email do request
        let email = null;
        if (req.headers.authorization?.startsWith('Basic ')) {
          const decoded = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8');
          email = decoded.split(':')[0];
        }
        if (!email) {
          try {
            email = JSON.parse(body).user?.email || JSON.parse(body).email;
          } catch { /* ignore */ }
        }
        if (!email) {
          return res.status(500).json({ error: true, message: 'Email não identificado' });
        }

        const cleanEmail = email.trim().toLowerCase();

        // 🔧 FIX: Usa helper com fresh DB fallback
        const { canPlay } = await checkSubscriptionWithFallback(cleanEmail);

        if (canPlay) {
          Object.keys(proxyRes.headers).forEach(k => res.setHeader(k, proxyRes.headers[k]));
          res.status(statusCode).send(body);
        } else {
          res.status(403).json({
            error: true,
            message: 'Assinatura inválida. Renove para jogar.',
            code: 'FORBIDDEN_SUBSCRIPTION',
            checkoutUrl: HUBLA_CHECKOUT_URL
          });
        }
      } catch (dbError) {
        Sentry.captureException(dbError);
        res.status(500).json({ error: true, message: 'Erro ao verificar assinatura' });
      }
    });
  },

  onError: (err, req, res) => {
    Sentry.captureException(err);
    if (!res.headersSent) {
      res.status(500).json({ error: true, message: 'Erro no proxy de login' });
    }
  },
}));

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: PROXY /start-game — COM VERIFICAÇÃO + FRESH DB FALLBACK
// ══════════════════════════════════════════════════════════════

app.use('/start-game', async (req, res, next) => {
  // ─── PASSO 1: Extrair email ────────────────────────────────
  let email = req.query.userEmail || null;

  if (!email && req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace('Bearer ', '');
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf-8')
      );
      email = payload.email || payload.sub || null;
    } catch {
      // JWT inválido — continua sem email
    }
  }

  // ─── PASSO 2: Verificar assinatura (cache + fresh DB) ─────
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const { canPlay } = await checkSubscriptionWithFallback(cleanEmail);

    if (!canPlay) {
      console.warn(`🚫 [start-game] Assinatura inválida para ${cleanEmail} (cache + DB confirmam)`);
      return res.status(403).json({
        error: true,
        message: 'Assinatura inválida ou expirada. Renove para jogar.',
        code: 'FORBIDDEN_SUBSCRIPTION',
        requiresSubscription: true,
        checkoutUrl: HUBLA_CHECKOUT_URL,
      });
    }

    console.log(`✅ [start-game] Assinatura válida para ${cleanEmail}`);
  } else {
    console.warn('⚠️ [start-game] Email não encontrado — pulando verificação');
  }

  // ─── PASSO 3: Proxiar para API de jogos ───────────────────
  next();

}, createProxyMiddleware({
  target: AUTH_PROXY_TARGET,
  changeOrigin: true,
  timeout: 60000,

  pathRewrite: (p) => `/start-game${p}`,

  onProxyReq: (proxyReq, req) => {
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
    proxyReq.setHeader(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    proxyReq.setHeader('Accept', 'application/json');
  },

  onProxyRes: (proxyRes, req, res) => {
    const timestamp = new Date().toISOString();
    const chunks = [];

    proxyRes.on('data', (c) => chunks.push(c));

    proxyRes.on('end', () => {
      const responseBody = Buffer.concat(chunks).toString('utf8');

      if (proxyRes.statusCode >= 400) {
        console.error(`[${timestamp}] ❌ Game Proxy Error: ${proxyRes.statusCode}`);
        console.error(`[${timestamp}] Body:`, responseBody.substring(0, 500));
      } else {
        console.log(`[${timestamp}] ✅ Game Proxy Success: ${proxyRes.statusCode}`);
      }

      // Copia headers e envia resposta
      Object.keys(proxyRes.headers).forEach((key) => {
        try {
          res.setHeader(key, proxyRes.headers[key]);
        } catch (e) {
          console.warn(`Não foi possível setar header ${key}:`, e.message);
        }
      });

      res.status(proxyRes.statusCode).end(responseBody);
    });
  },

  onError: (err, req, res) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Game Proxy Error:`, err.message, `(${err.code})`);
    Sentry.captureException(err, { tags: { context: 'start-game-proxy' } });

    const errorMap = {
      'ECONNREFUSED':    { status: 503, message: 'Servidor de jogos indisponível. Tente novamente em instantes.' },
      'ETIMEDOUT':       { status: 504, message: 'Timeout ao conectar com o servidor de jogos.' },
      'ESOCKETTIMEDOUT': { status: 504, message: 'Timeout de socket ao conectar com o servidor de jogos.' },
      'ECONNRESET':      { status: 502, message: 'Conexão com o servidor de jogos foi interrompida.' },
      'ENOTFOUND':       { status: 502, message: 'Servidor de jogos não encontrado.' },
      'EHOSTUNREACH':    { status: 503, message: 'Host do servidor de jogos inacessível.' },
      'ENETUNREACH':     { status: 503, message: 'Rede do servidor de jogos inacessível.' },
    };

    const errorInfo = errorMap[err.code] || {
      status: 500,
      message: 'Erro interno ao iniciar jogo.',
    };

    if (!res.headersSent) {
      res.status(errorInfo.status).json({
        error: true,
        message: errorInfo.message,
        code: err.code,
        details: err.message,
        timestamp,
      });
    }
  },

  logLevel: 'warn',
}));

// 3. Arquivos estáticos
app.use(express.static(path.join(__dirname, 'dist')));

// ══════════════════════════════════════════════════════════════
// ROTAS — Python crawler (report-spin / update-croupier)
// ══════════════════════════════════════════════════════════════

app.post('/api/report-spin', express.json(), async (req, res) => {
  try {
    if (req.headers['x-crawler-secret'] !== CRAWLER_SECRET) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { signal, source, croupier } = req.body;
    if (!signal || !source) {
      return res.status(400).json({ error: 'Payload inválido' });
    }

    await saveNewSignals([req.body], source);
    io.emit('novo-giro', { source, data: req.body });

    res.json({ success: true, saved: signal });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update-croupier', express.json(), (req, res) => {
  if (req.headers['x-crawler-secret'] !== CRAWLER_SECRET) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const { croupier, source } = req.body;
  if (croupier) {
    io.emit('troca-croupier', { source: source || 'brasileira', croupier });
  }
  res.json({ status: 'ok' });
});

// ══════════════════════════════════════════════════════════════
// ROTAS — Webhook Hubla
// ══════════════════════════════════════════════════════════════

app.post('/api/webhooks/hubla', express.json(), async (req, res) => {
  try {
    if (!verifyHublaWebhook(req.headers['x-hubla-token'], HUBLA_WEBHOOK_TOKEN)) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const result = await processHublaWebhook(req.body.type, req.body);
    res.json({ success: true, result });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ROTAS — API dados (com cache via dbService)
// ══════════════════════════════════════════════════════════════

app.get('/api/subscription/status', async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) {
      return res.status(400).json({ error: 'userEmail obrigatório' });
    }

    const cleanEmail = userEmail.trim().toLowerCase();
    const subscription = await getSubscriptionByEmail(cleanEmail);

    if (!subscription) {
      return res.json({ hasAccess: false, subscription: null, checkoutUrl: HUBLA_CHECKOUT_URL });
    }

    const active = ['active', 'trialing', 'paid'];
    const hasAccess = active.includes(subscription.status) &&
      (!subscription.expires_at || new Date(subscription.expires_at) >= new Date());

    res.json({ hasAccess, subscription, checkoutUrl: HUBLA_CHECKOUT_URL });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

// ✅ ATUALIZADO: /api/full-history com ETag + 304 Not Modified
app.get('/api/full-history', requireActiveSubscription, async (req, res) => {
  try {
    const source = req.query.source;
    if (!source || !SOURCES.includes(source)) {
      return res.status(400).json({ error: 'source inválido' });
    }

    const history = await getFullHistory(source);
    const result = history || [];

    // ✅ NOVO: ETag — evita re-transferência quando dados não mudaram
    const etag = generateETag(result);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=3, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(result);
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NOVO: /api/history-delta — apenas sinais novos desde o último signalId
app.get('/api/history-delta', requireActiveSubscription, async (req, res) => {
  try {
    const source = req.query.source;
    if (!source || !SOURCES.includes(source)) {
      return res.status(400).json({ error: 'source inválido' });
    }

    const lastSignalId = req.query.since;

    // Sem cursor → retorna tudo (primeira carga)
    if (!lastSignalId) {
      const data = await getFullHistory(source);
      return res.json({ full: true, data: data || [] });
    }

    // Delta: apenas registros novos
    const newData = await getNewSignalsSince(source, lastSignalId);

    // ETag no delta
    const etag = `"d:${source}:${newData.length > 0 ? newData[0]?.signalId : lastSignalId}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=3, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json({ full: false, data: newData });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/latest', requireActiveSubscription, async (req, res) => {
  try {
    const source = req.query.source;
    const limit = parseInt(req.query.limit) || 100;
    if (!source || !SOURCES.includes(source)) {
      return res.status(400).json({ error: 'source inválido' });
    }
    const data = await getLatestSpins(source, limit);
    res.json(data);
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fetch/all', requireActiveSubscription, async (req, res) => {
  try {
    await fetchAllData();
    res.json({ status: 'ok' });
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/fetch/:source', requireActiveSubscription, async (req, res) => {
  const url = API_URLS[req.params.source];
  if (!url) {
    return res.status(400).json({ error: 'Fonte inválida' });
  }
  try {
    await fetchAndSaveFromSource(url, req.params.source);
    res.json({ status: 'ok' });
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ROTAS — Admin (protegidas)
// ══════════════════════════════════════════════════════════════

app.get('/api/admin/subscriptions/stats', requireAdminAuth, async (req, res) => {
  try {
    res.json(await getSubscriptionStats());
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/subscriptions/active', requireAdminAuth, async (req, res) => {
  try {
    res.json(await getActiveSubscriptions());
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/webhooks/logs', requireAdminAuth, async (req, res) => {
  try {
    res.json(await getWebhookLogs(parseInt(req.query.limit) || 100));
  } catch (e) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ROTAS — Health & Debug
// ══════════════════════════════════════════════════════════════

app.get('/health', async (req, res) => {
  try {
    await testConnection();
    const redis = await redisHealthCheck();
    const pool = poolStats();

    res.json({
      status: 'OK',
      uptime: Math.round(process.uptime()),
      database: '✅',
      redis: redis.status === 'ok' ? `✅ (${redis.latency})` : '⚠️ degraded',
      pool,
      hubla: HUBLA_WEBHOOK_TOKEN ? '✅' : '⚠️',
    });
  } catch (err) {
    res.status(503).json({ status: 'ERROR', database: '❌' });
  }
});

app.get('/api/test-sentry', (req, res) => {
  try {
    throw new Error('🧪 Teste Sentry');
  } catch (e) {
    Sentry.captureException(e);
    res.json({ success: true });
  }
});

// SPA fallback
app.get(/.*/, (req, res) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint não encontrado' });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Sentry error handler
Sentry.setupExpressErrorHandler(app);

// ══════════════════════════════════════════════════════════════
// SCRAPER (fetch externo + save)
// ══════════════════════════════════════════════════════════════

const normalizeData = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.games) return data.games;
  if (data?.signalId) return [data];
  return [];
};

async function fetchAndSaveFromSource(url, sourceName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const normalized = normalizeData(data);
    if (normalized.length > 0) await saveNewSignals(normalized, sourceName);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(`❌ [FETCH ${sourceName}]:`, err.message);
      Sentry.captureException(err, { tags: { source: sourceName } });
    }
  }
}

async function fetchAllData() {
  const promises = Object.entries(API_URLS)
    .filter(([, url]) => url)
    .map(([name, url]) => fetchAndSaveFromSource(url, name));

  await Promise.allSettled(promises);
}

// ══════════════════════════════════════════════════════════════
// SOCKET.IO
// ══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  if (!IS_PROD) console.log('🔌 Socket conectado:', socket.id);
});

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

const startServer = async () => {
  const PORT = process.env.PORT || 3000;
  try {
    // Inicializa Redis (não-blocking — app funciona sem)
    await initRedis();

    // Testa PostgreSQL
    await testConnection();
    await loadAllExistingSignalIds();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🚀 SERVER + SOCKET: porta ${PORT}`);
      console.log(`📡 Python endpoint: POST /api/report-spin`);
      console.log(`🔴 Redis: ${process.env.REDIS_URL || 'localhost:6379'}`);
      console.log(`🗜️  Compression: gzip ativo (level 6)`);
      console.log(`📦 Delta endpoint: GET /api/history-delta`);
      console.log(`${'═'.repeat(60)}\n`);

      fetchAllData();
      setInterval(fetchAllData, FETCH_INTERVAL_MS);
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
  console.log(`\n${signal} recebido — encerrando...`);
  server.close();
  await closeRedis();
  await Sentry.close(2000);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => Sentry.captureException(reason));
process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
  Sentry.close(2000).then(() => process.exit(1));
});