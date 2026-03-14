// components/TriggerStrategiesPanel.jsx — v3 CLEAN UI

import React, { useMemo, useState } from 'react';
import { Zap, BarChart3, Crosshair, Hash, Target, Clock, ChevronUp, ChevronDown, List, CircleDot } from 'lucide-react';
import {
  buildTriggerMap,
  checkTrigger,
  getActiveTriggers,
  backtestTriggers,
} from '../services/triggerAnalysis';
import { PHYSICAL_WHEEL, RED_NUMBERS } from '../constants/roulette';
import styles from './TriggerStrategiesPanel.module.css';

// ── Helpers (importados em vez de redefinidos) ────────────────
function getColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

// ── Componentes internos ─────────────────────────────────────

const NumberChip = ({ number, size = 'normal', highlighted = false, pulsing = false }) => {
  const color = getColor(number);
  const cls = [
    styles.chip, styles[`chip--${color}`],
    size === 'large' && styles['chip--large'],
    highlighted && styles['chip--highlighted'],
    pulsing && styles['chip--pulsing'],
  ].filter(Boolean).join(' ');
  return <span className={cls}>{number}</span>;
};

const ConfidenceBadge = ({ value, lift }) => {
  let tier = 'low';
  if (lift >= 8) tier = 'high';
  else if (lift >= 5) tier = 'medium';
  return (
    <span className={`${styles.badge} ${styles[`badge--${tier}`]}`}>
      {value}% <span className={styles.badgeLift}>(+{lift}pp)</span>
    </span>
  );
};

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
            <span className={styles.statBlockLabel}>Lift</span>
            <span className={styles.statBlockValue} style={{ color: '#34d399' }}>+{trigger.lift}pp</span>
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

const BacktestCard = ({ backtest }) => {
  const { wins, losses, total, hitRate, method, validFor, note } = backtest;
  if (total === 0) return null;

  let color = '#ef4444';
  if (hitRate >= 30) color = '#34d399';
  else if (hitRate >= 20) color = '#c9a052';

  const isReliable = method === 'train-test-split';

  return (
    <div className={styles.backtestCard}>
      <div className={styles.backtestTitle}>
        <BarChart3 size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'rgba(201,160,82,0.6)' }} />
        Backtest (ultimas 200 rodadas{validFor > 1 ? ` · ${validFor} spins` : ''})
        {isReliable
          ? <span style={{ color: '#34d399', fontSize: '0.6rem', marginLeft: 8 }}>&#10003; train/test split</span>
          : <span style={{ color: '#c9a052', fontSize: '0.6rem', marginLeft: 8 }}>&#9888; in-sample</span>
        }
      </div>
      <div className={styles.backtestGrid}>
        <div className={styles.backtestItem}>
          <span className={styles.backtestLabel}>Disparados</span>
          <span className={styles.backtestValue}>{total}</span>
        </div>
        <div className={styles.backtestItem}>
          <span className={styles.backtestLabel}>Acertos</span>
          <span className={styles.backtestValue} style={{ color: '#34d399' }}>{wins}</span>
        </div>
        <div className={styles.backtestItem}>
          <span className={styles.backtestLabel}>Erros</span>
          <span className={styles.backtestValue} style={{ color: '#ef4444' }}>{losses}</span>
        </div>
        <div className={styles.backtestItem}>
          <span className={styles.backtestLabel}>Taxa</span>
          <span className={styles.backtestValue} style={{ color, fontSize: '1.2rem' }}>{hitRate}%</span>
        </div>
      </div>
      {note && <div style={{ fontSize: '0.6rem', color: 'rgba(201,160,82,0.4)', marginTop: 6, textAlign: 'center' }}>{note}</div>}
    </div>
  );
};

const TriggerRow = ({ trigger, isExpanded, onToggle }) => (
  <>
    <tr className={styles.triggerRow} onClick={onToggle}>
      <td><NumberChip number={trigger.triggerNumber} /></td>
      <td className={styles.triggerAction}>
        {trigger.type === 'region'
          ? <Crosshair size={12} style={{ verticalAlign: 'middle', marginRight: 4, opacity: 0.5 }} />
          : <Hash size={12} style={{ verticalAlign: 'middle', marginRight: 4, opacity: 0.5 }} />
        }
        {trigger.label}
      </td>
      <td><ConfidenceBadge value={trigger.confidence} lift={trigger.lift} /></td>
      <td className={styles.triggerHits}>{trigger.hits}/{trigger.total}</td>
      <td className={styles.triggerExpand}>
        {isExpanded
          ? <ChevronUp size={14} style={{ opacity: 0.4 }} />
          : <ChevronDown size={14} style={{ opacity: 0.4 }} />
        }
      </td>
    </tr>
    {isExpanded && (
      <tr className={styles.triggerDetailRow}>
        <td colSpan={5}>
          <div className={styles.triggerDetailContent}>
            <div className={styles.detailLabel}>Numeros cobertos:</div>
            <div className={styles.detailChips}>
              {trigger.coveredNumbers
                .sort((a, b) => PHYSICAL_WHEEL.indexOf(a) - PHYSICAL_WHEEL.indexOf(b))
                .map(n => <NumberChip key={n} number={n} size="normal" />)}
            </div>
            <div className={styles.detailMeta}>
              <span>Aparicoes: <strong>{trigger.appearances}x</strong></span>
              <span>Esperado: <strong>{trigger.expected}%</strong></span>
              <span>Tipo: <strong>{trigger.type === 'region' ? 'Regiao' : 'Terminal'}</strong></span>
            </div>
          </div>
        </td>
      </tr>
    )}
  </>
);

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const TriggerStrategiesPanel = ({ spinHistory }) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const triggerMap = useMemo(() => buildTriggerMap(spinHistory, 2000), [spinHistory]);
  const activeTrigger = useMemo(() => {
    if (spinHistory.length === 0) return null;
    return checkTrigger(triggerMap, spinHistory[0].number);
  }, [triggerMap, spinHistory]);
  const allTriggers = useMemo(() => getActiveTriggers(triggerMap), [triggerMap]);
  const backtest = useMemo(() => backtestTriggers(spinHistory, triggerMap, 200), [spinHistory, triggerMap]);

  if (spinHistory.length < 50) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Target size={28} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
          <p>Aguardando pelo menos 50 rodadas para calibrar os gatilhos...</p>
          <div className={styles.progressMini}>
            <div className={styles.progressMiniFill} style={{ width: `${(spinHistory.length / 50) * 100}%` }} />
          </div>
          <span className={styles.emptyCount}>{spinHistory.length}/50</span>
        </div>
      </div>
    );
  }

  const displayTriggers = showAll ? allTriggers : allTriggers.slice(0, 15);
  const windowSize = Math.min(2000, spinHistory.length);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          <Crosshair size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: '#c9a052' }} />
          Gatilhos por Numero
        </h3>
        <span className={styles.subtitle}>
          Analise sobre {windowSize.toLocaleString()} rodadas · {allTriggers.length} gatilhos ativos
        </span>
      </div>

      {activeTrigger ? (
        <ActiveTriggerCard trigger={activeTrigger} />
      ) : (
        <div className={styles.noTrigger}>
          <Clock size={20} style={{ opacity: 0.4, flexShrink: 0 }} />
          <div>
            <strong>Nenhum gatilho ativo</strong>
            <p>O numero {spinHistory[0]?.number} nao possui padrao forte identificado. Aguarde o proximo giro.</p>
          </div>
        </div>
      )}

      <BacktestCard backtest={backtest} />

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span>
            <List size={14} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.5 }} />
            Todos os Gatilhos Mapeados
          </span>
          <span className={styles.tableCount}>{allTriggers.length} padroes</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Gatilho</th>
                <th>Aposta</th>
                <th>Confianca</th>
                <th>Acertos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayTriggers.map(t => (
                <TriggerRow key={t.triggerNumber} trigger={t}
                  isExpanded={expandedRow === t.triggerNumber}
                  onToggle={() => setExpandedRow(expandedRow === t.triggerNumber ? null : t.triggerNumber)} />
              ))}
            </tbody>
          </table>
        </div>
        {allTriggers.length > 15 && (
          <button className={styles.showAllBtn} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${allTriggers.length})`}
          </button>
        )}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['legendDot--high']}`} /> Lift &ge; 8pp (forte)
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['legendDot--medium']}`} /> Lift 5-7pp (moderado)
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['legendDot--low']}`} /> Lift &lt; 5pp (fraco)
        </div>
        <div className={styles.legendNote}>
          * Lift = diferenca percentual acima do esperado estatistico · Min. 20 aparicoes · Validacao chi2
        </div>
      </div>
    </div>
  );
};

export default TriggerStrategiesPanel;