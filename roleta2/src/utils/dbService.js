<<<<<<< HEAD
// dbService.js — Serviço de persistência de sinais
// ✅ NOVO: getNewSignalsSince para delta updates (endpoint /api/history-delta)
// 🔧 FIX: Aliases SQL unificados em todas as queries (timestamp, signalId, gameId)

import { query, transaction } from '../../db.js';
import { SOURCES } from './constants.js';
import { cacheAside, cacheDel, KEY, TTL } from '../../redisService.js';

export const loadAllExistingSignalIds = async () => {};


=======
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
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
export const saveNewSignals = async (dataArray, sourceName) => {
  if (!SOURCES.includes(sourceName)) {
    console.error(`❌ Fonte desconhecida "${sourceName}".`);
    return 0;
  }

  if (!dataArray?.length) return 0;

  // Filtra registros válidos antes de qualquer I/O
  const validItems = dataArray.filter(item => item?.signalId);
  if (validItems.length === 0) return 0;

  try {
    // Monta batch INSERT com parâmetros numerados
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const item of validItems) {
      const signalId = String(item.signalId).trim();
      const gameId = String(item.gameId || '').trim();
      const signal = String(item.signal || '').trim();

      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
      values.push(signalId, gameId, signal, sourceName);
      paramIndex += 4;
    }

    const sql = `
      INSERT INTO signals (signalId, gameId, signal, source)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (signalId, source) DO NOTHING
    `;

    const result = await query(sql, values);
    const saved = result.rowCount || 0;

    if (saved > 0) {
        await Promise.all([
          cacheDel(KEY.history(sourceName)),
          cacheDel(KEY.latest(sourceName, 50)),
          cacheDel(KEY.latest(sourceName, 100)),
          cacheDel(KEY.latest(sourceName, 300)),
          cacheDel(KEY.latest(sourceName, 500)),
          cacheDel(KEY.latest(sourceName, 1000)),
        ]);
      }

    return saved;
  } catch (err) {
    console.error(`❌ [saveNewSignals] ${sourceName}:`, err.message);
    return 0;
  }
};

<<<<<<< HEAD
/**
 * ✅ Full history com cache-aside
 * Cache: 10s TTL (polling do front é 5s, no máx 2 ciclos stale)
 *
 * 🔧 FIX: Aliases com aspas duplas para preservar camelCase no retorno.
 *    PG sem aspas retorna tudo lowercase (signalid, gameid).
 *    O frontend espera: { timestamp, signalId, gameId, signal }
 */
export const getFullHistory = async (sourceName) => {
=======
// ═══════════════════════════════════════════════════════════════
// FULL HISTORY — Read-through: Redis → Memory → PostgreSQL
// ⚡ v2: Com stampede protection (apenas 1 query ao PG por vez)
// ═══════════════════════════════════════════════════════════════
export const getFullHistory = async (sourceName, limit = 5000) => {
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
  if (!SOURCES.includes(sourceName)) {
    throw new Error(`Fonte "${sourceName}" não reconhecida.`);
  }

<<<<<<< HEAD
  return cacheAside(
    KEY.history(sourceName),
    TTL.FULL_HISTORY,
    async () => {
      const { rows } = await query(
        `SELECT timestamp,
                signalid AS "signalId",
                gameid   AS "gameId",
                signal
         FROM signals
         WHERE source = $1
         ORDER BY timestamp DESC
         LIMIT 1000`,
        [sourceName]
      );
      return rows;
    }
  );
=======
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
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
};

/**
 * ✅ Latest spins com cache-aside
 *
 * 🔧 FIX: Mesmos aliases de getFullHistory — retorna camelCase consistente.
 *    Antes: signalId AS signalid (lowercase redundante) → agora: signalid AS "signalId"
 */
export const getLatestSpins = async (sourceName, limit = 100) => {
  if (!SOURCES.includes(sourceName)) {
    throw new Error(`Fonte "${sourceName}" não reconhecida.`);
  }

  return cacheAside(
    KEY.latest(sourceName, limit),
    TTL.LATEST_SPINS,
    async () => {
      const { rows } = await query(
        `SELECT timestamp,
                signalid AS "signalId",
                gameid   AS "gameId",
                signal
         FROM signals
         WHERE source = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [sourceName, limit]
      );
      return rows;
    }
  );
};

// ══════════════════════════════════════════════════════════════
// ✅ Delta updates — retorna apenas sinais mais novos
// que o lastSignalId fornecido pelo frontend.
//
// Usa o campo `id` (serial auto-increment) como cursor eficiente.
// Cache de 5s no Redis para evitar queries repetidas no mesmo ciclo.
//
// 🔧 FIX: Retorna mesmas colunas/aliases que getFullHistory:
//    - timestamp já é o nome real da coluna (não existe created_at)
//    - signalid   → AS "signalId" (antes: signalid lowercase)
//    - gameid     → AS "gameId"   (antes: gameid lowercase)
//    - removido 'source' do SELECT (frontend não usa, evita payload extra)
//
// REQUISITO: rodar no PostgreSQL uma vez:
//   CREATE INDEX IF NOT EXISTS idx_signals_source_signalid
//     ON signals(source, signalid);
//   CREATE INDEX IF NOT EXISTS idx_signals_source_id
//     ON signals(source, id DESC);
// ══════════════════════════════════════════════════════════════

export const getNewSignalsSince = async (sourceName, lastSignalId) => {
  if (!SOURCES.includes(sourceName)) return [];
  if (!lastSignalId) return [];

  const cacheKey = `delta:${sourceName}:${lastSignalId}`;

  return cacheAside(cacheKey, 5, async () => {
    const sql = `
      SELECT signalid   AS "signalId",
             gameid     AS "gameId",
             signal,
             timestamp
      FROM signals
      WHERE source = $1
        AND id > COALESCE(
          (SELECT id FROM signals WHERE source = $1 AND signalid = $2 LIMIT 1),
          0
        )
      ORDER BY id DESC
      LIMIT 100
    `;

    const result = await query(sql, [sourceName, lastSignalId]);
    return result.rows;
  });
};