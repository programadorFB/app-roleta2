import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
// Importa as funções atualizadas e as fontes
import { loadAllExistingSignalIds, appendToCsv, getFullHistory, SOURCES } from './src/utils/csvService.js';

console.log(`\n\n--- O SERVIDOR ESTÁ SENDO INICIADO AGORA --- ${new Date().toLocaleTimeString()}`);

// --- CONFIGURAÇÃO INICIAL ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// --- CONSTANTES ---
// (O resto das suas constantes...)
const API_URLS = {
    // FONTES EXISTENTES
    immersive: 'https://apptemporario-production.up.railway.app/api/0194b479-654d-70bd-ac50-9c5a9b4d14c5',
    brasileira: 'https://apptemporario-production.up.railway.app/api/0194b473-2ab3-778f-89ee-236e803f3c8e',
    default: 'https://apptemporario-production.up.railway.app/api/0194b473-4604-7458-bb18-e3fc562980c2',
    // NOVAS FONTES ADICIONADAS
    speed: 'https://apptemporario-production.up.railway.app/api/0194b473-c347-752f-9eaf-783721339479', // Speed Roulette
    xxxtreme: 'https://apptemporario-production.up.railway.app/api/0194b478-5ba0-7110-8179-d287b2301e2e', // xxxtreme lightning roulette
    vipauto: 'https://apptemporario-production.up.railway.app/api/0194b473-9044-772b-a6fc-38236eb08b42' // Vip Auto Roulette
};
const FETCH_INTERVAL_MS = 5000;

// --- MIDDLEWARE ---
app.use((req, res, next) => {
    console.log(`[LOG GERAL - ${new Date().toLocaleTimeString()}] Requisição recebida: ${req.method} ${req.url}`);
    next();
});

// *** CORREÇÃO AQUI ***
// Servir arquivos estáticos da pasta 'dist' (removido o '..')
app.use(express.static(path.join(__dirname, 'dist')));

// --- LÓGICA DE BUSCA DE DADOS ---
// ... (código omitido por brevidade) ...

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
            throw new Error(`Status da resposta não foi OK: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const normalizedData = normalizeData(data);
        
        if (normalizedData.length > 0) {
            await appendToCsv(normalizedData, sourceName);
        } else {
            console.log(`[FETCH - ${sourceName}] Nenhum dado novo ou válido encontrado.`);
        }
    } catch (err) {
        console.error(`❌ [FETCH - ${sourceName}] Erro ao buscar e salvar dados:`, err.message);
    }
}

async function fetchAllData() {
    console.log('\n[CICLO DE BUSCA] Iniciando busca em todas as fontes...');
    await Promise.all([
        fetchAndSaveFromSource(API_URLS.immersive, 'immersive'),
        fetchAndSaveFromSource(API_URLS.brasileira, 'brasileira'),
        fetchAndSaveFromSource(API_URLS.default, 'default'),
        // ADIÇÃO DAS NOVAS FONTES
        fetchAndSaveFromSource(API_URLS.speed, 'speed'),
        fetchAndSaveFromSource(API_URLS.xxxtreme, 'xxxtreme'),
        fetchAndSaveFromSource(API_URLS.vipauto, 'vipauto')
    ]);
    console.log('[CICLO DE BUSCA] Ciclo finalizado.');
}


// --- ENDPOINTS DA API ---
// (Todos os seus endpoints de API permanecem iguais)
// ... (código omitido por brevidade) ...

app.get('/api/fetch/all', async (req, res) => {
    console.log('[API MANUAL] Requisição para buscar todos os dados.');
    try {
        await fetchAllData();
        res.json({ status: 'ok', message: 'Busca de dados de todas as fontes executada.' });
    } catch (err) {
        console.error('❌ Erro no handler /api/fetch/all:', err.message);
        res.status(500).json({ error: 'Erro ao buscar dados', details: err.message });
    }
});

app.get('/api/fetch/immersive', async (req, res) => {
    try {
        await fetchAndSaveFromSource(API_URLS.immersive, 'immersive');
        res.json({ status: 'ok', message: 'Dados da fonte Immersive buscados.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados da fonte Immersive', details: err.message });
    }
});

app.get('/api/fetch/brasileira', async (req, res) => {
    try {
        await fetchAndSaveFromSource(API_URLS.brasileira, 'brasileira');
        res.json({ status: 'ok', message: 'Dados da fonte Brasileira buscados.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados da fonte Brasileira', details: err.message });
    }
});

app.get('/api/fetch/default', async (req, res) => {
    try {
        await fetchAndSaveFromSource(API_URLS.default, 'default');
        res.json({ status: 'ok', message: 'Dados da fonte Default buscados.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados da fonte Default', details: err.message });
    }
});

// NOVOS ENDPOINTS MANUAIS ADICIONADOS
app.get('/api/fetch/speed', async (req, res) => {
    try {
        await fetchAndSaveFromSource(API_URLS.speed, 'speed');
        res.json({ status: 'ok', message: 'Dados da fonte Speed buscados.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados da fonte Speed', details: err.message });
    }
});

app.get('/api/fetch/xxxtreme', async (req, res) => {
    try {
        await fetchAndSaveFromSource(API_URLS.xxxtreme, 'xxxtreme');
        res.json({ status: 'ok', message: 'Dados da fonte xxxtreme buscados.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados da fonte xxxtreme', details: err.message });
    }
});

app.get('/api/fetch/vipauto', async (req, res) => {
    try {
        await fetchAndSaveFromSource(API_URLS.vipauto, 'vipauto');
        res.json({ status: 'ok', message: 'Dados da fonte vipauto buscados.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados da fonte vipauto', details: err.message });
    }
});

app.get('/api/full-history', async (req, res) => {
    try {
        const sourceName = req.query.source;

        if (!sourceName || !SOURCES.includes(sourceName)) {
            // Note: Você também precisa garantir que as novas fontes 'speed', 'xxxtreme' e 'vipauto'
            // estão incluídas no array SOURCES importado de './src/utils/csvService.js'.
            return res.status(400).json({ 
                error: `Parâmetro de query "source" é obrigatório e deve ser um de: [${SOURCES.join(', ')}]` 
            });
        }
        
        const history = await getFullHistory(sourceName);
        res.json(history);
    } catch (error) {
        console.error(`❌ Erro ao ler o histórico para ${req.query.source}:`, error);
        res.status(500).json({ error: 'Falha ao ler o histórico de dados.', details: error.message });
    }
});

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));


// *** CORREÇÃO AQUI ***
// Rota genérica para servir o frontend (removido o '..')
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));


// --- INICIALIZAÇÃO DO SERVIDOR ---
// (O resto do seu código de startServer permanece igual)
// ... (código omitido por brevidade) ...

const startServer = async () => {
    const PORT = process.env.PORT || 3000;
    try {
        await loadAllExistingSignalIds();
        
        app.listen(PORT, () => {
            console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
            console.log(`
Endpoints disponíveis para teste manual:
  - GET /api/full-history?source=default    -> Vê dados salvos da 'default'.
  - GET /api/full-history?source=immersive  -> Vê dados salvos da 'immersive'.
  - GET /api/full-history?source=brasileira -> Vê dados salvos da 'brasileira'.
  - GET /api/full-history?source=speed      -> Vê dados salvos da 'speed'.
  - GET /api/full-history?source=xxxtreme   -> Vê dados salvos da 'xxxtreme'.
  - GET /api/full-history?source=vipauto    -> Vê dados salvos da 'vipauto'.
  - GET /api/fetch/all                      -> Força a busca de dados de TODAS as fontes.
  - GET /api/fetch/immersive                -> Força a busca da fonte Immersive.
  - GET /api/fetch/brasileira               -> Força a busca da fonte Brasileira.
  - GET /api/fetch/default                  -> Força a busca da fonte Default.
  - GET /api/fetch/speed                    -> Força a busca da fonte Speed.
  - GET /api/fetch/xxxtreme                 -> Força a busca da fonte Xxxtreme.
  - GET /api/fetch/vipauto                  -> Força a busca da fonte Vip Auto.
            `);
            
            console.log(`\n🔄 Iniciando busca automática de dados a cada ${FETCH_INTERVAL_MS / 1000} segundos...`);
            
            fetchAllData(); 
            setInterval(fetchAllData, FETCH_INTERVAL_MS); 
        });
    } catch (err) {
        console.error("❌ Falha crítica ao iniciar o servidor:", err);
        // eslint-disable-next-line no-undef
        process.exit(1);
    }
};

startServer();