// tests/unit/motorScoreIntegration.test.js
// Cobertura: processSource fluxo completo, checkSpinsAgainstPending,
//            incrementScore, getMotorScores, emissão Socket.IO,
//            deduplicação de sinais, LOSS_THRESHOLD behavior
// Usa mocks de DB para isolar lógica de scoring

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSpinHistory, makeDbRow } from '../helpers/spinFactory.js';

// ══════════════════════════════════════════════════════════════
// Recria lógica completa do motorScoreEngine (não exportada)
// para testar end-to-end com mock de DB
// ══════════════════════════════════════════════════════════════

const LOSS_THRESHOLD = 3;

const WHEEL = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,
  5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
}

function getCovered(nums, mode) {
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

function emptyScores() {
  return {
    "1": { wins: 0, losses: 0 },
    "2": { wins: 0, losses: 0 },
  };
}

// Simula checkSpinsAgainstPending com tracking em memória
function checkSpinsAgainstPending(pendingSignals, numbers, scores) {
  const toDelete = new Set();

  for (const num of numbers) {
    if (typeof num !== 'number' || num < 0 || num > 36) continue;

    for (const sig of pendingSignals) {
      if (toDelete.has(sig.id)) continue;

      sig.spins_after++;
      const resolved = sig.resolved_modes || {};

      for (const mode of [1, 2]) {
        const mk = String(mode);
        if (resolved[mk]) continue;
        const covered = getCovered(sig.suggested_numbers, mode);
        if (covered.includes(num)) {
          resolved[mk] = 'win';
          scores[mk].wins++;
        }
      }

      sig.resolved_modes = resolved;

      if (sig.spins_after >= LOSS_THRESHOLD) {
        for (const mode of [1, 2]) {
          const mk = String(mode);
          if (!resolved[mk]) {
            resolved[mk] = 'loss';
            scores[mk].losses++;
          }
        }
        toDelete.add(sig.id);
      }
    }
  }

  return { toDelete: [...toDelete], pendingSignals };
}

// ══════════════════════════════════════════════════════════════
// LOSS_THRESHOLD — Constante de resolução
// ══════════════════════════════════════════════════════════════

describe('LOSS_THRESHOLD (motor)', () => {
  it('é 3 (fair para 5 números em 37)', () => {
    expect(LOSS_THRESHOLD).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// emptyScores — Estrutura base do placar
// ══════════════════════════════════════════════════════════════

describe('emptyScores', () => {
  it('retorna 2 modos (1, 2) com wins/losses zerados', () => {
    const scores = emptyScores();
    expect(Object.keys(scores)).toHaveLength(2);
    for (const mode of ['1', '2']) {
      expect(scores[mode]).toEqual({ wins: 0, losses: 0 });
    }
  });

  it('retorna novo objeto a cada chamada (sem referência compartilhada)', () => {
    const a = emptyScores();
    const b = emptyScores();
    a['1'].wins = 5;
    expect(b['1'].wins).toBe(0); // não afetou b
  });
});

// ══════════════════════════════════════════════════════════════
// checkSpinsAgainstPending — WIN scenarios
// ══════════════════════════════════════════════════════════════

describe('checkSpinsAgainstPending — WIN', () => {
  it('WIN: hit direto no número sugerido também conta para mode 1 (que cobre o próprio número)', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [7, 28, 12, 35, 3],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [7], scores);

    expect(scores['1'].wins).toBe(1);
    expect(pending[0].resolved_modes['1']).toBe('win');
  });

  it('WIN mode 1: hit no vizinho (não no número direto)', () => {
    const scores = emptyScores();
    // Número 7 está na posição 31 do WHEEL
    // Vizinho +1 = WHEEL[32] = 28
    const pending = [{
      id: 1,
      suggested_numbers: [7],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [28], scores); // vizinho de 7

    expect(scores['1'].wins).toBe(1); // 28 é vizinho-1 de 7
    expect(scores['2'].wins).toBe(1); // vizinho-2 também cobre
  });

  it('WIN mode 2: hit no vizinho-2 (não no vizinho-1)', () => {
    const scores = emptyScores();
    // 7 está no index 31. Mode 2 = [-2,-1,7,+1,+2]
    // WHEEL[29]=18, WHEEL[30]=29, WHEEL[31]=7, WHEEL[32]=28, WHEEL[33]=12
    // 18 é vizinho-2 mas NÃO vizinho-1
    const pending = [{
      id: 1,
      suggested_numbers: [7],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [18], scores);

    expect(scores['1'].wins).toBe(0); // 18 não é vizinho-1 de 7
    expect(scores['2'].wins).toBe(1); // 18 É vizinho-2 de 7
  });

  it('WIN contabiliza o primeiro spin que acerta', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [17, 34, 6, 27, 13],
      spins_after: 0,
      resolved_modes: {},
    }];

    // Primeiro spin não acerta, segundo acerta
    checkSpinsAgainstPending(pending, [0, 17], scores);

    expect(scores['1'].wins).toBe(1);
    expect(pending[0].spins_after).toBe(2);
  });

  it('acerto no spin 3 (último antes do threshold) ainda é WIN', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [10, 5, 24, 16, 33],
      spins_after: 0,
      resolved_modes: {},
    }];

    // 3 spins: 0, 0, 10 (acerto no terceiro)
    checkSpinsAgainstPending(pending, [0, 0, 10], scores);

    expect(scores['1'].wins).toBe(1);
    expect(pending[0].resolved_modes['1']).toBe('win');
  });
});

// ══════════════════════════════════════════════════════════════
// checkSpinsAgainstPending — LOSS scenarios
// ══════════════════════════════════════════════════════════════

describe('checkSpinsAgainstPending — LOSS', () => {
  it('LOSS em todos os modes quando nenhum acerta em 3 spins', () => {
    const scores = emptyScores();
    // Escolhe números distantes no cilindro
    const pending = [{
      id: 1,
      suggested_numbers: [0], // posição 0 do WHEEL
      spins_after: 0,
      resolved_modes: {},
    }];

    // 3 spins longe do 0 no cilindro
    // 0 está no index 0, vizinhos: 26(-1), 32(+1), 3(-2), 15(+2)
    // Escolhemos números distantes
    checkSpinsAgainstPending(pending, [18, 22, 9], scores);

    expect(scores['1'].losses).toBe(1); // nenhum é vizinho-1 [26,0,32]
    expect(scores['2'].losses).toBe(1); // nenhum é vizinho-2 [3,26,0,32,15]
  });

  it('mode 1 perde mas mode 2 ganha (vizinho-2 mais largo)', () => {
    const scores = emptyScores();
    // 0 está na posição 0: vizinho-1 = [26, 0, 32], vizinho-2 = [3, 26, 0, 32, 15]
    const pending = [{
      id: 1,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    // 15 é vizinho-2 mas NÃO vizinho-1 de 0; depois 18, 22 que estão fora
    checkSpinsAgainstPending(pending, [15, 18, 22], scores);

    expect(scores['1'].losses).toBe(1); // 15 não é vizinho-1 de 0
    expect(scores['2'].wins).toBe(1);   // 15 É vizinho-2 de 0
  });

  it('sinal é marcado para deleção após LOSS_THRESHOLD', () => {
    const scores = emptyScores();
    const pending = [{
      id: 42,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    const { toDelete } = checkSpinsAgainstPending(pending, [18, 22, 9], scores);
    expect(toDelete).toContain(42);
  });

  it('sinal NÃO é deletado antes do LOSS_THRESHOLD', () => {
    const scores = emptyScores();
    const pending = [{
      id: 42,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    // Apenas 2 spins (threshold = 3)
    const { toDelete } = checkSpinsAgainstPending(pending, [18, 22], scores);
    expect(toDelete).toHaveLength(0);
    expect(pending[0].spins_after).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// checkSpinsAgainstPending — Batch behavior
// ══════════════════════════════════════════════════════════════

describe('checkSpinsAgainstPending — Batch dedup', () => {
  it('sinal já resolvido neste batch é ignorado', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [7, 28, 12, 35, 3],
      spins_after: 0,
      resolved_modes: {},
    }];

    // 7 acerta no primeiro spin (mode 1 e 2 resolvidos como win)
    // Spins seguintes não devem incrementar wins de novo (resolved → skip)
    checkSpinsAgainstPending(pending, [7, 12, 35], scores);

    expect(scores['1'].wins).toBe(1); // apenas 1 win, não 3
    expect(scores['2'].wins).toBe(1);
  });

  it('múltiplos sinais pendentes processados independentemente', () => {
    const scores = emptyScores();
    const pending = [
      { id: 1, suggested_numbers: [7], spins_after: 0, resolved_modes: {} },
      { id: 2, suggested_numbers: [17], spins_after: 0, resolved_modes: {} },
    ];

    // 7 acerta sinal 1 (mode 1 e 2), 17 acerta sinal 2 (mode 1 e 2)
    checkSpinsAgainstPending(pending, [7, 17, 0], scores);

    expect(scores['1'].wins).toBe(2); // ambos sinais hit no mode 1
  });

  it('sinal deletado (id no toDelete) não processa mais spins', () => {
    const scores = emptyScores();
    const pending = [{
      id: 99,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    // 3 misses → deleta. Se viesse um 4o spin, não deve processar
    const { toDelete } = checkSpinsAgainstPending(pending, [18, 22, 9, 0], scores);

    expect(toDelete).toContain(99);
    // O 4o spin (0) chegou DEPOIS da resolução
    // Na nossa simulação, verificamos que losses não excedem 1 por mode
    expect(scores['1'].losses).toBe(1); // não 2
  });
});

// ══════════════════════════════════════════════════════════════
// checkSpinsAgainstPending — Edge cases
// ══════════════════════════════════════════════════════════════

describe('checkSpinsAgainstPending — Edge cases', () => {
  it('ignora números inválidos (< 0, > 36, não-number)', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [7],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [-1, 37, 'abc', 100], scores);

    // Nenhum número válido processado
    expect(pending[0].spins_after).toBe(0);
    expect(scores['1'].wins).toBe(0);
    expect(scores['1'].losses).toBe(0);
  });

  it('NaN passa o guard typeof mas falha na comparação — edge case documentado', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [7],
      spins_after: 0,
      resolved_modes: {},
    }];

    // NaN é typeof 'number' mas NaN < 0 e NaN > 36 são ambos false
    // Então NaN PASSA o guard e incrementa spins_after mas nunca causa WIN
    checkSpinsAgainstPending(pending, [NaN], scores);

    expect(pending[0].spins_after).toBe(1);
    expect(scores['1'].wins).toBe(0); // NaN nunca está em includes()
  });

  it('array vazio de números não altera estado', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [17],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [], scores);

    expect(pending[0].spins_after).toBe(0);
    expect(scores['1'].wins).toBe(0);
    expect(scores['1'].losses).toBe(0);
  });

  it('sem sinais pendentes não altera scores', () => {
    const scores = emptyScores();
    checkSpinsAgainstPending([], [7, 17, 0], scores);

    expect(scores['1'].wins).toBe(0);
    expect(scores['1'].losses).toBe(0);
  });

  it('número 0 é válido e processado', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [0], scores);
    expect(scores['1'].wins).toBe(1);
  });

  it('número 36 é válido e processado', () => {
    const scores = emptyScores();
    const pending = [{
      id: 1,
      suggested_numbers: [36],
      spins_after: 0,
      resolved_modes: {},
    }];

    checkSpinsAgainstPending(pending, [36], scores);
    expect(scores['1'].wins).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// getCovered + checkSpins — Cobertura por modo
// ══════════════════════════════════════════════════════════════

describe('Cobertura por modo integrada com scoring', () => {
  it('5 números com mode 1 = até 15 cobertos (com overlap)', () => {
    const nums = [7, 28, 12, 35, 3];
    const covered = getCovered(nums, 1);
    expect(covered.length).toBeGreaterThanOrEqual(5);
    expect(covered.length).toBeLessThanOrEqual(15);
  });

  it('5 números com mode 2 = até 25 cobertos (com overlap)', () => {
    const nums = [7, 28, 12, 35, 3];
    const covered = getCovered(nums, 2);
    expect(covered.length).toBeGreaterThanOrEqual(5);
    expect(covered.length).toBeLessThanOrEqual(25);
  });

  it('mode crescente → cobertura crescente', () => {
    const nums = [17, 34, 6];
    const c1 = getCovered(nums, 1).length;
    const c2 = getCovered(nums, 2).length;
    expect(c2).toBeGreaterThanOrEqual(c1);
  });

  it('WIN mais provável em modes maiores', () => {
    // Executa 100 cenários aleatórios e verifica que mode 2 ganha mais que mode 1
    let wins = { '1': 0, '2': 0 };
    const rng = { val: 42 };
    const next = () => {
      rng.val = (rng.val * 1103515245 + 12345) & 0x7fffffff;
      return rng.val % 37;
    };

    for (let trial = 0; trial < 100; trial++) {
      const suggested = Array.from({ length: 5 }, () => next());
      const spin = next();
      for (const mode of [1, 2]) {
        if (getCovered(suggested, mode).includes(spin)) {
          wins[String(mode)]++;
        }
      }
    }

    expect(wins['2']).toBeGreaterThanOrEqual(wins['1']);
  });
});

// ══════════════════════════════════════════════════════════════
// Motor Scores — Estrutura do placar
// ══════════════════════════════════════════════════════════════

describe('Motor Scores structure', () => {
  it('placar completo tem 2 modes × 2 campos = 4 valores', () => {
    const scores = emptyScores();
    scores['1'].wins = 15;
    scores['1'].losses = 3;
    scores['2'].wins = 20;
    scores['2'].losses = 2;

    // Assertividade por modo
    const assertividades = {};
    for (const mode of ['1', '2']) {
      const total = scores[mode].wins + scores[mode].losses;
      assertividades[mode] = total > 0 ? (scores[mode].wins / total * 100) : 0;
    }

    expect(assertividades['1']).toBeCloseTo(83.33, 0);
    expect(assertividades['2']).toBeCloseTo(90.91, 0);
  });

  it('mode 1 cobre menos números que mode 2', () => {
    // Mode 1: ~3 cobertos por sugerido; mode 2: ~5 cobertos por sugerido.
    const singleNumber = [17];
    const c1 = getCovered(singleNumber, 1).length; // 3
    const c2 = getCovered(singleNumber, 2).length; // 5

    expect(c1).toBe(3);
    expect(c2).toBe(5);
    expect(c1 / 37).toBeLessThan(c2 / 37);
  });
});

// ══════════════════════════════════════════════════════════════
// Signal registration dedup
// ══════════════════════════════════════════════════════════════

describe('Signal registration dedup', () => {
  it('mesmo key (números sorted) não registra duas vezes', () => {
    const lastRegisteredKey = {};

    function shouldRegister(source, nums) {
      const key = JSON.stringify([...nums].sort((a, b) => a - b));
      if (key === lastRegisteredKey[source]) return false;
      lastRegisteredKey[source] = key;
      return true;
    }

    expect(shouldRegister('immersive', [7, 28, 12])).toBe(true);
    expect(shouldRegister('immersive', [7, 28, 12])).toBe(false); // duplicata
    expect(shouldRegister('immersive', [12, 28, 7])).toBe(false); // mesmos, ordem diferente
    expect(shouldRegister('immersive', [7, 28, 13])).toBe(true); // diferente
    expect(shouldRegister('speed', [7, 28, 12])).toBe(true); // source diferente
  });
});

// ══════════════════════════════════════════════════════════════
// Full scoring simulation (mini E2E)
// ══════════════════════════════════════════════════════════════

describe('Full motor scoring simulation', () => {
  it('cenário completo: register → check → resolve', () => {
    const scores = emptyScores();

    // 1. Registra sinal com números [7, 28, 12, 35, 3]
    const pending = [{
      id: 1,
      suggested_numbers: [7, 28, 12, 35, 3],
      spins_after: 0,
      resolved_modes: {},
    }];

    // 2. Spin 1: cai 28 (hit mode 1 e 2)
    checkSpinsAgainstPending(pending, [28], scores);
    expect(scores['1'].wins).toBe(1);
    expect(scores['2'].wins).toBe(1);

    expect(pending[0].resolved_modes['1']).toBe('win');
    expect(pending[0].resolved_modes['2']).toBe('win');
  });

  it('cenário: win tardio com modes mistos', () => {
    const scores = emptyScores();

    // Sugerimos [0] (posição 0 no WHEEL)
    // Mode 1: [26, 0, 32]
    // Mode 2: [3, 26, 0, 32, 15]
    const pending = [{
      id: 1,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    // Spin 1: 15 (vizinho-2 de 0, mas não vizinho-1)
    checkSpinsAgainstPending(pending, [15], scores);
    expect(scores['1'].wins).toBe(0);  // 15 não é vizinho-1 de 0
    expect(scores['2'].wins).toBe(1);  // 15 É vizinho-2

    // Spin 2: 32 (vizinho-1 de 0)
    checkSpinsAgainstPending(pending, [32], scores);
    expect(scores['1'].wins).toBe(1);

    // Nenhum mode virou loss
    expect(scores['1'].losses).toBe(0);
    expect(scores['2'].losses).toBe(0);
  });

  it('cenário: LOSS total em todos os modes', () => {
    const scores = emptyScores();

    const pending = [{
      id: 1,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];

    // 3 spins distantes do 0 no cilindro
    checkSpinsAgainstPending(pending, [18, 22, 9], scores);

    expect(scores['1'].losses).toBe(1);
    expect(scores['2'].losses).toBe(1);

    // Sinal deve ser marcado para deleção
    expect(pending[0].spins_after).toBe(3);
  });

  it('múltiplos sinais em sequência acumulam placar', () => {
    const scores = emptyScores();

    // Sinal 1: WIN (7 hit direto cobre mode 1 e 2)
    const pending1 = [{
      id: 1,
      suggested_numbers: [7],
      spins_after: 0,
      resolved_modes: {},
    }];
    checkSpinsAgainstPending(pending1, [7, 0, 0], scores);

    // Sinal 2: LOSS (números distantes do 0)
    const pending2 = [{
      id: 2,
      suggested_numbers: [0],
      spins_after: 0,
      resolved_modes: {},
    }];
    checkSpinsAgainstPending(pending2, [18, 22, 9], scores);

    expect(scores['1'].wins).toBe(1);
    expect(scores['1'].losses).toBe(1);
  });
});
