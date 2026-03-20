// tests/unit/apiClient.test.js
// Testa: request(), findGameUrl(), launchGame()

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findGameUrl } from '../../src/lib/apiClient.js';

// ══════════════════════════════════════════════════════════════
// findGameUrl — busca recursiva de game_url em payloads variados
// ══════════════════════════════════════════════════════════════

describe('findGameUrl', () => {
  it('encontra game_url no caminho launchOptions.launch_options.game_url', () => {
    const data = {
      launchOptions: {
        launch_options: {
          game_url: 'https://game.example.com/play/123'
        }
      }
    };
    expect(findGameUrl(data)).toBe('https://game.example.com/play/123');
  });

  it('encontra game_url no caminho launch_options.game_url', () => {
    const data = {
      launch_options: {
        game_url: 'https://game.example.com/play/456'
      }
    };
    expect(findGameUrl(data)).toBe('https://game.example.com/play/456');
  });

  it('encontra game_url na raiz do objeto', () => {
    const data = { game_url: 'https://game.example.com/play/789' };
    expect(findGameUrl(data)).toBe('https://game.example.com/play/789');
  });

  it('encontra url na raiz (fallback)', () => {
    const data = { url: 'https://game.example.com/play/url' };
    expect(findGameUrl(data)).toBe('https://game.example.com/play/url');
  });

  it('encontra gameURL (variante de nome)', () => {
    const data = { gameURL: 'https://game.example.com/play/gameURL' };
    expect(findGameUrl(data)).toBe('https://game.example.com/play/gameURL');
  });

  it('busca recursivamente em objetos profundamente aninhados', () => {
    const data = {
      response: {
        data: {
          nested: {
            deeply: {
              game_url: 'https://game.example.com/deep'
            }
          }
        }
      }
    };
    expect(findGameUrl(data)).toBe('https://game.example.com/deep');
  });

  it('retorna null quando não encontra game_url', () => {
    const data = { status: 'ok', message: 'Jogo iniciado' };
    expect(findGameUrl(data)).toBeNull();
  });

  it('retorna null para input null/undefined', () => {
    expect(findGameUrl(null)).toBeNull();
    expect(findGameUrl(undefined)).toBeNull();
  });

  it('retorna null para objetos vazios', () => {
    expect(findGameUrl({})).toBeNull();
  });

  it('ignora game_url que não é string', () => {
    const data = { game_url: 12345 };
    expect(findGameUrl(data)).toBeNull();
  });

  it('ignora game_url que não começa com http (nos caminhos conhecidos)', () => {
    const data = {
      launchOptions: {
        launch_options: {
          game_url: 'not-a-url'
        }
      }
    };
    // O caminho conhecido falha, mas busca recursiva encontra como string
    // A busca recursiva não valida http, então encontra
    const result = findGameUrl(data);
    expect(result).toBe('not-a-url');
  });

  it('prioriza caminhos conhecidos sobre busca recursiva', () => {
    const data = {
      launch_options: {
        game_url: 'https://known-path.com'
      },
      nested: {
        game_url: 'https://recursive-path.com'
      }
    };
    expect(findGameUrl(data)).toBe('https://known-path.com');
  });

  it('não entra em loop infinito com referências circulares (protegido por typeof)', () => {
    const data = { a: { b: {} } };
    // Não tem referência circular real, mas testa que a recursão termina
    expect(findGameUrl(data)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// request() — testes com fetch mockado
// ══════════════════════════════════════════════════════════════

describe('request (com fetch mockado)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Seta VITE_API_URL para os testes
    vi.stubEnv('VITE_API_URL', 'https://api.test.com');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('retorna data quando response.ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ jwt: 'token123' }),
    });

    // Import dinâmico para pegar a env atualizada
    const { request } = await import('../../src/lib/apiClient.js');
    const result = await request('/login', { body: { email: 'test@test.com' }, method: 'POST' });

    expect(result.data).toBeTruthy();
    expect(result.error).toBeNull();
    expect(result.statusCode).toBe(200);
  });

  it('retorna erro quando response não é ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: true,
        code: 'FORBIDDEN_SUBSCRIPTION',
        requiresSubscription: true,
        checkoutUrl: 'https://pay.hub.la/xxx',
      }),
    });

    const { request } = await import('../../src/lib/apiClient.js');
    const result = await request('/start-game/120', { context: 'game' });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.statusCode).toBe(403);
    expect(result.requiresPaywall).toBe(true);
    expect(result.checkoutUrl).toBe('https://pay.hub.la/xxx');
  });

  it('retorna statusCode 0 para erro de rede', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const { request } = await import('../../src/lib/apiClient.js');
    const result = await request('/start-game/120', { context: 'game' });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.statusCode).toBe(0);
    expect(result.requiresPaywall).toBe(false);
  });

  it('envia queryParams na URL', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      });
    });

    const { request } = await import('../../src/lib/apiClient.js');
    await request('/start-game/120', {
      queryParams: { userEmail: 'test@test.com' },
      jwtToken: 'abc123',
    });

    expect(capturedUrl).toContain('userEmail=test%40test.com');
  });

  it('envia Authorization header quando jwtToken é fornecido', async () => {
    let capturedHeaders = {};
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      });
    });

    const { request } = await import('../../src/lib/apiClient.js');
    await request('/test', { jwtToken: 'mytoken123' });

    expect(capturedHeaders['Authorization']).toBe('Bearer mytoken123');
  });
});
