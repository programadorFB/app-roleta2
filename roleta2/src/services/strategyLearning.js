

import { calculateMasterScore } from './masterScoring.jsx';
import { PHYSICAL_WHEEL } from './CroupieDetection.jsx';


const getCoveredNumbers = (targets, neighborMode) => {
  if (neighborMode === 0) return targets;
  const covered = new Set();
  targets.forEach(num => {
    covered.add(num);
    const idx = PHYSICAL_WHEEL.indexOf(num);
    if (idx === -1) return;
    for (let i = 1; i <= neighborMode; i++) {
      covered.add(PHYSICAL_WHEEL[(idx + i) % 37]);
      covered.add(PHYSICAL_WHEEL[(idx - i + 37) % 37]);
    }
  });
  return Array.from(covered);
};

// Gera todas as combinações de N elementos de um array
function combinations(arr, minSize, maxSize) {
  const results = [];
  const len = arr.length;
  // Bitmask approach para sets pequenos (5 estratégias = 32 combos max)
  for (let mask = 1; mask < (1 << len); mask++) {
    const combo = [];
    for (let i = 0; i < len; i++) {
      if (mask & (1 << i)) combo.push(arr[i]);
    }
    if (combo.length >= minSize && combo.length <= maxSize) {
      results.push(combo);
    }
  }
  return results;
}


/**
 * Motor principal de aprendizado.
 * 
 * Percorre o histórico simulando o que masterScoring TERIA dito em cada ponto,
 * e verifica se os números sugeridos realmente acertaram.
 * 
 * @param {Array} spinHistory - Histórico completo (index 0 = mais recente)
 * @param {number} neighborMode - Modo vizinhos (0, 1, 2)
 * @returns {LearnedProfile} - Perfil aprendido com pesos e parâmetros ótimos
 */
export function learnFromHistory(spinHistory, neighborMode = 0) {
  const MIN_HISTORY = 80; // Precisa de pelo menos 80 spins pro backtest ter significância
  const BACKTEST_DEPTH = Math.min(spinHistory.length - 50, 3000); // Máx 3000 pontos de análise

  if (!spinHistory || spinHistory.length < MIN_HISTORY || BACKTEST_DEPTH < 10) {
    return getDefaultProfile();
  }

  // ═══ Estruturas de tracking ═══
  const strategyStats = {}; // { 'Cavalos': { greenCount, wins, losses, numberHits: {} } }
  const comboStats = {};    // { 'Cavalos+Ocultos+Vizinhos': { count, wins, losses, bestValidFor } }
  const validForStats = {}; // { '2': { wins, total }, '3': ... }

  // ═══ Backtest loop ═══
  for (let i = BACKTEST_DEPTH; i >= 4; i--) {
    // Simula o estado do histórico naquele ponto
    const pastHistory = spinHistory.slice(i);

    // Roda masterScoring nesse snapshot
    const analysis = calculateMasterScore(pastHistory);
    if (!analysis || !analysis.strategyScores || analysis.strategyScores.length === 0) continue;

    const greenStrategies = analysis.strategyScores.filter(s => s.status === '🟢');
    if (greenStrategies.length === 0) continue;

    // ─── Per-strategy tracking ───
    for (const strat of analysis.strategyScores) {
      if (!strategyStats[strat.name]) {
        strategyStats[strat.name] = {
          greenCount: 0, wins: 0, losses: 0,
          numberHits: {}, numberTotal: {},
          avgScore: 0, scoreSum: 0,
        };
      }

      const ss = strategyStats[strat.name];

      if (strat.status === '🟢') {
        ss.greenCount++;
        ss.scoreSum += strat.score;

        // Verifica se ALGUM número sugerido por essa estratégia acertou nos próximos spins
        const expandedNums = getCoveredNumbers(
          strat.numbers.filter(n => typeof n === 'number'),
          neighborMode
        );

        // Testa validFor de 1 a 4
        let hitAny = false;
        for (let v = 1; v <= 4; v++) {
          if (i - v < 0) break;
          const resultNum = spinHistory[i - v].number;
          if (expandedNums.includes(resultNum)) {
            hitAny = true;
            break;
          }
        }

        if (hitAny) ss.wins++;
        else ss.losses++;

        // Track per-number hit rate
        expandedNums.forEach(num => {
          if (!ss.numberTotal[num]) { ss.numberTotal[num] = 0; ss.numberHits[num] = 0; }
          ss.numberTotal[num]++;
          // Verifica se esse número específico saiu
          for (let v = 1; v <= 3; v++) {
            if (i - v < 0) break;
            if (spinHistory[i - v].number === num) {
              ss.numberHits[num]++;
              break;
            }
          }
        });
      }
    }

    // ─── Combination tracking ───
    if (greenStrategies.length >= 2) {
      const greenNames = greenStrategies.map(s => s.name).sort();
      const comboKey = greenNames.join('+');

      if (!comboStats[comboKey]) {
        comboStats[comboKey] = {
          strategies: greenNames,
          count: 0,
          winsByValidFor: { 1: 0, 2: 0, 3: 0, 4: 0 },
          losses: 0,
        };
      }

      const cs = comboStats[comboKey];
      cs.count++;

      // Coleta números da combinação (merge de todas as estratégias verdes)
      const allNums = [];
      greenStrategies.forEach(s => {
        s.numbers.filter(n => typeof n === 'number').forEach(n => allNums.push(n));
      });
      const expandedCombo = getCoveredNumbers([...new Set(allNums)], neighborMode);

      // Testa cada validFor
      let hitAtAll = false;
      for (let v = 1; v <= 4; v++) {
        if (i - v < 0) break;
        const resultNum = spinHistory[i - v].number;
        if (expandedCombo.includes(resultNum)) {
          cs.winsByValidFor[v]++;
          hitAtAll = true;
          break; // Conta uma vez só (primeiro hit)
        }
      }
      if (!hitAtAll) cs.losses++;
    }

    // ─── ValidFor global tracking ───
    if (analysis.entrySignal) {
      const entryNums = getCoveredNumbers(analysis.entrySignal.suggestedNumbers, neighborMode);
      for (let v = 1; v <= 4; v++) {
        const vKey = String(v);
        if (!validForStats[vKey]) validForStats[vKey] = { wins: 0, total: 0 };
        validForStats[vKey].total++;
        if (i - v >= 0 && entryNums.includes(spinHistory[i - v].number)) {
          validForStats[vKey].wins++;
        }
      }
    }
  }

  // ═══ Computa resultados ═══
  return buildProfile(strategyStats, comboStats, validForStats);
}


/**
 * Constrói o perfil aprendido a partir dos dados brutos do backtest
 */
function buildProfile(strategyStats, comboStats, validForStats) {
  // ─── 1. Pesos por estratégia (baseado em win rate individual) ───
  const strategyWeights = {};
  const strategyAccuracy = {};
  let totalAccuracy = 0;
  let stratCount = 0;

  Object.entries(strategyStats).forEach(([name, stats]) => {
    const total = stats.wins + stats.losses;
    const accuracy = total > 0 ? (stats.wins / total) * 100 : 50; // Default 50% se sem dados
    const avgScore = stats.greenCount > 0 ? stats.scoreSum / stats.greenCount : 0;

    strategyAccuracy[name] = {
      accuracy: Math.round(accuracy * 10) / 10,
      wins: stats.wins,
      losses: stats.losses,
      greenCount: stats.greenCount,
      avgScore: Math.round(avgScore),
    };

    totalAccuracy += accuracy;
    stratCount++;
  });

  // Normaliza pesos (estratégia com mais acertos ganha mais peso)
  const avgAcc = stratCount > 0 ? totalAccuracy / stratCount : 50;
  Object.entries(strategyAccuracy).forEach(([name, data]) => {
    // Peso = accuracy relativa à média. >1 = acima da média, <1 = abaixo
    strategyWeights[name] = data.accuracy > 0 ? data.accuracy / avgAcc : 0.5;
  });

  // ─── 2. Melhor combinação ───
  let bestCombo = null;
  let bestComboRate = 0;

  Object.entries(comboStats).forEach(([key, stats]) => {
    if (stats.count < 3) return; // Precisa de pelo menos 3 ocorrências
    const totalWins = Object.values(stats.winsByValidFor).reduce((a, b) => a + b, 0);
    const winRate = (totalWins / stats.count) * 100;

    if (winRate > bestComboRate) {
      bestComboRate = winRate;

      // Encontra validFor ótimo (acumulativo)
      let bestVF = 2;
      let bestVFRate = 0;
      let cumWins = 0;
      for (let v = 1; v <= 4; v++) {
        cumWins += stats.winsByValidFor[v] || 0;
        const rate = (cumWins / stats.count) * 100;
        if (rate > bestVFRate) {
          bestVFRate = rate;
          bestVF = v;
        }
      }

      bestCombo = {
        strategies: stats.strategies,
        key,
        count: stats.count,
        winRate: Math.round(winRate * 10) / 10,
        optimalValidFor: bestVF,
        winRateAtOptimalVF: Math.round(bestVFRate * 10) / 10,
      };
    }
  });

  // ─── 3. Convergence threshold ótimo ───
  // Agrupa combos por tamanho (2, 3, 4, 5 estratégias)
  const thresholdPerformance = {};
  Object.entries(comboStats).forEach(([key, stats]) => {
    if (stats.count < 2) return;
    const size = stats.strategies.length;
    if (!thresholdPerformance[size]) {
      thresholdPerformance[size] = { totalWins: 0, totalCount: 0 };
    }
    const wins = Object.values(stats.winsByValidFor).reduce((a, b) => a + b, 0);
    thresholdPerformance[size].totalWins += wins;
    thresholdPerformance[size].totalCount += stats.count;
  });

  let bestThreshold = 3; // Default
  let bestThresholdRate = 0;
  Object.entries(thresholdPerformance).forEach(([size, data]) => {
    const rate = data.totalCount > 0 ? (data.totalWins / data.totalCount) * 100 : 0;
    if (rate > bestThresholdRate && data.totalCount >= 3) {
      bestThresholdRate = rate;
      bestThreshold = parseInt(size);
    }
  });

  // ─── 4. ValidFor global ótimo ───
  let optimalValidFor = 2;
  let bestVFGlobalRate = 0;
  let cumWinsGlobal = 0;
  for (let v = 1; v <= 4; v++) {
    const vData = validForStats[String(v)];
    if (vData) {
      cumWinsGlobal += vData.wins;
      const rate = vData.total > 0 ? (cumWinsGlobal / vData.total) * 100 : 0;
      if (rate > bestVFGlobalRate) {
        bestVFGlobalRate = rate;
        optimalValidFor = v;
      }
    }
  }

  // ─── 5. Top numbers por estratégia ───
  const numberRankings = {};
  Object.entries(strategyStats).forEach(([name, stats]) => {
    const ranked = Object.entries(stats.numberTotal)
      .filter(([_, total]) => total >= 3) // Mínimo 3 aparições
      .map(([num, total]) => ({
        number: parseInt(num),
        total,
        hits: stats.numberHits[num] || 0,
        hitRate: ((stats.numberHits[num] || 0) / total) * 100,
      }))
      .sort((a, b) => b.hitRate - a.hitRate)
      .slice(0, 10);

    numberRankings[name] = ranked;
  });

  // ─── 6. All combos ranked ───
  const allCombosRanked = Object.entries(comboStats)
    .filter(([_, s]) => s.count >= 2)
    .map(([key, stats]) => {
      const totalWins = Object.values(stats.winsByValidFor).reduce((a, b) => a + b, 0);
      return {
        key,
        strategies: stats.strategies,
        count: stats.count,
        winRate: Math.round((totalWins / stats.count) * 100 * 10) / 10,
        losses: stats.losses,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);

  return {
    strategyWeights,
    strategyAccuracy,
    bestCombo,
    bestConvergenceThreshold: bestThreshold,
    bestConvergenceRate: Math.round(bestThresholdRate * 10) / 10,
    optimalValidFor,
    optimalValidForRate: Math.round(bestVFGlobalRate * 10) / 10,
    numberRankings,
    allCombosRanked: allCombosRanked.slice(0, 10),
    thresholdPerformance,
    backtestPoints: Object.values(strategyStats).reduce((max, s) => Math.max(max, s.greenCount), 0),
    timestamp: Date.now(),
  };
}


/**
 * Perfil default quando não há dados suficientes
 */
function getDefaultProfile() {
  return {
    strategyWeights: {
      Cavalos: 1, Setores: 1, Vizinhos: 1, Ocultos: 1, Croupier: 1,
    },
    strategyAccuracy: {},
    bestCombo: null,
    bestConvergenceThreshold: 3,
    bestConvergenceRate: 0,
    optimalValidFor: 2,
    optimalValidForRate: 0,
    numberRankings: {},
    allCombosRanked: [],
    thresholdPerformance: {},
    backtestPoints: 0,
    timestamp: Date.now(),
  };
}


/**
 * Versão ADAPTATIVA do calculateMasterScore que usa o perfil aprendido.
 * 
 * Diferenças do original:
 *   - Convergence threshold vem do perfil (não fixo em 3)
 *   - Números são priorizados pelo hit rate histórico de cada estratégia
 *   - validFor vem do perfil (não fixo)
 *   - Confidence é ponderada pelos pesos aprendidos
 *   - suggestedNumbers são rankeados por peso da estratégia que os sugeriu
 */
export function calculateAdaptiveScore(spinHistory, profile) {
  // Usa o masterScoring base para obter as 5 análises
  const baseResult = calculateMasterScore(spinHistory);
  if (!baseResult || !baseResult.strategyScores || baseResult.strategyScores.length === 0) {
    return baseResult;
  }

  const { strategyScores } = baseResult;
  const weights = profile.strategyWeights || {};

  // Recalcula globalAssertiveness com pesos aprendidos
  const activeStrategies = strategyScores.filter(
    s => s.status === '🟢' || s.status === '🟡'
  );
  const greenStrategies = strategyScores.filter(s => s.status === '🟢');

  let weightedAssertiveness = 0;
  let totalWeight = 0;
  activeStrategies.forEach(s => {
    const w = weights[s.name] || 1;
    weightedAssertiveness += s.score * w;
    totalWeight += w;
  });
  const globalAssertiveness = totalWeight > 0 ? weightedAssertiveness / totalWeight : 0;

  // Usa threshold aprendido
  const convergenceThreshold = profile.bestConvergenceThreshold || 3;
  const convergenceCount = greenStrategies.length;

  let entrySignal = null;

  if (convergenceCount >= convergenceThreshold) {
    // Coleta números com peso da estratégia que os sugeriu
    const weightedNumbers = {};

    greenStrategies.forEach(s => {
      const w = weights[s.name] || 1;
      const stratAccuracy = profile.strategyAccuracy?.[s.name]?.accuracy || 50;

      if (Array.isArray(s.numbers)) {
        s.numbers.forEach(num => {
          if (typeof num === 'number' && num >= 0 && num <= 36) {
            // Peso = peso da estratégia × accuracy × convergência count do número
            if (!weightedNumbers[num]) weightedNumbers[num] = 0;
            weightedNumbers[num] += w * (stratAccuracy / 100);
          }
        });
      }
    });

    // Boost numbers que aparecem no numberRankings com alto hitRate
    Object.entries(profile.numberRankings || {}).forEach(([stratName, rankings]) => {
      if (!greenStrategies.find(s => s.name === stratName)) return;
      rankings.forEach(r => {
        if (weightedNumbers[r.number] !== undefined) {
          // Boost de até 50% se o número tem hitRate > 30%
          weightedNumbers[r.number] *= 1 + Math.min(0.5, r.hitRate / 100);
        }
      });
    });

    // Top 5 por peso total
    const top5Numbers = Object.entries(weightedNumbers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([num]) => parseInt(num));

    // ValidFor adaptativo
    const validFor = profile.optimalValidFor || Math.min(convergenceCount - 1, 4);

    // Verifica se essa combo específica tem histórico
    const comboKey = greenStrategies.map(s => s.name).sort().join('+');
    const comboData = profile.allCombosRanked?.find(c => c.key === comboKey);

    entrySignal = {
      convergence: convergenceCount,
      suggestedNumbers: top5Numbers,
      confidence: globalAssertiveness,
      validFor,
      reason: `${convergenceCount} estratégias (threshold: ${convergenceThreshold})`,
      // Metadata de aprendizado (para debug/UI)
      learned: {
        comboKey,
        comboWinRate: comboData?.winRate || null,
        comboSamples: comboData?.count || 0,
        usedWeights: greenStrategies.map(s => ({
          name: s.name,
          weight: (weights[s.name] || 1).toFixed(2),
          accuracy: profile.strategyAccuracy?.[s.name]?.accuracy || '?',
        })),
      },
    };
  }

  return {
    ...baseResult,
    globalAssertiveness,
    entrySignal,
    profile, // Inclui o perfil para a UI poder mostrar dados de aprendizado
  };
}
