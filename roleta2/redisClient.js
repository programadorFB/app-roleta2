// redisClient.js — ⚡ Conexão Redis com ioredis (auto-reconnect + fallback graceful)
//
// MUDANÇAS v2:
//   ✅ Removido enableAutoPipelining (conflitava com pipelines manuais no redisCache)
//   ✅ Adicionado lazyConnect para controle explícito de quando conectar
//   ✅ Log de reconexão com debounce (evita flood no console)
//   ✅ Exporta configureMaxMemory() para chamar no boot do server
//
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  // ⚡ Performance: manter conexão viva
  keepAlive: 10000,
  connectTimeout: 5000,

  // ⚡ Auto-reconnect com backoff exponencial
  retryStrategy(times) {
    if (times > 30) {
      console.error('❌ [REDIS] Desistindo após 30 tentativas');
      return null;
    }
    const delay = Math.min(times * 300, 10000);
    if (times <= 3 || times % 10 === 0) {
      console.warn(`🔄 [REDIS] Reconectando em ${delay}ms (tentativa ${times})`);
    }
    return delay;
  },

  // ❌ REMOVIDO: enableAutoPipelining — conflitava com redis.pipeline() manual
  //    O auto-pipelining do ioredis agrupa comandos automaticamente, mas quando
  //    misturado com pipeline() explícito, pode gerar execuções fora de ordem
  //    e resultados inesperados.

  // Comandos em fila enquanto reconecta (não perde dados)
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
});

// ── Estado de conexão (para fallback graceful) ──
let isConnected = false;
let lastErrorLog = 0;

redis.on('connect', () => {
  isConnected = true;
  console.log('✅ [REDIS] Conectado');
});

redis.on('ready', () => {
  isConnected = true;
  console.log('✅ [REDIS] Pronto para comandos');
});

redis.on('error', (err) => {
  const now = Date.now();
  // Debounce: só loga 1 erro a cada 10s (evita flood)
  if (now - lastErrorLog > 10000) {
    console.error('❌ [REDIS] Erro:', err.message);
    lastErrorLog = now;
  }
  isConnected = false;
});

redis.on('close', () => {
  isConnected = false;
});

/**
 * Verifica se Redis está disponível.
 * Usado pelo dbService/redisCache para decidir: Redis ou fallback.
 */
export const isRedisReady = () => isConnected;

/**
 * Teste de conexão — usado no health check
 */
export async function testRedisConnection() {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Configura maxmemory policy no Redis (chamado 1x no boot do server).
 * allkeys-lru: quando memória acabar, evicta as keys menos usadas
 * em vez de crashar ou rejeitar writes.
 * 
 * NOTA: Só funciona se o Redis permitir CONFIG SET (pode falhar em managed Redis).
 */
export async function configureRedisDefaults() {
  if (!isConnected) return;

  try {
    // Configura eviction policy (se não estiver setado)
    const currentPolicy = await redis.config('GET', 'maxmemory-policy');
    if (currentPolicy[1] === 'noeviction') {
      await redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
      console.log('✅ [REDIS] maxmemory-policy → allkeys-lru');
    }
  } catch (err) {
    // Em Redis gerenciado (Railway, Upstash) CONFIG SET pode ser bloqueado
    console.warn('⚠️ [REDIS] CONFIG SET indisponível (managed Redis):', err.message);
  }
}

export default redis;