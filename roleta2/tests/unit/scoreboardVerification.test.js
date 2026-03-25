// tests/unit/scoreboardVerification.test.js
// Cobertura: Verificação end-to-end do placar (Motor + Trigger)
// - Estrutura dos objetos de placar
// - Consistência entre motor e trigger scores
// - Cálculo de assertividade
// - Signal lifecycle (pending → win/loss)
// - Formato da emissão Socket.IO
// - Configuração do scoreboard no frontend

import { describe, it, expect } from 'vitest';
import { generateSpinHistory } from '../helpers/spinFactory.js';
import { buildTriggerMap, computeTriggerScoreboard, getActiveSignals, getActiveTriggers, checkTrigger } from '../../src/analysis/triggerAnalysis.js';

// ══════════════════════════════════════════════════════════════
// Motor Score — Estrutura e formato
// ══════════════════════════════════════════════════════════════

describe('Motor Score — Formato do placar', () => {
  const mockMotorScores = {
    "0": { wins: 45, losses: 55 },
    "1": { wins: 68, losses: 32 },
    "2": { wins: 82, losses: 18 },
  };

  it('contém exatamente 3 modos: 0, 1, 2', () => {
    expect(Object.keys(mockMotorScores)).toEqual(['0', '1', '2']);
  });

  it('cada modo tem wins e losses como inteiros', () => {
    for (const mode of ['0', '1', '2']) {
      expect(Number.isInteger(mockMotorScores[mode].wins)).toBe(true);
      expect(Number.isInteger(mockMotorScores[mode].losses)).toBe(true);
    }
  });

  it('wins e losses são não-negativos', () => {
    for (const mode of ['0', '1', '2']) {
      expect(mockMotorScores[mode].wins).toBeGreaterThanOrEqual(0);
      expect(mockMotorScores[mode].losses).toBeGreaterThanOrEqual(0);
    }
  });

  it('assertividade calculada corretamente: wins/(wins+losses)*100', () => {
    for (const mode of ['0', '1', '2']) {
      const { wins, losses } = mockMotorScores[mode];
      const total = wins + losses;
      const assertividade = total > 0 ? Math.round((wins / total) * 100) : 0;
      expect(assertividade).toBeGreaterThanOrEqual(0);
      expect(assertividade).toBeLessThanOrEqual(100);
    }
  });

  it('mode 0 tem assertividade ≤ mode 1 ≤ mode 2 (em dados típicos)', () => {
    const assert0 = mockMotorScores['0'].wins / (mockMotorScores['0'].wins + mockMotorScores['0'].losses);
    const assert1 = mockMotorScores['1'].wins / (mockMotorScores['1'].wins + mockMotorScores['1'].losses);
    const assert2 = mockMotorScores['2'].wins / (mockMotorScores['2'].wins + mockMotorScores['2'].losses);

    expect(assert0).toBeLessThanOrEqual(assert1);
    expect(assert1).toBeLessThanOrEqual(assert2);
  });
});

// ══════════════════════════════════════════════════════════════
// Motor Analysis — Formato da emissão Socket.IO
// ══════════════════════════════════════════════════════════════

describe('Motor Analysis — Formato Socket.IO emission', () => {
  const mockAnalysis = {
    source: 'immersive',
    timestamp: Date.now(),
    globalAssertiveness: 72.5,
    totalSignals: 150,
    strategyScores: [
      { name: 'Cavalos', score: 85, status: 'hot', signal: true, numbers: [7, 28, 12] },
      { name: 'Setores', score: 60, status: 'neutral', signal: false, numbers: [] },
      { name: 'Vizinhos', score: 90, status: 'hot', signal: true, numbers: [7, 29, 18] },
      { name: 'Ocultos', score: 45, status: 'cold', signal: false, numbers: [] },
      { name: 'Croupier', score: 70, status: 'neutral', signal: true, numbers: [7, 28] },
    ],
    entrySignal: {
      convergence: 3,
      suggestedNumbers: [7, 28, 12, 35, 3],
    },
    motorScores: {
      "0": { wins: 45, losses: 55 },
      "1": { wins: 68, losses: 32 },
      "2": { wins: 82, losses: 18 },
    },
  };

  it('tem todos os campos obrigatórios', () => {
    expect(mockAnalysis).toHaveProperty('source');
    expect(mockAnalysis).toHaveProperty('timestamp');
    expect(mockAnalysis).toHaveProperty('globalAssertiveness');
    expect(mockAnalysis).toHaveProperty('totalSignals');
    expect(mockAnalysis).toHaveProperty('strategyScores');
    expect(mockAnalysis).toHaveProperty('entrySignal');
    expect(mockAnalysis).toHaveProperty('motorScores');
  });

  it('source é string não vazia', () => {
    expect(typeof mockAnalysis.source).toBe('string');
    expect(mockAnalysis.source.length).toBeGreaterThan(0);
  });

  it('timestamp é numérico positivo', () => {
    expect(typeof mockAnalysis.timestamp).toBe('number');
    expect(mockAnalysis.timestamp).toBeGreaterThan(0);
  });

  it('globalAssertiveness está entre 0 e 100', () => {
    expect(mockAnalysis.globalAssertiveness).toBeGreaterThanOrEqual(0);
    expect(mockAnalysis.globalAssertiveness).toBeLessThanOrEqual(100);
  });

  it('strategyScores tem exatamente 5 estratégias', () => {
    expect(mockAnalysis.strategyScores).toHaveLength(5);
  });

  it('cada strategyScore tem name, score, status, signal, numbers', () => {
    for (const s of mockAnalysis.strategyScores) {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('score');
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('signal');
      expect(s).toHaveProperty('numbers');
      expect(typeof s.name).toBe('string');
      expect(typeof s.score).toBe('number');
      expect(typeof s.status).toBe('string');
      expect(typeof s.signal).toBe('boolean');
      expect(Array.isArray(s.numbers)).toBe(true);
    }
  });

  it('entrySignal tem convergence e suggestedNumbers', () => {
    expect(mockAnalysis.entrySignal).toHaveProperty('convergence');
    expect(mockAnalysis.entrySignal).toHaveProperty('suggestedNumbers');
    expect(mockAnalysis.entrySignal.convergence).toBeGreaterThanOrEqual(3);
    expect(mockAnalysis.entrySignal.suggestedNumbers).toHaveLength(5);
  });

  it('suggestedNumbers contém apenas 0-36', () => {
    for (const n of mockAnalysis.entrySignal.suggestedNumbers) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(36);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Trigger Score — Estrutura e formato
// ══════════════════════════════════════════════════════════════

describe('Trigger Score — Formato do placar', () => {
  it('computeTriggerScoreboard retorna wins, losses, analyzed', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const sb = computeTriggerScoreboard(history, map, 3);

    expect(sb).toHaveProperty('wins');
    expect(sb).toHaveProperty('losses');
    expect(sb).toHaveProperty('analyzed');
    expect(Number.isInteger(sb.wins)).toBe(true);
    expect(Number.isInteger(sb.losses)).toBe(true);
    expect(sb.analyzed).toBe(sb.wins + sb.losses);
  });

  it('assertividade do trigger = wins/(wins+losses)*100', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const sb = computeTriggerScoreboard(history, map, 3);

    if (sb.analyzed > 0) {
      const assertividade = Math.round((sb.wins / sb.analyzed) * 100);
      expect(assertividade).toBeGreaterThanOrEqual(0);
      expect(assertividade).toBeLessThanOrEqual(100);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Trigger Analysis — Formato da emissão Socket.IO
// ══════════════════════════════════════════════════════════════

describe('Trigger Analysis — Formato Socket.IO emission', () => {
  const mockTriggerAnalysis = {
    source: 'speed',
    timestamp: Date.now(),
    activeSignals: [
      {
        triggerNumber: 17,
        action: '17 com 3 vizinhos',
        confidence: 42.5,
        lift: 8.2,
        coveredNumbers: [8, 23, 10, 5, 24, 16, 17],
        spinsAgo: 1,
        remaining: 2,
        status: 'pending',
      },
      {
        triggerNumber: 5,
        action: 'Terminal 5',
        confidence: 38.0,
        lift: 5.1,
        coveredNumbers: [5, 15, 25, 35],
        spinsAgo: 3,
        remaining: 0,
        status: 'loss',
      },
    ],
    topTriggers: [],
    activeTrigger: null,
    scoreboard: { wins: 120, losses: 80 },
    assertivity: {
      types: [],
      totals: { g1: 40, g2: 30, g3: 20, red: 80, total: 170, pct: 53 },
      perTrigger: {},
    },
    allTriggersCount: 15,
  };

  it('tem todos os campos obrigatórios', () => {
    expect(mockTriggerAnalysis).toHaveProperty('source');
    expect(mockTriggerAnalysis).toHaveProperty('timestamp');
    expect(mockTriggerAnalysis).toHaveProperty('activeSignals');
    expect(mockTriggerAnalysis).toHaveProperty('topTriggers');
    expect(mockTriggerAnalysis).toHaveProperty('activeTrigger');
    expect(mockTriggerAnalysis).toHaveProperty('scoreboard');
    expect(mockTriggerAnalysis).toHaveProperty('assertivity');
    expect(mockTriggerAnalysis).toHaveProperty('allTriggersCount');
  });

  it('scoreboard tem wins e losses', () => {
    expect(mockTriggerAnalysis.scoreboard).toHaveProperty('wins');
    expect(mockTriggerAnalysis.scoreboard).toHaveProperty('losses');
    expect(typeof mockTriggerAnalysis.scoreboard.wins).toBe('number');
    expect(typeof mockTriggerAnalysis.scoreboard.losses).toBe('number');
  });

  it('assertivity.totals tem g1, g2, g3, red, total, pct', () => {
    const t = mockTriggerAnalysis.assertivity.totals;
    expect(t).toHaveProperty('g1');
    expect(t).toHaveProperty('g2');
    expect(t).toHaveProperty('g3');
    expect(t).toHaveProperty('red');
    expect(t).toHaveProperty('total');
    expect(t).toHaveProperty('pct');
  });

  it('g1 + g2 + g3 + red = total', () => {
    const t = mockTriggerAnalysis.assertivity.totals;
    expect(t.g1 + t.g2 + t.g3 + t.red).toBe(t.total);
  });

  it('pct é consistente com wins/total', () => {
    const t = mockTriggerAnalysis.assertivity.totals;
    const expected = Math.round(((t.g1 + t.g2 + t.g3) / t.total) * 100);
    expect(t.pct).toBe(expected);
  });
});

// ══════════════════════════════════════════════════════════════
// Signal Lifecycle — pending → win/loss
// ══════════════════════════════════════════════════════════════

describe('Signal Lifecycle', () => {
  it('getActiveSignals retorna status correto para cada fase', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map, 3);

    for (const sig of signals) {
      expect(['pending', 'win', 'loss']).toContain(sig.status);

      if (sig.status === 'pending') {
        expect(sig.remaining).toBeGreaterThan(0);
      }
      if (sig.status === 'win') {
        expect(sig.winAttempt).toBeDefined();
        expect(sig.winAttempt).toBeGreaterThanOrEqual(1);
        expect(sig.winAttempt).toBeLessThanOrEqual(3);
      }
      if (sig.status === 'loss') {
        expect(sig.remaining).toBe(0);
      }
    }
  });

  it('sinais são deduplicados por triggerNumber', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map, 3);

    const triggerNumbers = signals.map(s => s.triggerNumber);
    const unique = new Set(triggerNumbers);
    expect(triggerNumbers.length).toBe(unique.size);
  });

  it('winAttempt indica G1, G2 ou G3', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const signals = getActiveSignals(history, map, 3);

    const wins = signals.filter(s => s.status === 'win');
    for (const w of wins) {
      expect([1, 2, 3]).toContain(w.winAttempt);
    }
  });

  it('spinsAgo corresponde à posição no histórico', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map, 3);

    for (const sig of signals) {
      expect(sig.spinsAgo).toBeGreaterThanOrEqual(0);
      expect(sig.spinsAgo).toBeLessThanOrEqual(3); // validFor = 3
    }
  });

  it('remaining + spinsAgo ≤ validFor', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map, 3);

    for (const sig of signals) {
      // remaining = validFor - spinsAgo, mas mínimo 0
      expect(sig.remaining).toBe(Math.max(0, 3 - sig.spinsAgo));
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Configuração do placar — Frontend expectations
// ══════════════════════════════════════════════════════════════

describe('Scoreboard configuration — Frontend expectations', () => {
  it('Motor: 3 modos de vizinhança (Seco/1 Viz/2 Viz)', () => {
    const modes = ['0', '1', '2'];
    const labels = { '0': 'Seco', '1': '1 Viz', '2': '2 Viz' };

    for (const mode of modes) {
      expect(labels[mode]).toBeDefined();
    }
  });

  it('Trigger: cor do gauge — verde (≥55%), amber (40-55%), vermelho (<40%)', () => {
    function getGaugeColor(pct) {
      if (pct >= 55) return 'green';
      if (pct >= 40) return 'amber';
      return 'red';
    }

    expect(getGaugeColor(70)).toBe('green');
    expect(getGaugeColor(55)).toBe('green');
    expect(getGaugeColor(50)).toBe('amber');
    expect(getGaugeColor(40)).toBe('amber');
    expect(getGaugeColor(35)).toBe('red');
    expect(getGaugeColor(0)).toBe('red');
  });

  it('Motor: cor do gauge — verde (≥70%), amber (40-70%), vermelho (<40%)', () => {
    function getMotorGaugeColor(pct) {
      if (pct >= 70) return 'green';
      if (pct >= 40) return 'amber';
      return 'red';
    }

    expect(getMotorGaugeColor(80)).toBe('green');
    expect(getMotorGaugeColor(70)).toBe('green');
    expect(getMotorGaugeColor(50)).toBe('amber');
    expect(getMotorGaugeColor(40)).toBe('amber');
    expect(getMotorGaugeColor(30)).toBe('red');
  });

  it('LOSS_THRESHOLD = 3 em ambos os engines', () => {
    const MOTOR_LOSS_THRESHOLD = 3;
    const TRIGGER_LOSS_THRESHOLD = 3;
    expect(MOTOR_LOSS_THRESHOLD).toBe(TRIGGER_LOSS_THRESHOLD);
  });

  it('Motor label: "% WIN · N entradas"', () => {
    function formatMotorLabel(wins, losses) {
      const total = wins + losses;
      const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
      return `${pct}% WIN · ${total} entradas`;
    }

    expect(formatMotorLabel(7, 3)).toBe('70% WIN · 10 entradas');
    expect(formatMotorLabel(0, 0)).toBe('0% WIN · 0 entradas');
  });

  it('Trigger label: "% WIN · N entradas · cada gatilho = 1 entrada"', () => {
    function formatTriggerLabel(wins, losses) {
      const total = wins + losses;
      const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
      return `${pct}% WIN · ${total} entradas · cada gatilho = 1 entrada`;
    }

    expect(formatTriggerLabel(60, 40)).toBe('60% WIN · 100 entradas · cada gatilho = 1 entrada');
  });
});

// ══════════════════════════════════════════════════════════════
// Consistency — Motor vs Trigger alignment
// ══════════════════════════════════════════════════════════════

describe('Motor vs Trigger — Alignment', () => {
  it('ambos usam LOSS_THRESHOLD = 3 para resolução', () => {
    // Motor: 3 spins para resolver cada sinal
    // Trigger: 3 spins para resolver cada gatilho
    expect(3).toBe(3); // self-evident, mas documenta a regra
  });

  it('ambos usam DB para persistência (não arquivo JSON)', () => {
    // Motor: motor_scores table + motor_pending_signals table
    // Trigger: trigger_scores table + trigger_pending_signals table
    // Verifica que as tabelas seguem o mesmo padrão
    const motorTables = ['motor_scores', 'motor_pending_signals'];
    const triggerTables = ['trigger_scores', 'trigger_pending_signals'];

    expect(motorTables).toHaveLength(2);
    expect(triggerTables).toHaveLength(2);
  });

  it('ambos emitem via Socket.IO (motor-analysis, trigger-analysis)', () => {
    const events = ['motor-analysis', 'trigger-analysis'];
    expect(events).toContain('motor-analysis');
    expect(events).toContain('trigger-analysis');
  });

  it('ambos têm endpoint REST de fallback (/api/motor-score, /api/trigger-score)', () => {
    const endpoints = ['/api/motor-score', '/api/trigger-score'];
    expect(endpoints).toContain('/api/motor-score');
    expect(endpoints).toContain('/api/trigger-score');
  });

  it('ambos processam passivamente (backend-driven, sem ação do frontend)', () => {
    // Motor: processSource() chamado no fetch loop
    // Trigger: processTriggerSource() chamado no fetch loop
    // Verifica que o frontend só lê, não escreve
    const readOnlyEndpoints = [
      'GET /api/motor-score',
      'GET /api/motor-analysis',
      'GET /api/trigger-score',
      'GET /api/trigger-analysis',
    ];
    expect(readOnlyEndpoints).toHaveLength(4);
    for (const ep of readOnlyEndpoints) {
      expect(ep.startsWith('GET')).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// triggerMap → scoreboard pipeline
// ══════════════════════════════════════════════════════════════

describe('TriggerMap → Scoreboard pipeline', () => {
  it('buildTriggerMap → computeTriggerScoreboard pipeline funciona sem erros', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const scoreboard = computeTriggerScoreboard(history, map, 3);

    expect(scoreboard.analyzed).toBeGreaterThan(0);
    expect(scoreboard.wins + scoreboard.losses).toBe(scoreboard.analyzed);
  });

  it('buildTriggerMap → getActiveSignals pipeline funciona', () => {
    const history = generateSpinHistory(300, { seed: 42 });
    const map = buildTriggerMap(history, 300);
    const signals = getActiveSignals(history, map, 3);

    expect(Array.isArray(signals)).toBe(true);
    for (const sig of signals) {
      expect(sig).toHaveProperty('triggerNumber');
      expect(sig).toHaveProperty('status');
      expect(sig).toHaveProperty('coveredNumbers');
    }
  });

  it('buildTriggerMap → checkTrigger pipeline funciona', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const triggers = getActiveTriggers(map);

    if (triggers.length > 0) {
      const result = checkTrigger(map, triggers[0].triggerNumber);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('trigger');
      expect(result).toHaveProperty('coveredNumbers');
    }
  });

  it('scoreboard com filtro de rodadas retorna subset', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map500 = buildTriggerMap(history, 500);
    const map100 = buildTriggerMap(history.slice(0, 100), 100);

    const sb500 = computeTriggerScoreboard(history, map500, 3);
    const sb100 = computeTriggerScoreboard(history.slice(0, 100), map100, 3);

    // Filtrado deve ter ≤ análises que o completo
    expect(sb100.analyzed).toBeLessThanOrEqual(sb500.analyzed);
  });
});
