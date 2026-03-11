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
import { launchGame } from '../services/api';
import { displayError } from '../errorHandler';

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
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [iframeError, setIframeError] = useState(false);
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

    const gameId = ROULETTE_GAME_IDS[selectedRoulette];
    if (!gameId || !jwtToken) {
      setLaunchError('⚠️ Erro interno: ID do jogo ou Token não encontrado.');
      setFailureType(LAUNCH_FAILURE.SESSION_EXPIRED);
      setIsLaunching(false);
      return;
    }

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

  // Auto-launch na primeira vez
  useEffect(() => {
    if (!hasLaunchedRef.current && isAuthenticated && jwtToken && !gameUrl && !isLaunching) {
      hasLaunchedRef.current = true;
      handleLaunchGame(0);
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

  const resetGame = useCallback(() => {
    clearRetryTimeout();
    setGameUrl('');
    setLaunchError('');
    setRetryCount(0);
    setIframeError(false);
    setFailureType(LAUNCH_FAILURE.NONE);
    hasLaunchedRef.current = false;
  }, []);

  const cancelRetry = useCallback(() => {
    clearRetryTimeout();
    setIsLaunching(false);
    setRetryCount(0);
    setLaunchError('');
  }, []);

  return {
    isLaunching,
    launchError,
    gameUrl,
    iframeError,
    retryCount,
    failureType,  // 🔧 App usa isso pra decidir o que mostrar
    handleLaunchGame: () => handleLaunchGame(0),
    handleIframeError,
    resetGame,
    cancelRetry,
    setIframeError,
  };
}