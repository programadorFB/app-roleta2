// alertLogic_cerco.jsx - Sistema de Alerta para Estratégia Cerco
// Padrão ZXYCZ: Detecta quando o primeiro e último número de uma sequência de 5 são iguais

/**
 * Detecta o padrão Cerco (ZXYCZ) nos últimos spins
 * @param {Array} spinHistory - Histórico de spins (mais recente primeiro)
 * @returns {Object|null} - Alerta se padrão detectado, null caso contrário
 */
export const checkCercoPattern = (spinHistory) => {
  if (!spinHistory || spinHistory.length < 5) {
    return null; // Precisa de pelo menos 5 spins
  }

  // Pega os últimos 5 números (mais recente primeiro)
  const last5 = spinHistory.slice(0, 5);
  const numbers = last5.map(spin => spin.number);

  // Verifica o padrão ZXYCZ
  // numbers[0] é o mais recente (Z final)
  // numbers[4] é o mais antigo (Z inicial)
  const firstNumber = numbers[4];  // Z inicial
  const lastNumber = numbers[0];   // Z final

  // Verifica se formou o padrão (primeiro = último)
  if (firstNumber === lastNumber) {
    // Números do meio (X, Y, C)
    const middleNumbers = numbers.slice(1, 4); // [3], [2], [1]

    return {
      type: 'success', // Verde
      title: '🎯 Padrão CERCO Detectado!',
      message: `Número ${firstNumber} fechou o cerco! Sequência: ${numbers.reverse().join('-')}`,
      pattern: {
        z: firstNumber,
        sequence: numbers.reverse(),
        middleNumbers: middleNumbers.reverse()
      },
      duration: 8000,
      priority: 'high'
    };
  }

  return null;
};

/**
 * Detecta formação iminente do padrão Cerco (faltam 1-2 spins)
 * @param {Array} spinHistory - Histórico de spins
 * @returns {Object|null} - Alerta de pré-formação ou null
 */
export const checkCercoPreFormation = (spinHistory) => {
  if (!spinHistory || spinHistory.length < 3) {
    return null;
  }

  // Verifica padrões em formação:
  // ZXY_ (falta 1 spin para completar)
  if (spinHistory.length >= 3) {
    const last3 = spinHistory.slice(0, 3);
    const numbers = last3.map(spin => spin.number);
    
    // Verifica se algum número dos últimos 3 pode formar cerco
    // procurando por Z em posições anteriores
    const potentialZ = numbers[2]; // Mais antigo dos últimos 3
    
    return {
      type: 'info', // Azul
      title: '⏳ Cerco em Formação',
      message: `Número ${potentialZ} pode fechar cerco na próxima rodada. Aguarde: ${numbers.reverse().join('-')}-?`,
      pattern: {
        partialSequence: numbers.reverse(),
        nextNumberToComplete: potentialZ
      },
      duration: 6000,
      priority: 'medium'
    };
  }

  return null;
};

/**
 * Verifica múltiplos padrões Cerco ativos
 * @param {Array} spinHistory - Histórico completo de spins
 * @param {number} lookbackWindow - Janela de análise (padrão: 50)
 * @returns {Object|null} - Estatísticas de padrões Cerco
 */
export const analyzeCercoFrequency = (spinHistory, lookbackWindow = 50) => {
  if (!spinHistory || spinHistory.length < 5) {
    return null;
  }

  const recentSpins = spinHistory.slice(0, lookbackWindow);
  let cercoCount = 0;
  const cercoNumbers = new Set();
  const cercoPatterns = [];

  // Analisa todos os possíveis padrões de 5 spins na janela
  for (let i = 0; i <= recentSpins.length - 5; i++) {
    const window = recentSpins.slice(i, i + 5);
    const numbers = window.map(spin => spin.number);
    
    if (numbers[0] === numbers[4]) {
      cercoCount++;
      cercoNumbers.add(numbers[0]);
      cercoPatterns.push({
        z: numbers[0],
        sequence: numbers.reverse(),
        position: i
      });
    }
  }

  if (cercoCount > 0) {
    const frequency = (cercoCount / (lookbackWindow / 5)) * 100;
    
    return {
      type: 'info',
      title: `📊 Análise de Padrão Cerco`,
      message: `Detectados ${cercoCount} padrões nos últimos ${lookbackWindow} spins (${frequency.toFixed(1)}% de frequência)`,
      stats: {
        totalPatterns: cercoCount,
        uniqueNumbers: Array.from(cercoNumbers),
        frequency: frequency,
        patterns: cercoPatterns,
        lookbackWindow: lookbackWindow
      },
      duration: 10000,
      priority: 'low'
    };
  }

  return null;
};

/**
 * Detecta números "quentes" para formar Cerco
 * Números que já aparecem frequentemente e podem fechar padrão
 * @param {Array} spinHistory - Histórico de spins
 * @returns {Object|null} - Lista de números candidatos
 */
export const identifyCercoCandidates = (spinHistory) => {
  if (!spinHistory || spinHistory.length < 20) {
    return null;
  }

  const recentSpins = spinHistory.slice(0, 20);
  const numberFrequency = {};

  // Conta frequência nos últimos 20 spins
  recentSpins.forEach(spin => {
    numberFrequency[spin.number] = (numberFrequency[spin.number] || 0) + 1;
  });

  // Identifica números que aparecem 2+ vezes (candidatos a Cerco)
  const hotNumbers = Object.entries(numberFrequency)
    .filter(([num, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([num, count]) => ({
      number: parseInt(num),
      appearances: count,
      probability: (count / recentSpins.length * 100).toFixed(1)
    }));

  if (hotNumbers.length > 0) {
    return {
      type: 'warning', // Amarelo
      title: '🔥 Candidatos a Cerco',
      message: `${hotNumbers.length} números aparecem múltiplas vezes e podem formar Cerco`,
      candidates: hotNumbers,
      duration: 7000,
      priority: 'medium'
    };
  }

  return null;
};

/**
 * Sistema principal de monitoramento do padrão Cerco
 * Combina todas as verificações de padrão
 * @param {Array} spinHistory - Histórico de spins
 * @param {Object} options - Opções de configuração
 * @returns {Array} - Lista de alertas ativos
 */
export const monitorCercoStrategy = (spinHistory, options = {}) => {
  const {
    enablePreFormation = true,
    enableFrequencyAnalysis = false,
    enableCandidateTracking = true,
    lookbackWindow = 50
  } = options;

  const alerts = [];

  // 1. Verifica padrão completo (prioridade máxima)
  const completedPattern = checkCercoPattern(spinHistory);
  if (completedPattern) {
    alerts.push(completedPattern);
  }

  // 2. Verifica pré-formação (se habilitado)
  if (enablePreFormation && !completedPattern) {
    const preFormation = checkCercoPreFormation(spinHistory);
    if (preFormation) {
      alerts.push(preFormation);
    }
  }

  // 3. Análise de frequência (se habilitado)
  if (enableFrequencyAnalysis && spinHistory.length >= lookbackWindow) {
    const frequency = analyzeCercoFrequency(spinHistory, lookbackWindow);
    if (frequency) {
      alerts.push(frequency);
    }
  }

  // 4. Rastreamento de candidatos (se habilitado)
  if (enableCandidateTracking && !completedPattern) {
    const candidates = identifyCercoCandidates(spinHistory);
    if (candidates) {
      alerts.push(candidates);
    }
  }

  return alerts;
};

// Exporta todas as funções
export default {
  checkCercoPattern,
  checkCercoPreFormation,
  analyzeCercoFrequency,
  identifyCercoCandidates,
  monitorCercoStrategy
};