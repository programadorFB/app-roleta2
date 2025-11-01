// services/alertLogic.js

/**
 * REQ 2: Lógica de Alerta de Convergência (Sinal Verde)
 * Verifica se 3 ou mais estratégias estão apontando para uma entrada.
 * @param {object} analyses - Objeto contendo os resultados de todas as análises.
 * @returns {object|null} - Objeto de notificação ou nulo.
 */
export const checkConvergenceAlert = (analyses) => {
  if (!analyses) return null;

  const { croupierAnalysis, terminalAnalysis, fiboNasaAnalysis, hiddenAnalysis } = analyses;
  let convergenceScore = 0;
  let reasons = [];
  let suggestedNumbers = [];

  // Exemplo de regra 1: Padrão do Croupier está ativo
  if (croupierAnalysis?.status === 'MUITO ATIVO' || croupierAnalysis?.status === 'MODERADO') {
    convergenceScore++;
    reasons.push("Mão do Croupier");
    suggestedNumbers.push(...(croupierAnalysis.suggestedNumbers || []));
  }

  // Exemplo de regra 2: Terminal "devendo"
  if (terminalAnalysis?.mostDue?.absence > 30) {
    convergenceScore++;
    reasons.push(`Terminal ${terminalAnalysis.mostDue.terminal} devendo`);
    // (Poderia adicionar números com esse terminal)
  }

  // Exemplo de regra 3: Padrão FiboNasa quente
  if (fiboNasaAnalysis?.signal?.status === 'green') {
    convergenceScore++;
    reasons.push("Padrão FiboNasa");
    suggestedNumbers.push(...(fiboNasaAnalysis.recommendedNumbers || []));
  }
  
  // Exemplo de regra 4: Oculto Nível 6
  if (hiddenAnalysis?.top10Ocultos[0]?.level.level === 6) {
    convergenceScore++;
    reasons.push(`Oculto Nível 6 (${hiddenAnalysis.top10Ocultos[0].number})`);
    suggestedNumbers.push(hiddenAnalysis.top10Ocultos[0].number);
  }

  // REQ 2: Trigger (3+ estratégias)
  if (convergenceScore >= 3) {
    // Tenta encontrar números únicos
    const uniqueNumbers = [...new Set(suggestedNumbers)].sort((a,b) => a-b);
    
    return {
      type: 'success', // Verde
      title: '⚡ SINAL DE ENTRADA!',
      message: `Convergência ${convergenceScore}x: ${reasons.join(', ')}. Sugestões: ${uniqueNumbers.join(', ')}`,
      duration: 15000, // 15 segundos
      sound: true, // Toca 'ding.mp3'
      actions: [
        { label: "Ver Análises", onClick: () => console.log("Abrir análises") }
      ]
    };
  }

  return null;
};

/**
 * REQ 2: Lógica de Alerta de Padrão Quebrado
 * Compara a análise atual com a anterior.
 * @param {object} currentAnalyses - Análises do spin atual.
 * @param {object} prevAnalyses - Análises do spin anterior.
 * @returns {object|null} - Objeto de notificação ou nulo.
 */
export const checkPatternBrokenAlert = (currentAnalyses, prevAnalyses) => {
  if (!currentAnalyses || !prevAnalyses) return null;

  const { croupierAnalysis: currentCroupier } = currentAnalyses;
  const { croupierAnalysis: prevCroupier } = prevAnalyses;

  // Exemplo de regra: Padrão do Croupier quebrou
  if (prevCroupier?.status === 'MUITO ATIVO' && currentCroupier?.status !== 'MUITO ATIVO') {
    return {
      type: 'warning', // Amarelo
      title: '⚠️ Padrão do Croupier Quebrou!',
      message: `A Mão do Croupier esfriou (de ${prevCroupier.accuracy.toFixed(0)}% para ${currentCroupier.accuracy.toFixed(0)}%). Reavalie a estratégia.`,
      duration: 7000,
    };
  }

  return null;
};