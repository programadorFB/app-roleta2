import { createClient } from 'redis';

export const TTL = {
  SUBSCRIPTION: 60,
  FULL_HISTORY: 10,
  LATEST_SPINS: 15,
  ADMIN_STATS:  60,
  ACTIVE_SUBS:  60,
};

export const KEY = {
  sub:        (email)         => `sub:${email}`,
  history:    (source)        => `hist:${source}`,
  latest:     (source, limit) => `latest:${source}:${limit}`,
  adminStats: ()              => 'admin:stats',
  activeSubs: ()              => 'admin:active',
};

let client      = null;
let pubClient   = null;
let subClient   = null;
let isConnected = false;

function createRedisClient(url) {
  return createClient({
    url,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        if (retries > 20) return new Error('Redis: max retries atingido');
        return Math.min(retries * 200, 5000);
      },
    },
  });
}

export async function initRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  client = createRedisClient(url);

  client.on('connect',      () => { isConnected = true;  console.log('🔴 [REDIS] Conectado'); });
  client.on('error',   (err) => { if (isConnected) console.error('🔴 [REDIS] Erro:', err.message); isConnected = false; });
  client.on('reconnecting', () => console.log('🔴 [REDIS] Reconectando...'));

  try {
    await client.connect();

    // Pub/Sub clients para Socket.IO Redis adapter (cluster mode)
    pubClient = client.duplicate();
    subClient = client.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log('🔴 [REDIS] Pub/Sub clients prontos (cluster mode)');
  } catch (err) {
    console.warn('⚠️ [REDIS] Falha — app roda sem cache:', err.message);
  }
}

export function getPubSubClients() {
  return { pubClient, subClient };
}

export async function cacheGet(key) {
  if (!isConnected) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttl) {
  if (!isConnected) return;
  try { await client.set(key, JSON.stringify(value), { EX: ttl }); } catch { /* best-effort */ }
}

export async function cacheDel(key) {
  if (!isConnected) return;
  try { await client.del(key); } catch { /* best-effort */ }
}

export async function cacheDelPattern(pattern) {
  if (!isConnected) return;
  try {
    let cursor = 0;
    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) await client.del(result.keys);
    } while (cursor !== 0);
  } catch { /* best-effort */ }
}

const EMPTY_SENTINEL = '__EMPTY__';

export async function cacheAside(key, ttl, fetcher) {
  const cached = await cacheGet(key);
  if (cached === EMPTY_SENTINEL) return null;
  if (cached !== null) return cached;

  const fresh = await fetcher();
  if (fresh == null) {
    await cacheSet(key, EMPTY_SENTINEL, Math.min(ttl, 30));
  } else {
    await cacheSet(key, fresh, ttl);
  }
  return fresh;
}

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

export async function closeRedis() {
  const clients = [subClient, pubClient, client].filter(Boolean);
  await Promise.allSettled(clients.map(c => c.quit().catch(() => {})));
}
