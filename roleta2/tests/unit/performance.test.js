// tests/unit/performance.test.js
// Testes de performance/load — garante que operações críticas não regridem
// Thresholds calibrados para CI (máquinas modestas)

import { describe, it, expect } from 'vitest';
import { buildTriggerMap, computeTriggerScoreboard, backtestTriggers } from '../../src/analysis/triggerAnalysis.js';
import { calculateMasterScore } from '../../src/analysis/masterScoring.js';
import { generateSpinHistory } from '../helpers/spinFactory.js';

// Helper: mede tempo de execução em ms
function measure(fn) {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

// ══════════════════════════════════════════════════════════════
// buildTriggerMap — Performance
// ══════════════════════════════════════════════════════════════

describe('buildTriggerMap — performance', () => {
  it('200 spins em < 50ms', () => {
    const history = generateSpinHistory(200, { seed: 42 });
    const { ms } = measure(() => buildTriggerMap(history, 200));
    expect(ms).toBeLessThan(50);
  });

  it('1000 spins em < 200ms', () => {
    const history = generateSpinHistory(1000, { seed: 42 });
    const { ms } = measure(() => buildTriggerMap(history, 1000));
    expect(ms).toBeLessThan(200);
  });

  it('2000 spins (lookback máximo) em < 500ms', () => {
    const history = generateSpinHistory(2000, { seed: 42 });
    const { ms } = measure(() => buildTriggerMap(history, 2000));
    expect(ms).toBeLessThan(500);
  });
});

// ══════════════════════════════════════════════════════════════
// calculateMasterScore — Performance
// ══════════════════════════════════════════════════════════════

describe('calculateMasterScore — performance', () => {
  it('50 spins (mínimo) em < 50ms', () => {
    const history = generateSpinHistory(50, { seed: 42 });
    const { ms } = measure(() => calculateMasterScore(history));
    expect(ms).toBeLessThan(50);
  });

  it('200 spins em < 100ms', () => {
    const history = generateSpinHistory(200, { seed: 42 });
    const { ms } = measure(() => calculateMasterScore(history));
    expect(ms).toBeLessThan(100);
  });

  it('500 spins em < 200ms', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const { ms } = measure(() => calculateMasterScore(history));
    expect(ms).toBeLessThan(200);
  });

  it('1000 spins em < 500ms', () => {
    const history = generateSpinHistory(1000, { seed: 42 });
    const { ms } = measure(() => calculateMasterScore(history));
    expect(ms).toBeLessThan(500);
  });
});

// ══════════════════════════════════════════════════════════════
// computeTriggerScoreboard — Performance
// ══════════════════════════════════════════════════════════════

describe('computeTriggerScoreboard — performance', () => {
  it('500 spins em < 100ms', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const { ms } = measure(() => computeTriggerScoreboard(history, map, 3, 3));
    expect(ms).toBeLessThan(100);
  });

  it('1000 spins em < 200ms', () => {
    const history = generateSpinHistory(1000, { seed: 42 });
    const map = buildTriggerMap(history, 1000);
    const { ms } = measure(() => computeTriggerScoreboard(history, map, 3, 3));
    expect(ms).toBeLessThan(200);
  });
});

// ══════════════════════════════════════════════════════════════
// backtestTriggers — Performance
// ══════════════════════════════════════════════════════════════

describe('backtestTriggers — performance', () => {
  it('500 spins (train-test) em < 500ms', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const { ms } = measure(() => backtestTriggers(history, map, 200, 3));
    expect(ms).toBeLessThan(500);
  });
});

// ══════════════════════════════════════════════════════════════
// Stress test — Múltiplas execuções consecutivas
// ══════════════════════════════════════════════════════════════

describe('Stress — múltiplas execuções', () => {
  it('buildTriggerMap 10x seguidas sem degradação significativa', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const times = [];

    for (let i = 0; i < 10; i++) {
      const { ms } = measure(() => buildTriggerMap(history, 500));
      times.push(ms);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);

    // Média < 100ms, pico < 300ms
    expect(avg).toBeLessThan(100);
    expect(max).toBeLessThan(300);
  });

  it('calculateMasterScore 10x seguidas sem degradação', () => {
    const history = generateSpinHistory(200, { seed: 42 });
    const times = [];

    for (let i = 0; i < 10; i++) {
      const { ms } = measure(() => calculateMasterScore(history));
      times.push(ms);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(100);
  });
});

// ══════════════════════════════════════════════════════════════
// Memory — Verifica que não há leak óbvio
// ══════════════════════════════════════════════════════════════

describe('Memory — sem leak óbvio', () => {
  it('buildTriggerMap 50x não explode memória', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 50; i++) {
      buildTriggerMap(history, 500);
    }

    // Força GC se disponível
    if (global.gc) global.gc();

    const after = process.memoryUsage().heapUsed;
    const deltaBytes = after - before;
    const deltaMB = deltaBytes / (1024 * 1024);

    // Crescimento < 50MB para 50 iterações
    expect(deltaMB).toBeLessThan(50);
  });
});
