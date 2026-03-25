// pages/MasterDashboard.jsx — ADAPTIVE LEARNING v6 (CLEAN UI)
// ✅ Zero emojis — ícones Lucide + tipografia limpa
// ✅ Font sizes recalibrados para melhor legibilidade
// ✅ Signal bar e learning bar redesenhados

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Layers, Crosshair, BarChart3, Clock } from 'lucide-react';
import { calculateMasterScore } from '../analysis/masterScoring.js';
import { PHYSICAL_WHEEL } from '../constants/roulette.js';
import EntrySignalCard from '../components/EntrySignalCard.jsx';
import styles from './MasterDashboard.module.css';

const getCoveredNumbers = (targetNumbers, neighborMode) => {
  if (neighborMode === 0) return targetNumbers;
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

const emptyScoreState = { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } };
const MOTOR_THRESHOLD = 3; // Alinhado com LOSS_THRESHOLD=3 do motorScoreEngine

/**
 * Backtest local: percorre TODOS os dados do histórico, roda calculateMasterScore
 * em sub-janelas e confere os próximos spins.
 */
function computeMotorBacktest(spinHistory) {
  const scores = { "0": { wins: 0, losses: 0 }, "1": { wins: 0, losses: 0 }, "2": { wins: 0, losses: 0 } };

  if (!spinHistory || spinHistory.length < MOTOR_THRESHOLD + 1) return scores;

  let lastKey = '';

  for (let i = spinHistory.length - 1; i >= MOTOR_THRESHOLD; i--) {
    const result = calculateMasterScore(spinHistory.slice(i));
    if (!result?.entrySignal) continue;

    const nums = result.entrySignal.suggestedNumbers;
    const key = [...nums].sort().join(',');
    if (key === lastKey) continue;
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

const HeroScoreboard = ({ wins, losses, neighborMode, setNeighborMode, entrySignal, totalUnits, coveredCount, timeText, timeStatusColor, isSignalAccepted, signalRound }) => {
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
        {entrySignal && signalRound > 0 && (
          <span className={styles.roundBadge}>
            {signalRound}/{entrySignal.validFor} rod.
          </span>
        )}
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
        </div>
      )}

    </div>
  );
};


// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const SIGNAL_HOLD_SPINS = 2; // Sinal segura por N resultados antes de mudar

const MasterDashboard = ({ spinHistory, fullHistory, onSignalUpdate, backendMotorAnalysis }) => {
  const [neighborMode, setNeighborMode] = useState(0);
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);
  const lockedSignalRef = useRef(null);
  const lockSpinIdRef = useRef(null);

  // Sempre computa localmente do spinHistory filtrado
  const analysis = useMemo(
    () => calculateMasterScore(spinHistory, fullHistory),
    [spinHistory, fullHistory]
  );
  const strategyScores = analysis?.strategyScores || [];
  const rawEntrySignal = analysis?.entrySignal || null;

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

  // ✅ FIX: Usa scoreboard do backend (DB persistente) quando disponível.
  // O backtest local depende de recomputar calculateMasterScore em cada sub-janela,
  // o que subcontabiliza quando condições mudam entre spins.
  const scores = useMemo(() => {
    if (backendMotorAnalysis?.timestamp > 0 && backendMotorAnalysis.motorScores) {
      return backendMotorAnalysis.motorScores;
    }
    return computeMotorBacktest(spinHistory);
  }, [spinHistory, backendMotorAnalysis]);
  const modeScore = scores[String(neighborMode)] || { wins: 0, losses: 0 };

  // Atualiza UI: onSignalUpdate e isSignalAccepted
  useEffect(() => {
    if (!entrySignal) {
      setIsSignalAccepted(false);
      onSignalUpdate({ targets: [], expanded: [] });
      return;
    }

    const rawSignal = entrySignal.suggestedNumbers;
    const expanded = getCoveredNumbers(rawSignal, neighborMode);
    onSignalUpdate({ targets: rawSignal, expanded });

    if (spinHistory && spinHistory.length > 0) {
      setIsSignalAccepted(expanded.includes(spinHistory[0].number));
    }
  }, [entrySignal, neighborMode, onSignalUpdate, spinHistory]);

  if (!analysis || strategyScores.length === 0) {
    return (
      <div className={styles.emptyState}>
        Aguardando {50 - (spinHistory?.length || 0)} spins para o Painel Master...
      </div>
    );
  }

  const unitsPerTarget = 1 + (neighborMode * 2);
  const totalUnits = entrySignal ? entrySignal.suggestedNumbers.length * unitsPerTarget : 0;
  const coveredCount = entrySignal ? getCoveredNumbers(entrySignal.suggestedNumbers, neighborMode).length : 0;

  // Calcula em qual rodada o sinal está (1/2 do validFor)
  const signalRound = useMemo(() => {
    if (!entrySignal || !spinHistory || spinHistory.length === 0) return 0;
    const lockIdx = spinHistory.findIndex(s => s.signalId === lockSpinIdRef.current);
    return lockIdx === -1 ? 0 : lockIdx + 1;
  }, [entrySignal, spinHistory]);

  let timeStatusColor = '#fbbf24';
  let timeText = '';
  if (isSignalAccepted) { timeStatusColor = '#34d399'; timeText = 'WIN'; }
  else if (entrySignal) { timeStatusColor = '#fbbf24'; timeText = 'ATIVO'; }

  return (
    <div className={styles.masterDashboardContainer}>
      <HeroScoreboard
        wins={modeScore.wins} losses={modeScore.losses}
        neighborMode={neighborMode} setNeighborMode={setNeighborMode}
        entrySignal={entrySignal} totalUnits={totalUnits} coveredCount={coveredCount}
        timeText={timeText} timeStatusColor={timeStatusColor}
        isSignalAccepted={isSignalAccepted} signalRound={signalRound}
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
    </div>
  );
};

export default MasterDashboard;