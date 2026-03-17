// pages/TriggersPage.jsx — v4 PURE COUNT SIGNALS

import React, { useMemo, useRef, useState, useCallback, Suspense, lazy } from 'react';
import { Zap, Clock, TrendingUp, ChevronDown, Crosshair } from 'lucide-react';
import TriggerStrategiesPanel from '../components/TriggerStrategiesPanel';
import { buildTriggerMap, computeTriggerScoreboard } from '../services/triggerAnalysis';
import { getRouletteColor, LOSS_THRESHOLD } from '../constants/roulette';
import TriggerRadar from '../components/TriggerRadar';
import styles from './TriggersPage.module.css';

const RacingTrack = lazy(() => import('../components/RacingTrack.jsx'));
const ResultsGrid = lazy(() => import('../components/ResultGrid.jsx'));

// Quantos sinais recentes mostrar no painel lateral
const MAX_VISIBLE_SIGNALS = 10;

// ══════════════════════════════════════════════════════════════
// SIGNAL ENGINE — Cache-based para evitar sinais desaparecendo
//
// Problema anterior: a lista era reconstruída do zero a cada render.
// Se o triggerMap mudava (número perdia significância estatística),
// sinais pendentes sumiam instantaneamente.
//
// Fix: useRef guarda os dados do padrão no momento da detecção.
// Sinais persistem até serem resolvidos (win/loss) e saírem da janela.
// ══════════════════════════════════════════════════════════════

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

// ── Historico individual de um gatilho ─────────────────────────
function buildTriggerHistory(triggerNumber, spinHistory, triggerMap) {
  const profile = triggerMap.get(triggerNumber);
  if (!profile?.bestPattern) return null;

  const covered = profile.bestPattern.coveredNumbers;
  const results = []; // { result: 'G1'|'G2'|'G3'|'RED', spins: [trigger, ...checks] }

  for (let i = LOSS_THRESHOLD; i < spinHistory.length; i++) {
    if (spinHistory[i].number !== triggerNumber) continue;

    let hitOn = 0;
    const checksNums = [];
    for (let j = 1; j <= LOSS_THRESHOLD; j++) {
      const ci = i - j;
      if (ci < 0) break;
      checksNums.push(spinHistory[ci].number);
      if (!hitOn && covered.includes(spinHistory[ci].number)) hitOn = j;
    }

    const label = hitOn ? `G${hitOn}` : 'RED';
    results.push({ label, hitOn, checksNums });
  }

  const g1 = results.filter(r => r.hitOn === 1).length;
  const g2 = results.filter(r => r.hitOn === 2).length;
  const g3 = results.filter(r => r.hitOn === 3).length;
  const red = results.filter(r => !r.hitOn).length;
  const total = results.length;
  const wins = g1 + g2 + g3;
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0;

  return {
    triggerNumber,
    action: profile.bestPattern.label,
    covered,
    confidence: profile.bestPattern.confidence,
    g1, g2, g3, red, total, wins, pct,
    recentResults: results.slice(0, 20).map(r => r.label),
  };
}

// ── Sinais em Progresso (com historico expandivel) ─────────────
const ActiveSignalsPanel = ({ signals, perTriggerStats, spinHistory, triggerMap }) => {
  const [expanded, setExpanded] = useState(null); // triggerNumber or null
  const [historyData, setHistoryData] = useState(null);

  const handleClick = useCallback((triggerNumber) => {
    if (expanded === triggerNumber) {
      setExpanded(null);
      setHistoryData(null);
    } else {
      setExpanded(triggerNumber);
      setHistoryData(buildTriggerHistory(triggerNumber, spinHistory, triggerMap));
    }
  }, [expanded, spinHistory, triggerMap]);

  return (
    <div className={styles.signalsPanel}>
      <div className={styles.signalsPanelHeader}>
        <Zap size={13} className={styles.signalsPanelIcon} />
        <span>Sinais em Progresso</span>
      </div>
      {signals.length === 0 ? (
        <div className={styles.noSignals}>
          <Clock size={14} style={{ opacity: 0.25 }} />
          <span>Nenhum sinal ativo</span>
        </div>
      ) : (
        <div className={styles.signalsList}>
          {signals.map((sig) => {
            const col = getRouletteColor(sig.triggerNumber);
            const pt = perTriggerStats?.get(sig.triggerNumber);
            const ptPct = pt && pt.total > 0 ? Math.round((pt.wins / pt.total) * 100) : null;
            const ptColor = ptPct !== null ? (ptPct >= 60 ? '#34d399' : ptPct >= 40 ? '#c9a052' : '#ef4444') : null;
            const isExpanded = expanded === sig.triggerNumber;

            return (
              <div key={`${sig.triggerNumber}-${sig.spinsAgo}`} className={styles.signalItem}>
                <div
                  className={`${styles.signalRow} ${styles[`signalRow--${sig.status}`]} ${isExpanded ? styles['signalRow--active'] : ''}`}
                  onClick={() => handleClick(sig.triggerNumber)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`${styles.signalChip} ${styles[`signalChip--${col}`]}`}>
                    {sig.triggerNumber}
                  </span>
                  <span className={styles.signalAction}>{sig.action}</span>
                  {ptPct !== null && (
                    <span className={styles.signalHitRate} style={{ color: ptColor }}>
                      {ptPct}%
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

                {/* ── Expanded history panel ── */}
                {isExpanded && historyData && (
                  <div className={styles.signalHistory}>
                    {/* Stats row */}
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

                    {/* Recent results chips */}
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

                    {/* Covered numbers */}
                    <div className={styles.shCovered}>
                      <span className={styles.shCoveredLabel}>Numeros cobertos</span>
                      <div className={styles.shCoveredNums}>
                        {historyData.covered.map(n => (
                          <span key={n} className={`${styles.shNumChip} ${styles[`shNumChip--${getRouletteColor(n)}`]}`}>{n}</span>
                        ))}
                      </div>
                    </div>

                    {/* Confidence */}
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
  gameIframeComponent,
  selectedResult,
  numberPullStats,
  numberPreviousStats,
  onResultClick,
  onNumberClick,
}) => {
  const latestNumbers = filteredSpinHistory;

  const triggerMap = useMemo(
    () => buildTriggerMap(filteredSpinHistory, filteredSpinHistory.length),
    [filteredSpinHistory]
  );

  // Scoreboard calculado localmente a partir dos dados filtrados
  const scoreboard = useMemo(
    () => computeTriggerScoreboard(filteredSpinHistory, triggerMap, LOSS_THRESHOLD),
    [filteredSpinHistory, triggerMap]
  );

  // Cache de sinais: congela dados do padrão no momento da detecção
  // para que mudanças no triggerMap não façam sinais pendentes sumirem
  const signalCacheRef = useRef(new Map());

  const activeSignals = useMemo(() => {
    if (!filteredSpinHistory || filteredSpinHistory.length < 2) return [];

    const cache = signalCacheRef.current;

    // Index signalId → posição no array para lookup O(1)
    const scanLimit = Math.min(filteredSpinHistory.length - 1, 50);
    const idxById = new Map();
    for (let i = 0; i <= scanLimit; i++) {
      idxById.set(filteredSpinHistory[i].signalId, i);
    }

    // 1. Detecta novos triggers e congela os dados do padrão no cache
    for (let i = 0; i <= scanLimit; i++) {
      const spin = filteredSpinHistory[i];
      if (cache.has(spin.signalId)) continue;

      const profile = triggerMap.get(spin.number);
      if (!profile?.bestPattern) continue;

      cache.set(spin.signalId, {
        triggerNumber: spin.number,
        action: profile.bestPattern.label,
        coveredNumbers: [...profile.bestPattern.coveredNumbers],
        confidence: profile.bestPattern.confidence,
      });
    }

    // 2. Monta lista de sinais a partir do cache, atualiza status
    const entries = [];
    const toDelete = [];
    for (const [signalId, data] of cache) {
      const idx = idxById.get(signalId);
      if (idx === undefined || idx >= 50) {
        toDelete.push(signalId);
        continue;
      }
      entries.push({ signalId, data, idx });
    }
    toDelete.forEach(k => cache.delete(k));

    // Ordena por recência (menor idx = mais recente)
    entries.sort((a, b) => a.idx - b.idx);

    const signals = [];
    const seen = new Set();

    for (const { data, idx } of entries) {
      // Deduplica: mesmo trigger em sequência, mostra só o mais recente
      const signalKey = `${data.triggerNumber}-${data.action}`;
      if (seen.has(signalKey)) continue;
      seen.add(signalKey);

      let status = 'pending';
      let remaining = LOSS_THRESHOLD;
      let winAttempt = 0;
      let checksAvailable = 0;

      for (let j = 1; j <= LOSS_THRESHOLD; j++) {
        const checkIdx = idx - j;
        if (checkIdx < 0) break;
        checksAvailable++;
        if (data.coveredNumbers.includes(filteredSpinHistory[checkIdx].number)) {
          status = 'win';
          remaining = 0;
          winAttempt = j;
          break;
        }
      }

      if (status !== 'win') {
        if (checksAvailable >= LOSS_THRESHOLD) {
          status = 'loss';
          remaining = 0;
        } else {
          remaining = LOSS_THRESHOLD - checksAvailable;
        }
      }

      signals.push({
        triggerNumber: data.triggerNumber,
        action: data.action,
        coveredNumbers: data.coveredNumbers,
        confidence: data.confidence,
        status,
        remaining,
        winAttempt,
        spinsAgo: idx,
      });

      if (signals.length >= MAX_VISIBLE_SIGNALS) break;
    }

    return signals;
  }, [filteredSpinHistory, triggerMap]);

  // Per-trigger hit rate (individual assertivity)
  const perTriggerStats = useMemo(() => {
    const stats = new Map();
    const len = filteredSpinHistory.length;
    for (let i = LOSS_THRESHOLD; i < len; i++) {
      const num = filteredSpinHistory[i].number;
      const profile = triggerMap.get(num);
      if (!profile?.bestPattern) continue;
      const covered = profile.bestPattern.coveredNumbers;
      let hit = false;
      for (let j = 1; j <= LOSS_THRESHOLD; j++) {
        const ci = i - j;
        if (ci < 0) break;
        if (covered.includes(filteredSpinHistory[ci].number)) { hit = true; break; }
      }
      if (!stats.has(num)) stats.set(num, { wins: 0, total: 0 });
      const s = stats.get(num);
      s.total++;
      if (hit) s.wins++;
    }
    return stats;
  }, [filteredSpinHistory, triggerMap]);

  // Números a destacar na RacingTrack: cobertos pelo sinal mais recente pending/win
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
          <TriggerRadar
            triggerMap={triggerMap}
            spinHistory={filteredSpinHistory}
          />
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
            <ActiveSignalsPanel signals={activeSignals} perTriggerStats={perTriggerStats} spinHistory={filteredSpinHistory} triggerMap={triggerMap} />
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