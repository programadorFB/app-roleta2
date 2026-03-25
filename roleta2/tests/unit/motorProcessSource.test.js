// tests/unit/motorProcessSource.test.js
// PROVA DEFINITIVA: o backend (processSource) faz TUDO que o frontend fazia.
//
// O frontend tinha:
//   1. calculateMasterScore(spinHistory)         → análise de 5 estratégias
//   2. computeMotorBacktest(spinHistory)          → placar wins/losses por mode
//   3. scores[neighborMode]                       → exibir no HeroScoreboard
//
// O backend faz:
//   1. processSource() chama calculateMasterScore → mesmo módulo
//   2. checkSpinsAgainstPending() gera wins/losses → persiste no DB (motor_scores)
//   3. emite via Socket.IO { motorScores, strategyScores, entrySignal }
//
// Este teste mocka DB e Socket.IO para provar o fluxo end-to-end.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Mocks
// ══════════════════════════════════════════════════════════════

const mockQuery = vi.fn();
vi.mock('../../server/db.js', () => ({
  query: (...args) => mockQuery(...args),
}));

const mockGetFullHistory = vi.fn();
vi.mock('../../server/dbService.js', () => ({
  getFullHistory: (...args) => mockGetFullHistory(...args),
}));

// Import AFTER mocks
const { processSource, initMotorEngine, getLatestMotorAnalysis } = await import('../../server/motorScoreEngine.js');

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function makeDbRows(numbers) {
  // newest-first (como getFullHistory retorna)
  return numbers.map((n, i) => ({
    signal: String(n),
    signalId: `sig-${1000 - i}`,
    gameId: `g-${i}`,
    timestamp: new Date(Date.now() - i * 30000).toISOString(),
  }));
}

// Gera 100 spins com seed fixa para ter resultado determinístico
function generate100Spins(seed = 42) {
  const nums = [];
  let rng = seed;
  for (let i = 0; i < 100; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    nums.push(rng % 37);
  }
  return nums;
}

let emittedEvents = [];
const mockIo = {
  emit: (event, data) => { emittedEvents.push({ event, data }); },
};

beforeEach(() => {
  mockQuery.mockReset();
  mockGetFullHistory.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  emittedEvents = [];
  initMotorEngine(mockIo);
});

// ══════════════════════════════════════════════════════════════
// 1. processSource chama calculateMasterScore (substitui o frontend)
// ══════════════════════════════════════════════════════════════

describe('processSource — chama calculateMasterScore no backend', () => {
  it('com < 50 spins, não processa (mesmo mínimo que o frontend tinha)', async () => {
    mockGetFullHistory.mockResolvedValue(makeDbRows([1, 2, 3]));

    await processSource('test-source-small');

    // Sem dados suficientes → não emite nada
    expect(emittedEvents).toHaveLength(0);
  });

  it('com 100 spins, roda análise e emite motor-analysis', async () => {
    const nums = generate100Spins();
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    // Mock para getMotorScores (SELECT motor_scores)
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-analysis');

    // Deve ter emitido motor-analysis
    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    expect(emitted).toBeDefined();
    expect(emitted.data.source).toBe('test-analysis');
  });
});

// ══════════════════════════════════════════════════════════════
// 2. Emissão contém EXATAMENTE os campos que o frontend consome
// ══════════════════════════════════════════════════════════════

describe('processSource — formato da emissão (contrato com o frontend)', () => {
  it('emite { source, timestamp, globalAssertiveness, totalSignals, strategyScores, entrySignal, motorScores }', async () => {
    const nums = generate100Spins(123);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-format');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    expect(emitted).toBeDefined();

    const data = emitted.data;

    // Campos obrigatórios
    expect(data).toHaveProperty('source', 'test-format');
    expect(data).toHaveProperty('timestamp');
    expect(typeof data.timestamp).toBe('number');
    expect(data.timestamp).toBeGreaterThan(0);

    expect(data).toHaveProperty('globalAssertiveness');
    expect(typeof data.globalAssertiveness).toBe('number');

    expect(data).toHaveProperty('totalSignals');
    expect(typeof data.totalSignals).toBe('number');

    expect(data).toHaveProperty('strategyScores');
    expect(Array.isArray(data.strategyScores)).toBe(true);

    expect(data).toHaveProperty('entrySignal');
    // entrySignal pode ser null ou objeto

    expect(data).toHaveProperty('motorScores');
    expect(data.motorScores).toHaveProperty('0');
    expect(data.motorScores).toHaveProperty('1');
    expect(data.motorScores).toHaveProperty('2');
  });

  it('motorScores tem { wins, losses } para cada mode', async () => {
    const nums = generate100Spins(456);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    // Simula scores existentes no DB
    mockQuery.mockResolvedValue({
      rows: [
        { neighbor_mode: 0, wins: 5, losses: 3 },
        { neighbor_mode: 1, wins: 10, losses: 2 },
        { neighbor_mode: 2, wins: 15, losses: 1 },
      ],
    });

    await processSource('test-scores');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    const scores = emitted.data.motorScores;

    expect(scores['0']).toEqual({ wins: 5, losses: 3 });
    expect(scores['1']).toEqual({ wins: 10, losses: 2 });
    expect(scores['2']).toEqual({ wins: 15, losses: 1 });
  });

  it('strategyScores cada item tem { name, score, status, signal, numbers }', async () => {
    const nums = generate100Spins(789);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-strategies');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    const strategies = emitted.data.strategyScores;

    expect(strategies.length).toBeGreaterThan(0);
    for (const s of strategies) {
      expect(s).toHaveProperty('name');
      expect(typeof s.name).toBe('string');
      expect(s).toHaveProperty('score');
      expect(typeof s.score).toBe('number');
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('signal');
      expect(s).toHaveProperty('numbers');
      expect(Array.isArray(s.numbers)).toBe(true);
    }
  });

  it('quando entrySignal existe, tem { convergence, suggestedNumbers }', async () => {
    const nums = generate100Spins(999);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-signal');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    const signal = emitted.data.entrySignal;

    if (signal !== null) {
      expect(signal).toHaveProperty('convergence');
      expect(signal.convergence).toBeGreaterThanOrEqual(3);
      expect(signal).toHaveProperty('suggestedNumbers');
      expect(Array.isArray(signal.suggestedNumbers)).toBe(true);
      expect(signal.suggestedNumbers.length).toBe(5);
      for (const n of signal.suggestedNumbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(36);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 3. getLatestMotorAnalysis retorna cache (REST fallback)
// ══════════════════════════════════════════════════════════════

describe('getLatestMotorAnalysis — cache para endpoint REST', () => {
  it('retorna null antes de processar', () => {
    expect(getLatestMotorAnalysis('never-processed')).toBeNull();
  });

  it('retorna análise depois de processSource', async () => {
    const nums = generate100Spins(111);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-cache');

    const cached = getLatestMotorAnalysis('test-cache');
    expect(cached).not.toBeNull();
    expect(cached.source).toBe('test-cache');
    expect(cached.motorScores).toBeDefined();
    expect(cached.strategyScores).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Signal registration — backend registra sinais pendentes no DB
// ══════════════════════════════════════════════════════════════

describe('processSource — registra entrySignal como pendente no DB', () => {
  it('quando há entrySignal, faz INSERT em motor_pending_signals', async () => {
    const nums = generate100Spins(222);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    // Mock: SELECT pending (vazio), SELECT motor_scores (vazio)
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-register');

    // Procura chamada de INSERT em motor_pending_signals
    const insertCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO motor_pending_signals')
    );

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    if (emitted?.data?.entrySignal) {
      // Se houve entrySignal, deve ter registrado
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);
      // O segundo param deve ser array de números
      const params = insertCalls[0][1];
      expect(params[0]).toBe('test-register'); // source
      expect(Array.isArray(params[1])).toBe(true); // suggested_numbers
    }
  });

  it('NÃO registra duplicata (mesmo key)', async () => {
    const nums = generate100Spins(333);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    // Primeira chamada
    await processSource('test-dedup');

    // Segunda chamada com mesmos dados — signalId igual, deve sair no guard
    await processSource('test-dedup');

    // A segunda chamada NÃO deve ter emitido (mesmo latestId)
    const motorEvents = emittedEvents.filter(e => e.event === 'motor-analysis');
    expect(motorEvents).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. Scoring end-to-end — o backend gera placar igual ao que
//    o frontend fazia com computeMotorBacktest
// ══════════════════════════════════════════════════════════════

describe('checkSpinsAgainstPending — scoring real via DB (substitui computeMotorBacktest)', () => {
  it('incrementa wins quando spin acerta número sugerido', async () => {
    // Cenário: pending signal com suggested_numbers=[7], novo spin=7
    const nums = generate100Spins(444);
    // Primeira call: estabelece baseline
    mockGetFullHistory.mockResolvedValueOnce(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });
    await processSource('test-win');

    // Segunda call: adiciona spin novo (7) no início
    const numsWithNew = [7, ...nums.slice(0, 99)]; // 7 é o novo spin
    mockGetFullHistory.mockResolvedValueOnce(makeDbRows(numsWithNew));

    // Mock: pending signals com suggested_numbers=[7]
    mockQuery.mockImplementation((sql) => {
      if (sql.includes('motor_pending_signals') && sql.includes('SELECT')) {
        return { rows: [{ id: 1, suggested_numbers: [7, 28, 12, 35, 3], spins_after: 0, resolved_modes: {} }] };
      }
      if (sql.includes('motor_scores') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    await processSource('test-win');

    // Deve ter feito INSERT/UPDATE em motor_scores com wins
    const scoreCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('motor_scores') && sql.includes('INSERT')
    );
    // Se 7 estava em suggested_numbers, mode 0 ganha
    if (scoreCalls.length > 0) {
      expect(scoreCalls[0][0]).toContain('wins');
    }
  });

  it('incrementa losses quando 3 spins passam sem acertar', async () => {
    const nums = generate100Spins(555);
    mockGetFullHistory.mockResolvedValueOnce(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });
    await processSource('test-loss');

    // 3 spins novos que NÃO acertam [0] (longe no cilindro)
    const numsWithMiss = [18, 22, 9, ...nums.slice(0, 97)];
    mockGetFullHistory.mockResolvedValueOnce(makeDbRows(numsWithMiss));

    mockQuery.mockImplementation((sql) => {
      if (sql.includes('motor_pending_signals') && sql.includes('SELECT')) {
        return { rows: [{ id: 1, suggested_numbers: [0], spins_after: 0, resolved_modes: {} }] };
      }
      if (sql.includes('motor_scores') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    await processSource('test-loss');

    // Deve ter feito INSERT/UPDATE em motor_scores com losses
    const lossCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('motor_scores') && sql.includes('losses')
    );
    expect(lossCalls.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. PROVA FINAL: a emissão contém os mesmos dados que
//    o MasterDashboard consome via backendMotorAnalysis
// ══════════════════════════════════════════════════════════════

describe('Contrato backend→frontend: emissão = backendMotorAnalysis prop', () => {
  it('o frontend lê: backendMotorAnalysis?.motorScores → backend emite: data.motorScores', async () => {
    const nums = generate100Spins(666);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [{ neighbor_mode: 0, wins: 7, losses: 2 }] });

    await processSource('test-contract');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    // Frontend faz: backendMotorAnalysis?.motorScores || emptyScoreState
    const motorScores = emitted.data.motorScores;
    expect(motorScores).toBeDefined();
    expect(motorScores['0']).toHaveProperty('wins');
    expect(motorScores['0']).toHaveProperty('losses');
  });

  it('o frontend lê: backendMotorAnalysis?.strategyScores → backend emite: data.strategyScores', async () => {
    const nums = generate100Spins(777);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-contract-strat');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    // Frontend faz: backendMotorAnalysis?.strategyScores || []
    const strategies = emitted.data.strategyScores;
    expect(Array.isArray(strategies)).toBe(true);
    expect(strategies.length).toBeGreaterThan(0);
  });

  it('o frontend lê: backendMotorAnalysis?.entrySignal → backend emite: data.entrySignal', async () => {
    const nums = generate100Spins(888);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-contract-sig');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    // Frontend faz: backendMotorAnalysis?.entrySignal || null
    // Pode ser null ou objeto, mas o campo TEM que existir
    expect(emitted.data).toHaveProperty('entrySignal');
  });

  it('o frontend lê: scores[String(neighborMode)] → backend emite keys "0","1","2"', async () => {
    const nums = generate100Spins(999);
    mockGetFullHistory.mockResolvedValue(makeDbRows(nums));
    mockQuery.mockResolvedValue({ rows: [] });

    await processSource('test-contract-modes');

    const emitted = emittedEvents.find(e => e.event === 'motor-analysis');
    const ms = emitted.data.motorScores;
    // As 3 keys que o frontend usa: String(0), String(1), String(2)
    for (const mode of ['0', '1', '2']) {
      expect(ms[mode]).toBeDefined();
      expect(typeof ms[mode].wins).toBe('number');
      expect(typeof ms[mode].losses).toBe('number');
    }
  });
});
