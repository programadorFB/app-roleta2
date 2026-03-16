// tests/unit/motorScoreEngine.test.js
// Cobertura: getCovered, dbRowToSpin — lógica pura do motor de scoring
// Recria funções internas (não exportadas) para testar isoladamente

import { describe, it, expect } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Recria lógica interna do motorScoreEngine.js
// ══════════════════════════════════════════════════════════════

const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
}

function getCovered(nums, mode) {
  if (mode === 0) return nums;
  const s = new Set();
  nums.forEach(n => {
    s.add(n);
    const idx = WHEEL.indexOf(n);
    for (let i = 1; i <= mode; i++) {
      s.add(WHEEL[(idx + i) % 37]);
      s.add(WHEEL[(idx - i + 37) % 37]);
    }
  });
  return [...s];
}

function dbRowToSpin(row) {
  const num = parseInt(row.signal, 10);
  return {
    number: isNaN(num) ? 0 : num,
    color: getColor(isNaN(num) ? 0 : num),
    signal: row.signal,
    signalId: row.signalId,
    gameId: row.gameId,
    date: row.timestamp,
  };
}

// ══════════════════════════════════════════════════════════════
// getCovered — Expansão de vizinhos
// ══════════════════════════════════════════════════════════════

describe('getCovered', () => {
  it('mode 0 retorna os números originais sem expansão', () => {
    const nums = [7, 28, 12];
    expect(getCovered(nums, 0)).toEqual(nums);
  });

  it('mode 1 expande 1 vizinho de cada lado no cilindro', () => {
    // 0 está no index 0 do WHEEL
    // vizinhos: WHEEL[36]=26 (esquerda) e WHEEL[1]=32 (direita)
    const result = getCovered([0], 1);
    expect(result).toContain(0);
    expect(result).toContain(26); // vizinho esquerdo
    expect(result).toContain(32); // vizinho direito
    expect(result).toHaveLength(3);
  });

  it('mode 2 expande 2 vizinhos de cada lado', () => {
    const result = getCovered([0], 2);
    expect(result).toContain(0);
    expect(result).toContain(26); // -1
    expect(result).toContain(3);  // -2
    expect(result).toContain(32); // +1
    expect(result).toContain(15); // +2
    expect(result).toHaveLength(5);
  });

  it('deduplica quando vizinhos se sobrepõem', () => {
    // Números adjacentes no cilindro terão vizinhos compartilhados
    const result = getCovered([0, 32], 1); // 32 é vizinho de 0
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it('retorna apenas números 0-36', () => {
    const result = getCovered([0, 17, 36], 2);
    for (const n of result) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  it('mode 1 com 5 números gera no máximo 15 cobertos', () => {
    const result = getCovered([7, 14, 21, 28, 35], 1);
    // 5 números × 3 (self + 2 vizinhos) = 15, menos overlap
    expect(result.length).toBeLessThanOrEqual(15);
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('wrap-around funciona no final do cilindro', () => {
    // último número do WHEEL é 26 (index 36)
    // +1 deve voltar para WHEEL[0] = 0
    const result = getCovered([26], 1);
    expect(result).toContain(26);
    expect(result).toContain(0);  // wrap
    expect(result).toContain(3);  // WHEEL[35]
  });

  it('array vazio retorna array vazio', () => {
    expect(getCovered([], 2)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// dbRowToSpin — Conversão DB → formato frontend
// ══════════════════════════════════════════════════════════════

describe('dbRowToSpin', () => {
  it('converte row válida com número', () => {
    const spin = dbRowToSpin({
      signal: '17',
      signalId: 'sig-1',
      gameId: 'game-1',
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(spin.number).toBe(17);
    expect(spin.color).toBe('black');
    expect(spin.signal).toBe('17');
    expect(spin.signalId).toBe('sig-1');
  });

  it('converte número 0 corretamente', () => {
    const spin = dbRowToSpin({ signal: '0', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(0);
    expect(spin.color).toBe('green');
  });

  it('converte número vermelho corretamente', () => {
    const spin = dbRowToSpin({ signal: '1', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(1);
    expect(spin.color).toBe('red');
  });

  it('converte número preto corretamente', () => {
    const spin = dbRowToSpin({ signal: '2', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(2);
    expect(spin.color).toBe('black');
  });

  it('signal NaN → number 0, color green', () => {
    const spin = dbRowToSpin({ signal: 'invalid', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(0);
    expect(spin.color).toBe('green');
  });

  it('preserva campos originais (signalId, gameId, date)', () => {
    const row = { signal: '36', signalId: 'abc', gameId: 'xyz', timestamp: '2024-06-15' };
    const spin = dbRowToSpin(row);
    expect(spin.signalId).toBe('abc');
    expect(spin.gameId).toBe('xyz');
    expect(spin.date).toBe('2024-06-15');
  });
});

// ══════════════════════════════════════════════════════════════
// WHEEL — integridade
// ══════════════════════════════════════════════════════════════

describe('WHEEL (motor)', () => {
  it('contém 37 números únicos', () => {
    expect(WHEEL).toHaveLength(37);
    expect(new Set(WHEEL).size).toBe(37);
  });

  it('contém todos 0-36', () => {
    const sorted = [...WHEEL].sort((a, b) => a - b);
    for (let i = 0; i <= 36; i++) {
      expect(sorted[i]).toBe(i);
    }
  });
});
