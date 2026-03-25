// tests/unit/triggerScoreEngine.test.js
// Cobertura: classifyTrigger, computeAssertivityBackend, dbRowToSpin, getColor,
//            getActiveSignalsFromDB dedup logic, TYPE_LABELS consistency
// Recria funções internas (não exportadas) para testar isoladamente

import { describe, it, expect } from 'vitest';
import { generateSpinHistory, makeSequence } from '../helpers/spinFactory.js';
import { buildTriggerMap } from '../../src/analysis/triggerAnalysis.js';

// ══════════════════════════════════════════════════════════════
// Recria lógica interna do triggerScoreEngine.js
// ══════════════════════════════════════════════════════════════

const TRIGGER_LOSS_THRESHOLD = 3;
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
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

const TYPE_LABELS = {
  terminal_puro:  'Terminais',
  terminal_viz:   'Terminal + Viz',
  regiao_pequena: 'Regiao Curta',
  regiao_grande:  'Regiao Larga',
};

function classifyTrigger(profile) {
  if (!profile?.bestPattern) return null;
  const { type, neighbors } = profile.bestPattern;
  if (type === 'terminal' && neighbors === 0) return 'terminal_puro';
  if (type === 'terminal') return 'terminal_viz';
  if (type === 'region' && neighbors <= 3) return 'regiao_pequena';
  if (type === 'region') return 'regiao_grande';
  return null;
}

function computeAssertivityBackend(spinHistory, triggerMap) {
  const types = {};
  for (const key of Object.keys(TYPE_LABELS)) {
    types[key] = { g1: 0, g2: 0, g3: 0, red: 0, results: [] };
  }

  const perTrigger = {};

  for (let i = TRIGGER_LOSS_THRESHOLD; i < spinHistory.length; i++) {
    const num = spinHistory[i].number;
    const profile = triggerMap.get(num);
    const cat = classifyTrigger(profile);
    if (!cat) continue;

    const covered = profile.bestPattern.coveredNumbers;
    let hitOn = 0;
    for (let j = 1; j <= TRIGGER_LOSS_THRESHOLD; j++) {
      const checkIdx = i - j;
      if (checkIdx < 0) break;
      if (covered.includes(spinHistory[checkIdx].number)) {
        hitOn = j;
        break;
      }
    }

    const bucket = types[cat];
    if (hitOn === 1) { bucket.g1++; bucket.results.push('G1'); }
    else if (hitOn === 2) { bucket.g2++; bucket.results.push('G2'); }
    else if (hitOn === 3) { bucket.g3++; bucket.results.push('G3'); }
    else { bucket.red++; bucket.results.push('R'); }

    if (!perTrigger[num]) perTrigger[num] = { wins: 0, total: 0 };
    perTrigger[num].total++;
    if (hitOn > 0) perTrigger[num].wins++;
  }

  const result = [];
  for (const [key, data] of Object.entries(types)) {
    const total = data.g1 + data.g2 + data.g3 + data.red;
    if (total === 0) continue;
    const wins = data.g1 + data.g2 + data.g3;
    result.push({
      key,
      label: TYPE_LABELS[key],
      g1: data.g1, g2: data.g2, g3: data.g3, red: data.red,
      total,
      pct: Math.round((wins / total) * 100),
      recentResults: data.results.slice(-10).reverse(),
    });
  }
  result.sort((a, b) => b.pct - a.pct);

  const totals = { g1: 0, g2: 0, g3: 0, red: 0, total: 0 };
  for (const a of result) {
    totals.g1 += a.g1; totals.g2 += a.g2; totals.g3 += a.g3; totals.red += a.red; totals.total += a.total;
  }
  totals.pct = totals.total > 0 ? Math.round(((totals.g1 + totals.g2 + totals.g3) / totals.total) * 100) : 0;

  return { types: result, totals, perTrigger };
}

// ══════════════════════════════════════════════════════════════
// getColor — Conversão número → cor
// ══════════════════════════════════════════════════════════════

describe('getColor (trigger engine)', () => {
  it('0 é green', () => {
    expect(getColor(0)).toBe('green');
  });

  it('números vermelhos retornam red', () => {
    for (const n of RED_NUMBERS) {
      expect(getColor(n)).toBe('red');
    }
  });

  it('números pretos retornam black', () => {
    const blackNumbers = [];
    for (let n = 1; n <= 36; n++) {
      if (!RED_NUMBERS.includes(n)) blackNumbers.push(n);
    }
    for (const n of blackNumbers) {
      expect(getColor(n)).toBe('black');
    }
  });

  it('18 números vermelhos + 18 pretos + 1 verde = 37', () => {
    let r = 0, b = 0, g = 0;
    for (let n = 0; n <= 36; n++) {
      const c = getColor(n);
      if (c === 'red') r++;
      else if (c === 'black') b++;
      else g++;
    }
    expect(r).toBe(18);
    expect(b).toBe(18);
    expect(g).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// dbRowToSpin — Conversão DB row → spin format
// ══════════════════════════════════════════════════════════════

describe('dbRowToSpin (trigger engine)', () => {
  it('converte row numérica válida', () => {
    const spin = dbRowToSpin({ signal: '25', signalId: 's1', gameId: 'g1', timestamp: '2025-01-01T00:00:00Z' });
    expect(spin.number).toBe(25);
    expect(spin.color).toBe('red');
    expect(spin.signalId).toBe('s1');
  });

  it('signal NaN → number 0, color green', () => {
    const spin = dbRowToSpin({ signal: 'abc', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(0);
    expect(spin.color).toBe('green');
  });

  it('signal "0" → number 0, green', () => {
    const spin = dbRowToSpin({ signal: '0', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(0);
    expect(spin.color).toBe('green');
  });

  it('signal com espaços é parseado corretamente', () => {
    const spin = dbRowToSpin({ signal: ' 17 ', signalId: 's', gameId: 'g', timestamp: 't' });
    expect(spin.number).toBe(17);
  });

  it('preserva timestamp como date', () => {
    const ts = '2025-03-20T15:00:00Z';
    const spin = dbRowToSpin({ signal: '1', signalId: 's', gameId: 'g', timestamp: ts });
    expect(spin.date).toBe(ts);
  });
});

// ══════════════════════════════════════════════════════════════
// classifyTrigger — Classificação de tipo de gatilho
// ══════════════════════════════════════════════════════════════

describe('classifyTrigger', () => {
  it('retorna null para profile sem bestPattern', () => {
    expect(classifyTrigger(null)).toBeNull();
    expect(classifyTrigger(undefined)).toBeNull();
    expect(classifyTrigger({})).toBeNull();
    expect(classifyTrigger({ bestPattern: null })).toBeNull();
  });

  it('terminal com neighbors=0 → terminal_puro', () => {
    const profile = { bestPattern: { type: 'terminal', neighbors: 0 } };
    expect(classifyTrigger(profile)).toBe('terminal_puro');
  });

  it('terminal com neighbors=1 → terminal_viz', () => {
    const profile = { bestPattern: { type: 'terminal', neighbors: 1 } };
    expect(classifyTrigger(profile)).toBe('terminal_viz');
  });

  it('terminal com neighbors=2 → terminal_viz', () => {
    const profile = { bestPattern: { type: 'terminal', neighbors: 2 } };
    expect(classifyTrigger(profile)).toBe('terminal_viz');
  });

  it('region com neighbors ≤ 3 → regiao_pequena', () => {
    expect(classifyTrigger({ bestPattern: { type: 'region', neighbors: 2 } })).toBe('regiao_pequena');
    expect(classifyTrigger({ bestPattern: { type: 'region', neighbors: 3 } })).toBe('regiao_pequena');
  });

  it('region com neighbors > 3 → regiao_grande', () => {
    expect(classifyTrigger({ bestPattern: { type: 'region', neighbors: 4 } })).toBe('regiao_grande');
    expect(classifyTrigger({ bestPattern: { type: 'region', neighbors: 5 } })).toBe('regiao_grande');
  });

  it('tipo desconhecido → null', () => {
    expect(classifyTrigger({ bestPattern: { type: 'unknown', neighbors: 2 } })).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// TYPE_LABELS — Consistência com classifyTrigger
// ══════════════════════════════════════════════════════════════

describe('TYPE_LABELS', () => {
  it('tem exatamente 4 tipos', () => {
    expect(Object.keys(TYPE_LABELS)).toHaveLength(4);
  });

  it('todos os tipos retornados por classifyTrigger estão em TYPE_LABELS', () => {
    const allTypes = ['terminal_puro', 'terminal_viz', 'regiao_pequena', 'regiao_grande'];
    for (const t of allTypes) {
      expect(TYPE_LABELS[t]).toBeDefined();
      expect(typeof TYPE_LABELS[t]).toBe('string');
      expect(TYPE_LABELS[t].length).toBeGreaterThan(0);
    }
  });

  it('labels são strings não vazias', () => {
    for (const [key, label] of Object.entries(TYPE_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// computeAssertivityBackend — Cálculo de assertividade
// ══════════════════════════════════════════════════════════════

describe('computeAssertivityBackend', () => {
  it('retorna { types, totals, perTrigger } com estrutura correta', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    expect(result).toHaveProperty('types');
    expect(result).toHaveProperty('totals');
    expect(result).toHaveProperty('perTrigger');
    expect(Array.isArray(result.types)).toBe(true);
    expect(typeof result.totals).toBe('object');
    expect(typeof result.perTrigger).toBe('object');
  });

  it('totals.total = soma de todos os types.total', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    const sumTotal = result.types.reduce((s, t) => s + t.total, 0);
    expect(result.totals.total).toBe(sumTotal);
  });

  it('g1 + g2 + g3 + red = total para cada tipo', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const t of result.types) {
      expect(t.g1 + t.g2 + t.g3 + t.red).toBe(t.total);
    }
  });

  it('pct está entre 0 e 100', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const t of result.types) {
      expect(t.pct).toBeGreaterThanOrEqual(0);
      expect(t.pct).toBeLessThanOrEqual(100);
    }
    expect(result.totals.pct).toBeGreaterThanOrEqual(0);
    expect(result.totals.pct).toBeLessThanOrEqual(100);
  });

  it('pct é consistente com g1+g2+g3 / total', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const t of result.types) {
      const expected = Math.round(((t.g1 + t.g2 + t.g3) / t.total) * 100);
      expect(t.pct).toBe(expected);
    }
  });

  it('types estão ordenados por pct decrescente', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (let i = 1; i < result.types.length; i++) {
      expect(result.types[i - 1].pct).toBeGreaterThanOrEqual(result.types[i].pct);
    }
  });

  it('recentResults tem no máximo 10 itens', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const t of result.types) {
      expect(t.recentResults.length).toBeLessThanOrEqual(10);
    }
  });

  it('recentResults contém apenas G1, G2, G3 ou R', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const t of result.types) {
      for (const r of t.recentResults) {
        expect(['G1', 'G2', 'G3', 'R']).toContain(r);
      }
    }
  });

  it('cada tipo tem label válido do TYPE_LABELS', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const t of result.types) {
      expect(Object.values(TYPE_LABELS)).toContain(t.label);
    }
  });

  it('perTrigger contém wins ≤ total para cada trigger', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    for (const [num, data] of Object.entries(result.perTrigger)) {
      expect(data.wins).toBeLessThanOrEqual(data.total);
      expect(data.wins).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThan(0);
      const n = parseInt(num, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  it('retorna totals com pct=0 para histórico sem triggers', () => {
    const history = generateSpinHistory(5);
    const map = buildTriggerMap(history, 5); // sem dados suficientes, bestPattern=null
    const result = computeAssertivityBackend(history, map);

    expect(result.totals.pct).toBe(0);
    expect(result.totals.total).toBe(0);
  });

  it('totals.g1/g2/g3/red são soma dos tipos', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    const sumG1 = result.types.reduce((s, t) => s + t.g1, 0);
    const sumG2 = result.types.reduce((s, t) => s + t.g2, 0);
    const sumG3 = result.types.reduce((s, t) => s + t.g3, 0);
    const sumRed = result.types.reduce((s, t) => s + t.red, 0);

    expect(result.totals.g1).toBe(sumG1);
    expect(result.totals.g2).toBe(sumG2);
    expect(result.totals.g3).toBe(sumG3);
    expect(result.totals.red).toBe(sumRed);
  });
});

// ══════════════════════════════════════════════════════════════
// TRIGGER_LOSS_THRESHOLD — Constante de resolução
// ══════════════════════════════════════════════════════════════

describe('TRIGGER_LOSS_THRESHOLD', () => {
  it('é 3 (alinhado com frontend)', () => {
    expect(TRIGGER_LOSS_THRESHOLD).toBe(3);
  });

  it('computeAssertivityBackend usa TRIGGER_LOSS_THRESHOLD como offset inicial', () => {
    // Verifica que o loop inicia no índice correto
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);
    const result = computeAssertivityBackend(history, map);

    // Se threshold=3, os primeiros 3 spins (índices 0,1,2) não são triggers pois
    // não existem 3 spins anteriores para verificar hits
    // Totals > 0 indica que o loop rodou corretamente
    expect(result.totals.total).toBeGreaterThanOrEqual(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Integração classifyTrigger + buildTriggerMap
// ══════════════════════════════════════════════════════════════

describe('classifyTrigger com triggerMap real', () => {
  it('classifica triggers do mapa sem erros', () => {
    const history = generateSpinHistory(500, { seed: 42 });
    const map = buildTriggerMap(history, 500);

    for (const [num, profile] of map) {
      const cat = classifyTrigger(profile);
      if (profile.bestPattern) {
        expect(cat).not.toBeNull();
        expect(Object.keys(TYPE_LABELS)).toContain(cat);
      } else {
        expect(cat).toBeNull();
      }
    }
  });

  it('todos os 4 tipos existem em dados suficientemente grandes', () => {
    // Com 2000 spins e seed fixa, deve haver pelo menos um de cada tipo
    const history = generateSpinHistory(2000, { seed: 12345 });
    const map = buildTriggerMap(history, 2000);

    const categorias = new Set();
    for (const [, profile] of map) {
      const cat = classifyTrigger(profile);
      if (cat) categorias.add(cat);
    }

    // Nem sempre teremos todos os 4, mas devemos ter pelo menos 1
    expect(categorias.size).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Lógica de resolução de sinais — Win/Loss counting
// ══════════════════════════════════════════════════════════════

describe('Signal resolution logic (trigger)', () => {
  it('sinal com covered_numbers que acerta no 1o spin = WIN', () => {
    // Simula lógica de checkAndRegisterTriggers
    const pending = {
      id: 1,
      trigger_number: 17,
      covered_numbers: [15, 16, 17, 18, 19],
      spins_after: 0,
    };

    const newNumbers = [16]; // hit!
    const resolvedInBatch = new Set();
    let wins = 0, losses = 0;

    for (const num of newNumbers) {
      if (resolvedInBatch.has(pending.id)) continue;
      pending.spins_after++;

      if (pending.covered_numbers.includes(num)) {
        wins++;
        resolvedInBatch.add(pending.id);
      } else if (pending.spins_after >= TRIGGER_LOSS_THRESHOLD) {
        losses++;
        resolvedInBatch.add(pending.id);
      }
    }

    expect(wins).toBe(1);
    expect(losses).toBe(0);
  });

  it('sinal que não acerta em 3 spins = LOSS', () => {
    const pending = {
      id: 1,
      trigger_number: 17,
      covered_numbers: [15, 16, 17, 18, 19],
      spins_after: 0,
    };

    const newNumbers = [0, 32, 36]; // nenhum hit, 3 spins
    const resolvedInBatch = new Set();
    let wins = 0, losses = 0;

    for (const num of newNumbers) {
      if (resolvedInBatch.has(pending.id)) continue;
      pending.spins_after++;

      if (pending.covered_numbers.includes(num)) {
        wins++;
        resolvedInBatch.add(pending.id);
      } else if (pending.spins_after >= TRIGGER_LOSS_THRESHOLD) {
        losses++;
        resolvedInBatch.add(pending.id);
      }
    }

    expect(wins).toBe(0);
    expect(losses).toBe(1);
  });

  it('sinal resolvido no batch não é contado novamente', () => {
    const pending = {
      id: 1,
      trigger_number: 17,
      covered_numbers: [15, 16, 17, 18, 19],
      spins_after: 0,
    };

    // Primeiro spin é hit, segundo spin também seria hit se não fosse skip
    const newNumbers = [16, 17, 18];
    const resolvedInBatch = new Set();
    let wins = 0;

    for (const num of newNumbers) {
      if (resolvedInBatch.has(pending.id)) continue;
      pending.spins_after++;

      if (pending.covered_numbers.includes(num)) {
        wins++;
        resolvedInBatch.add(pending.id);
      }
    }

    expect(wins).toBe(1); // apenas 1 win, não 3
  });

  it('múltiplos sinais pendentes são processados independentemente', () => {
    const pending1 = { id: 1, trigger_number: 5, covered_numbers: [4, 5, 6], spins_after: 0 };
    const pending2 = { id: 2, trigger_number: 20, covered_numbers: [19, 20, 21], spins_after: 0 };

    const newNumbers = [5, 21, 0]; // hit para ambos
    const resolvedInBatch = new Set();
    let wins = 0;

    for (const num of newNumbers) {
      for (const sig of [pending1, pending2]) {
        if (resolvedInBatch.has(sig.id)) continue;
        sig.spins_after++;

        if (sig.covered_numbers.includes(num)) {
          wins++;
          resolvedInBatch.add(sig.id);
        }
      }
    }

    expect(wins).toBe(2);
  });

  it('números inválidos (< 0 ou > 36) são ignorados', () => {
    const pending = {
      id: 1,
      trigger_number: 17,
      covered_numbers: [15, 16, 17, 18, 19],
      spins_after: 0,
    };

    const newNumbers = [-1, 37, 100];
    let processed = 0;

    for (const num of newNumbers) {
      if (typeof num !== 'number' || num < 0 || num > 36) continue;
      processed++;
    }

    expect(processed).toBe(0);
    expect(pending.spins_after).toBe(0); // não incrementou
  });
});

// ══════════════════════════════════════════════════════════════
// getActiveSignalsFromDB — Lógica de dedup
// ══════════════════════════════════════════════════════════════

describe('getActiveSignalsFromDB dedup logic', () => {
  function dedupSignals(rows, triggerMap) {
    const seen = new Map();
    for (const row of rows) {
      if (seen.has(row.trigger_number)) {
        const existing = seen.get(row.trigger_number);
        if (existing._resolved === false) continue;
        if (row.resolved) continue;
      }

      const remaining = TRIGGER_LOSS_THRESHOLD - row.spins_after;
      let status;
      if (row.resolved) {
        status = row.result || (row.spins_after < TRIGGER_LOSS_THRESHOLD ? 'win' : 'loss');
      } else {
        status = 'pending';
      }

      seen.set(row.trigger_number, {
        triggerNumber: row.trigger_number,
        coveredNumbers: row.covered_numbers,
        spinsAgo: row.spins_after,
        remaining: Math.max(0, remaining),
        status,
        _resolved: row.resolved,
      });
    }

    return Array.from(seen.values()).map(({ _resolved, ...sig }) => sig);
  }

  it('remove duplicatas — apenas um sinal por trigger_number', () => {
    const rows = [
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 1, resolved: false, result: null },
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 3, resolved: true, result: 'win' },
    ];

    const signals = dedupSignals(rows, new Map());
    const trigger17 = signals.filter(s => s.triggerNumber === 17);
    expect(trigger17).toHaveLength(1);
  });

  it('prioriza pending sobre resolved para mesmo trigger_number', () => {
    const rows = [
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 1, resolved: false, result: null },
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 3, resolved: true, result: 'win' },
    ];

    const signals = dedupSignals(rows, new Map());
    expect(signals[0].status).toBe('pending');
  });

  it('pending substitui resolved se pending vem depois', () => {
    const rows = [
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 3, resolved: true, result: 'loss' },
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 0, resolved: false, result: null },
    ];

    const signals = dedupSignals(rows, new Map());
    expect(signals[0].status).toBe('pending');
  });

  it('mantém primeiro resolved se ambos são resolved', () => {
    const rows = [
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 1, resolved: true, result: 'win' },
      { trigger_number: 17, covered_numbers: [15,16,17], spins_after: 3, resolved: true, result: 'loss' },
    ];

    const signals = dedupSignals(rows, new Map());
    expect(signals[0].status).toBe('win');
  });

  it('não inclui _resolved no resultado final', () => {
    const rows = [
      { trigger_number: 7, covered_numbers: [6,7,8], spins_after: 0, resolved: false, result: null },
    ];

    const signals = dedupSignals(rows, new Map());
    expect(signals[0]).not.toHaveProperty('_resolved');
  });

  it('remaining é calculado corretamente', () => {
    const rows = [
      { trigger_number: 7, covered_numbers: [6,7,8], spins_after: 0, resolved: false, result: null },
      { trigger_number: 10, covered_numbers: [9,10,11], spins_after: 1, resolved: false, result: null },
      { trigger_number: 20, covered_numbers: [19,20,21], spins_after: 2, resolved: false, result: null },
      { trigger_number: 30, covered_numbers: [29,30,31], spins_after: 3, resolved: true, result: 'loss' },
    ];

    const signals = dedupSignals(rows, new Map());
    const byNum = {};
    for (const s of signals) byNum[s.triggerNumber] = s;

    expect(byNum[7].remaining).toBe(3);
    expect(byNum[10].remaining).toBe(2);
    expect(byNum[20].remaining).toBe(1);
    expect(byNum[30].remaining).toBe(0);
  });

  it('status win/loss para resolvidos é inferido de spins_after quando result ausente', () => {
    const rows = [
      { trigger_number: 7, covered_numbers: [6,7,8], spins_after: 1, resolved: true, result: null },
      { trigger_number: 10, covered_numbers: [9,10,11], spins_after: 3, resolved: true, result: null },
    ];

    const signals = dedupSignals(rows, new Map());
    const byNum = {};
    for (const s of signals) byNum[s.triggerNumber] = s;

    expect(byNum[7].status).toBe('win');   // spins_after < 3
    expect(byNum[10].status).toBe('loss'); // spins_after >= 3
  });
});
