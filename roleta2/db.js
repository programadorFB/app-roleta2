// db.js — ⚡ OTIMIZADO: Pool tuning + logging reduzido
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ⚡ Pool otimizado para alta frequência de polling
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'fuzabalta_roulette',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  
  // ⚡ Conexões: reduzido de 20 para 10 (menos overhead de idle connections)
  max: 10,
  
  idleTimeoutMillis: 60000, // 60s (era 30s)
  
  connectionTimeoutMillis: 3000,
  
  statement_timeout: 10000, // 10s max por query
});

export { pool };

pool.on('connect', () => {
  // Log reduzido: apenas uma vez
});

pool.on('error', (err) => {
  console.error('❌ [DATABASE] Erro inesperado:', err);
});

// ⚡ Query com logging condicional (só loga queries lentas > 200ms)
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Só loga queries lentas (reduz I/O de console em produção)
    if (duration > 200) {
      console.log(`🐢 [DB LENTA] ${duration}ms - ${text.substring(0, 80)}...`);
    }
    
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ [DATABASE] Erro (${duration}ms):`, error.message, '| Query:', text.substring(0, 100));
    throw error;
  }
}

// Transações (mantido)
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

// Teste de conexão
export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now');
    console.log('✅ [DATABASE] Conexão OK:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ [DATABASE] Falha:', error.message);
    return false;
  }
}

export default pool;