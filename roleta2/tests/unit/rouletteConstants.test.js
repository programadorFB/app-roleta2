// tests/unit/rouletteConstants.test.js
// Cobertura: PHYSICAL_WHEEL, RED_NUMBERS, SECTORS, getRouletteColor, FILTER_OPTIONS
// Garante integridade matemática das constantes do domínio

import { describe, it, expect } from 'vitest';
import {
  PHYSICAL_WHEEL,
  RED_NUMBERS,
  SECTORS,
  getRouletteColor,
  LOSS_THRESHOLD,
  FILTER_OPTIONS,
} from '../../src/constants/roulette.js';

// ══════════════════════════════════════════════════════════════
// PHYSICAL_WHEEL — Cilindro europeu
// ══════════════════════════════════════════════════════════════

describe('PHYSICAL_WHEEL', () => {
  it('contém exatamente 37 números (0-36)', () => {
    expect(PHYSICAL_WHEEL).toHaveLength(37);
  });

  it('contém todos os números de 0 a 36 sem repetição', () => {
    const sorted = [...PHYSICAL_WHEEL].sort((a, b) => a - b);
    for (let i = 0; i <= 36; i++) {
      expect(sorted[i]).toBe(i);
    }
  });

  it('começa com 0 (posição do zero no cilindro)', () => {
    expect(PHYSICAL_WHEEL[0]).toBe(0);
  });

  it('sem duplicatas', () => {
    expect(new Set(PHYSICAL_WHEEL).size).toBe(37);
  });
});

// ══════════════════════════════════════════════════════════════
// RED_NUMBERS
// ══════════════════════════════════════════════════════════════

describe('RED_NUMBERS', () => {
  it('contém exatamente 18 números vermelhos', () => {
    expect(RED_NUMBERS).toHaveLength(18);
  });

  it('todos são inteiros entre 1 e 36 (zero não é vermelho)', () => {
    for (const n of RED_NUMBERS) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  it('NÃO contém 0', () => {
    expect(RED_NUMBERS).not.toContain(0);
  });

  it('complemento (pretos) tem exatamente 18 números', () => {
    const blacks = [];
    for (let n = 1; n <= 36; n++) {
      if (!RED_NUMBERS.includes(n)) blacks.push(n);
    }
    expect(blacks).toHaveLength(18);
  });

  it('sem duplicatas', () => {
    expect(new Set(RED_NUMBERS).size).toBe(18);
  });
});

// ══════════════════════════════════════════════════════════════
// getRouletteColor
// ══════════════════════════════════════════════════════════════

describe('getRouletteColor', () => {
  it('0 → green', () => {
    expect(getRouletteColor(0)).toBe('green');
  });

  it('todos os RED_NUMBERS → red', () => {
    for (const n of RED_NUMBERS) {
      expect(getRouletteColor(n)).toBe('red');
    }
  });

  it('números não vermelhos (1-36, exceto RED) → black', () => {
    for (let n = 1; n <= 36; n++) {
      if (!RED_NUMBERS.includes(n)) {
        expect(getRouletteColor(n)).toBe('black');
      }
    }
  });

  it('retorna apenas "red", "black" ou "green"', () => {
    for (let n = 0; n <= 36; n++) {
      expect(['red', 'black', 'green']).toContain(getRouletteColor(n));
    }
  });
});

// ══════════════════════════════════════════════════════════════
// SECTORS — Cobertura do cilindro
// ══════════════════════════════════════════════════════════════

describe('SECTORS', () => {
  it('contém tiers, orphelins, voisins e zero', () => {
    expect(SECTORS).toHaveProperty('tiers');
    expect(SECTORS).toHaveProperty('orphelins');
    expect(SECTORS).toHaveProperty('voisins');
    expect(SECTORS).toHaveProperty('zero');
  });

  it('todos os setores contêm números 0-36', () => {
    for (const [, nums] of Object.entries(SECTORS)) {
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(36);
      }
    }
  });

  it('tiers tem 12 números', () => {
    expect(SECTORS.tiers).toHaveLength(12);
  });

  it('orphelins tem 8 números', () => {
    expect(SECTORS.orphelins).toHaveLength(8);
  });

  it('voisins tem 10 números', () => {
    expect(SECTORS.voisins).toHaveLength(10);
  });

  it('zero tem 7 números', () => {
    expect(SECTORS.zero).toHaveLength(7);
  });

  it('cobertura total = 37 (todos os 0-36 cobertos)', () => {
    const all = new Set([
      ...SECTORS.tiers,
      ...SECTORS.orphelins,
      ...SECTORS.voisins,
      ...SECTORS.zero,
    ]);
    expect(all.size).toBe(37);
  });

  it('setores não se sobrepõem', () => {
    const sets = [
      new Set(SECTORS.tiers),
      new Set(SECTORS.orphelins),
      new Set(SECTORS.voisins),
      new Set(SECTORS.zero),
    ];
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const overlap = [...sets[i]].filter(n => sets[j].has(n));
        expect(overlap).toEqual([]);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// LOSS_THRESHOLD
// ══════════════════════════════════════════════════════════════

describe('LOSS_THRESHOLD', () => {
  it('é 3 (G1/G2/G3)', () => {
    expect(LOSS_THRESHOLD).toBe(3);
  });

  it('é inteiro positivo', () => {
    expect(Number.isInteger(LOSS_THRESHOLD)).toBe(true);
    expect(LOSS_THRESHOLD).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// FILTER_OPTIONS
// ══════════════════════════════════════════════════════════════

describe('FILTER_OPTIONS', () => {
  it('contém pelo menos 5 opções', () => {
    expect(FILTER_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('cada opção tem value e label', () => {
    for (const opt of FILTER_OPTIONS) {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
      expect(typeof opt.label).toBe('string');
    }
  });

  it('última opção é "all" (histórico completo)', () => {
    const last = FILTER_OPTIONS[FILTER_OPTIONS.length - 1];
    expect(last.value).toBe('all');
  });

  it('opções numéricas estão em ordem crescente', () => {
    const nums = FILTER_OPTIONS.filter(o => typeof o.value === 'number').map(o => o.value);
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBeGreaterThan(nums[i - 1]);
    }
  });
});
