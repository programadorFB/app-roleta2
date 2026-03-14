// tests/unit/checkSubscription.test.js
// Testa a lógica de checkSubscriptionWithFallback isoladamente
// (extraída do server.js para teste unitário puro)

import { describe, it, expect } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Lógica isActive extraída do helper checkSubscriptionWithFallback
// ══════════════════════════════════════════════════════════════

const activeStatuses = ['active', 'trialing', 'paid'];

function isActive(sub) {
  if (!sub) return false;
  return activeStatuses.includes(sub.status) &&
    (!sub.expires_at || new Date(sub.expires_at) >= new Date());
}

describe('isActive (lógica de verificação de assinatura)', () => {

  // ── Assinaturas ATIVAS ──────────────────────────────────────

  it('retorna true para status "active" sem expiração', () => {
    expect(isActive({ status: 'active', expires_at: null })).toBe(true);
  });

  it('retorna true para status "trialing" sem expiração', () => {
    expect(isActive({ status: 'trialing', expires_at: null })).toBe(true);
  });

  it('retorna true para status "paid" sem expiração', () => {
    expect(isActive({ status: 'paid', expires_at: null })).toBe(true);
  });

  it('retorna true para status "active" com expiração no futuro', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    expect(isActive({ status: 'active', expires_at: futureDate.toISOString() })).toBe(true);
  });

  it('retorna true para status "active" com expiração exatamente agora (edge case)', () => {
    // >= NOW() inclui o momento exato
    const now = new Date();
    expect(isActive({ status: 'active', expires_at: now.toISOString() })).toBe(true);
  });

  // ── Assinaturas INATIVAS ────────────────────────────────────

  it('retorna false para null', () => {
    expect(isActive(null)).toBe(false);
  });

  it('retorna false para undefined', () => {
    expect(isActive(undefined)).toBe(false);
  });

  it('retorna false para status "canceled"', () => {
    expect(isActive({ status: 'canceled', expires_at: null })).toBe(false);
  });

  it('retorna false para status "expired"', () => {
    expect(isActive({ status: 'expired', expires_at: null })).toBe(false);
  });

  it('retorna false para status "pending"', () => {
    expect(isActive({ status: 'pending', expires_at: null })).toBe(false);
  });

  it('retorna false para status "failed"', () => {
    expect(isActive({ status: 'failed', expires_at: null })).toBe(false);
  });

  it('retorna false para status "active" com expiração no passado', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    expect(isActive({ status: 'active', expires_at: pastDate.toISOString() })).toBe(false);
  });

  it('retorna false para status "paid" com expiração no passado', () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);
    expect(isActive({ status: 'paid', expires_at: pastDate.toISOString() })).toBe(false);
  });

  it('retorna false para objeto sem campo status', () => {
    expect(isActive({ expires_at: null })).toBe(false);
  });

  it('retorna false para objeto vazio', () => {
    expect(isActive({})).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Cenários de fallback — lógica do checkSubscriptionWithFallback
// ══════════════════════════════════════════════════════════════

describe('checkSubscriptionWithFallback — cenários', () => {

  // Simula a lógica do helper sem DB/Redis real

  async function simulateCheck({ cacheResult, dbResult, dbThrows = false }) {
    // 1) Check via cache
    if (isActive(cacheResult)) {
      return { canPlay: true, source: 'cache' };
    }

    // 2) Fresh DB fallback
    if (dbThrows) {
      // Fail-open
      return { canPlay: true, source: 'fail-open' };
    }

    if (isActive(dbResult)) {
      return { canPlay: true, source: 'fresh-db' };
    }

    return { canPlay: false, source: 'both-denied' };
  }

  it('cache ativo → retorna canPlay=true (sem tocar DB)', async () => {
    const result = await simulateCheck({
      cacheResult: { status: 'active', expires_at: null },
      dbResult: null,
    });
    expect(result.canPlay).toBe(true);
    expect(result.source).toBe('cache');
  });

  it('cache stale (canceled) + DB ativo → retorna canPlay=true via fresh DB', async () => {
    const result = await simulateCheck({
      cacheResult: { status: 'canceled', expires_at: null },
      dbResult: { status: 'active', expires_at: null },
    });
    expect(result.canPlay).toBe(true);
    expect(result.source).toBe('fresh-db');
  });

  it('cache null + DB ativo → retorna canPlay=true via fresh DB', async () => {
    const result = await simulateCheck({
      cacheResult: null,
      dbResult: { status: 'active', expires_at: null },
    });
    expect(result.canPlay).toBe(true);
    expect(result.source).toBe('fresh-db');
  });

  it('cache null + DB null → retorna canPlay=false', async () => {
    const result = await simulateCheck({
      cacheResult: null,
      dbResult: null,
    });
    expect(result.canPlay).toBe(false);
    expect(result.source).toBe('both-denied');
  });

  it('cache expirado + DB expirado → retorna canPlay=false', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const expired = { status: 'active', expires_at: pastDate.toISOString() };

    const result = await simulateCheck({
      cacheResult: expired,
      dbResult: expired,
    });
    expect(result.canPlay).toBe(false);
    expect(result.source).toBe('both-denied');
  });

  it('cache stale + DB falha → fail-open (permite acesso)', async () => {
    const result = await simulateCheck({
      cacheResult: { status: 'canceled', expires_at: null },
      dbResult: null,
      dbThrows: true,
    });
    expect(result.canPlay).toBe(true);
    expect(result.source).toBe('fail-open');
  });

  it('cenário pós-pagamento: cache diz cancelado, DB diz ativo (webhook processou)', async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);

    const result = await simulateCheck({
      cacheResult: { status: 'canceled', expires_at: null },
      dbResult: { status: 'active', expires_at: futureDate.toISOString() },
    });
    expect(result.canPlay).toBe(true);
    expect(result.source).toBe('fresh-db');
  });
});
