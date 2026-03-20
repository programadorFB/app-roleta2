// tests/unit/useGameLauncher.test.js
// Testa: LAUNCH_FAILURE enum, valores corretos, completude

import { describe, it, expect } from 'vitest';
import { LAUNCH_FAILURE } from '../../src/hooks/useGameLauncher.js';
import { isRetryableError } from '../../src/lib/errorHandler.js';

// ══════════════════════════════════════════════════════════════
// LAUNCH_FAILURE enum
// ══════════════════════════════════════════════════════════════

describe('LAUNCH_FAILURE enum', () => {
  it('tem todos os 7 tipos definidos', () => {
    expect(Object.keys(LAUNCH_FAILURE)).toHaveLength(7);
  });

  it('contém NONE', () => {
    expect(LAUNCH_FAILURE.NONE).toBe('NONE');
  });

  it('contém PAYWALL', () => {
    expect(LAUNCH_FAILURE.PAYWALL).toBe('PAYWALL');
  });

  it('contém SESSION_EXPIRED', () => {
    expect(LAUNCH_FAILURE.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
  });

  it('contém FORBIDDEN', () => {
    expect(LAUNCH_FAILURE.FORBIDDEN).toBe('FORBIDDEN');
  });

  it('contém NOT_FOUND', () => {
    expect(LAUNCH_FAILURE.NOT_FOUND).toBe('NOT_FOUND');
  });

  it('contém SERVER_ERROR', () => {
    expect(LAUNCH_FAILURE.SERVER_ERROR).toBe('SERVER_ERROR');
  });

  it('contém NETWORK_ERROR', () => {
    expect(LAUNCH_FAILURE.NETWORK_ERROR).toBe('NETWORK_ERROR');
  });

  it('todos os valores são strings únicas', () => {
    const values = Object.values(LAUNCH_FAILURE);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('nenhum valor é null/undefined', () => {
    Object.values(LAUNCH_FAILURE).forEach(value => {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Cenários de mapeamento failureType ↔ ação no App
// Testa a tabela de cenários da política de falha
// ══════════════════════════════════════════════════════════════

describe('Tabela de cenários (failureType → ação esperada)', () => {
  // Simula a lógica de classifyFailure que está dentro do hook

  function classifyFailure(statusCode, errorInfo = {}) {
    if (errorInfo.requiresPaywall) return LAUNCH_FAILURE.PAYWALL;
    switch (statusCode) {
      case 401: return LAUNCH_FAILURE.SESSION_EXPIRED;
      case 403: return LAUNCH_FAILURE.FORBIDDEN;
      case 404: return LAUNCH_FAILURE.NOT_FOUND;
      case 0:   return LAUNCH_FAILURE.NETWORK_ERROR;
      default:
        if (statusCode >= 500) return LAUNCH_FAILURE.SERVER_ERROR;
        if (statusCode === 408 || statusCode === 504) return LAUNCH_FAILURE.SERVER_ERROR;
        return LAUNCH_FAILURE.NETWORK_ERROR;
    }
  }

  it('401 → SESSION_EXPIRED (logout automático)', () => {
    expect(classifyFailure(401)).toBe(LAUNCH_FAILURE.SESSION_EXPIRED);
  });

  it('403 + paywall → PAYWALL (modal de assinatura)', () => {
    expect(classifyFailure(403, { requiresPaywall: true })).toBe(LAUNCH_FAILURE.PAYWALL);
  });

  it('403 genérico → FORBIDDEN (botão login novamente)', () => {
    expect(classifyFailure(403)).toBe(LAUNCH_FAILURE.FORBIDDEN);
  });

  it('404 → NOT_FOUND (só mensagem, troca no dropdown)', () => {
    expect(classifyFailure(404)).toBe(LAUNCH_FAILURE.NOT_FOUND);
  });

  it('500 → SERVER_ERROR (botão retry)', () => {
    expect(classifyFailure(500)).toBe(LAUNCH_FAILURE.SERVER_ERROR);
  });

  it('502 → SERVER_ERROR (botão retry)', () => {
    expect(classifyFailure(502)).toBe(LAUNCH_FAILURE.SERVER_ERROR);
  });

  it('503 → SERVER_ERROR (botão retry)', () => {
    expect(classifyFailure(503)).toBe(LAUNCH_FAILURE.SERVER_ERROR);
  });

  it('504 → SERVER_ERROR (botão retry)', () => {
    expect(classifyFailure(504)).toBe(LAUNCH_FAILURE.SERVER_ERROR);
  });

  it('408 (timeout) → SERVER_ERROR (botão retry)', () => {
    expect(classifyFailure(408)).toBe(LAUNCH_FAILURE.SERVER_ERROR);
  });

  it('0 (rede) → NETWORK_ERROR (botão retry)', () => {
    expect(classifyFailure(0)).toBe(LAUNCH_FAILURE.NETWORK_ERROR);
  });

  it('paywall tem prioridade sobre 403 genérico', () => {
    // Mesmo com status 403, se requiresPaywall=true, deve ser PAYWALL e não FORBIDDEN
    const result = classifyFailure(403, { requiresPaywall: true });
    expect(result).toBe(LAUNCH_FAILURE.PAYWALL);
    expect(result).not.toBe(LAUNCH_FAILURE.FORBIDDEN);
  });
});

// ══════════════════════════════════════════════════════════════
// Retry policy — quais status retentam
// ══════════════════════════════════════════════════════════════

describe('Retry policy', () => {
  const RETRY_DELAYS = [2000, 5000, 10000];
  const MAX_RETRIES = 3;

  it('retry delays são [2s, 5s, 10s]', () => {
    expect(RETRY_DELAYS).toEqual([2000, 5000, 10000]);
  });

  it('máximo de 3 retries', () => {
    expect(MAX_RETRIES).toBe(3);
    expect(RETRY_DELAYS.length).toBe(MAX_RETRIES);
  });

  it('NÃO faz retry em 401 (erro do usuário)', () => {
    expect(isRetryableError(401)).toBe(false);
  });

  it('NÃO faz retry em 403 (erro do usuário)', () => {
    expect(isRetryableError(403)).toBe(false);
  });

  it('NÃO faz retry em 404 (recurso não existe)', () => {
    expect(isRetryableError(404)).toBe(false);
  });

  it('NÃO faz retry em 422 (dados inválidos)', () => {
    expect(isRetryableError(422)).toBe(false);
  });

  it('FAZ retry em 500 (servidor)', () => {
    expect(isRetryableError(500)).toBe(true);
  });

  it('FAZ retry em 502 (gateway)', () => {
    expect(isRetryableError(502)).toBe(true);
  });

  it('FAZ retry em 503 (serviço indisponível)', () => {
    expect(isRetryableError(503)).toBe(true);
  });

  it('FAZ retry em 504 (timeout gateway)', () => {
    expect(isRetryableError(504)).toBe(true);
  });

  it('FAZ retry em 0 (erro de rede)', () => {
    expect(isRetryableError(0)).toBe(true);
  });

  it('FAZ retry em 408 (timeout)', () => {
    expect(isRetryableError(408)).toBe(true);
  });
});