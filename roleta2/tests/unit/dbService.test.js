// tests/unit/dbService.test.js
// Cobertura: saveNewSignals, getFullHistory, getLatestSpins, getNewSignalsSince
// Testa lógica do data access layer com mocks de DB e Redis

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Mocks — DB e Redis
// ══════════════════════════════════════════════════════════════

const mockQuery = vi.fn();
vi.mock('../../server/db.js', () => ({
  query: (...args) => mockQuery(...args),
}));

const mockCacheAside = vi.fn();
const mockCacheDel = vi.fn().mockResolvedValue();
vi.mock('../../server/redisService.js', () => ({
  cacheAside: (...args) => mockCacheAside(...args),
  cacheDel: (...args) => mockCacheDel(...args),
  KEY: {
    history: (s) => `hist:${s}`,
    latest: (s, l) => `latest:${s}:${l}`,
  },
  TTL: {
    FULL_HISTORY: 10,
    LATEST_SPINS: 15,
    DELTA: 1,
  },
}));

// Mock constants — subset das sources reais
vi.mock('../../server/constants.js', () => ({
  SOURCES: ['immersive', 'brasileira', 'speed', 'auto', 'lightning', 'aovivo'],
}));

// Import AFTER mocks
const { saveNewSignals, getFullHistory, getLatestSpins, getNewSignalsSince } = await import('../../server/dbService.js');

beforeEach(() => {
  mockQuery.mockReset();
  mockCacheDel.mockReset();
  mockCacheAside.mockReset();
  // Default behaviors
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockCacheDel.mockResolvedValue();
  mockCacheAside.mockImplementation((_key, _ttl, fn) => fn());
});

// ══════════════════════════════════════════════════════════════
// saveNewSignals
// ══════════════════════════════════════════════════════════════

describe('saveNewSignals', () => {
  it('retorna 0 para source desconhecida', async () => {
    const result = await saveNewSignals([{ signalId: 's1' }], 'unknown-source');
    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('retorna 0 para array vazio', async () => {
    const result = await saveNewSignals([], 'immersive');
    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('retorna 0 para null/undefined', async () => {
    expect(await saveNewSignals(null, 'immersive')).toBe(0);
    expect(await saveNewSignals(undefined, 'immersive')).toBe(0);
  });

  it('filtra itens sem signalId', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const result = await saveNewSignals(
      [{ signalId: null }, { gameId: 'g1' }, { signalId: '', gameId: 'g2' }],
      'immersive'
    );
    expect(result).toBe(0);
    // Nenhum item válido, mas verifica que não crashou
  });

  it('executa INSERT com ON CONFLICT para itens válidos', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 2 });

    await saveNewSignals(
      [
        { signalId: 's1', gameId: 'g1', signal: '17' },
        { signalId: 's2', gameId: 'g2', signal: '0' },
      ],
      'immersive'
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO signals');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
    expect(params).toContain('s1');
    expect(params).toContain('s2');
    expect(params).toContain('immersive');
  });

  it('invalida cache quando rowCount > 0', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await saveNewSignals([{ signalId: 's1', signal: '17' }], 'speed');

    // Deve invalidar hist:speed e latest:speed:*
    expect(mockCacheDel).toHaveBeenCalled();
    const keys = mockCacheDel.mock.calls.map(c => c[0]);
    expect(keys).toContain('hist:speed');
  });

  it('NÃO invalida cache quando rowCount = 0 (duplicatas)', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    await saveNewSignals([{ signalId: 's1', signal: '17' }], 'speed');

    expect(mockCacheDel).not.toHaveBeenCalled();
  });

  it('retorna 0 e não crashea em erro de DB', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const result = await saveNewSignals([{ signalId: 's1', signal: '17' }], 'immersive');
    expect(result).toBe(0);
  });

  it('converte signalId e signal para string com trim', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await saveNewSignals([{ signalId: '  s1  ', signal: '  17  ', gameId: '  g1  ' }], 'auto');

    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe('s1');    // signalId trimmed
    expect(params[1]).toBe('g1');    // gameId trimmed
    expect(params[2]).toBe('17');    // signal trimmed
  });

  it('gera placeholders corretos para múltiplos itens', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 3 });

    await saveNewSignals(
      [
        { signalId: 's1', signal: '1' },
        { signalId: 's2', signal: '2' },
        { signalId: 's3', signal: '3' },
      ],
      'brasileira'
    );

    const [sql, params] = mockQuery.mock.calls[0];
    // 3 itens × 4 campos = 12 parâmetros ($1 a $12)
    expect(params).toHaveLength(12);
    expect(sql).toContain('$1');
    expect(sql).toContain('$12');
  });
});

// ══════════════════════════════════════════════════════════════
// getFullHistory
// ══════════════════════════════════════════════════════════════

describe('getFullHistory', () => {
  it('rejeita source desconhecida com erro', async () => {
    await expect(getFullHistory('nonexistent')).rejects.toThrow('não reconhecida');
  });

  it('chama cacheAside com chave e TTL corretos', async () => {
    mockCacheAside.mockImplementationOnce((_key, _ttl, fn) => fn());
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getFullHistory('immersive');

    expect(mockCacheAside).toHaveBeenCalledTimes(1);
    const [key, ttl] = mockCacheAside.mock.calls[0];
    expect(key).toBe('hist:immersive');
    expect(ttl).toBe(10); // TTL.FULL_HISTORY
  });

  it('executa query SQL com ORDER BY timestamp DESC LIMIT 1000', async () => {
    const dbRows = [
      { timestamp: '2025-01-02', signalId: 's2', gameId: 'g', signal: '17' },
      { timestamp: '2025-01-01', signalId: 's1', gameId: 'g', signal: '0' },
    ];
    mockQuery.mockResolvedValueOnce({ rows: dbRows });

    const result = await getFullHistory('speed');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('ORDER BY timestamp DESC');
    expect(sql).toContain('LIMIT 1000');
    expect(result).toHaveLength(2);
    expect(result[0].signalId).toBe('s2'); // newest first
  });

  it('retorna resultado do fetcher quando cacheAside executa', async () => {
    const dbRows = [{ signalId: 'from-db-1' }];
    mockCacheAside.mockImplementationOnce((_key, _ttl, fn) => fn());
    mockQuery.mockResolvedValueOnce({ rows: dbRows });

    const result = await getFullHistory('auto');
    expect(result).toEqual(dbRows);
  });
});

// ══════════════════════════════════════════════════════════════
// getLatestSpins
// ══════════════════════════════════════════════════════════════

describe('getLatestSpins', () => {
  it('rejeita source desconhecida', async () => {
    await expect(getLatestSpins('fake')).rejects.toThrow();
  });

  it('usa limit default de 100', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getLatestSpins('lightning');

    expect(mockCacheAside).toHaveBeenCalledTimes(1);
    const key = mockCacheAside.mock.calls[0][0];
    expect(key).toBe('latest:lightning:100');
  });

  it('usa limit customizado', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getLatestSpins('lightning', 50);

    const key = mockCacheAside.mock.calls[0][0];
    expect(key).toBe('latest:lightning:50');
  });

  it('retorna rows do DB quando cache miss', async () => {
    mockCacheAside.mockImplementationOnce((_key, _ttl, fn) => fn());
    mockQuery.mockResolvedValueOnce({
      rows: [{ signalId: 's1', signal: '5' }],
    });

    const result = await getLatestSpins('aovivo', 10);
    expect(result).toHaveLength(1);
    expect(result[0].signalId).toBe('s1');
  });
});

// ══════════════════════════════════════════════════════════════
// getNewSignalsSince
// ══════════════════════════════════════════════════════════════

describe('getNewSignalsSince', () => {
  it('retorna [] para source desconhecida', async () => {
    const result = await getNewSignalsSince('unknown', 'abc');
    expect(result).toEqual([]);
  });

  it('retorna [] para lastSignalId falsy', async () => {
    expect(await getNewSignalsSince('immersive', null)).toEqual([]);
    expect(await getNewSignalsSince('immersive', '')).toEqual([]);
    expect(await getNewSignalsSince('immersive', undefined)).toEqual([]);
  });

  it('usa cacheAside com chave delta:source:signalId', async () => {
    mockCacheAside.mockImplementationOnce((_key, _ttl, fn) => fn());
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getNewSignalsSince('speed', 'sig-123');

    expect(mockCacheAside).toHaveBeenCalledTimes(1);
    const key = mockCacheAside.mock.calls[0][0];
    expect(key).toBe('delta:speed:sig-123');
  });

  it('executa query delta com subquery COALESCE', async () => {
    mockCacheAside.mockImplementationOnce((_key, _ttl, fn) => fn());
    mockQuery.mockResolvedValueOnce({ rows: [{ signalId: 'sig-124' }] });

    await getNewSignalsSince('brasileira', 'sig-123');

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('COALESCE');
    expect(sql).toContain('ORDER BY id DESC');
    expect(sql).toContain('LIMIT 100');
  });

  it('retorna novos sinais desde o lastSignalId', async () => {
    mockCacheAside.mockImplementationOnce((_key, _ttl, fn) => fn());
    mockQuery.mockResolvedValueOnce({
      rows: [
        { signalId: 'sig-126', signal: '17' },
        { signalId: 'sig-125', signal: '0' },
      ],
    });

    const result = await getNewSignalsSince('immersive', 'sig-124');
    expect(result).toHaveLength(2);
    expect(result[0].signalId).toBe('sig-126'); // newest first
  });
});

// ══════════════════════════════════════════════════════════════
// SOURCES — Validação do whitelist
// ══════════════════════════════════════════════════════════════

describe('SOURCES whitelist', () => {
  it('saveNewSignals aceita sources válidas sem erro', async () => {
    const validSources = ['immersive', 'brasileira', 'speed', 'auto', 'lightning', 'aovivo'];

    for (const source of validSources) {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const result = await saveNewSignals([{ signalId: `s-${source}`, signal: '1' }], source);
      expect(result).toBe(1);
    }
  });

  it('saveNewSignals rejeita source com SQL injection', async () => {
    const result = await saveNewSignals(
      [{ signalId: 's1', signal: '1' }],
      "immersive'; DROP TABLE signals;--"
    );
    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('saveNewSignals rejeita source com caracteres especiais', async () => {
    const malicious = ['../etc/passwd', '<script>alert(1)</script>', 'source%00null'];
    for (const source of malicious) {
      const result = await saveNewSignals([{ signalId: 's1', signal: '1' }], source);
      expect(result).toBe(0);
    }
  });
});
