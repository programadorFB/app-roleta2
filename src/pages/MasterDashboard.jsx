// components/MasterDashboard.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { calculateMasterScore } from '../services/masterScoring.jsx';
import EntrySignalCard from '../components/EntrySignalCard.jsx';
import styles from './MasterDashboard.module.css';

// --- CONFIGURAÇÃO DA ROLETA (CILINDRO) ---
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// Helper para expandir a aposta com vizinhos
const getCoveredNumbers = (targetNumbers, neighborMode) => {
  if (neighborMode === 0) return targetNumbers;

  const covered = new Set();
  
  targetNumbers.forEach(num => {
    covered.add(num); // Adiciona o alvo
    const idx = WHEEL_ORDER.indexOf(num);
    
    // Adiciona vizinhos (frente e trás, cuidando do loop do array)
    for (let i = 1; i <= neighborMode; i++) {
      covered.add(WHEEL_ORDER[(idx + i) % 37]); // Vizinho da direita
      covered.add(WHEEL_ORDER[(idx - i + 37) % 37]); // Vizinho da esquerda
    }
  });

  return Array.from(covered);
};

// --- COMPONENTE VISUAL DO PLACAR ---
const WinLossScoreboard = ({ wins, losses, analyzed, neighborMode, setNeighborMode }) => {
  const totalEntries = wins + losses;
  const assertiveness = totalEntries > 0 ? ((wins / totalEntries) * 100).toFixed(1) : '0.0';
  
  let scoreColor = '#cbd5e1'; 
  if (totalEntries > 0) {
    if (parseFloat(assertiveness) >= 70) scoreColor = '#10b981';
    else if (parseFloat(assertiveness) >= 50) scoreColor = '#f59e0b';
    else scoreColor = '#ef4444'; 
  }

  return (
    <div className={styles.strategyCard} style={{ marginTop: '0', padding: '0.8rem', marginBottom: '1rem', borderTop: `4px solid ${scoreColor}` }}>
      
      {/* SELETOR DE VIZINHOS (FILTRO) */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '20px' }}>
          {[0, 1, 2].map(v => (
            <button
              key={v}
              onClick={() => setNeighborMode(v)}
              style={{
                background: neighborMode === v ? '#fbbf24' : 'transparent',
                color: neighborMode === v ? '#000' : '#ccc',
                border: 'none',
                borderRadius: '15px',
                padding: '4px 12px',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {v === 0 ? 'Seco' : `${v} Viz`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* WINS */}
        <div style={{ textAlign: 'center' }}>
          <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '10px', color: '#10b981' }}>WINS</div>
          <div className={styles['stat-value']} style={{ fontSize: '1.2rem', color: '#10b981' }}>{wins}</div>
        </div>

        {/* ASSERTIVIDADE */}
        <div style={{ textAlign: 'center', flex: 2, borderLeft: '1px solid #334155', borderRight: '1px solid #334155', margin: '0 1rem' }}>
          <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '10px', marginBottom: '4px' }}>ASSERTIVIDADE</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: scoreColor }}>
            {assertiveness}%
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px' }}>
            {totalEntries} Entradas (Cobrindo {neighborMode === 0 ? '1' : (neighborMode * 2 + 1)}x/núm)
          </div>
        </div>

        {/* LOSSES */}
        <div style={{ textAlign: 'center' }}>
          <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '10px', color: '#ef4444' }}>LOSSES</div>
          <div className={styles['stat-value']} style={{ fontSize: '1.2rem', color: '#ef4444' }}>{losses}</div>
        </div>

      </div>
    </div>
  );
};

// --- MINI CARD DE ESTRATÉGIA ---
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

// --- HELPER DE BACKTEST (Com Lógica de Vizinhos) ---
const calculateHistoricalStats = (history, neighborMode) => {
  if (!history || history.length < 50) return { wins: 0, losses: 0, analyzed: 0 };

  let wins = 0;
  let losses = 0;
  
  const startIndex = history.length - 50; 
  let analyzedCount = 0;

  for (let i = startIndex; i >= 1; i--) {
      analyzedCount++;
      
      const pastHistoryState = history.slice(i); 
      const analysis = calculateMasterScore(pastHistoryState); 

      if (analysis?.entrySignal) {
          const rawSuggestions = analysis.entrySignal.suggestedNumbers;
          
          // AQUI ESTÁ A MÁGICA: Expandimos os números sugeridos com os vizinhos
          const betNumbers = getCoveredNumbers(rawSuggestions, neighborMode);
          
          const validFor = analysis.entrySignal.validFor || 3;
          let isWin = false;

          for (let j = 1; j <= validFor; j++) {
              if (i - j < 0) break; 
              
              const resultNumber = history[i - j].number;
              
              // Verifica se caiu em QUALQUER número coberto (Alvo ou Vizinho)
              if (betNumbers.includes(resultNumber)) {
                  isWin = true;
                  break; 
              }
          }

          if (isWin) {
             wins++;
          } else if (i >= validFor) {
             losses++;
          }
      }
  }

  return { wins, losses, analyzed: analyzedCount };
};


const MasterDashboard = ({ spinHistory, onSignalUpdate }) => { 
  const [isSignalAccepted, setIsSignalAccepted] = useState(false);
  const [neighborMode, setNeighborMode] = useState(0); 
  
  // Novo estado para controlar QUANDO o sinal começou
  const [signalStartLen, setSignalStartLen] = useState(0);

  const lastSignalRef = useRef(null);
  
  // 1. Gera o sinal AO VIVO
  const analysis = useMemo(() => {
    return calculateMasterScore(spinHistory);
  }, [spinHistory]);

  // 2. Gera o placar PASSADO (Reage à mudança de neighborMode)
  const stats = useMemo(() => {
    return calculateHistoricalStats(spinHistory, neighborMode);
  }, [spinHistory, neighborMode]);

  // 3. Efeitos e Lógica de Sinal
  useEffect(() => {
    const newSignal = analysis?.entrySignal?.suggestedNumbers || [];
    const newSignalStr = JSON.stringify(newSignal);
    
    // Se o sinal mudou (novo ou vazio)
    if (lastSignalRef.current !== newSignalStr) {
        lastSignalRef.current = newSignalStr;
        onSignalUpdate(newSignal);
        
        if (newSignal.length > 0) {
            setIsSignalAccepted(false);
            // MARCA O MOMENTO QUE O SINAL COMEÇOU
            setSignalStartLen(spinHistory.length);
        } else {
            setSignalStartLen(0);
        }
    }
    
    if (analysis?.entrySignal && spinHistory.length > 0) {
        // Verifica visualmente se o último número bate com a aposta expandida atual
        const currentBetNumbers = getCoveredNumbers(analysis.entrySignal.suggestedNumbers, neighborMode);
        
        if (currentBetNumbers.includes(spinHistory[0].number)) {
            setIsSignalAccepted(true);
        }
    } else if (!analysis?.entrySignal) {
        setIsSignalAccepted(false);
    }
  }, [analysis, onSignalUpdate, spinHistory, neighborMode]);

  // 4. Cálculo dos giros restantes (LÓGICA DA CONTAGEM REGRESSIVA)
  const remainingSpins = useMemo(() => {
    if (!analysis?.entrySignal || signalStartLen === 0) return 0;
    
    const validTotal = analysis.entrySignal.validFor;
    // Quantos giros aconteceram desde que o sinal apareceu?
    const spinsPassed = spinHistory.length - signalStartLen;
    
    // Subtrai do total e garante que não fique negativo
    return Math.max(0, validTotal - spinsPassed);
  }, [analysis, spinHistory.length, signalStartLen]);
  
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

  // Calcula custo estimado em unidades (apenas visual)
  const unitsPerTarget = 1 + (neighborMode * 2); // 1, 3 ou 5 fichas por alvo
  const totalUnits = entrySignal ? entrySignal.suggestedNumbers.length * unitsPerTarget : 0;

  // Define cor e texto do status do tempo
  let timeStatusColor = '#fde047'; // Amarelo padrão
  let timeText = `${remainingSpins} `;

  if (isSignalAccepted) {
      timeStatusColor = '#10b981';
      timeText = 'FINALIZADO';
  } else if (remainingSpins === 0 && entrySignal) {
      timeStatusColor = '#ef4444';
      timeText = 'ENCERRADO';
  } else if (remainingSpins === 1) {
      timeStatusColor = '#f97316'; // Laranja para último giro
      timeText = 'Última chance';
  }

  return (
    <div className={styles.masterDashboardContainer}>
      
      {/* Placar Interativo */}
      <WinLossScoreboard 
        wins={stats.wins} 
        losses={stats.losses} 
        analyzed={stats.analyzed} 
        neighborMode={neighborMode}
        setNeighborMode={setNeighborMode}
      />

      {/* Info do Sinal */}
      {entrySignal && (
        <div className={styles.strategyCard}>
            <div className={styles['stats-grid']} style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: '0.5rem', width: '100%' }}>
              
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '15px' }}>💰<br/> Custo</div>
                <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px' }}>{totalUnits} unids</div>
              </div>
              
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '15px' }}>🎯<br/> Confiança</div>
                <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px' }}>{entrySignal.confidence.toFixed(0)}%</div>
              </div>
              
              {/* LÓGICA DE CONTAGEM REGRESSIVA VISUAL */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div className={styles['stat-label']} style={{ justifyContent: 'center', fontSize: '15px' }}>⏱️<br/> {isSignalAccepted ? 'Resultado' : 'Restam'} </div>
                <div className={styles['stat-value']} style={{ justifyContent: 'center', fontSize: '15px', color: timeStatusColor, fontWeight: 'bold' }}>
                   {timeText}/{entrySignal.validFor}
                </div>
              </div>

            </div>
        </div>
      )}

      {/* Grid */}
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

      {/* Card Visual */}
      <EntrySignalCard 
        entrySignal={entrySignal} 
        isSignalAccepted={isSignalAccepted} 
        spinHistory={spinHistory}
      />
    </div>
  );
};

export default MasterDashboard;