// [MONITORAMENTO - SENTRY] 1. NO TOPO DE TUDO
import * as Sentry from "@sentry/node"; 
import { 
  httpIntegration, 
  expressIntegration, 
} from "@sentry/node";

// server.js - 🚀 COM SOCKET.IO + INTEGRAÇÃO PYTHON + ⚡ FETCH INCREMENTAL + 🔴 REDIS CACHE 🚀
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { loadAllExistingSignalIds, saveNewSignals, getFullHistory, getHistorySince } from './src/utils/dbService.js';
import { SOURCES } from './src/utils/constants.js'; 

import { testConnection, pool } from './db.js';
import {
    hasActiveAccess,
    processHublaWebhook,
    verifyHublaWebhook,
    getSubscriptionStats,
    getActiveSubscriptions,
    getWebhookLogs,
    getSubscriptionByEmail
} from './subscriptionService.js';

// ⚡ REDIS: Imports do cache
import { testRedisConnection, isRedisReady } from './redisClient.js';
import {
    getCachedSubscription,
    setCachedSubscription,
    invalidateSubscriptionCache,
    getCachedLatest,
    setCachedLatest,
    getCacheStats,
    setCachedSourceHealth,
} from './redisCache.js';

dotenv.config();

console.log(`\n\n--- SERVIDOR INICIADO --- ${new Date().toLocaleTimeString()}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// [MONITORAMENTO - SENTRY] 2. INICIALIZAÇÃO
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
            httpIntegration(),
            expressIntegration({ app }),
        ],
    tracesSampleRate: 1.0,
});

// --- CONSTANTES ---
const CRAWLER_SECRET = process.env.CRAWLER_SECRET || "minha_senha_secreta_python"; 

const API_URLS = {
    immersive: 'https://apptemporario-production.up.railway.app/api/0194b479-654d-70bd-ac50-9c5a9b4d14c5',
    brasileira: 'https://apptemporario-production.up.railway.app/api/0194b473-2ab3-778f-89ee-236e803f3c8e',
    speed: 'https://apptemporario-production.up.railway.app/api/0194b473-c347-752f-9eaf-783721339479',
    xxxtreme: 'https://apptemporario-production.up.railway.app/api/0194b478-5ba0-7110-8179-d287b2301e2e',
    vipauto: 'https://apptemporario-production.up.railway.app/api/0194b473-9044-772b-a6fc-38236eb08b42',
    auto: 'https://apptemporario-production.up.railway.app/api/0194b471-1645-749e-9214-be0342035f6f',
    vip: 'https://apptemporario-production.up.railway.app/api/0194b472-6b93-74be-9260-7e407f5f1103',
    lightning: 'https://apptemporario-production.up.railway.app/api/0194b472-7d68-75ea-b249-1422258f4d4c',
    aovivo: 'https://apptemporario-production.up.railway.app/api/0194b473-1738-70dd-84a9-f1ddd4f00678',
    speedauto: 'https://apptemporario-production.up.railway.app/api/0194b473-3139-770c-841f-d026ce7ed01f',
    viproulette: 'https://apptemporario-production.up.railway.app/api/0194b474-bb9a-7451-b430-c451b14de1de',
    relampago: 'https://apptemporario-production.up.railway.app/api/0194b474-d82f-76e0-9242-70f601984069',
    malta: 'https://apptemporario-production.up.railway.app/api/0194b476-6091-730c-b971-7e66d9d8c44a',
    brasilPlay: 'https://pbrapi.sortehub.online/sinais/historico' 
};
const FETCH_INTERVAL_MS = 1000;
const DEFAULT_AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';
const HUBLA_WEBHOOK_TOKEN = process.env.HUBLA_WEBHOOK_TOKEN || 'x11H8dJDrNRQBZTxicwFObMkk3LG6gSMBwAi5CxGYlRp1JuwRZZsxWm81NSZEgEJ';
const HUBLA_CHECKOUT_URL = process.env.HUBLA_CHECKOUT_URL || 'https://pay.hub.la/N7JdmojxORlRpaafFEyl';
const FRONT_END_URL = process.env.FRONT_END_URL;;

// --- MIDDLEWARE ---
// 1. Log geral (otimizado: reduz log verboso em produção)
app.use((req, res, next) => {
    req._startTime = Date.now();
    const isPolling = req.url.startsWith('/api/history-since') || req.url.startsWith('/api/full-history');
    if (!isPolling) {
        console.log(`[${new Date().toISOString()}] 📥 ${req.method} ${req.url}`);
    }
    res.on('finish', () => {
        const duration = Date.now() - req._startTime;
        if (duration > 500 || res.statusCode >= 400) {
            const emoji = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '🐢';
            console.log(`${emoji} ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
});

// 2. CORS
const allowedOrigins = [
  'https://fuza.onrender.com',
  'https://roleta3-1.onrender.com',
  'https://ferramenta.smartanalise.com.br',
  'https://ferramenta1.smartanalise.com.br',
  'https://gratis.smartanalise.com.br',
  'https://tool.smartanalise.com.br',
  'http://76.13.174.229',
  'https://tool.smartanalise.com.br/',
  'https://roleta2_vps.sortehub.online'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith(FRONT_END_URL)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`🚫 CORS bloqueado para origem: ${origin}`);
    callback(null, false);
    },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hubla-token', 'x-crawler-secret']
}));

// 4. PROXY DE LOGIN (MANTIDO IGUAL)
app.use('/login', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    followRedirects: true,
    pathRewrite: { '^/': '/login' },
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        proxyReq.setHeader('Accept', 'application/json');
    },
    onProxyRes: (proxyRes, req, res) => {
        let body = [];
        proxyRes.on('data', chunk => body.push(chunk));
        proxyRes.on('end', async () => { 
            const responseBody = Buffer.concat(body).toString('utf8');
            const backendStatusCode = proxyRes.statusCode;
            
            if (backendStatusCode < 200 || backendStatusCode >= 300) {
                Object.keys(proxyRes.headers).forEach((key) => { res.setHeader(key, proxyRes.headers[key]); });
                res.status(backendStatusCode).send(responseBody);
                return;
            }

            try {
                let email = null;
                if (req.headers.authorization?.startsWith('Basic ')) {
                    const base64 = req.headers.authorization.split(' ')[1];
                    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
                    email = decoded.split(':')[0];
                }
                
                if (!email && req.headers['content-type']?.includes('application/json')) {
                    try {
                        const responseData = JSON.parse(responseBody);
                        email = responseData.user?.email || responseData.email;
                    } catch (e) { /* ignore */ }
                }

                if (!email) {
                    res.status(500).json({ error: true, message: "Erro interno: Email não identificado" });
                    return;
                }

                const cleanEmail = email.trim().toLowerCase();
                const subscription = await getSubscriptionByEmail(cleanEmail);
                let canLogin = false;

                if (subscription) {
                    const activeStatuses = ['active', 'trialing', 'paid'];
                    if (activeStatuses.includes(subscription.status) && (!subscription.expires_at || new Date(subscription.expires_at) >= new Date())) {
                        canLogin = true;
                    }
                }

                if (canLogin) {
                    // ⚡ Cache positivo no login (pré-aquece para requests subsequentes)
                    setCachedSubscription(cleanEmail, { hasAccess: true, subscription }).catch(() => {});
                    Object.keys(proxyRes.headers).forEach((key) => { res.setHeader(key, proxyRes.headers[key]); });
                    res.status(backendStatusCode).send(responseBody);
                } else {
                    res.status(403).json({
                        error: true,
                        message: 'Assinatura inválida.',
                        code: 'FORBIDDEN_SUBSCRIPTION',
                        checkoutUrl: HUBLA_CHECKOUT_URL
                    });
                }
            } catch (dbError) {
                Sentry.captureException(dbError);
                res.status(500).json({ error: true, message: "Erro ao verificar assinatura" });
            }
        });
    },
    onError: (err, req, res) => {
        Sentry.captureException(err);
        if (!res.headersSent) res.status(500).json({ error: true, message: 'Erro no proxy de login' });
    }
}));

// 5. PROXY DE START-GAME (MANTIDO IGUAL)
app.use('/start-game', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    pathRewrite: (path) => `/start-game${path}`,
    onProxyReq: (proxyReq, req) => {
        if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0');
    },
    onProxyRes: (proxyRes, req, res) => {
        let body = [];
        proxyRes.on('data', chunk => body.push(chunk));
        proxyRes.on('end', () => {
            const responseBody = Buffer.concat(body).toString('utf8');
            Object.keys(proxyRes.headers).forEach(key => res.setHeader(key, proxyRes.headers[key]));
            res.status(proxyRes.statusCode).end(responseBody);
        });
    },
    onError: (err, req, res) => {
        Sentry.captureException(err);
        if (!res.headersSent) res.status(500).json({ error: true, message: 'Erro no proxy de game' });
    }
}));

// 6. Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'dist')));

// ------------------------------------------------------------------------
// ⚡⚡⚡ NOVAS ROTAS PARA O ROBÔ PYTHON (COM SENHA) ⚡⚡⚡
// ------------------------------------------------------------------------

app.post('/api/report-spin', express.json(), async (req, res) => {
    try {
        const payload = req.body;
        const secret = req.headers['x-crawler-secret'];

        if (secret !== CRAWLER_SECRET) {
            console.warn(`⛔ [SECURITY] Tentativa sem senha correta: ${req.ip}`);
            return res.status(403).json({ error: 'Acesso negado: Senha incorreta' });
        }

        if (!payload.signal || !payload.source) {
            return res.status(400).json({ error: 'Payload inválido (falta signal ou source)' });
        }

        console.log(`🐍 [PYTHON RECEBIDO] ${payload.source}: ${payload.signal} (Croupier: ${payload.croupier})`);

        await saveNewSignals([payload], payload.source);

        io.emit('novo-giro', { 
            source: payload.source, 
            data: payload 
        });

        res.json({ success: true, saved: payload.signal });

    } catch (error) {
        console.error('❌ Erro no endpoint report-spin:', error);
        Sentry.captureException(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/update-croupier', express.json(), (req, res) => {
    const { croupier, source } = req.body;
    const secret = req.headers['x-crawler-secret'];
    
    if (secret !== CRAWLER_SECRET) return res.status(403).json({ error: 'Acesso negado' });

    if (croupier) {
        io.emit('troca-croupier', { source: source || 'brasileira', croupier });
    }
    res.json({ status: 'ok' });
});

// Webhook Hubla — ⚡ COM INVALIDAÇÃO DE CACHE REDIS
app.post('/api/webhooks/hubla', express.json(), async (req, res) => {
    try {
        const hublaToken = req.headers['x-hubla-token'];
        if (!verifyHublaWebhook(hublaToken, HUBLA_WEBHOOK_TOKEN)) return res.status(401).json({ error: 'Token inválido' });
        const result = await processHublaWebhook(req.body.type, req.body);

        // ⚡ REDIS: Invalida cache da assinatura do usuário afetado
        const subscriberEmail = req.body?.data?.subscriber?.email 
          || req.body?.data?.email 
          || req.body?.subscriber?.email;
        if (subscriberEmail) {
          await invalidateSubscriptionCache(subscriberEmail);
          console.log(`🔄 [REDIS] Cache de assinatura invalidado: ${subscriberEmail}`);
        }

        res.status(200).json({ success: true, result });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 🔴 MIDDLEWARE DE ASSINATURA — COM CACHE REDIS (sub-ms)
// Antes: ~5-20ms (query PG a cada request)
// Agora: ~0.1ms (Redis) com fallback para PG no cache miss
// ═══════════════════════════════════════════════════════════════
const requireActiveSubscription = async (req, res, next) => {
    try {
        const userEmail = req.query.userEmail;
        if (!userEmail) return res.status(401).json({ error: 'userEmail obrigatório', requiresSubscription: true });
        
        const cleanEmail = userEmail.trim().toLowerCase();

        // ⚡ CAMADA 1: Redis cache (sub-milissegundo)
        const cached = await getCachedSubscription(cleanEmail);
        if (cached) {
            if (cached.hasAccess) {
                req.subscription = cached.subscription;
                return next();
            }
            return res.status(403).json({
                error: cached.reason || 'Assinatura inválida',
                requiresSubscription: true,
                checkoutUrl: HUBLA_CHECKOUT_URL
            });
        }

        // CAMADA 2: PostgreSQL (cache miss)
        const subscription = await getSubscriptionByEmail(cleanEmail);
        
        if (!subscription) {
            setCachedSubscription(cleanEmail, { hasAccess: false, subscription: null, reason: 'Assinatura não encontrada' }).catch(() => {});
            return res.status(403).json({ error: 'Assinatura não encontrada', requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL });
        }

        const activeStatuses = ['active', 'trialing', 'paid'];
        if (!activeStatuses.includes(subscription.status)) {
            setCachedSubscription(cleanEmail, { hasAccess: false, subscription, reason: `Assinatura inativa (${subscription.status})` }).catch(() => {});
            return res.status(403).json({ error: `Assinatura inativa (${subscription.status})`, requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL });
        }
        
        if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
            setCachedSubscription(cleanEmail, { hasAccess: false, subscription, reason: 'Assinatura expirada' }).catch(() => {});
            return res.status(403).json({ error: 'Assinatura expirada', requiresSubscription: true, checkoutUrl: HUBLA_CHECKOUT_URL });
        }
        
        // ✅ Acesso válido — cache positivo (60s TTL)
        setCachedSubscription(cleanEmail, { hasAccess: true, subscription }).catch(() => {});
        req.subscription = subscription;
        next();
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ error: 'Erro ao verificar assinatura' });
    }
};

// Status da assinatura (MANTIDO)
app.get('/api/subscription/status', async (req, res) => {
    try {
        const userEmail = req.query.userEmail;
        if (!userEmail) return res.status(400).json({ error: 'userEmail obrigatório' });
        const cleanEmail = userEmail.trim().toLowerCase();
        const subscription = await getSubscriptionByEmail(cleanEmail);
        
        if (!subscription) return res.json({ hasAccess: false, subscription: null, checkoutUrl: HUBLA_CHECKOUT_URL });

        const activeStatuses = ['active', 'trialing', 'paid'];
        let hasAccess = false;
        if (activeStatuses.includes(subscription.status)) {
            if (!subscription.expires_at || new Date(subscription.expires_at) >= new Date()) hasAccess = true;
        }
        
        res.json({ hasAccess, subscription, checkoutUrl: HUBLA_CHECKOUT_URL });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
});

// Admin routes (MANTIDO)
app.get('/api/admin/subscriptions/stats', async (req, res) => {
    try { const stats = await getSubscriptionStats(); res.json(stats); } catch (e) { Sentry.captureException(e); res.status(500).json({error: e.message}); }
});
app.get('/api/admin/subscriptions/active', async (req, res) => {
    try { const subs = await getActiveSubscriptions(); res.json(subs); } catch (e) { Sentry.captureException(e); res.status(500).json({error: e.message}); }
});
app.get('/api/admin/webhooks/logs', async (req, res) => {
    try { const logs = await getWebhookLogs(parseInt(req.query.limit)||100); res.json(logs); } catch (e) { Sentry.captureException(e); res.status(500).json({error: e.message}); }
});

// ═══════════════════════════════════════════════════════════════
// 📊 MONITOR DE SAÚDE DAS FONTES
// ═══════════════════════════════════════════════════════════════
const sourceHealth = new Map();

function getSourceHealth(sourceName) {
    if (!sourceHealth.has(sourceName)) {
        sourceHealth.set(sourceName, {
            lastSignalId: null,
            lastNewDataAt: null,
            lastFetchAt: null,
            lastApiLatencyMs: 0,
            lastDbSaveMs: 0,
            totalFetches: 0,
            totalNewSignals: 0,
            totalErrors: 0,
            lastError: null,
            consecutiveEmpty: 0,
            apiReturnedItems: 0,
        });
    }
    return sourceHealth.get(sourceName);
}

let healthLogInterval = null;
function startHealthLogger() {
    if (healthLogInterval) return;
    healthLogInterval = setInterval(() => {
        if (sourceHealth.size === 0) return;

        const now = Date.now();
        const lines = [];
        let hasGap = false;

        for (const [name, h] of sourceHealth) {
            const secSinceNew = h.lastNewDataAt ? Math.round((now - h.lastNewDataAt) / 1000) : '∞';
            const gapFlag = (typeof secSinceNew === 'number' && secSinceNew > 120) || secSinceNew === '∞';
            if (gapFlag && h.totalFetches > 2) hasGap = true;

            const status = h.lastError ? '❌' : gapFlag ? '⚠️' : '✅';
            lines.push(
                `  ${status} ${name.padEnd(14)} | API: ${String(h.lastApiLatencyMs).padStart(5)}ms | DB: ${String(h.lastDbSaveMs).padStart(4)}ms | Sem novo: ${String(secSinceNew).padStart(5)}s | Empty streak: ${h.consecutiveEmpty} | Items: ${h.apiReturnedItems} | Erros: ${h.totalErrors}`
            );
        }

        // ⚡ REDIS: Persiste saúde para dashboards externos
        setCachedSourceHealth(sourceHealth).catch(() => {});

        const shouldLog = hasGap || (now % 300000 < 60000);
        if (shouldLog) {
            console.log(`\n📊 ─── SAÚDE DAS FONTES ─── ${new Date().toLocaleTimeString()} ───`);
            lines.sort().forEach(l => console.log(l));
            if (hasGap) {
                console.log(`  🔴 FONTES COM GAP (>120s sem dado novo) — PROBLEMA É DA API EXTERNA`);
            }
            console.log(`${'─'.repeat(80)}\n`);
        }
    }, 60000);
}

// --- SCRAPER INSTRUMENTADO ---
const normalizeData = (data) => {
    if (Array.isArray(data)) return data;
    if (data?.games) return data.games;
    if (data?.signalId) return [data];
    return [];
};

async function fetchAndSaveFromSource(url, sourceName) {
    const health = getSourceHealth(sourceName);
    health.totalFetches++;
    health.lastFetchAt = Date.now();

    try {
        const apiStart = Date.now();
        const response = await fetch(url, { timeout: 15000 });
        health.lastApiLatencyMs = Date.now() - apiStart;

        if (!response.ok) {
            health.totalErrors++;
            health.lastError = `HTTP ${response.status}`;
            throw new Error(`Status: ${response.status}`);
        }

        const data = await response.json();
        const normalizedData = normalizeData(data);
        health.apiReturnedItems = normalizedData.length;

        if (normalizedData.length === 0) {
            health.consecutiveEmpty++;
            health.lastError = null;
            return;
        }

        const newestId = normalizedData[0]?.signalId || normalizedData[0]?.id;
        
        if (newestId && newestId === health.lastSignalId) {
            health.consecutiveEmpty++;
            return;
        }

        health.lastSignalId = newestId;
        health.lastNewDataAt = Date.now();
        health.consecutiveEmpty = 0;
        health.lastError = null;

        const dbStart = Date.now();
        await saveNewSignals(normalizedData, sourceName);
        health.lastDbSaveMs = Date.now() - dbStart;

        health.totalNewSignals += normalizedData.length;

    } catch (err) {
        health.totalErrors++;
        health.lastError = err.message?.substring(0, 80);
        
        if (health.totalErrors <= 3 || health.totalErrors % 10 === 0) {
            console.error(`❌ [FETCH - ${sourceName}]: ${err.message} (erro #${health.totalErrors})`);
        }
        Sentry.captureException(err, { tags: { source: sourceName } });
    }
}

async function fetchAllData() {
    const sourcesToFetch = Object.keys(API_URLS);
    const fetchPromises = sourcesToFetch.map(sourceName => {
        if (!API_URLS[sourceName]) return;
        return fetchAndSaveFromSource(API_URLS[sourceName], sourceName);
    });
    try { await Promise.all(fetchPromises); } catch (error) { Sentry.captureException(error); }
}

// ── Rota para consultar saúde em tempo real ──
app.get('/api/source-health', (req, res) => {
    const result = {};
    const now = Date.now();
    for (const [name, h] of sourceHealth) {
        result[name] = {
            status: h.lastError ? 'error' : (h.consecutiveEmpty > 5 ? 'gap' : 'ok'),
            apiLatencyMs: h.lastApiLatencyMs,
            dbSaveMs: h.lastDbSaveMs,
            secondsSinceNewData: h.lastNewDataAt ? Math.round((now - h.lastNewDataAt) / 1000) : null,
            consecutiveEmpty: h.consecutiveEmpty,
            apiReturnedItems: h.apiReturnedItems,
            totalFetches: h.totalFetches,
            totalNewSignals: h.totalNewSignals,
            totalErrors: h.totalErrors,
            lastError: h.lastError,
        };
    }
    res.json(result);
});

app.get('/api/fetch/all', requireActiveSubscription, async (req, res) => {
    try { await fetchAllData(); res.json({ status: 'ok' }); } catch (e) { Sentry.captureException(e); res.status(500).json({error: e.message}); }
});

app.get('/api/fetch/:source', requireActiveSubscription, async (req, res) => {
    const url = API_URLS[req.params.source];
    if (!url) return res.status(400).json({ error: 'Fonte inválida' });
    try { await fetchAndSaveFromSource(url, req.params.source); res.json({ status: 'ok' }); } catch (e) { Sentry.captureException(e); res.status(500).json({error: e.message}); }
});

// ═══════════════════════════════════════════════════════════════
// Full History (com cache Redis no dbService)
// ═══════════════════════════════════════════════════════════════
app.get('/api/full-history', requireActiveSubscription, async (req, res) => {
    try {
        const sourceName = req.query.source;
        if (!sourceName || !SOURCES.includes(sourceName)) return res.status(400).json({ error: `source inválido` });
        const history = await getFullHistory(sourceName);
        res.json(history);
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ⚡ Fetch Incremental (sem cache — payload minúsculo)
// ═══════════════════════════════════════════════════════════════
app.get('/api/history-since', requireActiveSubscription, async (req, res) => {
    try {
        const sourceName = req.query.source;
        const sinceTimestamp = req.query.since || null;

        if (!sourceName || !SOURCES.includes(sourceName)) {
            return res.status(400).json({ error: `source inválido: ${sourceName}` });
        }

        const history = await getHistorySince(sourceName, sinceTimestamp);
        res.json(history);
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ✅ /api/latest — ⚡ COM CACHE REDIS
// ═══════════════════════════════════════════════════════════════
app.get('/api/latest', requireActiveSubscription, async (req, res) => {
    try {
        const sourceName = req.query.source;
        const limit = parseInt(req.query.limit) || 100;

        if (!sourceName || !SOURCES.includes(sourceName)) {
            return res.status(400).json({ error: `source inválido: ${sourceName}` });
        }

        // ⚡ Redis primeiro
        const cached = await getCachedLatest(sourceName, limit);
        if (cached) return res.json(cached);

        // Cache miss → PG
        const result = await pool.query(
            `SELECT timestamp, signalId AS signalid, gameId AS gameid, signal
             FROM signals
             WHERE source = $1
             ORDER BY timestamp DESC
             LIMIT $2`,
            [sourceName, limit]
        );

        // Write-through
        setCachedLatest(sourceName, limit, result.rows).catch(() => {});

        res.json(result.rows);
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// Health Check — ⚡ COM STATUS REDIS
// ═══════════════════════════════════════════════════════════════
app.get('/health', async (req, res) => {
    try {
        await testConnection();
        const redisOk = await testRedisConnection();
        const cacheStats = await getCacheStats();

        res.json({
            status: 'OK',
            uptime: process.uptime(),
            hubla: HUBLA_WEBHOOK_TOKEN ? '✅' : '⚠️',
            database: '✅',
            redis: redisOk ? '✅' : '⚠️ (fallback memória)',
            cache: cacheStats,
        });
    } catch (dbError) {
        res.status(503).json({ status: 'ERROR', message: 'Serviço indisponível', database: '❌' });
    }
});

// Teste Sentry
app.get('/api/test-sentry', (req, res) => {
    try { throw new Error('🧪 Teste Sentry'); } catch (e) { Sentry.captureException(e); res.json({success: true}); }
});

// Fallback SPA
app.get(/.*/, (req, res) => {
    if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint não encontrado' });
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// [MONITORAMENTO - SENTRY] 4. Error Handler
Sentry.setupExpressErrorHandler(app);

// ⚡ EVENTO SOCKET.IO
io.on('connection', (socket) => {
    console.log('🔌 Novo cliente Socket conectado:', socket.id);
});

// --- INICIALIZAÇÃO ---
const startServer = async () => {
    const PORT = process.env.PORT || 3005;
    try {
        console.log('🔍 Testando PostgreSQL...');
        await testConnection();
        await loadAllExistingSignalIds();

        // ⚡ Testa Redis
        const redisOk = await testRedisConnection();
        console.log(redisOk 
            ? '✅ [REDIS] Conectado e pronto — cache ativo' 
            : '⚠️ [REDIS] Indisponível — usando fallback memória'
        );

        // ⚡ Index para fetch incremental
        try {
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_signals_source_timestamp 
                ON signals (source, timestamp DESC);
            `);
            console.log('✅ Index source+timestamp garantido.');
        } catch (idxErr) {
            console.warn('⚠️ Index já existe ou erro:', idxErr.message);
        }
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🚀 SERVIDOR + SOCKET + 🔴 REDIS RODANDO NA PORTA ${PORT}`);
            console.log(`📡 Endpoint Python: POST /api/report-spin (Protegido)`);
            console.log(`⚡ Endpoint Incremental: GET /api/history-since?source=xxx&since=timestamp`);
            console.log(`🔴 Redis: ${redisOk ? 'ATIVO' : 'FALLBACK memória'}`);
            console.log(`${'='.repeat(80)}\n`);
            
            fetchAllData();
            setInterval(fetchAllData, FETCH_INTERVAL_MS);
            startHealthLogger();
        });
    } catch (err) {
        console.error("❌ ERRO CRÍTICO:", err);
        await Sentry.captureException(err);
        await Sentry.close(2000);
        process.exit(1);
    }
};

startServer();

process.on('unhandledRejection', (reason, promise) => { Sentry.captureException(reason); });
process.on('uncaughtException', (err) => { 
    Sentry.captureException(err); 
    Sentry.close(2000).then(() => { process.exit(1); }); 
});