// db.js
// Configuração e pool de conexão PostgreSQL

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
export { pool};
const { Pool } = pg;

// Configuração do pool de conexões
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'phantom-roleta',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  max: 20, // Máximo de conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Testa a conexão ao iniciar
pool.on('connect', () => {
  console.log('✅ [DATABASE] Conectado ao PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ [DATABASE] Erro inesperado:', err);
});

// Função auxiliar para queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`🔍 [DATABASE] Query executada em ${duration}ms`, { text: text.substring(0, 100) });
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

// Exporta o pool para uso direto se necessário
export default pool;
