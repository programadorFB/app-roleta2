/**
 * apiClient.js — Serviço centralizado de requisições à API
 *
 * 🔧 FIX: Nova camada — UMA ÚNICA função request() para TODOS os endpoints
 * - Game launch usa a mesma request() (zero lógica duplicada)
 * - Retorno padronizado: { data, error, requiresPaywall, checkoutUrl, statusCode }
 * - Game launch envia userEmail como query param
 * - Busca recursiva de game_url no payload
 */

import { processErrorResponse, translateNetworkError } from './errorHandler.js';
import { signedFetch } from './signedFetch.js';

const API_URL = import.meta.env.VITE_API_URL;

// ══════════════════════════════════════════════════════════════
// REQUEST GENÉRICA — usada por TODOS os endpoints
// ══════════════════════════════════════════════════════════════

/**
 * Função de request centralizada
 * @param {string} endpoint - Caminho relativo (ex: '/start-game/120')
 * @param {Object} options - { method, headers, body, context, queryParams }
 * @returns {Promise<Object>} { data, error, requiresPaywall, checkoutUrl, statusCode }
 */
export async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    context = 'generic',
    queryParams = {},
    jwtToken = null,
  } = options;

  // 🔧 FIX: Monta URL com query params
  const url = new URL(`${API_URL}${endpoint}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  });

  // Headers padrão
  const finalHeaders = {
    'Accept': 'application/json',
    ...headers,
  };

  // 🔧 FIX: Adiciona JWT se disponível
  if (jwtToken) {
    finalHeaders['Authorization'] = `Bearer ${jwtToken}`;
  }

  const fetchOptions = {
    method,
    headers: finalHeaders,
  };

  if (body) {
    finalHeaders['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await signedFetch(url.toString(), fetchOptions);

    if (!response.ok) {
      // 🔧 FIX: Usa processErrorResponse que detecta paywall em QUALQUER contexto
      const errorInfo = await processErrorResponse(response, context);
      return {
        data: null,
        error: errorInfo,
        requiresPaywall: errorInfo.requiresPaywall || false,
        checkoutUrl: errorInfo.checkoutUrl || null,
        statusCode: response.status,
      };
    }

    // Tenta parsear JSON
    let data;
    const contentType = response.headers.get('content-type');
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

    return {
      data,
      error: null,
      requiresPaywall: false,
      checkoutUrl: null,
      statusCode: response.status,
    };
  } catch (err) {
    // Erros de rede (Failed to fetch, CORS, timeout)
    const errorInfo = translateNetworkError(err);
    return {
      data: null,
      error: errorInfo,
      requiresPaywall: false,
      checkoutUrl: null,
      statusCode: 0, // 🔧 FIX: 0 = erro de rede
    };
  }
}

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: BUSCA RECURSIVA DE game_url NO PAYLOAD
// APIs de jogos retornam estruturas variadas
// ══════════════════════════════════════════════════════════════

/**
 * Busca recursivamente uma key 'game_url' em objeto aninhado
 * @param {Object} obj
 * @returns {string|null}
 */
export function findGameUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // Caminhos conhecidos (checagem rápida)
  const knownPaths = [
    obj?.launchOptions?.launch_options?.game_url,
    obj?.launch_options?.game_url,
    obj?.game_url,
    obj?.url,
    obj?.gameURL,
  ];

  for (const path of knownPaths) {
    if (typeof path === 'string' && path.startsWith('http')) return path;
  }

  // Fallback: busca recursiva
  for (const key in obj) {
    if (key === 'game_url' && typeof obj[key] === 'string') return obj[key];
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const result = findGameUrl(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: launchGame — Usa request() centralizado
// Envia userEmail como query param para verificação de assinatura
// ══════════════════════════════════════════════════════════════

/**
 * Lança um jogo via API
 * @param {string|number} gameId - ID do jogo
 * @param {string} jwtToken - Token JWT
 * @param {string} userEmail - Email do usuário (ESSENCIAL para verificação de assinatura)
 * @returns {Promise<Object>} { gameUrl, error, requiresPaywall, checkoutUrl, statusCode }
 */
export async function launchGame(gameId, jwtToken, userEmail) {
  // 🔧 FIX: Usa a MESMA request() dos outros endpoints
  const result = await request(`/start-game/${gameId}`, {
    method: 'GET',
    jwtToken,
    context: 'game',
    // 🔧 FIX: userEmail viaja como query param para o backend
    queryParams: { userEmail },
  });

  if (result.error) {
    return {
      gameUrl: null,
      error: result.error,
      requiresPaywall: result.requiresPaywall,
      checkoutUrl: result.checkoutUrl,
      statusCode: result.statusCode,
    };
  }

  const data = result.data;

  // 🔧 FIX: Verifica se a API retornou erro internamente (status: 'error')
  const apiErrorMessage = data?.original?.message || data?.message;
  if ((data?.original?.status === 'error' || data?.status === 'error') && apiErrorMessage) {
    const friendlyMessage = apiErrorMessage.includes('Failed to request Softswiss Url')
      ? 'Problemas com a provedora Evolution. Tente novamente.'
      : `Erro da API: ${apiErrorMessage.substring(0, 100)}`;

    return {
      gameUrl: null,
      error: {
        title: 'Erro do Provedor',
        message: friendlyMessage,
        icon: '🎰',
        details: apiErrorMessage,
      },
      requiresPaywall: false,
      checkoutUrl: null,
      statusCode: result.statusCode,
    };
  }

  // 🔧 FIX: Busca recursiva da URL do jogo
  const gameUrl = findGameUrl(data);

  if (!gameUrl) {
    return {
      gameUrl: null,
      error: {
        title: 'URL não encontrada',
        message: 'A URL do jogo não foi retornada pela API. Tente novamente.',
        icon: '🔗',
        details: 'game_url not found in response payload',
      },
      requiresPaywall: false,
      checkoutUrl: null,
      statusCode: result.statusCode,
    };
  }

  return {
    gameUrl,
    error: null,
    requiresPaywall: false,
    checkoutUrl: null,
    statusCode: result.statusCode,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

export default {
  request,
  launchGame,
  findGameUrl,
};