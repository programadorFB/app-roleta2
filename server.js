// server.js (Corrigido com proxy /login e /start-game)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Importa as funções atualizadas e as fontes
import { loadAllExistingSignalIds, appendToCsv, getFullHistory, SOURCES } from './src/utils/csvService.js';

console.log(`\n\n--- O SERVIDOR ESTÁ SENDO INICIADO AGORA --- ${new Date().toLocaleTimeString()}`);

// --- CONFIGURAÇÃO INICIAL ---
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
// eslint-disable-next-line no-undef
const DEFAULT_AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';

// --- MIDDLEWARE (ORDEM CRÍTICA) ---

// 1. Middleware de Log Geral (primeiro de todos)
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

// 2. CORS (segundo)
app.use(cors());

// 3. PROXY DE LOGIN (ANTES de qualquer outra rota!)
// Este middleware captura TODAS as requisições para /login (GET, POST, etc)
app.use('/login', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    followRedirects: true,
    
    // *** CORREÇÃO APLICADA AQUI ***
    // Reescreve a URL que o Express nos dá ('/') de volta para '/login'
    pathRewrite: {
        '^/': '/login' 
    },

    onProxyReq: (proxyReq, req, res) => {
        const timestamp = new Date().toISOString();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${timestamp}] 🔄 PROXY LOGIN ATIVADO`);
        console.log(`[${timestamp}] 📤 Método: ${req.method}`);
        console.log(`[${timestamp}] 📤 URL Original: ${req.url}`); // O Express muda para '/'
        console.log(`[${timestamp}] 🎯 Destino: ${DEFAULT_AUTH_PROXY_TARGET}${proxyReq.path}`); // Deve mostrar /login
        console.log(`${'='.repeat(80)}\n`);
        
        // Headers para simular navegador
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        proxyReq.setHeader('Accept', 'application/json');
        
        if (req.headers.authorization) {
            console.log(`[${timestamp}] 🔐 Authorization: ${req.headers.authorization.substring(0, 30)}...`);
        }
    },

    onProxyRes: (proxyRes, req, res) => {
        const timestamp = new Date().toISOString();
        let body = [];
        
        proxyRes.on('data', chunk => body.push(chunk));
        
        proxyRes.on('end', () => {
            const responseBody = Buffer.concat(body).toString('utf8');
            
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[${timestamp}] 📥 RESPOSTA DO BACKEND DE LOGIN`);
            console.log(`[${timestamp}] Status: ${proxyRes.statusCode}`);
            
            if (proxyRes.statusCode >= 500) {
                console.error(`[${timestamp}] ❌ ERRO 500 DO BACKEND`);
                console.error(`[${timestamp}] Body:`, responseBody.substring(0, 500));
            } else if (proxyRes.statusCode >= 400) {
                console.warn(`[${timestamp}] ⚠️ ERRO 4XX: ${proxyRes.statusCode}`);
                console.warn(`[${timestamp}] Body:`, responseBody.substring(0, 300));
            } else {
                console.log(`[${timestamp}] ✅ SUCESSO!`);
                console.log(`[${timestamp}] Body:`, responseBody.substring(0, 200));
            }
            console.log(`${'='.repeat(80)}\n`);
            
            Object.keys(proxyRes.headers).forEach((key) => {
                try {
                    res.setHeader(key, proxyRes.headers[key]);
                } catch (e) {
                    console.warn(`Não foi possível setar header ${key}:`, e.message);
                }
            });
            
            res.status(proxyRes.statusCode);
            res.end(responseBody);
        });
    },

    onError: (err, req, res) => {
        const timestamp = new Date().toISOString();
        console.error(`\n${'='.repeat(80)}`);
        console.error(`[${timestamp}] ❌ ERRO NO PROXY DE LOGIN`);
        console.error(`[${timestamp}] Código: ${err.code}`);
        console.error(`[${timestamp}] Mensagem: ${err.message}`);
        console.error(`${'='.repeat(80)}\n`);
        
        const errorMap = {
            'ECONNREFUSED': { status: 503, message: 'Backend de login indisponível' },
            'ETIMEDOUT': { status: 504, message: 'Timeout (60s) ao conectar com backend' },
            'ESOCKETTIMEDOUT': { status: 504, message: 'Socket timeout' },
            'ENOTFOUND': { status: 502, message: 'Backend não encontrado' },
            'ECONNRESET': { status: 502, message: 'Conexão resetada' },
        };
        
        const error = errorMap[err.code] || { status: 500, message: 'Erro interno no proxy' };
        
        if (!res.headersSent) {
            res.status(error.status).json({
                error: true,
                message: error.message,
                code: err.code,
                details: err.message,
                timestamp,
                url: req.url
            });
        } else {
            res.end();
        }
    },
    
    logLevel: 'debug'
}));


// 4. PROXY DE START-GAME (NOVO)
// Captura /start-game/:id e redireciona para o backend
app.use('/start-game', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET, // O mesmo backend do login
    changeOrigin: true,
    timeout: 60000,
    
    // Reescreve /55 (que o Express nos dá) para /start-game/55
    pathRewrite: (path, req) => {
        const newPath = `/start-game${path}`;
        console.log(`[PROXY GAME] Path reescrito de "${path}" para "${newPath}"`);
        return newPath;
    },

    onProxyReq: (proxyReq, req, res) => {
        const timestamp = new Date().toISOString();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${timestamp}] 🚀 PROXY GAME ATIVADO`);
        console.log(`[${timestamp}] 📤 Método: ${req.method} | URL Original: ${req.url}`);
        console.log(`[${timestamp}] 🎯 Destino: ${DEFAULT_AUTH_PROXY_TARGET}${proxyReq.path}`);
        
        // Repassa o header de Autorização vindo do App.jsx
        if (req.headers.authorization) {
            console.log(`[${timestamp}] 🔐 Authorization: ${req.headers.authorization.substring(0, 30)}...`);
            proxyReq.setHeader('Authorization', req.headers.authorization);
        } else {
            console.warn(`[${timestamp}] ⚠️ Aviso: Chamada para /start-game sem Authorization header.`);
        }
        
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        console.log(`${'='.repeat(80)}\n`);
    },

    onProxyRes: (proxyRes, req, res) => {
        const timestamp = new Date().toISOString();
        let body = [];
        
        proxyRes.on('data', chunk => body.push(chunk));
        
        proxyRes.on('end', () => {
            const responseBody = Buffer.concat(body).toString('utf8');
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[${timestamp}] 📥 RESPOSTA DO BACKEND DE JOGO`);
            console.log(`[${timestamp}] Status: ${proxyRes.statusCode}`);
            
            if (proxyRes.statusCode >= 400) {
                console.error(`[${timestamp}] ❌ ERRO DO BACKEND DE JOGO`);
                console.error(`[${timestamp}] Body:`, responseBody.substring(0, 500));
            } else {
                console.log(`[${timestamp}] ✅ SUCESSO!`);
                console.log(`[${timestamp}] Body (gameUrl): ${responseBody.substring(0, 100)}...`);
            }
            console.log(`${'='.repeat(80)}\n`);
            
            Object.keys(proxyRes.headers).forEach((key) => {
                res.setHeader(key, proxyRes.headers[key]);
            });
            
            res.status(proxyRes.statusCode);
            res.end(responseBody);
        });
    },

    onError: (err, req, res) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ❌ ERRO NO PROXY DE JOGO:`, err.message);
        
        if (!res.headersSent) {
            res.status(500).json({
                error: true,
                message: 'Erro interno no proxy do jogo',
                code: err.code,
                timestamp
            });
        }
    },
    
    logLevel: 'debug'
}));


// 5. Servir arquivos estáticos (depois dos proxies)
app.use(express.static(path.join(__dirname, 'dist')));

// --- LÓGICA DE BUSCA DE DADOS (SCRAPER) ---
const normalizeData = (data) => {
    if (Array.isArray(data)) return data;
    if (data && data.games && Array.isArray(data.games)) return data.games;
    if (data && data.signalId) return [data];
    return [];
};

async function fetchAndSaveFromSource(url, sourceName) {
    console.log(`[FETCH - ${sourceName}] Buscando novos dados...`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Status: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const normalizedData = normalizeData(data);
        
        if (normalizedData.length > 0) {
            await appendToCsv(normalizedData, sourceName);
        } else {
            console.log(`[FETCH - ${sourceName}] Nenhum dado novo.`);
        }
    } catch (err) {
        console.error(`❌ [FETCH - ${sourceName}] Erro:`, err.message);
    }
}

async function fetchAllData() {
    console.log('\n[CICLO] Iniciando busca em todas as fontes...');
    await Promise.all([
        fetchAndSaveFromSource(API_URLS.immersive, 'immersive'),
        fetchAndSaveFromSource(API_URLS.brasileira, 'brasileira'),
        fetchAndSaveFromSource(API_URLS.default, 'default'),
        fetchAndSaveFromSource(API_URLS.speed, 'speed'),
        fetchAndSaveFromSource(API_URLS.xxxtreme, 'xxxtreme'),
        fetchAndSaveFromSource(API_URLS.vipauto, 'vipauto')
    ]);
    console.log('[CICLO] Finalizado.\n');
}

// --- ENDPOINTS DA API (SCRAPER) ---
app.get('/api/fetch/all', async (req, res) => {
    try {
        await fetchAllData();
        res.json({ status: 'ok', message: 'Busca executada em todas as fontes.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados', details: err.message });
    }
});

app.get('/api/fetch/:source', async (req, res) => {
    const { source } = req.params;
    const url = API_URLS[source];
    
    if (!url) {
        return res.status(400).json({ error: `Fonte inválida: ${source}` });
    }
    
    try {
        await fetchAndSaveFromSource(url, source);
        res.json({ status: 'ok', message: `Dados da fonte ${source} buscados.` });
    } catch (err) {
        res.status(500).json({ error: `Erro ao buscar dados de ${source}`, details: err.message });
    }
});

app.get('/api/full-history', async (req, res) => {
    try {
        const sourceName = req.query.source;

        if (!sourceName || !SOURCES.includes(sourceName)) {
            return res.status(400).json({ 
                error: `Parâmetro "source" obrigatório. Valores válidos: [${SOURCES.join(', ')}]` 
            });
        }
        
        const history = await getFullHistory(sourceName);
        res.json(history);
    } catch (error) {
        console.error(`❌ Erro ao ler histórico de ${req.query.source}:`, error);
        res.status(500).json({ error: 'Falha ao ler histórico', details: error.message });
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        authProxyTarget: DEFAULT_AUTH_PROXY_TARGET
    });
});

// --- FALLBACK (ÚLTIMA ROTA) ---
// Serve o index.html para todas as rotas não capturadas (SPA)
app.get(/,*/, (req, res) => {
    // Ignora requisições de API que não existem
    if (req.url.startsWith('/api/')) {
        return res.status(44).json({ error: 'API endpoint não encontrado' });
    }
    
    console.log(`[FALLBACK] Servindo index.html para: ${req.url}`);
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const startServer = async () => {
    const PORT = process.env.PORT || 3000;
    
    try {
        await loadAllExistingSignalIds();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
            console.log(`${'='.repeat(80)}`);
            console.log(`📂 Frontend: ./dist`);
            console.log(`🔐 Proxy de Login: /login → ${DEFAULT_AUTH_PROXY_TARGET}/login`);
            console.log(`🎮 Proxy de Jogo: /start-game/* → ${DEFAULT_AUTH_PROXY_TARGET}/start-game/*`);
            console.log(`📊 API Scraper: /api/*`);
            console.log(`💚 Health Check: /health`);
            console.log(`${'='.repeat(80)}\n`);
            
            console.log(`🔄 Iniciando busca automática a cada ${FETCH_INTERVAL_MS / 1000}s...\n`);
            
            fetchAllData(); 
            setInterval(fetchAllData, FETCH_INTERVAL_MS); 
        });
    } catch (err) {
        console.error("❌ ERRO CRÍTICO AO INICIAR:", err);
        process.exit(1);
    }
};

startServer();