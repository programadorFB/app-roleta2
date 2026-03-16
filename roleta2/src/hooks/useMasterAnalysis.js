// hooks/useMasterAnalysis.js

import { useMemo, useState, useEffect } from 'react';
import { calculateMasterScore } from '../services/masterScoring';

/**
 * Hook para análise master do histórico de spins
 * Gerencia o cálculo de scores e sinais de entrada
 */
export const useMasterAnalysis = ({ spinHistory, onSignalUpdate }) => {
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);

  // Calcula análise apenas quando spinHistory muda
  const analysis = useMemo(() => {
    return calculateMasterScore(spinHistory);
  }, [spinHistory]);

  // Envia números do sinal para o componente pai
  useEffect(() => {
    if (analysis?.entrySignal?.suggestedNumbers) {
      onSignalUpdate(analysis.entrySignal.suggestedNumbers);
    } else {
      onSignalUpdate([]);
    }
    
    // Reset estado "aceito" se sinal desaparecer
    if (!analysis?.entrySignal) {
      setIsSignalAccepted(false);
    }
  }, [analysis, onSignalUpdate]);

  // Handlers para confirmar/ignorar sinal
  const handleSignalConfirm = () => {
    setIsSignalAccepted(true);
    console.log("Sinal confirmado! Apostar em:", analysis?.entrySignal?.suggestedNumbers);
  };

  const handleSignalIgnore = () => {
    setIsSignalAccepted(false);
    console.log("Sinal ignorado.");
  };

  return {
    analysis,
    isSignalAccepted,
    handleSignalConfirm,
    handleSignalIgnore
  };
};