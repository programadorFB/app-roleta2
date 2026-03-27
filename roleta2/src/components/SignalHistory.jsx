// components/SignalHistory.jsx — Historico de sinais emitidos com gale e resultados
// Dados vêm do mesmo fetch do placar (computeFilteredMotorScore) — zero fetch próprio.
import React from 'react';
import { History } from 'lucide-react';
import { RED_NUMBERS } from '../constants/roulette.js';
import styles from './SignalHistory.module.css';

const getColor = (n) => {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
};

const colorClass = (n) => {
  const c = getColor(n);
  if (c === 'red') return styles.numRed;
  if (c === 'green') return styles.numGreen;
  return styles.numBlack;
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const SignalHistoryRow = ({ signal, neighborMode }) => {
  const mk = String(neighborMode);
  const modes = signal.resolvedModes || {};
  const result = modes[mk]; // 'win' | 'loss'
  const gale = modes[`${mk}_gale`]; // 1, 2, or 3
  const isWin = result === 'win';
  const results = signal.spinResults || [];

  // Qual chip de resultado é o hit (gale - 1 = índice)
  const hitGaleIndex = isWin && gale ? gale - 1 : -1;

  return (
    <div className={styles.historyRow}>
      {/* Badge WIN/LOSS */}
      <div className={`${styles.resultBadge} ${isWin ? styles.resultWin : styles.resultLoss}`}>
        {isWin ? (gale ? `G${gale} Win` : 'Win') : 'Loss'}
      </div>

      {/* Signal info */}
      <div className={styles.signalInfo}>
        {/* Numeros do sinal */}
        <div className={styles.signalNumbers}>
          <span className={styles.signalNumLabel}>Sinal</span>
          {signal.suggestedNumbers.map((n, i) => (
            <span key={i} className={`${styles.numChip} ${colorClass(n)}`}>{n}</span>
          ))}
        </div>

        {/* Resultados da roleta */}
        <div className={styles.resultsRow}>
          <span className={styles.resultLabel}>Result.</span>
          {results.length > 0 ? results.map((n, i) => (
            <React.Fragment key={i}>
              <span className={`${styles.resultChip} ${colorClass(n)} ${i === hitGaleIndex ? styles.resultChipHit : ''}`}>
                {n}
              </span>
              {i === hitGaleIndex && <span className={styles.galeTag}>G{gale}</span>}
            </React.Fragment>
          )) : (
            <span className={styles.resultLabel}>--</span>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <span className={styles.timestamp}>{formatTime(signal.createdAt)}</span>
    </div>
  );
};

const SignalHistory = ({ signalHistory, neighborMode }) => {
  const history = signalHistory || [];

  console.log('[DEBUG SignalHistory Component] Props received:', {
    signalHistoryLength: signalHistory?.length ?? 'undefined/null',
    neighborMode,
    sampleSignals: (signalHistory || []).slice(0, 3).map(s => ({
      id: s.id,
      resolvedModes: s.resolvedModes,
      suggestedNumbers: s.suggestedNumbers,
      spinResults: s.spinResults,
    })),
  });

  // Filtra sinais que tem resultado para o modo selecionado — exibe apenas os 6 últimos
  const filtered = history.filter(s => {
    const modes = s.resolvedModes || {};
    const modeKey = String(neighborMode);
    const result = modes[modeKey];
    if (!result) {
      console.log('[DEBUG SignalHistory Filter] Signal EXCLUDED id=', s.id, 'modes=', modes, 'looking for key=', modeKey);
    }
    return result === 'win' || result === 'loss';
  }).slice(0, 6);

  console.log('[DEBUG SignalHistory Component] Filtered result:', filtered.length, 'signals for mode', neighborMode);

  return (
    <div className={styles.historyContainer}>
      <div className={styles.historyHeader}>
        <span className={styles.historyTitle}>
          <History size={13} className={styles.historyTitleIcon} />
          Historico de Sinais
        </span>
        <span className={styles.historyCount}>{filtered.length} sinais</span>
      </div>

      <div className={styles.historyList}>
        {filtered.length > 0 ? (
          filtered.map(signal => (
            <SignalHistoryRow
              key={signal.id}
              signal={signal}
              neighborMode={neighborMode}
            />
          ))
        ) : (
          <div className={styles.emptyHistory}>
            Nenhum sinal resolvido ainda
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalHistory;
