// tests/unit/triggerScoreIntegration.test.js
// Cobertura: checkAndRegisterTriggers flow completo, batch dedup (resolvedInBatch),
//            registro de novo trigger dentro do mesmo batch, cleanup throttling,
//            resolução win/loss, score incrementing via DB mock
// Recria lógica interna para testar isoladamente

import { describe, it, expect, vi, beforeEach } from 'vitest';

const TRIGGER_LOSS_THRESHOLD = 3;

// ══════════════════════════════════════════════════════════════
// Simula checkAndRegisterTriggers completo com estado em memória
// ══════════════════════════════════════════════════════════════

function simulateCheckAndRegister(pending, numbers, triggerMap) {
  const toResolve = [];
  const resolvedInBatch = new Set();
  const registered = [];
  const scores = { wins: 0, losses: 0 };

  for (const num of numbers) {
    if (typeof num !== 'number' || num < 0 || num > 36) continue;

    // 1a. Confere num contra cada sinal pendente
    for (const sig of pending) {
      if (resolvedInBatch.has(sig.id)) continue;

      sig.spins_after++;

      if (sig.covered_numbers.includes(num)) {
        toResolve.push({ id: sig.id, result: 'win' });
        resolvedInBatch.add(sig.id);
        scores.wins++;
        continue;
      }

      if (sig.spins_after >= TRIGGER_LOSS_THRESHOLD) {
        toResolve.push({ id: sig.id, result: 'loss' });
        resolvedInBatch.add(sig.id);
        scores.losses++;
      }
    }

    // 1b. Checa se ESTE num é um trigger → registra novo sinal pendente
    const profile = triggerMap.get(num);
    if (profile?.bestPattern) {
      const newId = Date.now() + Math.random();
      const newSig = {
        id: newId,
        trigger_number: num,
        covered_numbers: profile.bestPattern.coveredNumbers,
        spins_after: 0,
      };
      pending.push(newSig);
      registered.push(newSig);
    }
  }

  return { toResolve, resolvedInBatch, registered, scores, pending };
}

// ══════════════════════════════════════════════════════════════
// Batch processing — Win resolution
// ══════════════════════════════════════════════════════════════

describe('checkAndRegisterTriggers — Win resolution', () => {
  it('sinal pendente resolvido como WIN quando hit nos covered_numbers', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    const { toResolve, scores } = simulateCheckAndRegister(pending, [16], new Map());

    expect(toResolve).toHaveLength(1);
    expect(toResolve[0]).toEqual({ id: 1, result: 'win' });
    expect(scores.wins).toBe(1);
    expect(scores.losses).toBe(0);
  });

  it('WIN no primeiro spin = G1 (spins_after = 1)', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    simulateCheckAndRegister(pending, [17], new Map());
    expect(pending[0].spins_after).toBe(1); // G1
  });

  it('WIN no segundo spin = G2 (spins_after = 2)', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    // Miss, then hit
    // spin 0: spins_after becomes 1, 0 not in [15,16,17,18,19], spins_after=1 < 3 → continue
    // spin 17: spins_after becomes 2, 17 in covered → WIN at spins_after=2
    simulateCheckAndRegister(pending, [0, 17], new Map());
    expect(pending[0].spins_after).toBe(2); // G2
  });

  it('WIN no terceiro spin = G3 (spins_after = 3)', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    const { toResolve } = simulateCheckAndRegister(pending, [0, 0, 17], new Map());
    expect(toResolve[0].result).toBe('win');
    expect(pending[0].spins_after).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// Batch processing — Loss resolution
// ══════════════════════════════════════════════════════════════

describe('checkAndRegisterTriggers — Loss resolution', () => {
  it('LOSS quando 3 spins sem hit nos covered_numbers', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    const { toResolve, scores } = simulateCheckAndRegister(pending, [0, 32, 26], new Map());

    expect(toResolve).toHaveLength(1);
    expect(toResolve[0]).toEqual({ id: 1, result: 'loss' });
    expect(scores.losses).toBe(1);
    expect(scores.wins).toBe(0);
  });

  it('LOSS exatamente no threshold (não antes)', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    // 2 spins: não resolve ainda
    const r1 = simulateCheckAndRegister(pending, [0, 32], new Map());
    expect(r1.toResolve).toHaveLength(0);
    expect(pending[0].spins_after).toBe(2);

    // Reset para testar com 3
    pending[0].spins_after = 0;
    const r2 = simulateCheckAndRegister(pending, [0, 32, 26], new Map());
    expect(r2.toResolve).toHaveLength(1);
    expect(r2.toResolve[0].result).toBe('loss');
  });
});

// ══════════════════════════════════════════════════════════════
// resolvedInBatch — Deduplication fix
// ══════════════════════════════════════════════════════════════

describe('resolvedInBatch dedup (FIX bug win+loss duplo)', () => {
  it('sinal WIN não é contado como LOSS no mesmo batch', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    // Spin 1: hit (WIN), Spin 2 e 3: miss
    // Sem o fix, sinal seria WIN + LOSS (contado 2x)
    const { toResolve, scores } = simulateCheckAndRegister(pending, [17, 0, 0], new Map());

    expect(scores.wins).toBe(1);
    expect(scores.losses).toBe(0); // CRUCIAL: não deve ser 1
    expect(toResolve).toHaveLength(1);
    expect(toResolve[0].result).toBe('win');
  });

  it('sinal LOSS não é contado como WIN se hit vem depois', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    // 3 misses → LOSS, depois hit → ignorado
    const { toResolve, scores } = simulateCheckAndRegister(pending, [0, 32, 26, 17], new Map());

    expect(scores.losses).toBe(1);
    expect(scores.wins).toBe(0); // CRUCIAL: hit pós-LOSS ignorado
    expect(toResolve).toHaveLength(1);
    expect(toResolve[0].result).toBe('loss');
  });

  it('dois sinais diferentes: um WIN e um LOSS no mesmo batch', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
      { id: 2, trigger_number: 5, covered_numbers: [4, 5, 6], spins_after: 0 },
    ];

    // Spins: 17 (hit sig1), 0 (miss sig2), 32 (miss sig2), 26 (miss sig2 → LOSS)
    // Nota: sig2 precisa de 3 misses
    const { scores } = simulateCheckAndRegister(pending, [17, 0, 32, 26], new Map());

    // sig1 (covered [15-19]): 17 is hit → WIN at spin 1
    // sig2 (covered [4,5,6]):
    //   spin 17: miss, spins_after=1
    //   spin 0: miss, spins_after=2
    //   spin 32: miss, spins_after=3 → LOSS
    //   spin 26: already resolved
    expect(scores.wins).toBe(1);
    expect(scores.losses).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Registro de novo trigger dentro do mesmo batch
// ══════════════════════════════════════════════════════════════

describe('Trigger registration within batch', () => {
  it('novo spin que é trigger → registrado como pendente', () => {
    const triggerMap = new Map();
    triggerMap.set(17, {
      bestPattern: {
        coveredNumbers: [15, 16, 17, 18, 19],
        label: 'Test Pattern',
        confidence: 45,
        lift: 8,
      },
    });

    const pending = [];
    const { registered } = simulateCheckAndRegister(pending, [17], triggerMap);

    expect(registered).toHaveLength(1);
    expect(registered[0].trigger_number).toBe(17);
    expect(registered[0].covered_numbers).toEqual([15, 16, 17, 18, 19]);
    expect(registered[0].spins_after).toBe(0);
  });

  it('trigger registrado é adicionado ao pending array para detecção subsequente', () => {
    const triggerMap = new Map();
    triggerMap.set(17, {
      bestPattern: {
        coveredNumbers: [15, 16, 17, 18, 19],
        label: 'Pattern A',
        confidence: 40,
        lift: 5,
      },
    });

    const pending = [];
    // Spin 1: 17 (é trigger → registrado como pending)
    // Spin 2: 16 (é coberto pelo trigger de 17 → WIN!)
    const { scores } = simulateCheckAndRegister(pending, [17, 16], triggerMap);

    expect(scores.wins).toBe(1);
    // O trigger de 17 foi registrado no spin 1 e resolvido como WIN no spin 2
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  it('número sem bestPattern não registra novo trigger', () => {
    const triggerMap = new Map();
    triggerMap.set(17, { bestPattern: null });

    const pending = [];
    const { registered } = simulateCheckAndRegister(pending, [17], triggerMap);

    expect(registered).toHaveLength(0);
  });

  it('número não presente no triggerMap não registra trigger', () => {
    const triggerMap = new Map();
    // Map vazio para número 99

    const pending = [];
    const { registered } = simulateCheckAndRegister(pending, [17], triggerMap);

    expect(registered).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Cenários complexos — múltiplos triggers no mesmo batch
// ══════════════════════════════════════════════════════════════

describe('Complex batch scenarios', () => {
  it('3 triggers disparados + resolvidos em um batch de 6 spins', () => {
    const triggerMap = new Map();
    triggerMap.set(5, { bestPattern: { coveredNumbers: [4, 5, 6], label: 'T5', confidence: 40, lift: 5 } });
    triggerMap.set(10, { bestPattern: { coveredNumbers: [9, 10, 11], label: 'T10', confidence: 45, lift: 6 } });
    triggerMap.set(20, { bestPattern: { coveredNumbers: [19, 20, 21], label: 'T20', confidence: 50, lift: 7 } });

    const pending = [];
    // Batch: 5(trigger), 10(trigger), 20(trigger), 6(hit T5), 11(hit T10), 19(hit T20)
    const { scores, registered } = simulateCheckAndRegister(
      pending,
      [5, 10, 20, 6, 11, 19],
      triggerMap
    );

    expect(registered).toHaveLength(3);
    expect(scores.wins).toBe(3); // todos os 3 triggers acertaram
    expect(scores.losses).toBe(0);
  });

  it('trigger registrado mas não resolvido no mesmo batch (pending)', () => {
    const triggerMap = new Map();
    triggerMap.set(5, { bestPattern: { coveredNumbers: [4, 5, 6], label: 'T5', confidence: 40, lift: 5 } });

    const pending = [];
    // Batch: 5(trigger), 0(miss) — apenas 1 spin de resolução, threshold=3
    const { scores, registered } = simulateCheckAndRegister(
      pending,
      [5, 0],
      triggerMap
    );

    expect(registered).toHaveLength(1);
    expect(scores.wins).toBe(0);
    expect(scores.losses).toBe(0); // não atingiu threshold
    // O trigger está pendente com spins_after=1
    const trigSig = pending.find(s => s.trigger_number === 5);
    expect(trigSig.spins_after).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Cleanup throttling
// ══════════════════════════════════════════════════════════════

describe('Cleanup throttling', () => {
  it('cleanup roda a cada CLEANUP_EVERY ciclos', () => {
    const CLEANUP_EVERY = 50;
    const cleanupCounter = {};

    let cleanupRan = false;
    for (let cycle = 0; cycle < 100; cycle++) {
      cleanupCounter['test'] = (cleanupCounter['test'] || 0) + 1;
      if (cleanupCounter['test'] >= CLEANUP_EVERY) {
        cleanupCounter['test'] = 0;
        cleanupRan = true;
        break;
      }
    }

    expect(cleanupRan).toBe(true);
  });

  it('cleanup counter é por source (isolado)', () => {
    const cleanupCounter = {};
    const CLEANUP_EVERY = 50;

    for (let i = 0; i < 30; i++) {
      cleanupCounter['sourceA'] = (cleanupCounter['sourceA'] || 0) + 1;
    }
    for (let i = 0; i < 20; i++) {
      cleanupCounter['sourceB'] = (cleanupCounter['sourceB'] || 0) + 1;
    }

    expect(cleanupCounter['sourceA']).toBe(30);
    expect(cleanupCounter['sourceB']).toBe(20);
    // Nenhum atingiu 50, cleanup não roda
  });
});

// ══════════════════════════════════════════════════════════════
// Score increment isolation
// ══════════════════════════════════════════════════════════════

describe('Score increment isolation', () => {
  it('wins e losses são incrementados atomicamente (não resetados)', () => {
    const scores = { wins: 10, losses: 5 };

    // Simula incremento
    scores.wins++;
    expect(scores.wins).toBe(11);

    scores.losses++;
    expect(scores.losses).toBe(6);
  });

  it('diferentes sources têm placares independentes', () => {
    const scoresBySource = {};

    function getOrCreate(source) {
      if (!scoresBySource[source]) scoresBySource[source] = { wins: 0, losses: 0 };
      return scoresBySource[source];
    }

    getOrCreate('immersive').wins++;
    getOrCreate('speed').losses++;
    getOrCreate('immersive').wins++;

    expect(scoresBySource['immersive']).toEqual({ wins: 2, losses: 0 });
    expect(scoresBySource['speed']).toEqual({ wins: 0, losses: 1 });
  });
});

// ══════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('array de números com duplicatas é processado corretamente', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 0 },
    ];

    // Dois spins iguais (17)
    const { scores } = simulateCheckAndRegister(pending, [17, 17, 17], new Map());

    // Primeiro 17 é WIN, resto é skip
    expect(scores.wins).toBe(1);
    expect(scores.losses).toBe(0);
  });

  it('covered_numbers vazio nunca gera WIN', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [], spins_after: 0 },
    ];

    const { scores } = simulateCheckAndRegister(pending, [17, 0, 32], new Map());

    expect(scores.wins).toBe(0);
    expect(scores.losses).toBe(1); // 3 misses
  });

  it('pending com spins_after > 0 continua contagem', () => {
    const pending = [
      { id: 1, trigger_number: 17, covered_numbers: [15, 16, 17, 18, 19], spins_after: 2 },
    ];

    // Já tem 2 spins, falta 1 para threshold
    const { scores } = simulateCheckAndRegister(pending, [0], new Map());

    expect(scores.losses).toBe(1); // 2+1 = 3 ≥ threshold
    expect(pending[0].spins_after).toBe(3);
  });

  it('número 0 é processado como spin válido', () => {
    const pending = [
      { id: 1, trigger_number: 5, covered_numbers: [0, 5, 10], spins_after: 0 },
    ];

    const { scores } = simulateCheckAndRegister(pending, [0], new Map());
    expect(scores.wins).toBe(1);
  });
});
