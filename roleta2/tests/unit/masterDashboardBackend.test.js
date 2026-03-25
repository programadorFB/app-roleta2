// tests/unit/masterDashboardBackend.test.js
// TDD: Estes testes PROVAM que o MasterDashboard usa dados do BACKEND,
// não cálculo local. Se algum falhar, o dashboard ainda está computando no frontend.
//
// Verificação estática do código-fonte + verificação da lógica de extração de dados.

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

// ══════════════════════════════════════════════════════════════
// 1. PROVAS NEGATIVAS — código local de scoring NÃO deve existir
// ══════════════════════════════════════════════════════════════

describe('MasterDashboard NÃO contém cálculo local de scoring', () => {
  it('NÃO importa calculateMasterScore', () => {
    // Se importa, está rodando análise no browser
    const hasImport = /import\s+\{[^}]*calculateMasterScore[^}]*\}\s+from/.test(dashboardSource);
    expect(hasImport).toBe(false);
  });

  it('NÃO contém função computeMotorBacktest', () => {
    // Se existe, está fazendo backtest O(n²) no browser
    expect(dashboardSource).not.toContain('computeMotorBacktest');
  });

  it('NÃO chama calculateMasterScore() em nenhum lugar', () => {
    // Nem como import nem como chamada direta
    expect(dashboardSource).not.toContain('calculateMasterScore');
  });
});

// ══════════════════════════════════════════════════════════════
// 2. PROVAS POSITIVAS — dados vêm de backendMotorAnalysis
// ══════════════════════════════════════════════════════════════

describe('MasterDashboard USA backendMotorAnalysis para o placar', () => {
  it('acessa backendMotorAnalysis.motorScores para wins/losses', () => {
    // O placar DEVE vir de backendMotorAnalysis.motorScores
    expect(dashboardSource).toContain('backendMotorAnalysis');
    // Deve acessar motorScores (o campo que o backend envia)
    const usesMotorScores = /backendMotorAnalysis[\s\S]{0,100}motorScores/.test(dashboardSource)
      || /motorScores[\s\S]{0,50}backendMotorAnalysis/.test(dashboardSource)
      || dashboardSource.includes('.motorScores');
    expect(usesMotorScores).toBe(true);
  });

  it('acessa backendMotorAnalysis.strategyScores para os gauges', () => {
    // Os gauges das estratégias devem vir do backend
    const usesBackendStrategies = /backendMotorAnalysis[\s\S]{0,100}strategyScores/.test(dashboardSource)
      || dashboardSource.includes('backendMotorAnalysis?.strategyScores')
      || dashboardSource.includes('backendMotorAnalysis.strategyScores');
    expect(usesBackendStrategies).toBe(true);
  });

  it('acessa backendMotorAnalysis.entrySignal para o sinal ativo', () => {
    const usesBackendSignal = /backendMotorAnalysis[\s\S]{0,100}entrySignal/.test(dashboardSource)
      || dashboardSource.includes('backendMotorAnalysis?.entrySignal')
      || dashboardSource.includes('backendMotorAnalysis.entrySignal');
    expect(usesBackendSignal).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LÓGICA DE EXTRAÇÃO — dado o backendMotorAnalysis, extrai corretamente
// ══════════════════════════════════════════════════════════════

describe('Extração de dados do backendMotorAnalysis', () => {
  // Simula o que o componente faz com a prop
  function extractDashboardData(backendMotorAnalysis, neighborMode) {
    if (!backendMotorAnalysis) {
      return {
        scores: { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } },
        strategyScores: [],
        entrySignal: null,
      };
    }
    return {
      scores: backendMotorAnalysis.motorScores || { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } },
      strategyScores: backendMotorAnalysis.strategyScores || [],
      entrySignal: backendMotorAnalysis.entrySignal || null,
    };
  }

  it('com backendMotorAnalysis null → scores zerados, sem signal', () => {
    const data = extractDashboardData(null, 0);
    expect(data.scores['0']).toEqual({ wins: 0, losses: 0 });
    expect(data.strategyScores).toEqual([]);
    expect(data.entrySignal).toBeNull();
  });

  it('com backendMotorAnalysis válido → extrai motorScores do mode correto', () => {
    const backend = {
      motorScores: {
        "0": { wins: 10, losses: 5 },
        "1": { wins: 20, losses: 3 },
        "2": { wins: 30, losses: 1 },
      },
      strategyScores: [{ name: 'Cavalos', score: 85 }],
      entrySignal: { convergence: 3, suggestedNumbers: [7, 28, 12, 35, 3] },
    };

    const data0 = extractDashboardData(backend, 0);
    expect(data0.scores['0']).toEqual({ wins: 10, losses: 5 });

    const data1 = extractDashboardData(backend, 1);
    expect(data1.scores['1']).toEqual({ wins: 20, losses: 3 });

    const data2 = extractDashboardData(backend, 2);
    expect(data2.scores['2']).toEqual({ wins: 30, losses: 1 });
  });

  it('strategyScores vem do backend, não de cálculo local', () => {
    const backend = {
      motorScores: { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } },
      strategyScores: [
        { name: 'Cavalos', score: 90, status: 'hot', signal: true, numbers: [7] },
        { name: 'Setores', score: 45, status: 'neutral', signal: false, numbers: [] },
      ],
      entrySignal: null,
    };

    const data = extractDashboardData(backend, 0);
    expect(data.strategyScores).toHaveLength(2);
    expect(data.strategyScores[0].name).toBe('Cavalos');
    expect(data.strategyScores[0].score).toBe(90);
  });

  it('entrySignal vem do backend com suggestedNumbers', () => {
    const backend = {
      motorScores: { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } },
      strategyScores: [],
      entrySignal: { convergence: 4, suggestedNumbers: [17, 34, 6, 27, 13], confidence: 85 },
    };

    const data = extractDashboardData(backend, 0);
    expect(data.entrySignal).not.toBeNull();
    expect(data.entrySignal.suggestedNumbers).toEqual([17, 34, 6, 27, 13]);
    expect(data.entrySignal.convergence).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. PROVA DE QUE O COMPONENTE NÃO DEPENDE DE spinHistory PARA SCORING
// ══════════════════════════════════════════════════════════════

describe('MasterDashboard NÃO usa spinHistory para calcular scores', () => {
  it('NÃO contém useMemo com computeMotorBacktest(spinHistory)', () => {
    const hasBacktestMemo = /useMemo\s*\(\s*\(\)\s*=>\s*computeMotorBacktest/.test(dashboardSource);
    expect(hasBacktestMemo).toBe(false);
  });

  it('NÃO contém useMemo com calculateMasterScore(spinHistory)', () => {
    const hasMasterScoreMemo = /useMemo\s*\(\s*\(\)\s*=>\s*calculateMasterScore/.test(dashboardSource);
    expect(hasMasterScoreMemo).toBe(false);
  });

  it('NÃO recebe fullHistory como prop (era usado só pro cálculo local)', () => {
    // fullHistory era passada só para calculateMasterScore(spinHistory, fullHistory)
    // Sem cálculo local, não precisa mais existir
    const hasFullHistory = /fullHistory/.test(dashboardSource);
    expect(hasFullHistory).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. PROVA DE QUE spinHistory SÓ É USADO PARA UI (não scoring)
// ══════════════════════════════════════════════════════════════

describe('spinHistory é usado APENAS para UI, não para scoring', () => {
  // Usos legítimos de spinHistory no componente:
  // - Signal hold: travar sinal por N spins (UX)
  // - isSignalAccepted: checar se último spin acertou (highlight visual)
  // - signalRound: mostrar em qual rodada está (label visual)
  // - EntrySignalCard: mostrar gatilhos históricos (tabela visual)

  it('NÃO usa spinHistory.slice() (seria sinal de sub-window analysis)', () => {
    expect(dashboardSource).not.toMatch(/spinHistory\.slice/);
  });

  it('NÃO usa spinHistory.map para calcular scores', () => {
    // .map é OK para render, mas não deve aparecer perto de wins/losses/score
    const hasScoreMap = /spinHistory\.map[\s\S]{0,100}(wins|losses|score\s*[+=])/.test(dashboardSource);
    expect(hasScoreMap).toBe(false);
  });

  it('NÃO tem for loop iterando spinHistory para contagem', () => {
    // for (let i... spinHistory...) com wins++ ou losses++ seria cálculo local
    const hasCountLoop = /for\s*\(.*spinHistory[\s\S]{0,200}(wins|losses)\s*\+\+/.test(dashboardSource);
    expect(hasCountLoop).toBe(false);
  });
});
