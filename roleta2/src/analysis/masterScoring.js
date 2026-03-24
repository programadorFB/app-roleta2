import { analyzeNeighborhood } from './NeighborAnalysis.js';
import { SECTORS } from './CroupieDetection.js';
import { HIDDEN_LEVELS } from '../constants/analysis.js';
import { buildTriggerMap, checkTrigger } from './triggerAnalysis.js';


// --- Funções de Análise (Lógica extraída dos componentes) ---

// Lógica de 'TerminalAnalysis'
function analyzeTerminals(spinHistory) {
  const totalSpins = spinHistory.length;
  let terminalStats = Array.from({ length: 10 }, (_, i) => ({ terminal: i, absence: totalSpins }));

  spinHistory.forEach((spin, index) => {
    const terminal = spin.number % 10;
    const stat = terminalStats.find(s => s.terminal === terminal);
    if (stat && stat.absence === totalSpins) {
      stat.absence = index;
    }
  });

  const sorted = terminalStats.sort((a, b) => b.absence - a.absence);
  const mostDue = sorted[0];
  const score = (mostDue.absence / 37) * 100;

  let status = '🟠';
  if (score > 120) status = '🟢';
  if (score > 80 && score <= 120) status = '🟡';

  // ✅ FIX: Retorna números reais do terminal mais devido em vez de strings 'TM5'.
  // Antes: ['TM5', 'TM3', 'TM1'] → filtradas pelo código de convergência (typeof !== 'number')
  //        Cavalos nunca contribuía números ao entrySignal.
  // Agora: números reais dos 2 terminais mais devendo → participam da convergência.
  const topTwoTerminals = sorted.slice(0, 2);
  const terminalNumbers = [];
  for (const t of topTwoTerminals) {
    for (let n = 0; n <= 36; n++) {
      if (n % 10 === t.terminal) terminalNumbers.push(n);
    }
  }

  return {
    name: 'Cavalos',
    score: Math.min(score, 100),
    status,
    signal: mostDue.absence > 25 ? `TM${mostDue.terminal} devendo` : 'OK',
    numbers: terminalNumbers
  };
}

// Lógica de 'SectorAnalysis'
function analyzeSectors(spinHistory) {
  const totalSpins = spinHistory.length;
  // ✅ FIX: Armazena os números junto ao coldestSector diretamente.
  // Antes: lookup posterior por nome era frágil (retornava [] se nome fosse '-').
  let coldestSector = { name: '-', spinsSinceLastHit: 0, numbers: [] };

  Object.entries(SECTORS).forEach(([, sector]) => {
    const lastHitIndex = spinHistory.findIndex(spin => sector.numbers.includes(spin.number));
    const spinsSinceLastHit = (lastHitIndex === -1) ? totalSpins : lastHitIndex;

    if (spinsSinceLastHit > coldestSector.spinsSinceLastHit) {
      coldestSector = { name: sector.name, spinsSinceLastHit, numbers: sector.numbers };
    }
  });

  const expectedAbsence = 37 / Object.keys(SECTORS).length;
  const rawScore = (coldestSector.spinsSinceLastHit / expectedAbsence) * 100;
  // Score visual logarítmico (não afeta status)
  const ratio = coldestSector.spinsSinceLastHit / expectedAbsence;
  const score = Math.min(100, Math.max(0, 50 * Math.log2(Math.max(1, ratio))));

  let status = '🟠';
  if (rawScore > 150) status = '🟢';
  if (rawScore > 100 && rawScore <= 150) status = '🟡';

  return {
    name: 'Setores',
    score,
    status,
    signal: `Setor ${coldestSector.name} devendo`,
    numbers: coldestSector.numbers
  };
}

// Lógica de 'AdvancedPatternsAnalysis' (Ocultos)
function analyzeHidden(spinHistory) {
  const totalSpins = spinHistory.length;
  let topOculto = { number: -1, absence: 0, level: { level: 0 } };

  for (let num = 0; num <= 36; num++) {
    const lastAppearance = spinHistory.findIndex(s => s.number === num);
    const absence = lastAppearance === -1 ? totalSpins : lastAppearance;
    if (absence > topOculto.absence) {
      topOculto = { number: num, absence };
    }
  }

  let level = { label: 'Nível 0', color: '#6b7280', level: 0 };
  for (const lvl of HIDDEN_LEVELS) {
    if (topOculto.absence >= lvl.min) {
      level = lvl;
      break;
    }
  }
  topOculto.level = level;

  const rawScore = (topOculto.level.level / HIDDEN_LEVELS.length) * 100;
  // Score visual logarítmico (não afeta status)
  const ratio = topOculto.absence / 37;
  const score = Math.min(100, Math.max(0, 50 * Math.log2(Math.max(1, ratio))));

  let status = '🟠';
  if (rawScore > 80) status = '🟢';
  if (rawScore > 50 && rawScore <= 80) status = '🟡';

  return {
    name: 'Ocultos',
    score,
    status,
    signal: `Nível ${topOculto.level.level} (${topOculto.number})`,
    numbers: [topOculto.number]
  };
}

// Lógica de 'triggerAnalysis' — sempre usa 300 spins, independente do filtro
const TRIGGER_LOOKBACK = 300;

function analyzeTriggers(spinHistory, fullHistory) {
  const triggerHistory = (fullHistory || spinHistory).slice(0, TRIGGER_LOOKBACK);
  if (!triggerHistory || triggerHistory.length < 10) {
    return { name: 'Gatilhos', score: 0, status: '🟠', signal: 'Aguardando dados...', numbers: [] };
  }

  const triggerMap = buildTriggerMap(triggerHistory);
  const lastNumber = spinHistory[0].number;
  const trigger = checkTrigger(triggerMap, lastNumber);

  if (!trigger) {
    return { name: 'Gatilhos', score: 0, status: '🟠', signal: 'Sem gatilho ativo', numbers: [] };
  }

  const score = trigger.confidence;

  let status = '🟠';
  if (trigger.lift >= 10) status = '🟢';
  else if (trigger.lift >= 6) status = '🟡';

  return {
    name: 'Gatilhos',
    score: Math.min(score, 100),
    status,
    signal: `${lastNumber} → ${trigger.action} (lift ${trigger.lift.toFixed(1)})`,
    numbers: trigger.coveredNumbers
  };
}

// Lógica de 'neighborhoodAnalysis'
function analyzeNeighbors(spinHistory) {
  // ✅ MELHORIA: 50→100 spins. 50 é pouco para 37 possibilidades, gera muito ruído.
  const patterns = analyzeNeighborhood(spinHistory, 2, 100);
  if (!patterns || patterns.length === 0) {
    return { name: 'Vizinhos', score: 0, status: '🟠', signal: 'Aguardando dados...', numbers: [] };
  }
  const bestBet = patterns[0];
  // Score visual logarítmico (não afeta status)
  const lift = bestBet.accuracy / 100; // accuracy é precision: (hitRate/expected)*100
  const score = Math.min(100, Math.max(0, 50 * Math.log2(Math.max(1, lift))));

  let status = '🟠';
  if (bestBet.status.key === 'confirmed') status = '🟢';
  if (bestBet.status.key === 'warning') status = '🟡';

  return {
    name: 'Vizinhos',
    score,
    status,
    signal: `${bestBet.center} (${bestBet.hitRate.toFixed(0)}%)`,
    numbers: bestBet.neighbors
  };
}


/**
 * Sistema de Scoring Principal
 * Roda as 5 análises e as compila.
 */
export const calculateMasterScore = (spinHistory, fullHistory) => {
  if (!spinHistory || spinHistory.length < 50) {
    return {
      globalAssertiveness: 0,
      totalSignals: 0,
      strategyScores: [],
      entrySignal: null
    };
  }

  // 1. Roda as 5 análises
  const strategyScores = [
    analyzeTerminals(spinHistory),
    analyzeSectors(spinHistory),
    analyzeNeighbors(spinHistory),
    analyzeHidden(spinHistory),
    analyzeTriggers(spinHistory, fullHistory)
  ];

  // 2. Calcula métricas globais
  const activeStrategies = strategyScores.filter(s => s.status === '🟢' || s.status === '🟡');
  const greenStrategies = strategyScores.filter(s => s.status === '🟢');
  const totalSignals = activeStrategies.length;

  let globalAssertiveness = 0;
  if (totalSignals > 0) {
    globalAssertiveness = activeStrategies.reduce((acc, s) => acc + s.score, 0) / totalSignals;
  }

  // 3. Verifica Sinal de Entrada (Convergência)
  let entrySignal = null;
  const convergenceCount = greenStrategies.length;

  // Threshold: 3 de 5 estratégias verdes para sinal
  if (convergenceCount >= 3) {

    let suggestedNumbers = [];
    greenStrategies.forEach(s => {
      suggestedNumbers.push(...s.numbers);
    });

    const numberCounts = suggestedNumbers.reduce((acc, num) => {
      // Ignora strings como 'TM5'
      if (typeof num === 'number') {
        acc[num] = (acc[num] || 0) + 1;
      }
      return acc;
    }, {});

    const top5Numbers = Object.entries(numberCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => parseInt(entry[0]));

    entrySignal = {
      convergence: convergenceCount,
      suggestedNumbers: top5Numbers,
      confidence: globalAssertiveness,
      validFor: 3, // Alinhado com LOSS_THRESHOLD=3 do motorScoreEngine
      reason: `${convergenceCount} estratégias alinhadas`
    };
  }

  return {
    globalAssertiveness,
    totalSignals,
    strategyScores,
    entrySignal
  };
};
