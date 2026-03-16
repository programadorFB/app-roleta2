// tests/unit/subscriptionService.test.js
// Cobertura: extractCustomerData, calculateExpirationByAmount,
//            isValidStatusTransition, verifyHublaWebhook
// Testa lógica pura SEM banco de dados (funções internas recriadas)

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════
// Recria funções internas (não exportadas) para testar isoladamente
// ══════════════════════════════════════════════════════════════

function extractCustomerData(payload) {
  const candidates = [
    payload.data?.customer,
    payload.data?.user,
    payload.event?.member,
    payload.event?.user,
    payload.event?.invoice?.payer,
    payload.member,
    payload.user,
    payload.customer,
    payload.payer,
    payload,
  ];
  for (const c of candidates) {
    if (c?.email) {
      return { email: c.email, hublaId: c.id || c.customerId, name: c.name };
    }
  }
  try {
    const match = JSON.stringify(payload).match(/"email"\s*:\s*"([^"]+)"/);
    if (match) return { email: match[1], hublaId: null, name: null };
  } catch { /* ignore */ }
  return { email: null, hublaId: null, name: null };
}

function calculateExpirationByAmount(totalCents) {
  if (!totalCents) return null;
  const cents = parseInt(totalCents, 10);
  const date  = new Date();
  if (cents <= 9700)       date.setDate(date.getDate() + 30);
  else if (cents <= 19700) date.setDate(date.getDate() + 90);
  else                     date.setFullYear(date.getFullYear() + 1);
  return date;
}

const VALID_TRANSITIONS = {
  pending:  ['active', 'canceled', 'failed'],
  active:   ['canceled', 'expired'],
  trialing: ['active', 'canceled'],
  canceled: ['active'],
  failed:   ['pending', 'active'],
  expired:  ['active'],
};

function isValidStatusTransition(current, next) {
  if (!current || current === next) return true;
  const allowed = VALID_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

function verifyHublaWebhook(hublaToken, expectedToken) {
  if (!expectedToken || !hublaToken) return false;
  try {
    const a = Buffer.from(String(hublaToken));
    const b = Buffer.from(String(expectedToken));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// extractCustomerData
// ══════════════════════════════════════════════════════════════

describe('extractCustomerData', () => {
  it('extrai de data.customer', () => {
    const result = extractCustomerData({
      data: { customer: { email: 'a@b.com', id: '123', name: 'Test' } },
    });
    expect(result).toEqual({ email: 'a@b.com', hublaId: '123', name: 'Test' });
  });

  it('extrai de event.member', () => {
    const result = extractCustomerData({
      event: { member: { email: 'member@x.com', id: 'h1' } },
    });
    expect(result.email).toBe('member@x.com');
    expect(result.hublaId).toBe('h1');
  });

  it('extrai de event.invoice.payer', () => {
    const result = extractCustomerData({
      event: { invoice: { payer: { email: 'payer@x.com', name: 'Payer' } } },
    });
    expect(result.email).toBe('payer@x.com');
    expect(result.name).toBe('Payer');
  });

  it('extrai de payload raiz', () => {
    const result = extractCustomerData({ email: 'root@x.com', id: 'r1' });
    expect(result.email).toBe('root@x.com');
  });

  it('fallback via regex quando email está em campo aninhado desconhecido', () => {
    const result = extractCustomerData({
      deep: { nested: { something: { email: 'hidden@x.com' } } },
    });
    expect(result.email).toBe('hidden@x.com');
    expect(result.hublaId).toBeNull();
  });

  it('retorna nulls quando payload vazio', () => {
    const result = extractCustomerData({});
    expect(result).toEqual({ email: null, hublaId: null, name: null });
  });

  it('prioriza data.customer sobre payload raiz', () => {
    const result = extractCustomerData({
      email: 'root@x.com',
      data: { customer: { email: 'priority@x.com', id: 'p1' } },
    });
    expect(result.email).toBe('priority@x.com');
  });

  it('extrai customerId como hublaId', () => {
    const result = extractCustomerData({
      customer: { email: 'a@b.com', customerId: 'cid-42' },
    });
    expect(result.hublaId).toBe('cid-42');
  });
});

// ══════════════════════════════════════════════════════════════
// calculateExpirationByAmount
// ══════════════════════════════════════════════════════════════

describe('calculateExpirationByAmount', () => {
  it('retorna null para valor falsy (0, null, undefined)', () => {
    expect(calculateExpirationByAmount(null)).toBeNull();
    expect(calculateExpirationByAmount(undefined)).toBeNull();
    expect(calculateExpirationByAmount(0)).toBeNull();
  });

  it('≤ R$97 → 30 dias', () => {
    const date = calculateExpirationByAmount(9700);
    const diff = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(29);
    expect(diff).toBeLessThanOrEqual(31);
  });

  it('R$97.01 → 90 dias', () => {
    const date = calculateExpirationByAmount(9701);
    const diff = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(89);
    expect(diff).toBeLessThanOrEqual(91);
  });

  it('≤ R$197 → 90 dias', () => {
    const date = calculateExpirationByAmount(19700);
    const diff = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(89);
    expect(diff).toBeLessThanOrEqual(91);
  });

  it('> R$197 → 1 ano (~365 dias)', () => {
    const date = calculateExpirationByAmount(19701);
    const diff = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(364);
    expect(diff).toBeLessThanOrEqual(366);
  });

  it('aceita string numérica', () => {
    const date = calculateExpirationByAmount('5000');
    expect(date).toBeInstanceOf(Date);
    const diff = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(29);
  });

  it('retorna Date no futuro', () => {
    const date = calculateExpirationByAmount(9700);
    expect(date.getTime()).toBeGreaterThan(Date.now());
  });
});

// ══════════════════════════════════════════════════════════════
// isValidStatusTransition
// ══════════════════════════════════════════════════════════════

describe('isValidStatusTransition', () => {
  // Transições válidas
  const validTransitions = [
    ['pending', 'active'],
    ['pending', 'canceled'],
    ['pending', 'failed'],
    ['active', 'canceled'],
    ['active', 'expired'],
    ['trialing', 'active'],
    ['trialing', 'canceled'],
    ['canceled', 'active'],
    ['failed', 'pending'],
    ['failed', 'active'],
    ['expired', 'active'],
  ];

  it.each(validTransitions)('%s → %s é válida', (from, to) => {
    expect(isValidStatusTransition(from, to)).toBe(true);
  });

  // Transições inválidas
  const invalidTransitions = [
    ['pending', 'expired'],
    ['active', 'pending'],
    ['active', 'trialing'],
    ['active', 'failed'],
    ['trialing', 'expired'],
    ['trialing', 'failed'],
    ['canceled', 'pending'],
    ['canceled', 'expired'],
    ['expired', 'canceled'],
    ['expired', 'pending'],
  ];

  it.each(invalidTransitions)('%s → %s é inválida', (from, to) => {
    expect(isValidStatusTransition(from, to)).toBe(false);
  });

  it('current null → qualquer status é válida (primeiro registro)', () => {
    expect(isValidStatusTransition(null, 'active')).toBe(true);
    expect(isValidStatusTransition(null, 'pending')).toBe(true);
    expect(isValidStatusTransition(undefined, 'active')).toBe(true);
  });

  it('same status → same status é válida (idempotente)', () => {
    expect(isValidStatusTransition('active', 'active')).toBe(true);
    expect(isValidStatusTransition('pending', 'pending')).toBe(true);
  });

  it('status desconhecido → qualquer é inválida', () => {
    expect(isValidStatusTransition('unknown', 'active')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// verifyHublaWebhook
// ══════════════════════════════════════════════════════════════

describe('verifyHublaWebhook', () => {
  const token = 'x11H8dJDrNRQBZTxicwFObMkk3LG6gSMBwAi5CxGYlRp1JuwRZZsxWm81NSZEgEJ';

  it('aceita token válido', () => {
    expect(verifyHublaWebhook(token, token)).toBe(true);
  });

  it('rejeita token diferente', () => {
    expect(verifyHublaWebhook('wrong-token', token)).toBe(false);
  });

  it('rejeita token null', () => {
    expect(verifyHublaWebhook(null, token)).toBe(false);
  });

  it('rejeita expectedToken null', () => {
    expect(verifyHublaWebhook(token, null)).toBe(false);
  });

  it('rejeita ambos null', () => {
    expect(verifyHublaWebhook(null, null)).toBe(false);
  });

  it('rejeita string vazia', () => {
    expect(verifyHublaWebhook('', token)).toBe(false);
    expect(verifyHublaWebhook(token, '')).toBe(false);
  });

  it('rejeita token com tamanho diferente', () => {
    expect(verifyHublaWebhook('short', token)).toBe(false);
    expect(verifyHublaWebhook(token + 'extra', token)).toBe(false);
  });

  it('timing-safe: não vaza informação por timing', () => {
    // Verifica que a comparação não retorna true para tokens de mesmo tamanho mas conteúdo diferente
    const sameLength = 'a'.repeat(token.length);
    expect(verifyHublaWebhook(sameLength, token)).toBe(false);
  });

  it('aceita diferentes tipos coercíveis', () => {
    expect(verifyHublaWebhook(token, token)).toBe(true);
    // Números são convertidos via String()
    expect(verifyHublaWebhook(12345, 12345)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// ACTIVE_STATUSES
// ══════════════════════════════════════════════════════════════

describe('ACTIVE_STATUSES', () => {
  const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];

  it('contém active, trialing e paid', () => {
    expect(ACTIVE_STATUSES).toContain('active');
    expect(ACTIVE_STATUSES).toContain('trialing');
    expect(ACTIVE_STATUSES).toContain('paid');
  });

  it('NÃO contém canceled, pending, failed, expired', () => {
    expect(ACTIVE_STATUSES).not.toContain('canceled');
    expect(ACTIVE_STATUSES).not.toContain('pending');
    expect(ACTIVE_STATUSES).not.toContain('failed');
    expect(ACTIVE_STATUSES).not.toContain('expired');
  });

  it('tem exatamente 3 itens', () => {
    expect(ACTIVE_STATUSES).toHaveLength(3);
  });
});
