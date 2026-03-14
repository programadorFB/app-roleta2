// components/EntrySignalCard.jsx
import React, { useMemo } from 'react';
import styles from './EntrySignalCard.module.css';

// --- Helpers Visuais ---
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// Componente do Chip (Usa o CSS do módulo)
const NumberChip = React.memo(({ number, size = 'normal', opacity = 1 }) => {
  const colorClass = styles[getNumberColor(number)];
  const isSmall = size === 'small';
  
  return (
    <span
      className={`${styles.numberChip} ${colorClass}`}
      style={{
        // Ajuste fino para ficar compacto e elegante
        fontSize: isSmall ? '0.65rem' : '0.9rem',
        padding: isSmall ? '0.1rem 0.3rem' : '0.2rem 0.5rem',
        minWidth: isSmall ? '18px' : '28px',
        opacity: opacity,
      }}
    >
      {number}
    </span>
  );
});

// --- Linha de Análise Individual ---
const TargetAnalysisRow = ({ targetNumber, history }) => {
  const contextData = useMemo(() => {
    const puxou = [];
    // Varre o histórico (apenas puxou, pois o usuário removeu 'antes' no screenshot ou quer foco nos gatilhos)
    // Se quiser 'antes' e 'puxou', basta descomentar a lógica original.
    // Baseado na imagem que você mandou, parece focar nos gatilhos.
    
    // Vamos manter a lógica completa mas exibir de forma compacta
    for (let i = 0; i < history.length; i++) {
      if (history[i].number === targetNumber) {
        if (i < history.length - 1) puxou.push(history[i + 1].number); // Quem veio ANTES (Gatilho)
      }
    }
    // Limitando a 6 para não quebrar linha em excesso
    return { gatilhos: puxou.slice(0, 7) };
  }, [targetNumber, history]);

  const { gatilhos } = contextData;
  const textGatilhos = gatilhos.join(', ');

  return (
    <div className={styles.analysisRow}>
      {/* COLUNA ESQUERDA: O ALVO */}
      <div className={styles.targetBox}>
        <NumberChip number={targetNumber} size="normal" />
        <span className={styles.targetLabel}>ALVO</span>
      </div>

      {/* COLUNA DIREITA: DADOS */}
      <div className={styles.statsColumn}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>GATILHOS:</span>
          <span className={styles.statValue}>
            {textGatilhos || <span className={styles.emptyValue}>S/ Registro</span>}
          </span>
        </div>
      </div>
    </div>
  );
};

const EntrySignalCard = ({ entrySignal,  spinHistory = [] }) => {
  if (!entrySignal) return null;


  return (
    <div className={styles.cardContainer}>
      
         <div className={styles.warningBox}>
           <span className={styles.warningIcon}>⚠️</span>
           <span className={styles.warningText}>
             Regiões de tendência baseadas em probabilidade. Não são garantias.
           </span>
         </div>
      <br/>
      {/* AVISO NO TOPO (Menos intrusivo) ou RODAPÉ conforme preferência. Mantendo layout original: */}
      <div className={styles.headerTitle}>
        TENDÊNCIA CONFIRMADA
      </div>

      <p className={styles.conceptText}>
         <strong>{entrySignal.convergence}</strong> estratégias alinharam.<br/>
        <span style={{fontSize: '0.7em', opacity: 0.6}}>({entrySignal.reason})</span>
      </p>

      <div className={styles.sectionTitle}>
        Análise Histórica
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {entrySignal.suggestedNumbers.map(targetNum => (
          <TargetAnalysisRow 
            key={`analysis-${targetNum}`} 
            targetNumber={targetNum} 
            history={spinHistory} 
          />
        ))}
      </div>

      <div className={styles.playSection}>
         <span className={styles.playLabel}>JOGAR NOS NÚMEROS:</span>
         
         <div className={styles.playGrid}>
            {entrySignal.suggestedNumbers.map(n => (
              <NumberChip key={n} number={n} />
            ))}
         </div>

      </div>

    </div>
  );
};

export default React.memo(EntrySignalCard);