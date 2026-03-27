// tests/unit/alertLogic.test.js
// Cobertura: src/analysis/alertLogic.jsx — checkConvergenceAlert, checkPatternBrokenAlert

import { describe, it, expect } from 'vitest';
import { checkConvergenceAlert, checkPatternBrokenAlert } from '../../src/analysis/alertLogic.jsx';

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function makeMasterResult(greenCount, totalStrategies = 5, withEntry = true) {
  const strategyScores = [];
  for (let i = 0; i < totalStrategies; i++) {
    strategyScores.push({
      name: `Strategy_${i}`,
      status: i < greenCount ? '🟢' : '🟠',
      score: i < greenCount ? 80 : 30,
    });
  }
  return {
    globalAssertiveness: greenCount * 20,
    totalSignals: 100,
    strategyScores,
    entrySignal: withEntry ? { suggestedNumbers: [7, 12, 28, 35, 3] } : null,
  };
}

// ══════════════════════════════════════════════════════════════
// checkConvergenceAlert
// ══════════════════════════════════════════════════════════════

describe('checkConvergenceAlert', () => {
  it('retorna null quando masterResult é null', () => {
    expect(checkConvergenceAlert(null)).toBeNull();
  });

  it('retorna null quando strategyScores está vazio', () => {
    expect(checkConvergenceAlert({ strategyScores: [] })).toBeNull();
  });

  it('retorna null quando menos de 3 estratégias verdes', () => {
    const result = checkConvergenceAlert(makeMasterResult(2));
    expect(result).toBeNull();
  });

  it('retorna null quando 3+ verdes mas sem entrySignal', () => {
    const result = checkConvergenceAlert(makeMasterResult(3, 5, false));
    expect(result).toBeNull();
  });

  it('retorna alerta quando 3 estratégias convergem com entrySignal', () => {
    const alert = checkConvergenceAlert(makeMasterResult(3));
    expect(alert).not.toBeNull();
    expect(alert.type).toBe('success');
    expect(alert.title).toContain('SINAL');
    expect(alert.message).toContain('3x');
    expect(alert.sound).toBe(true);
    expect(alert.duration).toBe(15000);
  });

  it('retorna alerta quando 4 estratégias convergem', () => {
    const alert = checkConvergenceAlert(makeMasterResult(4));
    expect(alert.message).toContain('4x');
  });

  it('retorna alerta quando 5 estratégias convergem', () => {
    const alert = checkConvergenceAlert(makeMasterResult(5));
    expect(alert.message).toContain('5x');
  });

  it('mensagem contém nomes das estratégias ativas', () => {
    const alert = checkConvergenceAlert(makeMasterResult(3));
    expect(alert.message).toContain('Strategy_0');
    expect(alert.message).toContain('Strategy_1');
    expect(alert.message).toContain('Strategy_2');
  });

  it('mensagem contém números sugeridos', () => {
    const alert = checkConvergenceAlert(makeMasterResult(3));
    expect(alert.message).toContain('7');
    expect(alert.message).toContain('12');
  });
});

// ══════════════════════════════════════════════════════════════
// checkPatternBrokenAlert
// ══════════════════════════════════════════════════════════════

describe('checkPatternBrokenAlert', () => {
  it('retorna null quando currentResult é null', () => {
    expect(checkPatternBrokenAlert(null, makeMasterResult(3))).toBeNull();
  });

  it('retorna null quando prevResult é null', () => {
    expect(checkPatternBrokenAlert(makeMasterResult(3), null)).toBeNull();
  });

  it('retorna null quando strategyScores vazios', () => {
    expect(checkPatternBrokenAlert(
      { strategyScores: [] },
      { strategyScores: [] }
    )).toBeNull();
  });

  it('retorna null quando nenhuma estratégia caiu', () => {
    const prev = makeMasterResult(3);
    const curr = makeMasterResult(3);
    expect(checkPatternBrokenAlert(curr, prev)).toBeNull();
  });

  it('retorna null quando estratégia que era laranja continua laranja', () => {
    const prev = makeMasterResult(0); // todas 🟠
    const curr = makeMasterResult(0);
    expect(checkPatternBrokenAlert(curr, prev)).toBeNull();
  });

  it('alerta quando estratégia caiu de 🟢 para 🟠', () => {
    const prev = makeMasterResult(3);
    const curr = makeMasterResult(1); // Strategy_1 e _2 caíram
    const alert = checkPatternBrokenAlert(curr, prev);
    expect(alert).not.toBeNull();
    expect(alert.type).toBe('warning');
    expect(alert.title).toContain('Quebrou');
    expect(alert.duration).toBe(7000);
  });

  it('retorna apenas o primeiro alerta (evita spam)', () => {
    const prev = makeMasterResult(5); // todas verdes
    const curr = makeMasterResult(0); // todas caíram
    const alert = checkPatternBrokenAlert(curr, prev);
    // Deve retornar um objeto, não um array
    expect(alert).toHaveProperty('type');
    expect(alert).toHaveProperty('title');
  });

  it('mensagem contém scores antes e depois', () => {
    const prev = makeMasterResult(3);
    const curr = makeMasterResult(0);
    const alert = checkPatternBrokenAlert(curr, prev);
    expect(alert.message).toContain('→');
    expect(alert.message).toContain('%');
  });
});
