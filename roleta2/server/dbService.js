import { query } from './db.js';
import { SOURCES } from './constants.js';
import { cacheAside, cacheDel, KEY, TTL } from './redisService.js';

export const loadAllExistingSignalIds = async () => {};

// Janela de dedup por CONTEÚDO: o mesmo número, na mesma fonte, dentro deste
// intervalo é tratado como o MESMO giro físico reenviado. Necessário porque o
// signalId é gerado a cada fetch (signal:<ts>:<random>), então o ON CONFLICT por
// signalId não pega o caso de duplicação. Numa roleta real os giros ficam a
// ~30-60s, então um número repetido em <20s é praticamente sempre duplicata.
// Configurável via env (0 desliga o dedup por conteúdo).
const DEDUP_WINDOW_SEC = Number.isFinite(Number(process.env.SIGNAL_DEDUP_WINDOW_SEC))
  ? Number(process.env.SIGNAL_DEDUP_WINDOW_SEC)
  : 20;

export const saveNewSignals = async (dataArray, sourceName) => {
  if (!SOURCES.includes(sourceName)) {
    console.error(`❌ Fonte desconhecida "${sourceName}".`);
    return 0;
  }
  if (!dataArray?.length) return 0;

  const validItems = dataArray.filter(item => item?.signalId);
  if (validItems.length === 0) return 0;

  try {
    let saved = 0;

    for (const item of validItems) {
      // Insere SÓ se não existir, na mesma fonte, o MESMO número dentro da janela
      // de dedup — descarta o mesmo giro físico reenviado com signalId novo.
      // (Statement autocommit → o item anterior do lote já conta para o NOT EXISTS.)
      const result = await query(
        `INSERT INTO signals (signalId, gameId, signal, source)
         SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar
         WHERE $5::int <= 0 OR NOT EXISTS (
           SELECT 1 FROM signals
           WHERE source = $4::varchar
             AND signal = $3::varchar
             AND signal <> ''
             AND timestamp > (NOW()::timestamp - make_interval(secs => $5::int))
         )
         ON CONFLICT (signalId, source) DO NOTHING`,
        [
          String(item.signalId).trim(),
          String(item.gameId  || '').trim(),
          String(item.signal  || '').trim(),
          sourceName,
          DEDUP_WINDOW_SEC,
        ],
      );
      saved += result.rowCount || 0;
    }

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
