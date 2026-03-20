import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const { Pool } = pg;
const IS_PROD = process.env.NODE_ENV === 'production';
const SLOW_QUERY_MS = 200;

const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'fuzabalta_roulette',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max:      parseInt(process.env.DB_POOL_MAX || '50'),
  idleTimeoutMillis:      20000,
  connectionTimeoutMillis: 5000,
  statement_timeout:       30000,
});

pool.on('connect', () => console.log('✅ [DB] Conectado ao PostgreSQL'));
pool.on('error',   (err) => console.error('❌ [DB] Erro inesperado:', err.message));

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const ms  = Date.now() - start;
    if (!IS_PROD || ms > SLOW_QUERY_MS) {
      console.log(`${ms > SLOW_QUERY_MS ? '🐢' : '🔍'} [DB] ${ms}ms — ${text.substring(0, 80)}`);
    }
    return res;
  } catch (err) {
    console.error('❌ [DB] Query error:', err);
    throw err;
  }
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection() {
  try {
    const { rows } = await query('SELECT NOW() as now');
    console.log('✅ [DB] Conexão OK:', rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ [DB] Falha na conexão:', err.message);
    return false;
  }
}

export function poolStats() {
  return {
    total:   pool.totalCount,
    idle:    pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export default pool;
