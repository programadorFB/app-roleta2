// redisCache.js — ⚡ Camada de Cache Redis para latência sub-milissegundo
// 
// ESTRATÉGIA:
//   - Write-through: ao salvar no PG, atualiza Redis simultaneamente
//   - Read-through: tenta Redis primeiro, fallback para PG
//   - TTL curto (5-10s) para history (dados mudam a cada 5s)
//   - TTL médio (60s) para subscription checks
//   - Invalidação explícita no saveNewSignals
//
import redis, { isRedisReady } from './redisClient.js';

// ═══════════════════════════════════════════════════════════════
// PREFIXOS DE CHAVE (namespace para evitar colisão)
// ═══════════════════════════════════════════════════════════════
const KEYS = {
  fullHistory:   (source) => `hist:full:${source}`,
  latestTs:      (source) => `hist:ts:${source}`,
  latest:        (source, limit) => `hist:latest:${source}:${limit}`,
  subscription:  (email) => `sub:${email.toLowerCase().trim()}`,
  sourceHealth:  () => `health:sources`,
};

// ═══════════════════════════════════════════════════════════════
// TTLs (em segundos)
// ═══════════════════════════════════════════════════════════════
const TTL = {
  HISTORY:       8,    // 8s — polling do frontend é 5s, scraper é 5s
  LATEST:        5,    // 5s — para /api/latest
  SUBSCRIPTION:  60,   // 60s — assinatura não muda a todo momento
  HEALTH:        30,   // 30s — dados de saúde
};

// ═══════════════════════════════════════════════════════════════
// 📖 HISTORY CACHE (getFullHistory / getHistorySince)
// ═══════════════════════════════════════════════════════════════

/**
 * Busca full history do Redis.
 * @returns {Array|null} — null = cache miss
 */
export async function getCachedFullHistory(sourceName) {
  if (!isRedisReady()) return null;

  try {
    const data = await redis.get(KEYS.fullHistory(sourceName));
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.warn(`⚠️ [REDIS] Erro leitura history ${sourceName}:`, err.message);
    return null;
  }
}

/**
 * Salva full history no Redis (write-through).
 */
export async function setCachedFullHistory(sourceName, rows) {
  if (!isRedisReady()) return;

  try {
    const pipeline = redis.pipeline();
    pipeline.set(KEYS.fullHistory(sourceName), JSON.stringify(rows), 'EX', TTL.HISTORY);
    
    // Salva o timestamp mais recente separadamente (para incremental check)
    if (rows.length > 0 && rows[0].timestamp) {
      pipeline.set(KEYS.latestTs(sourceName), rows[0].timestamp, 'EX', TTL.HISTORY);
    }

    await pipeline.exec();
  } catch (err) {
    console.warn(`⚠️ [REDIS] Erro escrita history ${sourceName}:`, err.message);
  }
}

/**
 * Busca /api/latest do cache
 */
export async function getCachedLatest(sourceName, limit) {
  if (!isRedisReady()) return null;

  try {
    const data = await redis.get(KEYS.latest(sourceName, limit));
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Salva /api/latest no cache
 */
export async function setCachedLatest(sourceName, limit, rows) {
  if (!isRedisReady()) return;

  try {
    await redis.set(KEYS.latest(sourceName, limit), JSON.stringify(rows), 'EX', TTL.LATEST);
  } catch {
    // silencioso — fallback para PG
  }
}

/**
 * Invalida TODO cache de uma fonte (chamado quando saveNewSignals detecta novos dados).
 * Usa UNLINK (async delete) para não bloquear.
 */
export async function invalidateSourceCache(sourceName) {
  if (!isRedisReady()) return;

  try {
    // Usa scan para encontrar todas as keys da fonte e deleta em batch
    const keysToDelete = [
      KEYS.fullHistory(sourceName),
      KEYS.latestTs(sourceName),
    ];
    
    // Também deleta as keys de /api/latest para essa fonte (qualquer limit)
    const stream = redis.scanStream({ match: `hist:latest:${sourceName}:*`, count: 50 });
    
    for await (const keys of stream) {
      keysToDelete.push(...keys);
    }

    if (keysToDelete.length > 0) {
      await redis.unlink(...keysToDelete); // UNLINK = DEL async (não bloqueia)
    }
  } catch (err) {
    console.warn(`⚠️ [REDIS] Erro invalidação ${sourceName}:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔐 SUBSCRIPTION CACHE (requireActiveSubscription)
// ═══════════════════════════════════════════════════════════════

/**
 * Busca status de assinatura do cache.
 * @returns {{ hasAccess, subscription }|null} — null = cache miss
 */
export async function getCachedSubscription(email) {
  if (!isRedisReady()) return null;

  try {
    const data = await redis.get(KEYS.subscription(email));
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Cache de resultado da verificação de assinatura.
 */
export async function setCachedSubscription(email, subscriptionData) {
  if (!isRedisReady()) return;

  try {
    await redis.set(
      KEYS.subscription(email),
      JSON.stringify(subscriptionData),
      'EX',
      TTL.SUBSCRIPTION
    );
  } catch {
    // silencioso
  }
}

/**
 * Invalida cache de subscription (chamado pelo webhook Hubla).
 */
export async function invalidateSubscriptionCache(email) {
  if (!isRedisReady()) return;

  try {
    await redis.unlink(KEYS.subscription(email.toLowerCase().trim()));
  } catch {
    // silencioso
  }
}

// ═══════════════════════════════════════════════════════════════
// 📊 SOURCE HEALTH CACHE (para cross-process/dashboard)
// ═══════════════════════════════════════════════════════════════

export async function setCachedSourceHealth(healthMap) {
  if (!isRedisReady()) return;

  try {
    const obj = {};
    for (const [name, h] of healthMap) {
      obj[name] = h;
    }
    await redis.set(KEYS.sourceHealth(), JSON.stringify(obj), 'EX', TTL.HEALTH);
  } catch {
    // silencioso
  }
}

export async function getCachedSourceHealth() {
  if (!isRedisReady()) return null;

  try {
    const data = await redis.get(KEYS.sourceHealth());
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🛠️ UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════

/**
 * Métricas do cache — para o /health endpoint
 */
export async function getCacheStats() {
  if (!isRedisReady()) return { status: 'disconnected' };

  try {
    const info = await redis.info('stats');
    const keyspace = await redis.info('keyspace');
    const dbSize = await redis.dbsize();
    
    // Parse hit/miss do INFO stats
    const hitsMatch = info.match(/keyspace_hits:(\d+)/);
    const missMatch = info.match(/keyspace_misses:(\d+)/);
    const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
    const misses = missMatch ? parseInt(missMatch[1]) : 0;
    const hitRate = (hits + misses) > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : '0.0';

    return {
      status: 'connected',
      keys: dbSize,
      hitRate: `${hitRate}%`,
      hits,
      misses,
    };
  } catch {
    return { status: 'error' };
  }
}
