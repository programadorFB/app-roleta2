// services/croupierDetection.js - VERSÃO MELHORADA


// SETORES BALANCEADOS (6 números cada)
export const SECTORS = {
  TM0: { name: 'Setor 0-21', numbers: [0, 32, 15, 19, 4, 21] },
  TM1: { name: 'Setor 2-27', numbers: [2, 25, 17, 34, 6, 27] },
  TM2: { name: 'Setor 13-23', numbers: [13, 36, 11, 30, 8, 23] },
  TM3: { name: 'Setor 10-1', numbers: [10, 5, 24, 16, 33, 1] },
  TM4: { name: 'Setor 20-18', numbers: [20, 14, 31, 9, 22, 18] },
  TM5: { name: 'Setor 29-26', numbers: [29, 7, 28, 12, 35, 3] } // CORRIGIDO: 6 números
};

/**
 * Calcula significância estatística usando Chi-Quadrado simplificado
 */
const calculateSignificance = (observed, expected, sampleSize) => {
  const chiSquare = Math.pow(observed - expected, 2) / expected;
  // Valor crítico aproximado para p < 0.05 com 5 graus de liberdade ≈ 11.07
  // Para simplificar: chiSquare > 3.84 indica p < 0.05 (significante)
  return chiSquare > 3.84;
};

/**
 * ANÁLISE MELHORADA DO PADRÃO DO CROUPIER
 * @param {object[]} spinHistory - Histórico completo de spins
 * @param {number} spinsToAnalyze - Quantos spins analisar (mínimo 50)
 * @returns {object} - Análise completa com métricas estatísticas
 */
export const analyzeCroupierPattern = (spinHistory, spinsToAnalyze = 50) => {
  
  const MINIMUM_SPINS = 50; // Aumentado para maior robustez estatística
  const NUMBERS_PER_SECTOR = 6;
  const TOTAL_NUMBERS = 37;
  const EXPECTED_RATE = (NUMBERS_PER_SECTOR / TOTAL_NUMBERS) * 100; // 16.22%
  
  // Validação de dados mínimos
  if (!spinHistory || spinHistory.length < MINIMUM_SPINS) {
    return {
      status: 'AGUARDANDO',
      statusLabel: '⏸️ AGUARDANDO DADOS',
      message: `Necessário ${MINIMUM_SPINS} spins (atual: ${spinHistory?.length || 0})`,
      accuracy: 0,
      confidence: 0,
      regionName: '-',
      suggestedNumbers: [],
      sectorAnalysis: [],
      expectedRate: EXPECTED_RATE
    };
  }

  // Analisa apenas os N spins mais recentes
  const recentSpins = spinHistory.slice(0, Math.min(spinsToAnalyze, spinHistory.length));
  const actualAnalyzed = recentSpins.length;
  const recentSpinNumbers = recentSpins.map(s => s.number || s);

  // Análise de todos os setores
  const sectorAnalysis = [];
  let bestSector = null;
  let highestDeviation = 0;

  for (const [key, sector] of Object.entries(SECTORS)) {
    // Conta hits no setor
    const hits = recentSpinNumbers.filter(num => sector.numbers.includes(num)).length;
    const observedRate = (hits / actualAnalyzed) * 100;
    const expectedHits = (NUMBERS_PER_SECTOR / TOTAL_NUMBERS) * actualAnalyzed;
    
    // Precisão: % observado vs % esperado
    const precision = (observedRate / EXPECTED_RATE) * 100;
    
    // Desvio absoluto do esperado
    const deviation = Math.abs(observedRate - EXPECTED_RATE);
    
    // Significância estatística
    const isSignificant = calculateSignificance(hits, expectedHits, actualAnalyzed);
    
    const analysis = {
      key,
      name: sector.name,
      numbers: sector.numbers,
      hits,
      observedRate,
      expectedRate: EXPECTED_RATE,
      precision,
      deviation,
      isSignificant,
      // Status mais realista
      status: precision >= 130 && isSignificant ? 'hot' : 
              precision >= 115 ? 'warm' :
              precision >= 85 ? 'normal' :
              precision >= 70 ? 'cool' : 'cold'
    };
    
    sectorAnalysis.push(analysis);
    
    // Atualiza melhor setor (maior desvio positivo E significante)
    if (precision > 100 && deviation > highestDeviation && isSignificant) {
      highestDeviation = deviation;
      bestSector = analysis;
    }
  }
  
  // Ordena setores por precisão
  sectorAnalysis.sort((a, b) => b.precision - a.precision);

  // Se não há setor significante, retorna inativo
  if (!bestSector) {
    const topSector = sectorAnalysis[0];
    return {
      status: 'NEUTRO',
      statusLabel: '🟡 SEM PADRÃO DETECTADO',
      message: `Maior desvio: ${topSector.name} (${topSector.precision.toFixed(0)}%)`,
      accuracy: topSector.observedRate,
      confidence: 0,
      regionName: topSector.name,
      suggestedNumbers: [],
      sectorAnalysis,
      expectedRate: EXPECTED_RATE,
      note: 'Nenhum setor está estatisticamente acima do esperado'
    };
  }

  // Calcula confiança baseada em múltiplos fatores
  const confidence = Math.min(100, (
    (bestSector.precision - 100) * 0.5 + // Quanto maior a precisão, mais confiança
    (bestSector.deviation / EXPECTED_RATE * 100) * 0.3 + // Desvio relativo
    (actualAnalyzed / 100) * 0.2 // Tamanho da amostra
  ));

  // Define status baseado na precisão REALISTA
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
    status,
    statusLabel,
    message: `${bestSector.observedRate.toFixed(1)}% (esperado: ${EXPECTED_RATE.toFixed(1)}%)`,
    accuracy: bestSector.observedRate,
    confidence: Math.round(confidence),
    precision: bestSector.precision,
    regionName: bestSector.name,
    suggestedNumbers: bestSector.numbers,
    sectorAnalysis,
    expectedRate: EXPECTED_RATE,
    stats: {
      analyzed: actualAnalyzed,
      hits: bestSector.hits,
      deviation: bestSector.deviation.toFixed(2),
      isStatisticallySignificant: bestSector.isSignificant
    }
  };
};

// ========================================
// SERVIÇO DE ANÁLISE DE VIZINHANÇA - MELHORADO
// ========================================

export const PHYSICAL_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

/**
 * PROBLEMAS CORRIGIDOS NA ANÁLISE DE VIZINHANÇA:
 * 
 * 1. CÁLCULO DE PRECISÃO INCONSISTENTE:
 *    - Estava comparando hitRate (%) com expectedHitRateBase (%)
 *    - Mas o expectedHitRateBase era multiplicado por neighbors.length depois
 *    - Resultado: valores de accuracy completamente errados
 * 
 * 2. THRESHOLDS IRREALISTAS:
 *    - hitRate > 15% para 5 números: esperado é 13.51%
 *    - hitRate > 20% para "muito ativo": seria 48% acima do esperado!
 * 
 * 3. LOOKBACK MUITO PEQUENO:
 *    - 50 spins é pouco para 37 possibilidades
 *    - Causa alta variância e falsos positivos
 */

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
  
  const MINIMUM_SPINS = 50;
  
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
    
    // Conta hits
    const hits = recentNumbers.filter(num => neighbors.includes(num)).length;
    const hitRate = (hits / actualLookback) * 100;
    
    // Taxa esperada CORRETA
    const expectedRate = (neighborSize / 37) * 100;
    
    // Precisão CORRETA: (observado / esperado) * 100
    const precision = (hitRate / expectedRate) * 100;
    
    // Significância estatística
    const expectedHits = (neighborSize / 37) * actualLookback;
    const isSignificant = calculateSignificance(hits, expectedHits, actualLookback);
    
    // Último hit
    let lastHitAgo = actualLookback;
    for (let i = 0; i < recentNumbers.length; i++) {
      if (neighbors.includes(recentNumbers[i])) {
        lastHitAgo = i;
        break;
      }
    }
    
    // Assimetria
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
    
    // Momentum (últimos 30% vs primeiros 30%)
    const momentumWindow = Math.floor(actualLookback * 0.3);
    const oldSpins = recentNumbers.slice(-momentumWindow);
    const newSpins = recentNumbers.slice(0, momentumWindow);
    
    const oldHits = oldSpins.filter(n => neighbors.includes(n)).length;
    const newHits = newSpins.filter(n => neighbors.includes(n)).length;
    
    let momentum = { key: 'stable', label: 'Estável' };
    if (newHits > oldHits * 1.3) momentum = { key: 'heating', label: 'Aquecendo 🔥' };
    else if (newHits < oldHits * 0.7) momentum = { key: 'cooling', label: 'Esfriando ❄️' };
    
    // Status REALISTA baseado em precisão
    let status;
    if (precision >= 130 && isSignificant) {
      status = { key: 'very_hot', label: '🔴 Muito Quente' };
    } else if (precision >= 115 && isSignificant) {
      status = { key: 'hot', label: '🟠 Quente' };
    } else if (precision >= 100) {
      status = { key: 'normal_plus', label: '🟢 Normal+' };
    } else if (precision >= 85) {
      status = { key: 'normal', label: '🟡 Normal' };
    } else if (precision >= 70) {
      status = { key: 'cool', label: '🔵 Frio' };
    } else {
      status = { key: 'very_cold', label: '❄️ Muito Frio' };
    }
    
    // Recomendação CRITERIOSA
    const recommendation = (precision >= 120 && isSignificant && lastHitAgo > 3) ? 'BET' : 'SKIP';
    
    patterns.push({
      center: centerNumber,
      neighbors,
      hits,
      hitRate,
      expectedRate,
      accuracy: precision, // Renomeado internamente, mas mantem compatibilidade
      precision, // Adiciona explicitamente
      lastHitAgo,
      status,
      asymmetry: { leftRate, rightRate, leftNeighbors, rightNeighbors },
      momentum,
      recommendation,
      isSignificant,
      confidence: Math.min(100, (precision - 100) * 2) // Confiança baseada no desvio
    });
  }

  return patterns.sort((a, b) => b.precision - a.precision);
};

// ========================================
// RESUMO DAS MELHORIAS:
// ========================================
/*
1. SETORES BALANCEADOS (6 números cada)
2. THRESHOLDS REALISTAS baseados em estatística
3. VALIDAÇÃO DE SIGNIFICÂNCIA ESTATÍSTICA
4. AMOSTRA MÍNIMA AUMENTADA (50 spins)
5. CÁLCULO DE PRECISÃO CORRIGIDO
6. MÉTRICAS DE CONFIANÇA ADICIONADAS
7. STATUS GRADUAIS E REALISTAS
8. RECOMENDAÇÕES MAIS CRITERIOSAS
9. DOCUMENTAÇÃO DOS PROBLEMAS ENCONTRADOS
10. COMPATIBILIDADE MANTIDA COM INTERFACE EXISTENTE
*/