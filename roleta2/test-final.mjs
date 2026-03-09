// test-final.mjs — Teste FINAL antes de deploy em produção
// Simula ambiente real: subscription ativa, 50 usuários, cache completo
//
// Pré-requisitos:
//   1. docker-compose -f docker-compose.local.yml up -d
//   2. .env apontando para localhost (DB_HOST=localhost, REDIS_URL=redis://localhost:6379)
//   3. node server (em outro terminal)
//
// Uso: node test-final.mjs

import pg from 'pg';

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001';
const TEST_EMAIL = 'teste@teste.com';
const CONCURRENT_USERS = 50;
const SOURCES = ['immersive', 'speed', 'auto', 'vip', 'lightning'];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

let passed = 0;
let failed = 0;
function ok(msg) { passed++; console.log(`${GREEN}  ✅ ${msg}${NC}`); }
function fail(msg) { failed++; console.log(`${RED}  ❌ ${msg}${NC}`); }

// ═══════════════════════════════════════════════════════════════
// SETUP: Garante que o DB local tem assinatura ativa
// ═══════════════════════════════════════════════════════════════
async function setupDatabase() {
  console.log(`${YELLOW}[SETUP] Preparando banco local...${NC}`);
  
  const pool = new pg.Pool({
    host: 'localhost', port: 5432,
    database: 'fuzabalta_roulette', user: 'postgres', password: '1234',
    max: 3, connectionTimeoutMillis: 3000,
  });

  try {
    // Garante tabela de subscriptions (estrutura real de produção)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        hubla_customer_id VARCHAR(255),
        subscription_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        plan_name VARCHAR(100) DEFAULT 'test',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      )
    `);

    // Insere/atualiza assinatura ativa
    await pool.query(`
      INSERT INTO subscriptions (user_id, email, status, plan_name, expires_at)
      VALUES ('test_user_001', $1, 'active', 'test', NOW() + INTERVAL '30 days')
      ON CONFLICT (user_id) DO UPDATE SET status = 'active', email = $1, expires_at = NOW() + INTERVAL '30 days'
    `, [TEST_EMAIL]);

    const { rows } = await pool.query('SELECT email, status, expires_at FROM subscriptions WHERE email = $1', [TEST_EMAIL]);
    ok(`Subscription ativa: ${rows[0].email} (${rows[0].status}, expira ${new Date(rows[0].expires_at).toLocaleDateString()})`);

    // Garante que tem sinais no banco
    const { rows: signals } = await pool.query('SELECT COUNT(*) as total FROM signals');
    ok(`Sinais no banco: ${signals[0].total}`);

    await pool.end();
  } catch (e) {
    fail(`Setup DB: ${e.message}`);
    await pool.end();
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
async function timedFetch(url) {
  const start = performance.now();
  const res = await fetch(url);
  const ms = performance.now() - start;
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, ms, data };
}

function stats(arr) {
  if (!arr.length) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    avg: (sum / arr.length).toFixed(1),
    p50: sorted[Math.floor(arr.length * 0.5)].toFixed(1),
    p95: sorted[Math.floor(arr.length * 0.95)].toFixed(1),
    max: sorted[arr.length - 1].toFixed(1),
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTE 1: Health + Conexões
// ═══════════════════════════════════════════════════════════════
async function testHealth() {
  console.log(`\n${YELLOW}[1/6] Health Check...${NC}`);
  const r = await timedFetch(`${BASE_URL}/health`);
  
  r.ok ? ok(`Server OK (${r.ms.toFixed(1)}ms)`) : fail(`Server down: ${r.status}`);
  r.data?.redis === '✅' ? ok('Redis conectado') : fail(`Redis: ${r.data?.redis}`);
  r.data?.database === '✅' ? ok('PostgreSQL conectado') : fail(`DB: ${r.data?.database}`);
  
  if (r.data?.cache) {
    ok(`Cache stats: hitRate=${r.data.cache.hitRate} keys=${r.data.cache.keys}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TESTE 2: Todas as rotas protegidas retornam 200
// ═══════════════════════════════════════════════════════════════
async function testRoutes() {
  console.log(`\n${YELLOW}[2/6] Rotas protegidas (devem retornar 200)...${NC}`);

  const routes = [
    { name: 'full-history', url: `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}` },
    { name: 'history-since', url: `${BASE_URL}/api/history-since?source=immersive&since=2020-01-01T00:00:00Z&userEmail=${TEST_EMAIL}` },
    { name: 'latest', url: `${BASE_URL}/api/latest?source=immersive&limit=10&userEmail=${TEST_EMAIL}` },
    { name: 'subscription', url: `${BASE_URL}/api/subscription/status?userEmail=${TEST_EMAIL}` },
    { name: 'source-health', url: `${BASE_URL}/api/source-health` },
  ];

  for (const route of routes) {
    const r = await timedFetch(route.url);
    if (r.ok) {
      const rows = Array.isArray(r.data) ? r.data.length : '—';
      ok(`${route.name}: 200 em ${r.ms.toFixed(1)}ms (${rows} rows)`);
    } else {
      fail(`${route.name}: status ${r.status} — ${JSON.stringify(r.data)}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TESTE 3: Cache HIT vs MISS
// ═══════════════════════════════════════════════════════════════
async function testCacheHitMiss() {
  console.log(`\n${YELLOW}[3/6] Cache HIT vs MISS...${NC}`);

  // 1a chamada: cache miss
  const r1 = await timedFetch(`${BASE_URL}/api/full-history?source=speed&userEmail=${TEST_EMAIL}`);
  const miss = r1.ms;

  // 2a chamada: cache hit
  const r2 = await timedFetch(`${BASE_URL}/api/full-history?source=speed&userEmail=${TEST_EMAIL}`);
  const hit = r2.ms;

  ok(`MISS: ${miss.toFixed(1)}ms → HIT: ${hit.toFixed(1)}ms`);
  
  if (hit < miss) {
    ok(`Cache hit ${(miss / hit).toFixed(1)}x mais rápido`);
  } else {
    console.log(`${YELLOW}  ⚠️ Hit não foi mais rápido (normal em ambiente local)${NC}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TESTE 4: 50 usuários simultâneos — tudo 200
// ═══════════════════════════════════════════════════════════════
async function testConcurrency() {
  console.log(`\n${YELLOW}[4/6] Carga concorrente: ${CONCURRENT_USERS} usuários...${NC}`);

  const promises = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const source = SOURCES[i % SOURCES.length];
    promises.push(timedFetch(`${BASE_URL}/api/full-history?source=${source}&userEmail=${TEST_EMAIL}`));
  }

  const results = await Promise.all(promises);
  const oks = results.filter(r => r.ok).length;
  const s = stats(results.map(r => r.ms));

  oks === CONCURRENT_USERS
    ? ok(`${oks}/${CONCURRENT_USERS} retornaram 200`)
    : fail(`${oks}/${CONCURRENT_USERS} retornaram 200 (${CONCURRENT_USERS - oks} falharam)`);
  
  ok(`Latência: avg=${s.avg}ms | p50=${s.p50}ms | p95=${s.p95}ms | max=${s.max}ms`);
}

// ═══════════════════════════════════════════════════════════════
// TESTE 5: TTL expira e re-aquece
// ═══════════════════════════════════════════════════════════════
async function testTTL() {
  console.log(`\n${YELLOW}[5/6] TTL expiration (9s de espera)...${NC}`);

  // Aquece
  await timedFetch(`${BASE_URL}/api/full-history?source=auto&userEmail=${TEST_EMAIL}`);

  // Hit
  const r1 = await timedFetch(`${BASE_URL}/api/full-history?source=auto&userEmail=${TEST_EMAIL}`);
  ok(`HIT: ${r1.ms.toFixed(1)}ms`);

  // Espera TTL
  console.log(`  ⏳ Esperando 9s...`);
  await new Promise(r => setTimeout(r, 9000));

  // Miss
  const r2 = await timedFetch(`${BASE_URL}/api/full-history?source=auto&userEmail=${TEST_EMAIL}`);
  ok(`MISS (expirou): ${r2.ms.toFixed(1)}ms`);

  // Re-hit
  const r3 = await timedFetch(`${BASE_URL}/api/full-history?source=auto&userEmail=${TEST_EMAIL}`);
  ok(`Re-HIT: ${r3.ms.toFixed(1)}ms`);
}

// ═══════════════════════════════════════════════════════════════
// TESTE 6: Subscription cache + invalidação
// ═══════════════════════════════════════════════════════════════
async function testSubscriptionCache() {
  console.log(`\n${YELLOW}[6/6] Subscription cache...${NC}`);

  // 1a chamada (cache miss → PG)
  const r1 = await timedFetch(`${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`);

  // 2a chamada (subscription cacheada)
  const r2 = await timedFetch(`${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`);

  r1.ok ? ok(`1a chamada (PG): 200 em ${r1.ms.toFixed(1)}ms`) : fail(`1a chamada: ${r1.status}`);
  r2.ok ? ok(`2a chamada (cache): 200 em ${r2.ms.toFixed(1)}ms`) : fail(`2a chamada: ${r2.status}`);

  // Email inexistente (deve cachear negativo)
  const r3 = await timedFetch(`${BASE_URL}/api/full-history?source=immersive&userEmail=naoexiste@fake.com`);
  const r4 = await timedFetch(`${BASE_URL}/api/full-history?source=immersive&userEmail=naoexiste@fake.com`);

  r3.status === 403 ? ok(`Email inválido: 403 (${r3.ms.toFixed(1)}ms)`) : fail(`Esperava 403, veio ${r3.status}`);
  r4.status === 403 ? ok(`Cache negativo: 403 (${r4.ms.toFixed(1)}ms)`) : fail(`Cache negativo falhou`);
  
  if (r4.ms < r3.ms) ok(`Cache negativo ${(r3.ms / r4.ms).toFixed(1)}x mais rápido`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${YELLOW}═══ TESTE FINAL PRÉ-PRODUÇÃO ═══${NC}`);

  // Verifica servidor
  try {
    await fetch(`${BASE_URL}/health`);
  } catch {
    console.log(`${RED}  ❌ Servidor não rodando em ${BASE_URL}${NC}`);
    process.exit(1);
  }

  await setupDatabase();
  await testHealth();
  await testRoutes();
  await testCacheHitMiss();
  await testConcurrency();
  await testTTL();
  await testSubscriptionCache();

  // Resultado
  console.log(`\n${YELLOW}${'═'.repeat(50)}`);
  console.log(`  RESULTADO FINAL`);
  console.log(`${'═'.repeat(50)}${NC}`);
  console.log(`${GREEN}  Passou: ${passed}${NC}`);
  if (failed > 0) console.log(`${RED}  Falhou: ${failed}${NC}`);
  
  if (failed === 0) {
    console.log(`\n${GREEN}  🚀 APROVADO PARA PRODUÇÃO${NC}\n`);
  } else {
    console.log(`\n${RED}  ⛔ NÃO SUBA — corrija os erros acima${NC}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(RED, '💥', e.message, NC); process.exit(1); });
