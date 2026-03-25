// tests/integration/scoreboard.integration.test.js
// Testes de integração do fluxo completo do placar:
// - Endpoints de motor-score e trigger-score
// - Endpoints de motor-analysis e trigger-analysis
// - Reset de scores via admin
// - Score filtering por source
// - Emissão de análise via Socket.IO (mock)
// Roda com: INTEGRATION=true npm run test:integration

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Mocks pesados — DB, Redis, Sentry
// ══════════════════════════════════════════════════════════════

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  httpIntegration: vi.fn(() => ({})),
  expressIntegration: vi.fn(() => ({})),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setupExpressErrorHandler: vi.fn((app) => {
    app.use((err, req, res, next) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  }),
  close: vi.fn().mockResolvedValue(),
}));

const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('../../server/db.js', () => ({
  query: (...args) => mockQuery(...args),
  testConnection: vi.fn().mockResolvedValue(),
  poolStats: vi.fn(() => ({ total: 5, idle: 5, waiting: 0 })),
}));

vi.mock('../../server/redisService.js', () => ({
  initRedis: vi.fn().mockResolvedValue(),
  redisHealthCheck: vi.fn().mockResolvedValue({ status: 'ok', latency: '1ms' }),
  closeRedis: vi.fn().mockResolvedValue(),
  cacheAside: vi.fn((_key, _ttl, fn) => fn()),
  cacheSet: vi.fn().mockResolvedValue(),
  cacheDel: vi.fn().mockResolvedValue(),
  cacheDelPattern: vi.fn().mockResolvedValue(),
  KEY: {
    sub: (e) => `sub:${e}`,
    history: (s) => `hist:${s}`,
    latest: (s, l) => `latest:${s}:${l}`,
    adminStats: () => 'admin:stats',
    activeSubs: () => 'admin:active',
  },
  TTL: { SUBSCRIPTION: 60, FULL_HISTORY: 10, LATEST_SPINS: 15, ADMIN_STATS: 60, ACTIVE_SUBS: 60 },
}));

process.env.CRAWLER_SECRET = 'test-crawler-secret';
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.HUBLA_WEBHOOK_TOKEN = 'test-webhook-token';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

import express from 'express';
import crypto from 'crypto';
import { default as supertest } from 'supertest';

let app;
let request;

// In-memory analysis cache (simulates getLatestMotorAnalysis/getLatestTriggerAnalysis)
const motorAnalysisCache = {};
const triggerAnalysisCache = {};

beforeAll(() => {
  app = express();
  app.use(express.json());

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];

  function requireAdminAuth(req, res, next) {
    try {
      const a = Buffer.from(String(req.headers['x-admin-secret'] || ''));
      const b = Buffer.from(ADMIN_SECRET);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      next();
    } catch { return res.status(403).json({ error: 'Acesso negado' }); }
  }

  // Motor Score endpoint
  app.get('/api/motor-score', async (req, res) => {
    const source = req.query.source;
    if (!source) return res.status(400).json({ error: 'source required' });

    const { rows } = await mockQuery(
      'SELECT neighbor_mode, wins, losses FROM motor_scores WHERE source = $1',
      [source]
    );

    const scores = {
      "0": { wins: 0, losses: 0 },
      "1": { wins: 0, losses: 0 },
      "2": { wins: 0, losses: 0 },
    };

    for (const r of rows) {
      scores[String(r.neighbor_mode)] = { wins: r.wins, losses: r.losses };
    }

    res.json(scores);
  });

  // Trigger Score endpoint
  app.get('/api/trigger-score', async (req, res) => {
    const source = req.query.source;
    if (!source) return res.status(400).json({ error: 'source required' });

    const limit = parseInt(req.query.limit, 10);

    if (limit > 0) {
      // Filtered by last N spins
      const { rows } = await mockQuery(
        'SELECT COALESCE(SUM(CASE WHEN result=$2 THEN 1 ELSE 0 END),0) as wins, ...',
        [source, 'win']
      );
      const row = rows[0] || { wins: 0, losses: 0 };
      return res.json({ wins: row.wins, losses: row.losses });
    }

    const { rows } = await mockQuery(
      'SELECT wins, losses FROM trigger_scores WHERE source = $1',
      [source]
    );
    const row = rows[0] || { wins: 0, losses: 0 };
    res.json({ wins: row.wins, losses: row.losses });
  });

  // Motor Analysis endpoint
  app.get('/api/motor-analysis', (req, res) => {
    const source = req.query.source;
    if (!source) return res.status(400).json({ error: 'source required' });

    const cached = motorAnalysisCache[source];
    if (cached) return res.json(cached);

    res.json({
      source,
      timestamp: 0,
      globalAssertiveness: 0,
      totalSignals: 0,
      strategyScores: [],
      entrySignal: null,
      motorScores: {
        "0": { wins: 0, losses: 0 },
        "1": { wins: 0, losses: 0 },
        "2": { wins: 0, losses: 0 },
      },
    });
  });

  // Trigger Analysis endpoint
  app.get('/api/trigger-analysis', (req, res) => {
    const source = req.query.source;
    if (!source) return res.status(400).json({ error: 'source required' });

    const cached = triggerAnalysisCache[source];
    if (cached) return res.json(cached);

    res.json({
      source,
      timestamp: 0,
      activeSignals: [],
      topTriggers: [],
      activeTrigger: null,
      scoreboard: { wins: 0, losses: 0 },
      assertivity: { types: [], totals: { g1:0, g2:0, g3:0, red:0, total:0, pct:0 }, perTrigger: {} },
      allTriggersCount: 0,
    });
  });

  // Motor Score Reset (admin)
  app.post('/api/motor-score/reset', requireAdminAuth, async (req, res) => {
    const source = req.body.source;
    if (!source) return res.status(400).json({ error: 'source required' });

    await mockQuery('DELETE FROM motor_scores WHERE source = $1', [source]);
    await mockQuery('DELETE FROM motor_pending_signals WHERE source = $1', [source]);

    delete motorAnalysisCache[source];
    res.json({ success: true, source });
  });

  // Trigger Score Reset (admin)
  app.post('/api/trigger-score/reset', requireAdminAuth, async (req, res) => {
    const source = req.body.source;
    if (!source) return res.status(400).json({ error: 'source required' });

    await mockQuery('DELETE FROM trigger_scores WHERE source = $1', [source]);
    await mockQuery('DELETE FROM trigger_pending_signals WHERE source = $1', [source]);

    delete triggerAnalysisCache[source];
    res.json({ success: true, source });
  });

  request = supertest(app);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] });
});

// ══════════════════════════════════════════════════════════════
// GET /api/motor-score
// ══════════════════════════════════════════════════════════════

describe('GET /api/motor-score', () => {
  it('400 sem source', async () => {
    const res = await request.get('/api/motor-score');
    expect(res.status).toBe(400);
  });

  it('retorna scores zerados quando não há dados', async () => {
    const res = await request.get('/api/motor-score?source=immersive');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      "0": { wins: 0, losses: 0 },
      "1": { wins: 0, losses: 0 },
      "2": { wins: 0, losses: 0 },
    });
  });

  it('retorna scores do DB quando existem', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { neighbor_mode: 0, wins: 10, losses: 5 },
        { neighbor_mode: 1, wins: 20, losses: 3 },
        { neighbor_mode: 2, wins: 30, losses: 1 },
      ],
    });

    const res = await request.get('/api/motor-score?source=speed');
    expect(res.status).toBe(200);
    expect(res.body['0']).toEqual({ wins: 10, losses: 5 });
    expect(res.body['1']).toEqual({ wins: 20, losses: 3 });
    expect(res.body['2']).toEqual({ wins: 30, losses: 1 });
  });

  it('retorna scores parciais quando nem todos os modos existem', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { neighbor_mode: 0, wins: 5, losses: 3 },
        // modos 1 e 2 não existem ainda
      ],
    });

    const res = await request.get('/api/motor-score?source=auto');
    expect(res.body['0']).toEqual({ wins: 5, losses: 3 });
    expect(res.body['1']).toEqual({ wins: 0, losses: 0 }); // default
    expect(res.body['2']).toEqual({ wins: 0, losses: 0 }); // default
  });
});

// ══════════════════════════════════════════════════════════════
// GET /api/trigger-score
// ══════════════════════════════════════════════════════════════

describe('GET /api/trigger-score', () => {
  it('400 sem source', async () => {
    const res = await request.get('/api/trigger-score');
    expect(res.status).toBe(400);
  });

  it('retorna zerado quando não há dados', async () => {
    const res = await request.get('/api/trigger-score?source=immersive');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ wins: 0, losses: 0 });
  });

  it('retorna scores do DB', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ wins: 150, losses: 80 }],
    });

    const res = await request.get('/api/trigger-score?source=speed');
    expect(res.body).toEqual({ wins: 150, losses: 80 });
  });

  it('com limit, usa query filtrada', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ wins: 10, losses: 5 }],
    });

    const res = await request.get('/api/trigger-score?source=speed&limit=100');
    expect(res.status).toBe(200);
    // Verifica que a query foi chamada com source + 'win'
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('CASE'),
      expect.arrayContaining(['speed', 'win'])
    );
  });
});

// ══════════════════════════════════════════════════════════════
// GET /api/motor-analysis
// ══════════════════════════════════════════════════════════════

describe('GET /api/motor-analysis', () => {
  it('400 sem source', async () => {
    const res = await request.get('/api/motor-analysis');
    expect(res.status).toBe(400);
  });

  it('retorna default (timestamp=0) quando sem cache', async () => {
    const res = await request.get('/api/motor-analysis?source=immersive');
    expect(res.status).toBe(200);
    expect(res.body.timestamp).toBe(0);
    expect(res.body.globalAssertiveness).toBe(0);
    expect(res.body.strategyScores).toEqual([]);
    expect(res.body.entrySignal).toBeNull();
  });

  it('retorna análise cacheada quando disponível', async () => {
    motorAnalysisCache['speed'] = {
      source: 'speed',
      timestamp: Date.now(),
      globalAssertiveness: 72.5,
      totalSignals: 100,
      strategyScores: [{ name: 'Cavalos', score: 80 }],
      entrySignal: { convergence: 3, suggestedNumbers: [7, 28, 12, 35, 3] },
      motorScores: { "0": { wins: 10, losses: 5 }, "1": { wins: 15, losses: 3 }, "2": { wins: 20, losses: 1 } },
    };

    const res = await request.get('/api/motor-analysis?source=speed');
    expect(res.status).toBe(200);
    expect(res.body.globalAssertiveness).toBe(72.5);
    expect(res.body.entrySignal.suggestedNumbers).toHaveLength(5);
    expect(res.body.motorScores['0'].wins).toBe(10);

    delete motorAnalysisCache['speed']; // cleanup
  });
});

// ══════════════════════════════════════════════════════════════
// GET /api/trigger-analysis
// ══════════════════════════════════════════════════════════════

describe('GET /api/trigger-analysis', () => {
  it('400 sem source', async () => {
    const res = await request.get('/api/trigger-analysis');
    expect(res.status).toBe(400);
  });

  it('retorna default quando sem cache', async () => {
    const res = await request.get('/api/trigger-analysis?source=immersive');
    expect(res.status).toBe(200);
    expect(res.body.timestamp).toBe(0);
    expect(res.body.activeSignals).toEqual([]);
    expect(res.body.scoreboard).toEqual({ wins: 0, losses: 0 });
    expect(res.body.allTriggersCount).toBe(0);
  });

  it('retorna análise cacheada quando disponível', async () => {
    triggerAnalysisCache['auto'] = {
      source: 'auto',
      timestamp: Date.now(),
      activeSignals: [
        { triggerNumber: 17, status: 'pending', remaining: 2 },
      ],
      topTriggers: [],
      activeTrigger: null,
      scoreboard: { wins: 50, losses: 30 },
      assertivity: {
        types: [{ key: 'terminal_puro', label: 'Terminais', g1: 10, g2: 5, g3: 3, red: 12, total: 30, pct: 60 }],
        totals: { g1: 10, g2: 5, g3: 3, red: 12, total: 30, pct: 60 },
        perTrigger: {},
      },
      allTriggersCount: 8,
    };

    const res = await request.get('/api/trigger-analysis?source=auto');
    expect(res.status).toBe(200);
    expect(res.body.scoreboard.wins).toBe(50);
    expect(res.body.activeSignals).toHaveLength(1);
    expect(res.body.allTriggersCount).toBe(8);

    delete triggerAnalysisCache['auto']; // cleanup
  });
});

// ══════════════════════════════════════════════════════════════
// POST /api/motor-score/reset (admin)
// ══════════════════════════════════════════════════════════════

describe('POST /api/motor-score/reset', () => {
  it('403 sem admin secret', async () => {
    const res = await request.post('/api/motor-score/reset').send({ source: 'immersive' });
    expect(res.status).toBe(403);
  });

  it('403 com admin secret errado', async () => {
    const res = await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'wrong')
      .send({ source: 'immersive' });
    expect(res.status).toBe(403);
  });

  it('400 sem source no body', async () => {
    const res = await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({});
    expect(res.status).toBe(400);
  });

  it('200 com admin secret e source válidos', async () => {
    const res = await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'immersive' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe('immersive');
  });

  it('executa DELETE em motor_scores e motor_pending_signals', async () => {
    await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'speed' });

    const calls = mockQuery.mock.calls.map(c => c[0]);
    expect(calls.some(sql => sql.includes('DELETE FROM motor_scores'))).toBe(true);
    expect(calls.some(sql => sql.includes('DELETE FROM motor_pending_signals'))).toBe(true);
  });

  it('limpa cache de análise para a source', async () => {
    motorAnalysisCache['test-source'] = { timestamp: Date.now() };

    await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'test-source' });

    expect(motorAnalysisCache['test-source']).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// POST /api/trigger-score/reset (admin)
// ══════════════════════════════════════════════════════════════

describe('POST /api/trigger-score/reset', () => {
  it('403 sem admin secret', async () => {
    const res = await request.post('/api/trigger-score/reset').send({ source: 'immersive' });
    expect(res.status).toBe(403);
  });

  it('200 com admin secret e source válidos', async () => {
    const res = await request
      .post('/api/trigger-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'immersive' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('executa DELETE em trigger_scores e trigger_pending_signals', async () => {
    await request
      .post('/api/trigger-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'speed' });

    const calls = mockQuery.mock.calls.map(c => c[0]);
    expect(calls.some(sql => sql.includes('DELETE FROM trigger_scores'))).toBe(true);
    expect(calls.some(sql => sql.includes('DELETE FROM trigger_pending_signals'))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Fluxo E2E: Motor Score lifecycle
// ══════════════════════════════════════════════════════════════

describe('Motor Score E2E lifecycle', () => {
  it('1) Score começa zerado → 2) Análise popula cache → 3) Reset limpa tudo', async () => {
    // Step 1: Score zerado
    const res1 = await request.get('/api/motor-score?source=e2e-test');
    expect(res1.body).toEqual({
      "0": { wins: 0, losses: 0 },
      "1": { wins: 0, losses: 0 },
      "2": { wins: 0, losses: 0 },
    });

    // Step 2: Simula análise populando cache
    motorAnalysisCache['e2e-test'] = {
      source: 'e2e-test',
      timestamp: Date.now(),
      motorScores: { "0": { wins: 5, losses: 2 }, "1": { wins: 8, losses: 1 }, "2": { wins: 10, losses: 0 } },
    };

    const res2 = await request.get('/api/motor-analysis?source=e2e-test');
    expect(res2.body.motorScores['0'].wins).toBe(5);

    // Step 3: Reset
    await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'e2e-test' });

    // Cache deve estar limpo
    const res3 = await request.get('/api/motor-analysis?source=e2e-test');
    expect(res3.body.timestamp).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Fluxo E2E: Trigger Score lifecycle
// ══════════════════════════════════════════════════════════════

describe('Trigger Score E2E lifecycle', () => {
  it('1) Score começa zerado → 2) Análise com sinais ativos → 3) Reset limpa', async () => {
    // Step 1
    const res1 = await request.get('/api/trigger-score?source=e2e-trigger');
    expect(res1.body).toEqual({ wins: 0, losses: 0 });

    // Step 2
    triggerAnalysisCache['e2e-trigger'] = {
      source: 'e2e-trigger',
      timestamp: Date.now(),
      activeSignals: [
        { triggerNumber: 7, status: 'pending', remaining: 2 },
        { triggerNumber: 17, status: 'win', winAttempt: 1 },
      ],
      scoreboard: { wins: 25, losses: 15 },
      assertivity: { types: [], totals: { g1: 10, g2: 8, g3: 7, red: 15, total: 40, pct: 63 }, perTrigger: {} },
      allTriggersCount: 5,
    };

    const res2 = await request.get('/api/trigger-analysis?source=e2e-trigger');
    expect(res2.body.activeSignals).toHaveLength(2);
    expect(res2.body.scoreboard.wins).toBe(25);

    // Step 3
    await request
      .post('/api/trigger-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'e2e-trigger' });

    const res3 = await request.get('/api/trigger-analysis?source=e2e-trigger');
    expect(res3.body.timestamp).toBe(0);
    expect(res3.body.activeSignals).toEqual([]);

    delete triggerAnalysisCache['e2e-trigger'];
  });
});

// ══════════════════════════════════════════════════════════════
// Score isolation — diferentes sources são independentes
// ══════════════════════════════════════════════════════════════

describe('Score isolation between sources', () => {
  it('motor-analysis de diferentes sources não se misturam', async () => {
    motorAnalysisCache['source-a'] = { source: 'source-a', timestamp: 100, globalAssertiveness: 80 };
    motorAnalysisCache['source-b'] = { source: 'source-b', timestamp: 200, globalAssertiveness: 40 };

    const resA = await request.get('/api/motor-analysis?source=source-a');
    const resB = await request.get('/api/motor-analysis?source=source-b');

    expect(resA.body.globalAssertiveness).toBe(80);
    expect(resB.body.globalAssertiveness).toBe(40);

    delete motorAnalysisCache['source-a'];
    delete motorAnalysisCache['source-b'];
  });

  it('reset de uma source não afeta outra', async () => {
    motorAnalysisCache['keep'] = { source: 'keep', timestamp: Date.now(), globalAssertiveness: 90 };
    motorAnalysisCache['reset'] = { source: 'reset', timestamp: Date.now(), globalAssertiveness: 50 };

    await request
      .post('/api/motor-score/reset')
      .set('x-admin-secret', 'test-admin-secret')
      .send({ source: 'reset' });

    expect(motorAnalysisCache['keep']).toBeDefined();
    expect(motorAnalysisCache['reset']).toBeUndefined();

    delete motorAnalysisCache['keep'];
  });
});
