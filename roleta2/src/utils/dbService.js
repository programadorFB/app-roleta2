// dbService.js — Serviço de persistência de sinais
// ✅ NOVO: getNewSignalsSince para delta updates (endpoint /api/history-delta)
// 🔧 FIX: Aliases SQL unificados em todas as queries (timestamp, signalId, gameId)

import { query, transaction } from '../../db.js';
import { SOURCES } from './constants.js';
import { cacheAside, cacheDel, KEY, TTL } from '../../redisService.js';

export const loadAllExistingSignalIds = async () => {};


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

/**
 * ✅ Full history com cache-aside
 * Cache: 10s TTL (polling do front é 5s, no máx 2 ciclos stale)
 *
 * 🔧 FIX: Aliases com aspas duplas para preservar camelCase no retorno.
 *    PG sem aspas retorna tudo lowercase (signalid, gameid).
 *    O frontend espera: { timestamp, signalId, gameId, signal }
 */
export const getFullHistory = async (sourceName) => {
  if (!SOURCES.includes(sourceName)) {
    throw new Error(`Fonte "${sourceName}" não reconhecida.`);
  }

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
// Usa o campo `timestamp` como cursor (índice já existente).
// Cache de 5s no Redis para evitar queries repetidas no mesmo ciclo.
//
// Índices usados (já existem na tabela):
//   - idx_signals_source_timestamp (source, timestamp DESC)
//   - idx_signals_source_signalid  (source, signalid)
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
        AND timestamp > COALESCE(
          (SELECT timestamp FROM signals WHERE source = $1 AND signalid = $2 LIMIT 1),
          '-infinity'::timestamptz
        )
      ORDER BY timestamp DESC
      LIMIT 100
    `;

    const result = await query(sql, [sourceName, lastSignalId]);
    return result.rows;
  });
};