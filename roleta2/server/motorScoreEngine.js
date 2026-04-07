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

// Estado em memória: último signalId processado por source
const lastProcessedId = {};
// Último sinal registrado por source (evita duplicatas)
const lastRegisteredKey = {};

/**
 * Inicializa o estado do motor carregando os últimos IDs do banco
 */
export async function loadMotorState() {
  try {
    const { rows } = await query(
      `SELECT source, MAX(signalid) as last_id FROM signals GROUP BY source`
    );
    for (const r of rows) {
      lastProcessedId[r.source] = r.last_id;
      console.log(`[Motor] Estado carregado: ${r.source} -> ${r.last_id}`);
    }
  } catch (err) {
    console.error('[Motor] Erro ao carregar estado inicial:', err.message);
  }
}

export async function initMotorEngine(io) {
  ioInstance = io;
  await loadMotorState();
}

export function getLatestMotorAnalysis(source) { return latestAnalysis[source] || null; }

const emptyScores = () => ({
  "0": { wins: 0, losses: 0 },
  "1": { wins: 0, losses: 0 },
  "2": { wins: 0, losses: 0 },
});

/**
 * Placar filtrado: busca os sinais que ocorreram DENTRO das últimas `limit` rodadas.
 */
export async function computeFilteredMotorScore(sourceName, limit) {
  const scores = emptyScores();
  const numericLimit = limit === 'all' ? 1000 : parseInt(limit, 10);

  try {
    const { rows: cutoffRows } = await query(
      `SELECT timestamp FROM signals
       WHERE source = $1
       ORDER BY timestamp DESC
       OFFSET $2 LIMIT 1`,
      [sourceName, Math.max(0, numericLimit - 1)]
    );

    const cutoffTimestamp = cutoffRows.length > 0 ? cutoffRows[0].timestamp : '1970-01-01';

    let signalRows;
    let hasSpinResults = true;
    try {
      ({ rows: signalRows } = await query(
        `SELECT id, suggested_numbers, spins_after, resolved_modes, spin_results, created_at
         FROM motor_pending_signals
         WHERE source = $1 AND created_at >= $2
         ORDER BY created_at DESC`,
        [sourceName, cutoffTimestamp]
      ));
    } catch {
      hasSpinResults = false;
      ({ rows: signalRows } = await query(
        `SELECT id, suggested_numbers, spins_after, resolved_modes, created_at
         FROM motor_pending_signals
         WHERE source = $1 AND created_at >= $2
         ORDER BY created_at DESC`,
        [sourceName, cutoffTimestamp]
      ));
    }

    if (signalRows.length === 0) return { ...scores, signalHistory: [], recentHistory: [] };

    const signalHistory = [];
    signalRows.forEach(row => {
      const modes = row.resolved_modes || {};
      for (const m of [0, 1, 2]) {
        const mk = String(m);
        if (modes[mk] === 'win') scores[mk].wins++;
        else if (modes[mk] === 'loss') scores[mk].losses++;
      }
      signalHistory.push({
        id: row.id,
        suggestedNumbers: row.suggested_numbers,
        spinsAfter: row.spins_after,
        resolvedModes: modes,
        spinResults: hasSpinResults ? (row.spin_results || []) : [],
        createdAt: row.created_at,
      });
    });

    const recentHistory = signalHistory.slice(0, 10).map(s => ({
      id: s.id,
      modes: s.resolvedModes
    }));

    return { ...scores, signalHistory, recentHistory };
  } catch (err) {
    console.error(`[Motor ${sourceName}] Erro no placar temporal:`, err.message);
    return { ...scores, signalHistory: [], recentHistory: [] };
  }
}

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

function dbRowToSpin(row) {
  const num = parseInt(row.signal, 10);
  return {
    number: isNaN(num) ? 0 : num,
    color: getColor(isNaN(num) ? 0 : num),
    signal: row.signal,
    signalId: row.signalId || row.signalid,
    gameId: row.gameId || row.gameid,
    date: row.timestamp,
  };
}

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
 */
export async function processSource(sourceName) {
  try {
    const history = await getFullHistory(sourceName);
    if (!history || history.length < 4) return;

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
      newSpinNumbers.reverse();
    }

    if (newSpinNumbers.length > 0) {
      await checkSpinsAgainstPending(sourceName, newSpinNumbers);
    }

    const analysis = calculateMasterScore(spinHistory);

    // 6. Se há entrySignal, registra como pendente
    if (analysis?.entrySignal) {
      const nums = analysis.entrySignal.suggestedNumbers;

      // ✅ MELHORIA: Só registra novo sinal se NÃO HOUVER sinal pendente para esta source
      // Isso garante que os sinais venham um por um e respeitem o tempo de gale.
      const { rows: existingPending } = await query(
        'SELECT id FROM motor_pending_signals WHERE source = $1 AND resolved = FALSE LIMIT 1',
        [sourceName]
      );

      if (existingPending.length === 0) {
        const key = JSON.stringify(nums);
        if (key !== lastRegisteredKey[sourceName]) {
          lastRegisteredKey[sourceName] = key;

          await query(
            'INSERT INTO motor_pending_signals (source, suggested_numbers) VALUES ($1, $2)',
            [sourceName, nums]
          );
          console.log(`[Motor ${sourceName}] Sinal registrado: [${nums.join(',')}]`);
        }
      }
    }

    try {
      const motorScores = await getMotorScores(sourceName);
      const { rows: pendingRows } = await query(
        'SELECT id, suggested_numbers, created_at, spins_after FROM motor_pending_signals WHERE source = $1 AND resolved = FALSE ORDER BY created_at DESC LIMIT 1',
        [sourceName]
      );

      let persistentSignal = null;
      if (pendingRows.length > 0) {
        const p = pendingRows[0];
        persistentSignal = {
          id: p.id,
          suggestedNumbers: p.suggested_numbers,
          confidence: analysis.entrySignal?.confidence || 70,
          convergence: analysis.entrySignal?.convergence || 3,
          validFor: LOSS_THRESHOLD,
          spinsAfter: p.spins_after,
          reason: 'Sinal persistente em análise'
        };
      }

      latestAnalysis[sourceName] = {
        source: sourceName,
        timestamp: Date.now(),
        globalAssertiveness: analysis.globalAssertiveness,
        totalSignals: analysis.totalSignals,
        strategyScores: analysis.strategyScores.map(s => ({
          name: s.name, score: s.score, status: s.status,
          signal: s.signal, numbers: s.numbers,
        })),
        entrySignal: persistentSignal,
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

const cleanupCounter = {};
const CLEANUP_EVERY = 50;
let _hasSpinResultsCol = null;

async function checkSpinResultsColumn() {
  if (_hasSpinResultsCol !== null) return _hasSpinResultsCol;
  try {
    await query(`SELECT spin_results FROM motor_pending_signals LIMIT 0`);
    _hasSpinResultsCol = true;
  } catch {
    _hasSpinResultsCol = false;
  }
  return _hasSpinResultsCol;
}

async function checkSpinsAgainstPending(source, numbers) {
  const hasCol = await checkSpinResultsColumn();
  const selectCols = hasCol
    ? 'id, suggested_numbers, spins_after, resolved_modes, spin_results'
    : 'id, suggested_numbers, spins_after, resolved_modes';
  const { rows: pending } = await query(
    `SELECT ${selectCols} FROM motor_pending_signals WHERE source = $1 AND resolved = FALSE`,
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

      if (hasCol) {
        const results = sig.spin_results || [];
        results.push(num);
        sig.spin_results = results;
      }

      for (const mode of [0, 1, 2]) {
        const mk = String(mode);
        if (resolved[mk]) continue;
        const covered = getCovered(sig.suggested_numbers, mode);
        if (covered.includes(num)) {
          resolved[mk] = 'win';
          resolved[`${mk}_gale`] = sig.spins_after;
          resolved[`${mk}_hit`] = num;
          await incrementScore(source, mode, 'wins');
          console.log(`[Motor ${source}] WIN mode=${mode} gale=${sig.spins_after} num=${num}`);
        }
      }

      sig.resolved_modes = resolved;
      const isTimeout = sig.spins_after >= LOSS_THRESHOLD;
      const allWin = [0, 1, 2].every(m => resolved[String(m)] === 'win');

      if (isTimeout || allWin) {
        if (isTimeout) {
          for (const mode of [0, 1, 2]) {
            const mk = String(mode);
            if (!resolved[mk]) {
              resolved[mk] = 'loss';
              await incrementScore(source, mode, 'losses');
              console.log(`[Motor ${source}] LOSS mode=${mode} after ${sig.spins_after} spins`);
            }
          }
        }
        fullyResolved.add(sig.id);
      }
    }
  }

  for (const sig of pending) {
    const isFullyResolved = fullyResolved.has(sig.id);
    if (hasCol) {
      await query(
        'UPDATE motor_pending_signals SET spins_after = $1, resolved_modes = $2, resolved = $3, spin_results = $4 WHERE id = $5',
        [sig.spins_after, JSON.stringify(sig.resolved_modes), isFullyResolved, sig.spin_results, sig.id]
      );
    } else {
      await query(
        'UPDATE motor_pending_signals SET spins_after = $1, resolved_modes = $2, resolved = $3 WHERE id = $4',
        [sig.spins_after, JSON.stringify(sig.resolved_modes), isFullyResolved, sig.id]
      );
    }
  }

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

/**
 * Backfill: reprocessa as últimas 1000 rodadas de uma source,
 * reconstruindo motor_pending_signals e motor_scores retroativamente.
 * Usado para restaurar histórico após limpeza de dados corrompidos.
 */
export async function backfillMotorScores(sourceName) {
  console.log(`[Backfill ${sourceName}] Iniciando...`);

  const hasCol = await checkSpinResultsColumn();

  // 1. Busca últimas 1000 rodadas direto do DB (sem cache Redis)
  const { rows: rawHistory } = await query(
    `SELECT timestamp, signalid AS "signalId", gameid AS "gameId", signal
     FROM signals WHERE source = $1
     ORDER BY timestamp DESC LIMIT 1000`,
    [sourceName]
  );

  if (!rawHistory || rawHistory.length < 50) {
    console.log(`[Backfill ${sourceName}] Histórico insuficiente (${rawHistory?.length || 0})`);
    return { source: sourceName, signals: 0, spins: rawHistory?.length || 0 };
  }

  const spinHistory = rawHistory.map(dbRowToSpin);

  // 2. Limpa dados existentes para esta source
  await query('DELETE FROM motor_pending_signals WHERE source = $1', [sourceName]);
  await query('DELETE FROM motor_scores WHERE source = $1', [sourceName]);

  // 3. Processa cronologicamente (mais antigo → mais novo)
  //    spinHistory[0] = newest, spinHistory[length-1] = oldest
  //    Itera de trás pra frente simulando a chegada dos spins em tempo real
  let pendingSignal = null;
  let totalSignals = 0;
  const MIN_WINDOW = 50;

  for (let i = spinHistory.length - 1 - MIN_WINDOW; i >= 0; i--) {
    const currentSpin = spinHistory[i];

    // 3a. Confere spin contra sinal pendente
    if (pendingSignal) {
      pendingSignal.spinsAfter++;
      pendingSignal.spinResults.push(currentSpin.number);

      for (const mode of [0, 1, 2]) {
        const mk = String(mode);
        if (pendingSignal.resolvedModes[mk]) continue;
        const covered = getCovered(pendingSignal.suggestedNumbers, mode);
        if (covered.includes(currentSpin.number)) {
          pendingSignal.resolvedModes[mk] = 'win';
          pendingSignal.resolvedModes[`${mk}_gale`] = pendingSignal.spinsAfter;
          pendingSignal.resolvedModes[`${mk}_hit`] = currentSpin.number;
        }
      }

      const isTimeout = pendingSignal.spinsAfter >= LOSS_THRESHOLD;
      const allWin = [0, 1, 2].every(m => pendingSignal.resolvedModes[String(m)] === 'win');

      if (isTimeout || allWin) {
        if (isTimeout) {
          for (const mode of [0, 1, 2]) {
            const mk = String(mode);
            if (!pendingSignal.resolvedModes[mk]) {
              pendingSignal.resolvedModes[mk] = 'loss';
            }
          }
        }

        // Persiste sinal resolvido no DB
        if (hasCol) {
          await query(
            `INSERT INTO motor_pending_signals
             (source, suggested_numbers, spins_after, resolved_modes, spin_results, resolved, created_at)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
            [sourceName, pendingSignal.suggestedNumbers, pendingSignal.spinsAfter,
             JSON.stringify(pendingSignal.resolvedModes), pendingSignal.spinResults,
             pendingSignal.createdAt]
          );
        } else {
          await query(
            `INSERT INTO motor_pending_signals
             (source, suggested_numbers, spins_after, resolved_modes, resolved, created_at)
             VALUES ($1, $2, $3, $4, TRUE, $5)`,
            [sourceName, pendingSignal.suggestedNumbers, pendingSignal.spinsAfter,
             JSON.stringify(pendingSignal.resolvedModes),
             pendingSignal.createdAt]
          );
        }

        for (const mode of [0, 1, 2]) {
          const mk = String(mode);
          await incrementScore(sourceName, mode,
            pendingSignal.resolvedModes[mk] === 'win' ? 'wins' : 'losses');
        }

        totalSignals++;
        pendingSignal = null;
      }
    }

    // 3b. Tenta criar novo sinal se nenhum pendente
    if (!pendingSignal) {
      const historyAtTime = spinHistory.slice(i);
      const analysis = calculateMasterScore(historyAtTime);
      if (analysis?.entrySignal) {
        pendingSignal = {
          suggestedNumbers: analysis.entrySignal.suggestedNumbers,
          createdAt: currentSpin.date,
          spinsAfter: 0,
          resolvedModes: {},
          spinResults: [],
        };
      }
    }
  }

  // 4. Atualiza lastProcessedId para o engine continuar daqui
  lastProcessedId[sourceName] = spinHistory[0].signalId;

  console.log(`[Backfill ${sourceName}] Concluído: ${totalSignals} sinais de ${spinHistory.length} rodadas`);
  return { source: sourceName, signals: totalSignals, spins: spinHistory.length };
}
