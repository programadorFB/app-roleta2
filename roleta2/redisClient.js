// redisClient.js — ⚡ Conexão Redis com ioredis (auto-reconnect + fallback graceful)
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  // ⚡ Performance: manter conexão viva
  keepAlive: 10000,
  connectTimeout: 3000,
  
  // ⚡ Auto-reconnect com backoff
  retryStrategy(times) {
    if (times > 20) {
      console.error('❌ [REDIS] Desistindo após 20 tentativas');
      return null; // Para de tentar
    }
    const delay = Math.min(times * 200, 5000);
    console.warn(`🔄 [REDIS] Reconectando em ${delay}ms (tentativa ${times})`);
    return delay;
  },

  // Pipeline automático para batch operations
  enableAutoPipelining: true,

  // Comandos em fila enquanto reconecta (não perde dados)
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
});

// ── Estado de conexão (para fallback graceful) ──
let isConnected = false;

redis.on('connect', () => {
  isConnected = true;
  console.log('✅ [REDIS] Conectado');
});

redis.on('ready', () => {
  isConnected = true;
  console.log('✅ [REDIS] Pronto para comandos');
});

redis.on('error', (err) => {
  // Só loga erros únicos (evita flood)
  if (isConnected) {
    console.error('❌ [REDIS] Erro:', err.message);
  }
  isConnected = false;
});

redis.on('close', () => {
  isConnected = false;
});

/**
 * Verifica se Redis está disponível.
 * Usado pelo dbService para decidir: Redis ou PostgreSQL direto.
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

export default redis;
