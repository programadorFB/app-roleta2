// pages/TriggersPage.jsx — v5 BACKEND-DRIVEN SIGNALS + expand history

import React, { useMemo, useState, useCallback, useRef, Suspense, lazy } from 'react';
import { Zap, Clock, ChevronDown, Crosshair } from 'lucide-react';
import TriggerStrategiesPanel from '../components/TriggerStrategiesPanel';
import { buildTriggerMap, getActiveTriggers, getActiveSignals as getActiveSignalsFn, computeTriggerScoreboard, checkTrigger } from '../analysis/triggerAnalysis';
import { getRouletteColor, LOSS_THRESHOLD } from '../constants/roulette';
import TriggerRadar from '../components/TriggerRadar';
import styles from './TriggersPage.module.css';

const RacingTrack = lazy(() => import('../components/RacingTrack.jsx'));
const ResultsGrid = lazy(() => import('../components/ResultGrid.jsx'));

// ── Historico individual de um gatilho ─────────────────────────
// ✅ FIX: Aceita fallback do sinal backend quando triggerMap volátil não tem mais o trigger
function buildTriggerHistory(triggerNumber, spinHistory, triggerMap, fallbackSignal) {
  const profile = triggerMap.get(triggerNumber);
  const covered = profile?.bestPattern?.coveredNumbers || fallbackSignal?.coveredNumbers;
  if (!covered) return null;

  const action = profile?.bestPattern?.label || fallbackSignal?.action || '';
  const confidence = profile?.bestPattern?.confidence || fallbackSignal?.confidence || 0;

  const results = [];

  for (let i = LOSS_THRESHOLD; i < spinHistory.length; i++) {
    if (spinHistory[i].number !== triggerNumber) continue;

    let hitOn = 0;
    for (let j = 1; j <= LOSS_THRESHOLD; j++) {
      const ci = i - j;
      if (ci < 0) break;
      if (!hitOn && covered.includes(spinHistory[ci].number)) hitOn = j;
    }

    results.push({ label: hitOn ? `G${hitOn}` : 'RED', hitOn });
  }

  const g1 = results.filter(r => r.hitOn === 1).length;
  const g2 = results.filter(r => r.hitOn === 2).length;
  const g3 = results.filter(r => r.hitOn === 3).length;
  const red = results.filter(r => !r.hitOn).length;
  const total = results.length;
  const wins = g1 + g2 + g3;

  return {
    triggerNumber, action, covered, confidence,
    g1, g2, g3, red, total, wins,
    pct: total > 0 ? Math.round((wins / total) * 100) : 0,
    recentResults: results.slice(0, 20).map(r => r.label),
  };
}

// ── Scoreboard ─────────────────────────────────────────────────
const TriggerScoreboard = ({ wins, losses }) => {
  const total = wins + losses;
  const rate = total > 0 ? (wins / total) * 100 : 0;
  const color = rate >= 55 ? '#34d399' : rate >= 40 ? '#fbbf24' : '#ef4444';

  return (
    <div className={styles.scoreboard}>
      <div className={styles.scoreShine} />
      <div className={styles.scoreLayout}>
        <div className={styles.scoreCounter}>
          <div className={styles.scoreValue} style={{ color: '#34d399', textShadow: '0 0 16px rgba(52,211,153,0.35)' }}>{wins}</div>
          <div className={styles.scoreLabel} style={{ color: 'rgba(52,211,153,0.6)' }}>WIN</div>
        </div>
        <div className={styles.scoreCenter}>
          <div className={styles.scoreRate} style={{ color, textShadow: `0 0 20px ${color}44` }}>
            {rate.toFixed(1)}<span className={styles.scorePercSign}>%</span>
          </div>
          <div className={styles.scoreEntries}>{total} entradas</div>
          <div className={styles.scoreMissNote}>cada gatilho = 1 entrada</div>
        </div>
        <div className={styles.scoreCounter}>
          <div className={styles.scoreValue} style={{ color: '#ef4444', textShadow: '0 0 16px rgba(239,68,68,0.35)' }}>{losses}</div>
          <div className={styles.scoreLabel} style={{ color: 'rgba(239,68,68,0.6)' }}>LOSS</div>
        </div>
      </div>
    </div>
  );
};

// ── Sinais em Progresso (com historico expandivel) ─────────────
const ActiveSignalsPanel = ({ signals, spinHistory, triggerMap }) => {
  const [expanded, setExpanded] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  // ✅ FIX: Passa o sinal inteiro como fallback para quando triggerMap não tem mais o trigger
  const handleClick = useCallback((sig) => {
    if (expanded === sig.triggerNumber) {
      setExpanded(null);
      setHistoryData(null);
    } else {
      setExpanded(sig.triggerNumber);
      setHistoryData(buildTriggerHistory(sig.triggerNumber, spinHistory, triggerMap, sig));
    }
  }, [expanded, spinHistory, triggerMap]);

  return (
    <div className={styles.signalsPanel}>
      <div className={styles.signalsPanelHeader}>
        <Zap size={13} className={styles.signalsPanelIcon} />
        <span>Sinais em Progresso</span>
      </div>
      {(!signals || signals.length === 0) ? (
        <div className={styles.noSignals}>
          <Clock size={14} style={{ opacity: 0.25 }} />
          <span>Nenhum sinal ativo</span>
        </div>
      ) : (
        <div className={styles.signalsList}>
          {signals.map((sig) => {
            const col = getRouletteColor(sig.triggerNumber);
            const isExpanded = expanded === sig.triggerNumber;
            const pctColor = sig.confidence >= 60 ? '#34d399' : sig.confidence >= 40 ? '#c9a052' : '#ef4444';

            return (
              <div key={sig.triggerNumber} className={styles.signalItem}>
                <div
                  className={`${styles.signalRow} ${styles[`signalRow--${sig.status}`]} ${isExpanded ? styles['signalRow--active'] : ''}`}
                  onClick={() => handleClick(sig)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`${styles.signalChip} ${styles[`signalChip--${col}`]}`}>
                    {sig.triggerNumber}
                  </span>
                  <span className={styles.signalAction}>{sig.action}</span>
                  {/* ✅ FIX: Porcentagem diretamente no card */}
                  {sig.confidence > 0 && (
                    <span className={styles.signalHitRate} style={{ color: pctColor }}>
                      {Math.round(sig.confidence)}%
                    </span>
                  )}
                  <span className={styles.signalStatus}>
                    {sig.status === 'pending' && (
                      <span className={styles.signalPending}>{sig.remaining}/{LOSS_THRESHOLD}</span>
                    )}
                    {sig.status === 'win' && <span className={styles.signalWin}>G{sig.winAttempt}</span>}
                    {sig.status === 'loss' && <span className={styles.signalLoss}>MISS</span>}
                  </span>
                  <ChevronDown size={11} className={`${styles.signalChevron} ${isExpanded ? styles['signalChevron--open'] : ''}`} />
                </div>

                {isExpanded && historyData && (
                  <div className={styles.signalHistory}>
                    <div className={styles.shStatsRow}>
                      <div className={styles.shStat}>
                        <span className={styles.shStatVal} style={{ color: '#34d399' }}>{historyData.g1}</span>
                        <span className={styles.shStatLbl}>G1</span>
                      </div>
                      <div className={styles.shStat}>
                        <span className={styles.shStatVal} style={{ color: '#34d399' }}>{historyData.g2}</span>
                        <span className={styles.shStatLbl}>G2</span>
                      </div>
                      <div className={styles.shStat}>
                        <span className={styles.shStatVal} style={{ color: '#34d399' }}>{historyData.g3}</span>
                        <span className={styles.shStatLbl}>G3</span>
                      </div>
                      <div className={styles.shStat}>
                        <span className={styles.shStatVal} style={{ color: '#ef4444' }}>{historyData.red}</span>
                        <span className={styles.shStatLbl}>RED</span>
                      </div>
                      <div className={styles.shStatDivider} />
                      <div className={styles.shStat}>
                        <span className={styles.shStatVal} style={{ color: historyData.pct >= 60 ? '#34d399' : historyData.pct >= 40 ? '#c9a052' : '#ef4444' }}>
                          {historyData.pct}%
                        </span>
                        <span className={styles.shStatLbl}>{historyData.wins}/{historyData.total}</span>
                      </div>
                    </div>

                    {historyData.recentResults.length > 0 && (
                      <div className={styles.shResults}>
                        <span className={styles.shResultsLabel}>Ultimos resultados</span>
                        <div className={styles.shResultsChips}>
                          {historyData.recentResults.map((r, i) => (
                            <span key={i} className={`${styles.shChip} ${r === 'RED' ? styles['shChip--red'] : styles['shChip--win']}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={styles.shCovered}>
                      <span className={styles.shCoveredLabel}>Numeros cobertos</span>
                      <div className={styles.shCoveredNums}>
                        {historyData.covered.map(n => (
                          <span key={n} className={`${styles.shNumChip} ${styles[`shNumChip--${getRouletteColor(n)}`]}`}>{n}</span>
                        ))}
                      </div>
                    </div>

                    <div className={styles.shFooter}>
                      <Crosshair size={10} style={{ opacity: 0.4 }} />
                      <span>Confianca: {historyData.confidence}%</span>
                      <span style={{ marginLeft: 'auto', opacity: 0.3 }}>{historyData.total} disparos</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

const TriggersPage = ({
  filteredSpinHistory,
  fullHistory,
  gameIframeComponent,
  selectedResult,
  numberPullStats,
  numberPreviousStats,
  onResultClick,
  onNumberClick,
  backendTriggerAnalysis,
}) => {
  const latestNumbers = filteredSpinHistory;
  // ✅ Cache: sinais nunca somem abruptamente.
  const signalCacheRef = useRef([]);
  const emptyCyclesRef = useRef(0);
  const MAX_EMPTY_CYCLES = 5; // após 5 renders vazios, limpa cache

  // TriggerMap do filtro (para sinais, radar, etc.)
  const triggerMap = useMemo(
    () => (filteredSpinHistory?.length >= 10)
      ? buildTriggerMap(filteredSpinHistory, filteredSpinHistory.length)
      : new Map(),
    [filteredSpinHistory]
  );

  // ✅ FIX: TriggerMap estável do histórico completo para o scoreboard.
  // O triggerMap filtrado (100 spins) tem poucos triggers → subcontabiliza.
  // O fullHistory (1000 spins) produz um mapa muito mais completo.
  const fullTriggerMap = useMemo(
    () => (fullHistory?.length >= 50)
      ? buildTriggerMap(fullHistory, fullHistory.length)
      : triggerMap,
    [fullHistory, triggerMap]
  );

  // Scoreboard: usa fullTriggerMap (estável) mas conta só dentro do filtro
  const scoreboard = useMemo(
    () => computeTriggerScoreboard(filteredSpinHistory, fullTriggerMap, LOSS_THRESHOLD),
    [filteredSpinHistory, fullTriggerMap]
  );

  // ✅ FIX: Cache + dedup + filtro de resolvidos fantasmas.
  // Sinal resolvido (win/loss) só aparece se o usuário já viu como pending.
  const activeSignals = useMemo(() => {
    let raw;
    if (backendTriggerAnalysis?.timestamp > 0) {
      raw = backendTriggerAnalysis.activeSignals || [];
    } else {
      raw = getActiveSignalsFn(filteredSpinHistory, triggerMap, LOSS_THRESHOLD);
    }

    // Dedup por triggerNumber (pendente tem prioridade sobre win/loss)
    const seen = new Map();
    for (const sig of raw) {
      const existing = seen.get(sig.triggerNumber);
      if (!existing || (sig.status === 'pending' && existing.status !== 'pending')) {
        seen.set(sig.triggerNumber, sig);
      }
    }

    // Filtra resolvidos que nunca foram vistos como pending
    const prevTriggers = new Set(signalCacheRef.current.map(s => s.triggerNumber));
    const filtered = Array.from(seen.values()).filter(sig => {
      if (sig.status === 'pending') return true; // pending sempre mostra
      return prevTriggers.has(sig.triggerNumber);  // win/loss só se já estava no cache
    });

    // Cache: atualiza com sinais filtrados, mantém por até N ciclos se vazio.
    if (filtered.length > 0) {
      signalCacheRef.current = filtered;
      emptyCyclesRef.current = 0;
    } else {
      emptyCyclesRef.current++;
      if (emptyCyclesRef.current >= MAX_EMPTY_CYCLES) {
        signalCacheRef.current = [];
      }
    }

    return signalCacheRef.current;
  }, [filteredSpinHistory, triggerMap, backendTriggerAnalysis]);

  const topTriggers = useMemo(
    () => getActiveTriggers(triggerMap).slice(0, 5),
    [triggerMap]
  );

  const activeTrigger = useMemo(
    () => filteredSpinHistory?.length > 0 ? checkTrigger(triggerMap, filteredSpinHistory[0].number) : null,
    [triggerMap, filteredSpinHistory]
  );

  const allTriggersCount = useMemo(
    () => getActiveTriggers(triggerMap).length,
    [triggerMap]
  );

  // Números a destacar na RacingTrack
  const racingTargets = useMemo(() => {
    const sig = activeSignals.find(s => s.status === 'pending' || s.status === 'win');
    return sig ? sig.coveredNumbers : [];
  }, [activeSignals]);

  return (
    <div className={styles.page}>
      <div className={styles.layout}>

        {/* ── ESQUERDA: Histórico + Radar ── */}
        <aside className={styles.leftCol}>
          <Suspense fallback={null}>
            <ResultsGrid
              latestNumbers={latestNumbers}
              numberPullStats={numberPullStats}
              numberPreviousStats={numberPreviousStats}
              onResultClick={onResultClick}
              forceCols={10}
            />
          </Suspense>
          <TriggerRadar topTriggers={topTriggers} spinHistory={filteredSpinHistory} />
        </aside>

        {/* ── MEIO: Jogo + RacingTrack ── */}
        <section className={styles.middleCol}>
          {gameIframeComponent && (
            <div className={styles.gameWrapper}>
              {gameIframeComponent}
            </div>
          )}
          <div className={styles.racetrackWrapper}>
            <Suspense fallback={null}>
              <RacingTrack
                selectedResult={selectedResult}
                onNumberClick={onNumberClick || (() => {})}
                targetSignals={racingTargets}
                entrySignals={[]}
              />
            </Suspense>
          </div>
        </section>

        {/* ── DIREITA: Placar + Sinais + Gatilhos ── */}
        <aside className={styles.rightCol}>
          <div className={styles.rightContent}>
            <TriggerScoreboard wins={scoreboard.wins} losses={scoreboard.losses} />
            <ActiveSignalsPanel
              signals={activeSignals}
              spinHistory={filteredSpinHistory}
              triggerMap={triggerMap}
            />
            <TriggerStrategiesPanel
              spinHistory={filteredSpinHistory}
              triggerMap={triggerMap}
            />
          </div>
        </aside>

      </div>
    </div>
  );
};

export default TriggersPage;
