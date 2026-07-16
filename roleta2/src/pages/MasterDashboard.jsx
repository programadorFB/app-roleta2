// pages/MasterDashboard.jsx — BACKEND-DRIVEN v7
// Placar, estratégias e sinal vêm 100% do backend (motorScoreEngine.js via Socket.IO).
// Zero cálculo local de scoring — o frontend apenas renderiza.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Layers, Crosshair, BarChart3, Clock } from 'lucide-react';
import { PHYSICAL_WHEEL, API_URL } from '../constants/roulette.js';
import { signedFetch } from '../lib/signedFetch.js';
import EntrySignalCard from '../components/EntrySignalCard.jsx';
import SignalHistory from '../components/SignalHistory.jsx';
import QuickRegisterActions from '../components/QuickRegisterActions.jsx';
import styles from './MasterDashboard.module.css';

const getCoveredNumbers = (targetNumbers, neighborMode) => {
  const covered = new Set();
  targetNumbers.forEach(num => {
    covered.add(num);
    const idx = PHYSICAL_WHEEL.indexOf(num);
    for (let i = 1; i <= neighborMode; i++) {
      covered.add(PHYSICAL_WHEEL[(idx + i) % 37]);
      covered.add(PHYSICAL_WHEEL[(idx - i + 37) % 37]);
    }
  });
  return Array.from(covered);
};

const emptyScoreState = { "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } };

// --- COLOR HELPER ---
const getScoreColor = (s) => s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#ef4444';

// --- MINI GAUGE (per strategy) ---
const StrategyGauge = React.memo(({ name, score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color = getScoreColor(clamped);
  const data = [{ value: clamped, fill: color }];
  const size = 72;

  return (
    <div className={styles.gaugeCard}>
      <div className={styles.gaugeChartWrap}>
        <RadialBarChart width={size} height={size * 0.48} cx={size / 2} cy={size * 0.42}
          innerRadius={size * 0.28} outerRadius={size * 0.4} startAngle={180} endAngle={0}
          data={data} barSize={size * 0.08}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: 'rgba(255,255,255,0.06)' }} dataKey="value"
            angleAxisId={0} cornerRadius={4} isAnimationActive={true}
            animationDuration={600} animationEasing="ease-out" />
        </RadialBarChart>
        <div className={styles.gaugeOverlay}>
          <span className={styles.gaugePercent} style={{ color, textShadow: `0 0 12px ${color}55` }}>
            {clamped.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className={styles.gaugeName}>{name}</div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════
// HERO SCOREBOARD — Clean, sem emojis
// ══════════════════════════════════════════════════════════════

const HeroScoreboard = ({ neighborMode, setNeighborMode }) => {
  return (
    <div className={styles.heroPanel}>
      <div className={styles.heroShine} />

      <div className={styles.modeSelector}>
        {[1, 2].map(v => (
          <button key={v} onClick={() => setNeighborMode(v)}
            className={`${styles.modeBtn} ${neighborMode === v ? styles.modeBtnActive : ''}`}
          >
            {`${v} Viz`}
          </button>
        ))}
      </div>
    </div>
  );
};


// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const SIGNAL_HOLD_SPINS = 2; // Sinal segura por N resultados antes de mudar

const MasterDashboard = ({ spinHistory, onSignalUpdate, backendMotorAnalysis, historyFilter, selectedRoulette, userEmail }) => {
  const [neighborMode, setNeighborMode] = useState(1);
  const lockedSignalRef = useRef(null);
  const lockSpinIdRef = useRef(null);

  // Estratégias e sinal do backend (Socket.IO)
  const strategyScores = backendMotorAnalysis?.strategyScores || [];
  const rawEntrySignal = backendMotorAnalysis?.entrySignal || null;

  // Placar: fetch do backend com limit (backtest roda no servidor, não no browser)
  const [filteredScores, setFilteredScores] = useState(emptyScoreState);

  useEffect(() => {
    if (!selectedRoulette || !userEmail) return;
    const limit = historyFilter === 'all' ? 'all' : Number(historyFilter);
    const url = `${API_URL}/api/motor-score?source=${selectedRoulette}&limit=${limit}&userEmail=${encodeURIComponent(userEmail)}`;
    console.log('[DEBUG SignalHistory] Fetching motor-score:', url);
    signedFetch(url)
      .then(r => {
        console.log('[DEBUG SignalHistory] Response status:', r.status, r.ok);
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (data) {
          console.log('[DEBUG SignalHistory] Data received:', {
            keys: Object.keys(data),
            signalHistoryLength: data.signalHistory?.length ?? 'MISSING',
            signalHistorySample: data.signalHistory?.slice(0, 2),
            recentHistoryLength: data.recentHistory?.length ?? 'MISSING',
            scores: { '1': data['1'], '2': data['2'] },
          });
          setFilteredScores(data);
        } else {
          console.warn('[DEBUG SignalHistory] No data returned (null)');
        }
      })
      .catch(err => { console.error('[DEBUG SignalHistory] Fetch error:', err); });
  }, [selectedRoulette, historyFilter, userEmail, backendMotorAnalysis?.timestamp]);

  // Trava o sinal por SIGNAL_HOLD_SPINS resultados
  const entrySignal = useMemo(() => {
    if (!spinHistory || spinHistory.length === 0) return rawEntrySignal;

    const currentId = spinHistory[0].signalId;

    // Se não há sinal travado, aceita o novo (ou null)
    if (!lockedSignalRef.current) {
      if (rawEntrySignal) {
        lockedSignalRef.current = rawEntrySignal;
        lockSpinIdRef.current = currentId;
      }
      return rawEntrySignal;
    }

    // Conta quantos spins passaram desde que travou
    const lockIdx = spinHistory.findIndex(s => s.signalId === lockSpinIdRef.current);
    const spinsSinceLock = lockIdx === -1 ? SIGNAL_HOLD_SPINS : lockIdx;

    // Se já passou o hold, libera pra novo sinal
    if (spinsSinceLock >= SIGNAL_HOLD_SPINS) {
      lockedSignalRef.current = rawEntrySignal;
      lockSpinIdRef.current = currentId;
      return rawEntrySignal;
    }

    // Ainda no hold — mantém sinal travado
    return lockedSignalRef.current;
  }, [rawEntrySignal, spinHistory]);

  // Atualiza UI: onSignalUpdate
  useEffect(() => {
    if (!entrySignal) {
      onSignalUpdate({ targets: [], expanded: [] });
      return;
    }

    const rawSignal = entrySignal.suggestedNumbers;
    const expanded = getCoveredNumbers(rawSignal, neighborMode);
    onSignalUpdate({ targets: rawSignal, expanded });
  }, [entrySignal, neighborMode, onSignalUpdate]);

  // Aguardando backend processar
  if (!backendMotorAnalysis || backendMotorAnalysis.source !== selectedRoulette || strategyScores.length === 0) {
    return (
      <div className={styles.emptyState}>
        Carregando dados da {selectedRoulette.replace('_', ' ')}...
      </div>
    );
  }

  return (
    <div className={styles.masterDashboardContainer}>
      <QuickRegisterActions />

      <HeroScoreboard
        neighborMode={neighborMode} setNeighborMode={setNeighborMode}
      />

      <div className={styles.masterGridContainer}>
        {strategyScores.map(s => (
          <StrategyGauge
            key={s.name}
            name={s.name}
            score={s.score}
          />
        ))}
      </div>

      <EntrySignalCard entrySignal={entrySignal} spinHistory={spinHistory} />

      <SignalHistory
        signalHistory={filteredScores.signalHistory}
        neighborMode={neighborMode}
      />
    </div>
  );
};

export default MasterDashboard;