// dbService.js — ⚡ OTIMIZADO: Batch INSERT + Fetch Incremental + Cache
import { query, transaction } from '../../db.js';
import { SOURCES } from './constants.js';

// ═══════════════════════════════════════════════════════════════
// CACHE EM MEMÓRIA (evita queries repetidas no polling de 2-5s)
// ═══════════════════════════════════════════════════════════════
const historyCache = new Map(); // key: sourceName → { data, lastUpdated, latestSignalId }
const CACHE_TTL_MS = 3000; // 3s de TTL — polling do frontend é 5s

export const invalidateCache = (sourceName) => {
    historyCache.delete(sourceName);
};

export const loadAllExistingSignalIds = async () => {
    console.log('✅ [DB Service] Conectado ao Banco de Dados.');
    return Promise.resolve();
};

// ═══════════════════════════════════════════════════════════════
// BATCH INSERT — 1 query com VALUES múltiplos (antes: N queries)
// Ganho: ~10-50x menos roundtrips no DB por ciclo de scraping
// ═══════════════════════════════════════════════════════════════
export const saveNewSignals = async (dataArray, sourceName) => {
    if (!SOURCES.includes(sourceName)) {
        console.error(`❌ Fonte desconhecida "${sourceName}". Não é possível salvar.`);
        return;
    }
    if (!dataArray || dataArray.length === 0) return;

    const validItems = dataArray.filter(item => item && item.signalId);
    if (validItems.length === 0) return;

    try {
        const BATCH_SIZE = 500;
        let totalSaved = 0;

        for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
            const batch = validItems.slice(i, i + BATCH_SIZE);
            const values = [];
            const placeholders = [];

            batch.forEach((item, idx) => {
                const offset = idx * 4;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                values.push(
                    String(item.signalId).trim(),
                    String(item.gameId || '').trim(),
                    String(item.signal || '').trim(),
                    sourceName
                );
            });

            const batchQuery = `
                INSERT INTO signals (signalId, gameId, signal, source)
                VALUES ${placeholders.join(', ')}
                ON CONFLICT (signalId, source) DO NOTHING;
            `;
            const res = await query(batchQuery, values);
            totalSaved += (res.rowCount || 0);
        }

        if (totalSaved > 0) {
            console.log(`\x1b[32m[${sourceName}] 💾 ${totalSaved} novos sinais salvos (BATCH).\x1b[0m`);
            invalidateCache(sourceName);
        }
    } catch (err) {
        console.error(`❌ Erro ao escrever no DB para ${sourceName}:`, err);
    }
};

// ═══════════════════════════════════════════════════════════════
// FULL HISTORY — Com cache server-side (TTL 3s)
// ═══════════════════════════════════════════════════════════════
export const getFullHistory = async (sourceName, limit = 5000) => {
    if (!SOURCES.includes(sourceName)) {
        throw new Error(`Fonte "${sourceName}" não reconhecida.`);
    }

    const cached = historyCache.get(sourceName);
    if (cached && (Date.now() - cached.lastUpdated) < CACHE_TTL_MS) {
        return cached.data;
    }

    const selectQuery = `
        SELECT timestamp, signalId AS signalid, gameId AS gameid, signal
        FROM signals
        WHERE source = $1
        ORDER BY timestamp DESC
        LIMIT $2;
    `;

    try {
        const { rows } = await query(selectQuery, [sourceName, limit]);
        historyCache.set(sourceName, {
            data: rows,
            lastUpdated: Date.now(),
            latestSignalId: rows.length > 0 ? rows[0].signalid : null
        });
        return rows;
    } catch (err) {
        console.error(`❌ Erro ao ler histórico de ${sourceName}:`, err);
        throw err;
    }
};

// ═══════════════════════════════════════════════════════════════
// ⚡ NOVO: FETCH INCREMENTAL — Só registros NOVOS
// Payload cai de ~5000 rows → 0-5 rows por polling cycle
// ═══════════════════════════════════════════════════════════════
export const getHistorySince = async (sourceName, sinceTimestamp, limit = 200) => {
    if (!SOURCES.includes(sourceName)) {
        throw new Error(`Fonte "${sourceName}" não reconhecida.`);
    }

    if (!sinceTimestamp) {
        return getFullHistory(sourceName, limit);
    }

    const selectQuery = `
        SELECT timestamp, signalId AS signalid, gameId AS gameid, signal
        FROM signals
        WHERE source = $1
          AND timestamp > $2
        ORDER BY timestamp DESC
        LIMIT $3;
    `;

    try {
        const { rows } = await query(selectQuery, [sourceName, sinceTimestamp, limit]);
        return rows;
    } catch (err) {
        console.warn(`⚠️ Fallback para full-history: ${sourceName}`);
        return getFullHistory(sourceName, limit);
    }
};