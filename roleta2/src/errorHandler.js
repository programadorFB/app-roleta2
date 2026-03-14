/**
 * Sistema de Tratamento de Erros HTTP
 * Traduz códigos de erro técnicos para mensagens que o usuário entende
 * 🆕 NOVO: Logout automático em erros 401
 */

// 🆕 Callback global para logout automático
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
 * Remove o callback de logout (útil para testes)
 */
export function clearLogoutCallback() {
  logoutCallback = null;
}

// Mapa de erros HTTP genéricos
const ERROR_MESSAGES = {
  // Erros 4xx - Cliente
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
    message: 'Você não tem permissão para acessar este recurso. Verifique sua assinatura.',
    icon: '🚫'
  },
  404: {
    title: 'Não Encontrado',
    message: 'O recurso solicitado não foi encontrado. Entre em contato com o suporte se o problema persistir.',
    icon: '🔍'
  },
  408: {
    title: 'Tempo Esgotado',
    message: 'A requisição demorou muito. Verifique sua conexão e tente novamente.',
    icon: '⏱️'
  },
  409: {
    title: 'Conflito',
    message: 'Já existe um registro com essas informações. Tente com dados diferentes.',
    icon: '⚡'
  },
  422: {
    title: 'Dados Inválidos',
    message: 'Os dados enviados não puderam ser processados. Verifique se todos os campos estão corretos.',
    icon: '📝'
  },
  429: {
    title: 'Muitas Tentativas',
    message: 'Você fez muitas requisições seguidas. Aguarde alguns segundos e tente novamente.',
    icon: '🌊'
  },

  // Erros 5xx - Servidor
  500: {
    title: 'Erro Interno do Servidor',
    message: 'Algo deu errado no servidor. Nossa equipe já foi notificada. Tente novamente em alguns minutos.',
    icon: '🔧'
  },
  502: {
    title: 'Gateway Indisponível',
    message: 'O servidor está temporariamente indisponível. Tente novamente em alguns instantes.',
    icon: '🌐'
  },
  503: {
    title: 'Serviço Indisponível',
    message: 'O sistema está em manutenção ou sobrecarregado. Tente novamente em alguns minutos.',
    icon: '🛠️'
  },
  504: {
    title: 'Timeout do Gateway',
    message: 'O servidor demorou demais para responder. Verifique sua conexão e tente novamente.',
    icon: '⏳'
  }
};

// Erros específicos de contexto
const CONTEXT_ERRORS = {
  // Login
  login: {
    'INVALID_CREDENTIALS': 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.',
    'ACCOUNT_LOCKED': 'Sua conta foi temporariamente bloqueada por segurança. Entre em contato com o suporte.',
    'ACCOUNT_SUSPENDED': 'Sua conta está suspensa. Entre em contato com o suporte para mais informações.',
    'EMAIL_NOT_VERIFIED': 'Você precisa verificar seu e-mail antes de fazer login.',
    'FORBIDDEN_SUBSCRIPTION': 'Sua assinatura expirou ou está inativa. Renove para continuar usando o sistema.'
  },

  // Game Launch
  game: {
    'GAME_NOT_FOUND': 'Este jogo não está disponível no momento. Tente outro jogo.',
    'GAME_UNAVAILABLE': 'O jogo está temporariamente indisponível. Tente novamente em alguns minutos.',
    'INSUFFICIENT_BALANCE': 'Saldo insuficiente para iniciar o jogo.',
    'GAME_SESSION_ERROR': 'Erro ao criar a sessão do jogo. Tente novamente.',
    'INVALID_GAME_ID': 'ID do jogo inválido. Entre em contato com o suporte.'
  },

  // History
  history: {
    'NO_DATA_AVAILABLE': 'Não há dados de histórico disponíveis para esta roleta no momento.',
    'INVALID_SOURCE': 'Roleta não encontrada. Verifique sua seleção.',
    'SUBSCRIPTION_REQUIRED': 'Você precisa de uma assinatura ativa para acessar o histórico completo.'
  },

  // Network
  network: {
    'FETCH_FAILED': 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.',
    'CORS_ERROR': 'Erro de segurança ao tentar acessar a API. Entre em contato com o suporte.',
    'TIMEOUT': 'A conexão demorou demais. Verifique sua internet e tente novamente.',
    'NETWORK_ERROR': 'Erro de rede. Verifique sua conexão com a internet.'
  }
};

/**
 * 🆕 Executa o logout automático para erros 401
 * @param {number} statusCode - Código de status HTTP
 */
function handleAutoLogout(statusCode) {
  if (statusCode === 401 && logoutCallback) {
    console.warn('🔒 [errorHandler] Erro 401 detectado - Executando logout automático');
    
    // Executa logout em um timeout para não bloquear a resposta
    setTimeout(() => {
      logoutCallback();
    }, 1500); // 1.5s de delay para o usuário ver a mensagem
  }
}

/**
 * Traduz um erro HTTP em uma mensagem amigável
 * @param {number} statusCode - Código de status HTTP
 * @param {string} context - Contexto do erro (login, game, history, network)
 * @param {Object} errorData - Dados adicionais do erro (opcional)
 * @returns {Object} - { title, message, icon, details }
 */
export function translateError(statusCode, context = 'generic', errorData = {}) {
  // 🆕 Executa logout automático se for 401
  handleAutoLogout(statusCode);

  // Primeiro, tenta encontrar um erro específico do contexto
  if (errorData.code && CONTEXT_ERRORS[context]?.[errorData.code]) {
    return {
      title: ERROR_MESSAGES[statusCode]?.title || 'Erro',
      message: CONTEXT_ERRORS[context][errorData.code],
      icon: ERROR_MESSAGES[statusCode]?.icon || '❌',
      details: errorData.message || null
    };
  }

  // Se não encontrar, usa a mensagem genérica do status code
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

/**
 * Trata erros de rede (quando nem a resposta HTTP chega)
 * @param {Error} error - Objeto de erro
 * @returns {Object} - { title, message, icon, details }
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
    details: error.message
  };
}

/**
 * Função auxiliar para processar resposta de erro da API
 * @param {Response} response - Resposta HTTP
 * @param {string} context - Contexto do erro
 * @returns {Promise<Object>} - { title, message, icon, details, requiresPaywall, checkoutUrl }
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

  // Adiciona informações especiais (ex: paywall)
  return {
    ...translatedError,
    requiresPaywall: errorData.requiresSubscription || errorData.code === 'FORBIDDEN_SUBSCRIPTION',
    checkoutUrl: errorData.checkoutUrl || null,
    statusCode: response.status,
    originalError: errorData
  };
}

/**
 * Hook/função para exibir erros de forma consistente
 * @param {Object} error - Erro traduzido
 * @param {Function} setErrorState - Função setState para exibir erro
 * @param {Object} options - Opções adicionais { showIcon, timeout }
 */
export function displayError(error, setErrorState, options = {}) {
  const { showIcon = true, timeout = null } = options;
  
  // Valida se setErrorState é uma função
  if (typeof setErrorState !== 'function') {
    console.error('[errorHandler] displayError: setErrorState deve ser uma função');
    return;
  }

  const errorMessage = showIcon 
    ? `${error.icon} ${error.message}` 
    : error.message;

  setErrorState(errorMessage);

  // Auto-limpar erro após timeout (se especificado)
  if (timeout) {
    setTimeout(() => setErrorState(''), timeout);
  }

  // Log técnico para debug (somente em dev)
  if (process.env.NODE_ENV === 'development' && error.details) {
    console.error('[Error Details]:', error.details);
  }
}

/**
 * Wrapper completo para fetch com tratamento de erro
 * @param {string} url - URL da requisição
 * @param {Object} options - Opções do fetch
 * @param {string} context - Contexto do erro
 * @returns {Promise<Object>} - { success, data, error }
 */
export async function safeFetch(url, options = {}, context = 'generic') {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await processErrorResponse(response, context);
      return { success: false, data: null, error };
    }

    // Tenta parsear JSON, mas aceita outros tipos
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

export default {
  registerLogoutCallback,
  clearLogoutCallback,
  translateError,
  translateNetworkError,
  processErrorResponse,
  displayError,
  safeFetch
};