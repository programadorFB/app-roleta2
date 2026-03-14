// components/EntrySignalCard.jsx — MOGNO & OURO v2
import React, { useMemo } from 'react';
import styles from './EntrySignalCard.module.css';

const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  return reds.includes(num) ? 'red' : 'black';
};

const NumberChip = React.memo(({ number, size = 'normal' }) => {
  const colorClass = styles[getNumberColor(number)];
  return (
    <span className={`${styles.chip} ${colorClass} ${size === 'small' ? styles.chipSmall : ''}`}>
      {number}
    </span>
  );
});

const TargetRow = ({ targetNumber, history }) => {
  const gatilhos = useMemo(() => {
    const result = [];
    for (let i = 0; i < history.length; i++) {
      if (history[i].number === targetNumber && i < history.length - 1) {
        result.push(history[i + 1].number);
      }
    }
    return result.slice(0, 8);
  }, [targetNumber, history]);

  return (
    <div className={styles.targetRow}>
      <div className={styles.targetCell}>
        <NumberChip number={targetNumber} />
        <span className={styles.targetLabel}>ALVO</span>
      </div>
      <div className={styles.targetData}>
        <span className={styles.dataLabel}>GATILHOS:</span>
        <div className={styles.dataChips}>
          {gatilhos.length > 0
            ? gatilhos.map((n, i) => <NumberChip key={`${n}-${i}`} number={n} size="small" />)
            : <span className={styles.noData}>S/ Registro</span>
          }
        </div>
      </div>
    </div>
  );
};

const EntrySignalCard = ({ entrySignal, spinHistory = [] }) => {
  if (!entrySignal) return null;

  return (
    <div className={styles.card}>
      {/* Warning */}
      <div className={styles.warning}>
        <span className={styles.warningIcon}>⚠</span>
        <span className={styles.warningText}>Regiões de tendência baseadas em probabilidade. Não são garantias.</span>
      </div>

      {/* Header */}
      <div className={styles.header}>TENDÊNCIA CONFIRMADA</div>

      <p className={styles.subtitle}>
        <strong>{entrySignal.convergence}</strong> estratégias alinharam.
        <span className={styles.reason}>{entrySignal.reason}</span>
      </p>

      {/* Análise Histórica */}
      <div className={styles.sectionLabel}>Análise Histórica</div>

      <div className={styles.targetList}>
        {entrySignal.suggestedNumbers.map(num => (
          <TargetRow key={num} targetNumber={num} history={spinHistory} />
        ))}
      </div>

      {/* Jogar nos números */}
      <div className={styles.playSection}>
        <span className={styles.playLabel}>JOGAR NOS NÚMEROS:</span>
        <div className={styles.playChips}>
          {entrySignal.suggestedNumbers.map(n => (
            <NumberChip key={n} number={n} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(EntrySignalCard);