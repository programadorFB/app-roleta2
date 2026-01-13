// components/MasterDashboard.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { calculateMasterScore } from '../services/masterScoring.jsx';
import styles from './MasterDashboard.module.css';

// Pega a cor de um número
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// Chip de Número
const NumberChip = React.memo(({ number }) => {
    const color = getNumberColor(number);
    return (
        <span
            className={`${styles['history-number']} ${styles[color]}`}
            style={{ cursor: 'default', fontSize: '0.9rem', padding: '0.4rem 0.7rem', margin: '0.1rem' }}
        >
            {number}
        </span>
    );
});

// Mini-card da estratégia
const StrategyMiniCard = React.memo(({ name, score, status }) => {
  const statusColor = status === '🟢' ? '#10b981' : (status === '🟡' ? '#f59e0b' : '#ef4444');
  return (
    <div className={styles.strategyMiniCard} style={{ borderBottomColor: statusColor }}>
      <div className={styles.miniCardHeader}>
      <br/>
        <span>{name}</span>
      </div>
      <div className={styles.miniCardScore} style={{ color: statusColor }}>
        {score.toFixed(0)}%
      </div>
      <div className={styles.miniCardStatus} style={{ color: statusColor }}>
        {status}
      </div>
    </div>
  );
});

// Componente Principal
const MasterDashboard = ({ spinHistory, onSignalUpdate }) => { 
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);
  const lastSignalRef = useRef(null); // Para evitar loops de atualização

  const analysis = useMemo(() => {
    return calculateMasterScore(spinHistory);
  }, [spinHistory]);

  // CORREÇÃO DE PERFORMANCE: Só atualiza se o sinal realmente mudar
  useEffect(() => {
    const newSignal = analysis?.entrySignal?.suggestedNumbers || [];
    const newSignalStr = JSON.stringify(newSignal);
    
    // Se o sinal for igual ao último enviado, NÃO faz nada (evita re-render do App)
    if (lastSignalRef.current !== newSignalStr) {
        lastSignalRef.current = newSignalStr;
        onSignalUpdate(newSignal);
    }
    
    if (!analysis?.entrySignal) {
        setIsSignalAccepted(false);
    }

  }, [analysis, onSignalUpdate]);
  
  if (!analysis || analysis.strategyScores.length === 0) {
    return (
      <div className={styles['strategy-card']}>
        <p className={`${styles['card-concept']} ${styles['empty-state']}`} style={{ textAlign: 'center' }}>
          Aguardando {50 - (spinHistory?.length || 0)} spins para o Painel Master...
        </p>
      </div>
    );
  }

  const { entrySignal, strategyScores } = analysis;

  return (
    <div className={styles.masterDashboardContainer}>
      {/* 1. PAINEL MASTER - STATUS GERAL */}
      <div className={styles.strategyCard} >
        {entrySignal && (
          <div 
          className={styles['stats-grid']} 
          style={{ 
              display: 'flex', 
              justifyContent: 'space-around', 
              alignItems: 'center', 
              marginTop: '1.5rem',
              width: '100%' 
            }}
          >
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '15px' }}>💰<br/> Sugestão</div>
              <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px' }}>5 unids</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '15px' }}>🎯<br/> Confiança</div>
              <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px' }}>{entrySignal.confidence.toFixed(0)}%</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '15px' }}>⏱️<br/> Válido </div>
              <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px' }}>{entrySignal.validFor} giros</div>
            </div>
          </div>
        )}
      </div>

      {/* 2. GRID DE ESTRATÉGIAS */}
      <div className={styles.masterGridContainer}>
        {strategyScores.map(strategy => (
          <StrategyMiniCard
            key={strategy.name}
            name={strategy.name}
            score={strategy.score}
            status={strategy.status}
          />
        ))}
      </div>

        {/* 3. SINAL DE ENTRADA */}
        {entrySignal && !isSignalAccepted && (
          <div className={styles.entrySignalCard}>
            <div className={styles['strategy-header']} style={{ marginBottom: '1rem', borderBottomColor: '#10b981' }}>
              <h4 className={styles['card-title2']} style={{ color: '#10b981' }}>SINAL DE ENTRADA CONFIRMADO!</h4>
            </div>
      
            <p className={styles['card-concept']} style={{ textAlign: 'center', marginBottom: '1rem' }}>
              Convergência de <strong>{entrySignal.convergence}</strong> estratégias detectada! ({entrySignal.reason})
            </p>
      
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                {entrySignal.suggestedNumbers.map(num => <NumberChip key={num} number={num} />)}
              </div>
            </div>
          </div>
        )}

       {isSignalAccepted && (
         <div className={styles.strategyCard} style={{borderColor: '#10b981', background: 'rgba(16, 185, 129, 0.1)'}}>
             <p style={{color: '#10b981', fontWeight: 'bold', textAlign: 'center'}}>
                 Sinal confirmado! Boa sorte.
             </p>
         </div>
       )}
    </div>
  );
};

export default MasterDashboard; 