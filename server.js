// server.js (DUPLA ROLETA BRASILEIRA: ANTIGA + NOVA PLAYTECH)
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { loadAllExistingSignalIds, appendToCsv, getFullHistory, SOURCES } from './src/utils/csvService.js';

console.log(`\n\n--- INICIANDO SERVIDOR --- ${new Date().toLocaleTimeString()}`);

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
    
    // A ANTIGA (AppTemporario)
    brasileira: 'https://apptemporario-production.up.railway.app/api/0194b473-2ab3-778f-89ee-236e803f3c8e',
    
    // A NOVA PLAYTECH (SorteHub)
    brasileiraplay: 'https://pbrapi.sortehub.online/api/sinais/historico', 
    
    default: 'https://apptemporario-production.up.railway.app/api/0194b473-4604-7458-bb18-e3fc562980c2',
    speed: 'https://apptemporario-production.up.railway.app/api/0194b473-c347-752f-9eaf-783721339479',
    xxxtreme: 'https://apptemporario-production.up.railway.app/api/0194b478-5ba0-7110-8179-d287b2301e2e',
    vipauto: 'https://apptemporario-production.up.railway.app/api/0194b473-9044-772b-a6fc-38236eb08b42'
};

const FETCH_INTERVAL_MS = 3000; 
// eslint-disable-next-line no-undef
const DEFAULT_AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';

// --- MIDDLEWARES ---
app.use((req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) console.log(`⚠️ ${req.method} ${req.url} - ${res.statusCode}`);
    });
    next();
});
app.use(cors());
app.use('/login', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    followRedirects: true,
    pathRewrite: { '^/': '/login' },
    onProxyReq: (proxyReq) => {
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        proxyReq.setHeader('Accept', 'application/json');
    },
    onError: (err, req, res) => { if (!res.headersSent) res.status(500).json({ error: true }); }
}));
app.use('/start-game', createProxyMiddleware({
    target: DEFAULT_AUTH_PROXY_TARGET,
    changeOrigin: true,
    timeout: 60000,
    pathRewrite: (path) => `/start-game${path}`,
    onProxyReq: (proxyReq, req) => {
        if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
    },
    onError: (err, req, res) => { if (!res.headersSent) res.status(500).json({ error: true }); }
}));
app.use(express.static(path.join(__dirname, 'dist')));

// --- SOCKET EVENTS ---
io.on('connection', (socket) => {
    console.log(`⚡ Cliente Socket: ${socket.id}`);
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

            // ⚡ LÓGICA DE SOCKET APENAS PARA A PLAYTECH
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
        console.error(`❌ [FETCH - ${sourceName}] Erro:`, err.message);
    }
}

async function fetchAllData() {
    await Promise.all([
        fetchAndSaveFromSource(API_URLS.immersive, 'immersive'),
        
        // Busca a Antiga (Sem socket, só CSV)
        fetchAndSaveFromSource(API_URLS.brasileira, 'brasileira'), 
        
        // Busca a Nova PlayTech (Com Socket)
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

app.get('/health', (req, res) => res.status(200).json({ status: 'OK', socket: 'active' }));

app.get(/,*/, (req, res) => {
    if (req.url.startsWith('/api/')) return res.status(44).json({ error: 'Not Found' });
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- START ---
const startServer = async () => {
    const PORT = process.env.PORT || 3000;
    try {
        await loadAllExistingSignalIds();
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
            console.log(`📌 Fonte 'brasileira' (Antiga): Ativa (Polling)`);
            console.log(`📌 Fonte 'Brasileira PlayTech' (Nova): Ativa (Socket + Polling)`);
            fetchAllData(); 
            setInterval(fetchAllData, FETCH_INTERVAL_MS); 
        });
    } catch (err) {
        console.error("❌ ERRO AO INICIAR:", err);
        process.exit(1);
    }
};

startServer();