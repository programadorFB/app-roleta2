// tests/unit/neighborAnalysis.test.js
// Cobertura: src/analysis/NeighborAnalysis.js — analyzeNeighborhood, PHYSICAL_WHEEL

import { describe, it, expect } from 'vitest';
import {
  PHYSICAL_WHEEL,
  analyzeNeighborhood,
} from '../../src/analysis/NeighborAnalysis.js';

// ══════════════════════════════════════════════════════════════
// Helper
// ══════════════════════════════════════════════════════════════

function makeHistory(numbers) {
  return numbers.map((n, i) => ({ number: n, signalId: `s${i}`, gameId: `g${i}` }));
}

function makeUniformHistory(count) {
  const nums = [];
  for (let i = 0; i < count; i++) nums.push(i % 37);
  return makeHistory(nums);
}

// ══════════════════════════════════════════════════════════════
// PHYSICAL_WHEEL (NeighborAnalysis version)
// ══════════════════════════════════════════════════════════════

describe('PHYSICAL_WHEEL (NeighborAnalysis)', () => {
  it('contém 37 números', () => {
    expect(PHYSICAL_WHEEL).toHaveLength(37);
  });

  it('contém todos 0-36 sem duplicatas', () => {
    const unique = new Set(PHYSICAL_WHEEL);
    expect(unique.size).toBe(37);
    for (let i = 0; i <= 36; i++) {
      expect(PHYSICAL_WHEEL).toContain(i);
    }
  });

  it('começa com 0', () => {
    expect(PHYSICAL_WHEEL[0]).toBe(0);
  });

  it('é idêntico ao PHYSICAL_WHEEL do CroupieDetection', async () => {
    const { PHYSICAL_WHEEL: otherWheel } = await import('../../src/analysis/CroupieDetection.js');
    expect(PHYSICAL_WHEEL).toEqual(otherWheel);
  });
});

// ══════════════════════════════════════════════════════════════
// analyzeNeighborhood
// ══════════════════════════════════════════════════════════════

describe('analyzeNeighborhood (NeighborAnalysis)', () => {
  it('retorna array vazio com menos de 4 spins', () => {
    const result = analyzeNeighborhood(makeHistory([1, 2, 3]));
    expect(result).toEqual([]);
  });

  it('retorna 37 padrões com dados suficientes', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    expect(result).toHaveLength(37);
  });

  it('cada padrão contém center, neighbors, hitRate, accuracy, status', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(pattern).toHaveProperty('center');
      expect(pattern).toHaveProperty('neighbors');
      expect(pattern).toHaveProperty('hitRate');
      expect(pattern).toHaveProperty('accuracy');
      expect(pattern).toHaveProperty('status');
      expect(pattern).toHaveProperty('lastHitAgo');
      expect(pattern).toHaveProperty('asymmetry');
      expect(pattern).toHaveProperty('momentum');
      expect(pattern).toHaveProperty('recommendation');
    }
  });

  it('radius padrão (2) gera 5 vizinhos por centro', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(pattern.neighbors).toHaveLength(5);
    }
  });

  it('radius 1 gera 3 vizinhos por centro', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history, 1);
    for (const pattern of result) {
      expect(pattern.neighbors).toHaveLength(3);
    }
  });

  it('resultados ordenados por accuracy (decrescente)', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].accuracy).toBeGreaterThanOrEqual(result[i].accuracy);
    }
  });

  it('center cobre todos os 37 números', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    const centers = result.map(p => p.center).sort((a, b) => a - b);
    for (let i = 0; i <= 36; i++) {
      expect(centers).toContain(i);
    }
  });

  it('status.key é confirmed, warning ou inactive', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(['confirmed', 'warning', 'inactive']).toContain(pattern.status.key);
    }
  });

  it('recommendation é BET ou SKIP', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(['BET', 'SKIP']).toContain(pattern.recommendation);
    }
  });

  it('momentum.key é heating, cooling ou stable', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(['heating', 'cooling', 'stable']).toContain(pattern.momentum.key);
    }
  });

  it('asymmetry contém leftRate, rightRate, leftNeighbors, rightNeighbors', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(pattern.asymmetry).toHaveProperty('leftRate');
      expect(pattern.asymmetry).toHaveProperty('rightRate');
      expect(pattern.asymmetry).toHaveProperty('leftNeighbors');
      expect(pattern.asymmetry).toHaveProperty('rightNeighbors');
    }
  });

  it('hitRate nunca é negativo', () => {
    const history = makeUniformHistory(50);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(pattern.hitRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects lookback parameter', () => {
    const history = makeUniformHistory(200);
    const r50 = analyzeNeighborhood(history, 2, 50);
    const r200 = analyzeNeighborhood(history, 2, 200);
    // Different lookbacks may produce different hitRates
    expect(r50).toHaveLength(37);
    expect(r200).toHaveLength(37);
  });
});
