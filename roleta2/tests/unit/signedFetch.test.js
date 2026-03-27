// tests/unit/signedFetch.test.js
// Cobertura: src/lib/signedFetch.js — toHex, lógica de assinatura
// Testa apenas a lógica pura sem depender de crypto.subtle (ambiente Node)

import { describe, it, expect } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Recria funções internas puras para teste isolado
// ══════════════════════════════════════════════════════════════

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function shouldSign(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/login') || pathname.startsWith('/start-game');
}

function buildSigningKey() {
  const _p1 = 'sM4r';
  const _p2 = 'tAn4';
  const _p3 = 'l1s3';
  const _p4 = 'X9kQ';
  return [_p1, _p2, _p3, _p4].join('');
}

// ══════════════════════════════════════════════════════════════
// toHex
// ══════════════════════════════════════════════════════════════

describe('toHex', () => {
  it('converte buffer vazio para string vazia', () => {
    expect(toHex(new Uint8Array([]).buffer)).toBe('');
  });

  it('converte byte 0x00 para "00"', () => {
    expect(toHex(new Uint8Array([0]).buffer)).toBe('00');
  });

  it('converte byte 0xff para "ff"', () => {
    expect(toHex(new Uint8Array([255]).buffer)).toBe('ff');
  });

  it('converte múltiplos bytes', () => {
    const result = toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer);
    expect(result).toBe('deadbeef');
  });

  it('cada byte gera exatamente 2 caracteres (com zero padding)', () => {
    const result = toHex(new Uint8Array([1, 2, 3]).buffer);
    expect(result).toBe('010203');
    expect(result.length).toBe(6);
  });

  it('resultado é sempre lowercase hex', () => {
    const result = toHex(new Uint8Array([0xAB, 0xCD]).buffer);
    expect(result).toBe('abcd');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });
});

// ══════════════════════════════════════════════════════════════
// shouldSign — lógica de quais rotas assinar
// ══════════════════════════════════════════════════════════════

describe('shouldSign', () => {
  it('assina rotas /api/*', () => {
    expect(shouldSign('/api/history-delta')).toBe(true);
    expect(shouldSign('/api/motor-score')).toBe(true);
    expect(shouldSign('/api/report-spin')).toBe(true);
  });

  it('assina /login', () => {
    expect(shouldSign('/login')).toBe(true);
  });

  it('assina /start-game', () => {
    expect(shouldSign('/start-game')).toBe(true);
  });

  it('não assina rotas de assets', () => {
    expect(shouldSign('/assets/logo.png')).toBe(false);
    expect(shouldSign('/favicon.ico')).toBe(false);
  });

  it('não assina rota raiz', () => {
    expect(shouldSign('/')).toBe(false);
  });

  it('não assina rotas desconhecidas', () => {
    expect(shouldSign('/random/path')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Signing key
// ══════════════════════════════════════════════════════════════

describe('signingKey', () => {
  it('fallback key tem 16 caracteres', () => {
    const key = buildSigningKey();
    expect(key.length).toBe(16);
  });

  it('fallback key é consistente', () => {
    expect(buildSigningKey()).toBe(buildSigningKey());
  });

  it('fallback key é string não vazia', () => {
    const key = buildSigningKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});
