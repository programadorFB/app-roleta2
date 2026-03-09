// src/services/api.js
// ════════════════════════════════════════════════
// Cliente API centralizado — um único ponto de saída de rede
// ════════════════════════════════════════════════

import { API_URL } from '../constants/roulette';
import { processErrorResponse, translateNetworkError } from '../errorHandler';

/**
 * Fetch genérico com tratamento de erros padronizado.
 * Retorna { data, error, requiresPaywall, checkoutUrl }
 */
async function request(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorInfo = await processErrorResponse(response, options.context || 'api');
      return {
        data: null,
        error: errorInfo,
        requiresPaywall: errorInfo.requiresPaywall || response.status === 403,
        checkoutUrl: errorInfo.checkoutUrl || '',
      };
    }

    const data = await response.json();
    return { data, error: null, requiresPaywall: false, checkoutUrl: '' };
  } catch (err) {
    const errorInfo = translateNetworkError(err);
    return {
      data: null,
      error: errorInfo,
      requiresPaywall: false,
      checkoutUrl: '',
    };
  }
}

// ── Histórico ──────────────────────────────────

export async function fetchFullHistory(source, userEmail) {
  const url = `${API_URL}/api/full-history?source=${source}&userEmail=${encodeURIComponent(userEmail)}`;
  return request(url, { context: 'history' });
}

export async function fetchHistorySince(source, sinceTimestamp, userEmail) {
  const url = `${API_URL}/api/history-since?source=${source}&since=${encodeURIComponent(sinceTimestamp)}&userEmail=${encodeURIComponent(userEmail)}`;
  return request(url, { context: 'history' });
}

// ── Autenticação ───────────────────────────────

export async function loginUser(formData) {
  return request(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(formData),
    context: 'login',
  });
}

// ── Game Launcher ──────────────────────────────

export async function launchGame(gameId, jwtToken) {
  const url = `${API_URL}/start-game/${gameId}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${jwtToken}` },
    });

    const rawText = await response.text();

    if (!response.ok) {
      const errorInfo = await processErrorResponse(response, 'game');
      return { gameUrl: null, error: errorInfo };
    }

    const data = JSON.parse(rawText);
    const gameUrl = findGameUrl(data);
    
    return gameUrl
      ? { gameUrl, error: null }
      : { gameUrl: null, error: { message: 'URL do jogo não encontrada.' } };
  } catch (err) {
    const errorInfo = translateNetworkError(err);
    return { gameUrl: null, error: errorInfo };
  }
}

/** Busca recursiva de game_url no payload da API. */
function findGameUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  
  // Caminhos conhecidos (fast path)
  const direct = obj?.launchOptions?.launch_options?.game_url
    || obj?.launch_options?.game_url
    || obj?.game_url
    || obj?.url
    || obj?.gameURL;
  if (direct) return direct;

  // Busca recursiva (fallback)
  for (const key in obj) {
    if (key === 'game_url' && typeof obj[key] === 'string') return obj[key];
    if (typeof obj[key] === 'object') {
      const found = findGameUrl(obj[key]);
      if (found) return found;
    }
  }
  return null;
}