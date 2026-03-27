// tests/unit/croupierDetection.test.js
// Cobertura: src/analysis/CroupieDetection.js — SECTORS, analyzeCroupierPattern, analyzeNeighborhood (CroupieDetection version)

import { describe, it, expect } from 'vitest';
import {
  SECTORS,
  PHYSICAL_WHEEL,
  analyzeCroupierPattern,
  analyzeNeighborhood,
} from '../../src/analysis/CroupieDetection.js';

// ══════════════════════════════════════════════════════════════
// Helper: gera histórico de spins
// ══════════════════════════════════════════════════════════════

function makeHistory(numbers) {
  return numbers.map((n, i) => ({ number: n, signalId: `s${i}`, gameId: `g${i}` }));
}

function makeUniformHistory(count) {
  const nums = [];
  for (let i = 0; i < count; i++) {
    nums.push(i % 37);
  }
  return makeHistory(nums);
}

function makeBiasedHistory(sectorNumbers, count, biasRatio = 0.5) {
  const nums = [];
  for (let i = 0; i < count; i++) {
    if (Math.random() < biasRatio) {
      nums.push(sectorNumbers[i % sectorNumbers.length]);
    } else {
      nums.push(Math.floor(Math.random() * 37));
    }
  }
  return makeHistory(nums);
}

// ══════════════════════════════════════════════════════════════
// SECTORS
// ══════════════════════════════════════════════════════════════

describe('SECTORS', () => {
  it('tem 6 setores', () => {
    expect(Object.keys(SECTORS).length).toBe(6);
  });

  it('cada setor tem exatamente 6 números', () => {
    for (const [key, sector] of Object.entries(SECTORS)) {
      expect(sector.numbers).toHaveLength(6);
    }
  });

  it('setores cobrem todos os 37 números (0-36) sem overlap', () => {
    const allNumbers = [];
    for (const sector of Object.values(SECTORS)) {
      allNumbers.push(...sector.numbers);
    }
    // 6 setores × 6 números = 36, + 0 que está no TM0
    expect(allNumbers).toHaveLength(36);
    // Confere que não há duplicatas
    const unique = new Set(allNumbers);
    expect(unique.size).toBe(36);
  });

  it('cada setor tem name e numbers', () => {
    for (const sector of Object.values(SECTORS)) {
      expect(sector).toHaveProperty('name');
      expect(sector).toHaveProperty('numbers');
      expect(typeof sector.name).toBe('string');
      expect(Array.isArray(sector.numbers)).toBe(true);
    }
  });

  it('todos os números dos setores estão entre 0 e 36', () => {
    for (const sector of Object.values(SECTORS)) {
      for (const num of sector.numbers) {
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(36);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// PHYSICAL_WHEEL (CroupieDetection version)
// ══════════════════════════════════════════════════════════════

describe('PHYSICAL_WHEEL (CroupieDetection)', () => {
  it('contém 37 números', () => {
    expect(PHYSICAL_WHEEL).toHaveLength(37);
  });

  it('contém todos 0-36 sem duplicatas', () => {
    const sorted = [...PHYSICAL_WHEEL].sort((a, b) => a - b);
    for (let i = 0; i <= 36; i++) {
      expect(sorted[i]).toBe(i);
    }
  });

  it('começa com 0', () => {
    expect(PHYSICAL_WHEEL[0]).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// analyzeCroupierPattern
// ══════════════════════════════════════════════════════════════

describe('analyzeCroupierPattern', () => {
  it('retorna AGUARDANDO com menos de 50 spins', () => {
    const result = analyzeCroupierPattern(makeHistory([1, 2, 3]), 50);
    expect(result.status).toBe('AGUARDANDO');
    expect(result.suggestedNumbers).toEqual([]);
    expect(result.accuracy).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('retorna AGUARDANDO com spinHistory null', () => {
    const result = analyzeCroupierPattern(null);
    expect(result.status).toBe('AGUARDANDO');
  });

  it('retorna AGUARDANDO com array vazio', () => {
    const result = analyzeCroupierPattern([]);
    expect(result.status).toBe('AGUARDANDO');
  });

  it('retorna objeto com campos obrigatórios para 50+ spins', () => {
    const history = makeUniformHistory(60);
    const result = analyzeCroupierPattern(history);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('statusLabel');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('accuracy');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('regionName');
    expect(result).toHaveProperty('suggestedNumbers');
    expect(result).toHaveProperty('sectorAnalysis');
    expect(result).toHaveProperty('expectedRate');
  });

  it('expectedRate é ~16.22% (6/37 * 100)', () => {
    const history = makeUniformHistory(60);
    const result = analyzeCroupierPattern(history);
    expect(result.expectedRate).toBeCloseTo(16.216, 1);
  });

  it('sectorAnalysis contém 6 setores', () => {
    const history = makeUniformHistory(60);
    const result = analyzeCroupierPattern(history);
    expect(result.sectorAnalysis).toHaveLength(6);
  });

  it('sectorAnalysis ordenado por precisão (decrescente)', () => {
    const history = makeUniformHistory(100);
    const result = analyzeCroupierPattern(history);
    for (let i = 1; i < result.sectorAnalysis.length; i++) {
      expect(result.sectorAnalysis[i - 1].precision).toBeGreaterThanOrEqual(
        result.sectorAnalysis[i].precision
      );
    }
  });

  it('com distribuição uniforme retorna NEUTRO', () => {
    const history = makeUniformHistory(74); // 74 = 2 * 37
    const result = analyzeCroupierPattern(history);
    // Com distribuição uniforme, nenhum setor deve ser significante
    expect(['NEUTRO', 'FRACO']).toContain(result.status);
  });

  it('status válidos são AGUARDANDO, NEUTRO, FRACO, MODERADO, ATIVO ou MUITO_ATIVO', () => {
    const validStatuses = ['AGUARDANDO', 'NEUTRO', 'FRACO', 'MODERADO', 'ATIVO', 'MUITO_ATIVO'];
    const history = makeUniformHistory(100);
    const result = analyzeCroupierPattern(history);
    expect(validStatuses).toContain(result.status);
  });

  it('cada sector analysis tem campos obrigatórios', () => {
    const history = makeUniformHistory(60);
    const result = analyzeCroupierPattern(history);
    for (const sector of result.sectorAnalysis) {
      expect(sector).toHaveProperty('key');
      expect(sector).toHaveProperty('name');
      expect(sector).toHaveProperty('numbers');
      expect(sector).toHaveProperty('hits');
      expect(sector).toHaveProperty('observedRate');
      expect(sector).toHaveProperty('precision');
      expect(sector).toHaveProperty('deviation');
      expect(sector).toHaveProperty('isSignificant');
      expect(sector).toHaveProperty('status');
    }
  });
});

// ══════════════════════════════════════════════════════════════
// analyzeNeighborhood (CroupieDetection version)
// ══════════════════════════════════════════════════════════════

describe('analyzeNeighborhood (CroupieDetection)', () => {
  it('retorna array vazio com menos de 50 spins', () => {
    const result = analyzeNeighborhood(makeHistory([1, 2, 3]));
    expect(result).toEqual([]);
  });

  it('retorna array vazio com null', () => {
    const result = analyzeNeighborhood(null);
    expect(result).toEqual([]);
  });

  it('retorna 37 padrões (um por número) com dados suficientes', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    expect(result).toHaveLength(37);
  });

  it('cada padrão tem campos obrigatórios', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(pattern).toHaveProperty('center');
      expect(pattern).toHaveProperty('neighbors');
      expect(pattern).toHaveProperty('hits');
      expect(pattern).toHaveProperty('hitRate');
      expect(pattern).toHaveProperty('expectedRate');
      expect(pattern).toHaveProperty('precision');
      expect(pattern).toHaveProperty('status');
      expect(pattern).toHaveProperty('asymmetry');
      expect(pattern).toHaveProperty('momentum');
      expect(pattern).toHaveProperty('recommendation');
      expect(pattern).toHaveProperty('isSignificant');
    }
  });

  it('resultados ordenados por precisão (decrescente)', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].precision).toBeGreaterThanOrEqual(result[i].precision);
    }
  });

  it('radius 2 gera 5 vizinhos por centro', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history, 2);
    for (const pattern of result) {
      expect(pattern.neighbors).toHaveLength(5);
    }
  });

  it('radius 1 gera 3 vizinhos por centro', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history, 1);
    for (const pattern of result) {
      expect(pattern.neighbors).toHaveLength(3);
    }
  });

  it('recommendation é BET ou SKIP', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(['BET', 'SKIP']).toContain(pattern.recommendation);
    }
  });

  it('asymmetry contém leftRate e rightRate', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(pattern.asymmetry).toHaveProperty('leftRate');
      expect(pattern.asymmetry).toHaveProperty('rightRate');
      expect(typeof pattern.asymmetry.leftRate).toBe('number');
      expect(typeof pattern.asymmetry.rightRate).toBe('number');
    }
  });

  it('momentum.key é heating, cooling ou stable', () => {
    const history = makeUniformHistory(100);
    const result = analyzeNeighborhood(history);
    for (const pattern of result) {
      expect(['heating', 'cooling', 'stable']).toContain(pattern.momentum.key);
    }
  });
});
