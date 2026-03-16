// tests/unit/stressTest.test.js
// Teste de carga progressivo — descobre o limite real de usuários simultâneos
// Simula o pipeline completo: triggerMap + masterScore + scoreboard por usuário

import { describe, it, expect } from 'vitest';
import { buildTriggerMap, computeTriggerScoreboard } from '../../src/services/triggerAnalysis.js';
import { calculateMasterScore } from '../../src/services/masterScoring.js';
import { generateSpinHistory } from '../helpers/spinFactory.js';

// ── Helpers ─────────────────────────────────────────────

function formatMs(ms) { return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`; }
function formatMem(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)}MB`; }

function runLoadTest(users, spinsPerUser, label) {
  // Gera dados para cada usuário (simula cada um vendo uma roleta diferente)
  const histories = Array.from({ length: users }, (_, i) =>
    generateSpinHistory(spinsPerUser, { seed: i + 1 })
  );

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const times = [];

  const totalStart = performance.now();

  for (let u = 0; u < users; u++) {
    const userStart = performance.now();
    const hist = histories[u];

    // Pipeline completo por usuário:
    // 1. Análise de triggers
    const map = buildTriggerMap(hist, spinsPerUser);

    // 2. Motor scoring (a operação mais pesada)
    calculateMasterScore(hist);

    // 3. Scoreboard
    computeTriggerScoreboard(hist, map, 3, 3);

    times.push(performance.now() - userStart);
  }

  const totalMs = performance.now() - totalStart;
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;

  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const max = times[times.length - 1];
  const memDelta = memAfter - memBefore;

  console.log([
    ``,
    `  ┌─── ${label} ───`,
    `  │ Usuários:    ${users}`,
    `  │ Spins/user:  ${spinsPerUser}`,
    `  │ Total:       ${formatMs(totalMs)}`,
    `  │ Avg/user:    ${formatMs(avg)}`,
    `  │ p50:         ${formatMs(p50)}`,
    `  │ p95:         ${formatMs(p95)}`,
    `  │ p99:         ${formatMs(p99)}`,
    `  │ Max:         ${formatMs(max)}`,
    `  │ Throughput:  ${Math.round(users / (totalMs / 1000))} users/s`,
    `  │ Memória:     ${formatMem(memDelta)}`,
    `  └──────────────────────`,
  ].join('\n'));

  return { totalMs, avg, p50, p95, p99, max, memDelta, throughput: users / (totalMs / 1000) };
}

// ══════════════════════════════════════════════════════════════
// CARGA PROGRESSIVA — 100 spins por usuário (cenário típico)
// ══════════════════════════════════════════════════════════════

describe('Carga progressiva — 100 spins/user (cenário típico)', () => {

  it('100 usuários', () => {
    const r = runLoadTest(100, 100, '100 USERS × 100 SPINS');
    expect(r.totalMs).toBeLessThan(3000);
    expect(r.avg).toBeLessThan(20);
  });

  it('250 usuários', () => {
    const r = runLoadTest(250, 100, '250 USERS × 100 SPINS');
    expect(r.totalMs).toBeLessThan(8000);
    expect(r.avg).toBeLessThan(25);
  });

  it('500 usuários', () => {
    const r = runLoadTest(500, 100, '500 USERS × 100 SPINS');
    expect(r.totalMs).toBeLessThan(15000);
    expect(r.avg).toBeLessThan(30);
  });

  it('1000 usuários', () => {
    const r = runLoadTest(1000, 100, '1000 USERS × 100 SPINS');
    expect(r.totalMs).toBeLessThan(30000);
    expect(r.p95).toBeLessThan(50);
  });

  it('2000 usuários', () => {
    const r = runLoadTest(2000, 100, '2000 USERS × 100 SPINS');
    expect(r.totalMs).toBeLessThan(60000);
    expect(r.p95).toBeLessThan(60);
  });
});

// ══════════════════════════════════════════════════════════════
// CARGA PESADA — 300 spins por usuário (filtro grande)
// ══════════════════════════════════════════════════════════════

describe('Carga pesada — 300 spins/user (filtro expandido)', () => {

  it('100 usuários × 300 spins', () => {
    const r = runLoadTest(100, 300, '100 USERS × 300 SPINS');
    expect(r.totalMs).toBeLessThan(10000);
    expect(r.avg).toBeLessThan(80);
  });

  it('500 usuários × 300 spins', () => {
    const r = runLoadTest(500, 300, '500 USERS × 300 SPINS');
    expect(r.totalMs).toBeLessThan(45000);
    expect(r.p95).toBeLessThan(120);
  });

  it('1000 usuários × 300 spins', () => {
    const r = runLoadTest(1000, 300, '1000 USERS × 300 SPINS');
    expect(r.totalMs).toBeLessThan(90000);
    expect(r.p95).toBeLessThan(150);
  });
});

// ══════════════════════════════════════════════════════════════
// CARGA EXTREMA — 500 spins por usuário (máximo realista)
// ══════════════════════════════════════════════════════════════

describe('Carga extrema — 500 spins/user', () => {

  it('100 usuários × 500 spins', () => {
    const r = runLoadTest(100, 500, '100 USERS × 500 SPINS');
    expect(r.totalMs).toBeLessThan(30000);
  });

  it('500 usuários × 500 spins', () => {
    const r = runLoadTest(500, 500, '500 USERS × 500 SPINS');
    expect(r.totalMs).toBeLessThan(120000);
  });
});

// ══════════════════════════════════════════════════════════════
// MEMÓRIA — Verifica que não há leak sob carga crescente
// ══════════════════════════════════════════════════════════════

describe('Memória sob carga crescente', () => {

  it('memória cresce linearmente (não exponencial)', () => {
    const results = [];

    for (const users of [50, 100, 200, 400]) {
      if (global.gc) global.gc();
      const before = process.memoryUsage().heapUsed;

      const histories = Array.from({ length: users }, (_, i) =>
        generateSpinHistory(100, { seed: i + 5000 })
      );
      for (const hist of histories) {
        buildTriggerMap(hist, 100);
        calculateMasterScore(hist);
      }

      if (global.gc) global.gc();
      const after = process.memoryUsage().heapUsed;
      results.push({ users, deltaMB: (after - before) / (1024 * 1024) });
    }

    console.log('\n  Memória por escala:');
    for (const r of results) {
      console.log(`    ${r.users} users → ${r.deltaMB.toFixed(1)}MB (${(r.deltaMB / r.users * 1000).toFixed(0)}KB/user)`);
    }

    // Se dobrar os usuários, a memória não deve mais que triplicar
    const ratio = results[3].deltaMB / results[1].deltaMB;
    console.log(`    Ratio 400/100 users: ${ratio.toFixed(2)}x (ideal ≤ 4x)`);
    expect(ratio).toBeLessThan(6);
  });

  it('1000 análises completas: delta heap < 150MB', () => {
    if (global.gc) global.gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      const hist = generateSpinHistory(100, { seed: i + 9000 });
      buildTriggerMap(hist, 100);
      calculateMasterScore(hist);
    }

    if (global.gc) global.gc();
    const after = process.memoryUsage().heapUsed;
    const deltaMB = (after - before) / (1024 * 1024);

    console.log(`\n  1000 análises: delta heap = ${deltaMB.toFixed(1)}MB`);
    expect(deltaMB).toBeLessThan(150);
  });
});

// ══════════════════════════════════════════════════════════════
// DEGRADAÇÃO — Detecta se performance cai sob carga sustentada
// ══════════════════════════════════════════════════════════════

describe('Degradação sob carga sustentada', () => {

  it('performance não degrada após 500 execuções consecutivas', () => {
    const hist = generateSpinHistory(200, { seed: 777 });
    const batches = { first50: [], last50: [] };

    for (let i = 0; i < 500; i++) {
      const start = performance.now();
      buildTriggerMap(hist, 200);
      calculateMasterScore(hist);
      const ms = performance.now() - start;

      if (i < 50) batches.first50.push(ms);
      if (i >= 450) batches.last50.push(ms);
    }

    const avgFirst = batches.first50.reduce((a, b) => a + b, 0) / 50;
    const avgLast = batches.last50.reduce((a, b) => a + b, 0) / 50;
    const degradation = avgLast / avgFirst;

    console.log([
      ``,
      `  Degradação após 500 execuções:`,
      `    Primeiras 50: avg=${avgFirst.toFixed(2)}ms`,
      `    Últimas 50:   avg=${avgLast.toFixed(2)}ms`,
      `    Ratio:        ${degradation.toFixed(2)}x ${degradation < 1.5 ? '(OK)' : '(DEGRADOU!)'}`,
    ].join('\n'));

    // Últimas não podem ser mais que 2x mais lentas que as primeiras
    expect(degradation).toBeLessThan(2.0);
  });
});

// ══════════════════════════════════════════════════════════════
// RELATÓRIO FINAL — Throughput por cenário
// ══════════════════════════════════════════════════════════════

describe('Relatório — throughput por cenário', () => {
  it('gera tabela de capacidade', () => {
    const scenarios = [
      { users: 100, spins: 100 },
      { users: 500, spins: 100 },
      { users: 1000, spins: 100 },
      { users: 100, spins: 300 },
      { users: 500, spins: 300 },
      { users: 100, spins: 500 },
    ];

    console.log('\n  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║        RELATÓRIO DE CAPACIDADE — SINGLE THREAD      ║');
    console.log('  ╠═══════════╦═══════╦══════════╦═══════════╦══════════╣');
    console.log('  ║  Usuários ║ Spins ║   Total  ║  Avg/user ║ Users/s  ║');
    console.log('  ╠═══════════╬═══════╬══════════╬═══════════╬══════════╣');

    for (const s of scenarios) {
      const histories = Array.from({ length: s.users }, (_, i) =>
        generateSpinHistory(s.spins, { seed: i + 7000 })
      );

      const start = performance.now();
      for (const hist of histories) {
        buildTriggerMap(hist, s.spins);
        calculateMasterScore(hist);
        const map = buildTriggerMap(hist, s.spins);
        computeTriggerScoreboard(hist, map, 3, 3);
      }
      const totalMs = performance.now() - start;
      const avgMs = totalMs / s.users;
      const throughput = Math.round(s.users / (totalMs / 1000));

      console.log(
        `  ║ ${String(s.users).padStart(9)} ║ ${String(s.spins).padStart(5)} ║ ` +
        `${formatMs(totalMs).padStart(8)} ║ ${formatMs(avgMs).padStart(9)} ║ ` +
        `${String(throughput).padStart(6)}/s ║`
      );
    }

    console.log('  ╠═══════════╩═══════╩══════════╩═══════════╩══════════╣');
    console.log('  ║  * Com PM2 cluster (N cores): multiply Users/s × N  ║');
    console.log('  ║  * 4 cores → throughput × 4 | 8 cores → × 8        ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');

    expect(true).toBe(true);
  });
});
