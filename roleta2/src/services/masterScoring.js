import { analyzeCroupierPattern } from './CroupieDetection.js';
import { analyzeNeighborhood } from './NeighborAnalysis.js';
import { SECTORS } from './CroupieDetection.js';
import { HIDDEN_LEVELS } from '../constants/analysis.js';

// Mapeamento terminal → números da roleta
const TERMINAL_NUMBERS = {};
for (let i = 0; i <= 36; i++) {
  const t = i % 10;
  if (!TERMINAL_NUMBERS[t]) TERMINAL_NUMBERS[t] = [];
  TERMINAL_NUMBERS[t].push(i);
}

// ───────────────────────────────────────
// 1. CAVALOS (Terminais)
// ───────────────────────────────────────
function analyzeTerminals(spinHistory) {
  const totalSpins = spinHistory.length;
  const terminalStats = Array.from({ length: 10 }, (_, i) => ({
    terminal: i,
    absence: totalSpins,
  }));

  spinHistory.forEach((spin, index) => {
    const terminal = spin.number % 10;
    const stat = terminalStats[terminal];
    if (stat.absence === totalSpins) {
      stat.absence = index;
    }
  });

  // Ordena por maior ausência
  terminalStats.sort((a, b) => b.absence - a.absence);
  const mostDue = terminalStats[0];

  const terminalSize = TERMINAL_NUMBERS[mostDue.terminal].length;
  const expectedAbsence = 37 / terminalSize; 
  const rawScore = (mostDue.absence / expectedAbsence) * 100;

  let status = '🟠';
  if (rawScore >= 120) status = '🟢';
  else if (rawScore >= 80) status = '🟡';

  const topNumbers = [];
  for (let i = 0; i < Math.min(3, terminalStats.length); i++) {
    const t = terminalStats[i].terminal;
    topNumbers.push(...TERMINAL_NUMBERS[t]);
  }

  return {
    name: 'Cavalos',
    score: Math.min(rawScore, 100),
    status,
    signal: mostDue.absence > 25
      ? `Terminal ${mostDue.terminal} devendo (${mostDue.absence} spins)`
      : 'OK',
    numbers: topNumbers,
    raw: { mostDue, terminalStats: terminalStats.slice(0, 5) },
  };
}

// ───────────────────────────────────────
// 2. SETORES
// ───────────────────────────────────────
function analyzeSectors(spinHistory) {
  const totalSpins = spinHistory.length;
  let coldestSector = { key: null, name: '-', spinsSinceLastHit: 0, numbers: [] };

  Object.entries(SECTORS).forEach(([key, sector]) => {
    const lastHitIndex = spinHistory.findIndex(spin =>
      sector.numbers.includes(spin.number)
    );
    const spinsSinceLastHit = lastHitIndex === -1 ? totalSpins : lastHitIndex;

    if (spinsSinceLastHit > coldestSector.spinsSinceLastHit) {
      coldestSector = {
        key,
        name: sector.name,
        spinsSinceLastHit,
        numbers: sector.numbers,
      };
    }
  });

  const expectedAbsence = 37 / (coldestSector.numbers.length || 1); 
  const rawScore = (coldestSector.spinsSinceLastHit / expectedAbsence) * 100;

  let status = '🟠';
  if (rawScore >= 150) status = '🟢';
  else if (rawScore >= 100) status = '🟡';

  return {
    name: 'Setores',
    score: Math.min(rawScore, 100),
    status,
    signal: `${coldestSector.name} devendo (${coldestSector.spinsSinceLastHit} spins)`,
    numbers: coldestSector.numbers,
    raw: { coldestSector },
  };
}

// ───────────────────────────────────────
// 3. VIZINHOS
// ───────────────────────────────────────
function analyzeNeighbors(spinHistory) {
  const patterns = analyzeNeighborhood(spinHistory, 2, 50);
  if (!patterns || patterns.length === 0) {
    return {
      name: 'Vizinhos',
      score: 0,
      status: '🟠',
      signal: 'Aguardando dados...',
      numbers: [],
    };
  }

  const bestBet = patterns[0];

  const expectedRate = (5 / 37) * 100;
  const lift = bestBet.hitRate / expectedRate; 
  const rawScore = Math.max(0, Math.min(100, (lift - 1) * 100)); 

  let status = '🟠';
  if (bestBet.status.key === 'confirmed') status = '🟢';
  else if (bestBet.status.key === 'warning') status = '🟡';

  return {
    name: 'Vizinhos',
    score: rawScore,
    status,
    signal: `${bestBet.center} (${bestBet.hitRate.toFixed(0)}%)`,
    numbers: bestBet.neighbors,
    raw: { bestBet },
  };
}

// ───────────────────────────────────────
// 4. OCULTOS
// ───────────────────────────────────────
function analyzeHidden(spinHistory) {
  const totalSpins = spinHistory.length;
  const allOcultos = [];

  for (let num = 0; num <= 36; num++) {
    const lastAppearance = spinHistory.findIndex(s => s.number === num);
    const absence = lastAppearance === -1 ? totalSpins : lastAppearance;
    allOcultos.push({ number: num, absence });
  }

  allOcultos.sort((a, b) => b.absence - a.absence);
  const topOculto = allOcultos[0];

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
  else if (score > 50) status = '🟡';

  const top5Numbers = allOcultos.slice(0, 5).map(o => o.number);

  return {
    name: 'Ocultos',
    score,
    status,
    signal: `Nível ${topOculto.level.level} (${topOculto.number} — ${topOculto.absence} spins)`,
    numbers: top5Numbers,
    raw: { topOculto, top5: allOcultos.slice(0, 5) },
  };
}

// ───────────────────────────────────────
// 5. CROUPIER
// ───────────────────────────────────────
function analyzeCroupier(spinHistory) {
  const analysis = analyzeCroupierPattern(spinHistory, 50);

  const expectedRate = (6 / 37) * 100;
  let rawScore = 0;

  if (analysis.accuracy > 0) {
    const precision = analysis.precision || (analysis.accuracy / expectedRate) * 100;
    rawScore = Math.max(0, Math.min(100, (precision - 100) * 2));
  }

  let status = '🟠';
  if (analysis.status === 'MUITO_ATIVO' || analysis.status === 'ATIVO') status = '🟢';
  else if (analysis.status === 'MODERADO') status = '🟡';

  return {
    name: 'Croupier',
    score: rawScore,
    status,
    signal: analysis.statusLabel || 'Aguardando...',
    numbers: analysis.suggestedNumbers || [],
    raw: analysis,
  };
}

// ═══════════════════════════════════════════════════════════
// SISTEMA DE SCORING PRINCIPAL
// ═══════════════════════════════════════════════════════════

export const calculateMasterScore = (spinHistory) => {
  if (!spinHistory || spinHistory.length < 50) {
    return {
      globalAssertiveness: 0,
      totalSignals: 0,
      strategyScores: [],
      entrySignal: null,
    };
  }

  const normalizedHistory = [...spinHistory];

  const strategyScores = [
    analyzeTerminals(normalizedHistory),
    analyzeSectors(normalizedHistory),
    analyzeNeighbors(normalizedHistory),
    analyzeHidden(normalizedHistory),
    analyzeCroupier(normalizedHistory),
  ];

  const activeStrategies = strategyScores.filter(
    s => s.status === '🟢' || s.status === '🟡'
  );
  const greenStrategies = strategyScores.filter(s => s.status === '🟢');
  const totalSignals = activeStrategies.length;

  let globalAssertiveness = 0;
  if (totalSignals > 0) {
    globalAssertiveness =
      activeStrategies.reduce((acc, s) => acc + s.score, 0) / totalSignals;
  }

  let entrySignal = null;
  const convergenceCount = greenStrategies.length;

  if (convergenceCount >= 3) {
    const suggestedNumbers = [];
    greenStrategies.forEach(s => {
      if (Array.isArray(s.numbers)) {
        s.numbers.forEach(num => {
          if (typeof num === 'number' && num >= 0 && num <= 36) {
            suggestedNumbers.push(num);
          }
        });
      }
    });

    const numberCounts = {};
    suggestedNumbers.forEach(num => {
      numberCounts[num] = (numberCounts[num] || 0) + 1;
    });

    // Função auxiliar para o desempate estável
    const getNumberAbsence = (num) => {
      const idx = normalizedHistory.findIndex(s => s.number === num);
      return idx === -1 ? normalizedHistory.length : idx;
    };

    const top5Numbers = Object.entries(numberCounts)
      .sort((a, b) => {
        // 1. Desempate primário: Frequência de vezes que foi sugerido
        if (b[1] !== a[1]) {
           return b[1] - a[1]; 
        }
        // 2. Desempate ESTÁVEL: Maior ausência no histórico ganha
        // Isso impede a renderização de ficar "piscando" e mantém o número mais atrasado no topo
        const absenceA = getNumberAbsence(parseInt(a[0]));
        const absenceB = getNumberAbsence(parseInt(b[0]));
        
        // Se a ausência também for igual, usa o próprio número para travar a posição
        if (absenceB !== absenceA) {
          return absenceB - absenceA;
        }
        return parseInt(b[0]) - parseInt(a[0]);
      })
      .slice(0, 5)
      .map(entry => parseInt(entry[0]));

    const validFor = Math.min(convergenceCount - 1, 4);

    entrySignal = {
      convergence: convergenceCount,
      suggestedNumbers: top5Numbers,
      confidence: globalAssertiveness,
      validFor,
      reason: `${convergenceCount} estratégias alinhadas (${greenStrategies.map(s => s.name).join(', ')})`,
    };
  }

  return {
    globalAssertiveness,
    totalSignals,
    strategyScores,
    entrySignal,
  };
};