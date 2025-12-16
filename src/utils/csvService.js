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
export const SOURCES = [
    'immersive', 
    'brasileira',           // A Antiga
    'Brasileira PlayTech',  // A Nova (Com Socket)
    'default', 
    'speed', 
    'xxxtreme', 
    'vipauto'
];

// --- Estado em Memória ---
const existingSignalIds = {};

// --- Funções Privadas ---

/**
 * Mapeia o nome da fonte para o nome físico do arquivo.
 */
const resolveFilename = (sourceName) => {
    // Separação total:
    if (sourceName === 'Brasileira PlayTech') return 'brasileiraplay'; // Salva em api_data_brasileiraplay.csv
    // 'brasileira' vai retornar 'brasileira' e salvar em api_data_brasileira.csv (como era antes)
    return sourceName;
};

const get_csv_path = (sourceName) => {
    const fileName = resolveFilename(sourceName);
    return path.join(__dirname, '..', '..', `api_data_${fileName}.csv`);
};

const ensureCsvExists = (sourceName) => {
    const fileName = resolveFilename(sourceName);
    const csvFilePath = get_csv_path(sourceName);
    const dir = path.dirname(csvFilePath);
    
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (err) { process.exit(1); }
    }

    if (!fs.existsSync(csvFilePath)) {
        try { fs.writeFileSync(csvFilePath, CSV_HEADER, 'utf8'); } catch (err) { process.exit(1); }
    }
};

// --- Funções Exportadas ---

export const loadAllExistingSignalIds = async () => {
    console.log('📄 Carregando IDs de sinais existentes...');
    
    // Identifica arquivos únicos para carregar
    const uniqueFiles = [...new Set(SOURCES.map(s => resolveFilename(s)))];

    for (const fileName of uniqueFiles) {
        ensureCsvExists(fileName); 
        existingSignalIds[fileName] = new Set();
        
        const csvFilePath = get_csv_path(fileName);
        const stream = fs.createReadStream(csvFilePath, { encoding: 'utf8' }).pipe(csv());
        
        stream.on('data', (row) => {
            if (row.signalId && row.signalId.trim()) {
                existingSignalIds[fileName].add(row.signalId.trim());
            }
        });

        stream.on('error', (err) => {
            console.error(`❌ Erro ao carregar IDs do arquivo ${fileName}:`, err);
        });
        
        await finished(stream); 
    }
    console.log(`✅ IDs carregados de ${uniqueFiles.length} arquivos físicos.`);
};

export const appendToCsv = (dataArray, sourceName) => {
    if (!SOURCES.includes(sourceName)) return;
    
    const fileSourceName = resolveFilename(sourceName);
    ensureCsvExists(fileSourceName); 
    const csvFilePath = get_csv_path(fileSourceName);
    
    if (!dataArray || dataArray.length === 0) return;

    try {
        const currentSet = existingSignalIds[fileSourceName] || new Set();

        const newRecords = dataArray.filter(item => {
            if (!item || !item.signalId) return false;
            return !currentSet.has(String(item.signalId).trim());
        });

        if (newRecords.length === 0) return;

        const csvRows = newRecords
            .map(item => {
                const timestamp = new Date().toISOString();
                const signalId = String(item.signalId).trim();
                const gameId = String(item.gameId || '').trim();
                const signal = String(item.signal || '').trim();
                return `${timestamp},${signalId},${gameId},${signal}`;
            })
            .join('\n') + '\n';

        fs.appendFileSync(csvFilePath, csvRows, 'utf8');
        
        newRecords.forEach(item => {
            currentSet.add(String(item.signalId).trim());
        });

        // console.log(`\x1b[32m[${sourceName}] 💾 ${newRecords.length} salvos em ${fileSourceName}.csv\x1b[0m`);
    } catch (err) {
        console.error(`❌ Erro escrita CSV ${fileSourceName}:`, err);
    }
};

export const getFullHistory = (sourceName) => {
    return new Promise((resolve, reject) => {
        if (!SOURCES.includes(sourceName)) return reject(new Error(`Fonte inválida`));
        
        const fileSourceName = resolveFilename(sourceName);
        ensureCsvExists(fileSourceName);
        const csvFilePath = get_csv_path(fileSourceName);

        if (!fs.existsSync(csvFilePath)) return resolve([]);

        const results = [];
        fs.createReadStream(csvFilePath, { encoding: 'utf8' })
            .pipe(csv())
            .on('data', data => {
                if (data.signalId) results.push(data);
            })
            .on('end', () => resolve(results.reverse()))
            .on('error', err => reject(err));
    });
};