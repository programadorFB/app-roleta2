// services/triggerAnalysis.js — v3 OPTIMIZED
//
// ═══════════════════════════════════════════════════════════
// v3 CHANGES:
// ✅ PERF: getNeighbors pré-computado no startup (era chamado ~5500x por build)
// ✅ PERF: Hit count via Set lookup em vez de .filter() por combinação
// ✅ FIX:  Backtest com validFor (era só 1 spin à frente — subestimava acertos)
// ✅ FIX:  PHYSICAL_WHEEL importado de constants (era duplicado)
// ─── v2 mantidos:
// ✅ Backtest train/test split (sem data leakage)
// ✅ MIN_APPEARANCES = 20
// ✅ Chi-square p < 0.05
// ✅ MIN_LIFT_PP = 5
// ═══════════════════════════════════════════════════════════

import { PHYSICAL_WHEEL, RED_NUMBERS } from '../constants/roulette';

const WHEEL_SIZE = PHYSICAL_WHEEL.length; // 37

// ── Terminal groups (constante) ──────────────────────────────
const TERMINAL_GROUPS = {};
for (let t = 0; t <= 9; t++) {
  TERMINAL_GROUPS[t] = [];
  for (let n = 0; n <= 36; n++) {
    if (n % 10 === t) TERMINAL_GROUPS[t].push(n);
  }
}

// ── Constantes ───────────────────────────────────────────────
const DEFAULT_LOOKBACK = 2000;
const MIN_NEIGHBORS = 2;
const MAX_NEIGHBORS = 5;
const MIN_APPEARANCES = 20;
const MIN_LIFT_PP = 5;
const DEFAULT_VALID_FOR = 3; // ✅ NOVO: quantos spins à frente o backtest testa

// ══════════════════════════════════════════════════════════════
// ✅ PERF: Pré-computa vizinhos no startup do módulo
// 37 centros × 4 raios = 148 arrays, criados uma única vez
// Antes: getNeighbors era chamado ~5.500x por buildTriggerMap
// ══════════════════════════════════════════════════════════════

const NEIGHBOR_CACHE = new Map();

function getNeighborsCached(center, radius) {
  const key = center * 10 + radius; // unique key (center 0-36, radius 2-5)
  if (NEIGHBOR_CACHE.has(key)) return NEIGHBOR_CACHE.get(key);

  const idx = PHYSICAL_WHEEL.indexOf(center);
  if (idx === -1) return [];
  const result = [];
  for (let i = -radius; i <= radius; i++) {
    result.push(PHYSICAL_WHEEL[(idx + i + WHEEL_SIZE) % WHEEL_SIZE]);
  }
  NEIGHBOR_CACHE.set(key, result);
  return result;
}

// Pré-popula cache no load do módulo
for (let c = 0; c <= 36; c++) {
  for (let r = MIN_NEIGHBORS; r <= MAX_NEIGHBORS; r++) {
    getNeighborsCached(c, r);
  }
}

// ── Terminal expanded sets (também pré-computado) ────────────
const TERMINAL_EXPANDED_CACHE = new Map();

for (let t = 0; t <= 9; t++) {
  for (let vizRadius = 1; vizRadius <= 2; vizRadius++) {
    const expandedSet = new Set();
    TERMINAL_GROUPS[t].forEach(tn => {
      getNeighborsCached(tn, vizRadius).forEach(nn => expandedSet.add(nn));
    });
    TERMINAL_EXPANDED_CACHE.set(`${t}:${vizRadius}`, [...expandedSet]);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function getColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

function isStatisticallySignificant(hits, total, expectedRate) {
  if (total < MIN_APPEARANCES) return false;
  const expectedHits = (expectedRate / 100) * total;
  if (expectedHits === 0) return false;
  const chiSquare = Math.pow(hits - expectedHits, 2) / expectedHits;
  return chiSquare > 3.84; // p < 0.05
}

// ══════════════════════════════════════════════════════════════
// ✅ PERF: buildTriggerMap otimizado
//
// ANTES: Para cada centro×raio, fazia nextNumbers.filter(n => neighbors.includes(n))
//        → O(37 × 37 × 4 × avgAppearances) ≈ 13M comparações
//
// AGORA: Pré-computa um Set de nextNumbers por trigger, depois faz
//        contagem via Set.has() → O(37 × (37×4) × neighborSize) ≈ 100K ops
// ══════════════════════════════════════════════════════════════

export function buildTriggerMap(spinHistory, lookback = DEFAULT_LOOKBACK) {
  const triggerMap = new Map();
  const windowSize = Math.min(lookback, spinHistory.length);

  if (windowSize < 80) {
    for (let n = 0; n <= 36; n++) {
      triggerMap.set(n, { triggerNumber: n, appearances: 0, bestPattern: null });
    }
    return triggerMap;
  }

  const window = spinHistory.slice(0, windowSize);

  // ✅ PERF: Pré-computa nextNumbers para TODOS os triggers de uma vez
  const nextNumbersByTrigger = new Array(37);
  for (let n = 0; n <= 36; n++) nextNumbersByTrigger[n] = [];

  for (let i = 1; i < window.length; i++) {
    const triggerNum = window[i].number;
    if (triggerNum >= 0 && triggerNum <= 36) {
      nextNumbersByTrigger[triggerNum].push(window[i - 1].number);
    }
  }

  for (let triggerNum = 0; triggerNum <= 36; triggerNum++) {
    const nextNumbers = nextNumbersByTrigger[triggerNum];
    const appearances = nextNumbers.length;

    if (appearances < MIN_APPEARANCES) {
      triggerMap.set(triggerNum, { triggerNumber: triggerNum, appearances, bestPattern: null });
      continue;
    }

    // ✅ PERF: Conta ocorrências de cada número em nextNumbers (histogram)
    // Depois, para cada combinação, soma os hits via histogram lookup
    const histogram = new Uint16Array(37); // max 65535 aparições por número
    for (const n of nextNumbers) {
      if (n >= 0 && n <= 36) histogram[n]++;
    }

    // ── Teste 1: Regiões no cilindro ──
    let bestRegion = null;
    for (let center = 0; center <= 36; center++) {
      for (let radius = MIN_NEIGHBORS; radius <= MAX_NEIGHBORS; radius++) {
        const neighbors = getNeighborsCached(center, radius);

        // ✅ PERF: Soma hits via histogram em vez de .filter()
        let hits = 0;
        for (const n of neighbors) hits += histogram[n];

        const confidence = (hits / appearances) * 100;
        const expected = (neighbors.length / 37) * 100;
        const lift = confidence - expected;

        if (lift >= MIN_LIFT_PP && isStatisticallySignificant(hits, appearances, expected)) {
          if (!bestRegion || lift > bestRegion._lift) {
            bestRegion = {
              type: 'region', center, neighbors: radius, coveredNumbers: neighbors,
              hits, total: appearances,
              confidence: parseFloat(confidence.toFixed(1)),
              label: `${center} com ${radius} vizinhos`,
              _lift: lift, _expected: parseFloat(expected.toFixed(1)),
            };
          }
        }
      }
    }

    // ── Teste 2: Terminais + vizinhos opcionais ──
    let bestTerminal = null;
    for (let t = 0; t <= 9; t++) {
      const terminalNums = TERMINAL_GROUPS[t];

      // Terminal puro
      let hitsT = 0;
      for (const n of terminalNums) hitsT += histogram[n];

      const confT = (hitsT / appearances) * 100;
      const expectedT = (terminalNums.length / 37) * 100;
      const liftT = confT - expectedT;

      if (liftT >= MIN_LIFT_PP && isStatisticallySignificant(hitsT, appearances, expectedT)) {
        if (!bestTerminal || liftT > bestTerminal._lift) {
          bestTerminal = {
            type: 'terminal', center: t, neighbors: 0, coveredNumbers: terminalNums,
            hits: hitsT, total: appearances,
            confidence: parseFloat(confT.toFixed(1)),
            label: `Terminal ${t}`,
            _lift: liftT, _expected: parseFloat(expectedT.toFixed(1)),
          };
        }
      }

      // Terminal + vizinhos expandidos (pré-computados)
      for (let vizRadius = 1; vizRadius <= 2; vizRadius++) {
        const expandedArr = TERMINAL_EXPANDED_CACHE.get(`${t}:${vizRadius}`);

        let hitsE = 0;
        for (const n of expandedArr) hitsE += histogram[n];

        const confE = (hitsE / appearances) * 100;
        const expectedE = (expandedArr.length / 37) * 100;
        const liftE = confE - expectedE;

        if (liftE >= MIN_LIFT_PP && isStatisticallySignificant(hitsE, appearances, expectedE)) {
          if (!bestTerminal || liftE > bestTerminal._lift) {
            bestTerminal = {
              type: 'terminal', center: t, neighbors: vizRadius,
              coveredNumbers: expandedArr,
              hits: hitsE, total: appearances,
              confidence: parseFloat(confE.toFixed(1)),
              label: `Terminal ${t} + ${vizRadius} viz`,
              _lift: liftE, _expected: parseFloat(expectedE.toFixed(1)),
            };
          }
        }
      }
    }

    // Melhor padrão
    let bestPattern = null;
    if (bestRegion && bestTerminal) {
      bestPattern = bestRegion._lift >= bestTerminal._lift ? bestRegion : bestTerminal;
    } else {
      bestPattern = bestRegion || bestTerminal || null;
    }

    if (bestPattern) {
      const { _lift, _expected, ...clean } = bestPattern;
      clean.lift = parseFloat(_lift.toFixed(1));
      clean.expected = _expected;
      bestPattern = clean;
    }

    triggerMap.set(triggerNum, { triggerNumber: triggerNum, appearances, bestPattern });
  }

  return triggerMap;
}


/**
 * Verifica se o último spin dispara um gatilho.
 */
export function checkTrigger(triggerMap, lastNumber) {
  const profile = triggerMap.get(lastNumber);
  if (!profile || !profile.bestPattern) return null;
  const { bestPattern } = profile;
  return {
    trigger: lastNumber,
    triggerColor: getColor(lastNumber),
    action: bestPattern.label,
    type: bestPattern.type,
    coveredNumbers: bestPattern.coveredNumbers,
    confidence: bestPattern.confidence,
    lift: bestPattern.lift,
    expected: bestPattern.expected,
    hits: bestPattern.hits,
    total: bestPattern.total,
    center: bestPattern.center,
    neighbors: bestPattern.neighbors,
  };
}


/**
 * Lista todos os gatilhos ativos, ordenados por lift.
 */
export function getActiveTriggers(triggerMap) {
  const active = [];
  for (const [num, profile] of triggerMap) {
    if (profile.bestPattern) {
      active.push({
        triggerNumber: num,
        triggerColor: getColor(num),
        appearances: profile.appearances,
        ...profile.bestPattern,
      });
    }
  }
  active.sort((a, b) => (b.lift || 0) - (a.lift || 0));
  return active;
}


// ══════════════════════════════════════════════════════════════
// ✅ FIX: Backtest com validFor (era só 1 spin à frente)
//
// ANTES: Testava se o PRÓXIMO spin imediatamente caia nos números.
//        Na prática o usuário tem 2-4 spins para acertar.
//
// AGORA: Testa se ALGUM dos próximos `validFor` spins acerta.
//        Alinha com a lógica do MasterDashboard.
// ══════════════════════════════════════════════════════════════

export function backtestTriggers(spinHistory, _triggerMapUnused, testWindow = 200, validFor = DEFAULT_VALID_FOR) {
  const totalLen = spinHistory.length;

  if (totalLen < testWindow + 200) {
    return backtestSimple(spinHistory, testWindow, validFor);
  }

  // Split: test = últimas testWindow rodadas, train = resto
  const testSpins = spinHistory.slice(0, testWindow);
  const trainSpins = spinHistory.slice(testWindow);

  const trainMap = buildTriggerMap(trainSpins, DEFAULT_LOOKBACK);

  let wins = 0, losses = 0;

  for (let i = validFor; i < testSpins.length; i++) {
    const currentNum = testSpins[i].number;
    const profile = trainMap.get(currentNum);

    if (profile?.bestPattern) {
      const covered = profile.bestPattern.coveredNumbers;
      let hit = false;

      // ✅ FIX: Testa os próximos `validFor` spins
      for (let j = 1; j <= validFor; j++) {
        if (i - j < 0) break;
        if (covered.includes(testSpins[i - j].number)) {
          hit = true;
          break;
        }
      }

      if (hit) wins++;
      else losses++;
    }
  }

  const total = wins + losses;
  return {
    wins, losses, total,
    hitRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
    method: 'train-test-split',
    validFor,
    trainSize: trainSpins.length,
    testSize: testSpins.length,
  };
}

/**
 * Fallback simples quando não há dados suficientes para split.
 */
function backtestSimple(spinHistory, testWindow, validFor = DEFAULT_VALID_FOR) {
  const triggerMap = buildTriggerMap(spinHistory, DEFAULT_LOOKBACK);
  const limit = Math.min(testWindow, spinHistory.length - 1);
  let wins = 0, losses = 0;

  for (let i = validFor; i < limit; i++) {
    const currentNum = spinHistory[i].number;
    const profile = triggerMap.get(currentNum);

    if (profile?.bestPattern) {
      const covered = profile.bestPattern.coveredNumbers;
      let hit = false;

      for (let j = 1; j <= validFor; j++) {
        if (i - j < 0) break;
        if (covered.includes(spinHistory[i - j].number)) {
          hit = true;
          break;
        }
      }

      if (hit) wins++;
      else losses++;
    }
  }

  const total = wins + losses;
  return {
    wins, losses, total,
    hitRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
    method: 'in-sample',
    validFor,
    note: 'Dados insuficientes para split — resultado pode estar inflado',
  };
}