// tests/unit/loadCapacity.test.js
// Simulação de carga: mede quantas operações/s o sistema suporta
// por camada (análise, scoring, scoreboard)

import { describe, it, expect } from 'vitest';
import { buildTriggerMap, computeTriggerScoreboard } from '../../src/services/triggerAnalysis.js';
import { calculateMasterScore } from '../../src/services/masterScoring.js';
import { generateSpinHistory } from '../helpers/spinFactory.js';

function benchmark(label, fn, iterations = 50) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    label,
    iterations,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    min: times[0],
    max: times[times.length - 1],
    opsPerSec: Math.round(1000 / (times.reduce((a, b) => a + b, 0) / times.length)),
  };
}

// ══════════════════════════════════════════════════════════════
// Throughput — operações por segundo por camada
// ══════════════════════════════════════════════════════════════

describe('Throughput — ops/s por camada', () => {
  const hist100 = generateSpinHistory(100, { seed: 1 });
  const hist300 = generateSpinHistory(300, { seed: 2 });
  const hist500 = generateSpinHistory(500, { seed: 3 });
  const hist1000 = generateSpinHistory(1000, { seed: 4 });

  it('buildTriggerMap — 100 spins: > 200 ops/s', () => {
    const r = benchmark('triggerMap-100', () => buildTriggerMap(hist100, 100));
    console.log(`  buildTriggerMap(100): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(200);
  });

  it('buildTriggerMap — 500 spins: > 50 ops/s', () => {
    const r = benchmark('triggerMap-500', () => buildTriggerMap(hist500, 500));
    console.log(`  buildTriggerMap(500): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(50);
  });

  it('buildTriggerMap — 1000 spins: > 20 ops/s', () => {
    const r = benchmark('triggerMap-1000', () => buildTriggerMap(hist1000, 1000));
    console.log(`  buildTriggerMap(1000): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(20);
  });

  it('calculateMasterScore — 100 spins: > 100 ops/s', () => {
    const r = benchmark('masterScore-100', () => calculateMasterScore(hist100));
    console.log(`  masterScore(100): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(100);
  });

  it('calculateMasterScore — 300 spins: > 30 ops/s', () => {
    const r = benchmark('masterScore-300', () => calculateMasterScore(hist300));
    console.log(`  masterScore(300): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(30);
  });

  it('calculateMasterScore — 1000 spins: > 5 ops/s', () => {
    const r = benchmark('masterScore-1000', () => calculateMasterScore(hist1000), 20);
    console.log(`  masterScore(1000): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(5);
  });

  it('computeTriggerScoreboard — 500 spins: > 100 ops/s', () => {
    const map = buildTriggerMap(hist500, 500);
    const r = benchmark('scoreboard-500', () => computeTriggerScoreboard(hist500, map, 3, 3));
    console.log(`  scoreboard(500): ${r.opsPerSec} ops/s | avg=${r.avg.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.opsPerSec).toBeGreaterThan(100);
  });
});

// ══════════════════════════════════════════════════════════════
// Simulação de carga concorrente
// Simula N usuários computando análise simultaneamente
// ══════════════════════════════════════════════════════════════

describe('Simulação — N usuários simultâneos', () => {
  it('50 usuários com 100 spins cada — total < 2s', () => {
    const users = 50;
    const histories = Array.from({ length: users }, (_, i) =>
      generateSpinHistory(100, { seed: i + 100 })
    );

    const start = performance.now();
    for (const hist of histories) {
      buildTriggerMap(hist, 100);
      calculateMasterScore(hist);
    }
    const totalMs = performance.now() - start;
    const avgPerUser = totalMs / users;

    console.log(`  50 usuários × 100 spins: total=${totalMs.toFixed(0)}ms avg=${avgPerUser.toFixed(1)}ms/user`);
    expect(totalMs).toBeLessThan(2000);
  });

  it('100 usuários com 100 spins cada — total < 5s', () => {
    const users = 100;
    const histories = Array.from({ length: users }, (_, i) =>
      generateSpinHistory(100, { seed: i + 200 })
    );

    const start = performance.now();
    for (const hist of histories) {
      buildTriggerMap(hist, 100);
      calculateMasterScore(hist);
    }
    const totalMs = performance.now() - start;
    const avgPerUser = totalMs / users;

    console.log(`  100 usuários × 100 spins: total=${totalMs.toFixed(0)}ms avg=${avgPerUser.toFixed(1)}ms/user`);
    expect(totalMs).toBeLessThan(5000);
  });

  it('200 usuários com 300 spins cada — total < 15s', () => {
    const users = 200;
    const histories = Array.from({ length: users }, (_, i) =>
      generateSpinHistory(300, { seed: i + 500 })
    );

    const start = performance.now();
    for (const hist of histories) {
      buildTriggerMap(hist, 300);
      calculateMasterScore(hist);
    }
    const totalMs = performance.now() - start;
    const avgPerUser = totalMs / users;

    console.log(`  200 usuários × 300 spins: total=${totalMs.toFixed(0)}ms avg=${avgPerUser.toFixed(1)}ms/user`);
    expect(totalMs).toBeLessThan(15000);
  });
});

// ══════════════════════════════════════════════════════════════
// Pico de memória sob carga
// ══════════════════════════════════════════════════════════════

describe('Memória sob carga', () => {
  it('100 análises completas: delta heap < 100MB', () => {
    if (global.gc) global.gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      const hist = generateSpinHistory(200, { seed: i + 1000 });
      buildTriggerMap(hist, 200);
      calculateMasterScore(hist);
    }

    if (global.gc) global.gc();
    const after = process.memoryUsage().heapUsed;
    const deltaMB = (after - before) / (1024 * 1024);

    console.log(`  100 análises: delta heap = ${deltaMB.toFixed(1)}MB`);
    expect(deltaMB).toBeLessThan(100);
  });
});
