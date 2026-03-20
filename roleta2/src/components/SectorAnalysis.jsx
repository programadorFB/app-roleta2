import React, { useMemo } from 'react';
import { Target, AlertTriangle, Clock } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css';

// --- Definição dos Setores Físicos da Roleta ---
// Ordem física dos números na roda europeia
const SECTORS = {
  TM0: { name: 'Setor 0', numbers: [0, 32, 15, 19, 4, 21] },
  TM1: { name: 'Setor 1', numbers: [2, 25, 17, 34, 6, 27] },
  TM2: { name: 'Setor 2', numbers: [13, 36, 11, 30, 8, 23] },
  TM3: { name: 'Setor 3', numbers: [10, 5, 24, 16, 33, 1] },
  TM4: { name: 'Setor 4', numbers: [20, 14, 31, 9, 22, 18] },
  TM5: { name: 'Setor 5', numbers: [29, 7, 28, 12, 35, 3, 26] }
};

const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

const SectorsAnalysis = ({ spinHistory }) => {
  const analysis = useMemo(() => {
    const totalSpins = spinHistory.length;
    const history = spinHistory.filter;
    
    if (totalSpins === 0) {
      return { sectors: [], totalSpins: 0, hottestSector: null, coldestSector: null };
    }

    // Analisar cada setor
    const sectorStats = Object.entries(SECTORS).map(([key, sector]) => {
      const sectorNumbers = sector.numbers;
      
      // Contar hits recentes (últimas 50 rodadas)
      const recentHits = spinHistory.slice(0, Math.min(50, totalSpins)).filter(spin => 
        sectorNumbers.includes(spin.number)
      ).length;
      
      // Encontrar último número que saiu deste setor
      const lastHitIndex = spinHistory.findIndex(spin => 
        sectorNumbers.includes(spin.number)
      );
      
      const lastNumber = lastHitIndex !== -1 ? spinHistory[lastHitIndex].number : null;
      const spinsSinceLastHit = lastHitIndex === -1 ? totalSpins : lastHitIndex;
      
      // Encontrar o número "mais Ausente" (que não sai há mais tempo)
      let driestNumber = null;
      let maxDryness = -1;
      
      sectorNumbers.forEach(num => {
        const index = spinHistory.findIndex(spin => spin.number === num);
        const dryness = index === -1 ? totalSpins : index;
        if (dryness > maxDryness) {
          maxDryness = dryness;
          driestNumber = num;
        }
      });
      
      // Calcular temperatura do setor (baseado em hits recentes)
      const temperature = totalSpins > 0 ? (recentHits / Math.min(100, totalSpins)) * 100 : 0;
      
      return {
        key,
        name: sector.name,
        numbers: sectorNumbers,
        recentHits,
        lastNumber,
        spinsSinceLastHit,
        driestNumber,
        maxDryness,
        temperature,
        status: temperature > 20 ? 'hot' : temperature > 10 ? 'normal' : 'cold'
      };
    });
    
    // Ordenar por "Há" (maior tempo sem sair)
    const sortedSectors = sectorStats.sort((a, b) => b.spinsSinceLastHit - a.spinsSinceLastHit);
    
    return {
      sectors: sortedSectors,
      totalSpins,
      hottestSector: sectorStats.reduce((max, s) => s.temperature > max.temperature ? s : max, sectorStats[0]),
      coldestSector: sectorStats.reduce((min, s) => s.temperature < min.temperature ? s : min, sectorStats[0])
    };
  }, [spinHistory]);

  const NumberChip = ({ number }) => {
    const color = getNumberColor(number);
    return (
      <span 
        className={`${styles['history-number']} ${styles[color]}`}
        style={{ 
          cursor: 'default',
          fontSize: '0.7rem',
          padding: '0.2rem 0.4rem',
          minWidth: '20px'
        }}
      >
        {number}
      </span>
    );
  };

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

  const DrynessBadge = ({ spins }) => {
    let color, label;
    if (spins > 30) {
      color = '#ef4444';
      label = 'MUITO Ausente';
    } else if (spins > 20) {
      color = '#f59e0b';
      label = 'Ausente';
    } else if (spins > 10) {
      color = '#eab308';
      label = 'MORNO';
    } else {
      color = '#10b981';
      label = 'ATIVO';
    }

    return (
      <span style={{
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        backgroundColor: `${color}22`,
        color: color,
        border: `1px solid ${color}44`
      }}>
        {label}
      </span>
    );
  };

  // O estado de loading principal é tratado pelo DeepAnalysisPanel
  if (analysis.totalSpins === 0) {
    return null; // Não renderiza nada se não houver spins (DeepAnalysisPanel já mostra o loading)
  }

  return (
    // Retorna um Fragmento <>...</> em vez de um <div>
    <>
      <h3 className={styles['dashboard-title']}>
        Análise de Setores Físicos ({analysis.totalSpins} Sinais)
      </h3>

      {/* Resumo Geral */}
      <StatCard 
        title="Resumo dos Setores" 
        icon={<Target size={24} className={styles['infoIcon']} />}
      >
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']}>Setor Mais Quente:</span>
          <span className={styles['stat-value']}>
            {analysis.hottestSector?.name} ({analysis.hottestSector?.temperature.toFixed(1)}%)
          </span>
        </div>
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']}>Setor Mais Frio:</span>
          <span className={styles['stat-value']}>
            {analysis.coldestSector?.name} ({analysis.coldestSector?.temperature.toFixed(1)}%)
          </span>
        </div>

      </StatCard>

      {/* Tabela de Setores */}
      <StatCard 
        title="Status dos Setores" 
        icon={<AlertTriangle size={24} className={styles['warningIcon']} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {analysis.sectors.map((sector) => (
            <div 
              key={sector.key}
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '0.5rem',
                padding: '1rem',
                border: `2px solid ${
                  sector.status === 'hot' ? '#10b981' : 
                  sector.status === 'cold' ? '#ef4444' : '#6b7280'
                }`
              }}
            >
              {/* Header do Setor */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid #374151'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    color: '#fde047'
                  }}>
                    {sector.name}
                  </span>
                  <DrynessBadge spins={sector.spinsSinceLastHit} />
                </div>
                
              </div>

              {/* Números do Setor */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem',
                marginBottom: '0.75rem'
              }}>
                {sector.numbers.map(num => (
                  <NumberChip key={num} number={num} />
                ))}
              </div>

              {/* Estatísticas do Setor */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: '#9ca3af' }}>Último nº:</span>{' '}
                  <span style={{ color: '#fde047', fontWeight: 'bold' }}>
                    {sector.lastNumber !== null ? sector.lastNumber : 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>Há:</span>{' '}
                  <span style={{ 
                    color: sector.spinsSinceLastHit > 30 ? '#ef4444' : 
                           sector.spinsSinceLastHit > 20 ? '#f59e0b' : '#10b981',
                    fontWeight: 'bold' 
                  }}>
                    {sector.spinsSinceLastHit} rodadas
                  </span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>Mais Ausente:</span>{' '}
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                    {sector.driestNumber}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>Há:</span>{' '}
                  <span style={{ 
                    color: sector.maxDryness > 40 ? '#ef4444' : 
                           sector.maxDryness > 25 ? '#f59e0b' : '#fde047',
                    fontWeight: 'bold' 
                  }}>
                    {sector.maxDryness} rodadas
                  </span>
                </div>
              </div>

              {/* Barra de Temperatura */}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: '#9ca3af',
                  marginBottom: '0.25rem'
                }}>
                  <span>Temperatura</span>
                  <span>{sector.temperature.toFixed(1)}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: '#374151',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.min(sector.temperature * 2, 100)}%`,
                    height: '100%',
                    background: sector.status === 'hot' ? 
                      'linear-gradient(90deg, #10b981, #059669)' :
                      sector.status === 'cold' ?
                      'linear-gradient(90deg, #3b82f6, #2563eb)' :
                      'linear-gradient(90deg, #eab308, #ca8a04)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </StatCard>

      {/* Legenda */}
      <div style={{
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        fontSize: '0.85rem',
        color: '#9ca3af'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#fde047' }}>
          📊 Legenda:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          <div>• <span style={{ color: '#ef4444' }}>Muito Ausente</span>: +30 rodadas</div>
          <div>• <span style={{ color: '#f59e0b' }}>Ausente</span>: 20-30 rodadas</div>
          <div>• <span style={{ color: '#eab308' }}>Morno</span>: 10-20 rodadas</div>
          <div>• <span style={{ color: '#10b981' }}>Ativo</span>: -10 rodadas</div>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontStyle: 'italic' }}>
          * Temperatura: % de repetições nas últimas 50 rodadas
        </div>
      </div>
    </>
  );
};

export default SectorsAnalysis;