// triggerScoreEngine.js — Motor de scoring de TRIGGERS rodando no backend
// Monitora TODAS as mesas passivamente: detecta gatilhos, checa resultados, persiste placar.
// Emite resultados via Socket.IO para o frontend renderizar diretamente.

import { buildTriggerMap, checkTrigger, getActiveTriggers } from '../src/analysis/triggerAnalysis.js';
import { getFullHistory } from './dbService.js';
import { query } from './db.js';

const TRIGGER_LOSS_THRESHOLD = 3; // 3 spins pra resolver (igual frontend)
// Confiança mínima para EMITIR um sinal (registrar no DB e contar no scoreboard).
// Deve casar com MIN_CONFIDENCE em src/pages/TriggersPage.jsx (frontend filtra novamente como defesa).
const MIN_CONFIDENCE = 50;
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

// ── Socket.IO + cache de análise ────────────────────────────
let ioInstance = null;
const latestTriggerAnalysis = {};

export function initTriggerEngine(io) { ioInstance = io; }
export function getLatestTriggerAnalysis(source) { return latestTriggerAnalysis[source] || null; }

function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
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
    if (!history || history.length < 10) return; // Mínimo para gatilhos básicos

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

    // Emite resultado completo via Socket.IO
    try {
      // ✅ FIX: Sinais ativos vêm do DB (estáveis) em vez do triggerMap volátil.
      // Antes: getActiveSignals(triggerMap) perdia sinais quando triggerMap mudava entre spins.
      const activeSignals = await getActiveSignalsFromDB(sourceName, triggerMap);
      const topTriggers = getActiveTriggers(triggerMap).slice(0, 5);
      const activeTrigger = spinHistory.length > 0
        ? checkTrigger(triggerMap, spinHistory[0].number)
        : null;

      // Assertividade por tipo
      const assertivity = computeAssertivityBackend(spinHistory, triggerMap);

      // Scoreboard do DB
      const { rows: scoreRows } = await query(
        'SELECT wins, losses FROM trigger_scores WHERE source = $1',
        [sourceName]
      );
      const dbScore = scoreRows[0] || { wins: 0, losses: 0 };

      latestTriggerAnalysis[sourceName] = {
        source: sourceName,
        timestamp: Date.now(),
        activeSignals,
        topTriggers,
        activeTrigger,
        scoreboard: { wins: dbScore.wins, losses: dbScore.losses },
        assertivity,
        allTriggersCount: getActiveTriggers(triggerMap).length,
      };
      if (ioInstance) {
        try { ioInstance.emit('trigger-analysis', latestTriggerAnalysis[sourceName]); } catch {}
      }
    } catch (emitErr) {
      console.error(`[Trigger ${sourceName}] Erro ao emitir:`, emitErr.message);
    }
  } catch (err) {
    console.error(`[Trigger ${sourceName}] Erro:`, err.message);
  }
}

// Controla frequência da limpeza (não precisa rodar a cada ciclo)
const cleanupCounter = {};
const CLEANUP_EVERY = 50; // roda a cada 50 ciclos (~5 min com poll de 5s)

async function checkAndRegisterTriggers(source, numbers, triggerMap) {
  // 1. Busca sinais pendentes
  const { rows: pending } = await query(
    'SELECT id, trigger_number, covered_numbers, spins_after FROM trigger_pending_signals WHERE source = $1 AND resolved = FALSE',
    [source]
  );

  const toResolve = [];
  // ✅ FIX: Set de IDs para skip correto (antes usava toResolve.includes(sig.id) que
  //         comparava número com objetos → SEMPRE false → sinais contados como WIN + LOSS)
  const resolvedInBatch = new Set();

  for (const num of numbers) {
    if (typeof num !== 'number' || num < 0 || num > 36) continue;

    // 1a. Confere num contra cada sinal pendente
    for (const sig of pending) {
      if (resolvedInBatch.has(sig.id)) continue; // já resolvido neste batch

      sig.spins_after++;

      if (sig.covered_numbers.includes(num)) {
        // WIN
        toResolve.push({ id: sig.id, result: 'win' });
        resolvedInBatch.add(sig.id);
        await query(
          `INSERT INTO trigger_scores (source, wins, updated_at)
           VALUES ($1, 1, NOW())
           ON CONFLICT (source)
           DO UPDATE SET wins = trigger_scores.wins + 1, updated_at = NOW()`,
          [source]
        );
        console.log(`[Trigger ${source}] WIN trigger=${sig.trigger_number} num=${num} covered=[${sig.covered_numbers.join(',')}]`);
        continue;
      }

      if (sig.spins_after >= TRIGGER_LOSS_THRESHOLD) {
        // LOSS — errou 3 vezes
        toResolve.push({ id: sig.id, result: 'loss' });
        resolvedInBatch.add(sig.id);
        await query(
          `INSERT INTO trigger_scores (source, losses, updated_at)
           VALUES ($1, 1, NOW())
           ON CONFLICT (source)
           DO UPDATE SET losses = trigger_scores.losses + 1, updated_at = NOW()`,
          [source]
        );
        console.log(`[Trigger ${source}] LOSS trigger=${sig.trigger_number} after ${sig.spins_after} spins`);
      }
    }

    // 1b. Checa se ESTE num é um trigger -> registra novo sinal pendente
    const profile = triggerMap.get(num);
    if (profile?.bestPattern && profile.bestPattern.confidence >= MIN_CONFIDENCE) {
      // ✅ MELHORIA: Verifica se já existe um sinal PENDENTE para este gatilho
      // Evita emitir 2 sinais para o mesmo número ao mesmo tempo.
      const isAlreadyPending = pending.some(p => p.trigger_number === num);
      if (isAlreadyPending) continue;

      const covered = profile.bestPattern.coveredNumbers;
      const bp = profile.bestPattern;
      const { rows: insertedRows } = await query(
        `INSERT INTO trigger_pending_signals
         (source, trigger_number, covered_numbers, pattern_label, confidence, lift)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [source, num, covered, bp.label, bp.confidence, bp.lift]
      );

      // ✅ FIX: Adiciona o novo sinal ao array pending para que spins
      //         subsequentes do mesmo batch o detectem (antes era ignorado)
      if (insertedRows[0]) {
        pending.push({
          id: insertedRows[0].id,
          trigger_number: num,
          covered_numbers: covered,
          spins_after: 0,
        });
      }
      console.log(`[Trigger ${source}] Sinal registrado: trigger=${num} covered=[${covered.join(',')}] (${bp.label})`);
    }
  }

  // 2. Atualiza spins_after de TODOS os sinais processados (pendentes E resolvidos)
  // ✅ FIX: Antes só atualizava pendentes — resolvidos ficavam com spins_after=0 no DB
  //         → frontend mostrava G0 em vez de G1/G2/G3
  const resolvedIds = new Set(toResolve.map(r => r.id));
  for (const sig of pending) {
    if (!resolvedIds.has(sig.id)) {
      await query(
        'UPDATE trigger_pending_signals SET spins_after = $1 WHERE id = $2',
        [sig.spins_after, sig.id]
      );
    }
  }

  // 3. Marca resolvidos COM resultado E spins_after correto
  const pendingById = new Map(pending.map(s => [s.id, s]));
  for (const r of toResolve) {
    const sig = pendingById.get(r.id);
    await query(
      'UPDATE trigger_pending_signals SET resolved = TRUE, result = $1, spins_after = $2 WHERE id = $3',
      [r.result, sig ? sig.spins_after : 0, r.id]
    );
  }

  // 4. Limpa sinais antigos resolvidos (throttled — a cada ~50 ciclos)
  cleanupCounter[source] = (cleanupCounter[source] || 0) + 1;
  if (cleanupCounter[source] >= CLEANUP_EVERY) {
    cleanupCounter[source] = 0;
    await query(
      `DELETE FROM trigger_pending_signals
       WHERE source = $1 AND resolved = TRUE
       AND id NOT IN (
         SELECT id FROM trigger_pending_signals
         WHERE source = $1 AND resolved = TRUE
         ORDER BY created_at DESC LIMIT 1500
       )`,
      [source]
    );
  }
}

/**
 * Busca histórico recente de gatilhos do DB.
 * Cada disparo é um evento independente — sem dedup por trigger_number.
 * Frontend filtra por confiança e corta para N eventos mais recentes.
 */
async function getActiveSignalsFromDB(source, triggerMap) {
  const { rows } = await query(
    `SELECT id, trigger_number, covered_numbers, spins_after, resolved, result,
            pattern_label, confidence, lift, created_at
     FROM trigger_pending_signals
     WHERE source = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [source]
  );

  return rows.map((row) => {
    const remaining = TRIGGER_LOSS_THRESHOLD - row.spins_after;
    const profile = triggerMap.get(row.trigger_number);
    const label = row.pattern_label || profile?.bestPattern?.label || `Trigger ${row.trigger_number}`;
    // Live primeiro: confidence é hits/appearances*100 recalculado a cada ciclo.
    // row.confidence (snapshot do disparo) só serve de fallback se o profile sumiu.
    const conf = profile?.bestPattern?.confidence ?? row.confidence ?? 0;
    const lft = row.lift ?? profile?.bestPattern?.lift ?? 0;

    let status;
    if (row.resolved) {
      status = row.result || (row.spins_after < TRIGGER_LOSS_THRESHOLD ? 'win' : 'loss');
    } else {
      status = 'pending';
    }

    return {
      id: row.id,
      timestamp: row.created_at,
      triggerNumber: row.trigger_number,
      action: label,
      confidence: conf,
      lift: lft,
      coveredNumbers: row.covered_numbers,
      spinsAgo: row.spins_after,
      remaining: Math.max(0, remaining),
      status,
      winAttempt: status === 'win' ? row.spins_after : undefined,
    };
  });
}

// ── Assertividade por tipo (equivalente ao frontend TriggerStrategiesPanel) ──

const TYPE_LABELS = {
  terminal_puro:  'Terminais',
  terminal_viz:   'Terminal + Viz',
  regiao_pequena: 'Regiao Curta',
  regiao_grande:  'Regiao Larga',
};

function classifyTrigger(profile) {
  if (!profile?.bestPattern) return null;
  const { type, neighbors } = profile.bestPattern;
  if (type === 'terminal' && neighbors === 0) return 'terminal_puro';
  if (type === 'terminal') return 'terminal_viz';
  if (type === 'region' && neighbors <= 3) return 'regiao_pequena';
  if (type === 'region') return 'regiao_grande';
  return null;
}

function computeAssertivityBackend(spinHistory, triggerMap) {
  const types = {};
  for (const key of Object.keys(TYPE_LABELS)) {
    types[key] = { g1: 0, g2: 0, g3: 0, red: 0, results: [] };
  }

  const perTrigger = {};

  for (let i = TRIGGER_LOSS_THRESHOLD; i < spinHistory.length; i++) {
    const num = spinHistory[i].number;
    const profile = triggerMap.get(num);
    const cat = classifyTrigger(profile);
    if (!cat) continue;

    const covered = profile.bestPattern.coveredNumbers;
    let hitOn = 0;
    for (let j = 1; j <= TRIGGER_LOSS_THRESHOLD; j++) {
      const checkIdx = i - j;
      if (checkIdx < 0) break;
      if (covered.includes(spinHistory[checkIdx].number)) {
        hitOn = j;
        break;
      }
    }

    const bucket = types[cat];
    if (hitOn === 1) { bucket.g1++; bucket.results.push('G1'); }
    else if (hitOn === 2) { bucket.g2++; bucket.results.push('G2'); }
    else if (hitOn === 3) { bucket.g3++; bucket.results.push('G3'); }
    else { bucket.red++; bucket.results.push('R'); }

    if (!perTrigger[num]) perTrigger[num] = { wins: 0, total: 0 };
    perTrigger[num].total++;
    if (hitOn > 0) perTrigger[num].wins++;
  }

  const result = [];
  for (const [key, data] of Object.entries(types)) {
    const total = data.g1 + data.g2 + data.g3 + data.red;
    if (total === 0) continue;
    const wins = data.g1 + data.g2 + data.g3;
    result.push({
      key,
      label: TYPE_LABELS[key],
      g1: data.g1, g2: data.g2, g3: data.g3, red: data.red,
      total,
      pct: Math.round((wins / total) * 100),
      recentResults: data.results.slice(-10).reverse(),
    });
  }
  result.sort((a, b) => b.pct - a.pct);

  // Totais
  const totals = { g1: 0, g2: 0, g3: 0, red: 0, total: 0 };
  for (const a of result) {
    totals.g1 += a.g1; totals.g2 += a.g2; totals.g3 += a.g3; totals.red += a.red; totals.total += a.total;
  }
  totals.pct = totals.total > 0 ? Math.round(((totals.g1 + totals.g2 + totals.g3) / totals.total) * 100) : 0;

  return { types: result, totals, perTrigger };
}
