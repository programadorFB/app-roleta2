/**
 * errorHandler.js — Sistema de Tratamento de Erros HTTP
 * 
 * 🔧 FIX: Reescrito para política completa de falha ao abrir jogo
 * - isRetryableError() exportável
 * - handleAutoLogout() com callback global
 * - processErrorResponse() detecta paywall em QUALQUER contexto
 * - Detecção de paywall: requiresSubscription || code === 'FORBIDDEN_SUBSCRIPTION' || (403 + checkoutUrl)
 * - Erros específicos por contexto: login, game, history, network
 */

// ══════════════════════════════════════════════════════════════
// CALLBACK GLOBAL DE LOGOUT
// ══════════════════════════════════════════════════════════════

let logoutCallback = null;

/**
 * Registra a função de logout a ser chamada em erros 401
 * @param {Function} callback - Função de logout do App
 */
export function registerLogoutCallback(callback) {
  if (typeof callback !== 'function') {
    console.warn('[errorHandler] registerLogoutCallback: callback deve ser uma função');
    return;
  }
  logoutCallback = callback;
  console.log('✅ [errorHandler] Callback de logout registrado');
}

/**
 * Remove o callback de logout
 */
export function clearLogoutCallback() {
  logoutCallback = null;
}

// ══════════════════════════════════════════════════════════════
// MAPA DE ERROS HTTP → MENSAGENS AMIGÁVEIS (PT-BR)
// ══════════════════════════════════════════════════════════════

const ERROR_MESSAGES = {
  400: {
    title: 'Requisição Inválida',
    message: 'Os dados enviados estão incorretos. Verifique as informações e tente novamente.',
    icon: '⚠️'
  },
  401: {
    title: 'Sessão Expirada',
    message: 'Sua sessão expirou. Você será redirecionado para o login.',
    icon: '🔒'
  },
  403: {
    title: 'Acesso Negado',
    message: 'Você não tem permissão para acessar este recurso.',
    icon: '🚫'
  },
  404: {
    title: 'Não Encontrado',
    message: 'O recurso solicitado não foi encontrado.',
    icon: '🔍'
  },
  408: {
    title: 'Tempo Esgotado',
    message: 'A requisição demorou muito. Verifique sua conexão e tente novamente.',
    icon: '⏱️'
  },
  409: {
    title: 'Conflito',
    message: 'Já existe um registro com essas informações.',
    icon: '⚡'
  },
  422: {
    title: 'Dados Inválidos',
    message: 'Os dados enviados não puderam ser processados.',
    icon: '📝'
  },
  429: {
    title: 'Muitas Tentativas',
    message: 'Você fez muitas requisições seguidas. Aguarde alguns segundos.',
    icon: '🌊'
  },
  500: {
    title: 'Erro Interno do Servidor',
    message: 'Ocorreu um erro interno. Tente novamente em instantes.',
    icon: '🔧'
  },
  502: {
    title: 'Gateway Indisponível',
    message: 'O servidor está temporariamente indisponível. Tente novamente.',
    icon: '🌐'
  },
  503: {
    title: 'Serviço Indisponível',
    message: 'O sistema está em manutenção ou sobrecarregado. Tente novamente em alguns minutos.',
    icon: '🛠️'
  },
  504: {
    title: 'Timeout do Gateway',
    message: 'O servidor demorou demais para responder. Tente novamente.',
    icon: '⏳'
  }
};

// ══════════════════════════════════════════════════════════════
// ERROS ESPECÍFICOS POR CONTEXTO
// ══════════════════════════════════════════════════════════════

const CONTEXT_ERRORS = {
  login: {
    'INVALID_CREDENTIALS': 'E-mail ou senha incorretos.',
    'ACCOUNT_LOCKED': 'Conta temporariamente bloqueada por muitas tentativas.',
    'ACCOUNT_DISABLED': 'Conta desativada. Entre em contato com o suporte.',
    'FORBIDDEN_SUBSCRIPTION': 'Você precisa de uma assinatura ativa para acessar.',
    'SUBSCRIPTION_REQUIRED': 'Assinatura necessária. Renove para continuar.',
  },
  game: {
    'FORBIDDEN_SUBSCRIPTION': 'Sua assinatura expirou. Renove para jogar.',
    'SUBSCRIPTION_REQUIRED': 'Assinatura necessária para iniciar o jogo.',
    'GAME_NOT_FOUND': 'Jogo não encontrado. Selecione outro jogo.',
    'GAME_UNAVAILABLE': 'Este jogo está indisponível no momento. Tente outro.',
    'PROVIDER_ERROR': 'Problemas com a provedora do jogo. Tente novamente.',
    'INVALID_TOKEN': 'Token de autenticação inválido. Faça login novamente.',
  },
  history: {
    'NO_DATA': 'Nenhum histórico disponível para esta roleta.',
    'INVALID_SOURCE': 'Roleta não encontrada. Verifique sua seleção.',
    'SUBSCRIPTION_REQUIRED': 'Você precisa de uma assinatura ativa para acessar o histórico.',
    'FORBIDDEN_SUBSCRIPTION': 'Assinatura necessária para acessar o histórico completo.',
  },
  network: {
    'FETCH_FAILED': 'Não foi possível conectar ao servidor. Verifique sua internet.',
    'CORS_ERROR': 'Erro de segurança ao acessar a API. Contate o suporte.',
    'TIMEOUT': 'A conexão demorou demais. Verifique sua internet.',
    'NETWORK_ERROR': 'Erro de rede. Verifique sua conexão com a internet.'
  }
};

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: isRetryableError — EXPORTÁVEL
// Determina se um erro HTTP é retentável
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se o status code indica um erro retentável
 * 5xx, 0 (rede), 408 (timeout), 504 (gateway timeout) = retryable
 * 401, 403, 404, 422 = NÃO retryable (erros do usuário)
 * @param {number} statusCode
 * @returns {boolean}
 */
export function isRetryableError(statusCode) {
  // 🔧 FIX: Status 0 = erro de rede (fetch failed)
  if (statusCode === 0) return true;
  // 🔧 FIX: Timeouts específicos
  if (statusCode === 408 || statusCode === 504) return true;
  // 🔧 FIX: Qualquer 5xx
  if (statusCode >= 500 && statusCode < 600) return true;
  // Tudo mais NÃO é retentável
  return false;
}

// ══════════════════════════════════════════════════════════════
// handleAutoLogout — Logout automático em 401
// ══════════════════════════════════════════════════════════════

/**
 * 🔧 FIX: Executa o logout automático para erros 401
 * Delay de 1.5s para o usuário ver a mensagem
 * @param {number} statusCode
 */
export function handleAutoLogout(statusCode) {
  if (statusCode === 401 && logoutCallback) {
    console.warn('🔒 [errorHandler] Erro 401 detectado — Executando logout automático em 1.5s');
    setTimeout(() => {
      if (logoutCallback) logoutCallback();
    }, 1500);
  }
}

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: detectPaywall — Unificado para QUALQUER contexto
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se o erro indica necessidade de paywall
 * Condições (qualquer uma = paywall):
 * 1. requiresSubscription === true
 * 2. code === 'FORBIDDEN_SUBSCRIPTION'
 * 3. status === 403 && checkoutUrl presente
 * @param {number} statusCode
 * @param {Object} errorData
 * @returns {{ requiresPaywall: boolean, checkoutUrl: string|null }}
 */
function detectPaywall(statusCode, errorData = {}) {
  const requiresPaywall =
    errorData.requiresSubscription === true ||
    errorData.code === 'FORBIDDEN_SUBSCRIPTION' ||
    (statusCode === 403 && !!errorData.checkoutUrl);

  return {
    requiresPaywall,
    checkoutUrl: errorData.checkoutUrl || null
  };
}

// ══════════════════════════════════════════════════════════════
// translateError — Mensagem amigável por status + contexto
// ══════════════════════════════════════════════════════════════

/**
 * Traduz um erro HTTP em mensagem amigável
 * @param {number} statusCode
 * @param {string} context - login | game | history | network | generic
 * @param {Object} errorData - Dados adicionais do erro
 * @returns {Object} { title, message, icon, details }
 */
export function translateError(statusCode, context = 'generic', errorData = {}) {
  // 🔧 FIX: Executa logout automático se 401
  handleAutoLogout(statusCode);

  // Tenta erro específico do contexto pelo code
  if (errorData.code && CONTEXT_ERRORS[context]?.[errorData.code]) {
    return {
      title: ERROR_MESSAGES[statusCode]?.title || 'Erro',
      message: CONTEXT_ERRORS[context][errorData.code],
      icon: ERROR_MESSAGES[statusCode]?.icon || '❌',
      details: errorData.message || null
    };
  }

  // 🔧 FIX: Mensagem especial para 500 em contexto de game — verificações pendentes
  if (statusCode >= 500 && context === 'game') {
    return {
      title: 'Verificações Pendentes',
      message: 'Antes de jogar, complete todas as verificações na plataforma: verificação facial, telefone, e-mail e dados pessoais.',
      icon: '⚠️',
      details: errorData.message || null
    };
  }

  // 🔧 FIX: Mensagem especial para 404 em contexto de game
  if (statusCode === 404 && context === 'game') {
    return {
      title: 'Jogo Indisponível',
      message: 'Este jogo não está disponível no momento. Selecione outro jogo.',
      icon: '🔍',
      details: errorData.message || null
    };
  }

  // 🔧 FIX: Mensagem especial para 403 com paywall
  const paywallInfo = detectPaywall(statusCode, errorData);
  if (paywallInfo.requiresPaywall) {
    return {
      title: 'Assinatura Necessária',
      message: 'Sua assinatura expirou ou não foi encontrada. Renove para continuar.',
      icon: '💳',
      details: errorData.message || null
    };
  }

  // Mensagem genérica do status code
  const errorInfo = ERROR_MESSAGES[statusCode] || {
    title: `Erro ${statusCode}`,
    message: 'Ocorreu um erro inesperado. Entre em contato com o suporte.',
    icon: '❌'
  };

  return {
    ...errorInfo,
    details: errorData.message || null
  };
}

// ══════════════════════════════════════════════════════════════
// translateNetworkError — Erros de rede (sem resposta HTTP)
// ══════════════════════════════════════════════════════════════

/**
 * Trata erros de rede quando nem a resposta HTTP chega
 * @param {Error} error
 * @returns {Object} { title, message, icon, details, statusCode }
 */
export function translateNetworkError(error) {
  let errorKey = 'NETWORK_ERROR';

  if (error.message.includes('Failed to fetch')) {
    errorKey = 'FETCH_FAILED';
  } else if (error.message.includes('CORS')) {
    errorKey = 'CORS_ERROR';
  } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
    errorKey = 'TIMEOUT';
  }

  return {
    title: 'Erro de Conexão',
    message: CONTEXT_ERRORS.network[errorKey],
    icon: '📡',
    details: error.message,
    // 🔧 FIX: statusCode 0 indica erro de rede (retryable)
    statusCode: 0
  };
}

// ══════════════════════════════════════════════════════════════
// 🔧 FIX: processErrorResponse — Detecta paywall em QUALQUER contexto
// ══════════════════════════════════════════════════════════════

/**
 * Processa resposta de erro da API
 * @param {Response} response - Resposta HTTP
 * @param {string} context - Contexto do erro
 * @returns {Promise<Object>} { title, message, icon, details, requiresPaywall, checkoutUrl, statusCode }
 */
export async function processErrorResponse(response, context = 'generic') {
  let errorData = {};

  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errorData = await response.json();
    } else {
      const text = await response.text();
      errorData = { message: text };
    }
  } catch (e) {
    console.warn('Não foi possível parsear erro da API:', e);
    errorData = { message: 'Erro desconhecido' };
  }

  const translatedError = translateError(response.status, context, errorData);

  // 🔧 FIX: Detecção de paywall unificada para QUALQUER contexto
  const paywallInfo = detectPaywall(response.status, errorData);

  return {
    ...translatedError,
    requiresPaywall: paywallInfo.requiresPaywall,
    checkoutUrl: paywallInfo.checkoutUrl,
    statusCode: response.status,
    originalError: errorData
  };
}

// ══════════════════════════════════════════════════════════════
// displayError — Exibe erro de forma consistente
// ══════════════════════════════════════════════════════════════

/**
 * @param {Object} error - Erro traduzido
 * @param {Function} setErrorState - setState
 * @param {Object} options - { showIcon, timeout }
 */
export function displayError(error, setErrorState, options = {}) {
  const { showIcon = true, timeout = null } = options;

  if (typeof setErrorState !== 'function') {
    console.error('[errorHandler] displayError: setErrorState deve ser uma função');
    return;
  }

  const errorMessage = showIcon
    ? `${error.icon} ${error.message}`
    : error.message;

  setErrorState(errorMessage);

  if (timeout) {
    setTimeout(() => setErrorState(''), timeout);
  }

  if (process.env.NODE_ENV === 'development' && error.details) {
    console.error('[Error Details]:', error.details);
  }
}

// ══════════════════════════════════════════════════════════════
// safeFetch — Wrapper completo para fetch
// ══════════════════════════════════════════════════════════════

/**
 * @param {string} url
 * @param {Object} options
 * @param {string} context
 * @returns {Promise<Object>} { success, data, error }
 */
export async function safeFetch(url, options = {}, context = 'generic') {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await processErrorResponse(response, context);
      return { success: false, data: null, error };
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { success: true, data, error: null };
  } catch (err) {
    const error = translateNetworkError(err);
    return { success: false, data: null, error };
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

export default {
  registerLogoutCallback,
  clearLogoutCallback,
  isRetryableError,
  handleAutoLogout,
  translateError,
  translateNetworkError,
  processErrorResponse,
  displayError,
  safeFetch
};