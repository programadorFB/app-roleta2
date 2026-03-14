// src/hooks/useGameLauncher.js
// ════════════════════════════════════════════════
// 🔧 CORREÇÃO FINAL — Cobertura completa de falhas ao abrir jogo
// 
// Cenários cobertos quando o jogo NÃO abre:
//   ┌─────────────────────┬──────────────────────────────────────────┐
//   │ Causa               │ Ação                                     │
//   ├─────────────────────┼──────────────────────────────────────────┤
//   │ 401 (JWT expirado)  │ Logout automático via errorHandler       │
//   │ 403 (assinatura)    │ Abre PaywallModal + checkout link        │
//   │ 403 (outro motivo)  │ Mensagem + botão "Fazer Login Novamente" │
//   │ 404 (jogo inválido) │ Mensagem fixa + sugere trocar de roleta  │
//   │ 5xx / rede / timeout│ Retry 3x → mensagem + botão "Retentar"  │
//   │ iframe quebra        │ Re-launch automático 1x                  │
//   └─────────────────────┴──────────────────────────────────────────┘
// ════════════════════════════════════════════════

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

// ── Config de Retry ──
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // Backoff: 2s, 5s, 10s

// 🔧 NOVO: Tipos de falha para o App saber o que renderizar
export const LAUNCH_FAILURE = {
  NONE: null,
  PAYWALL: 'paywall',            // Assinatura expirada → abre modal
  SESSION_EXPIRED: 'session',    // 401 → logout automático
  FORBIDDEN: 'forbidden',        // 403 genérico → sugere relogin
  NOT_FOUND: 'not_found',        // Jogo não existe → sugere trocar
  SERVER_ERROR: 'server_error',  // 5xx após retries → retentar manual
  NETWORK_ERROR: 'network',      // Sem internet → retentar manual
};

/**
<<<<<<< HEAD
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
=======
 * Gerencia o lançamento do iframe do jogo.
 * Auto-inicia quando autenticado e sem URL ativa.
 * 
 * Retorna `failureType` para o App decidir o que renderizar:
 *   - PAYWALL → abre PaywallModal
 *   - SESSION_EXPIRED → já deslogou via errorHandler
 *   - FORBIDDEN → mostra botão de relogin
 *   - SERVER_ERROR / NETWORK_ERROR → mostra botão de retentar
 */
export function useGameLauncher(selectedRoulette, jwtToken, isAuthenticated, userEmail) {
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [iframeError, setIframeError] = useState(false);
<<<<<<< HEAD

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
=======
  const [retryCount, setRetryCount] = useState(0);
  const [failureType, setFailureType] = useState(LAUNCH_FAILURE.NONE);

  const hasLaunchedRef = useRef(false);
  const retryTimeoutRef = useRef(null);

  // Reset ao trocar de roleta
  useEffect(() => {
    hasLaunchedRef.current = false;
    setRetryCount(0);
    setFailureType(LAUNCH_FAILURE.NONE);
    clearRetryTimeout();
  }, [selectedRoulette, isAuthenticated]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => clearRetryTimeout();
  }, []);

  function clearRetryTimeout() {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }

  // ══════════════════════════════════════════════
  // Core: lança o jogo com retry e detecção de causa
  // ══════════════════════════════════════════════
  const handleLaunchGame = useCallback(async (attempt = 0) => {
    setIsLaunching(true);
    setLaunchError('');
    setFailureType(LAUNCH_FAILURE.NONE);
    setRetryCount(attempt);
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b

  const handleLaunchGame = useCallback(async (attemptNumber = 0) => {
    const gameId = ROULETTE_GAME_IDS[selectedRoulette];

    if (!gameId || !jwtToken) {
<<<<<<< HEAD
      setLaunchError('Erro interno: ID do jogo ou Token não encontrado.');
      setFailureType(LAUNCH_FAILURE.NETWORK_ERROR);
=======
      setLaunchError('⚠️ Erro interno: ID do jogo ou Token não encontrado.');
      setFailureType(LAUNCH_FAILURE.SESSION_EXPIRED);
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
      setIsLaunching(false);
      return;
    }

<<<<<<< HEAD
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
=======
    // Mostra tentativa para o usuário (exceto a primeira)
    if (attempt > 0) {
      setLaunchError(`🔄 Tentativa ${attempt + 1}/${MAX_RETRIES}...`);
    }

    // Chama API com userEmail para verificação de assinatura no backend
    const result = await launchGame(gameId, jwtToken, userEmail);

    // ── Sucesso ──────────────────────────────
    if (result.gameUrl) {
      setGameUrl(result.gameUrl);
      setLaunchError('');
      setRetryCount(0);
      setFailureType(LAUNCH_FAILURE.NONE);
      setIsLaunching(false);
      return;
    }

    // ── 403 + Assinatura → PAYWALL ──────────
    if (result.requiresPaywall) {
      setIsLaunching(false);
      setRetryCount(0);
      setFailureType(LAUNCH_FAILURE.PAYWALL);

      // Dispara evento para o App abrir o PaywallModal
      window.dispatchEvent(new CustomEvent('paywall-required', {
        detail: { checkoutUrl: result.checkoutUrl },
      }));

      displayError(
        result.error || { icon: '🚫', message: 'Assinatura necessária para iniciar o jogo.' },
        setLaunchError,
        { showIcon: true }
      );
      return;
    }

    // ── 401 → SESSION_EXPIRED (logout via errorHandler) ──
    if (result.statusCode === 401) {
      setIsLaunching(false);
      setRetryCount(0);
      setFailureType(LAUNCH_FAILURE.SESSION_EXPIRED);
      displayError(result.error, setLaunchError, { showIcon: true });
      return; // errorHandler já chamou logoutCallback()
    }

    // ── 403 genérico (conta bloqueada, etc.) ──
    if (result.statusCode === 403) {
      setIsLaunching(false);
      setRetryCount(0);
      setFailureType(LAUNCH_FAILURE.FORBIDDEN);
      displayError(
        result.error || { icon: '🚫', message: 'Acesso negado. Tente fazer login novamente.' },
        setLaunchError,
        { showIcon: true }
      );
      return;
    }

    // ── 404 (jogo não encontrado) ──
    if (result.statusCode === 404) {
      setIsLaunching(false);
      setRetryCount(0);
      setFailureType(LAUNCH_FAILURE.NOT_FOUND);
      displayError(
        { icon: '🔍', message: 'Jogo indisponível. Tente selecionar outra roleta.' },
        setLaunchError,
        { showIcon: true }
      );
      return;
    }

    // ── 422 ou outro 4xx → erro do usuário, sem retry ──
    if (result.statusCode >= 400 && result.statusCode < 500) {
      setIsLaunching(false);
      setRetryCount(0);
      setFailureType(LAUNCH_FAILURE.FORBIDDEN);
      displayError(result.error, setLaunchError, { showIcon: true });
      return;
    }

    // ── 5xx / rede / timeout → Retry com backoff ──
    const failType = result.statusCode === 0
      ? LAUNCH_FAILURE.NETWORK_ERROR
      : LAUNCH_FAILURE.SERVER_ERROR;

    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[attempt] || 10000;
      console.warn(`[useGameLauncher] Tentativa ${attempt + 1} falhou (${result.statusCode}). Retry em ${delay}ms...`);

      setLaunchError(`⏳ Erro ao conectar. Tentando novamente em ${delay / 1000}s... (${attempt + 1}/${MAX_RETRIES})`);

      retryTimeoutRef.current = setTimeout(() => {
        handleLaunchGame(attempt + 1);
      }, delay);
      return;
    }

    // ── Todas as tentativas falharam ──
    setIsLaunching(false);
    setRetryCount(0);
    setFailureType(failType);
    displayError(
      result.error || {
        title: 'Falha ao Iniciar Jogo',
        message: 'Não foi possível iniciar o jogo após várias tentativas. Verifique sua conexão e tente novamente.',
        icon: '❌',
      },
      setLaunchError,
      { showIcon: true }
    );

  }, [selectedRoulette, jwtToken, userEmail]);

  // ── Iframe error: tenta recarregar uma vez ──
  const handleIframeError = useCallback(() => {
    setIframeError(true);
    console.error('[useGameLauncher] Erro no iframe do jogo');

    if (retryCount === 0) {
      setGameUrl('');
      setLaunchError('🔄 Erro no jogo. Reconectando...');
      retryTimeoutRef.current = setTimeout(() => {
        setIframeError(false);
        handleLaunchGame(0);
      }, 3000);
    } else {
      setFailureType(LAUNCH_FAILURE.SERVER_ERROR);
      setLaunchError('⚠️ Erro ao carregar o jogo. Clique em "Reiniciar" para tentar novamente.');
    }
  }, [handleLaunchGame, retryCount]);
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b

  useEffect(() => {
    if (
      isAuthenticated &&
      jwtToken &&
      !gameUrl &&
      !isLaunching &&
      !hasLaunchedRef.current
    ) {
      hasLaunchedRef.current = true;
<<<<<<< HEAD
      console.log('🎮 [useGameLauncher] Autenticado, iniciando jogo automaticamente...');
=======
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
      handleLaunchGame(0);
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

<<<<<<< HEAD
  // 🔧 FIX: Reset hasLaunched quando muda de roleta
  useEffect(() => {
=======
  const resetGame = useCallback(() => {
    clearRetryTimeout();
    setGameUrl('');
    setLaunchError('');
    setRetryCount(0);
    setIframeError(false);
    setFailureType(LAUNCH_FAILURE.NONE);
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
    hasLaunchedRef.current = false;
  }, [selectedRoulette]);

  // 🔧 FIX: Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

<<<<<<< HEAD
  // ════════════════════════════════════════════════════════════
  // RETORNO
  // ════════════════════════════════════════════════════════════
=======
  const cancelRetry = useCallback(() => {
    clearRetryTimeout();
    setIsLaunching(false);
    setRetryCount(0);
    setLaunchError('');
  }, []);
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b

  return {
    isLaunching,
    launchError,
    setLaunchError,
    gameUrl,
    setGameUrl,
    iframeError,
<<<<<<< HEAD
    setIframeError,

    // 🔧 FIX: Novos exports
    failureType,
    retryCount,
    isRetrying,
    checkoutUrl,

    // Actions
    handleLaunchGame,
=======
    retryCount,
    failureType,  // 🔧 App usa isso pra decidir o que mostrar
    handleLaunchGame: () => handleLaunchGame(0),
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
    handleIframeError,
    retryFromError,
    cancelRetry,
    resetGame,
<<<<<<< HEAD
=======
    cancelRetry,
    setIframeError,
>>>>>>> d25e5d7015e35a85bc4ac0c451400a6956e0010b
  };
};