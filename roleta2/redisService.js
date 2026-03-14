// redisService.js — Camada de cache Redis
// Todas as operações são fail-safe: se o Redis cair, a app continua via DB.
// 🔧 FIX: TTL.SUBSCRIPTION reduzido de 300s para 60s (evita bloqueio pós-pagamento)
// 🔧 FIX: TTL.FULL_HISTORY reduzido de 15s para 10s (alinhado com polling 5s)
// 🔧 FIX: Sentinel max 30s (era 60s)

import { createClient } from 'redis';

// ── TTLs centralizados (segundos) ────────────────────────────
export const TTL = {
  SUBSCRIPTION:    60,    // 🔧 FIX: 1 min (era 5 min — causava bloqueio pós-pagamento)
  FULL_HISTORY:    10,    // 🔧 FIX: 10s (era 15s — polling do front é 5s, no máx 2 ciclos stale)
  LATEST_SPINS:    15,    // 🔧 FIX: 15s (alinhado com FULL_HISTORY)
  ADMIN_STATS:     60,    // 1 min — painel admin
  ACTIVE_SUBS:     60,    // 1 min — lista admin
};

// ── Prefixos de chave ────────────────────────────────────────
export const KEY = {
  sub:          (email) => `sub:${email}`,
  history:      (source) => `hist:${source}`,
  latest:       (source, limit) => `latest:${source}:${limit}`,
  adminStats:   () => 'admin:stats',
  activeSubs:   () => 'admin:active',
};

// ── Cliente Redis ────────────────────────────────────────────
let client = null;
let isConnected = false;

export async function initRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  
  client = createClient({
    url,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Redis: max retries atingido');
        return Math.min(retries * 200, 3000);
      },
    },
  });

  client.on('connect', () => {
    isConnected = true;
    console.log('🔴 [REDIS] Conectado');
  });

  client.on('error', (err) => {
    if (isConnected) console.error('🔴 [REDIS] Erro:', err.message);
    isConnected = false;
  });

  client.on('reconnecting', () => {
    console.log('🔴 [REDIS] Reconectando...');
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn('⚠️ [REDIS] Falha na conexão inicial — app roda sem cache:', err.message);
  }
}

// ── Helpers genéricos (fail-safe) ────────────────────────────

/**
 * GET com deserialização JSON
 * Retorna null se key não existe ou Redis indisponível
 */
export async function cacheGet(key) {
  if (!isConnected) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * SET com serialização JSON e TTL em segundos
 */
export async function cacheSet(key, value, ttl) {
  if (!isConnected) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    // Silencioso — cache é best-effort
  }
}

/**
 * DELETE de uma chave (invalidação)
 */
export async function cacheDel(key) {
  if (!isConnected) return;
  try {
    await client.del(key);
  } catch {
    // Silencioso
  }
}

/**
 * DELETE por padrão (ex: invalidar todos os hist:*)
 * Usa SCAN para não bloquear — seguro em produção
 */
export async function cacheDelPattern(pattern) {
  if (!isConnected) return;
  try {
    let cursor = 0;
    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await client.del(result.keys);
      }
    } while (cursor !== 0);
  } catch {
    // Silencioso
  }
}

// Sentinela para negative caching (evita queries repetidas p/ keys inexistentes)
const EMPTY_SENTINEL = '__EMPTY__';

/**
 * Cache-aside pattern genérico:
 * 1) Tenta ler do cache
 * 2) Se miss, executa fetcher()
 * 3) Salva resultado no cache (inclusive null → sentinela)
 * 4) Retorna resultado
 */
export async function cacheAside(key, ttl, fetcher) {
  const cached = await cacheGet(key);
  if (cached === EMPTY_SENTINEL) return null;   // negative cache hit
  if (cached !== null) return cached;

  const fresh = await fetcher();

  // Cacheia null/undefined como sentinela (TTL menor p/ não prender dados novos)
  if (fresh == null) {
    await cacheSet(key, EMPTY_SENTINEL, Math.min(ttl, 30)); // 🔧 FIX: sentinel max 30s (era 60)
  } else {
    await cacheSet(key, fresh, ttl);
  }

  return fresh;
}

/**
 * Health check do Redis
 */
export async function redisHealthCheck() {
  if (!isConnected) return { status: 'disconnected' };
  try {
    const start = Date.now();
    await client.ping();
    return { status: 'ok', latency: `${Date.now() - start}ms` };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Fecha conexão (graceful shutdown)
 */
export async function closeRedis() {
  if (client) {
    try { await client.quit(); } catch { /* ignore */ }
  }
}