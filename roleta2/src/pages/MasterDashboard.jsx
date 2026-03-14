// pages/MasterDashboard.jsx — ADAPTIVE LEARNING v6 (CLEAN UI)
// ✅ Zero emojis — ícones Lucide + tipografia limpa
// ✅ Font sizes recalibrados para melhor legibilidade
// ✅ Signal bar e learning bar redesenhados

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Layers, Crosshair, BarChart3, Clock, Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { calculateMasterScore } from '../services/masterScoring.jsx';
import { learnFromHistory, calculateAdaptiveScore } from '../services/strategyLearning.js';
import EntrySignalCard from '../components/EntrySignalCard.jsx';
import styles from './MasterDashboard.module.css';

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const getCoveredNumbers = (targetNumbers, neighborMode) => {
  if (neighborMode === 0) return targetNumbers;
  const covered = new Set();
  targetNumbers.forEach(num => {
    covered.add(num);
    const idx = WHEEL_ORDER.indexOf(num);
    for (let i = 1; i <= neighborMode; i++) {
      covered.add(WHEEL_ORDER[(idx + i) % 37]);
      covered.add(WHEEL_ORDER[(idx - i + 37) % 37]);
    }
  });
  return Array.from(covered);
};

// --- COLOR HELPER ---
const getScoreColor = (s) => s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#ef4444';

// --- HERO GAUGE ---
const HeroGauge = ({ value, color, size = 130 }) => {
  const data = [{ value: Math.max(0, Math.min(100, value)), fill: color }];
  return (
    <RadialBarChart width={size} height={size * 0.52} cx={size / 2} cy={size * 0.46}
      innerRadius={size * 0.3} outerRadius={size * 0.42} startAngle={180} endAngle={0}
      data={data} barSize={size * 0.07}>
      <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
      <RadialBar background={{ fill: 'rgba(255,255,255,0.06)' }} dataKey="value"
        angleAxisId={0} cornerRadius={size * 0.05} isAnimationActive={true}
        animationDuration={800} animationEasing="ease-out" />
    </RadialBarChart>
  );
};

// --- MINI GAUGE (per strategy) ---
const StrategyGauge = React.memo(({ name, score, weight, accuracy }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color = getScoreColor(clamped);
  const data = [{ value: clamped, fill: color }];
  const size = 72;
  const hasLearning = weight !== undefined && weight !== 1;

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
      {hasLearning && (
        <div className={styles.gaugeWeight} style={{
          color: weight > 1.15 ? '#34d399' : weight < 0.85 ? '#ef4444' : 'rgba(255,255,255,0.3)',
        }}>
          {weight > 1.15 ? (
            <><TrendingUp size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />{accuracy !== undefined ? `${accuracy}%` : ''}</>
          ) : weight < 0.85 ? (
            <><TrendingDown size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />{accuracy !== undefined ? `${accuracy}%` : ''}</>
          ) : (
            <><Minus size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />{accuracy !== undefined ? `${accuracy}%` : ''}</>
          )}
        </div>
      )}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════
// HERO SCOREBOARD — Clean, sem emojis
// ══════════════════════════════════════════════════════════════

const HeroScoreboard = ({ wins, losses, neighborMode, setNeighborMode, entrySignal, totalUnits, coveredCount, timeText, timeStatusColor, isSignalAccepted, remainingSpins, learned }) => {
  const totalEntries = wins + losses;
  const assertiveness = totalEntries > 0 ? ((wins / totalEntries) * 100) : 0;
  const assertText = assertiveness.toFixed(1);
  const scoreColor = totalEntries > 0 ? getScoreColor(assertiveness) : 'rgba(255,255,255,0.3)';

  return (
    <div className={styles.heroPanel}>
      <div className={styles.heroShine} />

      {/* Mode toggle */}
      <div className={styles.modeSelector}>
        {[0, 1, 2].map(v => (
          <button key={v} onClick={() => setNeighborMode(v)}
            className={`${styles.modeBtn} ${neighborMode === v ? styles.modeBtnActive : ''}`}
          >
            {v === 0 ? 'Seco' : `${v} Viz`}
          </button>
        ))}
      </div>

      {/* WIN | GAUGE | LOSS */}
      <div className={styles.heroLayout}>
        <div className={styles.counterBox}>
          <div className={styles.counterValue} style={{ color: '#34d399', textShadow: '0 0 16px rgba(52,211,153,0.4)' }}>{wins}</div>
          <div className={styles.counterLabel} style={{ color: 'rgba(52,211,153,0.7)' }}>WIN</div>
        </div>

        <div className={styles.heroGaugeWrap}>
          <HeroGauge value={assertiveness} color={scoreColor} size={150} />
          <div className={styles.heroGaugeOverlay}>
            <div className={styles.heroPercent} style={{ color: scoreColor, textShadow: `0 0 24px ${scoreColor}44` }}>
              {assertText}<span className={styles.heroPercentSign}>%</span>
            </div>
            <div className={styles.heroSubtext}>{totalEntries} entradas</div>
          </div>
        </div>

        <div className={styles.counterBox}>
          <div className={styles.counterValue} style={{ color: '#ef4444', textShadow: '0 0 16px rgba(239,68,68,0.4)' }}>{losses}</div>
          <div className={styles.counterLabel} style={{ color: 'rgba(239,68,68,0.7)' }}>LOSS</div>
        </div>
      </div>

      {/* ✅ Signal bar — CLEAN, sem emojis */}
      {entrySignal && (
        <div className={styles.signalBar}>
          <div className={styles.signalItem}>
            <Layers size={13} className={styles.signalIconSvg} />
            <span className={styles.signalVal}>{totalUnits}</span>
            <span className={styles.signalLbl}>unids</span>
          </div>
          <div className={styles.signalDivider} />
          <div className={styles.signalItem}>
            <Crosshair size={13} className={styles.signalIconSvg} />
            <span className={styles.signalVal}>{coveredCount}</span>
            <span className={styles.signalLbl}>nums</span>
          </div>
          <div className={styles.signalDivider} />
          <div className={styles.signalItem}>
            <BarChart3 size={13} className={styles.signalIconSvg} />
            <span className={styles.signalVal}>{entrySignal.confidence.toFixed(0)}%</span>
            <span className={styles.signalLbl}>conf.</span>
          </div>
          <div className={styles.signalDivider} />
          <div className={styles.signalItem}>
            <Clock size={13} className={styles.signalIconSvg} />
            <span className={styles.signalVal} style={{ color: timeStatusColor, textShadow: `0 0 8px ${timeStatusColor}44` }}>
              {timeText}{!isSignalAccepted && remainingSpins > 0 ? `/${entrySignal.validFor}` : ''}
            </span>
          </div>
          {/* Combo win rate badge (se aprendido) */}
          {entrySignal.learned?.comboWinRate !== null && entrySignal.learned?.comboSamples >= 3 && (
            <>
              <div className={styles.signalDivider} />
              <div className={styles.signalItem}>
                <Brain size={13} className={styles.signalIconSvg} />
                <span className={styles.signalVal} style={{ color: entrySignal.learned.comboWinRate >= 50 ? '#34d399' : '#fbbf24' }}>
                  {entrySignal.learned.comboWinRate}%
                </span>
                <span className={styles.signalLbl}>hist.</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ✅ Learning bar — CLEAN, sem emojis */}
      {learned && learned.backtestPoints > 0 && (
        <div className={styles.learningBar}>
          <Brain size={11} className={styles.learningIconSvg} />
          <span className={styles.learningText}>
            {learned.backtestPoints} amostras · threshold {learned.bestConvergenceThreshold}x · validFor {learned.optimalValidFor}
            {learned.bestCombo && ` · melhor: ${learned.bestCombo.strategies.join('+')} (${learned.bestCombo.winRate}%)`}
          </span>
        </div>
      )}
    </div>
  );
};

// --- BACKTEST (usa mesma lógica mas com calculateAdaptiveScore) ---
const calculateHistoricalStats = (history, neighborMode, profile) => {
  if (!history || history.length < 50) return { wins: 0, losses: 0, analyzed: 0 };
  let wins = 0, losses = 0, analyzedCount = 0;
  const startIndex = history.length - 50;
  for (let i = startIndex; i >= 1; i--) {
    analyzedCount++;
    const analysis = profile && profile.backtestPoints > 0
      ? calculateAdaptiveScore(history.slice(i), profile)
      : calculateMasterScore(history.slice(i));
    if (analysis?.entrySignal) {
      const betNumbers = getCoveredNumbers(analysis.entrySignal.suggestedNumbers, neighborMode);
      const validFor = analysis.entrySignal.validFor || 2;
      let isWin = false;
      for (let j = 1; j <= validFor; j++) {
        if (i - j < 0) break;
        if (betNumbers.includes(history[i - j].number)) { isWin = true; break; }
      }
      if (isWin) wins++; else if (i >= validFor) losses++;
    }
  }
  return { wins, losses, analyzed: analyzedCount };
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const MasterDashboard = ({ spinHistory, onSignalUpdate }) => {
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);
  const [neighborMode, setNeighborMode] = useState(0);
  const [signalStartLen, setSignalStartLen] = useState(0);
  const [learnedProfile, setLearnedProfile] = useState(null);
  const lastSignalRef = useRef(null);
  const learnTimeoutRef = useRef(null);

  // ═══ LEARNING: Roda backtest adaptativo quando histórico muda ═══
  useEffect(() => {
    if (!spinHistory || spinHistory.length < 80) return;

    if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
    learnTimeoutRef.current = setTimeout(() => {
      const profile = learnFromHistory(spinHistory, neighborMode);
      setLearnedProfile(profile);
    }, 2000);

    return () => {
      if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
    };
  }, [spinHistory, neighborMode]);

  // ═══ ANALYSIS: Usa scoring adaptativo quando profile disponível ═══
  const analysis = useMemo(() => {
    if (learnedProfile && learnedProfile.backtestPoints > 0) {
      return calculateAdaptiveScore(spinHistory, learnedProfile);
    }
    return calculateMasterScore(spinHistory);
  }, [spinHistory, learnedProfile]);

  const stats = useMemo(() => {
    return calculateHistoricalStats(spinHistory, neighborMode, learnedProfile);
  }, [spinHistory, neighborMode, learnedProfile]);

  // ═══ SIGNAL MANAGEMENT ═══
  useEffect(() => {
    const rawSignal = analysis?.entrySignal?.suggestedNumbers || [];
    const rawStr = JSON.stringify(rawSignal);

    if (lastSignalRef.current !== rawStr) {
      lastSignalRef.current = rawStr;
      if (rawSignal.length > 0) { setIsSignalAccepted(false); setSignalStartLen(spinHistory.length); }
      else { setSignalStartLen(0); }
    }

    const expandedSignal = rawSignal.length > 0
      ? getCoveredNumbers(rawSignal, neighborMode)
      : [];
    onSignalUpdate({ targets: rawSignal, expanded: expandedSignal });

    if (analysis?.entrySignal && spinHistory.length > 0) {
      const currentBet = getCoveredNumbers(analysis.entrySignal.suggestedNumbers, neighborMode);
      if (currentBet.includes(spinHistory[0].number)) setIsSignalAccepted(true);
    } else if (!analysis?.entrySignal) setIsSignalAccepted(false);
  }, [analysis, onSignalUpdate, spinHistory, neighborMode]);

  const remainingSpins = useMemo(() => {
    if (!analysis?.entrySignal || signalStartLen === 0) return 0;
    return Math.max(0, analysis.entrySignal.validFor - (spinHistory.length - signalStartLen));
  }, [analysis, spinHistory.length, signalStartLen]);

  if (!analysis || analysis.strategyScores.length === 0) {
    return (
      <div className={styles.emptyState}>
        Aguardando {50 - (spinHistory?.length || 0)} spins para o Painel Master...
      </div>
    );
  }

  const { entrySignal, strategyScores } = analysis;
  const unitsPerTarget = 1 + (neighborMode * 2);
  const totalUnits = entrySignal ? entrySignal.suggestedNumbers.length * unitsPerTarget : 0;
  const coveredCount = entrySignal ? getCoveredNumbers(entrySignal.suggestedNumbers, neighborMode).length : 0;

  let timeStatusColor = '#fbbf24';
  let timeText = `${remainingSpins}`;
  if (isSignalAccepted) { timeStatusColor = '#34d399'; timeText = 'WIN'; }
  else if (remainingSpins === 0 && entrySignal) { timeStatusColor = '#ef4444'; timeText = 'FIM'; }
  else if (remainingSpins === 1) { timeStatusColor = '#f97316'; timeText = '1'; }

  const weights = learnedProfile?.strategyWeights || {};
  const accuracies = learnedProfile?.strategyAccuracy || {};

  return (
    <div className={styles.masterDashboardContainer}>
      <HeroScoreboard
        wins={stats.wins} losses={stats.losses}
        neighborMode={neighborMode} setNeighborMode={setNeighborMode}
        entrySignal={entrySignal} totalUnits={totalUnits} coveredCount={coveredCount}
        timeText={timeText} timeStatusColor={timeStatusColor}
        isSignalAccepted={isSignalAccepted} remainingSpins={remainingSpins}
        learned={learnedProfile}
      />

      <div className={styles.masterGridContainer}>
        {strategyScores.map(s => (
          <StrategyGauge
            key={s.name}
            name={s.name}
            score={s.score}
            status={s.status}
            weight={weights[s.name]}
            accuracy={accuracies[s.name]?.accuracy}
          />
        ))}
      </div>

      <EntrySignalCard entrySignal={entrySignal} isSignalAccepted={isSignalAccepted} spinHistory={spinHistory} />
    </div>
  );
};

export default MasterDashboard;