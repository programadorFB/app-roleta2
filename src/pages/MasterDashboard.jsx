// components/MasterDashboard.jsx
import React, { useMemo, useState, useEffect } from 'react';
// import { Target, PieChart, Layers, AlertOctagon, Zap, CheckCircle, X } from 'lucide-react'; // <-- REMOVIDO

import { calculateMasterScore } from '../services/masterScoring.jsx';
import styles from './MasterDashboard.module.css';

// Mapeia o nome da estratégia para um ícone (FiboNasa Removido)
/* <-- Bloco ICONS removido 
const ICONS = {
  'Terminais': <PieChart size={10} />,
  'Setores': <Target size={10} />,
  'Vizinhos': <Layers size={10} />,
  'Ocultos': <AlertOctagon size={10} />,
  'Croupier': <Zap size={10} />,
};
*/

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
      <br/>
        {/* {ICONS[name] || <Target size={15} />} <-- Ícone removido */}
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
const MasterDashboard = ({ spinHistory, onSignalUpdate }) => { 
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);

  const analysis = useMemo(() => {
    return calculateMasterScore(spinHistory);
  }, [spinHistory]);

  // Este efeito envia os números do sinal de entrada para o App.jsx (componente pai)
  useEffect(() => {
    if (analysis && analysis.entrySignal && analysis.entrySignal.suggestedNumbers) {
      // Envia os números para o App.jsx
      onSignalUpdate(analysis.entrySignal.suggestedNumbers);
    } else {
      // Limpa os sinais se não houver um entrySignal
      onSignalUpdate([]);
    }
    
    // Reseta o estado de "aceito" se o sinal desaparecer
    if (!analysis.entrySignal) {
        setIsSignalAccepted(false);
    }

  }, [analysis, onSignalUpdate]); // Dispara sempre que a análise mudar
  
  // Mostrar mensagem de espera se não houver dados suficientes
  if (!analysis || analysis.strategyScores.length === 0) {
    // Limpa os sinais se estiver em modo de espera
    useEffect(() => {
      onSignalUpdate([]);
    }, [onSignalUpdate]);

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
      <div className={styles.strategyCard} >
        
          {/* <h4 className={styles['card-title']}>Indicações</h4> */}
        

        {/* 'stats-grid' REALOCADO AQUI. */}
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
      <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px' }}>5 unids</div> {/* Valor fixo por enquanto */}
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

        {/* 3. SINAL DE ENTRADA (Se existir) */}
        {entrySignal && !isSignalAccepted && (
          <div className={styles.entrySignalCard}>
            <div className={styles['strategy-header']} style={{ marginBottom: '1rem', borderBottomColor: '#10b981' }}>
              {/* <CheckCircle size={15} style={{ color: '#10b981', marginLeft:"10px", marginTop:'15px' }} /> <-- Ícone removido */}
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