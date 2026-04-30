import { query } from './db.js';
import { SOURCES } from './constants.js';
import { cacheAside, cacheDel, KEY, TTL } from './redisService.js';

export const loadAllExistingSignalIds = async () => {};

export const saveNewSignals = async (dataArray, sourceName) => {
  if (!SOURCES.includes(sourceName)) {
    console.error(`❌ Fonte desconhecida "${sourceName}".`);
    return 0;
  }
  if (!dataArray?.length) return 0;

  const validItems = dataArray.filter(item => item?.signalId);
  if (validItems.length === 0) return 0;

  try {
    const values = [];
    const placeholders = [];
    let p = 1;

    for (const item of validItems) {
      placeholders.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3})`);
      values.push(
        String(item.signalId).trim(),
        String(item.gameId  || '').trim(),
        String(item.signal  || '').trim(),
        sourceName,
      );
      p += 4;
    }

    const result = await query(
      `INSERT INTO signals (signalId, gameId, signal, source)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (signalId, source) DO NOTHING`,
      values,
    );

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

export const getFullHistory = async (sourceName) => {
  if (!SOURCES.includes(sourceName)) throw new Error(`Fonte "${sourceName}" não reconhecida.`);

  return cacheAside(KEY.history(sourceName), TTL.FULL_HISTORY, async () => {
    const { rows } = await query(
      `SELECT id,
              timestamp,
              signalid AS "signalId",
              gameid   AS "gameId",
              signal
       FROM signals
       WHERE source = $1
       ORDER BY timestamp DESC
       LIMIT 1000`,
      [sourceName],
    );
    return rows;
  });
};

export const getLatestSpins = async (sourceName, limit = 100) => {
  if (!SOURCES.includes(sourceName)) throw new Error(`Fonte "${sourceName}" não reconhecida.`);

  return cacheAside(KEY.latest(sourceName, limit), TTL.LATEST_SPINS, async () => {
    const { rows } = await query(
      `SELECT timestamp,
              signalid AS "signalId",
              gameid   AS "gameId",
              signal
       FROM signals
       WHERE source = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [sourceName, limit],
    );
    return rows;
  });
};

export const getNewSignalsSince = async (sourceName, lastSignalId) => {
  if (!SOURCES.includes(sourceName) || !lastSignalId) return [];

  const cacheKey = `delta:${sourceName}:${lastSignalId}`;

  return cacheAside(cacheKey, TTL.DELTA, async () => {
    const { rows } = await query(
      `SELECT signalid AS "signalId",
              gameid   AS "gameId",
              signal,
              timestamp
       FROM signals
       WHERE source = $1
         AND id > COALESCE(
           (SELECT id FROM signals WHERE source = $1 AND signalid = $2 LIMIT 1),
           0
         )
       ORDER BY id DESC
       LIMIT 100`,
      [sourceName, lastSignalId],
    );
    return rows;
  });
};
