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

/**
 * Computa análise de motor sob demanda (fallback quando não há análise em cache).
 * Usado em /api/motor-analysis quando getLatestMotorAnalysis retorna null —
 * típico logo após restart, antes do primeiro ciclo de processSource rodar.
 */
export async function computeMotorAnalysisOnDemand(sourceName) {
  try {
    const history = await getFullHistory(sourceName);
    if (!history || history.length < 10) return null;
    const spinHistory = history.map(dbRowToSpin);
    const analysis = calculateMasterScore(spinHistory);
    await emitLatestAnalysis(sourceName, analysis, spinHistory);
    return latestAnalysis[sourceName] || null;
  } catch (err) {
    console.error(`[Motor ${sourceName}] Erro em computeMotorAnalysisOnDemand:`, err.message);
    return null;
  }
}

/**
 * Placar filtrado: busca os sinais RESOLVIDOS que ocorreram DENTRO das últimas `limit` rodadas.
 * Roda NO BACKEND. Chamado pelo endpoint /api/motor-score?limit=N.
 * Agora usa o timestamp da rodada N atrás como ponto de corte temporal.
 */
export async function computeFilteredMotorScore(sourceName, limit) {
  const scores = emptyScores();
  const numericLimit = limit === 'all' ? 1000 : parseInt(limit, 10);

  try {
    // 1. Descobre o timestamp da rodada N atrás no histórico oficial
    const { rows: cutoffRows } = await query(
      `SELECT timestamp FROM signals
       WHERE source = $1
       ORDER BY timestamp DESC
       OFFSET $2 LIMIT 1`,
      [sourceName, Math.max(0, numericLimit - 1)]
    );

    const cutoffTimestamp = cutoffRows.length > 0
      ? cutoffRows[0].timestamp
      : '1970-01-01'; // Fallback se histórico for menor que o limite

    console.log(`[DEBUG computeFilteredMotorScore] source=${sourceName} limit=${limit} numericLimit=${numericLimit} cutoffRows=${cutoffRows.length} cutoffTimestamp=${cutoffTimestamp}`);

    // 2. Busca sinais resolvidos com dados completos (inclui histórico)
    // Tenta com spin_results; se coluna não existe ainda, busca sem ela
    let signalRows;
    let hasSpinResults = true;
    try {
      ({ rows: signalRows } = await query(
        `SELECT id, suggested_numbers, spins_after, resolved_modes, spin_results, created_at
         FROM motor_pending_signals
         WHERE source = $1
           AND created_at >= $2
           AND resolved = TRUE
         ORDER BY created_at DESC, id DESC`,
        [sourceName, cutoffTimestamp]
      ));
    } catch {
      hasSpinResults = false;
      ({ rows: signalRows } = await query(
        `SELECT id, suggested_numbers, spins_after, resolved_modes, created_at
         FROM motor_pending_signals
         WHERE source = $1
           AND created_at >= $2
           AND resolved = TRUE
         ORDER BY created_at DESC, id DESC`,
        [sourceName, cutoffTimestamp]
      ));
    }

    console.log(`[DEBUG computeFilteredMotorScore] signalRows=${signalRows.length} hasSpinResults=${hasSpinResults}`, signalRows.length > 0 ? `first_row_modes=${JSON.stringify(signalRows[0].resolved_modes)}` : '(empty)');

    if (signalRows.length === 0) return { ...scores, signalHistory: [], recentHistory: [] };

    const signalHistory = [];

    signalRows.forEach(row => {
      const modes = row.resolved_modes || {};
      for (const m of [1, 2]) {
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
    signalId: row.signalId || row.signalid,
    gameId: row.gameId || row.gameid,
    date: row.timestamp,
  };
}

// Estado em memória: último signalId processado por source
const lastProcessedId = {};
// Último sinal registrado por source (evita duplicatas)
const lastRegisteredKey = {};
// Lock por source: impede processamento concorrente (setInterval pode sobrepor ciclos)
const processingLock = {};

const emptyScores = () => ({
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
  // Lock por source: impede ciclos concorrentes de corromper spin_results
  if (processingLock[sourceName]) return;
  processingLock[sourceName] = true;
  try {
    // 1. Busca histórico completo (até 1000, cache Redis)
    const history = await getFullHistory(sourceName);
    if (!history || history.length < 4) return; // Mínimo de 4 para conferência de spins

    // 2. Converte para formato do masterScoring
    const spinHistory = history.map(dbRowToSpin);

    // 3. Detecta spins novos comparando com último processado
    const latestId = spinHistory[0].signalId;

    // ✅ MELHORIA: Se lastProcessedId está nulo (restart), tenta recuperar o mais recente
    if (!lastProcessedId[sourceName]) {
      lastProcessedId[sourceName] = latestId;
      console.log(`[Motor ${sourceName}] Baseline definido em signalId=${latestId}`);
      // Na primeira vez após restart, não processamos spins anteriores para evitar duplicidade de gales
      // Mas continuamos para detectar se há novos sinais a serem gerados agora
    }

    if (latestId === lastProcessedId[sourceName]) {
      // Mesmo sem novos spins para processar resultados, podemos ter sinais pendentes
      // de ciclos anteriores que precisam ser exibidos persistentemente.
      await emitLatestAnalysis(sourceName, null, spinHistory);
      return;
    }

    let newSpinNumbers = [];
    const prevId = lastProcessedId[sourceName];
    lastProcessedId[sourceName] = latestId;

    if (prevId) {
      let foundPrev = false;
      for (let i = 0; i < spinHistory.length; i++) {
        if (spinHistory[i].signalId === prevId) {
          foundPrev = true;
          break;
        }
        newSpinNumbers.push(spinHistory[i].number);
      }
      
      // Se não achou o prevId no histórico recente (gap muito grande),
      // limita a processar apenas os últimos 5 spins para evitar falsas resoluções históricas.
      if (!foundPrev && newSpinNumbers.length > 5) {
        console.warn(`[Motor ${sourceName}] Gap detectado! prevId=${prevId} não encontrado. Processando apenas últimos 5 spins.`);
        newSpinNumbers = spinHistory.slice(0, 5).map(s => s.number);
      }
      
      // Cronológico (mais antigo primeiro)
      newSpinNumbers.reverse();
    }

    // 4. Confere spins novos contra sinais pendentes
    if (newSpinNumbers.length > 0) {
      await checkSpinsAgainstPending(sourceName, newSpinNumbers);
    }

    // 5. Roda análise do motor
    const analysis = calculateMasterScore(spinHistory);

    // 6. Se há entrySignal, registra como pendente.
    //    ✅ FIX: Só registra UM sinal por source por vez (igual roleta2/phantom-roleta).
    //    Antes permitiamos multiplos sinais pendentes paralelos, causando:
    //    - duplicatas em ms (race entre workers PM2)
    //    - spin_results compartilhado entre sinais registrados em sequencia
    //    - histórico com "Result." repetido em varias linhas
    if (analysis?.entrySignal) {
      const nums = analysis.entrySignal.suggestedNumbers;
      const sorted = [...nums].sort((a, b) => a - b);

      const key = JSON.stringify(sorted);
      // Cooldown local: evita re-registrar o mesmo sinal imediatamente apos resolver
      if (key !== lastRegisteredKey[sourceName]) {
        // INSERT atomico: partial unique index impede 2 pendentes para mesma source.
        // ON CONFLICT DO NOTHING garante idempotencia sem SELECT previo (elimina race condition).
        const { rowCount } = await query(
          `INSERT INTO motor_pending_signals (source, suggested_numbers)
           VALUES ($1, $2)
           ON CONFLICT (source) WHERE resolved = FALSE DO NOTHING`,
          [sourceName, sorted]
        );
        if (rowCount > 0) {
          lastRegisteredKey[sourceName] = key;
          console.log(`[Motor ${sourceName}] Sinal registrado: [${sorted.join(',')}]`);
        }
      }
    }

    // 7. Emite resultado completo via Socket.IO
    await emitLatestAnalysis(sourceName, analysis, spinHistory);

  } catch (err) {
    console.error(`[Motor ${sourceName}] Erro:`, err.message);
  } finally {
    processingLock[sourceName] = false;
  }
}

async function emitLatestAnalysis(sourceName, currentAnalysis, spinHistory) {
  try {
    const motorScores = await getMotorScores(sourceName);

    // ✅ FIX: Preserva o estado anterior quando nao ha nova analise.
    // Sem isso, ciclos sem spin novo emitiam strategyScores=[] e o frontend
    // escondia o dashboard (MasterDashboard.jsx:286 checa strategyScores.length === 0),
    // causando piscar dos sinais.
    const prev = latestAnalysis[sourceName];

    // Busca o sinal pendente real do banco de dados para garantir persistência.
    const { rows: pendingRows } = await query(
      'SELECT suggested_numbers, created_at, spins_after FROM motor_pending_signals WHERE source = $1 AND resolved = FALSE ORDER BY created_at DESC LIMIT 1',
      [sourceName]
    );

    let persistentSignal = currentAnalysis?.entrySignal || prev?.entrySignal || null;

    if (pendingRows.length > 0) {
      const p = pendingRows[0];
      // Se já temos um sinal no DB, ele tem prioridade para exibição
      persistentSignal = {
        suggestedNumbers: p.suggested_numbers,
        confidence: currentAnalysis?.entrySignal?.confidence || prev?.entrySignal?.confidence || 75,
        convergence: currentAnalysis?.entrySignal?.convergence || prev?.entrySignal?.convergence || 3,
        validFor: LOSS_THRESHOLD - p.spins_after,
        spins_after: p.spins_after,
        reason: 'Sinal em análise'
      };
    }

    const mappedStrategyScores = currentAnalysis?.strategyScores?.map(s => ({
      name: s.name, score: s.score, status: s.status,
      signal: s.signal, numbers: s.numbers,
    }));

    latestAnalysis[sourceName] = {
      source: sourceName,
      timestamp: Date.now(),
      globalAssertiveness: currentAnalysis?.globalAssertiveness ?? prev?.globalAssertiveness ?? 0,
      totalSignals: currentAnalysis?.totalSignals ?? prev?.totalSignals ?? 0,
      strategyScores: mappedStrategyScores ?? prev?.strategyScores ?? [],
      entrySignal: persistentSignal,
      motorScores,
    };
    if (ioInstance) ioInstance.emit('motor-analysis', latestAnalysis[sourceName]);
  } catch (emitErr) {
    console.error(`[Motor ${sourceName}] Erro ao emitir:`, emitErr.message);
  }
}

// Controla frequência da limpeza de resolvidos antigos
const cleanupCounter = {};
const CLEANUP_EVERY = 50;

// Flag de coluna spin_results (cache em memória)
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

  // Só busca sinais PENDENTES (não totalmente resolvidos)
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

      // Acumula os resultados reais da roleta
      if (hasCol) {
        const results = sig.spin_results || [];
        results.push(num);
        sig.spin_results = results;
      }

      for (const mode of [1, 2]) {
        const mk = String(mode);
        if (resolved[mk]) continue;
        const covered = getCovered(sig.suggested_numbers, mode);
        if (covered.includes(num)) {
          resolved[mk] = 'win';
          // Registra em qual gale (spin) o win aconteceu
          resolved[`${mk}_gale`] = sig.spins_after;
          resolved[`${mk}_hit`] = num;
          await incrementScore(source, mode, 'wins');
          console.log(`[Motor ${source}] WIN mode=${mode} gale=${sig.spins_after} num=${num} signal=[${sig.suggested_numbers.join(',')}]`);
        }
      }

      sig.resolved_modes = resolved;

      if (sig.spins_after >= LOSS_THRESHOLD) {
        for (const mode of [1, 2]) {
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

  // Atualiza TODOS os pendentes (spins_after + resolved_modes + spin_results)
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

      for (const mode of [1, 2]) {
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
      const allWin = [1, 2].every(m => pendingSignal.resolvedModes[String(m)] === 'win');

      if (isTimeout || allWin) {
        if (isTimeout) {
          for (const mode of [1, 2]) {
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

        for (const mode of [1, 2]) {
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
