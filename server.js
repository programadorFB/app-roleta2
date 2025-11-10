// server.js - CORRIGIDO - Com integração Hubla funcionando
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Importa serviços
import { loadAllExistingSignalIds, appendToCsv, getFullHistory, SOURCES } from './src/utils/csvService.js';
import { testConnection } from './db.js';
import {
    hasActiveAccess,
    processHublaWebhook,
    verifyHublaWebhook,
    getSubscriptionStats,
    getActiveSubscriptions,
    getWebhookLogs,
    getSubscriptionByEmail
} from './subscriptionService.js';

dotenv.config();

console.log(`\n\n--- SERVIDOR INICIADO --- ${new Date().toLocaleTimeString()}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// --- CONSTANTES ---
const API_URLS = {
    immersive: 'https://apptemporario-production.up.railway.app/api/0194b479-654d-70bd-ac50-9c5a9b4d14c5',
    brasileira: 'https://apptemporario-production.up.railway.app/api/0194b473-2ab3-778f-89ee-236e803f3c8e',
    default: 'https://apptemporario-production.up.railway.app/api/0194b473-4604-7458-bb18-e3fc562980c2',
    speed: 'https://apptemporario-production.up.railway.app/api/0194b473-c347-752f-9eaf-783721339479',
    xxxtreme: 'https://apptemporario-production.up.railway.app/api/0194b478-5ba0-7110-8179-d287b2301e2e',
    vipauto: 'https://apptemporario-production.up.railway.app/api/0194b473-9044-772b-a6fc-38236eb08b42'
};
const FETCH_INTERVAL_MS = 5000;
const DEFAULT_AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';
const HUBLA_WEBHOOK_TOKEN = process.env.HUBLA_WEBHOOK_TOKEN;
const HUBLA_CHECKOUT_URL = process.env.HUBLA_CHECKOUT_URL;

// --- MIDDLEWARE (ORDEM CRÍTICA) ---

// 1. Log geral
app.use((req, res, next) => {
    req._startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📥 ${req.method} ${req.url} - IP: ${req.ip}`);
    
    res.on('finish', () => {
        const duration = Date.now() - req._startTime;
        const emoji = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '✅';
        console.log(`${emoji} [${timestamp}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });

    next();
});

// 2. CORS
app.use(cors());

// 3. ❌ NÃO usar express.json() globalmente!
// Vamos usar apenas em rotas específicas que precisam

// 4. PROXY DE LOGIN (SEM VERIFICAÇÃO HUBLA AQUI)
// A verificação Hubla será feita APÓS o login bem-sucedido
app.use('/login', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    followRedirects: true,
    
    pathRewrite: {
        '^/': '/login' 
    },

    onProxyReq: (proxyReq, req, res) => {
        const timestamp = new Date().toISOString();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${timestamp}] 🔐 PROXY LOGIN ATIVADO`);
        console.log(`[${timestamp}] 📤 Método: ${req.method} | URL: ${req.url}`);
        console.log(`[${timestamp}] 🎯 Destino: ${DEFAULT_AUTH_PROXY_TARGET}${proxyReq.path}`);
        console.log(`${'='.repeat(80)}\n`);
        
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        proxyReq.setHeader('Accept', 'application/json');
    },

    onProxyRes: (proxyRes, req, res) => {
        const timestamp = new Date().toISOString();
        let body = [];
        
        proxyRes.on('data', chunk => body.push(chunk));
        
        // 🔥 SOLUÇÃO: Fazemos a verificação Hubla APÓS receber resposta do backend
        proxyRes.on('end', async () => { 
            const responseBody = Buffer.concat(body).toString('utf8');
            const backendStatusCode = proxyRes.statusCode;
            
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[${timestamp}] 📥 RESPOSTA DO BACKEND DE LOGIN`);
            console.log(`[${timestamp}] Status: ${backendStatusCode}`);
            
            // Se o backend falhou, repassa o erro direto
            if (backendStatusCode < 200 || backendStatusCode >= 300) {
                console.warn(`[${timestamp}] ⚠️ Login falhou no backend. Repassando erro.`);
                console.log(`${'='.repeat(80)}\n`);
                
                Object.keys(proxyRes.headers).forEach((key) => {
                    res.setHeader(key, proxyRes.headers[key]);
                });
                res.status(backendStatusCode).send(responseBody);
                return;
            }

            // --- VERIFICAÇÃO HUBLA (apenas se login foi bem-sucedido) ---
            try {
                // Precisamos parsear o body original da requisição
                // Como não usamos express.json(), vamos fazer manualmente
                let email = null;
                
                // Tenta extrair do Authorization header (se for Basic Auth)
                if (req.headers.authorization?.startsWith('Basic ')) {
                    const base64 = req.headers.authorization.split(' ')[1];
                    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
                    email = decoded.split(':')[0]; // username é o email
                }
                
                // Se não encontrou, tenta parsear o body (caso seja JSON)
                if (!email && req.headers['content-type']?.includes('application/json')) {
                    // O body já foi consumido pelo proxy, mas salvamos chunks se necessário
                    // Para simplificar, vamos pegar do responseBody se o backend retornar
                    try {
                        const responseData = JSON.parse(responseBody);
                        email = responseData.user?.email || responseData.email;
                    } catch (e) {
                        console.warn(`[${timestamp}] ⚠️ Não foi possível parsear resposta do backend`);
                    }
                }

                if (!email) {
                    console.error(`[${timestamp}] ❌ Email não encontrado na requisição`);
                    res.status(500).json({
                        error: true,
                        message: "Erro interno: Email não identificado"
                    });
                    return;
                }

                console.log(`[${timestamp}] 🔍 Verificando assinatura Hubla para: ${email}`);
                
                const subscription = await getSubscriptionByEmail(email);
                let canLogin = false;
                let subMessage = 'Assinatura não encontrada.';

                if (subscription) {
                    const activeStatuses = ['active', 'trialing', 'paid'];
                    
                    if (!activeStatuses.includes(subscription.status)) {
                        subMessage = `Assinatura inativa (Status: ${subscription.status})`;
                    } else if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
                        subMessage = 'Assinatura expirada.';
                    } else {
                        canLogin = true;
                    }
                }

                if (canLogin) {
                    console.log(`[${timestamp}] ✅ Assinatura ATIVA! Permitindo login.`);
                    console.log(`${'='.repeat(80)}\n`);
                    
                    Object.keys(proxyRes.headers).forEach((key) => {
                        res.setHeader(key, proxyRes.headers[key]);
                    });
                    res.status(backendStatusCode).send(responseBody);
                    
                } else {
                    console.warn(`[${timestamp}] 🚫 ACESSO NEGADO: ${subMessage}`);
                    console.log(`${'='.repeat(80)}\n`);
                    
                    res.status(403).json({
                        error: true,
                        message: subMessage,
                        code: 'FORBIDDEN_SUBSCRIPTION',
                        checkoutUrl: HUBLA_CHECKOUT_URL
                    });
                }
                
            } catch (dbError) {
                console.error(`[${timestamp}] ❌ Erro ao verificar assinatura:`, dbError);
                res.status(500).json({
                    error: true,
                    message: "Erro ao verificar assinatura",
                    details: dbError.message
                });
            }
        });
    },

    onError: (err, req, res) => {
        const timestamp = new Date().toISOString();
        console.error(`\n${'='.repeat(80)}`);
        console.error(`[${timestamp}] ❌ ERRO NO PROXY DE LOGIN`);
        console.error(`[${timestamp}] Código: ${err.code}`);
        console.error(`[${timestamp}] Mensagem: ${err.message}`);
        console.error(`${'='.repeat(80)}\n`);
        
        if (!res.headersSent) {
            res.status(500).json({
                error: true,
                message: 'Erro no proxy de login',
                code: err.code
            });
        }
    },
    
    logLevel: 'warn'
}));

// 5. PROXY DE START-GAME
app.use('/start-game', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    
    pathRewrite: (path) => `/start-game${path}`,

    onProxyReq: (proxyReq, req) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 🚀 PROXY GAME: ${req.method} ${DEFAULT_AUTH_PROXY_TARGET}/start-game${req.url}`);
        
        if (req.headers.authorization) {
            proxyReq.setHeader('Authorization', req.headers.authorization);
        }
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0');
    },

    onProxyRes: (proxyRes, req, res) => {
        let body = [];
        proxyRes.on('data', chunk => body.push(chunk));
        proxyRes.on('end', () => {
            const responseBody = Buffer.concat(body).toString('utf8');
            
            Object.keys(proxyRes.headers).forEach(key => {
                res.setHeader(key, proxyRes.headers[key]);
            });
            
            res.status(proxyRes.statusCode).end(responseBody);
        });
    },

    logLevel: 'warn'
}));

// 6. Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'dist')));

// --- ROTAS DA API (COM express.json() LOCALIZADO) ---

// Webhook Hubla (precisa de JSON parser)
app.post('/api/webhooks/hubla', express.json(), async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${timestamp}] 📢 WEBHOOK HUBLA RECEBIDO`);
    console.log(`${'='.repeat(80)}`);
    
    try {
        const hublaToken = req.headers['x-hubla-token'];
        
        if (!verifyHublaWebhook(hublaToken, HUBLA_WEBHOOK_TOKEN)) {
            console.error(`[${timestamp}] ❌ Token inválido`);
            return res.status(401).json({ error: 'Token inválido' });
        }
        
        const result = await processHublaWebhook(req.body.type, req.body);
        
        console.log(`[${timestamp}] ✅ Webhook processado`);
        console.log(`${'='.repeat(80)}\n`);
        
        res.status(200).json({ success: true, result });
        
    } catch (error) {
        console.error(`[${timestamp}] ❌ Erro:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Middleware de proteção (para APIs de dados)
const requireActiveSubscription = async (req, res, next) => {
    try {
        const userEmail = req.query.userEmail;
        
        if (!userEmail) {
            return res.status(401).json({
                error: 'userEmail obrigatório',
                requiresSubscription: true
            });
        }
        
        const subscription = await getSubscriptionByEmail(userEmail);
        
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
        console.error('❌ [AUTH] Erro:', error);
        res.status(500).json({ error: 'Erro ao verificar assinatura' });
    }
};

// Status da assinatura
app.get('/api/subscription/status', async (req, res) => {
    try {
        const userEmail = req.query.userEmail;
        
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail obrigatório' });
        }
        
        const subscription = await getSubscriptionByEmail(userEmail);
        
        if (!subscription) {
            return res.json({
                hasAccess: false,
                subscription: null,
                checkoutUrl: HUBLA_CHECKOUT_URL
            });
        }

        const activeStatuses = ['active', 'trialing', 'paid'];
        let hasAccess = false;
        
        if (activeStatuses.includes(subscription.status)) {
            if (!subscription.expires_at || new Date(subscription.expires_at) >= new Date()) {
                hasAccess = true;
            }
        }
        
        res.json({
            hasAccess,
            subscription,
            checkoutUrl: HUBLA_CHECKOUT_URL
        });
    } catch (error) {
        console.error('❌ Erro ao verificar status:', error);
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
});

// Admin routes
app.get('/api/admin/subscriptions/stats', async (req, res) => {
    try {
        const stats = await getSubscriptionStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/subscriptions/active', async (req, res) => {
    try {
        const subscriptions = await getActiveSubscriptions();
        res.json(subscriptions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/webhooks/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await getWebhookLogs(limit);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SCRAPER ---
const normalizeData = (data) => {
    if (Array.isArray(data)) return data;
    if (data?.games) return data.games;
    if (data?.signalId) return [data];
    return [];
};

async function fetchAndSaveFromSource(url, sourceName) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        
        const data = await response.json();
        const normalizedData = normalizeData(data);
        
        if (normalizedData.length > 0) {
            await appendToCsv(normalizedData, sourceName);
        }
    } catch (err) {
        console.error(`❌ [FETCH - ${sourceName}]:`, err.message);
    }
}

async function fetchAllData() {
    await Promise.all([
        fetchAndSaveFromSource(API_URLS.immersive, 'immersive'),
        fetchAndSaveFromSource(API_URLS.brasileira, 'brasileira'),
        fetchAndSaveFromSource(API_URLS.default, 'default'),
        fetchAndSaveFromSource(API_URLS.speed, 'speed'),
        fetchAndSaveFromSource(API_URLS.xxxtreme, 'xxxtreme'),
        fetchAndSaveFromSource(API_URLS.vipauto, 'vipauto')
    ]);
}

// Scraper endpoints (protegidos)
app.get('/api/fetch/all', requireActiveSubscription, async (req, res) => {
    try {
        await fetchAllData();
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/full-history', requireActiveSubscription, async (req, res) => {
    try {
        const sourceName = req.query.source;

        if (!sourceName || !SOURCES.includes(sourceName)) {
            return res.status(400).json({ 
                error: `source obrigatório. Valores: [${SOURCES.join(', ')}]` 
            });
        }
        
        const history = await getFullHistory(sourceName);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        hubla: HUBLA_WEBHOOK_TOKEN ? '✅' : '⚠️'
    });
});

// Fallback SPA
app.get(/.*/, (req, res) => {
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint não encontrado' });
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- INICIALIZAÇÃO ---
const startServer = async () => {
    const PORT = process.env.PORT || 3000;
    
    try {
        console.log('🔍 Testando PostgreSQL...');
        await testConnection();
        
        await loadAllExistingSignalIds();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🚀 SERVIDOR RODANDO - PORTA ${PORT}`);
            console.log(`${'='.repeat(80)}`);
            console.log(`🔐 Login: /login → ${DEFAULT_AUTH_PROXY_TARGET}/login (+ Hubla)`);
            console.log(`🎮 Game: /start-game/* → ${DEFAULT_AUTH_PROXY_TARGET}/start-game/*`);
            console.log(`📢 Webhook: /api/webhooks/hubla`);
            console.log(`📊 API Scraper: /api/* (protegida)`);
            console.log(`💳 Hubla: ${HUBLA_WEBHOOK_TOKEN ? '✅ Configurado' : '⚠️ Não configurado'}`);
            console.log(`${'='.repeat(80)}\n`);
            
            fetchAllData();
            setInterval(fetchAllData, FETCH_INTERVAL_MS);
        });
    } catch (err) {
        console.error("❌ ERRO CRÍTICO:", err);
        process.exit(1);
    }
};

startServer();