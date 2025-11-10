// components/NeighborAnalysis.jsx

import React, { useMemo, useState } from 'react';
// Importei o ícone 'Info'
import { Target, TrendingUp, Zap, CheckCircle, AlertTriangle, ArrowLeftRight, Clock, Gauge, Info } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css'; // Reutilizamos o mesmo CSS

// Importa a lógica REAL e a constante da Roda
import { analyzeNeighborhood, PHYSICAL_WHEEL } from '../services/NeighborAnalysis.jsx'; 

// --- Componentes Auxiliares ---

// Card Padrão
const StatCard = ({ title, icon, children }) => (
    <div className={styles['strategy-card']}>
        <div className={styles['strategy-header']}>
            {icon}
            <h4 className={styles['card-title']}>{title}</h4>
        </div>
        <div className={styles['analysis-content']}>
            {children}
        </div>
    </div>
);

// Pega a cor de um número
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// Chip de Número
const NumberChip = ({ number, size = 'small' }) => {
    const color = getNumberColor(number);
    const style = size === 'small' ? {
        fontSize: '0.75rem',
        padding: '0.2rem 0.4rem',
        minWidth: '20px'
    } : {
        fontSize: '0.9rem',
        padding: '0.4rem 0.7rem'
    };
    
    return (
        <span 
            className={`${styles['history-number']} ${styles[color]}`}
            style={{ ...style, cursor: 'default', margin: '0.1rem' }}
        >
            {number}
        </span>
    );
};

// Cor para o Heatmap (REQ 3)
// Baseado na 'accuracy' (lift)
const getHeatColor = (accuracy) => {
    if (accuracy > 150) return '#ef4444'; // Muito Quente (150%+ vs esperado)
    if (accuracy > 120) return '#f59e0b'; // Quente
    if (accuracy > 80) return '#6b7280';  // Normal
    if (accuracy > 50) return '#3b82f6';  // Frio
    return '#6922c7ff'; // Congelado (fundo do painel)
};

// --- Componente Principal da Análise de Vizinhança ---

const NeighborAnalysis = ({ spinHistory }) => {
  
  // REQ 2: Seletor de raio
  const [neighborRadius, setNeighborRadius] = useState(2);
  // REQ 3: Click em número
  const [selectedNumber, setSelectedNumber] = useState(null);
  
  // --- NOVO ESTADO ---
  // Controla a visibilidade do infocard de "Precisão"
  const [showAccuracyInfo, setShowAccuracyInfo] = useState(false);
  // --- FIM DO NOVO ESTADO ---

  const analysis = useMemo(() => {
    if (spinHistory.length < 20) return null;
    
    // REQ 1: Chama a função de análise real
    const patterns = analyzeNeighborhood(spinHistory, neighborRadius);
    
    return {
      patterns, // Lista completa ordenada por 'accuracy'
      bestBet: patterns[0], // Melhor aposta (maior 'accuracy')
      top3: patterns.slice(0, 3),
    };
  }, [spinHistory, neighborRadius]);

  // REQ 3: Análise detalhada do número clicado
  const selectedPattern = useMemo(() => {
      if (selectedNumber === null || !analysis) return null;
      // Encontra a análise para o número que foi clicado
      const pattern = analysis.patterns.find(p => p.center === selectedNumber);
      if (pattern) {
        // Reseta o infocard ao selecionar um novo número
        setShowAccuracyInfo(false); 
      }
      return pattern;
  }, [selectedNumber, analysis]);


  if (!analysis) {
    return (
      <div className={styles['strategy-card']}>
        <p className={`${styles['card-concept']} ${styles['empty-state']}`} style={{ textAlign: 'center' }}>
          Aguardando {20 - (spinHistory?.length || 0)} spins para Análise de Vizinhança...
        </p>
      </div>
    );
  }

  return (
    <>
      <h3 className={styles['dashboard-title']}>
        Análise Automática de Vizinhança
      </h3>

      {/* REQ 2: Seletor de Raio */}
      <StatCard title="Quantidade de Vizinhos" icon={<Gauge size={24} className={styles.infoIcon} />}>
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']}>Raio de Vizinhança</span>
          <select 
            value={neighborRadius} 
            onChange={e => {
              setNeighborRadius(Number(e.target.value));
              setSelectedNumber(null); // Reseta seleção ao mudar raio
            }}
            className={styles.strategySelect} // Reutilizando um estilo
            style={{width: 'auto', background: '#1f2937', color: '#fde047', border: '1px solid #4b5563'}}
          >
            <option value={2}>2 Vizinhos (2+C+2)</option>
            <option value={3}>3 Vizinhos (3+C+3)</option>
            <option value={4}>4 Vizinhos (4+C+4)</option>
            <option value={5}>5 Vizinhos (5+C+5)</option>
          </select>
        </div>
      </StatCard>
      
      {/* REQ 3: Gráfico de Calor Visual (Heatmap) */}
      <StatCard title="Mapa de Calor" icon={<Target size={24} className={styles.warningIcon} />}>
        <p className={styles['card-concept']} style={{fontSize: '0.85rem', textAlign: 'center', marginTop: '-0.5rem', marginBottom: '1rem'}}>
          Clique em um número para ver a análise detalhada. (🔴= Quente, 🟡= Morno, 🔵= Frio, 🟣=Inativo,⚪= normal )
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '0.5rem' }}>
          {PHYSICAL_WHEEL.map(num => {
            const pattern = analysis.patterns.find(p => p.center === num);
            const heatColor = pattern ? getHeatColor(pattern.accuracy) : '#111827';
            
            return (
              <button
                key={num}
                onClick={() => setSelectedNumber(num)}
                title={`Número ${num} | Precisão: ${pattern?.accuracy.toFixed(0)}%`}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: heatColor,
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  border: selectedNumber === num ? '2px solid #fde047' : `2px solid ${heatColor}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.1s'
                }}
              >
                {num}
              </button>
            );
          })}
        </div>
      </StatCard>

      {/* REQ 3: Análise Detalhada (do Click) */}
      {selectedPattern && (
        <StatCard 
          title={`Análise Detalhada: Vizinhança do ${selectedPattern.center}`} 
          icon={<Zap size={24} className={styles.successIcon} />}
        >
          <div style={{textAlign: 'center', marginBottom: '1rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '0.5rem'}}>
            {selectedPattern.neighbors.map(n => <NumberChip key={n} number={n} size="large" />)}
          </div>
          
          {/* --- NOVO INFOCARD RENDERIZADO AQUI --- */}
          {showAccuracyInfo && (
            <div className={styles['strategy-card']} style={{ 
                margin: '0.5rem 0 1.5rem 0', 
                background: '#1f2937', 
                border: '1px solid #fde047' // Borda amarela para destaque
            }}>
              <h4 className={styles['card-title']} style={{color: '#fde047', margin: 0}}>
                O que é "Precisão (vs. Esperado)"?
              </h4>
              
              <div className={styles['analysis-content']} style={{paddingTop: '0.75rem'}}>
                <p className={styles['card-concept']} style={{ margin: 0, fontSize: '0.9rem' }}>
                  Esta métrica compara a taxa de acerto <strong>real</strong> da vizinhança com a taxa de acerto <strong>esperada</strong> pela probabilidade pura.
                </p>
                <ul style={{ margin: '0.75rem 0 0 1rem', padding: 0, fontSize: '0.9rem', color: '#d1d5db', listStylePosition: 'inside' }}>
                  <li><strong>100%:</strong> Normalidade. Acertou o esperado.</li>
                  <li><strong>&gt; 100%:</strong> Padrão "Quente". Acertou <strong>mais</strong> que o esperado. (Ex: 150% = 50% acima do normal).</li>
                  <li><strong>&lt; 100%:</strong> Padrão "Frio". Acertou <strong>menos</strong> que o esperado.</li>
                </ul>
                <button 
                  onClick={() => setShowAccuracyInfo(false)}
                  style={{
                    background: '#fde047',
                    color: '#111827',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    marginTop: '1rem',
                    width: '100%',
                    fontWeight: 'bold',
                    fontSize: '0.9rem'
                  }}
                >
                  Entendi
                </button>
              </div>
            </div>
          )}
          {/* --- FIM DO INFOCARD --- */}

          <div className={styles['stats-grid']}>
              <div style={{textAlign: 'center'}}>
                  <div className={styles['stat-label']} style={{justifyContent: 'center'}}>Taxa de Hit</div>
                  <div className={styles['stat-value']} style={{fontSize: '1.5rem', justifyContent: 'center'}}>{selectedPattern.hitRate.toFixed(1)}%</div>
              </div>
              <div style={{textAlign: 'center'}}>
                  {/* --- BOTÃO DE INFORMAÇÃO ATUALIZADO --- */}
                  <div className={styles['stat-label']} style={{justifyContent: 'center', alignItems: 'center'}}>
                    Precisão (vs. Esperado)
                    <button 
                      onClick={() => setShowAccuracyInfo(prev => !prev)} // Alterna a visibilidade
                      title="Clique para saber mais sobre 'Precisão'"
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: showAccuracyInfo ? '#fde047' : '#9ca3af', // Destaca se estiver ativo
                        cursor: 'pointer', 
                        padding: '0 0 0 4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <Info size={14} />
                    </button>
                  </div>
                  {/* --- FIM DA ATUALIZAÇÃO --- */}
                  <div className={styles['stat-value']} style={{fontSize: '1.5rem', justifyContent: 'center', color: selectedPattern.accuracy > 100 ? '#10b981' : '#ef4444'}}>
                    {selectedPattern.accuracy.toFixed(0)}%
                  </div>
              </div>
              <div style={{textAlign: 'center'}}>
                  <div className={styles['stat-label']} style={{justifyContent: 'center'}}>Status</div>
                  <div className={styles['stat-value']} style={{fontSize: '1.5rem', justifyContent: 'center', color: selectedPattern.status.key === 'confirmed' ? '#10b981' : (selectedPattern.status.key === 'warning' ? '#f59e0b' : '#6b7280')}}>
                    {selectedPattern.status.label.split(' ')[1]}
                  </div>
              </div>
          </div>

          <div className={styles.divider} />
          
          {/* REQ 4: Asymmetry & Momentum */}
          <div className={styles['stat-row']}>
            <span className={styles['stat-label']}><ArrowLeftRight size={16} /> Esq vs Dir</span>
            <span className={styles['stat-value']}>
              {selectedPattern.asymmetry.leftRate.toFixed(1)}% vs {selectedPattern.asymmetry.rightRate.toFixed(1)}%
            </span>
          </div>
          
          <div className={styles['stat-row']}>
            <span className={styles['stat-label']}><Clock size={16} /> Último Acerto</span>
            <span className={styles['stat-value']}>{selectedPattern.lastHitAgo} rodadas atrás</span>
          </div>

        </StatCard>
      )}

      {/* REQ 2: Top 3 Padrões (como "Melhor Aposta") */}
      <StatCard title="Top 3 Vizinhanças (Maior Precisão)" icon={<TrendingUp size={24} className={styles.warningIcon} />}>
        {analysis.top3.map((pattern, index) => (
          <div key={pattern.center} style={{ borderBottom: index < 2 ? '1px solid #374151' : 'none', padding: '0.75rem 0' }}>
            <div className={styles['stat-row']}>
              <span className={styles['stat-label']} style={{fontSize: '1.2rem'}}>
                <NumberChip number={pattern.center} size="large" />
              </span>
              <span className={styles['stat-value']} style={{color: '#fde047'}}>
                {pattern.accuracy.toFixed(0)}% Precisão
              </span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem', justifyContent: 'center'}}>
               {pattern.neighbors.map(n => <NumberChip key={n} number={n} />)}
            </div>
          </div>
        ))}
      </StatCard>
    </>
  );
};

export default NeighborAnalysis;