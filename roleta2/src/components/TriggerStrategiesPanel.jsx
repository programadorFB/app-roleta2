// components/TriggerStrategiesPanel.jsx — v6 LOCAL COMPUTATION
// Computa assertividade localmente do spinHistory filtrado

import React, { useMemo, useState } from 'react';
import { Zap, Crosshair, Hash, Target, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { checkTrigger, getActiveTriggers } from '../analysis/triggerAnalysis';
import { PHYSICAL_WHEEL, getRouletteColor, LOSS_THRESHOLD } from '../constants/roulette';
import styles from './TriggerStrategiesPanel.module.css';

function getHeatLabel(lift) {
  if (lift >= 12) return { label: 'QUENTE', color: '#ef4444' };
  if (lift >= 8)  return { label: 'AQUECIDO', color: '#f97316' };
  if (lift >= 5)  return { label: 'MORNO', color: '#c9a052' };
  return { label: 'FRIO', color: '#64748b' };
}

// ── Chip de número ──────────────────────────────────────────
const NumberChip = ({ number, size = 'normal', highlighted = false }) => {
  const color = getRouletteColor(number);
  const cls = [
    styles.chip, styles[`chip--${color}`],
    size === 'large' && styles['chip--large'],
    highlighted && styles['chip--highlighted'],
  ].filter(Boolean).join(' ');
  return <span className={cls}>{number}</span>;
};

// ── Card do gatilho ativo (último spin) ─────────────────────
const ActiveTriggerCard = ({ trigger }) => {
  if (!trigger) return null;
  return (
    <div className={styles.activeTrigger}>
      <div className={styles.activeTriggerHeader}>
        <div className={styles.activeTriggerIcon}>
          <Zap size={18} color="#c9a052" />
        </div>
        <div>
          <div className={styles.activeTriggerTitle}>GATILHO ATIVO</div>
          <div className={styles.activeTriggerSubtitle}>
            Numero <strong>{trigger.trigger}</strong> acabou de sair
          </div>
        </div>
      </div>
      <div className={styles.activeTriggerBody}>
        <div className={styles.activeTriggerAction}>
          <span className={styles.actionLabel}>Apostar em:</span>
          <span className={styles.actionValue}>{trigger.action}</span>
        </div>
        <div className={styles.activeTriggerNumbers}>
          {trigger.coveredNumbers
            .sort((a, b) => PHYSICAL_WHEEL.indexOf(a) - PHYSICAL_WHEEL.indexOf(b))
            .map(n => <NumberChip key={n} number={n} highlighted />)}
        </div>
        <div className={styles.activeTriggerStats}>
          <div className={styles.statBlock}>
            <span className={styles.statBlockLabel}>Confianca</span>
            <span className={styles.statBlockValue} style={{ color: '#c9a052' }}>{trigger.confidence}%</span>
          </div>
          <div className={styles.statBlock}>
            <span className={styles.statBlockLabel}>Forca</span>
            <span className={styles.statBlockValue} style={{ color: getHeatLabel(trigger.lift).color }}>{getHeatLabel(trigger.lift).label}</span>
          </div>
          <div className={styles.statBlock}>
            <span className={styles.statBlockLabel}>Acertos</span>
            <span className={styles.statBlockValue}>{trigger.hits}/{trigger.total}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TYPE_ICONS = {
  terminal_puro:   Hash,
  terminal_viz:    Hash,
  regiao_pequena:  Crosshair,
  regiao_grande:   Crosshair,
};

// ── Chip de resultado (G1/G2/G3 = verde, R = vermelho) ──────
const ResultChip = ({ result }) => {
  const isWin = result !== 'R';
  return (
    <span className={`${styles.resultChip} ${isWin ? styles['resultChip--win'] : styles['resultChip--loss']}`}>
      {result}
    </span>
  );
};

// ── Linha da tabela de assertividade por tipo ────────────────
const TypeRow = ({ data, isExpanded, onToggle }) => {
  const Icon = TYPE_ICONS[data.key] || Crosshair;
  const pctColor = data.pct >= 60 ? '#34d399' : data.pct >= 40 ? '#c9a052' : '#ef4444';

  return (
    <>
      <div className={styles.typeBlock} onClick={onToggle}>
        <div className={styles.typeHeader}>
          <Icon size={13} className={styles.typeIcon} />
          <span className={styles.typeName}>{data.label}</span>
          <span className={styles.typePct} style={{ color: pctColor }}>{data.pct}%</span>
          <span className={styles.typeExpand}>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </div>

        <div className={styles.typeChipsRow}>
          {data.recentResults.map((r, i) => <ResultChip key={i} result={r} />)}
        </div>

        <div className={styles.typeStatsRow}>
          <span className={styles.typeStat}><span className={styles.typeStatLabel}>G1</span> {data.g1}</span>
          <span className={styles.typeStat}><span className={styles.typeStatLabel}>G2</span> {data.g2}</span>
          <span className={styles.typeStat}><span className={styles.typeStatLabel}>G3</span> {data.g3}</span>
          <span className={`${styles.typeStat} ${styles['typeStat--red']}`}><span className={styles.typeStatLabel}>RED</span> {data.red}</span>
        </div>
      </div>
    </>
  );
};

// ══════════════════════════════════════════════════════════════
// ASSERTIVIDADE — calcula G1/G2/G3/RED por tipo de gatilho
// ══════════════════════════════════════════════════════════════

function classifyTrigger(profile) {
  if (!profile?.bestPattern) return null;
  const { type, neighbors } = profile.bestPattern;
  if (type === 'terminal' && neighbors === 0) return 'terminal_puro';
  if (type === 'terminal') return 'terminal_viz';
  if (type === 'region' && neighbors <= 3) return 'regiao_pequena';
  if (type === 'region') return 'regiao_grande';
  return null;
}

const TYPE_LABELS = {
  terminal_puro: 'Terminais',
  terminal_viz: 'Terminal + Viz',
  regiao_pequena: 'Regiao Curta',
  regiao_grande: 'Regiao Larga',
};

function computeAssertivity(spinHistory, triggerMap) {
  const types = {};
  for (const key of Object.keys(TYPE_LABELS)) {
    types[key] = { g1: 0, g2: 0, g3: 0, red: 0, results: [] };
  }

  for (let i = LOSS_THRESHOLD; i < spinHistory.length; i++) {
    const num = spinHistory[i].number;
    const profile = triggerMap.get(num);
    const cat = classifyTrigger(profile);
    if (!cat) continue;

    const covered = profile.bestPattern.coveredNumbers;
    let hitOn = 0;
    for (let j = 1; j <= LOSS_THRESHOLD; j++) {
      const checkIdx = i - j;
      if (checkIdx < 0) break;
      if (covered.includes(spinHistory[checkIdx].number)) { hitOn = j; break; }
    }

    const bucket = types[cat];
    if (hitOn === 1) { bucket.g1++; bucket.results.push('G1'); }
    else if (hitOn === 2) { bucket.g2++; bucket.results.push('G2'); }
    else if (hitOn === 3) { bucket.g3++; bucket.results.push('G3'); }
    else { bucket.red++; bucket.results.push('R'); }
  }

  const result = [];
  for (const [key, data] of Object.entries(types)) {
    const total = data.g1 + data.g2 + data.g3 + data.red;
    if (total === 0) continue;
    const wins = data.g1 + data.g2 + data.g3;
    result.push({
      key, label: TYPE_LABELS[key],
      g1: data.g1, g2: data.g2, g3: data.g3, red: data.red,
      total, pct: Math.round((wins / total) * 100),
      recentResults: [...data.results].reverse(),
    });
  }
  result.sort((a, b) => b.pct - a.pct);
  return result;
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const TriggerStrategiesPanel = ({ spinHistory, triggerMap: externalTriggerMap }) => {
  const [expandedType, setExpandedType] = useState(null);

  const triggerMap = externalTriggerMap || new Map();

  const activeTrigger = useMemo(() => {
    if (!spinHistory || spinHistory.length === 0) return null;
    return checkTrigger(triggerMap, spinHistory[0].number);
  }, [triggerMap, spinHistory]);

  const allTriggers = useMemo(() => getActiveTriggers(triggerMap), [triggerMap]);

  const types = useMemo(
    () => computeAssertivity(spinHistory, triggerMap),
    [spinHistory, triggerMap]
  );

  const totals = useMemo(() => {
    const t = { g1: 0, g2: 0, g3: 0, red: 0, total: 0 };
    for (const a of types) {
      t.g1 += a.g1; t.g2 += a.g2; t.g3 += a.g3; t.red += a.red; t.total += a.total;
    }
    t.pct = t.total > 0 ? Math.round(((t.g1 + t.g2 + t.g3) / t.total) * 100) : 0;
    return t;
  }, [types]);

  if (!spinHistory || spinHistory.length < 10) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Target size={28} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
          <p>Aguardando rodadas...</p>
          <div className={styles.progressMini}>
            <div className={styles.progressMiniFill} style={{ width: `${(spinHistory?.length || 0) / 10 * 100}%` }} />
          </div>
          <span className={styles.emptyCount}>{spinHistory?.length || 0}/10</span>
        </div>
      </div>
    );
  }

  const totalPctColor = totals.pct >= 60 ? '#34d399' : totals.pct >= 40 ? '#c9a052' : '#ef4444';

  return (
    <div className={styles.container}>
      {activeTrigger ? (
        <ActiveTriggerCard trigger={activeTrigger} />
      ) : (
        <div className={styles.noTrigger}>
          <Clock size={18} style={{ opacity: 0.4, flexShrink: 0 }} />
          <div>
            <strong>Nenhum gatilho ativo</strong>
            <p>Numero {spinHistory[0]?.number} sem padrao. Aguarde.</p>
          </div>
        </div>
      )}

      <div className={styles.assertTable}>
        <div className={styles.assertHeader}>
          <span className={styles.assertTitle}>
            <Crosshair size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            ASSERTIVIDADE ({spinHistory.length} RODADAS)
          </span>
        </div>

        {types.map(data => (
          <TypeRow
            key={data.key}
            data={data}
            isExpanded={expandedType === data.key}
            onToggle={() => setExpandedType(expandedType === data.key ? null : data.key)}
          />
        ))}

        {types.length === 0 && (
          <div className={styles.noData}>Nenhum gatilho disparou ainda</div>
        )}

        {types.length > 0 && (
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>TOTAL</span>
            <span className={styles.totalPct} style={{ color: totalPctColor }}>{totals.pct}%</span>
            <div className={styles.totalStats}>
              <span className={styles.totalStat}>G1 <strong>{totals.g1}</strong></span>
              <span className={styles.totalStat}>G2 <strong>{totals.g2}</strong></span>
              <span className={styles.totalStat}>G3 <strong>{totals.g3}</strong></span>
              <span className={`${styles.totalStat} ${styles['totalStat--red']}`}>RED <strong>{totals.red}</strong></span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.legend}>
        <span>G1-G3 = acertou na tentativa 1/2/3</span>
        <span>RED = errou todas</span>
        <span>{allTriggers.length} gatilhos mapeados</span>
      </div>
    </div>
  );
};

export default TriggerStrategiesPanel;
