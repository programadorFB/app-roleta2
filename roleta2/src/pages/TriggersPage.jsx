// pages/TriggersPage.jsx — v5 BACKEND-DRIVEN SIGNALS + expand history

import React, { useMemo, useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { Zap, Clock, ChevronDown, Crosshair } from 'lucide-react';
import TriggerStrategiesPanel from '../components/TriggerStrategiesPanel';
import { buildTriggerMap, getActiveTriggers, getActiveSignals as getActiveSignalsFn } from '../analysis/triggerAnalysis';
import { getRouletteColor, LOSS_THRESHOLD, API_URL } from '../constants/roulette';
import { signedFetch } from '../lib/signedFetch';
import TriggerRadar from '../components/TriggerRadar';
import styles from './TriggersPage.module.css';

const RacingTrack = lazy(() => import('../components/RacingTrack.jsx'));
const ResultsGrid = lazy(() => import('../components/ResultGrid.jsx'));

// Confiança mínima para entrar no histórico de gatilhos (regra de negócio)
const MIN_CONFIDENCE = 50;
// Quantos gatilhos manter no histórico
const HISTORY_LIMIT = 6;

// ── Histórico individual de um gatilho (apenas contagens, sem taxa) ──────
// A confiança canônica vem do backend via sig.confidence — não recalcula aqui.
function buildTriggerHistory(triggerNumber, spinHistory, triggerMap, fallbackSignal) {
  const profile = triggerMap.get(triggerNumber);
  const covered = profile?.bestPattern?.coveredNumbers || fallbackSignal?.coveredNumbers;
  if (!covered) return null;

  const action = profile?.bestPattern?.label || fallbackSignal?.action || '';

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
    triggerNumber, action, covered,
    g1, g2, g3, red, total, wins,
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

// Chave única por evento (id do DB; fallback p/ análise local sem id)
const signalKey = (sig) => sig.id ?? `${sig.triggerNumber}-${sig.timestamp ?? sig.spinsAgo}`;

// ── Histórico de Gatilhos (com detalhe expandível) ─────────────
const TriggerHistoryPanel = ({ signals, spinHistory, triggerMap }) => {
  const [expandedId, setExpandedId] = useState(null);

  const expandedSignal = useMemo(
    () => expandedId != null ? signals.find(s => signalKey(s) === expandedId) : null,
    [expandedId, signals]
  );

  const historyData = useMemo(() => {
    if (!expandedSignal) return null;
    return buildTriggerHistory(expandedSignal.triggerNumber, spinHistory, triggerMap, expandedSignal);
  }, [expandedSignal, spinHistory, triggerMap]);

  const handleClick = useCallback((sig) => {
    const k = signalKey(sig);
    setExpandedId(prev => prev === k ? null : k);
  }, []);

  return (
    <div className={styles.signalsPanel}>
      <div className={styles.signalsPanelHeader}>
        <Zap size={13} className={styles.signalsPanelIcon} />
        <span>Histórico de Gatilhos</span>
      </div>
      {(!signals || signals.length === 0) ? (
        <div className={styles.noSignals}>
          <Clock size={14} style={{ opacity: 0.25 }} />
          <span>Sem gatilhos recentes</span>
        </div>
      ) : (
        <div className={styles.signalsList}>
          {signals.map((sig) => {
            const col = getRouletteColor(sig.triggerNumber);
            const k = signalKey(sig);
            const isExpanded = expandedId === k;
            const pctColor = sig.confidence >= 60 ? '#34d399' : sig.confidence >= 40 ? '#c9a052' : '#ef4444';

            return (
              <div key={k} className={styles.signalItem}>
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
                        <span className={styles.shStatVal} style={{ color: 'rgba(255,255,255,0.85)' }}>
                          {historyData.wins}/{historyData.total}
                        </span>
                        <span className={styles.shStatLbl}>Janela</span>
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
  backendTriggerAnalysis,
  selectedRoulette,
  historyFilter,
  userEmail,
}) => {
  const latestNumbers = filteredSpinHistory;

  // TriggerMap do filtro (para sinais, radar, etc.)
  const triggerMap = useMemo(
    () => (filteredSpinHistory?.length >= 4)
      ? buildTriggerMap(filteredSpinHistory, filteredSpinHistory.length)
      : new Map(),
    [filteredSpinHistory]
  );

  // Scoreboard: vem do backend (DB), filtrado por rodadas
  const [backendScoreboard, setBackendScoreboard] = useState({ wins: 0, losses: 0 });

  useEffect(() => {
    if (!selectedRoulette || !userEmail) return;
    const limit = historyFilter === 'all' ? 'all' : Number(historyFilter);
    signedFetch(`${API_URL}/api/trigger-score?source=${selectedRoulette}&limit=${limit}&userEmail=${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setBackendScoreboard({ wins: data.wins, losses: data.losses }); })
      .catch(() => {});
  }, [selectedRoulette, historyFilter, userEmail, backendTriggerAnalysis?.timestamp]);

  // Histórico: últimos N gatilhos qualificados (≥ MIN_CONFIDENCE),
  // ordenados do mais recente para o mais antigo.
  const activeSignals = useMemo(() => {
    let raw;
    if (backendTriggerAnalysis?.timestamp > 0) {
      raw = backendTriggerAnalysis.activeSignals || [];
    } else {
      raw = getActiveSignalsFn(filteredSpinHistory, triggerMap, LOSS_THRESHOLD);
    }

    const qualified = raw.filter(s => (s.confidence || 0) >= MIN_CONFIDENCE);

    // Sem dedup: cada disparo é um evento independente (mesmo triggerNumber
    // pode aparecer 2+ vezes se disparou repetido).
    return qualified.slice(0, HISTORY_LIMIT);
  }, [filteredSpinHistory, triggerMap, backendTriggerAnalysis]);

  const topTriggers = useMemo(
    () => getActiveTriggers(triggerMap).slice(0, 5),
    [triggerMap]
  );

  // activeTrigger vem do backend (fonte canônica) — sem cálculo local.
  // Gate ≥ MIN_CONFIDENCE: só é "gatilho ativo" se atingir o threshold.
  const activeTrigger = useMemo(() => {
    const t = backendTriggerAnalysis?.activeTrigger;
    if (!t || (t.confidence ?? 0) < MIN_CONFIDENCE) return null;
    return t;
  }, [backendTriggerAnalysis]);

  const allTriggersCount = useMemo(
    () => getActiveTriggers(triggerMap).length,
    [triggerMap]
  );

  // Números a destacar na RacingTrack:
  // 1) gatilho pending no histórico tem prioridade (já registrado no DB)
  // 2) fallback: activeTrigger do backend (mesmo número que acabou de virar pending)
  const racingTargets = useMemo(() => {
    const pending = activeSignals.find(s => s.status === 'pending');
    if (pending) return pending.coveredNumbers;
    if (activeTrigger?.coveredNumbers) return activeTrigger.coveredNumbers;
    return [];
  }, [activeSignals, activeTrigger]);

  // --- Renderização condicional para evitar tela escura ---
  if (!backendTriggerAnalysis || backendTriggerAnalysis.source !== selectedRoulette) {
    return (
      <div className={styles.emptyState}>
        Carregando gatilhos da {selectedRoulette.replace('_', ' ')}...
      </div>
    );
  }

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
            <TriggerScoreboard wins={backendScoreboard.wins} losses={backendScoreboard.losses} />
            <TriggerHistoryPanel
              signals={activeSignals}
              spinHistory={filteredSpinHistory}
              triggerMap={triggerMap}
            />
            <TriggerStrategiesPanel
              spinHistory={filteredSpinHistory}
              triggerMap={triggerMap}
              activeTrigger={activeTrigger}
            />
          </div>
        </aside>

      </div>
    </div>
  );
};

export default TriggersPage;
