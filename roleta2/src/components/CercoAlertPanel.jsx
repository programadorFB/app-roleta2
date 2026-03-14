// CercoAlertPanel.jsx - Painel de Alertas da Estratégia Cerco
import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle, Info, Clock, TrendingUp } from 'lucide-react';
import { monitorCercoStrategy } from '../services/alertLogic_cerco.jsx';
import styles from './DeepAnalysisPanel.module.css';

/**
 * Componente para exibir alertas da estratégia Cerco
 */
const CercoAlertPanel = ({ spinHistory, options = {} }) => {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);

  // Configurações padrão
  const defaultOptions = {
    enablePreFormation: true,
    enableFrequencyAnalysis: true,
    enableCandidateTracking: true,
    lookbackWindow: 50,
    maxVisibleAlerts: 3
  };

  const config = { ...defaultOptions, ...options };

  // Monitora padrões Cerco
  const alerts = useMemo(() => {
    if (!spinHistory || spinHistory.length < 5) {
      return [];
    }

    return monitorCercoStrategy(spinHistory, config);
  }, [spinHistory, config]);

  // Atualiza alertas ativos
  useEffect(() => {
    if (alerts.length > 0) {
      setActiveAlerts(alerts.slice(0, config.maxVisibleAlerts));
      
      // Adiciona ao histórico (mantém últimos 10)
      setAlertHistory(prev => [...alerts, ...prev].slice(0, 10));
    }
  }, [alerts, config.maxVisibleAlerts]);

  // Limpa alertas antigos automaticamente
  useEffect(() => {
    if (activeAlerts.length === 0) return;

    const timers = activeAlerts.map((alert, index) => 
      setTimeout(() => {
        setActiveAlerts(prev => prev.filter((_, i) => i !== index));
      }, alert.duration || 8000)
    );

    return () => timers.forEach(timer => clearTimeout(timer));
  }, [activeAlerts]);

  if (!spinHistory || spinHistory.length < 5) {
    return (
      <div className={styles['strategy-card']}>
        <div className={styles['strategy-header']}>
          <AlertCircle size={20} />
          <h4 className={styles['card-title']}>Estratégia Cerco (ZXYCZ)</h4>
        </div>
        <p className={styles['card-concept']} style={{ textAlign: 'center' }}>
          Aguardando pelo menos 5 spins para detectar padrões...
        </p>
      </div>
    );
  }

  return (
    <div className={styles['strategy-card']}>
      <div className={styles['strategy-header']}>
        <AlertCircle size={20} />
        <h4 className={styles['card-title']}>Estratégia Cerco (ZXYCZ)</h4>
      </div>

      <div className={styles['analysis-content']}>
        <p className={styles['card-concept']}>
          Monitora sequências onde o primeiro e último número são iguais (Z-X-Y-C-Z).
          {spinHistory.length} spins analisados.
        </p>

        {/* Alertas Ativos */}
        {activeAlerts.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h5 style={{ color: '#fde047', marginBottom: '0.5rem' }}>
              Alertas Ativos
            </h5>
            {activeAlerts.map((alert, index) => (
              <AlertCard key={index} alert={alert} />
            ))}
          </div>
        )}

        {/* Estatísticas Resumidas */}
        <CercoStats spinHistory={spinHistory} />
      </div>
    </div>
  );
};

/**
 * Card individual de alerta
 */
const AlertCard = ({ alert }) => {
  const getAlertIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle size={18} color="#10b981" />;
      case 'warning': return <AlertCircle size={18} color="#f59e0b" />;
      case 'info': return <Info size={18} color="#3b82f6" />;
      default: return <Clock size={18} color="#9ca3af" />;
    }
  };

  const getAlertColor = (type) => {
    switch (type) {
      case 'success': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#9ca3af';
    }
  };

  return (
    <div 
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: `2px solid ${getAlertColor(alert.type)}`,
        borderRadius: '0.5rem',
        padding: '0.75rem',
        marginBottom: '0.5rem',
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {getAlertIcon(alert.type)}
        <span style={{ fontWeight: 'bold', color: getAlertColor(alert.type) }}>
          {alert.title}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.9rem', color: '#d1d5db' }}>
        {alert.message}
      </p>

      {/* Detalhes do padrão (se disponível) */}
      {alert.pattern && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          {alert.pattern.sequence && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {alert.pattern.sequence.map((num, i) => (
                <NumberChip 
                  key={i} 
                  number={num} 
                  isHighlighted={i === 0 || i === alert.pattern.sequence.length - 1} 
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Candidatos (se disponível) */}
      {alert.candidates && (
        <div style={{ marginTop: '0.5rem' }}>
          <table className={styles['analysisTable']}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Aparições</th>
                <th>Prob.</th>
              </tr>
            </thead>
            <tbody>
              {alert.candidates.slice(0, 3).map((candidate, i) => (
                <tr key={i}>
                  <td><NumberChip number={candidate.number} /></td>
                  <td>{candidate.appearances}x</td>
                  <td>{candidate.probability}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * Estatísticas da estratégia Cerco
 */
const CercoStats = ({ spinHistory }) => {
  const stats = useMemo(() => {
    let patternCount = 0;
    const uniqueNumbers = new Set();

    // Analisa últimos 100 spins
    const window = Math.min(spinHistory.length, 100);
    for (let i = 0; i <= spinHistory.length - 5; i++) {
      const sequence = spinHistory.slice(i, i + 5);
      const numbers = sequence.map(s => s.number);
      
      if (numbers[0] === numbers[4]) {
        patternCount++;
        uniqueNumbers.add(numbers[0]);
      }
    }

    return {
      totalPatterns: patternCount,
      uniqueNumbers: Array.from(uniqueNumbers),
      frequency: window >= 5 ? ((patternCount / (window / 5)) * 100).toFixed(1) : 0
    };
  }, [spinHistory]);

  return (
    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <TrendingUp size={16} color="#fde047" />
        <span style={{ fontWeight: 'bold', color: '#fde047' }}>Estatísticas</span>
      </div>
      
      <div className={styles['stat-row']}>
        <span className={styles['stat-label']}>Padrões Detectados:</span>
        <span className={styles['stat-value']}>{stats.totalPatterns}</span>
      </div>
      
      <div className={styles['stat-row']}>
        <span className={styles['stat-label']}>Frequência:</span>
        <span className={styles['stat-value']}>{stats.frequency}%</span>
      </div>
      
      {stats.uniqueNumbers.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Números que formaram Cerco:</span>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
            {stats.uniqueNumbers.slice(0, 10).map((num, i) => (
              <NumberChip key={i} number={num} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Chip de número estilizado
 */
const NumberChip = ({ number, isHighlighted = false }) => {
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const color = number === 0 ? 'green' : (redNumbers.includes(number) ? 'red' : 'black');
  
  return (
    <span 
      className={`${styles['history-number']} ${styles[color]}`}
      style={{ 
        border: isHighlighted ? '2px solid #fde047' : 'none',
        boxShadow: isHighlighted ? '0 0 8px #fde047' : 'inset 0 1px 3px rgba(0,0,0,0.4)'
      }}
    >
      {number}
    </span>
  );
};

export default CercoAlertPanel;