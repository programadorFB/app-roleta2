/**
 * hooks/useGameLauncher.js — Hook de Game Launch com política completa de falha
 *
 * 🔧 FIX: Reescrito completamente para política de falha ao abrir jogo
 * - Recebe (selectedGame, jwtToken, isAuthenticated, userEmail) — 4º param ESSENCIAL
 * - failureType exportado como enum LAUNCH_FAILURE
 * - Retry com backoff exponencial: [2000, 5000, 10000], máx 3 tentativas
 * - NÃO faz retry em: 401, 403, 404, 422
 * - FAZ retry em: 5xx, 0 (rede), 408, 504
 * - cancelRetry() para o usuário abortar
 * - resetGame() limpa tudo
 * - Auto-launch com guard hasLaunchedRef
 * - Iframe error: re-launch 1x automático, depois erro estático
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ROULETTE_GAME_IDS } from '../constants/roulette';
import { launchGame } from '../apiClient.js';
import { isRetryableError } from '../errorHandler.js';

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: ENUM DE TIPOS DE FALHA
// O componente principal NUNCA faz `if (statusCode === 403)`
// Ele lê failureType do hook
// ══════════════════════════════════════════════════════════════

export const LAUNCH_FAILURE = {
  NONE: 'NONE',
  PAYWALL: 'PAYWALL',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

// 🔧 FIX: Delays de retry com backoff exponencial
const RETRY_DELAYS = [2000, 5000, 10000];
const MAX_RETRIES = RETRY_DELAYS.length;

/**
 * Mapeia statusCode + erro para failureType
 */
function classifyFailure(statusCode, errorInfo) {
  if (!errorInfo) return LAUNCH_FAILURE.NONE;

  // 🔧 FIX: Paywall tem prioridade sobre 403 genérico
  if (errorInfo.requiresPaywall) return LAUNCH_FAILURE.PAYWALL;

  switch (statusCode) {
    case 401:
      return LAUNCH_FAILURE.SESSION_EXPIRED;
    case 403:
      return LAUNCH_FAILURE.FORBIDDEN;
    case 404:
      return LAUNCH_FAILURE.NOT_FOUND;
    case 0:
      return LAUNCH_FAILURE.NETWORK_ERROR;
    default:
      if (statusCode >= 500) return LAUNCH_FAILURE.SERVER_ERROR;
      if (statusCode === 408 || statusCode === 504) return LAUNCH_FAILURE.SERVER_ERROR;
      return LAUNCH_FAILURE.NETWORK_ERROR;
  }
}

// ══════════════════════════════════════════════════════════════
// HOOK PRINCIPAL
// ══════════════════════════════════════════════════════════════

export const useGameLauncher = ({
  selectedRoulette,
  jwtToken,
  isAuthenticated,
  userEmail, // 🔧 FIX: 4º parâmetro ESSENCIAL
}) => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [iframeError, setIframeError] = useState(false);

  // 🔧 FIX: failureType como enum
  const [failureType, setFailureType] = useState(LAUNCH_FAILURE.NONE);

  // 🔧 FIX: Estado de retry
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  // 🔧 FIX: Paywall info
  const [checkoutUrl, setCheckoutUrl] = useState(null);

  // Refs
  const hasLaunchedRef = useRef(false);
  const retryTimerRef = useRef(null);
  const iframeRelaunchAttemptRef = useRef(0);
  const cancelledRef = useRef(false);

  // ════════════════════════════════════════════════════════════
  // cancelRetry — Aborta retry em andamento
  // ════════════════════════════════════════════════════════════

  const cancelRetry = useCallback(() => {
    cancelledRef.current = true;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setIsRetrying(false);
    setRetryCount(0);
    setIsLaunching(false);
  }, []);

  // ════════════════════════════════════════════════════════════
  // 🔧 FIX: handleLaunchGame — Com retry inteligente
  // ════════════════════════════════════════════════════════════

  const handleLaunchGame = useCallback(async (attemptNumber = 0) => {
    const gameId = ROULETTE_GAME_IDS[selectedRoulette];

    if (!gameId || !jwtToken) {
      setLaunchError('Erro interno: ID do jogo ou Token não encontrado.');
      setFailureType(LAUNCH_FAILURE.NETWORK_ERROR);
      setIsLaunching(false);
      return;
    }

    // Reset state no início
    if (attemptNumber === 0) {
      cancelledRef.current = false;
      setIsLaunching(true);
      setLaunchError('');
      setFailureType(LAUNCH_FAILURE.NONE);
      setCheckoutUrl(null);
      setRetryCount(0);
      setIsRetrying(false);
    }

    // 🔧 FIX: Usa apiClient centralizado (MESMA função dos outros endpoints)
    const result = await launchGame(gameId, jwtToken, userEmail);

    // Se foi cancelado durante a request
    if (cancelledRef.current) return;

    if (result.error) {
      const statusCode = result.statusCode;
      const failure = classifyFailure(statusCode, {
        requiresPaywall: result.requiresPaywall,
      });

      // 🔧 FIX: Salva checkout URL se for paywall
      if (result.requiresPaywall) {
        setCheckoutUrl(result.checkoutUrl);
      }

      // 🔧 FIX: RETRY INTELIGENTE — Só retenta erros recuperáveis
      if (isRetryableError(statusCode) && attemptNumber < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attemptNumber];
        const nextAttempt = attemptNumber + 1;

        setRetryCount(nextAttempt);
        setIsRetrying(true);
        setLaunchError(`⏳ Tentativa ${nextAttempt}/${MAX_RETRIES}... Aguarde.`);
        setFailureType(failure);

        retryTimerRef.current = setTimeout(() => {
          if (!cancelledRef.current) {
            handleLaunchGame(nextAttempt);
          }
        }, delay);
        return;
      }

      // 🔧 FIX: Sem mais retries — define erro final
      setFailureType(failure);
      setIsRetrying(false);
      setIsLaunching(false);

      const errorMsg = result.error.icon
        ? `${result.error.icon} ${result.error.message}`
        : result.error.message;
      setLaunchError(errorMsg);

      // 🔧 FIX: Se for paywall, dispara evento global
      if (result.requiresPaywall) {
        window.dispatchEvent(new CustomEvent('paywall-required', {
          detail: { checkoutUrl: result.checkoutUrl, source: 'game' }
        }));
      }

      return;
    }

    // 🔧 FIX: Sucesso! 
    setGameUrl(result.gameUrl);
    setLaunchError('');
    setFailureType(LAUNCH_FAILURE.NONE);
    setIsLaunching(false);
    setIsRetrying(false);
    setRetryCount(0);
    iframeRelaunchAttemptRef.current = 0;
  }, [selectedRoulette, jwtToken, userEmail]);

  // ════════════════════════════════════════════════════════════
  // 🔧 FIX: handleIframeError — Re-launch 1x automático
  // ════════════════════════════════════════════════════════════

  const handleIframeError = useCallback(() => {
    if (iframeRelaunchAttemptRef.current === 0) {
      // 🔧 FIX: Primeira vez — re-launch automático após 3s
      iframeRelaunchAttemptRef.current = 1;
      console.log('🔄 [useGameLauncher] Iframe error — tentando re-launch automático em 3s');
      setTimeout(() => {
        if (gameUrl) {
          setGameUrl('');
          setTimeout(() => handleLaunchGame(0), 500);
        }
      }, 3000);
    } else {
      // 🔧 FIX: Segunda vez — mostra erro estático (NÃO fullscreen)
      setIframeError(true);
      setLaunchError('⚠️ Erro ao carregar o jogo. Clique em "Tentar Novamente".');
      setFailureType(LAUNCH_FAILURE.SERVER_ERROR);
    }
  }, [gameUrl, handleLaunchGame]);

  // ════════════════════════════════════════════════════════════
  // 🔧 FIX: retryFromError — Para botão "Tentar Novamente"
  // ════════════════════════════════════════════════════════════

  const retryFromError = useCallback(() => {
    setIframeError(false);
    iframeRelaunchAttemptRef.current = 0;
    handleLaunchGame(0);
  }, [handleLaunchGame]);

  // ════════════════════════════════════════════════════════════
  // resetGame — Limpa TUDO
  // ════════════════════════════════════════════════════════════

  const resetGame = useCallback(() => {
    cancelRetry();
    setGameUrl('');
    setLaunchError('');
    setIframeError(false);
    setFailureType(LAUNCH_FAILURE.NONE);
    setCheckoutUrl(null);
    iframeRelaunchAttemptRef.current = 0;
    hasLaunchedRef.current = false;
  }, [cancelRetry]);

  // ════════════════════════════════════════════════════════════
  // 🔧 FIX: Auto-launch com guard hasLaunchedRef (evita loop)
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (
      isAuthenticated &&
      jwtToken &&
      !gameUrl &&
      !isLaunching &&
      !hasLaunchedRef.current
    ) {
      hasLaunchedRef.current = true;
      console.log('🎮 [useGameLauncher] Autenticado, iniciando jogo automaticamente...');
      handleLaunchGame(0);
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

  // 🔧 FIX: Reset hasLaunched quando muda de roleta
  useEffect(() => {
    hasLaunchedRef.current = false;
  }, [selectedRoulette]);

  // 🔧 FIX: Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // ════════════════════════════════════════════════════════════
  // RETORNO
  // ════════════════════════════════════════════════════════════

  return {
    isLaunching,
    launchError,
    setLaunchError,
    gameUrl,
    setGameUrl,
    iframeError,
    setIframeError,

    // 🔧 FIX: Novos exports
    failureType,
    retryCount,
    isRetrying,
    checkoutUrl,

    // Actions
    handleLaunchGame,
    handleIframeError,
    retryFromError,
    cancelRetry,
    resetGame,
  };
};