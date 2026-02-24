// dbService.js
import { query, transaction } from '../../db.js';
import { SOURCES } from './constants.js';

export const loadAllExistingSignalIds = async () => {
    console.log('✅ [DB Service] Conectado ao Banco de Dados.');
    return Promise.resolve();
};

export const saveNewSignals = async (dataArray, sourceName) => {
    // Validação de Segurança: Só aceita se a fonte estiver no constants.js
    if (!SOURCES.includes(sourceName)) {
        console.error(`❌ Fonte desconhecida "${sourceName}". Não é possível salvar.`);
        return;
    }
    
    if (!dataArray || dataArray.length === 0) return;

    let newRecordsSaved = 0;

    try {
        await transaction(async (client) => {
            // SQL PADRÃO (Sem a coluna croupier)
            // O timestamp é gerado automaticamente pelo banco (NOW) ou usa default
            const insertQuery = `
                INSERT INTO signals (signalId, gameId, signal, source)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (signalId, source) DO NOTHING;
            `;

            for (const item of dataArray) {
                if (!item || !item.signalId) continue;
                
                const signalId = String(item.signalId).trim();
                const gameId = String(item.gameId || '').trim();
                const signal = String(item.signal || '').trim();

                // Executa a query ignorando o campo 'croupier' que vem do Python
                const res = await client.query(insertQuery, [signalId, gameId, signal, sourceName]);
                
                if (res.rowCount > 0) {
                    newRecordsSaved++;
                }
            }
        });

        if (newRecordsSaved > 0) {
            console.log(`\x1b[32m[${sourceName}] 💾 ${newRecordsSaved} novos sinais salvos no DB.\x1b[0m`);
        }

    } catch (err) {
         console.error(`❌ Erro ao escrever no DB para ${sourceName}:`, err);
    }
};

// ⚡⚡ CORREÇÃO DE PERFORMANCE AQUI ⚡⚡
// Adicionado parâmetro 'limit' com valor padrão de 2000
export const getFullHistory = async (sourceName, limit = 5000) => {
    if (!SOURCES.includes(sourceName)) {
        throw new Error(`Fonte "${sourceName}" não reconhecida.`);
    }

    // Busca apenas as colunas que existem
    // ADICIONADO: LIMIT $2 para evitar travar o servidor com milhões de registros
    const selectQuery = `
        SELECT timestamp, signalId, gameId, signal
        FROM signals
        WHERE source = $1
        ORDER BY timestamp DESC
        LIMIT $2; 
    `;
    
    try {
        // Passamos o 'limit' como segundo parâmetro para a query
        const { rows } = await query(selectQuery, [sourceName, limit]);
        return rows;
    } catch (err) {
        console.error(`❌ Erro ao ler histórico de ${sourceName}:`, err);
        throw err;
    }
};