// motorScoreEngine.js — Motor de scoring rodando no backend
// Monitora TODAS as mesas passivamente e mantém placar no DB.
// Importa lógica pura de análise dos serviços existentes do frontend.

import { calculateMasterScore } from './src/services/masterScoring.js';
import { getFullHistory } from './src/utils/dbService.js';
import { query } from './db.js';
import { PHYSICAL_WHEEL, getRouletteColor as getColor } from './src/constants/roulette.js';

const LOSS_THRESHOLD = 2;

const WHEEL = PHYSICAL_WHEEL;

function getCovered(nums, mode) {
  if (mode === 0) return nums;
  const s = new Set();
  nums.forEach(n => {
    s.add(n);
    const idx = WHEEL.indexOf(n);
    for (let i = 1; i <= mode; i++) {
      s.add(WHEEL[(idx + i) % 37]);
      s.add(WHEEL[(idx - i + 37) % 37]);
    }
  });
  return [...s];
}

// Converte row do DB para o formato que masterScoring espera
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

// Estado em memória: último signalId processado por source
const lastProcessedId = {};
// Último sinal registrado por source (evita duplicatas)
const lastRegisteredKey = {};

// Batch: acumula incrementos em memória, faz flush de uma vez
const pendingIncrements = new Map(); // key: "source:mode" → { wins: N, losses: N }

function queueIncrement(source, mode, field) {
  const key = `${source}:${mode}`;
  if (!pendingIncrements.has(key)) pendingIncrements.set(key, { source, mode, wins: 0, losses: 0 });
  pendingIncrements.get(key)[field]++;
}

async function flushIncrements() {
  if (pendingIncrements.size === 0) return;
  const batch = [...pendingIncrements.values()];
  pendingIncrements.clear();

  for (const { source, mode, wins, losses } of batch) {
    if (wins > 0 || losses > 0) {
      await query(
        `INSERT INTO motor_scores (source, neighbor_mode, wins, losses, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (source, neighbor_mode)
         DO UPDATE SET wins = motor_scores.wins + $3, losses = motor_scores.losses + $4, updated_at = NOW()`,
        [source, mode, wins, losses]
      );
    }
  }
}

/**
 * Processa uma source: busca histórico, roda análise, registra sinais, confere spins.
 * Chamado após cada ciclo de fetch no server.
 */
export async function processSource(sourceName) {
  try {
    // 1. Busca histórico completo (até 1000, cache Redis)
    const history = await getFullHistory(sourceName);
    if (!history || history.length < 50) return;

    // 2. Converte para formato do masterScoring
    const spinHistory = history.map(dbRowToSpin);

    // 3. Detecta spins novos comparando com último processado
    const latestId = spinHistory[0].signalId;
    if (latestId === lastProcessedId[sourceName]) return; // sem novidades

    let newSpinNumbers = [];
    const prevId = lastProcessedId[sourceName];
    lastProcessedId[sourceName] = latestId;

    if (prevId) {
      for (let i = 0; i < spinHistory.length; i++) {
        if (spinHistory[i].signalId === prevId) break;
        newSpinNumbers.push(spinHistory[i].number);
      }
      // Cronológico (mais antigo primeiro)
      newSpinNumbers.reverse();
    }
    // Se prevId é null (primeira vez), só marca baseline sem checar

    // 4. Confere spins novos contra sinais pendentes
    if (newSpinNumbers.length > 0) {
      await checkSpinsAgainstPending(sourceName, newSpinNumbers);
    }

    // 5. Roda análise do motor
    const analysis = calculateMasterScore(spinHistory);

    // 6. Se há entrySignal, registra como pendente
    if (analysis?.entrySignal) {
      const nums = analysis.entrySignal.suggestedNumbers;
      const key = JSON.stringify([...nums].sort((a, b) => a - b));

      if (key !== lastRegisteredKey[sourceName]) {
        lastRegisteredKey[sourceName] = key;

        const sorted = [...nums].sort((a, b) => a - b);
        const { rows } = await query(
          'SELECT id FROM motor_pending_signals WHERE source = $1 AND suggested_numbers = $2',
          [sourceName, sorted]
        );

        if (rows.length === 0) {
          await query(
            'INSERT INTO motor_pending_signals (source, suggested_numbers) VALUES ($1, $2)',
            [sourceName, sorted]
          );
          console.log(`[Motor ${sourceName}] Sinal registrado: [${sorted.join(',')}] (${analysis.entrySignal.convergence} estratégias)`);
        }
      }
    }
  } catch (err) {
    console.error(`[Motor ${sourceName}] Erro:`, err.message);
  }
}

async function checkSpinsAgainstPending(source, numbers) {
  const { rows: pending } = await query(
    'SELECT id, suggested_numbers, spins_after, resolved_modes FROM motor_pending_signals WHERE source = $1',
    [source]
  );

  if (pending.length === 0) return;

  const toDelete = new Set();

  for (const num of numbers) {
    if (typeof num !== 'number' || num < 0 || num > 36) continue;

    for (const sig of pending) {
      if (toDelete.has(sig.id)) continue;

      sig.spins_after++;
      const resolved = sig.resolved_modes || {};

      for (const mode of [0, 1, 2]) {
        const mk = String(mode);
        if (resolved[mk]) continue;
        const covered = getCovered(sig.suggested_numbers, mode);
        if (covered.includes(num)) {
          resolved[mk] = 'win';
          queueIncrement(source, mode, 'wins');
          console.log(`[Motor ${source}] WIN mode=${mode} num=${num} signal=[${sig.suggested_numbers.join(',')}]`);
        }
      }

      sig.resolved_modes = resolved;

      if (sig.spins_after >= LOSS_THRESHOLD) {
        for (const mode of [0, 1, 2]) {
          const mk = String(mode);
          if (!resolved[mk]) {
            resolved[mk] = 'loss';
            queueIncrement(source, mode, 'losses');
            console.log(`[Motor ${source}] LOSS mode=${mode} after ${sig.spins_after} spins signal=[${sig.suggested_numbers.join(',')}]`);
          }
        }
        toDelete.add(sig.id);
      }
    }
  }

  // Flush batch de incrementos
  await flushIncrements();

  // Batch update pendentes
  const toUpdate = pending.filter(sig => !toDelete.has(sig.id));
  for (const sig of toUpdate) {
    await query(
      'UPDATE motor_pending_signals SET spins_after = $1, resolved_modes = $2 WHERE id = $3',
      [sig.spins_after, JSON.stringify(sig.resolved_modes), sig.id]
    );
  }

  // Remove resolvidos
  if (toDelete.size > 0) {
    await query('DELETE FROM motor_pending_signals WHERE id = ANY($1)', [[...toDelete]]);
  }
}
