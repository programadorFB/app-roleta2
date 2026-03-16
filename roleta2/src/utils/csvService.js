import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import { finished } from 'stream/promises';

// --- Configuração de Caminhos e Constantes ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_HEADER = 'timestamp,signalId,gameId,signal\n';

// Nomes das fontes de dados
// ADICIONADAS AS NOVAS FONTES: speed, xxxtreme, vipauto
export const SOURCES = [
    'immersive', 'brasileira', 'default', 'speed', 'xxxtreme', 'vipauto', 'immersivevip',
    'auto', 'macau', 'footballstudio', 'vip', 'lightning', 'rapida2', 
    'blazemega', 'aovivo', 'speedauto', 'lucky6', 'azure', 'romena', 
    'hippodrome', 'verde', 'ruby', 'viproulette', 'relampago', 'russa', 
    'turca', 'espanhola', 'malta', 'mega', 'italiana', 'powerup', 
    'roulette', 'grandcasino', 'alema', 'rapida1', 'salonprive'
];

// --- Estado em Memória ---
// Agora armazena um Set de IDs para cada fonte
const existingSignalIds = {};

// --- Funções Privadas ---

/**
 * Retorna o caminho do arquivo CSV para uma fonte específica.
 * @param {string} sourceName - O nome da fonte (ex: 'immersive').
 * @returns {string} O caminho completo para o arquivo CSV.
 */
const get_csv_path = (sourceName) => {
    return path.join(__dirname, '..', '..', `api_data_${sourceName}.csv`);
};

const ensureCsvExists = (sourceName) => {
    const csvFilePath = get_csv_path(sourceName);
    const dir = path.dirname(csvFilePath);
    
    // Garante que o diretório existe
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            // console.log(`📁 Diretório criado: ${dir}`);
        } catch (err) {
            console.error('❌ Erro ao criar diretório:', err);
            process.exit(1);
        }
    }

    // Garante que o arquivo CSV existe
    if (!fs.existsSync(csvFilePath)) {
        try {
            fs.writeFileSync(csvFilePath, CSV_HEADER, 'utf8');
            // console.log(`🆕 Novo arquivo CSV criado: ${csvFilePath}`);
        } catch (err) {
            console.error(`❌ Erro CRÍTICO ao criar arquivo CSV para ${sourceName}:`, err);
            process.exit(1);
        }
    }
};

// --- Funções Exportadas ---

/**
 * Carrega todos os signalIds de todos os arquivos CSV para a memória na inicialização.
 */
export const loadAllExistingSignalIds = async () => {
    console.log('📄 Carregando IDs de sinais existentes de todos os CSVs...');
    
    for (const source of SOURCES) {
        ensureCsvExists(source); // Garante que o arquivo exista
        existingSignalIds[source] = new Set(); // Inicializa o Set para a fonte
        const csvFilePath = get_csv_path(source);

        // console.log(`   -> Lendo ${csvFilePath}...`);
        
        const stream = fs.createReadStream(csvFilePath, { encoding: 'utf8' }).pipe(csv());
        
        stream.on('data', (row) => {
            if (row.signalId && row.signalId.trim()) {
                existingSignalIds[source].add(row.signalId.trim());
            }
        });

        stream.on('error', (err) => {
            console.error(`❌ Erro ao carregar IDs de ${source}:`, err);
            // Continua para a próxima fonte
        });
        
        await finished(stream); // Espera o stream terminar antes de ir para o próximo
        // console.log(`📊 ${existingSignalIds[source].size} IDs carregados para a fonte: ${source}.`);
    }
    console.log('✅ Todos os IDs de sinais carregados para a memória.');
};

/**
 * Recebe um array de dados da API, filtra por registros novos e os anexa ao CSV correto.
 * @param {Array} dataArray - O array de dados da API.
 * @param {string} sourceName - O nome da fonte para salvar o CSV.
 */
export const appendToCsv = (dataArray, sourceName) => {
    if (!SOURCES.includes(sourceName)) {
        console.error(`❌ Fonte desconhecida "${sourceName}". Não é possível salvar.`);
        return;
    }
    
    ensureCsvExists(sourceName); // Garante que o arquivo existe antes de escrever
    const csvFilePath = get_csv_path(sourceName);
    
    if (!dataArray || dataArray.length === 0) {
        console.log(`[${sourceName}] ⏸ Nenhuma informação recebida da API para processar.`);
        return;
    }

    // console.log(`[${sourceName}] 📥 Recebido(s) ${dataArray.length} registro(s). Verificando por novidades...`);

    try {
        // Filtra registros novos e valida dados
        const newRecords = dataArray.filter(item => {
            if (!item || !item.signalId) {
                console.warn(`[${sourceName}] ⚠️ Registro inválido encontrado, pulando:`, item);
                return false;
            }
            const isDuplicate = existingSignalIds[sourceName].has(String(item.signalId).trim());
            return !isDuplicate;
        });

        if (newRecords.length === 0) {
            // console.log(`[${sourceName}] ✅ Nenhum sinal novo para adicionar. Todos já existem no CSV.`);
            return;
        }

        // Monta as linhas do CSV
        const csvRows = newRecords
            .map(item => {
                const timestamp = new Date().toISOString();
                const signalId = String(item.signalId).trim();
                const gameId = String(item.gameId || '').trim();
                const signal = String(item.signal || '').trim();
                return `${timestamp},${signalId},${gameId},${signal}`;
            })
            .join('\n') + '\n';

        // Escreve no arquivo
        fs.appendFileSync(csvFilePath, csvRows, 'utf8');
        
        // Atualiza o Set em memória
        newRecords.forEach(item => {
            existingSignalIds[sourceName].add(String(item.signalId).trim());
        });

        console.log(`\x1b[32m[${sourceName}] 💾 ${newRecords.length} novo(s) sinal(is) salvo(s) com sucesso!\x1b[0m`);
        console.log(`   📍 Arquivo: ${csvFilePath}`);
    } catch (err) {
        console.error(`❌ Erro ao escrever os novos dados no arquivo CSV para ${sourceName}:`, err);
    }
};

/**
 * Lê todo o conteúdo do arquivo CSV de uma fonte específica e o retorna como um array de objetos.
 * @param {string} sourceName - O nome da fonte.
 */
export const getFullHistory = (sourceName) => {
    return new Promise((resolve, reject) => {
        if (!SOURCES.includes(sourceName)) {
            // console.error(`  [DIAGNÓSTICO] Fonte "${sourceName}" não reconhecida.`);
            return reject(new Error(`Fonte "${sourceName}" não reconhecida.`));
        }
        
        ensureCsvExists(sourceName);
        const csvFilePath = get_csv_path(sourceName);

        if (!fs.existsSync(csvFilePath)) {
            // console.log(`  [DIAGNÓSTICO] O arquivo CSV ${csvFilePath} não existe. Retornando array vazio.`);
            return resolve([]);
        }

        const results = [];
        fs.createReadStream(csvFilePath, { encoding: 'utf8' })
            .pipe(csv())
            .on('data', data => {
                if (data.signalId) {
                    results.push({
                        timestamp: data.timestamp,
                        signalId: data.signalId,
                        gameId: data.gameId,
                        signal: data.signal
                    });
                }
            })
            .on('end', () => {
                // console.log(`  [DIAGNÓSTICO] Leitura do CSV ${csvFilePath} concluída. ${results.length} registros encontrados.`);
                resolve(results.reverse());
            })
            .on('error', err => {
                console.error(`❌ Erro ao ler o arquivo CSV ${csvFilePath}:`, err);
                reject(err);
            });
    });
};