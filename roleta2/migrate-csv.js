import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import { finished } from 'stream/promises';

// Importe suas funções e constantes
import { SOURCES } from './src/utils/constants.js';
import { saveNewSignals } from './src/utils/dbService.js';
import pool from './db.js'; // Importe o pool para fechá-lo no final

// --- Configuração de Caminhos ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Retorna o caminho do arquivo CSV (assumindo que estão na raiz).
 * * ATENÇÃO: O seu 'csvService.js' original subia dois níveis ('..', '..').
 * Isso sugere que seus CSVs estão na pasta raiz (ex: /roleta3/api_data_immersive.csv).
 * Se for esse o caso, este caminho está CORRETO.
 */
const get_csv_path = (sourceName) => {
    // Se seus CSVs estiverem em outro lugar, ajuste este caminho
    return path.join(__dirname, `api_data_${sourceName}.csv`);
};

/**
 * Lê um arquivo CSV e retorna um array de dados.
 */
const readCsvFile = (filePath) => {
    const data = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
        .pipe(csv())
        .on('data', (row) => {
            if (row.signalId && row.signalId.trim()) {
                data.push({
                    signalId: row.signalId.trim(),
                    gameId: row.gameId?.trim() || '',
                    signal: row.signal?.trim() || ''
                });
            }
        });
    
    return finished(stream).then(() => data);
};

/**
 * Função principal da migração
 */
async function runMigration() {
    console.log('--- 🚀 INICIANDO MIGRAÇÃO DOS DADOS CSV PARA POSTGRESQL ---');
    let totalMigrado = 0;

    for (const source of SOURCES) {
        console.log(`\n[Processando fonte: ${source}]`);
        const csvFilePath = get_csv_path(source);

        if (!fs.existsSync(csvFilePath)) {
            console.log(` ⚠️ Arquivo não encontrado, pulando: ${csvFilePath}`);
            continue;
        }

        try {
            const oldData = await readCsvFile(csvFilePath);
            
            if (oldData.length === 0) {
                console.log(' ✅ Arquivo vazio ou sem dados válidos.');
                continue;
            }

            console.log(` 📄 Encontrados ${oldData.length} registros no CSV.`);
            
            // Reutiliza sua função de salvar!
            // Ela vai salvar os dados e o log dela informará quantos são NOVOS.
            await saveNewSignals(oldData, source);
            totalMigrado += oldData.length;

        } catch (err) {
            console.error(` ❌ Erro ao processar o arquivo ${csvFilePath}:`, err);
        }
    }

    console.log('\n--- ✨ MIGRAÇÃO CONCLUÍDA ---');
    console.log(` 👍 ${totalMigrado} registros totais lidos dos arquivos CSV.`);
    console.log('Verifique os logs acima (💾) para ver quantos foram inseridos (novos).');
    
    // Encerra o pool de conexão para o script terminar
    await pool.end();
    console.log('Conexão com o banco de dados encerrada.');
}

// Executa o script
runMigration().catch(err => {
    console.error('❌ ERRO CRÍTICO NA MIGRAÇÃO:', err);
    process.exit(1);
});