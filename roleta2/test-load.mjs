// test-load.mjs — Teste de carga: 50 usuários, TTL, HTTP completo
// Uso: 
//   1. Certifique-se que docker-compose.local.yml está rodando
//   2. Copie .env.local → .env
//   3. npm run server (em outro terminal)
//   4. node test-load.mjs

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:3005';
const TEST_EMAIL = 'teste@teste.com';
const CONCURRENT_USERS = 50;
const POLLING_CYCLES = 6;        // 6 ciclos de 5s = 30s de simulação
const POLLING_INTERVAL_MS = 5000;
const SOURCES = ['immersive', 'speed'];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

// ═══════════════════════════════════════════════════════════════
// Métricas
// ═══════════════════════════════════════════════════════════════
const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  latencies: [],             // todas as latências individuais
  latenciesByRoute: {},      // agrupadas por rota
  latenciesByCycle: [],      // por ciclo de polling
  healthSnapshots: [],       // snapshots do /health
};

function recordLatency(route, ms) {
  metrics.totalRequests++;
  metrics.latencies.push(ms);
  if (!metrics.latenciesByRoute[route]) metrics.latenciesByRoute[route] = [];
  metrics.latenciesByRoute[route].push(ms);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(arr) {
  if (arr.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    avg: (sum / arr.length).toFixed(1),
    p50: percentile(arr, 50).toFixed(1),
    p95: percentile(arr, 95).toFixed(1),
    p99: percentile(arr, 99).toFixed(1),
    min: Math.min(...arr).toFixed(1),
    max: Math.max(...arr).toFixed(1),
  };
}

// ═══════════════════════════════════════════════════════════════
// HTTP helpers
// ═══════════════════════════════════════════════════════════════
async function timedFetch(url, label) {
  const start = performance.now();
  try {
    const res = await fetch(url);
    const ms = performance.now() - start;
    const data = await res.json();
    recordLatency(label, ms);
    return { ok: res.ok, status: res.status, ms, data };
  } catch (err) {
    const ms = performance.now() - start;
    metrics.totalErrors++;
    recordLatency(label, ms);
    return { ok: false, status: 0, ms, error: err.message };
  }
}

async function getHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return await res.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Teste 1: Fluxo HTTP completo (middleware → rota → resposta)
// ═══════════════════════════════════════════════════════════════
async function testHttpFlow() {
  console.log(`\n${YELLOW}[1/4] Fluxo HTTP completo...${NC}`);

  // full-history (cache miss no 1o, hit no 2o)
  const r1 = await timedFetch(
    `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`,
    'full-history'
  );
  console.log(`  ${r1.ok ? GREEN + '✅' : RED + '❌'} full-history: ${r1.ms.toFixed(1)}ms (status ${r1.status})${NC}`);

  const r2 = await timedFetch(
    `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`,
    'full-history'
  );
  console.log(`  ${r2.ok ? GREEN + '✅' : RED + '❌'} full-history (2a vez, cache hit): ${r2.ms.toFixed(1)}ms${NC}`);

  // history-since
  const r3 = await timedFetch(
    `${BASE_URL}/api/history-since?source=immersive&since=2020-01-01T00:00:00Z&userEmail=${TEST_EMAIL}`,
    'history-since'
  );
  console.log(`  ${r3.ok ? GREEN + '✅' : RED + '❌'} history-since: ${r3.ms.toFixed(1)}ms${NC}`);

  // latest
  const r4 = await timedFetch(
    `${BASE_URL}/api/latest?source=immersive&limit=100&userEmail=${TEST_EMAIL}`,
    'latest'
  );
  console.log(`  ${r4.ok ? GREEN + '✅' : RED + '❌'} latest: ${r4.ms.toFixed(1)}ms${NC}`);

  // subscription/status
  const r5 = await timedFetch(
    `${BASE_URL}/api/subscription/status?userEmail=${TEST_EMAIL}`,
    'subscription'
  );
  console.log(`  ${r5.ok ? GREEN + '✅' : RED + '❌'} subscription/status: ${r5.ms.toFixed(1)}ms${NC}`);

  // health
  const r6 = await timedFetch(`${BASE_URL}/health`, 'health');
  console.log(`  ${r6.ok ? GREEN + '✅' : RED + '❌'} health: ${r6.ms.toFixed(1)}ms — Redis: ${r6.data?.redis || '?'}${NC}`);
}

// ═══════════════════════════════════════════════════════════════
// Teste 2: Carga concorrente de 50 usuários
// ═══════════════════════════════════════════════════════════════
async function testConcurrentLoad() {
  console.log(`\n${YELLOW}[2/4] Carga concorrente: ${CONCURRENT_USERS} usuários simultâneos...${NC}`);

  // Simula 50 usuários fazendo request ao mesmo tempo
  const promises = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const source = SOURCES[i % SOURCES.length];
    promises.push(
      timedFetch(
        `${BASE_URL}/api/full-history?source=${source}&userEmail=${TEST_EMAIL}`,
        'concurrent-full-history'
      )
    );
  }

  const results = await Promise.all(promises);
  const oks = results.filter(r => r.ok).length;
  const errs = results.filter(r => !r.ok).length;
  const times = results.map(r => r.ms);
  const s = stats(times);

  console.log(`  ${oks === CONCURRENT_USERS ? GREEN + '✅' : RED + '❌'} ${oks}/${CONCURRENT_USERS} sucesso, ${errs} erros${NC}`);
  console.log(`  ${CYAN}📊 Latência: avg=${s.avg}ms | p50=${s.p50}ms | p95=${s.p95}ms | p99=${s.p99}ms | max=${s.max}ms${NC}`);

  // Agora 50 requests de history-since (mais leve)
  const promises2 = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const source = SOURCES[i % SOURCES.length];
    promises2.push(
      timedFetch(
        `${BASE_URL}/api/history-since?source=${source}&since=2020-01-01T00:00:00Z&userEmail=${TEST_EMAIL}`,
        'concurrent-history-since'
      )
    );
  }

  const results2 = await Promise.all(promises2);
  const oks2 = results2.filter(r => r.ok).length;
  const s2 = stats(results2.map(r => r.ms));

  console.log(`  ${oks2 === CONCURRENT_USERS ? GREEN + '✅' : RED + '❌'} history-since: ${oks2}/${CONCURRENT_USERS} sucesso${NC}`);
  console.log(`  ${CYAN}📊 Latência: avg=${s2.avg}ms | p50=${s2.p50}ms | p95=${s2.p95}ms | p99=${s2.p99}ms${NC}`);
}

// ═══════════════════════════════════════════════════════════════
// Teste 3: Polling contínuo com TTL expirando
// ═══════════════════════════════════════════════════════════════
async function testPollingWithTTL() {
  console.log(`\n${YELLOW}[3/4] Polling contínuo: ${POLLING_CYCLES} ciclos × ${CONCURRENT_USERS} usuários (simula ${POLLING_CYCLES * 5}s de uso real)...${NC}`);

  for (let cycle = 0; cycle < POLLING_CYCLES; cycle++) {
    const cycleStart = performance.now();
    const cycleTimes = [];

    // Simula N usuários fazendo polling simultaneamente
    const promises = [];
    for (let u = 0; u < CONCURRENT_USERS; u++) {
      const source = SOURCES[u % SOURCES.length];
      // Alterna entre full-history (1o ciclo) e history-since (subsequentes)
      const route = cycle === 0
        ? `${BASE_URL}/api/full-history?source=${source}&userEmail=${TEST_EMAIL}`
        : `${BASE_URL}/api/history-since?source=${source}&since=2020-01-01T00:00:00Z&userEmail=${TEST_EMAIL}`;
      const label = cycle === 0 ? 'poll-full' : 'poll-incremental';

      promises.push(timedFetch(route, label));
    }

    const results = await Promise.all(promises);
    const oks = results.filter(r => r.ok).length;
    results.forEach(r => cycleTimes.push(r.ms));

    const s = stats(cycleTimes);
    metrics.latenciesByCycle.push({ cycle: cycle + 1, ...s, success: oks });

    // Snapshot do health a cada ciclo
    const health = await getHealth();
    if (health?.cache) {
      metrics.healthSnapshots.push({
        cycle: cycle + 1,
        hitRate: health.cache.hitRate,
        keys: health.cache.keys,
        hits: health.cache.hits,
        misses: health.cache.misses,
      });
    }

    const icon = oks === CONCURRENT_USERS ? '✅' : '⚠️';
    const hitRate = health?.cache?.hitRate || '?';
    console.log(`  ${icon} Ciclo ${cycle + 1}/${POLLING_CYCLES}: avg=${s.avg}ms p95=${s.p95}ms | ${oks}/${CONCURRENT_USERS} ok | hitRate=${hitRate}`);

    // Espera intervalo de polling (exceto último ciclo)
    if (cycle < POLLING_CYCLES - 1) {
      await new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Teste 4: TTL expiration (força expiração e mede cache miss)
// ═══════════════════════════════════════════════════════════════
async function testTTLExpiration() {
  console.log(`\n${YELLOW}[4/4] TTL expiration (esperando cache expirar)...${NC}`);

  // 1. Aquece cache
  await timedFetch(
    `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`,
    'ttl-warmup'
  );
  console.log(`  Cache aquecido`);

  // 2. Request imediato (cache hit)
  const r1 = await timedFetch(
    `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`,
    'ttl-hit'
  );
  console.log(`  ${GREEN}✅ Cache HIT: ${r1.ms.toFixed(1)}ms${NC}`);

  // 3. Espera TTL expirar (history TTL = 8s)
  console.log(`  ⏳ Esperando 9s para TTL expirar...`);
  await new Promise(r => setTimeout(r, 9000));

  // 4. Request após expiração (cache miss → PG)
  const r2 = await timedFetch(
    `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`,
    'ttl-miss'
  );
  console.log(`  ${GREEN}✅ Cache MISS (TTL expirou): ${r2.ms.toFixed(1)}ms${NC}`);

  // 5. Request seguinte (cache hit de novo)
  const r3 = await timedFetch(
    `${BASE_URL}/api/full-history?source=immersive&userEmail=${TEST_EMAIL}`,
    'ttl-rehit'
  );
  console.log(`  ${GREEN}✅ Cache re-HIT: ${r3.ms.toFixed(1)}ms${NC}`);

  console.log(`  ${CYAN}📊 HIT=${r1.ms.toFixed(1)}ms → MISS=${r2.ms.toFixed(1)}ms → re-HIT=${r3.ms.toFixed(1)}ms${NC}`);
}

// ═══════════════════════════════════════════════════════════════
// Relatório final
// ═══════════════════════════════════════════════════════════════
function printReport() {
  console.log(`\n${YELLOW}${'═'.repeat(60)}`);
  console.log(`  RELATÓRIO FINAL`);
  console.log(`${'═'.repeat(60)}${NC}\n`);

  console.log(`  Total requests: ${metrics.totalRequests}`);
  console.log(`  Total erros: ${metrics.totalErrors}`);
  console.log(`  Taxa de sucesso: ${(((metrics.totalRequests - metrics.totalErrors) / metrics.totalRequests) * 100).toFixed(1)}%\n`);

  // Latência geral
  const overall = stats(metrics.latencies);
  console.log(`  ${CYAN}Latência geral:${NC}`);
  console.log(`    avg=${overall.avg}ms | p50=${overall.p50}ms | p95=${overall.p95}ms | p99=${overall.p99}ms | min=${overall.min}ms | max=${overall.max}ms\n`);

  // Por rota
  console.log(`  ${CYAN}Por rota:${NC}`);
  for (const [route, times] of Object.entries(metrics.latenciesByRoute)) {
    const s = stats(times);
    console.log(`    ${route.padEnd(28)} n=${String(times.length).padStart(4)} | avg=${s.avg.padStart(7)}ms | p95=${s.p95.padStart(7)}ms | max=${s.max.padStart(7)}ms`);
  }

  // Evolução do hitRate
  if (metrics.healthSnapshots.length > 0) {
    console.log(`\n  ${CYAN}Evolução do cache:${NC}`);
    for (const snap of metrics.healthSnapshots) {
      console.log(`    Ciclo ${snap.cycle}: hitRate=${snap.hitRate} | keys=${snap.keys} | hits=${snap.hits} misses=${snap.misses}`);
    }
  }

  // Latência por ciclo de polling
  if (metrics.latenciesByCycle.length > 0) {
    console.log(`\n  ${CYAN}Latência por ciclo de polling:${NC}`);
    for (const c of metrics.latenciesByCycle) {
      console.log(`    Ciclo ${c.cycle}: avg=${c.avg}ms | p95=${c.p95}ms | max=${c.max}ms | ${c.success}/${CONCURRENT_USERS} ok`);
    }
  }

  console.log(`\n${YELLOW}${'═'.repeat(60)}${NC}\n`);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${YELLOW}═══ TESTE DE CARGA — REDIS + HTTP ═══${NC}`);
  console.log(`${CYAN}  ${CONCURRENT_USERS} usuários | ${POLLING_CYCLES} ciclos | ${SOURCES.length} roletas${NC}`);

  // Verificar servidor
  try {
    const h = await fetch(`${BASE_URL}/health`);
    const data = await h.json();
    console.log(`  Servidor: ${data.status} | Redis: ${data.redis} | DB: ${data.database}`);
  } catch {
    console.log(`${RED}  ❌ Servidor não está rodando em ${BASE_URL}${NC}`);
    console.log(`     Rode "npm run server" em outro terminal primeiro.`);
    process.exit(1);
  }

  await testHttpFlow();
  await testConcurrentLoad();
  await testPollingWithTTL();
  await testTTLExpiration();
  printReport();
}

main().catch(e => { console.error(RED, '💥', e.message, NC); process.exit(1); });
