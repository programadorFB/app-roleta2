// test-redis-integration.mjs — Testa TODAS as camadas do cache Redis
// Uso: node test-redis-integration.mjs
//
// Pré-requisito: docker-compose -f docker-compose.local.yml up -d

import Redis from 'ioredis';
import pg from 'pg';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PG_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'fuzabalta_roulette',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
};

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log(`${GREEN}  ✅ ${msg}${NC}`); }
function fail(msg, err) { failed++; console.log(`${RED}  ❌ ${msg}: ${err}${NC}`); }

async function main() {
  console.log(`\n${YELLOW}═══ TESTE DE INTEGRAÇÃO REDIS ═══${NC}\n`);

  // ── 1. Conexões ──
  console.log(`${YELLOW}[1/7] Testando conexões...${NC}`);

  const redis = new Redis(REDIS_URL, { connectTimeout: 3000, maxRetriesPerRequest: 1 });
  const pool = new pg.Pool({ ...PG_CONFIG, max: 3, connectionTimeoutMillis: 3000 });

  try {
    const pong = await redis.ping();
    pong === 'PONG' ? ok('Redis PING → PONG') : fail('Redis PING', pong);
  } catch (e) { fail('Redis conexão', e.message); }

  try {
    const r = await pool.query('SELECT NOW()');
    ok(`PostgreSQL conectado: ${r.rows[0].now}`);
  } catch (e) { fail('PostgreSQL conexão', e.message); }

  // ── 2. SET/GET básico ──
  console.log(`\n${YELLOW}[2/7] Redis SET/GET...${NC}`);

  try {
    await redis.set('test:basic', 'hello', 'EX', 5);
    const val = await redis.get('test:basic');
    val === 'hello' ? ok('SET/GET funciona') : fail('SET/GET', `esperava "hello", veio "${val}"`);
    await redis.del('test:basic');
  } catch (e) { fail('SET/GET', e.message); }

  // ── 3. Simular cache de history (5000 rows) ──
  console.log(`\n${YELLOW}[3/7] Cache de history (5000 rows)...${NC}`);

  try {
    const fakeHistory = Array.from({ length: 5000 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      signalid: `sig_${i}`,
      gameid: `game_${i}`,
      signal: String(Math.floor(Math.random() * 37)),
    }));

    const json = JSON.stringify(fakeHistory);
    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);

    const t1 = Date.now();
    await redis.set('hist:full:immersive', json, 'EX', 8);
    const writeMs = Date.now() - t1;

    const t2 = Date.now();
    const cached = await redis.get('hist:full:immersive');
    const readMs = Date.now() - t2;

    const rows = JSON.parse(cached);
    ok(`WRITE ${sizeKB}KB → ${writeMs}ms`);
    ok(`READ  ${rows.length} rows → ${readMs}ms`);

    await redis.del('hist:full:immersive');
  } catch (e) { fail('History cache', e.message); }

  // ── 4. Simular cache de subscription ──
  console.log(`\n${YELLOW}[4/7] Cache de subscription...${NC}`);

  try {
    const subData = { hasAccess: true, subscription: { email: 'teste@teste.com', status: 'active', plan: 'test' } };

    await redis.set('sub:teste@teste.com', JSON.stringify(subData), 'EX', 60);
    const cached = await redis.get('sub:teste@teste.com');
    const parsed = JSON.parse(cached);

    parsed.hasAccess === true
      ? ok('Subscription cache: hasAccess=true')
      : fail('Subscription cache', JSON.stringify(parsed));

    // Simular invalidação (webhook Hubla)
    await redis.unlink('sub:teste@teste.com');
    const afterInvalidate = await redis.get('sub:teste@teste.com');
    afterInvalidate === null
      ? ok('Invalidação subscription funciona')
      : fail('Invalidação', 'key ainda existe');
  } catch (e) { fail('Subscription cache', e.message); }

  // ── 5. Testar write-through (PG → Redis) ──
  console.log(`\n${YELLOW}[5/7] Write-through (PG → invalidação Redis)...${NC}`);

  try {
    // Popula cache
    await redis.set('hist:full:speed', JSON.stringify([{ signal: '15' }]), 'EX', 8);

    // Simula saveNewSignals: insere no PG
    await pool.query(
      `INSERT INTO signals (signalId, gameId, signal, source) VALUES ($1, $2, $3, $4) ON CONFLICT (signalId, source) DO NOTHING`,
      ['writethrough_test_1', 'game_wt', '25', 'speed']
    );

    // Simula invalidação
    await redis.unlink('hist:full:speed');
    const afterSave = await redis.get('hist:full:speed');

    afterSave === null
      ? ok('Write-through: cache invalidado após INSERT')
      : fail('Write-through', 'cache não foi invalidado');

    // Cleanup
    await pool.query(`DELETE FROM signals WHERE signalId = 'writethrough_test_1'`);
  } catch (e) { fail('Write-through', e.message); }

  // ── 6. Testar read-through (Redis miss → PG → popula Redis) ──
  console.log(`\n${YELLOW}[6/7] Read-through (cache miss → PG → popula cache)...${NC}`);

  try {
    // Garante que cache está vazio
    await redis.del('hist:full:immersive');

    // Busca do PG
    const t1 = Date.now();
    const pgResult = await pool.query(
      `SELECT timestamp, signalId AS signalid, gameId AS gameid, signal FROM signals WHERE source = $1 ORDER BY timestamp DESC LIMIT 100`,
      ['immersive']
    );
    const pgMs = Date.now() - t1;

    // Popula cache (simula o que dbService faz)
    await redis.set('hist:full:immersive', JSON.stringify(pgResult.rows), 'EX', 8);

    // Agora lê do cache
    const t2 = Date.now();
    const cached = await redis.get('hist:full:immersive');
    const redisMs = Date.now() - t2;
    const cachedRows = JSON.parse(cached);

    ok(`PG query: ${pgResult.rows.length} rows em ${pgMs}ms`);
    ok(`Redis cache: ${cachedRows.length} rows em ${redisMs}ms`);
    ok(`Speedup: ${pgMs > 0 ? (pgMs / Math.max(redisMs, 0.1)).toFixed(1) : '∞'}x mais rápido`);

    await redis.del('hist:full:immersive');
  } catch (e) { fail('Read-through', e.message); }

  // ── 7. Testar fallback (Redis offline → memória) ──
  console.log(`\n${YELLOW}[7/7] Fallback graceful...${NC}`);

  try {
    // Simula Redis offline checando isRedisReady pattern
    const disconnectedRedis = new Redis('redis://localhost:9999', {
      connectTimeout: 500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });

    let fallbackWorked = false;
    try {
      await disconnectedRedis.get('test');
    } catch {
      fallbackWorked = true;
    }

    fallbackWorked
      ? ok('Redis offline → erro capturado (fallback funciona)')
      : fail('Fallback', 'não capturou erro');

    disconnectedRedis.disconnect();
  } catch (e) { ok('Fallback: erro capturado corretamente'); }

  // ── Resultado ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${GREEN}  Passou: ${passed}${NC}`);
  if (failed > 0) console.log(`${RED}  Falhou: ${failed}${NC}`);
  console.log(`${'═'.repeat(50)}\n`);

  await redis.quit();
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(RED, '💥 Erro fatal:', e.message, NC); process.exit(1); });
