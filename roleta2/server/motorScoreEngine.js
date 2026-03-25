// motorScoreEngine.js — Motor de scoring rodando no backend
// Monitora TODAS as mesas passivamente e mantém placar no DB.
// Emite resultados via Socket.IO para o frontend renderizar diretamente.

import { calculateMasterScore } from '../src/analysis/masterScoring.js';
import { getFullHistory } from './dbService.js';
import { query } from './db.js';

// ✅ MELHORIA: 2→3 spins. Com 5 números de 37, P(acerto em 2 spins)≈25% — injusto.
// Com 3 spins P(acerto)≈35%. Julgamento mais fair para o sinal.
const LOSS_THRESHOLD = 3;

// ── Socket.IO + cache de análise ────────────────────────────
let ioInstance = null;
const latestAnalysis = {};

export function initMotorEngine(io) { ioInstance = io; }
export function getLatestMotorAnalysis(source) { return latestAnalysis[source] || null; }

const WHEEL = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,
  5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
}

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

const emptyScores = () => ({
  "0": { wins: 0, losses: 0 },
  "1": { wins: 0, losses: 0 },
  "2": { wins: 0, losses: 0 },
});

async function getMotorScores(source) {
  const { rows } = await query(
    'SELECT neighbor_mode, wins, losses FROM motor_scores WHERE source = $1',
    [source]
  );
  const scores = emptyScores();
  for (const r of rows) {
    scores[String(r.neighbor_mode)] = { wins: r.wins, losses: r.losses };
  }
  return scores;
}

async function incrementScore(source, mode, field) {
  await query(
    `INSERT INTO motor_scores (source, neighbor_mode, ${field}, updated_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (source, neighbor_mode)
     DO UPDATE SET ${field} = motor_scores.${field} + 1, updated_at = NOW()`,
    [source, mode]
  );
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

    // 7. Emite resultado completo via Socket.IO
    try {
      const motorScores = await getMotorScores(sourceName);
      latestAnalysis[sourceName] = {
        source: sourceName,
        timestamp: Date.now(),
        globalAssertiveness: analysis.globalAssertiveness,
        totalSignals: analysis.totalSignals,
        strategyScores: analysis.strategyScores.map(s => ({
          name: s.name, score: s.score, status: s.status,
          signal: s.signal, numbers: s.numbers,
        })),
        entrySignal: analysis.entrySignal,
        motorScores,
      };
      if (ioInstance) ioInstance.emit('motor-analysis', latestAnalysis[sourceName]);
    } catch (emitErr) {
      console.error(`[Motor ${sourceName}] Erro ao emitir:`, emitErr.message);
    }
  } catch (err) {
    console.error(`[Motor ${sourceName}] Erro:`, err.message);
  }
}

// Controla frequência da limpeza de resolvidos antigos
const cleanupCounter = {};
const CLEANUP_EVERY = 50;

async function checkSpinsAgainstPending(source, numbers) {
  // Só busca sinais PENDENTES (não totalmente resolvidos)
  const { rows: pending } = await query(
    `SELECT id, suggested_numbers, spins_after, resolved_modes
     FROM motor_pending_signals
     WHERE source = $1 AND resolved = FALSE`,
    [source]
  );

  if (pending.length === 0) return;

  const fullyResolved = new Set();

  for (const num of numbers) {
    if (typeof num !== 'number' || num < 0 || num > 36) continue;

    for (const sig of pending) {
      if (fullyResolved.has(sig.id)) continue;

      sig.spins_after++;
      const resolved = sig.resolved_modes || {};

      for (const mode of [0, 1, 2]) {
        const mk = String(mode);
        if (resolved[mk]) continue;
        const covered = getCovered(sig.suggested_numbers, mode);
        if (covered.includes(num)) {
          resolved[mk] = 'win';
          await incrementScore(source, mode, 'wins');
          console.log(`[Motor ${source}] WIN mode=${mode} num=${num} signal=[${sig.suggested_numbers.join(',')}]`);
        }
      }

      sig.resolved_modes = resolved;

      if (sig.spins_after >= LOSS_THRESHOLD) {
        for (const mode of [0, 1, 2]) {
          const mk = String(mode);
          if (!resolved[mk]) {
            resolved[mk] = 'loss';
            await incrementScore(source, mode, 'losses');
            console.log(`[Motor ${source}] LOSS mode=${mode} after ${sig.spins_after} spins signal=[${sig.suggested_numbers.join(',')}]`);
          }
        }
        fullyResolved.add(sig.id);
      }
    }
  }

  // Atualiza TODOS os pendentes (spins_after + resolved_modes)
  for (const sig of pending) {
    const isFullyResolved = fullyResolved.has(sig.id);
    await query(
      'UPDATE motor_pending_signals SET spins_after = $1, resolved_modes = $2, resolved = $3 WHERE id = $4',
      [sig.spins_after, JSON.stringify(sig.resolved_modes), isFullyResolved, sig.id]
    );
  }

  // Limpa resolvidos antigos (throttled — a cada ~50 ciclos, mantém últimos 1500)
  cleanupCounter[source] = (cleanupCounter[source] || 0) + 1;
  if (cleanupCounter[source] >= CLEANUP_EVERY) {
    cleanupCounter[source] = 0;
    await query(
      `DELETE FROM motor_pending_signals
       WHERE source = $1 AND resolved = TRUE
       AND id NOT IN (
         SELECT id FROM motor_pending_signals
         WHERE source = $1 AND resolved = TRUE
         ORDER BY created_at DESC LIMIT 1500
       )`,
      [source]
    );
  }
}
