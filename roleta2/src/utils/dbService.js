// dbService.js — ⚡ OTIMIZADO COM REDIS v2: Stampede protection + Cache unificado
//
// MUDANÇAS v2:
//   ✅ Stampede protection em getFullHistory e getLatest (evita thundering herd)
//   ✅ getLatest centralizado (antes a lógica ficava duplicada no server.js)
//   ✅ Memory cache com TTL alinhado ao Redis (8s → 8s, não 3s vs 8s)
//   ✅ Memory cache desabilitado quando Redis está online (evita inconsistência)
//   ✅ invalidateCache agora é sync-safe e limpa ambas camadas
//
import { query } from '../../db.js';
import { SOURCES } from './constants.js';
import {
  getCachedFullHistory,
  setCachedFullHistory,
  getCachedLatest,
  setCachedLatest,
  invalidateSourceCache,
  withStampedeProtection,
} from '../../redisCache.js';
import { isRedisReady } from '../../redisClient.js';

// ═══════════════════════════════════════════════════════════════
// FALLBACK: Cache em memória (SOMENTE quando Redis está offline)
//
// v2: TTL alinhado com Redis (8s) para evitar inconsistência.
//     Desativado quando Redis está online — Redis é source of truth.
// ═══════════════════════════════════════════════════════════════
const memoryCache = new Map();
const MEMORY_TTL_MS = 8000; // v2: Alinhado com TTL.HISTORY do Redis

function getMemoryCache(key) {
  // v2: Só usa memória se Redis estiver offline
  if (isRedisReady()) return null;

  const cached = memoryCache.get(key);
  if (cached && (Date.now() - cached.ts) < MEMORY_TTL_MS) {
    return cached.data;
  }
  memoryCache.delete(key); // Limpa expirado
  return null;
}

function setMemoryCache(key, data) {
  memoryCache.set(key, { data, ts: Date.now() });

  // v2: Limpa entries antigas periodicamente (evita memory leak)
  if (memoryCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of memoryCache) {
      if (now - v.ts > MEMORY_TTL_MS) memoryCache.delete(k);
    }
  }
}

/**
 * Invalida cache de uma source (Redis + memória).
 * Fire-and-forget: não bloqueia o saveNewSignals.
 */
export const invalidateCache = (sourceName) => {
  // Limpa todas as keys de memória para esta source
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`hist:${sourceName}:`)) {
      memoryCache.delete(key);
    }
  }
  // Invalida Redis (async, fire-and-forget)
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
// ⚡ v2: Com stampede protection (apenas 1 query ao PG por vez)
// ═══════════════════════════════════════════════════════════════
export const getFullHistory = async (sourceName, limit = 5000) => {
  if (!SOURCES.includes(sourceName)) {
    throw new Error(`Fonte "${sourceName}" não reconhecida.`);
  }

  // ⚡ Camada 1: Redis (sub-milissegundo)
  const redisCached = await getCachedFullHistory(sourceName);
  if (redisCached) return redisCached;

  // ⚡ Camada 2: Memória local (só se Redis offline)
  const memKey = `hist:${sourceName}:full`;
  const memoryCached = getMemoryCache(memKey);
  if (memoryCached) return memoryCached;

  // Camada 3: PostgreSQL — COM STAMPEDE PROTECTION
  // Se 50 requests chegam ao mesmo tempo, só 1 vai ao PG.
  // Os outros 49 recebem o mesmo resultado.
  return withStampedeProtection(`hist:full:${sourceName}`, async () => {
    // Double-check: talvez outro request já populou o cache
    const recheckRedis = await getCachedFullHistory(sourceName);
    if (recheckRedis) return recheckRedis;

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
      setMemoryCache(memKey, rows);
      setCachedFullHistory(sourceName, rows).catch(() => {});

      return rows;
    } catch (err) {
      console.error(`❌ Erro ao ler histórico de ${sourceName}:`, err);
      throw err;
    }
  });
};

// ═══════════════════════════════════════════════════════════════
// ⚡ v2: GET LATEST — Centralizado (antes ficava duplicado no server.js)
// Read-through: Redis → Memory → PostgreSQL (com stampede protection)
// ═══════════════════════════════════════════════════════════════
export const getLatest = async (sourceName, limit = 100) => {
  if (!SOURCES.includes(sourceName)) {
    throw new Error(`Fonte "${sourceName}" não reconhecida.`);
  }

  // ⚡ Camada 1: Redis
  const redisCached = await getCachedLatest(sourceName, limit);
  if (redisCached) return redisCached;

  // ⚡ Camada 2: Memória (só se Redis offline)
  const memKey = `hist:${sourceName}:latest:${limit}`;
  const memoryCached = getMemoryCache(memKey);
  if (memoryCached) return memoryCached;

  // Camada 3: PostgreSQL — COM STAMPEDE PROTECTION
  return withStampedeProtection(`hist:latest:${sourceName}:${limit}`, async () => {
    // Double-check
    const recheckRedis = await getCachedLatest(sourceName, limit);
    if (recheckRedis) return recheckRedis;

    const selectQuery = `
      SELECT timestamp, signalId AS signalid, gameId AS gameid, signal
      FROM signals
      WHERE source = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `;

    try {
      const { rows } = await query(selectQuery, [sourceName, limit]);

      // Write-through
      setMemoryCache(memKey, rows);
      setCachedLatest(sourceName, limit, rows).catch(() => {});

      return rows;
    } catch (err) {
      console.error(`❌ Erro ao ler latest de ${sourceName}:`, err);
      throw err;
    }
  });
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