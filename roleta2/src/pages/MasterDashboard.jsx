// pages/MasterDashboard.jsx — ADAPTIVE LEARNING v6 (CLEAN UI)
// ✅ Zero emojis — ícones Lucide + tipografia limpa
// ✅ Font sizes recalibrados para melhor legibilidade
// ✅ Signal bar e learning bar redesenhados

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Layers, Crosshair, BarChart3, Clock, Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { calculateMasterScore } from '../services/masterScoring.js';
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

const MOTOR_THRESHOLD = 2; // quantos spins à frente o motor testa
const MAX_BACKTEST_CHECKS = 30; // limita chamadas a calculateMasterScore

/**
 * Backtest local do motor: percorre o histórico filtrado,
 * roda calculateMasterScore em sub-janelas e confere os próximos spins.
 */
function computeMotorBacktest(spinHistory) {
  const MIN_HISTORY = 50;
  const scores = { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } };

  const usable = spinHistory.length - MIN_HISTORY;
  if (usable < MOTOR_THRESHOLD) return scores;

  const step = Math.max(3, Math.floor(usable / MAX_BACKTEST_CHECKS));
  let lastKey = '';

  // i = posição no array (mais recente → 0). Análise usa spinHistory.slice(i).
  // Spins "seguintes" ao sinal: i-1, i-2 (mais recentes que i).
  for (let i = usable; i >= MOTOR_THRESHOLD; i -= step) {
    const result = calculateMasterScore(spinHistory.slice(i));
    if (!result?.entrySignal) continue;

    const nums = result.entrySignal.suggestedNumbers;
    const key = [...nums].sort().join(',');
    if (key === lastKey) continue; // mesmo sinal, pula
    lastKey = key;

    for (const mode of [0, 1, 2]) {
      const covered = getCoveredNumbers(nums, mode);
      let hit = false;
      for (let j = 1; j <= MOTOR_THRESHOLD; j++) {
        if (i - j >= 0 && covered.includes(spinHistory[i - j].number)) {
          hit = true;
          break;
        }
      }
      if (hit) scores[String(mode)].wins++;
      else scores[String(mode)].losses++;
    }
  }

  return scores;
}

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

const HeroScoreboard = ({ wins, losses, neighborMode, setNeighborMode, entrySignal, totalUnits, coveredCount, timeText, timeStatusColor, isSignalAccepted: _isSignalAccepted, learned }) => {
  const totalEntries = wins + losses;
  const assertiveness = totalEntries > 0 ? ((wins / totalEntries) * 100) : 0;
  const assertText = assertiveness.toFixed(1);
  const scoreColor = totalEntries > 0 ? getScoreColor(assertiveness) : 'rgba(255,255,255,0.3)';

  return (
    <div className={styles.heroPanel}>
      <div className={styles.heroShine} />

      <div className={styles.modeSelector}>
        {[0, 1, 2].map(v => (
          <button key={v} onClick={() => setNeighborMode(v)}
            className={`${styles.modeBtn} ${neighborMode === v ? styles.modeBtnActive : ''}`}
          >
            {v === 0 ? 'Seco' : `${v} Viz`}
          </button>
        ))}
      </div>

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
              {timeText}
            </span>
          </div>
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


// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const MasterDashboard = ({ spinHistory, onSignalUpdate }) => {
  const [neighborMode, setNeighborMode] = useState(0);
  const [learnedProfile, setLearnedProfile] = useState(null);
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);
  const learnTimeoutRef = useRef(null);

  // Scoreboard calculado localmente a partir dos dados filtrados
  const scores = useMemo(
    () => computeMotorBacktest(spinHistory),
    [spinHistory]
  );

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

  const analysis = useMemo(() => {
    if (learnedProfile && learnedProfile.backtestPoints > 0) {
      return calculateAdaptiveScore(spinHistory, learnedProfile);
    }
    return calculateMasterScore(spinHistory);
  }, [spinHistory, learnedProfile]);

  // Atualiza UI: onSignalUpdate e isSignalAccepted
  useEffect(() => {
    if (!analysis?.entrySignal) {
      setIsSignalAccepted(false);
      onSignalUpdate({ targets: [], expanded: [] });
      return;
    }

    const rawSignal = analysis.entrySignal.suggestedNumbers;
    const expanded = getCoveredNumbers(rawSignal, neighborMode);
    onSignalUpdate({ targets: rawSignal, expanded });

    if (spinHistory && spinHistory.length > 0) {
      setIsSignalAccepted(expanded.includes(spinHistory[0].number));
    }
  }, [analysis, neighborMode, onSignalUpdate, spinHistory]);

  if (!analysis || analysis.strategyScores.length === 0) {
    return (
      <div className={styles.emptyState}>
        Aguardando {50 - (spinHistory?.length || 0)} spins para o Painel Master...
      </div>
    );
  }

  const { entrySignal, strategyScores } = analysis;
  const modeScore = scores[String(neighborMode)] || { wins: 0, losses: 0 };
  const unitsPerTarget = 1 + (neighborMode * 2);
  const totalUnits = entrySignal ? entrySignal.suggestedNumbers.length * unitsPerTarget : 0;
  const coveredCount = entrySignal ? getCoveredNumbers(entrySignal.suggestedNumbers, neighborMode).length : 0;

  let timeStatusColor = '#fbbf24';
  let timeText = '';
  if (isSignalAccepted) { timeStatusColor = '#34d399'; timeText = 'WIN'; }
  else if (entrySignal) { timeStatusColor = '#fbbf24'; timeText = 'ATIVO'; }

  const weights = learnedProfile?.strategyWeights || {};
  const accuracies = learnedProfile?.strategyAccuracy || {};

  return (
    <div className={styles.masterDashboardContainer}>
      <HeroScoreboard
        wins={modeScore.wins} losses={modeScore.losses}
        neighborMode={neighborMode} setNeighborMode={setNeighborMode}
        entrySignal={entrySignal} totalUnits={totalUnits} coveredCount={coveredCount}
        timeText={timeText} timeStatusColor={timeStatusColor}
        isSignalAccepted={isSignalAccepted}
        learned={learnedProfile}
      />

      <div className={styles.masterGridContainer}>
        {strategyScores.map(s => (
          <StrategyGauge
            key={s.name}
            name={s.name}
            score={s.score}
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