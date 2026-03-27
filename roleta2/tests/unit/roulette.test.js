// tests/unit/roulette.test.js
// Cobertura: src/lib/roulette.js — getNumberColor, convertSpinItem, computePullStats, computePreviousStats, formatPullTooltip

import { describe, it, expect } from 'vitest';
import {
  getNumberColor,
  convertSpinItem,
  computePullStats,
  computePreviousStats,
  formatPullTooltip,
} from '../../src/lib/roulette.js';

// ══════════════════════════════════════════════════════════════
// getNumberColor
// ══════════════════════════════════════════════════════════════

describe('getNumberColor', () => {
  it('0 é green', () => {
    expect(getNumberColor(0)).toBe('green');
  });

  it('números vermelhos retornam red', () => {
    const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    for (const n of reds) {
      expect(getNumberColor(n)).toBe('red');
    }
  });

  it('números pretos retornam black', () => {
    const blacks = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
    for (const n of blacks) {
      expect(getNumberColor(n)).toBe('black');
    }
  });

  it('cobre todos os 37 números (0-36)', () => {
    const colors = new Set();
    for (let i = 0; i <= 36; i++) {
      const color = getNumberColor(i);
      expect(['red', 'black', 'green']).toContain(color);
      colors.add(color);
    }
    expect(colors.size).toBe(3);
  });

  it('18 vermelhos + 18 pretos + 1 verde = 37', () => {
    let red = 0, black = 0, green = 0;
    for (let i = 0; i <= 36; i++) {
      const c = getNumberColor(i);
      if (c === 'red') red++;
      else if (c === 'black') black++;
      else green++;
    }
    expect(red).toBe(18);
    expect(black).toBe(18);
    expect(green).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// convertSpinItem
// ══════════════════════════════════════════════════════════════

describe('convertSpinItem', () => {
  it('converte item padrão (camelCase)', () => {
    const item = { signal: '17', gameId: 'g1', signalId: 's1', timestamp: '2024-01-01T00:00:00Z' };
    const result = convertSpinItem(item);
    expect(result.number).toBe(17);
    expect(result.color).toBe('black');
    expect(result.signal).toBe('17');
    expect(result.gameId).toBe('g1');
    expect(result.signalId).toBe('s1');
    expect(result.date).toBe('2024-01-01T00:00:00Z');
  });

  it('fallback: gameid (lowercase PG)', () => {
    const item = { signal: '5', gameid: 'g2', signalId: 's2', timestamp: 't' };
    const result = convertSpinItem(item);
    expect(result.gameId).toBe('g2');
  });

  it('fallback: signalid (lowercase PG)', () => {
    const item = { signal: '5', gameId: 'g', signalid: 'sid', timestamp: 't' };
    const result = convertSpinItem(item);
    expect(result.signalId).toBe('sid');
  });

  it('fallback: id quando signalId/signalid ausentes', () => {
    const item = { signal: '5', gameId: 'g', id: 123, timestamp: 't' };
    const result = convertSpinItem(item);
    expect(result.signalId).toBe(123);
  });

  it('fallback: created_at quando timestamp ausente', () => {
    const item = { signal: '5', gameId: 'g', signalId: 's', created_at: '2024-06-01' };
    const result = convertSpinItem(item);
    expect(result.date).toBe('2024-06-01');
  });

  it('número 0 → green', () => {
    const result = convertSpinItem({ signal: '0', gameId: 'g', signalId: 's', timestamp: 't' });
    expect(result.number).toBe(0);
    expect(result.color).toBe('green');
  });

  it('número vermelho → red', () => {
    const result = convertSpinItem({ signal: '1', gameId: 'g', signalId: 's', timestamp: 't' });
    expect(result.color).toBe('red');
  });
});

// ══════════════════════════════════════════════════════════════
// computePullStats
// ══════════════════════════════════════════════════════════════

describe('computePullStats', () => {
  it('retorna Map com 37 entradas (0-36)', () => {
    const history = [{ number: 5 }, { number: 10 }, { number: 15 }];
    const result = computePullStats(history);
    expect(result.size).toBe(37);
  });

  it('registra que o número anterior "puxou" o seguinte', () => {
    // history[0] = mais recente, history é newest-first
    // i=1: curr=10, next=5 → 10 puxou 5
    const history = [{ number: 5 }, { number: 10 }, { number: 15 }];
    const result = computePullStats(history);
    expect(result.get(10).get(5)).toBe(1);
    expect(result.get(15).get(10)).toBe(1);
  });

  it('acumula contagens quando número puxa o mesmo múltiplas vezes', () => {
    const history = [{ number: 7 }, { number: 3 }, { number: 7 }, { number: 3 }];
    const result = computePullStats(history);
    expect(result.get(3).get(7)).toBe(2);
  });

  it('histórico vazio retorna maps vazios', () => {
    const result = computePullStats([]);
    expect(result.size).toBe(37);
    expect(result.get(0).size).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// computePreviousStats
// ══════════════════════════════════════════════════════════════

describe('computePreviousStats', () => {
  it('retorna Map com 37 entradas (0-36)', () => {
    const history = [{ number: 5 }, { number: 10 }];
    const result = computePreviousStats(history);
    expect(result.size).toBe(37);
  });

  it('registra que o número seguinte veio ANTES do atual', () => {
    // history newest-first: [5, 10, 15]
    // i=0: curr=5, prev=10 → antes de 5 veio 10
    const history = [{ number: 5 }, { number: 10 }, { number: 15 }];
    const result = computePreviousStats(history);
    expect(result.get(5).get(10)).toBe(1);
    expect(result.get(10).get(15)).toBe(1);
  });

  it('histórico vazio retorna maps vazios', () => {
    const result = computePreviousStats([]);
    expect(result.size).toBe(37);
    expect(result.get(0).size).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// formatPullTooltip
// ══════════════════════════════════════════════════════════════

describe('formatPullTooltip', () => {
  it('formata tooltip com dados de pull e previous', () => {
    const pullStats = new Map([[5, new Map([[7, 3], [12, 1]])]]);
    const prevStats = new Map([[5, new Map([[3, 2]])]]);
    const result = formatPullTooltip(5, pullStats, prevStats);
    expect(result).toContain('Número: 5');
    expect(result).toContain('Puxou:');
    expect(result).toContain('Veio Antes:');
  });

  it('mostra "(Nenhum)" quando pullStats vazio', () => {
    const pullStats = new Map([[5, new Map()]]);
    const prevStats = new Map([[5, new Map()]]);
    const result = formatPullTooltip(5, pullStats, prevStats);
    expect(result).toContain('Puxou: (Nenhum)');
    expect(result).toContain('Veio Antes: (Nenhum)');
  });

  it('trunca com "..." quando mais de 5 números puxados', () => {
    const pull = new Map([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]);
    const pullStats = new Map([[10, pull]]);
    const result = formatPullTooltip(10, pullStats, null);
    expect(result).toContain('...');
  });

  it('lida com pullStats/previousStats null/undefined', () => {
    const result = formatPullTooltip(5, null, null);
    expect(result).toContain('Número: 5');
    expect(result).toContain('(Nenhum)');
  });
});
