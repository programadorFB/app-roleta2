// tests/unit/triggerAnalysis.test.js
// Cobertura: buildTriggerMap, checkTrigger, computeTriggerScoreboard, getActiveSignals, backtestTriggers

import { describe, it, expect } from 'vitest';
import {
  buildTriggerMap,
  checkTrigger,
  getActiveTriggers,
  computeTriggerScoreboard,
  backtestTriggers,
  getActiveSignals,
} from '../../src/services/triggerAnalysis.js';
import { generateSpinHistory } from '../helpers/spinFactory.js';

// ══════════════════════════════════════════════════════════════
// buildTriggerMap
// ══════════════════════════════════════════════════════════════

describe('buildTriggerMap', () => {
  it('retorna Map com 37 entradas (0-36) para qualquer input válido', () => {
    const history = generateSpinHistory(200);
    const map = buildTriggerMap(history, 200);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(37);
  });

  it('cada entrada tem triggerNumber e appearances', () => {
    const history = generateSpinHistory(100);
    const map = buildTriggerMap(history, 100);
    for (const [num, profile] of map) {
      expect(profile).toHaveProperty('triggerNumber', num);
      expect(profile).toHaveProperty('appearances');
      expect(typeof profile.appearances).toBe('number');
      expect(profile.appearances).toBeGreaterThanOrEqual(0);
    }
  });

  it('retorna appearances=0 e bestPattern=null para histórico < 10 spins', () => {
    const history = generateSpinHistory(5);
    const map = buildTriggerMap(history, 5);
    for (const [, profile] of map) {
      expect(profile.appearances).toBe(0);
      expect(profile.bestPattern).toBeNull();
    }
  });

  it('bestPattern é null ou objeto válido com campos obrigatórios', () => {
    const history = generateSpinHistory(500, { seed: 123 });
    const map = buildTriggerMap(history, 500);
    for (const [, profile] of map) {
      if (profile.bestPattern !== null) {
        expect(profile.bestPattern).toHaveProperty('type');
        expect(['region', 'terminal']).toContain(profile.bestPattern.type);
        expect(profile.bestPattern).toHaveProperty('coveredNumbers');
        expect(Array.isArray(profile.bestPattern.coveredNumbers)).toBe(true);
        expect(profile.bestPattern).toHaveProperty('confidence');
        expect(profile.bestPattern).toHaveProperty('lift');
        expect(profile.bestPattern).toHaveProperty('label');
        expect(profile.bestPattern.confidence).toBeGreaterThan(0);
        expect(profile.bestPattern.lift).toBeGreaterThan(0);
      }
    }
  });

  it('respeita lookback — usa apenas os primeiros N spins do array', () => {
    const history = generateSpinHistory(1000, { seed: 42 });
    const mapFull = buildTriggerMap(history, 1000);
    const mapSmall = buildTriggerMap(history, 100);

    // Com lookback menor, as aparições devem ser menores ou iguais
    let totalFull = 0, totalSmall = 0;
    for (const [, p] of mapFull) totalFull += p.appearances;
    for (const [, p] of mapSmall) totalSmall += p.appearances;
    expect(totalSmall).toBeLessThanOrEqual(totalFull);
  });

  it('aparições somam (windowSize - 1)', () => {
    const history = generateSpinHistory(200, { seed: 99 });
    const map = buildTriggerMap(history, 200);
    let total = 0;
    for (const [, p] of map) total += p.appearances;
    // Cada spin (exceto o último) contribui 1 aparição
    expect(total).toBe(199);
  });

  it('coveredNumbers contém apenas números válidos (0-36)', () => {
    const history = generateSpinHistory(500, { seed: 77 });
    const map = buildTriggerMap(history, 500);
    for (const [, profile] of map) {
      if (profile.bestPattern?.coveredNumbers) {
        for (const n of profile.bestPattern.coveredNumbers) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(36);
        }
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// checkTrigger
// ══════════════════════════════════════════════════════════════

describe('checkTrigger', () => {
  it('retorna null se número não tem padrão', () => {
    const history = generateSpinHistory(10);
    const map = buildTriggerMap(history, 10); // sem dados suficientes
    const result = checkTrigger(map, 0);
    expect(result).toBeNull();
  });

  it('retorna objeto com campos obrigatórios quando padrão existe', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const triggers = getActiveTriggers(map);

    if (triggers.length > 0) {
      const result = checkTrigger(map, triggers[0].triggerNumber);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('trigger');
      expect(result).toHaveProperty('triggerColor');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('coveredNumbers');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('lift');
      expect(result).toHaveProperty('type');
      expect(['red', 'black', 'green']).toContain(result.triggerColor);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// getActiveTriggers
// ══════════════════════════════════════════════════════════════

describe('getActiveTriggers', () => {
  it('retorna array ordenado por lift decrescente', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const active = getActiveTriggers(map);

    for (let i = 1; i < active.length; i++) {
      expect(active[i - 1].lift).toBeGreaterThanOrEqual(active[i].lift);
    }
  });

  it('retorna array vazio quando sem padrões', () => {
    const history = generateSpinHistory(5);
    const map = buildTriggerMap(history, 5);
    expect(getActiveTriggers(map)).toEqual([]);
  });

  it('cada trigger ativo tem triggerColor válida', () => {
    const history = generateSpinHistory(500, { seed: 88 });
    const map = buildTriggerMap(history, 500);
    for (const t of getActiveTriggers(map)) {
      expect(['red', 'black', 'green']).toContain(t.triggerColor);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// computeTriggerScoreboard
// ══════════════════════════════════════════════════════════════

describe('computeTriggerScoreboard', () => {
  it('retorna { wins: 0, losses: 0, analyzed: 0 } para histórico < 50', () => {
    const history = generateSpinHistory(30);
    const map = buildTriggerMap(history, 30);
    const sb = computeTriggerScoreboard(history, map, 3, 3);
    expect(sb.wins).toBe(0);
    expect(sb.losses).toBe(0);
    expect(sb.analyzed).toBe(0);
  });

  it('wins + losses = analyzed', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const sb = computeTriggerScoreboard(history, map, 3, 3);
    expect(sb.wins + sb.losses).toBe(sb.analyzed);
  });

  it('wins e losses são inteiros não negativos', () => {
    const history = generateSpinHistory(500, { seed: 99 });
    const map = buildTriggerMap(history, 500);
    const sb = computeTriggerScoreboard(history, map, 3, 3);
    expect(Number.isInteger(sb.wins)).toBe(true);
    expect(Number.isInteger(sb.losses)).toBe(true);
    expect(sb.wins).toBeGreaterThanOrEqual(0);
    expect(sb.losses).toBeGreaterThanOrEqual(0);
  });

  it('miss threshold afeta contagem — threshold maior = menos losses', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const sb3 = computeTriggerScoreboard(history, map, 3, 3);
    const sb5 = computeTriggerScoreboard(history, map, 3, 5);
    // Com threshold mais alto, cada loss requer mais misses consecutivos
    expect(sb5.losses).toBeLessThanOrEqual(sb3.losses);
  });
});

// ══════════════════════════════════════════════════════════════
// backtestTriggers
// ══════════════════════════════════════════════════════════════

describe('backtestTriggers', () => {
  it('retorna formato válido com wins, losses, hitRate, method', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const bt = backtestTriggers(history, map, 200, 3);

    expect(bt).toHaveProperty('wins');
    expect(bt).toHaveProperty('losses');
    expect(bt).toHaveProperty('total');
    expect(bt).toHaveProperty('hitRate');
    expect(bt).toHaveProperty('method');
    expect(bt).toHaveProperty('validFor');
    expect(typeof bt.hitRate).toBe('number');
    expect(bt.hitRate).toBeGreaterThanOrEqual(0);
    expect(bt.hitRate).toBeLessThanOrEqual(100);
  });

  it('usa train-test-split quando dados suficientes', () => {
    const history = generateSpinHistory(600, { seed: 42 });
    const map = buildTriggerMap(history, 600);
    const bt = backtestTriggers(history, map, 200, 3);
    expect(bt.method).toBe('train-test-split');
    expect(bt.trainSize).toBeGreaterThan(0);
    expect(bt.testSize).toBe(200);
  });

  it('usa in-sample quando dados insuficientes', () => {
    const history = generateSpinHistory(100, { seed: 42 });
    const map = buildTriggerMap(history, 100);
    const bt = backtestTriggers(history, map, 50, 3);
    expect(bt.method).toBe('in-sample');
    expect(bt.note).toBeDefined();
  });

  it('wins + losses = total', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const bt = backtestTriggers(history, map, 200, 3);
    expect(bt.wins + bt.losses).toBe(bt.total);
  });
});

// ══════════════════════════════════════════════════════════════
// getActiveSignals
// ══════════════════════════════════════════════════════════════

describe('getActiveSignals', () => {
  it('retorna array vazio para histórico < 2', () => {
    const history = generateSpinHistory(1);
    const map = buildTriggerMap(history, 1);
    expect(getActiveSignals(history, map)).toEqual([]);
  });

  it('retorna array vazio para null/undefined', () => {
    const map = new Map();
    expect(getActiveSignals(null, map)).toEqual([]);
    expect(getActiveSignals(undefined, map)).toEqual([]);
  });

  it('cada sinal tem status válido (pending/win/loss)', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map);
    for (const sig of signals) {
      expect(['pending', 'win', 'loss']).toContain(sig.status);
    }
  });

  it('cada sinal tem coveredNumbers como array de inteiros 0-36', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map);
    for (const sig of signals) {
      expect(Array.isArray(sig.coveredNumbers)).toBe(true);
      for (const n of sig.coveredNumbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(36);
      }
    }
  });
});
