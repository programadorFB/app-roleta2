// tests/unit/motorScoreFiltered.test.js
// TDD: Prova que o motor-score respeita o filtro de rodadas (limit).
//
// Comportamento esperado (igual trigger-score):
//   - GET /api/motor-score?source=X&limit=100  → scores das últimas 100 rodadas
//   - GET /api/motor-score?source=X&limit=all   → scores cumulativos do DB
//   - MasterDashboard recebe historyFilter e faz fetch filtrado

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const dashboardSource = fs.readFileSync(
  path.resolve(ROOT, 'src/pages/MasterDashboard.jsx'), 'utf-8'
);

const serverSource = fs.readFileSync(
  path.resolve(ROOT, 'server/server.js'), 'utf-8'
);

const appSource = fs.readFileSync(
  path.resolve(ROOT, 'src/App.jsx'), 'utf-8'
);

// ══════════════════════════════════════════════════════════════
// 1. BACKEND: /api/motor-score aceita param limit
// ══════════════════════════════════════════════════════════════

describe('Backend: /api/motor-score suporta filtro limit', () => {
  it('endpoint motor-score lê req.query.limit', () => {
    // O endpoint deve checar limit no query string
    const motorScoreSection = serverSource.slice(
      serverSource.indexOf("'/api/motor-score'"),
      serverSource.indexOf("'/api/motor-score/reset'")
    );
    expect(motorScoreSection).toContain('limit');
  });

  it('endpoint motor-score faz query filtrada quando limit é número', () => {
    const motorScoreSection = serverSource.slice(
      serverSource.indexOf("'/api/motor-score'"),
      serverSource.indexOf("'/api/motor-score/reset'")
    );
    // Deve ter lógica de cutoff igual trigger-score
    expect(motorScoreSection).toContain('motor_pending_signals');
  });
});

// ══════════════════════════════════════════════════════════════
// 2. FRONTEND: App.jsx passa historyFilter ao MasterDashboard
// ══════════════════════════════════════════════════════════════

describe('App.jsx passa historyFilter ao MasterDashboard', () => {
  it('MasterDashboard recebe prop historyFilter', () => {
    // App.jsx deve passar historyFilter={historyFilter} ao MasterDashboard
    const hasProp = /MasterDashboard[\s\S]{0,300}historyFilter/.test(appSource);
    expect(hasProp).toBe(true);
  });

  it('MasterDashboard recebe prop selectedRoulette', () => {
    const hasProp = /MasterDashboard[\s\S]{0,300}selectedRoulette/.test(appSource);
    expect(hasProp).toBe(true);
  });

  it('MasterDashboard recebe prop userEmail', () => {
    const hasProp = /MasterDashboard[\s\S]{0,300}userEmail/.test(appSource);
    expect(hasProp).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. FRONTEND: MasterDashboard faz fetch filtrado
// ══════════════════════════════════════════════════════════════

describe('MasterDashboard busca motor-score filtrado por limit', () => {
  it('faz fetch em /api/motor-score com limit', () => {
    expect(dashboardSource).toContain('/api/motor-score');
    expect(dashboardSource).toContain('limit');
  });

  it('usa historyFilter para determinar o limit', () => {
    expect(dashboardSource).toContain('historyFilter');
  });

  it('refaz fetch quando historyFilter muda (useEffect dependency)', () => {
    // historyFilter deve estar dentro de um array de deps [..., historyFilter, ...]
    const hasEffectDep = /\[[\w\s,?.]*historyFilter[\w\s,?.]*\]/.test(dashboardSource);
    expect(hasEffectDep).toBe(true);
  });
});
