// tests/unit/masterScoring.test.js
// Cobertura: calculateMasterScore — 5 estratégias, convergência, entrySignal

import { describe, it, expect } from 'vitest';
import { calculateMasterScore } from '../../src/analysis/masterScoring.js';
import { generateSpinHistory } from '../helpers/spinFactory.js';

// ══════════════════════════════════════════════════════════════
// Edge cases — Input inválido
// ══════════════════════════════════════════════════════════════

describe('calculateMasterScore — edge cases', () => {
  it('retorna resultado vazio para null', () => {
    const result = calculateMasterScore(null);
    expect(result.globalAssertiveness).toBe(0);
    expect(result.strategyScores).toEqual([]);
    expect(result.entrySignal).toBeNull();
  });

  it('retorna resultado vazio para undefined', () => {
    const result = calculateMasterScore(undefined);
    expect(result.entrySignal).toBeNull();
    expect(result.totalSignals).toBe(0);
  });

  it('retorna resultado vazio para array vazio', () => {
    const result = calculateMasterScore([]);
    expect(result.strategyScores).toEqual([]);
    expect(result.entrySignal).toBeNull();
  });

  it('retorna resultado vazio para < 4 spins', () => {
    // Threshold mínimo é 4 (masterScoring.js:189) — 1 estratégia pode rodar com pouquíssimos dados.
    const history = generateSpinHistory(3);
    const result = calculateMasterScore(history);
    expect(result.strategyScores).toEqual([]);
    expect(result.entrySignal).toBeNull();
    expect(result.globalAssertiveness).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Formato de saída
// ══════════════════════════════════════════════════════════════

describe('calculateMasterScore — output format', () => {
  const history = generateSpinHistory(200, { seed: 42 });
  const result = calculateMasterScore(history);

  it('retorna objeto com todos os campos obrigatórios', () => {
    expect(result).toHaveProperty('globalAssertiveness');
    expect(result).toHaveProperty('totalSignals');
    expect(result).toHaveProperty('strategyScores');
    expect(result).toHaveProperty('entrySignal');
  });

  it('strategyScores contém exatamente 5 estratégias', () => {
    expect(result.strategyScores).toHaveLength(5);
  });

  it('cada estratégia tem name, score, status, signal, numbers', () => {
    // Estratégia 'Croupier' do CLAUDE.md foi renomeada para 'Gatilhos' (analyzeTriggers).
    const requiredNames = ['Cavalos', 'Setores', 'Vizinhos', 'Ocultos', 'Gatilhos'];
    const names = result.strategyScores.map(s => s.name);
    for (const name of requiredNames) {
      expect(names).toContain(name);
    }

    for (const s of result.strategyScores) {
      expect(s).toHaveProperty('score');
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('signal');
      expect(s).toHaveProperty('numbers');
      expect(typeof s.score).toBe('number');
      expect(typeof s.signal).toBe('string');
      expect(Array.isArray(s.numbers)).toBe(true);
    }
  });

  it('scores estão entre 0 e 100', () => {
    for (const s of result.strategyScores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  it('status é emoji válido (🟢, 🟡, 🟠)', () => {
    for (const s of result.strategyScores) {
      expect(['🟢', '🟡', '🟠']).toContain(s.status);
    }
  });

  it('numbers contém apenas inteiros 0-36', () => {
    for (const s of result.strategyScores) {
      for (const n of s.numbers) {
        expect(typeof n).toBe('number');
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(36);
      }
    }
  });

  it('globalAssertiveness é número >= 0', () => {
    expect(typeof result.globalAssertiveness).toBe('number');
    expect(result.globalAssertiveness).toBeGreaterThanOrEqual(0);
  });

  it('totalSignals corresponde a estratégias ativas (🟢 ou 🟡)', () => {
    const activeCount = result.strategyScores.filter(
      s => s.status === '🟢' || s.status === '🟡'
    ).length;
    expect(result.totalSignals).toBe(activeCount);
  });
});

// ══════════════════════════════════════════════════════════════
// Convergência — entrySignal
// ══════════════════════════════════════════════════════════════

describe('calculateMasterScore — convergence', () => {
  it('entrySignal é null quando < 3 estratégias 🟢', () => {
    // Com 50 spins aleatórios é improvável ter 3+ convergências
    const history = generateSpinHistory(50, { seed: 1 });
    const result = calculateMasterScore(history);
    const greens = result.strategyScores.filter(s => s.status === '🟢').length;
    if (greens < 3) {
      expect(result.entrySignal).toBeNull();
    }
  });

  it('quando entrySignal existe, tem formato correto', () => {
    // Gera histórico grande com bias para forçar convergência
    const history = generateSpinHistory(500, { seed: 42, bias: [7, 17, 27] });
    const result = calculateMasterScore(history);

    if (result.entrySignal) {
      expect(result.entrySignal).toHaveProperty('convergence');
      expect(result.entrySignal).toHaveProperty('suggestedNumbers');
      expect(result.entrySignal).toHaveProperty('confidence');
      expect(result.entrySignal).toHaveProperty('validFor');
      expect(result.entrySignal).toHaveProperty('reason');

      expect(result.entrySignal.convergence).toBeGreaterThanOrEqual(3);
      expect(result.entrySignal.suggestedNumbers.length).toBeLessThanOrEqual(5);
      expect(result.entrySignal.suggestedNumbers.length).toBeGreaterThan(0);

      for (const n of result.entrySignal.suggestedNumbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(36);
      }

      expect(result.entrySignal.validFor).toBeGreaterThanOrEqual(2);
      expect(result.entrySignal.validFor).toBeLessThanOrEqual(4);
    }
  });

  it('suggestedNumbers não tem duplicatas', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const result = calculateMasterScore(history);
    if (result.entrySignal) {
      const nums = result.entrySignal.suggestedNumbers;
      expect(new Set(nums).size).toBe(nums.length);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Determinismo
// ══════════════════════════════════════════════════════════════

describe('calculateMasterScore — determinismo', () => {
  it('mesmo input retorna mesmo output', () => {
    const history = generateSpinHistory(200, { seed: 42 });
    const r1 = calculateMasterScore(history);
    const r2 = calculateMasterScore(history);

    expect(r1.globalAssertiveness).toBe(r2.globalAssertiveness);
    expect(r1.totalSignals).toBe(r2.totalSignals);
    for (let i = 0; i < 5; i++) {
      expect(r1.strategyScores[i].score).toBe(r2.strategyScores[i].score);
      expect(r1.strategyScores[i].status).toBe(r2.strategyScores[i].status);
    }
  });

  it('não muta o array de entrada', () => {
    const history = generateSpinHistory(100, { seed: 42 });
    const copy = JSON.parse(JSON.stringify(history));
    calculateMasterScore(history);
    expect(history).toEqual(copy);
  });
});
