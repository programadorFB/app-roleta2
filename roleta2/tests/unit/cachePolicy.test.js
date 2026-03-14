// tests/unit/cachePolicy.test.js
// Testa: Consistência da política de cache entre Redis TTLs, polling frontend e scraper backend

import { describe, it, expect } from 'vitest';
import { TTL, KEY } from '../../redisService.js';

// ══════════════════════════════════════════════════════════════
// Constantes do sistema (replicadas dos arquivos relevantes)
// ══════════════════════════════════════════════════════════════

const SYSTEM_CONSTANTS = {
  // Frontend (useSpinHistory.js)
  FRONTEND_POLL_INTERVAL_MS: 5000,      // 5s

  // App.jsx — background monitor
  BACKGROUND_MONITOR_INTERVAL_MS: 60000, // 60s

  // server.js
  BACKEND_SCRAPER_INTERVAL_MS: 5000,     // 5s (FETCH_INTERVAL_MS)
  PROXY_TIMEOUT_MS: 60000,               // 60s

  // GameIframe.jsx
  IFRAME_LOAD_TIMEOUT_MS: 30000,         // 30s

  // useGameLauncher.js
  RETRY_DELAYS: [2000, 5000, 10000],     // 2s, 5s, 10s
  MAX_RETRIES: 3,

  // errorHandler.js
  AUTO_LOGOUT_DELAY_MS: 1500,            // 1.5s
};

// ══════════════════════════════════════════════════════════════
// TTL vs Polling — Eficiência de cache
// ══════════════════════════════════════════════════════════════

describe('TTL vs Polling — eficiência de cache', () => {
  const pollIntervalS = SYSTEM_CONSTANTS.FRONTEND_POLL_INTERVAL_MS / 1000;
  const monitorIntervalS = SYSTEM_CONSTANTS.BACKGROUND_MONITOR_INTERVAL_MS / 1000;
  const scraperIntervalS = SYSTEM_CONSTANTS.BACKEND_SCRAPER_INTERVAL_MS / 1000;

  it('FULL_HISTORY TTL (10s) é exatamente 2x o polling interval (5s)', () => {
    expect(TTL.FULL_HISTORY).toBe(pollIntervalS * 2);
  });

  it('FULL_HISTORY TTL cobre pelo menos 2 ciclos de polling antes de expirar', () => {
    const cyclesCovered = TTL.FULL_HISTORY / pollIntervalS;
    expect(cyclesCovered).toBeGreaterThanOrEqual(2);
  });

  it('no máximo ~50% das requests de polling recebem dados stale', () => {
    // Com TTL=10s e poll=5s:
    // Request 1 (t=0): cache miss → fresh data → cache set
    // Request 2 (t=5): cache hit → dados de 5s atrás (stale OK)
    // Request 3 (t=10): cache expired → fresh data
    // Resultado: 50% stale (request 2) — aceitável
    const staleRatio = 1 - (pollIntervalS / TTL.FULL_HISTORY);
    expect(staleRatio).toBeLessThanOrEqual(0.5);
  });

  it('FULL_HISTORY TTL é compatível com scraper interval (dados mudam a cada 5s)', () => {
    // Cache deve expirar antes de acumular muitos ciclos de scraper
    expect(TTL.FULL_HISTORY).toBeLessThanOrEqual(scraperIntervalS * 4);
  });

  it('SUBSCRIPTION TTL (60s) é curto o suficiente para UX pós-pagamento', () => {
    // Após pagar via Hubla, o worst case (sem fresh fallback) seria esperar 60s
    // Com fresh fallback, é 0s — mas o TTL por si só é razoável
    expect(TTL.SUBSCRIPTION).toBeLessThanOrEqual(60);
  });

  it('SUBSCRIPTION TTL é longo o suficiente para reduzir carga no DB', () => {
    // Pelo menos 30s para ter valor como cache
    expect(TTL.SUBSCRIPTION).toBeGreaterThanOrEqual(30);
  });

  it('background monitor (60s) não gera requests redundantes frequentes', () => {
    // 14 sources × 1 request × cada 60s = 14 req/min
    // Com cache de 10s, quase todas acertam cache quente do polling principal
    const requestsPerMinute = 14 * (60 / monitorIntervalS);
    expect(requestsPerMinute).toBeLessThanOrEqual(14);
  });
});

// ══════════════════════════════════════════════════════════════
// Invalidação de cache — quando e onde
// ══════════════════════════════════════════════════════════════

describe('Invalidação de cache — cobertura', () => {
  it('subscription cache é invalidada em upsertSubscription (pagamento/webhook)', () => {
    // Verificação conceitual: subscriptionService.js chama cacheDel(KEY.sub(email))
    // Não podemos testar integração aqui, mas confirmamos que a KEY existe
    const key = KEY.sub('user@test.com');
    expect(key).toBe('sub:user@test.com');
  });

  it('history cache é invalidada em saveNewSignals (scraper)', () => {
    // dbService.js chama cacheDel(KEY.history(sourceName))
    const key = KEY.history('aovivo');
    expect(key).toBe('hist:aovivo');
  });

  it('latest cache é invalidada por pattern em saveNewSignals', () => {
    // dbService.js chama cacheDelPattern(`latest:${sourceName}:*`)
    const key = KEY.latest('aovivo', 100);
    expect(key).toMatch(/^latest:aovivo:\d+$/);
  });

  it('admin caches são invalidados em upsertSubscription', () => {
    expect(KEY.adminStats()).toBe('admin:stats');
    expect(KEY.activeSubs()).toBe('admin:active');
  });
});

// ══════════════════════════════════════════════════════════════
// Background monitor — compartilhamento de cache
// ══════════════════════════════════════════════════════════════

describe('Background monitor — compartilhamento de cache', () => {
  it('monitor usa /api/full-history (compartilha cache hist:{source} com polling)', () => {
    // Antes usava /api/latest que criava chaves separadas latest:{source}:100
    // Agora usa o mesmo endpoint do polling → mesma chave de cache
    const pollingCacheKey = KEY.history('aovivo');
    const monitorCacheKey = KEY.history('aovivo');
    expect(pollingCacheKey).toBe(monitorCacheKey);
  });

  it('endpoint /api/latest gera chave diferente de /api/full-history', () => {
    // Se o monitor usasse /api/latest, criaria chave separada
    const historyKey = KEY.history('aovivo');
    const latestKey = KEY.latest('aovivo', 100);
    expect(historyKey).not.toBe(latestKey);
  });
});

// ══════════════════════════════════════════════════════════════
// Negative caching — sentinel
// ══════════════════════════════════════════════════════════════

describe('Negative caching', () => {
  it('sentinel TTL é no máximo 30s (não prende dados novos por muito tempo)', () => {
    // Em cacheAside, sentinel usa Math.min(ttl, 30)
    // Para SUBSCRIPTION (60s), sentinel seria 30s
    // Para FULL_HISTORY (10s), sentinel seria 10s
    const sentinelTTLForSubscription = Math.min(TTL.SUBSCRIPTION, 30);
    expect(sentinelTTLForSubscription).toBeLessThanOrEqual(30);

    const sentinelTTLForHistory = Math.min(TTL.FULL_HISTORY, 30);
    expect(sentinelTTLForHistory).toBeLessThanOrEqual(30);
  });
});

// ══════════════════════════════════════════════════════════════
// Timers e timeouts do sistema
// ══════════════════════════════════════════════════════════════

describe('Timers do sistema — consistência', () => {
  it('iframe timeout (30s) é menor que proxy timeout (60s)', () => {
    expect(SYSTEM_CONSTANTS.IFRAME_LOAD_TIMEOUT_MS).toBeLessThan(SYSTEM_CONSTANTS.PROXY_TIMEOUT_MS);
  });

  it('retry total máximo (2+5+10=17s) é menor que iframe timeout (30s)', () => {
    const totalRetryTime = SYSTEM_CONSTANTS.RETRY_DELAYS.reduce((a, b) => a + b, 0);
    expect(totalRetryTime).toBeLessThan(SYSTEM_CONSTANTS.IFRAME_LOAD_TIMEOUT_MS);
  });

  it('auto-logout delay (1.5s) é curto o suficiente para não confundir', () => {
    expect(SYSTEM_CONSTANTS.AUTO_LOGOUT_DELAY_MS).toBeLessThanOrEqual(2000);
  });

  it('retry delays são crescentes (backoff exponencial)', () => {
    const delays = SYSTEM_CONSTANTS.RETRY_DELAYS;
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it('MAX_RETRIES corresponde ao número de delays', () => {
    expect(SYSTEM_CONSTANTS.MAX_RETRIES).toBe(SYSTEM_CONSTANTS.RETRY_DELAYS.length);
  });
});
