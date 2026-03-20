import { useState, useCallback, useEffect, useRef } from 'react';
import { ROULETTE_GAME_IDS } from '../constants/roulette';
import { launchGame } from '../lib/apiClient.js';
import { isRetryableError } from '../lib/errorHandler.js';

export const LAUNCH_FAILURE = {
  NONE:            'NONE',
  PAYWALL:         'PAYWALL',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN:       'FORBIDDEN',
  NOT_FOUND:       'NOT_FOUND',
  SERVER_ERROR:    'SERVER_ERROR',
  NETWORK_ERROR:   'NETWORK_ERROR',
};

const RETRY_DELAYS = [2000, 5000, 10000];
const MAX_RETRIES  = RETRY_DELAYS.length;

function classifyFailure(statusCode, errorInfo) {
  if (!errorInfo)                return LAUNCH_FAILURE.NONE;
  if (errorInfo.requiresPaywall) return LAUNCH_FAILURE.PAYWALL;
  if (statusCode === 401)        return LAUNCH_FAILURE.SESSION_EXPIRED;
  if (statusCode === 403)        return LAUNCH_FAILURE.FORBIDDEN;
  if (statusCode === 404)        return LAUNCH_FAILURE.NOT_FOUND;
  if (statusCode === 0)          return LAUNCH_FAILURE.NETWORK_ERROR;
  if (statusCode >= 500 || statusCode === 408 || statusCode === 504) return LAUNCH_FAILURE.SERVER_ERROR;
  return LAUNCH_FAILURE.NETWORK_ERROR;
}

export const useGameLauncher = ({ selectedRoulette, jwtToken, isAuthenticated, userEmail }) => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl,     setGameUrl]     = useState('');
  const [iframeError, setIframeError] = useState(false);
  const [failureType, setFailureType] = useState(LAUNCH_FAILURE.NONE);
  const [retryCount,  setRetryCount]  = useState(0);
  const [isRetrying,  setIsRetrying]  = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);

  const hasLaunchedRef           = useRef(false);
  const retryTimerRef            = useRef(null);
  const iframeRelaunchAttemptRef = useRef(0);
  const cancelledRef             = useRef(false);

  const cancelRetry = useCallback(() => {
    cancelledRef.current = true;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    setIsRetrying(false);
    setRetryCount(0);
    setIsLaunching(false);
  }, []);

  const handleLaunchGame = useCallback(async (attemptNumber = 0) => {
    const gameId = ROULETTE_GAME_IDS[selectedRoulette];
    if (!gameId || !jwtToken) {
      setLaunchError('Erro interno: ID do jogo ou Token não encontrado.');
      setFailureType(LAUNCH_FAILURE.NETWORK_ERROR);
      setIsLaunching(false);
      return;
    }

    if (attemptNumber === 0) {
      cancelledRef.current = false;
      setIsLaunching(true);
      setLaunchError('');
      setFailureType(LAUNCH_FAILURE.NONE);
      setCheckoutUrl(null);
      setRetryCount(0);
      setIsRetrying(false);
    }

    const result = await launchGame(gameId, jwtToken, userEmail);
    if (cancelledRef.current) return;

    if (result.error) {
      const failure = classifyFailure(result.statusCode, { requiresPaywall: result.requiresPaywall });

      if (result.requiresPaywall) setCheckoutUrl(result.checkoutUrl);

      if (isRetryableError(result.statusCode) && attemptNumber < MAX_RETRIES) {
        const next = attemptNumber + 1;
        setRetryCount(next);
        setIsRetrying(true);
        setLaunchError(`⏳ Tentativa ${next}/${MAX_RETRIES}... Aguarde.`);
        setFailureType(failure);
        retryTimerRef.current = setTimeout(() => {
          if (!cancelledRef.current) handleLaunchGame(next);
        }, RETRY_DELAYS[attemptNumber]);
        return;
      }

      setFailureType(failure);
      setIsRetrying(false);
      setIsLaunching(false);
      setLaunchError(result.error.icon
        ? `${result.error.icon} ${result.error.message}`
        : result.error.message,
      );

      if (result.requiresPaywall) {
        window.dispatchEvent(new CustomEvent('paywall-required', {
          detail: { checkoutUrl: result.checkoutUrl, source: 'game' },
        }));
      }
      return;
    }

    setGameUrl(result.gameUrl);
    setLaunchError('');
    setFailureType(LAUNCH_FAILURE.NONE);
    setIsLaunching(false);
    setIsRetrying(false);
    setRetryCount(0);
    iframeRelaunchAttemptRef.current = 0;
  }, [selectedRoulette, jwtToken, userEmail]);

  const handleIframeError = useCallback(() => {
    if (iframeRelaunchAttemptRef.current === 0) {
      iframeRelaunchAttemptRef.current = 1;
      setTimeout(() => {
        if (gameUrl) { setGameUrl(''); setTimeout(() => handleLaunchGame(0), 500); }
      }, 3002);
    } else {
      setIframeError(true);
      setLaunchError('⚠️ Erro ao carregar o jogo. Clique em "Tentar Novamente".');
      setFailureType(LAUNCH_FAILURE.SERVER_ERROR);
    }
  }, [gameUrl, handleLaunchGame]);

  const retryFromError = useCallback(() => {
    setIframeError(false);
    iframeRelaunchAttemptRef.current = 0;
    handleLaunchGame(0);
  }, [handleLaunchGame]);

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

  useEffect(() => {
    if (isAuthenticated && jwtToken && !gameUrl && !isLaunching && !hasLaunchedRef.current) {
      hasLaunchedRef.current = true;
      handleLaunchGame(0);
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

  useEffect(() => { hasLaunchedRef.current = false; }, [selectedRoulette]);

  useEffect(() => () => clearTimeout(retryTimerRef.current), []);

  return {
    isLaunching, launchError, setLaunchError,
    gameUrl, setGameUrl,
    iframeError, setIframeError,
    failureType, retryCount, isRetrying, checkoutUrl,
    handleLaunchGame, handleIframeError, retryFromError, cancelRetry, resetGame,
  };
};
