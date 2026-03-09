// src/hooks/useGameLauncher.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { ROULETTE_GAME_IDS } from '../constants/roulette';
import { launchGame } from '../services/api';
import { displayError } from '../errorHandler';

/**
 * Gerencia o lançamento do iframe do jogo.
 * Auto-inicia quando autenticado e sem URL ativa.
 */
export function useGameLauncher(selectedRoulette, jwtToken, isAuthenticated) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [iframeError, setIframeError] = useState(false);
  
  const hasLaunchedRef = useRef(false);

  // Reset ao trocar de roleta
  useEffect(() => {
    hasLaunchedRef.current = false;
  }, [selectedRoulette, isAuthenticated]);

  const handleIframeError = useCallback(() => {
    setLaunchError('Erro ao carregar o iframe do jogo.');
  }, []);

  const handleLaunchGame = useCallback(async () => {
    setIsLaunching(true);
    setLaunchError('');

    const gameId = ROULETTE_GAME_IDS[selectedRoulette];
    if (!gameId || !jwtToken) {
      setLaunchError('Erro interno: ID ou Token não encontrado.');
      setIsLaunching(false);
      return;
    }

    const { gameUrl: url, error } = await launchGame(gameId, jwtToken);
    
    if (url) {
      setGameUrl(url);
      setLaunchError('');
    } else if (error) {
      displayError(error, setLaunchError, { showIcon: true });
    }

    setIsLaunching(false);
  }, [selectedRoulette, jwtToken]);

  // Auto-launch na primeira vez
  useEffect(() => {
    if (!hasLaunchedRef.current && isAuthenticated && jwtToken && !gameUrl && !isLaunching) {
      hasLaunchedRef.current = true;
      handleLaunchGame();
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

  const resetGame = useCallback(() => {
    setGameUrl('');
    setLaunchError('');
    hasLaunchedRef.current = false;
  }, []);

  return {
    isLaunching,
    launchError,
    gameUrl,
    iframeError,
    handleLaunchGame,
    handleIframeError,
    resetGame,
    setIframeError,
  };
}