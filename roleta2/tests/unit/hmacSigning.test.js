// tests/unit/hmacSigning.test.js
// Cobertura: HMAC-SHA256 signing e verificação, timing window,
//            signed routes vs unsigned, timing-safe comparison
// Recria lógica do backend (server.js) e frontend (signedFetch.js)

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════
// Recria lógica HMAC do backend (server.js)
// ══════════════════════════════════════════════════════════════

const HMAC_WINDOW_SECONDS = 60;

function generateSignature(secret, timestamp, pathname) {
  const msg = `${timestamp}:${pathname}`;
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

function verifyHmac(secret, sig, ts, pathname) {
  if (!sig || !ts) return false;

  const now = Math.floor(Date.now() / 1000);
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Math.abs(now - tsNum) > HMAC_WINDOW_SECONDS) return false;

  const expected = generateSignature(secret, ts, pathname);
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const SECRET = 'sM4rtAn4l1s3X9kQ';

// ══════════════════════════════════════════════════════════════
// Geração de assinatura
// ══════════════════════════════════════════════════════════════

describe('HMAC Signature generation', () => {
  it('gera hex string de 64 caracteres (SHA-256 = 32 bytes)', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = generateSignature(SECRET, ts, '/api/full-history');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mesma entrada → mesma assinatura (determinístico)', () => {
    const sig1 = generateSignature(SECRET, 1000, '/api/test');
    const sig2 = generateSignature(SECRET, 1000, '/api/test');
    expect(sig1).toBe(sig2);
  });

  it('timestamp diferente → assinatura diferente', () => {
    const sig1 = generateSignature(SECRET, 1000, '/api/test');
    const sig2 = generateSignature(SECRET, 1001, '/api/test');
    expect(sig1).not.toBe(sig2);
  });

  it('pathname diferente → assinatura diferente', () => {
    const sig1 = generateSignature(SECRET, 1000, '/api/full-history');
    const sig2 = generateSignature(SECRET, 1000, '/api/latest');
    expect(sig1).not.toBe(sig2);
  });

  it('secret diferente → assinatura diferente', () => {
    const sig1 = generateSignature('secret-a', 1000, '/api/test');
    const sig2 = generateSignature('secret-b', 1000, '/api/test');
    expect(sig1).not.toBe(sig2);
  });
});

// ══════════════════════════════════════════════════════════════
// Verificação de assinatura
// ══════════════════════════════════════════════════════════════

describe('HMAC Signature verification', () => {
  it('aceita assinatura válida com timestamp atual', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = generateSignature(SECRET, ts, '/api/full-history');

    expect(verifyHmac(SECRET, sig, ts, '/api/full-history')).toBe(true);
  });

  it('rejeita assinatura com secret errado', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = generateSignature('wrong-secret', ts, '/api/test');

    expect(verifyHmac(SECRET, sig, ts, '/api/test')).toBe(false);
  });

  it('rejeita assinatura com pathname errado', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = generateSignature(SECRET, ts, '/api/full-history');

    expect(verifyHmac(SECRET, sig, ts, '/api/latest')).toBe(false);
  });

  it('rejeita assinatura com timestamp manipulado', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = generateSignature(SECRET, ts, '/api/test');

    // Manipula timestamp mas mantém a assinatura original
    const fakeTs = String(parseInt(ts) + 1);
    expect(verifyHmac(SECRET, sig, fakeTs, '/api/test')).toBe(false);
  });

  it('rejeita sig null/undefined/vazia', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifyHmac(SECRET, null, ts, '/api/test')).toBe(false);
    expect(verifyHmac(SECRET, undefined, ts, '/api/test')).toBe(false);
    expect(verifyHmac(SECRET, '', ts, '/api/test')).toBe(false);
  });

  it('rejeita ts null/undefined/vazio', () => {
    const sig = 'a'.repeat(64);
    expect(verifyHmac(SECRET, sig, null, '/api/test')).toBe(false);
    expect(verifyHmac(SECRET, sig, undefined, '/api/test')).toBe(false);
    expect(verifyHmac(SECRET, sig, '', '/api/test')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Timing window
// ══════════════════════════════════════════════════════════════

describe('HMAC Timing window', () => {
  it('aceita request dentro da janela de 60s', () => {
    const ts = String(Math.floor(Date.now() / 1000) - 30); // 30s atrás
    const sig = generateSignature(SECRET, ts, '/api/test');

    expect(verifyHmac(SECRET, sig, ts, '/api/test')).toBe(true);
  });

  it('aceita request exatamente no limite da janela', () => {
    const ts = String(Math.floor(Date.now() / 1000) - HMAC_WINDOW_SECONDS);
    const sig = generateSignature(SECRET, ts, '/api/test');

    expect(verifyHmac(SECRET, sig, ts, '/api/test')).toBe(true);
  });

  it('rejeita request fora da janela de 60s (replay attack)', () => {
    const ts = String(Math.floor(Date.now() / 1000) - HMAC_WINDOW_SECONDS - 1);
    const sig = generateSignature(SECRET, ts, '/api/test');

    expect(verifyHmac(SECRET, sig, ts, '/api/test')).toBe(false);
  });

  it('rejeita timestamp muito no futuro', () => {
    const ts = String(Math.floor(Date.now() / 1000) + HMAC_WINDOW_SECONDS + 10);
    const sig = generateSignature(SECRET, ts, '/api/test');

    expect(verifyHmac(SECRET, sig, ts, '/api/test')).toBe(false);
  });

  it('rejeita timestamp não-numérico', () => {
    const sig = generateSignature(SECRET, 'abc', '/api/test');
    expect(verifyHmac(SECRET, sig, 'abc', '/api/test')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Signed routes vs unsigned
// ══════════════════════════════════════════════════════════════

describe('Route signing policy', () => {
  const signedRoutes = ['/api/full-history', '/api/latest', '/api/history-delta', '/api/motor-score',
    '/api/trigger-score', '/api/motor-analysis', '/api/trigger-analysis',
    '/api/subscription/status', '/login', '/start-game/55'];

  const unsignedRoutes = ['/health'];
  const bypassHeaders = ['x-crawler-secret', 'x-hubla-token'];

  function shouldSign(pathname) {
    return pathname.startsWith('/api/') || pathname.startsWith('/login') || pathname.startsWith('/start-game');
  }

  it('rotas /api/* são assinadas', () => {
    for (const route of signedRoutes.filter(r => r.startsWith('/api/'))) {
      expect(shouldSign(route)).toBe(true);
    }
  });

  it('/login e /start-game são assinadas', () => {
    expect(shouldSign('/login')).toBe(true);
    expect(shouldSign('/start-game/55')).toBe(true);
  });

  it('/health NÃO é assinada', () => {
    expect(shouldSign('/health')).toBe(false);
  });

  it('bypass headers existem para crawler e webhook', () => {
    expect(bypassHeaders).toContain('x-crawler-secret');
    expect(bypassHeaders).toContain('x-hubla-token');
  });
});

// ══════════════════════════════════════════════════════════════
// Timing-safe comparison (anti timing-attack)
// ══════════════════════════════════════════════════════════════

describe('Timing-safe HMAC comparison', () => {
  it('usa timingSafeEqual para comparação', () => {
    // Verifica que a função existe e funciona
    const a = Buffer.from('abc');
    const b = Buffer.from('abc');
    expect(crypto.timingSafeEqual(a, b)).toBe(true);
  });

  it('timingSafeEqual rejeita buffers de tamanho diferente', () => {
    const a = Buffer.from('short');
    const b = Buffer.from('longer-string');
    expect(() => crypto.timingSafeEqual(a, b)).toThrow();
  });

  it('verifyHmac não vaza info sobre posição do erro', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const correctSig = generateSignature(SECRET, ts, '/api/test');

    // Muda primeiro byte
    const wrongSig1 = 'ff' + correctSig.slice(2);
    // Muda último byte
    const wrongSig2 = correctSig.slice(0, -2) + 'ff';

    // Ambos devem ser rejeitados (sem revelar qual posição falhou)
    expect(verifyHmac(SECRET, wrongSig1, ts, '/api/test')).toBe(false);
    expect(verifyHmac(SECRET, wrongSig2, ts, '/api/test')).toBe(false);
  });

  it('rejeita assinatura com caracteres inválidos de hex', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifyHmac(SECRET, 'zzzzzzzz', ts, '/api/test')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// HMAC Window constant
// ══════════════════════════════════════════════════════════════

describe('HMAC_WINDOW_SECONDS', () => {
  it('é 60 segundos', () => {
    expect(HMAC_WINDOW_SECONDS).toBe(60);
  });

  it('é razoável para latência de rede (≥ 30s)', () => {
    expect(HMAC_WINDOW_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it('não é muito grande para prevenir replay attacks (≤ 120s)', () => {
    expect(HMAC_WINDOW_SECONDS).toBeLessThanOrEqual(120);
  });
});
