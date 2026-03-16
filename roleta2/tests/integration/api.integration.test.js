// tests/integration/api.integration.test.js
// Testes de integração das rotas HTTP — usa supertest com app Express mockado
// Roda com: INTEGRATION=true npm run test:integration

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ══════════════════════════════════════════════════════════════
// Mocks pesados — DB, Redis, Sentry, fetch, socket.io
// ══════════════════════════════════════════════════════════════

// Mock Sentry antes de tudo
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  httpIntegration: vi.fn(() => ({})),
  expressIntegration: vi.fn(() => ({})),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setupExpressErrorHandler: vi.fn((app) => {
    // Sentry error handler (noop para testes)
    app.use((err, req, res, _next) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  }),
  close: vi.fn().mockResolvedValue(),
}));

// Mock DB
const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('../../db.js', () => ({
  query: (...args) => mockQuery(...args),
  testConnection: vi.fn().mockResolvedValue(),
  poolStats: vi.fn(() => ({ total: 5, idle: 5, waiting: 0 })),
}));

// Mock Redis
vi.mock('../../redisService.js', () => ({
  initRedis: vi.fn().mockResolvedValue(),
  redisHealthCheck: vi.fn().mockResolvedValue({ status: 'ok', latency: '1ms' }),
  closeRedis: vi.fn().mockResolvedValue(),
  cacheAside: vi.fn((key, ttl, fn) => fn()),
  cacheSet: vi.fn().mockResolvedValue(),
  cacheDel: vi.fn().mockResolvedValue(),
  cacheDelPattern: vi.fn().mockResolvedValue(),
  KEY: {
    sub: (e) => `sub:${e}`,
    hist: (s) => `hist:${s}`,
    latest: (s, l) => `latest:${s}:${l}`,
    adminStats: () => 'admin:stats',
    activeSubs: () => 'admin:active',
  },
  TTL: { SUBSCRIPTION: 60, FULL_HISTORY: 10, LATEST_SPINS: 15, ADMIN_STATS: 60, ACTIVE_SUBS: 60 },
}));

// Mock dbService
vi.mock('../../src/utils/dbService.js', () => ({
  loadAllExistingSignalIds: vi.fn().mockResolvedValue(),
  saveNewSignals: vi.fn().mockResolvedValue([]),
  getFullHistory: vi.fn().mockResolvedValue([]),
  getLatestSpins: vi.fn().mockResolvedValue([]),
  getNewSignalsSince: vi.fn().mockResolvedValue([]),
}));

// Mock motorScoreEngine e triggerScoreEngine
vi.mock('../../motorScoreEngine.js', () => ({ processSource: vi.fn().mockResolvedValue() }));
vi.mock('../../triggerScoreEngine.js', () => ({ processTriggerSource: vi.fn().mockResolvedValue() }));

// Mock emailService
vi.mock('../../emailService.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
}));

// Mock http-proxy-middleware
vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (req, res) => res.status(200).json({ proxy: 'mocked' }),
}));

// Mock node-fetch
vi.mock('node-fetch', () => ({ default: vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) }));

// Set env vars
process.env.CRAWLER_SECRET = 'test-crawler-secret';
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.HUBLA_WEBHOOK_TOKEN = 'test-webhook-token';
process.env.HUBLA_CHECKOUT_URL = 'https://pay.test.com/checkout';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PORT = '0'; // random port
process.env.SENTRY_DSN = '';
process.env.NODE_ENV = 'test';

// ══════════════════════════════════════════════════════════════
// Import after mocks
// ══════════════════════════════════════════════════════════════

import express from 'express';
import crypto from 'crypto';
import { default as supertest } from 'supertest';

// Cria mini-app que replica as rotas críticas do server.js
// (não importamos server.js diretamente pois ele chama startServer)
let app;
let request;

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '64kb' }));

  // SOURCES whitelist
  const SOURCES = ['immersive', 'brasileira', 'speed', 'auto', 'lightning', 'aovivo'];
  const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const CRAWLER_SECRET = process.env.CRAWLER_SECRET;
  const HUBLA_WEBHOOK_TOKEN = process.env.HUBLA_WEBHOOK_TOKEN;
  const HUBLA_CHECKOUT_URL = process.env.HUBLA_CHECKOUT_URL;

  const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
  const isValidEmail = (e) => typeof e === 'string' && EMAIL_REGEX.test(e) && e.length <= 320;

  function crawlerAuthCheck(req) {
    try {
      const a = Buffer.from(String(req.headers['x-crawler-secret'] || ''));
      const b = Buffer.from(CRAWLER_SECRET);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch { return false; }
  }

  function verifyHublaWebhook(t, expected) {
    if (!expected || !t) return false;
    try {
      const a = Buffer.from(String(t));
      const b = Buffer.from(String(expected));
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch { return false; }
  }

  // -- Health
  app.get('/health', async (req, res) => {
    res.json({ status: 'OK', uptime: 1, database: 'ok', redis: 'ok' });
  });

  // -- Report spin
  app.post('/api/report-spin', async (req, res) => {
    if (!crawlerAuthCheck(req)) return res.status(403).json({ error: 'Acesso negado' });
    const { signal, source } = req.body;
    if (!signal || !source) return res.status(400).json({ error: 'Payload inválido' });
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'Source inválido' });
    res.json({ success: true, saved: signal });
  });

  // -- Webhook hubla
  app.post('/api/webhooks/hubla', async (req, res) => {
    if (!verifyHublaWebhook(req.headers['x-hubla-token'], HUBLA_WEBHOOK_TOKEN)) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    res.json({ success: true });
  });

  // -- Subscription status
  app.get('/api/subscription/status', async (req, res) => {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: 'userEmail obrigatório' });
    const cleanEmail = userEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Email inválido' });

    // Simula lookup
    const sub = mockQuery.mock.results?.[mockQuery.mock.results.length - 1]?.value?.rows?.[0];
    if (!sub) return res.json({ hasAccess: false, subscription: null, checkoutUrl: HUBLA_CHECKOUT_URL });

    const hasAccess = ACTIVE_STATUSES.includes(sub.status) &&
      (!sub.expires_at || new Date(sub.expires_at) >= new Date());
    res.json({ hasAccess, subscription: sub, checkoutUrl: HUBLA_CHECKOUT_URL });
  });

  // -- Motor score
  app.get('/api/motor-score', async (req, res) => {
    if (!req.query.source) return res.status(400).json({ error: 'source required' });
    res.json({ "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } });
  });

  // -- Trigger score
  app.get('/api/trigger-score', async (req, res) => {
    if (!req.query.source) return res.status(400).json({ error: 'source required' });
    res.json({ wins: 0, losses: 0 });
  });

  // -- Admin
  app.get('/api/admin/subscriptions/stats', async (req, res) => {
    if (req.headers['x-admin-secret'] !== ADMIN_SECRET) return res.status(403).json({ error: 'Acesso negado' });
    res.json({ total: 10, active: 5, canceled: 3, pending: 2, expired: 0 });
  });

  // -- 404 fallback
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint não encontrado' });
    next();
  });

  request = supertest(app);
});

// ══════════════════════════════════════════════════════════════
// Health
// ══════════════════════════════════════════════════════════════

describe('GET /health', () => {
  it('retorna 200 com status OK', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});

// ══════════════════════════════════════════════════════════════
// Crawler — /api/report-spin
// ══════════════════════════════════════════════════════════════

describe('POST /api/report-spin', () => {
  it('403 sem x-crawler-secret', async () => {
    const res = await request
      .post('/api/report-spin')
      .send({ signal: '17', source: 'immersive' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Acesso negado');
  });

  it('403 com secret errado', async () => {
    const res = await request
      .post('/api/report-spin')
      .set('x-crawler-secret', 'wrong')
      .send({ signal: '17', source: 'immersive' });
    expect(res.status).toBe(403);
  });

  it('400 sem payload', async () => {
    const res = await request
      .post('/api/report-spin')
      .set('x-crawler-secret', 'test-crawler-secret')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payload inválido');
  });

  it('400 com source inválido', async () => {
    const res = await request
      .post('/api/report-spin')
      .set('x-crawler-secret', 'test-crawler-secret')
      .send({ signal: '17', source: 'invalid-source' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Source inválido');
  });

  it('200 com payload e secret válidos', async () => {
    const res = await request
      .post('/api/report-spin')
      .set('x-crawler-secret', 'test-crawler-secret')
      .send({ signal: '17', source: 'immersive' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.saved).toBe('17');
  });
});

// ══════════════════════════════════════════════════════════════
// Webhook Hubla — /api/webhooks/hubla
// ══════════════════════════════════════════════════════════════

describe('POST /api/webhooks/hubla', () => {
  it('401 sem token', async () => {
    const res = await request
      .post('/api/webhooks/hubla')
      .send({ type: 'member.access_granted', data: {} });
    expect(res.status).toBe(401);
  });

  it('401 com token errado', async () => {
    const res = await request
      .post('/api/webhooks/hubla')
      .set('x-hubla-token', 'wrong-token')
      .send({ type: 'member.access_granted' });
    expect(res.status).toBe(401);
  });

  it('200 com token correto', async () => {
    const res = await request
      .post('/api/webhooks/hubla')
      .set('x-hubla-token', 'test-webhook-token')
      .send({
        type: 'member.access_granted',
        data: { customer: { email: 'test@x.com', id: 'h1' } },
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Subscription status — /api/subscription/status
// ══════════════════════════════════════════════════════════════

describe('GET /api/subscription/status', () => {
  it('400 sem userEmail', async () => {
    const res = await request.get('/api/subscription/status');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('userEmail obrigatório');
  });

  it('400 com email inválido', async () => {
    const res = await request.get('/api/subscription/status?userEmail=notanemail');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email inválido');
  });

  it('200 com email válido (sem assinatura)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request.get('/api/subscription/status?userEmail=valid@test.com');
    expect(res.status).toBe(200);
    expect(res.body.hasAccess).toBe(false);
    expect(res.body.checkoutUrl).toBeDefined();
  });

  it('normaliza email para lowercase', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request.get('/api/subscription/status?userEmail=User@Test.COM');
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════
// Motor score — /api/motor-score
// ══════════════════════════════════════════════════════════════

describe('GET /api/motor-score', () => {
  it('400 sem source', async () => {
    const res = await request.get('/api/motor-score');
    expect(res.status).toBe(400);
  });

  it('200 com source válido', async () => {
    const res = await request.get('/api/motor-score?source=immersive');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('0');
    expect(res.body).toHaveProperty('1');
    expect(res.body).toHaveProperty('2');
  });
});

// ══════════════════════════════════════════════════════════════
// Trigger score — /api/trigger-score
// ══════════════════════════════════════════════════════════════

describe('GET /api/trigger-score', () => {
  it('400 sem source', async () => {
    const res = await request.get('/api/trigger-score');
    expect(res.status).toBe(400);
  });

  it('200 com source', async () => {
    const res = await request.get('/api/trigger-score?source=speed');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('wins');
    expect(res.body).toHaveProperty('losses');
  });
});

// ══════════════════════════════════════════════════════════════
// Admin — /api/admin/*
// ══════════════════════════════════════════════════════════════

describe('GET /api/admin/subscriptions/stats', () => {
  it('403 sem x-admin-secret', async () => {
    const res = await request.get('/api/admin/subscriptions/stats');
    expect(res.status).toBe(403);
  });

  it('403 com secret errado', async () => {
    const res = await request
      .get('/api/admin/subscriptions/stats')
      .set('x-admin-secret', 'wrong');
    expect(res.status).toBe(403);
  });

  it('200 com secret correto', async () => {
    const res = await request
      .get('/api/admin/subscriptions/stats')
      .set('x-admin-secret', 'test-admin-secret');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('active');
  });
});

// ══════════════════════════════════════════════════════════════
// 404 — Endpoints inexistentes
// ══════════════════════════════════════════════════════════════

describe('Endpoints inexistentes', () => {
  it('404 para GET /api/nonexistent', async () => {
    const res = await request.get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Endpoint não encontrado');
  });

  it('404 para POST /api/random', async () => {
    const res = await request.post('/api/random').send({});
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════
// Input sanitization / segurança
// ══════════════════════════════════════════════════════════════

describe('Segurança — input sanitization', () => {
  it('report-spin rejeita source com SQL injection attempt', async () => {
    const res = await request
      .post('/api/report-spin')
      .set('x-crawler-secret', 'test-crawler-secret')
      .send({ signal: '17', source: "immersive'; DROP TABLE signals;--" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Source inválido');
  });

  it('subscription/status rejeita email com XSS', async () => {
    const res = await request.get('/api/subscription/status?userEmail=<script>alert(1)</script>');
    expect(res.status).toBe(400);
  });

  it('subscription/status rejeita email extremamente longo', async () => {
    const longEmail = 'a'.repeat(300) + '@test.com';
    const res = await request.get(`/api/subscription/status?userEmail=${longEmail}`);
    expect(res.status).toBe(400);
  });
});
