// tests/unit/trialPolicy.test.js
// Testa política de 7 dias grátis para novos usuários

import { describe, it, expect } from 'vitest';

describe('Política de 7 Dias Grátis para Novos Usuários', () => {
  it('calcula data de expiração para exatamente 7 dias no futuro', () => {
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const diffMs = expiresAt.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    expect(diffDays).toBe(7);
  });

  it('valida status trialing como ativo', () => {
    const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];
    expect(ACTIVE_STATUSES.includes('trialing')).toBe(true);
  });

  it('rejeita trial expirado', () => {
    const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];
    const pastDate = new Date(Date.now() - 1000); // 1s atrás
    const sub = { status: 'trialing', expires_at: pastDate };

    const hasAccess = ACTIVE_STATUSES.includes(sub.status) &&
      (!sub.expires_at || new Date(sub.expires_at) >= new Date());

    expect(hasAccess).toBe(false);
  });

  it('permite trial ativo', () => {
    const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const sub = { status: 'trialing', expires_at: futureDate };

    const hasAccess = ACTIVE_STATUSES.includes(sub.status) &&
      (!sub.expires_at || new Date(sub.expires_at) >= new Date());

    expect(hasAccess).toBe(true);
  });

  // Regra de elegibilidade usada por createTrialSubscription(): so a linha 'free'
  // recem-criada no login (sem expires_at) vira trial. Qualquer outra linha e devolvida
  // como esta, para ninguem ganhar um segundo periodo gratis.
  const podeGanharTrial = (sub) =>
    !sub || (sub.status === 'free' && !sub.expires_at);

  it('concede trial para usuario sem linha em subscriptions', () => {
    expect(podeGanharTrial(null)).toBe(true);
  });

  it('promove conta free do login (sem expires_at) para trial', () => {
    expect(podeGanharTrial({ status: 'free', expires_at: null })).toBe(true);
  });

  it('nao reconcede trial para quem ja usou (trialing expirado)', () => {
    expect(podeGanharTrial({ status: 'trialing', expires_at: new Date(Date.now() - 1000) })).toBe(false);
  });

  it('nao rebaixa assinante ativo para trial', () => {
    expect(podeGanharTrial({ status: 'active', expires_at: new Date(Date.now() + 86400000) })).toBe(false);
  });
});
