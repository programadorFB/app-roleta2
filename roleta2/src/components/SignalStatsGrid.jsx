// components/SignalStatsGrid.jsx

import React from 'react';
import styles from '../pages/MasterDashboard.module.css';

const StatItem = ({ icon, label, value }) => (
  <div style={{ textAlign: 'center', flex: 1 }}>
    <div 
      className={styles['stat-label']} 
      style={{ justifyContent: 'center', fontSize: '10px' }}
    >
      {icon}<br/> {label}
    </div>
    <div 
      className={styles['stat-value']} 
      style={{ justifyContent: 'center', fontSize: '15px' }}
    >
      {value}
    </div>
  </div>
);

const SignalStatsGrid = ({ entrySignal }) => {
  if (!entrySignal) return null;

  return (
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
      <StatItem 
        icon="💰" 
        label="Sugestão" 
        value="5 unids" 
      />
      <StatItem 
        icon="🎯" 
        label="Confiança" 
        value={`${entrySignal.confidence.toFixed(0)}%`} 
      />
      <StatItem 
        icon="⏱️" 
        label="Válido" 
        value={`${entrySignal.validFor} giros`} 
      />
    </div>
  );
};

export default SignalStatsGrid;