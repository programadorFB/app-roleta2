// tests/unit/redisService.test.js
// Testa: TTL values corretos, KEY generators, cacheAside logic

import { describe, it, expect } from 'vitest';
import { TTL, KEY } from '../../redisService.js';

// ══════════════════════════════════════════════════════════════
// TTL — Valores corretos pós-fix
// ══════════════════════════════════════════════════════════════

describe('TTL values', () => {
  it('SUBSCRIPTION deve ser 60s (era 300s — fix de cache stale pós-pagamento)', () => {
    expect(TTL.SUBSCRIPTION).toBe(60);
  });

  it('FULL_HISTORY deve ser 10s (era 15s — alinhado com polling 5s)', () => {
    expect(TTL.FULL_HISTORY).toBe(10);
  });

  it('LATEST_SPINS deve ser 15s (alinhado com FULL_HISTORY)', () => {
    expect(TTL.LATEST_SPINS).toBe(15);
  });

  it('ADMIN_STATS deve ser 60s', () => {
    expect(TTL.ADMIN_STATS).toBe(60);
  });

  it('ACTIVE_SUBS deve ser 60s', () => {
    expect(TTL.ACTIVE_SUBS).toBe(60);
  });

  it('SUBSCRIPTION deve ser menor ou igual a FULL_HISTORY * 6 (máx 1 min de stale)', () => {
    // Garantia de que subscription não fica stale por muito tempo
    expect(TTL.SUBSCRIPTION).toBeLessThanOrEqual(60);
  });

  it('FULL_HISTORY deve ser >= 2x o intervalo de polling (5s)', () => {
    // Cache deve sobreviver pelo menos 2 ciclos de polling para ser útil
    expect(TTL.FULL_HISTORY).toBeGreaterThanOrEqual(10);
  });
});

// ══════════════════════════════════════════════════════════════
// KEY — Geradores de chave
// ══════════════════════════════════════════════════════════════

describe('KEY generators', () => {
  it('sub() gera chave com prefixo sub:', () => {
    expect(KEY.sub('user@test.com')).toBe('sub:user@test.com');
  });

  it('history() gera chave com prefixo hist:', () => {
    expect(KEY.history('aovivo')).toBe('hist:aovivo');
  });

  it('latest() gera chave com source e limit', () => {
    expect(KEY.latest('aovivo', 100)).toBe('latest:aovivo:100');
    expect(KEY.latest('immersive', 50)).toBe('latest:immersive:50');
  });

  it('latest() com limits diferentes gera chaves diferentes', () => {
    const key1 = KEY.latest('aovivo', 100);
    const key2 = KEY.latest('aovivo', 50);
    expect(key1).not.toBe(key2);
  });

  it('adminStats() retorna chave fixa', () => {
    expect(KEY.adminStats()).toBe('admin:stats');
  });

  it('activeSubs() retorna chave fixa', () => {
    expect(KEY.activeSubs()).toBe('admin:active');
  });

  it('sub() lida com emails com caracteres especiais', () => {
    expect(KEY.sub('user+tag@test.com')).toBe('sub:user+tag@test.com');
    expect(KEY.sub('user.name@test.co.uk')).toBe('sub:user.name@test.co.uk');
  });
});

// ══════════════════════════════════════════════════════════════
// Consistency checks — TTL vs polling intervals
// ══════════════════════════════════════════════════════════════

describe('TTL consistency com polling frontend', () => {
  const FRONTEND_POLL_INTERVAL = 5; // 5 segundos (useSpinHistory.js)
  const BACKGROUND_MONITOR_INTERVAL = 60; // 60 segundos (App.jsx)

  it('FULL_HISTORY TTL é pelo menos 2x o polling interval', () => {
    expect(TTL.FULL_HISTORY).toBeGreaterThanOrEqual(FRONTEND_POLL_INTERVAL * 2);
  });

  it('FULL_HISTORY TTL é menor que o background monitor interval', () => {
    // Cache deve expirar antes do próximo ciclo do monitor para dados frescos
    expect(TTL.FULL_HISTORY).toBeLessThan(BACKGROUND_MONITOR_INTERVAL);
  });

  it('SUBSCRIPTION TTL é razoável para UX (≤ 2 min)', () => {
    expect(TTL.SUBSCRIPTION).toBeLessThanOrEqual(120);
  });

  it('SUBSCRIPTION TTL é maior que 0', () => {
    expect(TTL.SUBSCRIPTION).toBeGreaterThan(0);
  });
});
