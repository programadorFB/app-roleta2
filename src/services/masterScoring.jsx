// services/masterScoring.js

// Importa lógicas de análise existentes
import { analyzeCroupierPattern } from './CroupieDetection.jsx';
import { analyzeNeighborhood } from './NeighborAnalysis.jsx';

// Importa constantes de outros módulos
import { SECTORS } from './CroupieDetection.jsx'; // Usado para 'Setores'
// Removed FiboNasa import
import { HIDDEN_LEVELS } from '../components/AdvancedPatternsAnalysis.jsx'; // (Ajuste o caminho)


// --- Funções de Análise (Lógica extraída dos componentes) ---

// Lógica de 'TerminalAnalysis.jsx'
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

  const mostDue = terminalStats.sort((a, b) => b.absence - a.absence)[0];
  const score = (mostDue.absence / 37) * 100;

  let status = '🟠';
  if (score > 120) status = '🟢';
  if (score > 80 && score <= 120) status = '🟡';

  return {
    name: 'Cavalos',
    score: Math.min(score, 100),
    status,
    signal: mostDue.absence > 25 ? `TM${mostDue.terminal} devendo` : 'OK',
    numbers: terminalStats.slice(0, 3).map(t => `TM${t.terminal}`)
  };
}

// Lógica de 'SectorAnalysis.jsx'
function analyzeSectors(spinHistory) {
  const totalSpins = spinHistory.length;
  let coldestSector = { name: '-', spinsSinceLastHit: 0 };
  let minHits = totalSpins;

  Object.values(SECTORS).forEach(sector => {
    const lastHitIndex = spinHistory.findIndex(spin => sector.numbers.includes(spin.number));
    const spinsSinceLastHit = (lastHitIndex === -1) ? totalSpins : lastHitIndex;

    if (spinsSinceLastHit > coldestSector.spinsSinceLastHit) {
      coldestSector = { name: sector.name, spinsSinceLastHit };
    }
  });

  const expectedAbsence = 37 / Object.keys(SECTORS).length;
  const score = (coldestSector.spinsSinceLastHit / expectedAbsence) * 100;

  let status = '🟠';
  if (score > 150) status = '🟢';
  if (score > 100 && score <= 150) status = '🟡';

  return {
    name: 'Setores',
    score: Math.min(score, 100),
    status,
    signal: `Setor ${coldestSector.name} devendo`,
    numbers: SECTORS[Object.keys(SECTORS).find(key => SECTORS[key].name === coldestSector.name)]?.numbers || []
  };
}

// Removed analyzeFiboNasa function

// Lógica de 'AdvancedPatternsAnalysis.jsx' (Ocultos)
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

  const score = (topOculto.level.level / HIDDEN_LEVELS.length) * 100;

  let status = '🟠';
  if (score > 80) status = '🟢';
  if (score > 50 && score <= 80) status = '🟡';

  return {
    name: 'Ocultos',
    score,
    status,
    signal: `Nível ${topOculto.level.level} (${topOculto.number})`,
    numbers: [topOculto.number]
  };
}

// Lógica de 'croupierDetection.js'
function analyzeCroupier(spinHistory) {
  const analysis = analyzeCroupierPattern(spinHistory, 30);
  const score = analysis.accuracy;

  let status = '🟠';
  if (analysis.status === 'MUITO ATIVO') status = '🟢';
  if (analysis.status === 'MODERADO') status = '🟡';

  return {
    name: 'Croupier',
    score,
    status,
    signal: analysis.statusLabel,
    numbers: analysis.suggestedNumbers
  };
}

// Lógica de 'neighborhoodAnalysis.js'
function analyzeNeighbors(spinHistory) {
  const patterns = analyzeNeighborhood(spinHistory, 2, 50);
  // Handle case where patterns might be empty if not enough spins
  if (!patterns || patterns.length === 0) {
      return { name: 'Vizinhos', score: 0, status: '🟠', signal: 'Aguardando dados...', numbers: [] };
  }
  const bestBet = patterns[0];
  const score = Math.max(0, (bestBet.accuracy - 50) / 1.5);

  let status = '🟠';
  if (bestBet.status.key === 'confirmed') status = '🟢';
  if (bestBet.status.key === 'warning') status = '🟡';

  return {
    name: 'Vizinhos',
    score: Math.min(score, 100),
    status,
    signal: `${bestBet.center} (${bestBet.hitRate.toFixed(0)}%)`,
    numbers: bestBet.neighbors
  };
}


/**
 * REQ 2: Sistema de Scoring Principal (Sem FiboNasa)
 * Roda as 5 análises restantes e as compila.
 */
export const calculateMasterScore = (spinHistory) => {
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
    // FiboNasa removido daqui
    analyzeHidden(spinHistory),
    analyzeCroupier(spinHistory)
  ];

  // 2. Calcula métricas globais
  const activeStrategies = strategyScores.filter(s => s.status === '🟢' || s.status === '🟡');
  const greenStrategies = strategyScores.filter(s => s.status === '🟢');
  const totalSignals = activeStrategies.length; // Agora de 5

  let globalAssertiveness = 0;
  if (totalSignals > 0) {
    globalAssertiveness = activeStrategies.reduce((acc, s) => acc + s.score, 0) / totalSignals;
  }

  // 3. Verifica Sinal de Entrada (Convergência)
  let entrySignal = null;
  const convergenceCount = greenStrategies.length;

  // Ajustado o threshold para 3 (de 5) estratégias verdes para sinal
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
      validFor: 2,
      reason: `${convergenceCount} estratégias alinhadas`
    };
  }

  return {
    globalAssertiveness,
    totalSignals, // Será no máximo 5
    strategyScores,
    entrySignal
  };
};