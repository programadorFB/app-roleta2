// components/MasterDashboard.jsx
import React, { useMemo, useState } from 'react';
import { Target, PieChart, Layers, AlertOctagon, Zap, CheckCircle, X } from 'lucide-react'; // Activity removido

import { calculateMasterScore } from '../services/masterScoring.jsx';
import styles from './MasterDashboard.module.css';

// Mapeia o nome da estratégia para um ícone (FiboNasa Removido)
const ICONS = {
  'Terminais': <PieChart size={24} />,
  'Setores': <Target size={24} />,
  'Vizinhos': <Layers size={24} />,
  'Ocultos': <AlertOctagon size={24} />,
  'Croupier': <Zap size={24} />,
};

// Pega a cor de um número
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// Chip de Número
const NumberChip = ({ number }) => {
    const color = getNumberColor(number);
    return (
        <span
            className={`${styles['history-number']} ${styles[color]}`}
            style={{ cursor: 'default', fontSize: '0.9rem', padding: '0.4rem 0.7rem', margin: '0.1rem' }}
        >
            {number}
        </span>
    );
};

// Mini-card da estratégia
const StrategyMiniCard = ({ name, score, status }) => {
  const statusColor = status === '🟢' ? '#10b981' : (status === '🟡' ? '#f59e0b' : '#ef4444'); // Laranja agora é vermelho

  return (
    <div className={styles.strategyMiniCard} style={{ borderBottomColor: statusColor }}>
      <div className={styles.miniCardHeader}>
        {ICONS[name] || <Target size={18} />}
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
};

// Componente Principal
const MasterDashboard = ({ spinHistory }) => {
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);

  const analysis = useMemo(() => {
    return calculateMasterScore(spinHistory);
  }, [spinHistory]);

  // Mostrar mensagem de espera se não houver dados suficientes
  if (!analysis || analysis.strategyScores.length === 0) {
    return (
      <div className={styles['strategy-card']}>
        <p className={`${styles['card-concept']} ${styles['empty-state']}`} style={{ textAlign: 'center' }}>
          Aguardando {50 - (spinHistory?.length || 0)} spins para o Painel Master...
        </p>
      </div>
    );
  }

  const { globalAssertiveness, totalSignals, strategyScores, entrySignal } = analysis;

  const handleSignalConfirm = () => {
    setIsSignalAccepted(true);
    console.log("Sinal confirmado! Apostar em:", entrySignal?.suggestedNumbers);
    // Aqui você adicionaria a lógica para interagir com um sistema de apostas
  };
  const handleSignalIgnore = () => {
    setIsSignalAccepted(false);
    console.log("Sinal ignorado.");
    // Poderia esconder o card de sinal temporariamente
  };

  return (
    <div className={styles.masterDashboardContainer}>

      {/* 1. PAINEL MASTER - STATUS GERAL */}
      <div className={styles.strategyCard} style={{ paddingBottom: '0.5rem' }}>
        <div className={styles['strategy-header']} style={{ marginBottom: '0.5rem' }}>
          <Target size={24} className={styles.infoIcon} />
          <h4 className={styles['card-title']}>PAINEL MASTER - STATUS GERAL</h4>
        </div>
        {/* 3. SINAL DE ENTRADA (Se existir) */}
        {entrySignal && !isSignalAccepted && (
          <div className={styles.entrySignalCard}>
            <div className={styles['strategy-header']} style={{ marginBottom: '1rem', borderBottomColor: '#10b981' }}>
              <CheckCircle size={24} style={{ color: '#10b981' }} />
              <h4 className={styles['card-title']} style={{ color: '#10b981' }}>SINAL DE ENTRADA CONFIRMADO!</h4>
            </div>
  
            <p className={styles['card-concept']} style={{ textAlign: 'center', marginBottom: '1rem' }}>
              Convergência de <strong>{entrySignal.convergence}</strong> estratégias detectada! ({entrySignal.reason})
            </p>
  
            <div style={{ marginBottom: '1rem' }}>
              <span className={styles['stat-label']} style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>📊 Aposte em:</span>
              <div style={{ textAlign: 'center' }}>
                {entrySignal.suggestedNumbers.map(num => <NumberChip key={num} number={num} />)}
              </div>
            </div>
  
            <div className={styles['stats-grid']} style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div className={styles['stat-label']} style={{ justifyContent: 'center' }}>💰 Sugestão</div>
                <div className={styles['stat-value']} style={{ justifyContent: 'center' }}>5 unids</div> {/* Valor fixo por enquanto */}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className={styles['stat-label']} style={{ justifyContent: 'center' }}>🎯 Confiança</div>
                <div className={styles['stat-value']} style={{ justifyContent: 'center' }}>{entrySignal.confidence.toFixed(0)}%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className={styles['stat-label']} style={{ justifyContent: 'center' }}>⏱️ Válido por</div>
                <div className={styles['stat-value']} style={{ justifyContent: 'center' }}>{entrySignal.validFor} giros</div>
              </div>
            </div>
  
          </div>
        )}
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']}>Assertividade Global (Estratégias Ativas)</span>
          <span className={styles['stat-value']} style={{ fontSize: '1.2rem', color: '#fde047' }}>
            {globalAssertiveness.toFixed(0)}%
          </span>
        </div>
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']}>Sinais Ativos (Verde/Amarelo)</span>
          <span className={styles['stat-value']} style={{ fontSize: '1.2rem', color: '#fde047' }}>
            {totalSignals} / 5 {/* Atualizado para 5 */}
          </span>
        </div>
      </div>

      {/* 2. GRID DE ESTRATÉGIAS - Agora flexível */}
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


       {/* Mensagem se o sinal foi aceito */}
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