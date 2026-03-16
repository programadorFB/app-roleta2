// triggerScoreEngine.js — Motor de scoring de TRIGGERS rodando no backend
// Monitora TODAS as mesas passivamente: detecta gatilhos, checa resultados, persiste placar.

import { buildTriggerMap } from './src/services/triggerAnalysis.js';
import { getFullHistory } from './src/utils/dbService.js';
import { query } from './db.js';
import { getRouletteColor as getColor } from './src/constants/roulette.js';

const TRIGGER_LOSS_THRESHOLD = 3; // 3 spins pra resolver (igual frontend)

function dbRowToSpin(row) {
  const num = parseInt(row.signal, 10);
  return {
    number: isNaN(num) ? 0 : num,
    color: getColor(isNaN(num) ? 0 : num),
    signal: row.signal,
    signalId: row.signalId,
    gameId: row.gameId,
    date: row.timestamp,
  };
}

// Estado em memória por source
const lastProcessedId = {};
// Cache do triggerMap por source (reconstruído quando novos dados chegam)
const triggerMapCache = {};

/**
 * Processa triggers de uma source: detecta gatilhos, checa pendentes, persiste placar.
 */
export async function processTriggerSource(sourceName) {
  try {
    const history = await getFullHistory(sourceName);
    if (!history || history.length < 80) return;

    const spinHistory = history.map(dbRowToSpin);

    const latestId = spinHistory[0].signalId;
    if (latestId === lastProcessedId[sourceName]) return;

    let newSpinNumbers = [];
    const prevId = lastProcessedId[sourceName];
    lastProcessedId[sourceName] = latestId;

    if (prevId) {
      for (let i = 0; i < spinHistory.length; i++) {
        if (spinHistory[i].signalId === prevId) break;
        newSpinNumbers.push(spinHistory[i].number);
      }
      newSpinNumbers.reverse(); // cronológico
    }

    // Reconstrói trigger map (usa cache inteligente)
    const triggerMap = buildTriggerMap(spinHistory, 2000);
    triggerMapCache[sourceName] = triggerMap;

    // Processa spins novos
    if (newSpinNumbers.length > 0) {
      await checkAndRegisterTriggers(sourceName, newSpinNumbers, triggerMap);
    }
  } catch (err) {
    console.error(`[Trigger ${sourceName}] Erro:`, err.message);
  }
}

async function checkAndRegisterTriggers(source, numbers, triggerMap) {
  // 1. Busca sinais pendentes
  const { rows: pending } = await query(
    'SELECT id, trigger_number, covered_numbers, spins_after FROM trigger_pending_signals WHERE source = $1 AND resolved = FALSE',
    [source]
  );

  const toResolve = [];
  let batchWins = 0;
  let batchLosses = 0;
  const newTriggers = [];

  for (const num of numbers) {
    if (typeof num !== 'number' || num < 0 || num > 36) continue;

    // 1a. Confere num contra cada sinal pendente
    for (const sig of pending) {
      if (toResolve.some(r => r.id === sig.id)) continue;

      sig.spins_after++;

      if (sig.covered_numbers.includes(num)) {
        toResolve.push({ id: sig.id, result: 'win' });
        batchWins++;
        console.log(`[Trigger ${source}] WIN trigger=${sig.trigger_number} num=${num} covered=[${sig.covered_numbers.join(',')}]`);
        continue;
      }

      if (sig.spins_after >= TRIGGER_LOSS_THRESHOLD) {
        toResolve.push({ id: sig.id, result: 'loss' });
        batchLosses++;
        console.log(`[Trigger ${source}] LOSS trigger=${sig.trigger_number} after ${sig.spins_after} spins`);
      }
    }

    // 1b. Checa se ESTE num é um trigger → registra novo sinal pendente
    const profile = triggerMap.get(num);
    if (profile?.bestPattern) {
      newTriggers.push({ num, covered: profile.bestPattern.coveredNumbers, label: profile.bestPattern.label });
    }
  }

  // Batch: flush wins/losses em uma única query cada
  if (batchWins > 0) {
    await query(
      `INSERT INTO trigger_scores (source, wins, losses, updated_at)
       VALUES ($1, $2, 0, NOW())
       ON CONFLICT (source)
       DO UPDATE SET wins = trigger_scores.wins + $2, updated_at = NOW()`,
      [source, batchWins]
    );
  }
  if (batchLosses > 0) {
    await query(
      `INSERT INTO trigger_scores (source, wins, losses, updated_at)
       VALUES ($1, 0, $2, NOW())
       ON CONFLICT (source)
       DO UPDATE SET losses = trigger_scores.losses + $2, updated_at = NOW()`,
      [source, batchLosses]
    );
  }

  // Batch: insere novos triggers
  for (const t of newTriggers) {
    await query(
      'INSERT INTO trigger_pending_signals (source, trigger_number, covered_numbers) VALUES ($1, $2, $3)',
      [source, t.num, t.covered]
    );
    console.log(`[Trigger ${source}] Sinal registrado: trigger=${t.num} covered=[${t.covered.join(',')}] (${t.label})`);
  }

  // 2. Atualiza pendentes não resolvidos
  const resolvedIds = new Set(toResolve.map(r => r.id));
  for (const sig of pending) {
    if (!resolvedIds.has(sig.id)) {
      await query(
        'UPDATE trigger_pending_signals SET spins_after = $1 WHERE id = $2',
        [sig.spins_after, sig.id]
      );
    }
  }

  // 3. Marca resolvidos
  if (resolvedIds.size > 0) {
    await query(
      'UPDATE trigger_pending_signals SET resolved = TRUE WHERE id = ANY($1)',
      [[...resolvedIds]]
    );
  }

  // 4. Limpa sinais antigos resolvidos (mantém últimos 100 para debug)
  await query(
    `DELETE FROM trigger_pending_signals
     WHERE source = $1 AND resolved = TRUE
     AND id NOT IN (
       SELECT id FROM trigger_pending_signals
       WHERE source = $1 AND resolved = TRUE
       ORDER BY created_at DESC LIMIT 100
     )`,
    [source]
  );
}
