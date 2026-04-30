
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeFilteredMotorScore } from '../../server/motorScoreEngine.js';
import * as db from '../../server/db.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('computeFilteredMotorScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar signalHistory e recentHistory formatados corretamente', async () => {
    // Mock para a busca do cutoff timestamp
    db.query.mockResolvedValueOnce({
      rows: [{ timestamp: '2024-01-01T10:00:00Z' }]
    });

    // Mock para a busca dos sinais (motor_pending_signals)
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 101,
          suggested_numbers: [1, 2, 3],
          spins_after: 1,
          resolved_modes: { "1": "win", "2": "win" },
          spin_results: [1],
          created_at: '2024-01-01T10:05:00Z'
        },
        {
          id: 102,
          suggested_numbers: [10, 11, 12],
          spins_after: 3,
          resolved_modes: { "1": "loss", "2": "win" },
          spin_results: [5, 6, 11],
          created_at: '2024-01-01T10:02:00Z'
        }
      ]
    });

    const result = await computeFilteredMotorScore('brasilPlay', 10);

    expect(result.signalHistory).toHaveLength(2);
    expect(result.recentHistory).toHaveLength(2);

    // Verifica formato do recentHistory
    expect(result.recentHistory[0]).toEqual({
      id: 101,
      modes: { "1": "win", "2": "win" }
    });

    // Backend agrega apenas modes 1 e 2 (mode 0 não é tracked no DB).
    // Sinal 101 → modes 1,2 = win.  Sinal 102 → mode 1 = loss, mode 2 = win.
    expect(result["1"].wins).toBe(1);
    expect(result["1"].losses).toBe(1);
    expect(result["2"].wins).toBe(2);
    expect(result["2"].losses).toBe(0);
  });

  it('deve retornar listas vazias se não houver sinais', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // cutoff
    db.query.mockResolvedValueOnce({ rows: [] }); // signals

    const result = await computeFilteredMotorScore('brasilPlay', 10);
    expect(result.signalHistory).toEqual([]);
    expect(result.recentHistory).toEqual([]);
  });
});
