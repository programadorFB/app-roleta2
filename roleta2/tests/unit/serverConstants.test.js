// tests/unit/serverConstants.test.js
// Cobertura: server/constants.js — SOURCES array

import { describe, it, expect } from 'vitest';
import { SOURCES } from '../../server/constants.js';

describe('SOURCES', () => {
  it('é um array não vazio', () => {
    expect(Array.isArray(SOURCES)).toBe(true);
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it('contém apenas strings', () => {
    for (const source of SOURCES) {
      expect(typeof source).toBe('string');
    }
  });

  it('não contém duplicatas', () => {
    const unique = new Set(SOURCES);
    expect(unique.size).toBe(SOURCES.length);
  });

  it('não contém strings vazias', () => {
    for (const source of SOURCES) {
      expect(source.trim().length).toBeGreaterThan(0);
    }
  });

  it('contém as fontes principais', () => {
    const expected = ['immersive', 'brasileira', 'speed', 'lightning', 'auto', 'vip'];
    for (const name of expected) {
      expect(SOURCES).toContain(name);
    }
  });

  it('contém as fontes novas (speed, xxxtreme, vipauto)', () => {
    expect(SOURCES).toContain('speed');
    expect(SOURCES).toContain('xxxtreme');
    expect(SOURCES).toContain('vipauto');
  });

  it('todos os nomes são lowercase', () => {
    for (const source of SOURCES) {
      expect(source).toBe(source.toLowerCase());
    }
  });

  it('nenhum nome excede 64 chars (compatível com VARCHAR(64))', () => {
    for (const source of SOURCES) {
      expect(source.length).toBeLessThanOrEqual(64);
    }
  });
});
