// services/alertLogic.jsx

/**
 * Verifica convergência de estratégias para sinal de entrada.
 
 * @param {object} masterResult - Retorno de calculateMasterScore()
 *   { globalAssertiveness, totalSignals, strategyScores, entrySignal }
 * @returns {object|null} - Objeto de notificação ou nulo
 */
export const checkConvergenceAlert = (masterResult) => {
  if (!masterResult?.strategyScores?.length) return null;

  const { strategyScores, entrySignal, globalAssertiveness } = masterResult;

  // Conta estratégias verdes (ativas)
  const greenStrategies = strategyScores.filter(s => s.status === '🟢');
  const convergenceCount = greenStrategies.length;

  // Convergência de 3+ estratégias = sinal
  if (convergenceCount >= 3 && entrySignal) {
    const reasons = greenStrategies.map(s => s.name);
    const numbers = entrySignal.suggestedNumbers || [];

    return {
      type: 'success',
      title: '⚡ SINAL DE ENTRADA!',
      message: `Convergência ${convergenceCount}x: ${reasons.join(', ')}. Sugestões: ${numbers.join(', ')}`,
      duration: 15000,
      sound: true,
      actions: [
        { label: "Ver Análises", onClick: () => console.log("Abrir análises") }
      ],
    };
  }

  return null;
};

/**
 * Verifica se um padrão forte quebrou entre dois ciclos de análise.
 *
 * 🔧 FIX #3: Agora compara strategyScores entre ciclos.
 * Se uma estratégia estava 🟢 e caiu para 🟠, alerta.
 *
 * @param {object} currentResult - Retorno atual de calculateMasterScore()
 * @param {object} prevResult - Retorno anterior de calculateMasterScore()
 * @returns {object|null} - Objeto de notificação ou nulo
 */
export const checkPatternBrokenAlert = (currentResult, prevResult) => {
  if (!currentResult?.strategyScores?.length || !prevResult?.strategyScores?.length) return null;

  const alerts = [];

  for (const prevStrategy of prevResult.strategyScores) {
    // Só alerta se a estratégia ERA verde
    if (prevStrategy.status !== '🟢') continue;

    const currentStrategy = currentResult.strategyScores.find(s => s.name === prevStrategy.name);
    if (!currentStrategy) continue;

    // Caiu de 🟢 para 🟠 (pulou amarelo = quebra brusca)
    if (currentStrategy.status === '🟠') {
      alerts.push({
        type: 'warning',
        title: `⚠️ ${prevStrategy.name} — Padrão Quebrou!`,
        message: `${prevStrategy.name} caiu de ativo para inativo. Score: ${prevStrategy.score.toFixed(0)}% → ${currentStrategy.score.toFixed(0)}%.`,
        duration: 7000,
      });
    }
  }

  // Retorna o primeiro alerta (evita spam)
  return alerts.length > 0 ? alerts[0] : null;
};