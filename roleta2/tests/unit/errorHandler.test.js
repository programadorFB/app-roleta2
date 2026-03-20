// tests/unit/errorHandler.test.js
// Testa: isRetryableError, handleAutoLogout, translateError, processErrorResponse, translateNetworkError, displayError

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRetryableError,
  handleAutoLogout,
  registerLogoutCallback,
  clearLogoutCallback,
  translateError,
  translateNetworkError,
  processErrorResponse,
  displayError,
} from '../../src/lib/errorHandler.js';

// ══════════════════════════════════════════════════════════════
// isRetryableError
// ══════════════════════════════════════════════════════════════

describe('isRetryableError', () => {
  it('retorna true para status 0 (erro de rede)', () => {
    expect(isRetryableError(0)).toBe(true);
  });

  it('retorna true para 5xx (500, 502, 503, 504)', () => {
    expect(isRetryableError(500)).toBe(true);
    expect(isRetryableError(502)).toBe(true);
    expect(isRetryableError(503)).toBe(true);
    expect(isRetryableError(504)).toBe(true);
    expect(isRetryableError(599)).toBe(true);
  });

  it('retorna true para 408 (timeout)', () => {
    expect(isRetryableError(408)).toBe(true);
  });

  it('retorna false para erros do usuário (401, 403, 404, 422)', () => {
    expect(isRetryableError(401)).toBe(false);
    expect(isRetryableError(403)).toBe(false);
    expect(isRetryableError(404)).toBe(false);
    expect(isRetryableError(422)).toBe(false);
  });

  it('retorna false para 200 (sucesso)', () => {
    expect(isRetryableError(200)).toBe(false);
  });

  it('retorna false para 429 (rate limit)', () => {
    expect(isRetryableError(429)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// handleAutoLogout + registerLogoutCallback
// ══════════════════════════════════════════════════════════════

describe('handleAutoLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLogoutCallback();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearLogoutCallback();
  });

  it('executa logout callback após 1.5s quando status é 401', () => {
    const logoutFn = vi.fn();
    registerLogoutCallback(logoutFn);

    handleAutoLogout(401);

    // Ainda não executou
    expect(logoutFn).not.toHaveBeenCalled();

    // Avança 1.5s
    vi.advanceTimersByTime(1500);
    expect(logoutFn).toHaveBeenCalledTimes(1);
  });

  it('NÃO executa logout para status diferente de 401', () => {
    const logoutFn = vi.fn();
    registerLogoutCallback(logoutFn);

    handleAutoLogout(403);
    handleAutoLogout(500);
    handleAutoLogout(200);

    vi.advanceTimersByTime(5000);
    expect(logoutFn).not.toHaveBeenCalled();
  });

  it('NÃO executa se callback não foi registrado', () => {
    // Sem registrar callback
    handleAutoLogout(401);
    vi.advanceTimersByTime(5000);
    // Não deve dar erro
  });

  it('registerLogoutCallback ignora valores não-função', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerLogoutCallback('not a function');
    registerLogoutCallback(null);
    registerLogoutCallback(123);

    handleAutoLogout(401);
    vi.advanceTimersByTime(5000);
    // Não deve dar erro

    consoleSpy.mockRestore();
  });
});

// ══════════════════════════════════════════════════════════════
// translateError
// ══════════════════════════════════════════════════════════════

describe('translateError', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLogoutCallback();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearLogoutCallback();
  });

  it('retorna mensagem de sessão expirada para 401', () => {
    const result = translateError(401, 'generic', {});
    expect(result.title).toBe('Sessão Expirada');
    expect(result.icon).toBe('🔒');
  });

  it('retorna mensagem de acesso negado para 403 genérico', () => {
    const result = translateError(403, 'generic', {});
    expect(result.title).toBe('Acesso Negado');
  });

  it('retorna mensagem de assinatura para 403 com FORBIDDEN_SUBSCRIPTION', () => {
    const result = translateError(403, 'game', { code: 'FORBIDDEN_SUBSCRIPTION' });
    expect(result.message).toContain('assinatura');
  });

  it('retorna mensagem de jogo indisponível para 404 no contexto game', () => {
    const result = translateError(404, 'game', {});
    expect(result.title).toBe('Jogo Indisponível');
    expect(result.message).toContain('Selecione outro');
  });

  it('retorna mensagem de paywall quando requiresSubscription é true', () => {
    const result = translateError(403, 'game', { requiresSubscription: true });
    expect(result.title).toBe('Assinatura Necessária');
  });

  it('retorna mensagem de paywall quando checkoutUrl está presente com 403', () => {
    const result = translateError(403, 'history', { checkoutUrl: 'https://pay.hub.la/xxx' });
    expect(result.title).toBe('Assinatura Necessária');
  });

  it('usa erro específico do contexto login quando code bate', () => {
    const result = translateError(401, 'login', { code: 'INVALID_CREDENTIALS' });
    expect(result.message).toBe('E-mail ou senha incorretos.');
  });

  it('usa mensagem genérica para status code desconhecido', () => {
    const result = translateError(418, 'generic', {});
    expect(result.title).toBe('Erro 418');
  });

  it('dispara handleAutoLogout em 401', () => {
    const logoutFn = vi.fn();
    registerLogoutCallback(logoutFn);

    translateError(401, 'game', {});

    vi.advanceTimersByTime(1500);
    expect(logoutFn).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════
// translateNetworkError
// ══════════════════════════════════════════════════════════════

describe('translateNetworkError', () => {
  it('detecta Failed to fetch', () => {
    const result = translateNetworkError(new Error('Failed to fetch'));
    expect(result.title).toBe('Erro de Conexão');
    expect(result.message).toContain('conectar ao servidor');
    expect(result.statusCode).toBe(0);
  });

  it('detecta CORS', () => {
    const result = translateNetworkError(new Error('CORS policy blocked'));
    expect(result.message).toContain('segurança');
  });

  it('detecta timeout', () => {
    const result = translateNetworkError(new Error('Request timeout'));
    expect(result.message).toContain('demorou');
  });

  it('erro genérico de rede', () => {
    const result = translateNetworkError(new Error('Unknown network error'));
    expect(result.message).toContain('rede');
    expect(result.icon).toBe('📡');
  });

  it('sempre retorna statusCode 0', () => {
    const result = translateNetworkError(new Error('qualquer coisa'));
    expect(result.statusCode).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// processErrorResponse
// ══════════════════════════════════════════════════════════════

describe('processErrorResponse', () => {
  beforeEach(() => {
    clearLogoutCallback();
  });

  function mockResponse(status, body) {
    return {
      status,
      headers: {
        get: (name) => name === 'content-type' ? 'application/json' : null,
      },
      json: async () => body,
    };
  }

  it('detecta paywall via requiresSubscription', async () => {
    const response = mockResponse(403, {
      error: true,
      message: 'Assinatura inválida',
      requiresSubscription: true,
      checkoutUrl: 'https://pay.hub.la/xxx',
    });

    const result = await processErrorResponse(response, 'game');
    expect(result.requiresPaywall).toBe(true);
    expect(result.checkoutUrl).toBe('https://pay.hub.la/xxx');
    expect(result.statusCode).toBe(403);
  });

  it('detecta paywall via code FORBIDDEN_SUBSCRIPTION', async () => {
    const response = mockResponse(403, {
      error: true,
      code: 'FORBIDDEN_SUBSCRIPTION',
      checkoutUrl: 'https://pay.hub.la/yyy',
    });

    const result = await processErrorResponse(response, 'history');
    expect(result.requiresPaywall).toBe(true);
    expect(result.checkoutUrl).toBe('https://pay.hub.la/yyy');
  });

  it('NÃO detecta paywall em 403 genérico sem flags', async () => {
    const response = mockResponse(403, {
      error: true,
      message: 'Conta bloqueada',
    });

    const result = await processErrorResponse(response, 'game');
    expect(result.requiresPaywall).toBe(false);
    expect(result.checkoutUrl).toBeNull();
  });

  it('detecta paywall via 403 + checkoutUrl (sem requiresSubscription)', async () => {
    const response = mockResponse(403, {
      error: true,
      checkoutUrl: 'https://pay.hub.la/zzz',
    });

    const result = await processErrorResponse(response, 'game');
    expect(result.requiresPaywall).toBe(true);
  });

  it('retorna statusCode corretamente', async () => {
    const response = mockResponse(500, { error: true });
    const result = await processErrorResponse(response, 'generic');
    expect(result.statusCode).toBe(500);
  });

  it('lida com resposta não-JSON sem quebrar', async () => {
    const response = {
      status: 500,
      headers: {
        get: () => 'text/html',
      },
      text: async () => '<html>Server Error</html>',
    };

    const result = await processErrorResponse(response, 'generic');
    expect(result.statusCode).toBe(500);
    expect(result.requiresPaywall).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// displayError
// ══════════════════════════════════════════════════════════════

describe('displayError', () => {
  it('chama setErrorState com ícone + mensagem', () => {
    const setError = vi.fn();
    displayError({ icon: '🔒', message: 'Sessão expirada' }, setError, { showIcon: true });
    expect(setError).toHaveBeenCalledWith('🔒 Sessão expirada');
  });

  it('chama setErrorState sem ícone quando showIcon=false', () => {
    const setError = vi.fn();
    displayError({ icon: '🔒', message: 'Sessão expirada' }, setError, { showIcon: false });
    expect(setError).toHaveBeenCalledWith('Sessão expirada');
  });

  it('não quebra se setErrorState não é função', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    displayError({ icon: '❌', message: 'Erro' }, null);
    displayError({ icon: '❌', message: 'Erro' }, 'not a function');
    consoleSpy.mockRestore();
  });

  it('auto-limpa erro após timeout', () => {
    vi.useFakeTimers();
    const setError = vi.fn();
    displayError({ icon: '❌', message: 'Erro' }, setError, { timeout: 3001 });

    expect(setError).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3001);
    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenLastCalledWith('');

    vi.useRealTimers();
  });
});
