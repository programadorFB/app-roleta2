// db.js
// Configuração e pool de conexão PostgreSQL

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configuração do pool de conexões
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'phantom-roleta',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Seguro p/ hosting (Render/Railway ~20-50)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Testa a conexão ao iniciar
pool.on('connect', () => {
  console.log('✅ [DATABASE] Conectado ao PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ [DATABASE] Erro inesperado:', err.message);
});

const IS_PROD = process.env.NODE_ENV === 'production';
const SLOW_QUERY_MS = 200;

// Função auxiliar para queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Em prod loga apenas slow queries; em dev loga tudo
    if (!IS_PROD || duration > SLOW_QUERY_MS) {
      const emoji = duration > SLOW_QUERY_MS ? '🐢' : '🔍';
      console.log(`${emoji} [DATABASE] Query ${duration}ms`, { text: text.substring(0, 100) });
    }
    return res;
  } catch (error) {
    console.error('❌ [DATABASE] Erro na query:', error);
    throw error;
  }
}

// Função para transações
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Testa a conexão
export async function testConnection() {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('✅ [DATABASE] Conexão testada com sucesso:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ [DATABASE] Falha ao testar conexão:', error.message);
    return false;
  }
}

/**
 * Estatísticas do pool de conexões (usado pelo /health)
 */
export function poolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

// Exporta o pool para uso direto se necessário
export default pool;