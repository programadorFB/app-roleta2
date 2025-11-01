// components/TerminalAnalysis.jsx

import React, { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Clock, Repeat, AlertOctagon, Flame } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css'; // Reutilizamos o mesmo CSS

// --- Componentes Auxiliares de UI ---

// Card Padrão (reutilizado do DeepAnalysisPanel)
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

// Badge de Status (Verde, Amarelo, Vermelho)
const StatusBadge = ({ absence }) => {
  let status = { color: '#f59e0b', label: 'NORMAL' }; // Amarelo

  if (absence > 25) { // Muito seco, "devendo"
    status = { color: '#10b981', label: 'FRIO' }; // Verde
  } else if (absence <= 5) { // Saiu recentemente, "quente"
    status = { color: '#ef4444', label: 'QUENTE' }; // Vermelho
  }

  return (
    <span style={{
      padding: '0.2rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.7rem',
      fontWeight: 'bold',
      backgroundColor: `${status.color}22`,
      color: status.color,
      border: `1px solid ${status.color}44`,
      textAlign: 'center'
    }}>
      {status.label}
    </span>
  );
};

// Item da Timeline
const TimelineItem = ({ terminal }) => (
  <span style={{
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid #4b5563',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fde047',
    fontWeight: 'bold',
    fontSize: '0.8rem',
    flexShrink: 0,
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)'
  }}>
    {terminal}
  </span>
);

// --- Componente Principal da Análise de Terminais ---

const TerminalAnalysis = ({ spinHistory }) => {

  const analysis = useMemo(() => {
    const totalSpins = spinHistory.length;
    if (totalSpins < 10) {
      return { totalSpins: 0, terminalStats: [], repetitionRate: 0, mostDue: null, hotAlignment: 0, coldAlignment: 0, timeline: [] };
    }

    // 1. Converter histórico de números em histórico de terminais
    const terminals = spinHistory.map(spin => spin.number % 10);
    const timeline = terminals.slice(0, 110);

    // 2. Calcular estatísticas base
    let terminalStats = Array.from({ length: 10 }, (_, i) => ({
      terminal: i,
      count: 0,
      absence: totalSpins,
    }));

    // 3. Calcular Contagem e Ausência
    terminals.forEach((terminal, index) => {
      const stat = terminalStats.find(s => s.terminal === terminal);
      if (stat) {
        stat.count++;
        if (stat.absence === totalSpins) { // Se for a primeira vez que encontramos
          stat.absence = index;
        }
      }
    });

    // 4. Calcular Taxa de Repetição
    let repetitions = 0;
    for (let i = 0; i < terminals.length - 1; i++) {
      if (terminals[i] === terminals[i + 1]) {
        repetitions++;
      }
    }
    const repetitionRate = totalSpins > 1 ? (repetitions / (totalSpins - 1)) * 100 : 0;

    // 5. Encontrar Mais "Devendo" e Mais "Quente"
    const sortedByAbsence = [...terminalStats].sort((a, b) => b.absence - a.absence);
    const mostDue = sortedByAbsence[0];

    const sortedByCount = [...terminalStats].sort((a, b) => b.count - a.count);
    
    // 6. Calcular "Percentuais de Alinhamento" (ex: últimos 50 spins)
    const recentTerminals = terminals.slice(0, 50);
    const hotTerminals = sortedByCount.slice(0, 3).map(s => s.terminal); // Top 3
    const coldTerminals = sortedByCount.slice(7, 10).map(s => s.terminal); // Bottom 3

    const hotHits = recentTerminals.filter(t => hotTerminals.includes(t)).length;
    const coldHits = recentTerminals.filter(t => coldTerminals.includes(t)).length;
    
    const hotAlignment = recentTerminals.length > 0 ? (hotHits / recentTerminals.length) * 100 : 0;
    const coldAlignment = recentTerminals.length > 0 ? (coldHits / recentTerminals.length) * 100 : 0;

    return {
      totalSpins,
      terminalStats,
      repetitionRate,
      mostDue,
      hotAlignment,
      coldAlignment,
      timeline
    };

  }, [spinHistory]);

  if (analysis.totalSpins === 0) {
    return (
      <div className={styles['strategy-card']}>
        <p className={`${styles['card-concept']} ${styles['empty-state']}`} style={{ textAlign: 'center' }}>
          Aguardando mais sinais para análise de terminais...
        </p>
      </div>
    );
  }

  return (
    // Usamos um Fragmento <>...</> para que ele se encaixe na aba
    <>
      <h3 className={styles['dashboard-title']}>
        Análise de Terminais ({analysis.totalSpins} Sinais)
      </h3>

      {/* --- Cards de Métricas Principais --- */}
      <div className={styles['stats-grid']}>
        <StatCard title="Terminal Mais Devendo" icon={<AlertOctagon size={24} className={styles.dangerIcon} />}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fde047' }}>
              TM{analysis.mostDue.terminal}
            </span>
            <div style={{ fontSize: '1.2rem' }}>
              {analysis.mostDue.absence} spins
              <div style={{ fontSize: '0.9rem', color: '#9ca3af' }}>sem sair</div>
            </div>
          </div>
        </StatCard>
        
        <StatCard title="Taxa de Repetição" icon={<Repeat size={24} className={styles.infoIcon} />}>
           <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fde047' }}>
              {analysis.repetitionRate.toFixed(1)}%
            </span>
            <div style={{ fontSize: '0.9rem', color: '#9ca3af' }}>de repetições consecutivas</div>
          </div>
        </StatCard>
      </div>

      {/* --- Card de Alinhamento --- */}
      <StatCard title="Alinhamento (Últimos 50 Spins)" icon={<TrendingUp size={24} className={styles.warningIcon} />}>
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']} title="Performance dos 3 terminais mais frequentes">
            <Flame size={16} className={styles.dangerIcon} /> Alinhamento Quente
          </span>
          <span className={styles['stat-value']}>{analysis.hotAlignment.toFixed(2)}%</span>
        </div>
        <div className={styles['stat-row']}>
          <span className={styles['stat-label']} title="Performance dos 3 terminais menos frequentes">
            <TrendingDown size={16} className={styles.successIcon} /> Alinhamento Frio
          </span>
          <span className={styles['stat-value']}>{analysis.coldAlignment.toFixed(2)}%</span>
        </div>
      </StatCard>

      {/* --- Grid 2x5 de Terminais --- */}
      <StatCard title="Status dos Terminais" icon={<Target size={24} className={styles.infoIcon} />}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
          gap: '0.75rem' 
        }}>
          {analysis.terminalStats.map(stat => (
            <div key={stat.terminal} style={{
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              border: '1px solid #374151',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fde047' }}>
                TM {stat.terminal}
              </span>
              <StatusBadge absence={stat.absence} />
              <div style={{ fontSize: '1rem', color: 'white', fontWeight: 'bold' }}>
                {stat.absence} <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>spins</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                {stat.count} hits
              </div>
            </div>
          ))}
        </div>
      </StatCard>
      
      {/* --- Timeline --- */}
      <StatCard title="Timeline de Terminais (Últimos 110)" icon={<Clock size={24} className={styles.infoIcon} />}>
        <div style={{
          display: 'flex',
          gap: '0.35rem',
          overflowX: 'auto',
          padding: '0.5rem',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '0.5rem',
          border: '1px solid #374151'
        }}>
          {analysis.timeline.map((terminal, index) => (
            <TimelineItem key={index} terminal={terminal} />
          ))}
        </div>
      </StatCard>
    </>
  );
};

export default TerminalAnalysis;