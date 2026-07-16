// triggerScoreEngine.js — Motor de scoring de TRIGGERS rodando no backend
// Monitora TODAS as mesas passivamente: detecta gatilhos, checa resultados, persiste placar.
//
// NÃO expõe mais nada ao usuário: a aba de Gatilhos, o endpoint /api/trigger-analysis
// e o evento Socket.IO 'trigger-analysis' saíram do ar em adequação à Portaria SPA/MF
// nº 1.964, de 3 de julho de 2026, e à Portaria Interministerial MF/SECOM/MJSP nº 73,
// de 10 de julho de 2026 (art. 4º, VII, "b", "c" e "d"). O que resta aqui é a
// persistência do placar (trigger_scores / trigger_pending_signals), mantida como
// registro interno. Ver src/pages/TriggersDisabledNotice.jsx.
//
// O masterScoring NÃO depende deste arquivo — ele importa src/analysis/triggerAnalysis.js
// direto, e segue funcionando normalmente.

import { buildTriggerMap } from '../src/analysis/triggerAnalysis.js';
import { getFullHistory } from './dbService.js';
import { query } from './db.js';

const TRIGGER_LOSS_THRESHOLD = 3; // 3 spins pra resolver (igual frontend)
// Confiança mínima para registrar um sinal no DB e contar no placar interno.
const MIN_CONFIDENCE = 50;
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

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
// Lock por source: impede processamento concorrente (igual motorScoreEngine).
// Em PM2 cluster cada worker tem seu próprio lock — a defesa atômica entre
// workers vem do partial unique index idx_trigger_pending_source_trigger_unresolved.
const processingLock = {};

/**
 * Processa triggers de uma source: detecta gatilhos, checa pendentes, persiste placar.
 */
export async function processTriggerSource(sourceName) {
  if (processingLock[sourceName]) return;
  processingLock[sourceName] = true;
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
  } catch (err) {
    console.error(`[Trigger ${sourceName}] Erro:`, err.message);
  } finally {
    processingLock[sourceName] = false;
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
      // ── 1 GATILHO POR VEZ ──────────────────────────────────────
      // Só emite um novo sinal se NÃO houver nenhum pendente em aberto
      // nesta source. O próximo gatilho só dispara depois que o anterior
      // fechar (win/loss). resolvedInBatch cobre o caso de um pendente que
      // resolveu neste MESMO batch — aí o gatilho deste spin já pode abrir.
      const hasOpenPending = pending.some(p => !resolvedInBatch.has(p.id));
      if (hasOpenPending) continue;

      const covered = profile.bestPattern.coveredNumbers;
      const bp = profile.bestPattern;
      // INSERT atômico: partial unique index idx_trigger_pending_source_trigger_unresolved
      // impede 2 pendentes para mesmo (source, trigger_number). ON CONFLICT DO NOTHING
      // elimina race condition entre workers do PM2 cluster.
      const { rows: insertedRows } = await query(
        `INSERT INTO trigger_pending_signals
         (source, trigger_number, covered_numbers, pattern_label, confidence, lift)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (source, trigger_number) WHERE resolved = FALSE DO NOTHING
         RETURNING id`,
        [source, num, covered, bp.label, bp.confidence, bp.lift]
      );

      // Adiciona o novo sinal ao array pending para que spins subsequentes
      // do mesmo batch o detectem (antes era ignorado).
      // Quando há ON CONFLICT, insertedRows fica vazio — sem registro novo.
      if (insertedRows[0]) {
        pending.push({
          id: insertedRows[0].id,
          trigger_number: num,
          covered_numbers: covered,
          spins_after: 0,
        });
        console.log(`[Trigger ${source}] Sinal registrado: trigger=${num} covered=[${covered.join(',')}] (${bp.label})`);
      }
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
