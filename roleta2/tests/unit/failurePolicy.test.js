// tests/unit/failurePolicy.test.js
// Testa: A tabela completa de cenários de falha ao abrir jogo
// Garante: ZERO becos sem saída — cada erro tem ação definida

import { describe, it, expect } from 'vitest';
import { LAUNCH_FAILURE } from '../../src/hooks/useGameLauncher.js';
import { isRetryableError } from '../../src/lib/errorHandler.js';

// ══════════════════════════════════════════════════════════════
// Simulação da lógica do App.jsx para renderizar botões
// ══════════════════════════════════════════════════════════════

/**
 * Dada um failureType + isRetrying, retorna qual ação o usuário tem disponível.
 * Reproduz a lógica do bloco de erro contextual do App.jsx.
 */
function getAvailableAction(failureType, isRetrying = false) {
  if (failureType === LAUNCH_FAILURE.NONE) return 'no-error';

  if (failureType === LAUNCH_FAILURE.SESSION_EXPIRED) return 'auto-logout';
  if (failureType === LAUNCH_FAILURE.PAYWALL) return 'button-renovar-assinatura';
  if (failureType === LAUNCH_FAILURE.FORBIDDEN) return 'button-login-novamente';
  if (failureType === LAUNCH_FAILURE.NOT_FOUND) return 'message-only-troque-dropdown';

  if (failureType === LAUNCH_FAILURE.SERVER_ERROR || failureType === LAUNCH_FAILURE.NETWORK_ERROR) {
    if (isRetrying) return 'button-cancelar';
    return 'button-tentar-novamente';
  }

  return 'unknown'; // Não deveria acontecer
}

// ══════════════════════════════════════════════════════════════
// TABELA DE CENÁRIOS
// ══════════════════════════════════════════════════════════════

describe('Tabela de cenários — zero becos sem saída', () => {

  it('401 (sessão expirada) → logout automático, sem botão', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.SESSION_EXPIRED);
    expect(action).toBe('auto-logout');
  });

  it('403 + assinatura (PAYWALL) → botão "Renovar Assinatura"', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.PAYWALL);
    expect(action).toBe('button-renovar-assinatura');
  });

  it('403 genérico (FORBIDDEN) → botão "Fazer Login Novamente"', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.FORBIDDEN);
    expect(action).toBe('button-login-novamente');
  });

  it('404 (jogo não existe) → mensagem "tente outro" (ação é dropdown)', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.NOT_FOUND);
    expect(action).toBe('message-only-troque-dropdown');
  });

  it('5xx/rede (SERVER_ERROR) → botão "Tentar Novamente"', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.SERVER_ERROR, false);
    expect(action).toBe('button-tentar-novamente');
  });

  it('rede (NETWORK_ERROR) → botão "Tentar Novamente"', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.NETWORK_ERROR, false);
    expect(action).toBe('button-tentar-novamente');
  });

  it('durante retry → botão "Cancelar"', () => {
    expect(getAvailableAction(LAUNCH_FAILURE.SERVER_ERROR, true)).toBe('button-cancelar');
    expect(getAvailableAction(LAUNCH_FAILURE.NETWORK_ERROR, true)).toBe('button-cancelar');
  });

  it('NONE → sem erro exibido', () => {
    const action = getAvailableAction(LAUNCH_FAILURE.NONE);
    expect(action).toBe('no-error');
  });
});

// ══════════════════════════════════════════════════════════════
// Garantia: TODOS os failureTypes têm ação definida
// ══════════════════════════════════════════════════════════════

describe('Completude — nenhum failureType sem ação', () => {
  const allTypes = Object.values(LAUNCH_FAILURE);

  allTypes.forEach(type => {
    it(`failureType "${type}" tem ação definida (não retorna "unknown")`, () => {
      const action = getAvailableAction(type);
      expect(action).not.toBe('unknown');
    });
  });

  it('todos os 7 tipos são cobertos', () => {
    expect(allTypes).toHaveLength(7);
  });
});

// ══════════════════════════════════════════════════════════════
// Garantia: retry só em erros recuperáveis
// ══════════════════════════════════════════════════════════════

describe('Retry inteligente — nunca retenta erros do usuário', () => {
  const userErrors = [401, 403, 404, 422];
  const serverErrors = [500, 502, 503, 504, 408, 0];

  userErrors.forEach(status => {
    it(`NÃO retenta ${status}`, () => {
      expect(isRetryableError(status)).toBe(false);
    });
  });

  serverErrors.forEach(status => {
    it(`RETENTA ${status}`, () => {
      expect(isRetryableError(status)).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Regras inegociáveis
// ══════════════════════════════════════════════════════════════

describe('Regras inegociáveis', () => {
  it('Regra 1: cada failureType (exceto NONE) tem pelo menos 1 ação para o usuário', () => {
    const typesWithAction = Object.values(LAUNCH_FAILURE)
      .filter(t => t !== LAUNCH_FAILURE.NONE)
      .map(t => getAvailableAction(t));

    typesWithAction.forEach(action => {
      expect(action).not.toBe('no-error');
      expect(action).not.toBe('unknown');
    });
  });

  it('Regra 6: retry nunca retenta 401/403/404', () => {
    expect(isRetryableError(401)).toBe(false);
    expect(isRetryableError(403)).toBe(false);
    expect(isRetryableError(404)).toBe(false);
  });

  it('Regra 8: failureType é string enum, não statusCode', () => {
    // Nenhum valor do enum é um número
    Object.values(LAUNCH_FAILURE).forEach(value => {
      expect(typeof value).toBe('string');
      expect(Number.isNaN(Number(value))).toBe(true);
    });
  });
});
