// dbService.js — ⚡ OTIMIZADO COM REDIS: Read-through + Write-through Cache
import { query, transaction } from '../../db.js';
import { SOURCES } from './constants.js';
import {
  getCachedFullHistory,
  setCachedFullHistory,
  invalidateSourceCache,
} from '../../redisCache.js';

// ═══════════════════════════════════════════════════════════════
// FALLBACK: Cache em memória (usado se Redis estiver offline)
// ═══════════════════════════════════════════════════════════════
const memoryCache = new Map();
const MEMORY_TTL_MS = 3000;

function getMemoryCache(sourceName) {
  const cached = memoryCache.get(sourceName);
  if (cached && (Date.now() - cached.lastUpdated) < MEMORY_TTL_MS) {
    return cached.data;
  }
  return null;
}

function setMemoryCache(sourceName, data) {
  memoryCache.set(sourceName, { data, lastUpdated: Date.now() });
}

export const invalidateCache = (sourceName) => {
  memoryCache.delete(sourceName);
  // Fire-and-forget — não bloqueia o save
  invalidateSourceCache(sourceName).catch(() => {});
};

export const loadAllExistingSignalIds = async () => {
  console.log('✅ [DB Service] Conectado ao Banco de Dados.');
  return Promise.resolve();
};

// ═══════════════════════════════════════════════════════════════
// BATCH INSERT — Write-through: PG + invalidação Redis
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
      // ⚡ Invalida AMBOS caches (Redis + memória)
      invalidateCache(sourceName);
    }
  } catch (err) {
    console.error(`❌ Erro ao escrever no DB para ${sourceName}:`, err);
  }
};

// ═══════════════════════════════════════════════════════════════
// FULL HISTORY — Read-through: Redis → Memory → PostgreSQL
// ═══════════════════════════════════════════════════════════════
export const getFullHistory = async (sourceName, limit = 5000) => {
  if (!SOURCES.includes(sourceName)) {
    throw new Error(`Fonte "${sourceName}" não reconhecida.`);
  }

  // ⚡ Camada 1: Redis (sub-milissegundo)
  const redisCached = await getCachedFullHistory(sourceName);
  if (redisCached) return redisCached;

  // ⚡ Camada 2: Memória local (microssegundos, fallback se Redis offline)
  const memoryCached = getMemoryCache(sourceName);
  if (memoryCached) return memoryCached;

  // Camada 3: PostgreSQL (5-50ms)
  const selectQuery = `
    SELECT timestamp, signalId AS signalid, gameId AS gameid, signal
    FROM signals
    WHERE source = $1
    ORDER BY timestamp DESC
    LIMIT $2;
  `;

  try {
    const { rows } = await query(selectQuery, [sourceName, limit]);
    
    // Write-through: popula AMBOS caches
    setMemoryCache(sourceName, rows);
    setCachedFullHistory(sourceName, rows).catch(() => {}); // fire-and-forget

    return rows;
  } catch (err) {
    console.error(`❌ Erro ao ler histórico de ${sourceName}:`, err);
    throw err;
  }
};

// ═══════════════════════════════════════════════════════════════
// ⚡ FETCH INCREMENTAL — Só registros NOVOS (sem cache — payload é minúsculo)
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