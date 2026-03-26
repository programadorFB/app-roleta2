// services/neighborhoodAnalysis.js

/**
 * REQ 1: Layout físico da roleta (constante)
 * Esta é a ordem real dos números em uma roda de roleta europeia.
 */
export const PHYSICAL_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const WHEEL_LENGTH = PHYSICAL_WHEEL.length; // 37

/**
 * REQ 1 (Corrigido): Retorna vizinhos físicos na roda, *incluindo* o número central.
 * @param {number} centerNumber - O número no centro da vizinhança.
 * @param {number} radius - Quantos vizinhos de cada lado (ex: 2 para 5 números totais).
 * @returns {number[]} - Array de números na vizinhança.
 */
function getNeighbors(centerNumber, radius) {
  const index = PHYSICAL_WHEEL.indexOf(centerNumber);
  if (index === -1) return [];
  const neighbors = [];

  for (let i = -radius; i <= radius; i++) {
    const neighborIndex = (index + i + WHEEL_LENGTH) % WHEEL_LENGTH;
    neighbors.push(PHYSICAL_WHEEL[neighborIndex]);
  }
  return neighbors; // Para radius=2, retorna 5 números (ex: 2-esquerda, 1-centro, 2-direita)
}

/**
 * REQ 1: Calcula taxa de acerto na vizinhança
 * @param {object[]} recentSpins - Array de spins (já fatiado).
 * @param {number[]} neighbors - Array de números da vizinhança.
 * @returns {number} - Porcentagem de hits.
 */
function calculateNeighborHitRate(recentSpins, neighbors) {
  if (recentSpins.length === 0) return 0;
  const hits = recentSpins.filter(spin => neighbors.includes(spin.number)).length;
  return (hits / recentSpins.length) * 100;
}

/**
 * REQ 1: Encontra último hit na vizinhança
 */
function findLastNeighborHit(spinHistory, neighbors) {
  const index = spinHistory.findIndex(spin => neighbors.includes(spin.number));
  return index === -1 ? spinHistory.length : index;
}

/**
 * REQ 1: Define status baseado em hit rate
 */
function getStatus(hitRate) {
  if (hitRate >= 20) return { key: 'confirmed', label: '🟢 Muito Ativo' };
  if (hitRate >= 12) return { key: 'warning', label: '🟡 Moderado' };
  return { key: 'inactive', label: '⚪ Inativo' };
}

/**
 * REQ 4: Métricas adicionais - Assimetria (Esquerda vs Direita)
 * Compara os hits dos vizinhos à esquerda vs. os vizinhos à direita do centro.
 */
function calculateAsymmetry(spinHistory, centerIndex, radius, lookback = 1000) {
    const recentSpins = spinHistory.slice(0, Math.min(lookback, spinHistory.length));
    if (recentSpins.length === 0) return { leftRate: 0, rightRate: 0, leftNeighbors: [], rightNeighbors: [] };

    const leftNeighbors = [];
    for (let i = -radius; i < 0; i++) { // Apenas < 0
        const neighborIndex = (centerIndex + i + WHEEL_LENGTH) % WHEEL_LENGTH;
        leftNeighbors.push(PHYSICAL_WHEEL[neighborIndex]);
    }

    const rightNeighbors = [];
    for (let i = 1; i <= radius; i++) { // Apenas > 0
        const neighborIndex = (centerIndex + i + WHEEL_LENGTH) % WHEEL_LENGTH;
        rightNeighbors.push(PHYSICAL_WHEEL[neighborIndex]);
    }
    
    const leftHits = recentSpins.filter(spin => leftNeighbors.includes(spin.number)).length;
    const rightHits = recentSpins.filter(spin => rightNeighbors.includes(spin.number)).length;

    // Taxa de hit como % do total de spins
    const leftRate = (leftHits / recentSpins.length) * 100;
    const rightRate = (rightHits / recentSpins.length) * 100;
    
    return { leftRate, rightRate, leftNeighbors, rightNeighbors };
}

/**
 * REQ 4: Métricas adicionais - Momentum (Esquentando/Esfriando)
 * Compara a taxa de hit recente (ex: 25 spins) com uma taxa mais longa (ex: 50 spins).
 */
function calculateMomentum(spinHistory, neighbors, lookback = 1000) {
    const actualLookback = Math.min(lookback, spinHistory.length);
    const recentSpins = spinHistory.slice(0, Math.min(actualLookback / 2, spinHistory.length));
    const olderSpins = spinHistory.slice(0, actualLookback);

    const recentRate = calculateNeighborHitRate(recentSpins, neighbors);
    const olderRate = calculateNeighborHitRate(olderSpins, neighbors);

    if (recentRate > olderRate * 1.2) return { key: 'heating', label: 'Esquentando' };
    if (recentRate < olderRate * 0.8) return { key: 'cooling', label: 'Esfriando' };
    return { key: 'stable', label: 'Estável' };
}


/**
 * REQ 1: Função principal: analisa vizinhança de TODOS os números
 * @param {object[]} spinHistory - Histórico de spins.
 * @param {number} neighborRadius - Raio da vizinhança (default 2).
 * @param {number} lookback - Quantos spins analisar (default 50).
 * @returns {object[]} - Array com análise de todos os 37 números.
 */
export function analyzeNeighborhood(spinHistory, neighborRadius = 2, lookback = 1000) {
  
  if (spinHistory.length < 4) return []; // Mínimo para evitar erros

  const patterns = [];
  const recentSpins = spinHistory.slice(0, Math.min(lookback, spinHistory.length));
  
  // % esperado por número
  const expectedHitRateBase = (1 / WHEEL_LENGTH) * 100; 

  for (let centerNumber = 0; centerNumber <= 36; centerNumber++) {
    
    const centerIndex = PHYSICAL_WHEEL.indexOf(centerNumber);
    if (centerIndex === -1) continue; // Pula se número não for encontrado

    const neighbors = getNeighbors(centerNumber, neighborRadius);
    const hitRate = calculateNeighborHitRate(recentSpins, neighbors);
    const lastHitAgo = findLastNeighborHit(spinHistory, neighbors);
    
    // Taxa de acerto esperada para esta vizinhança
    const expectedHitRate = expectedHitRateBase * neighbors.length;
    
    /**
     * REQ 1: "accuracy" (Precisão ou "Lift")
     * (Taxa Real / Taxa Esperada) * 100
     * 100% = Normal. 150% = 50% acima do esperado.
     */
    const accuracy = expectedHitRate > 0 ? (hitRate / expectedHitRate) * 100 : 0; 
    
    const status = getStatus(hitRate);

    // REQ 4: Análises avançadas
    const asymmetry = calculateAsymmetry(spinHistory, centerIndex, neighborRadius, lookback);
    const momentum = calculateMomentum(spinHistory, neighbors, lookback);

    patterns.push({
      center: centerNumber,
      neighbors: neighbors, // Array completo da vizinhança
      hitRate: hitRate,     // Taxa de acerto real
      accuracy: accuracy,   // Taxa vs. esperado (lift)
      lastHitAgo: lastHitAgo,
      status: status,       // { key, label }
      asymmetry: asymmetry, // { leftRate, rightRate, ... }
      momentum: momentum,   // { key, label }
      recommendation: hitRate > 15 && accuracy > 110 ? 'BET' : 'SKIP' // REQ 1
    });
  }

  // Sorteia por 'accuracy' (maior "lift")
  return patterns.sort((a, b) => b.accuracy - a.accuracy);
}