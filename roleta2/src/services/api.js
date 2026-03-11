// src/services/api.js
// ════════════════════════════════════════════════
// Cliente API centralizado — um único ponto de saída de rede
// ════════════════════════════════════════════════
// 🔧 CORREÇÕES:
//   1. launchGame agora usa request() centralizado (antes tinha lógica duplicada)
//   2. Adicionado userEmail no header do game launch para verificação de assinatura
//   3. Retorno padronizado com requiresPaywall e checkoutUrl em TODOS os endpoints
//   4. findGameUrl extraída e testável
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
        statusCode: response.status,
      };
    }

    // 🔧 FIX: Tenta parsear JSON, mas aceita texto se falhar
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { rawText: text };
      }
    }

    return { data, error: null, requiresPaywall: false, checkoutUrl: '', statusCode: response.status };
  } catch (err) {
    const errorInfo = translateNetworkError(err);
    return {
      data: null,
      error: errorInfo,
      requiresPaywall: false,
      checkoutUrl: '',
      statusCode: 0, // 0 = erro de rede
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
// 🔧 CORREÇÃO: Agora usa request() centralizado em vez de fetch duplicado

export async function launchGame(gameId, jwtToken, userEmail) {
  // 🔧 FIX: Inclui userEmail como query param para o backend verificar assinatura
  const emailParam = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : '';
  const url = `${API_URL}/start-game/${gameId}${emailParam}`;

  const result = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${jwtToken}` },
    context: 'game',
  });

  // Se houve erro, retorna no formato esperado pelo useGameLauncher
  if (result.error) {
    return {
      gameUrl: null,
      error: result.error,
      requiresPaywall: result.requiresPaywall,
      checkoutUrl: result.checkoutUrl,
      statusCode: result.statusCode,
    };
  }

  // Sucesso: busca a game_url no payload
  const gameUrl = findGameUrl(result.data);

  if (gameUrl) {
    return { gameUrl, error: null, requiresPaywall: false, checkoutUrl: '', statusCode: result.statusCode };
  }

  // Payload veio OK mas não tinha game_url
  return {
    gameUrl: null,
    error: {
      title: 'Erro no Jogo',
      message: 'URL do jogo não encontrada na resposta. Tente novamente ou escolha outro jogo.',
      icon: '🎮',
    },
    requiresPaywall: false,
    checkoutUrl: '',
    statusCode: result.statusCode,
  };
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