// services/croupierDetection.js - VERSÃO MELHORADA

// SETORES BALANCEADOS (6 números cada)
export const SECTORS = {
  TM0: { name: 'Setor 0-21', numbers: [0, 32, 15, 19, 4, 21] },
  TM1: { name: 'Setor 2-27', numbers: [2, 25, 17, 34, 6, 27] },
  TM2: { name: 'Setor 13-23', numbers: [13, 36, 11, 30, 8, 23] },
  TM3: { name: 'Setor 10-1', numbers: [10, 5, 24, 16, 33, 1] },
  TM4: { name: 'Setor 20-18', numbers: [20, 14, 31, 9, 22, 18] },
  TM5: { name: 'Setor 29-26', numbers: [29, 7, 28, 12, 35, 3] }
};

const calculateSignificance = (observed, expected, sampleSize) => {
  const chiSquare = Math.pow(observed - expected, 2) / expected;
  return chiSquare > 3.84;
};

export const analyzeCroupierPattern = (spinHistory, spinsToAnalyze = 50) => {
  // REDUZIDO PARA 20
  const MINIMUM_SPINS = 20; 
  const NUMBERS_PER_SECTOR = 6;
  const TOTAL_NUMBERS = 37;
  const EXPECTED_RATE = (NUMBERS_PER_SECTOR / TOTAL_NUMBERS) * 100; // 16.22%
  
  if (!spinHistory || spinHistory.length < MINIMUM_SPINS) {
    return {
      status: 'AGUARDANDO',
      statusLabel: '⏸️ AGUARDANDO DADOS',
      message: `Necessário ${MINIMUM_SPINS} spins`,
      accuracy: 0,
      confidence: 0,
      regionName: '-',
      suggestedNumbers: [],
      sectorAnalysis: [],
      expectedRate: EXPECTED_RATE
    };
  }

  const recentSpins = spinHistory.slice(0, Math.min(spinsToAnalyze, spinHistory.length));
  const actualAnalyzed = recentSpins.length;
  const recentSpinNumbers = recentSpins.map(s => s.number || s);

  const sectorAnalysis = [];
  let bestSector = null;
  let highestDeviation = 0;

  for (const [key, sector] of Object.entries(SECTORS)) {
    const hits = recentSpinNumbers.filter(num => sector.numbers.includes(num)).length;
    const observedRate = (hits / actualAnalyzed) * 100;
    const expectedHits = (NUMBERS_PER_SECTOR / TOTAL_NUMBERS) * actualAnalyzed;
    const precision = (observedRate / EXPECTED_RATE) * 100;
    const deviation = Math.abs(observedRate - EXPECTED_RATE);
    const isSignificant = calculateSignificance(hits, expectedHits, actualAnalyzed);
    
    const analysis = {
      key, name: sector.name, numbers: sector.numbers, hits,
      observedRate, expectedRate: EXPECTED_RATE, precision, deviation, isSignificant,
      status: precision >= 130 && isSignificant ? 'hot' : 
              precision >= 115 ? 'warm' :
              precision >= 85 ? 'normal' :
              precision >= 70 ? 'cool' : 'cold'
    };
    
    sectorAnalysis.push(analysis);
    
    if (precision > 100 && deviation > highestDeviation && isSignificant) {
      highestDeviation = deviation;
      bestSector = analysis;
    }
  }
  
  sectorAnalysis.sort((a, b) => b.precision - a.precision);

  if (!bestSector) {
    const topSector = sectorAnalysis[0];
    return {
      status: 'NEUTRO',
      statusLabel: '🟡 SEM PADRÃO',
      message: `Maior desvio: ${topSector.name}`,
      accuracy: topSector.observedRate,
      confidence: 0,
      regionName: topSector.name,
      suggestedNumbers: [],
      sectorAnalysis,
      expectedRate: EXPECTED_RATE,
      note: 'Nenhum setor estatisticamente significante'
    };
  }

  const confidence = Math.min(100, (
    (bestSector.precision - 100) * 0.5 + 
    (bestSector.deviation / EXPECTED_RATE * 100) * 0.3 + 
    (actualAnalyzed / 100) * 0.2 
  ));

  let status, statusLabel;
  if (bestSector.precision >= 140 && confidence >= 60) {
    status = 'MUITO_ATIVO';
    statusLabel = '🔥 MUITO ATIVO';
  } else if (bestSector.precision >= 125 && confidence >= 40) {
    status = 'ATIVO';
    statusLabel = '🟠 ATIVO';
  } else if (bestSector.precision >= 115 && confidence >= 30) {
    status = 'MODERADO';
    statusLabel = '🟡 MODERADO';
  } else {
    status = 'FRACO';
    statusLabel = '⚪ FRACO';
  }

  return {
    status, statusLabel,
    message: `${bestSector.observedRate.toFixed(1)}%`,
    accuracy: bestSector.observedRate,
    confidence: Math.round(confidence),
    precision: bestSector.precision,
    regionName: bestSector.name,
    suggestedNumbers: bestSector.numbers,
    sectorAnalysis,
    expectedRate: EXPECTED_RATE,
    stats: { analyzed: actualAnalyzed, hits: bestSector.hits, deviation: bestSector.deviation.toFixed(2) }
  };
};

// ========================================
// SERVIÇO DE ANÁLISE DE VIZINHANÇA
// ========================================

export const PHYSICAL_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const getNeighbors = (centerNumber, radius) => {
  const index = PHYSICAL_WHEEL.indexOf(centerNumber);
  if (index === -1) return [];
  const neighbors = [];
  
  for (let i = -radius; i <= radius; i++) {
    const neighborIndex = (index + i + PHYSICAL_WHEEL.length) % PHYSICAL_WHEEL.length;
    neighbors.push(PHYSICAL_WHEEL[neighborIndex]);
  }
  return neighbors;
};

export const analyzeNeighborhood = (spinHistory, neighborRadius = 2, lookback = 1000) => {
  // REDUZIDO PARA 20
  const MINIMUM_SPINS = 20;
  
  if (!spinHistory || spinHistory.length < MINIMUM_SPINS) {
    return [];
  }

  const patterns = [];
  const actualLookback = Math.min(lookback, spinHistory.length);
  const recentSpins = spinHistory.slice(0, actualLookback);
  const recentNumbers = recentSpins.map(s => s.number || s);
  
  for (let centerNumber = 0; centerNumber <= 36; centerNumber++) {
    const centerIndex = PHYSICAL_WHEEL.indexOf(centerNumber);
    if (centerIndex === -1) continue;

    const neighbors = getNeighbors(centerNumber, neighborRadius);
    const neighborSize = neighbors.length;
    
    const hits = recentNumbers.filter(num => neighbors.includes(num)).length;
    const hitRate = (hits / actualLookback) * 100;
    const expectedRate = (neighborSize / 37) * 100;
    const precision = (hitRate / expectedRate) * 100;
    const expectedHits = (neighborSize / 37) * actualLookback;
    const isSignificant = calculateSignificance(hits, expectedHits, actualLookback);
    
    let lastHitAgo = actualLookback;
    for (let i = 0; i < recentNumbers.length; i++) {
      if (neighbors.includes(recentNumbers[i])) {
        lastHitAgo = i;
        break;
      }
    }
    
    const leftNeighbors = [];
    const rightNeighbors = [];
    for (let i = 1; i <= neighborRadius; i++) {
      const leftIdx = (centerIndex - i + PHYSICAL_WHEEL.length) % PHYSICAL_WHEEL.length;
      const rightIdx = (centerIndex + i) % PHYSICAL_WHEEL.length;
      leftNeighbors.push(PHYSICAL_WHEEL[leftIdx]);
      rightNeighbors.push(PHYSICAL_WHEEL[rightIdx]);
    }
    
    const leftHits = recentNumbers.filter(n => leftNeighbors.includes(n)).length;
    const rightHits = recentNumbers.filter(n => rightNeighbors.includes(n)).length;
    const leftRate = (leftHits / actualLookback) * 100;
    const rightRate = (rightHits / actualLookback) * 100;
    
    const momentumWindow = Math.floor(actualLookback * 0.3);
    const oldSpins = recentNumbers.slice(-momentumWindow);
    const newSpins = recentNumbers.slice(0, momentumWindow);
    const oldHits = oldSpins.filter(n => neighbors.includes(n)).length;
    const newHits = newSpins.filter(n => neighbors.includes(n)).length;
    
    let momentum = { key: 'stable', label: 'Estável' };
    if (newHits > oldHits * 1.3) momentum = { key: 'heating', label: 'Aquecendo' };
    else if (newHits < oldHits * 0.7) momentum = { key: 'cooling', label: 'Esfriando' };
    
    let status;
    if (precision >= 130 && isSignificant) status = { key: 'very_hot', label: '🔴 Muito Quente' };
    else if (precision >= 115 && isSignificant) status = { key: 'hot', label: '🟠 Quente' };
    else if (precision >= 100) status = { key: 'normal_plus', label: '🟢 Normal+' };
    else if (precision >= 85) status = { key: 'normal', label: '🟡 Normal' };
    else if (precision >= 70) status = { key: 'cool', label: '🔵 Frio' };
    else status = { key: 'very_cold', label: '❄️ Muito Frio' };
    
    const recommendation = (precision >= 120 && isSignificant && lastHitAgo > 3) ? 'BET' : 'SKIP';
    
    patterns.push({
      center: centerNumber, neighbors, hits, hitRate, expectedRate,
      accuracy: precision, precision, lastHitAgo, status,
      asymmetry: { leftRate, rightRate, leftNeighbors, rightNeighbors },
      momentum, recommendation, isSignificant,
      confidence: Math.min(100, (precision - 100) * 2)
    });
  }

  return patterns.sort((a, b) => b.precision - a.precision);
};