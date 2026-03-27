// tests/unit/analysisConstants.test.js
// Cobertura: src/constants/analysis.js — HIDDEN_LEVELS

import { describe, it, expect } from 'vitest';
import { HIDDEN_LEVELS } from '../../src/constants/analysis.js';

describe('HIDDEN_LEVELS', () => {
  it('é um array não vazio', () => {
    expect(Array.isArray(HIDDEN_LEVELS)).toBe(true);
    expect(HIDDEN_LEVELS.length).toBeGreaterThan(0);
  });

  it('cada nível tem level, min, label e color', () => {
    for (const level of HIDDEN_LEVELS) {
      expect(level).toHaveProperty('level');
      expect(level).toHaveProperty('min');
      expect(level).toHaveProperty('label');
      expect(level).toHaveProperty('color');
      expect(typeof level.level).toBe('number');
      expect(typeof level.min).toBe('number');
      expect(typeof level.label).toBe('string');
      expect(typeof level.color).toBe('string');
    }
  });

  it('levels são únicos', () => {
    const levels = HIDDEN_LEVELS.map(l => l.level);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it('min values são decrescentes (array ordenado de maior para menor)', () => {
    for (let i = 1; i < HIDDEN_LEVELS.length; i++) {
      expect(HIDDEN_LEVELS[i - 1].min).toBeGreaterThan(HIDDEN_LEVELS[i].min);
    }
  });

  it('nível mais alto é 6 (CRITICO) com min 100', () => {
    const highest = HIDDEN_LEVELS[0];
    expect(highest.level).toBe(6);
    expect(highest.min).toBe(100);
    expect(highest.label).toContain('CR');
  });

  it('colors são hex válidos', () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const level of HIDDEN_LEVELS) {
      expect(level.color).toMatch(hexRegex);
    }
  });

  it('nível mais baixo é 1 com min 15', () => {
    const lowest = HIDDEN_LEVELS[HIDDEN_LEVELS.length - 1];
    expect(lowest.level).toBe(1);
    expect(lowest.min).toBe(15);
  });
});
