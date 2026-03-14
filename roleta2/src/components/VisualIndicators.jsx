// src/components/VisualIndicators.jsx
import React, { useState, useEffect } from 'react';
import styles from './DeepAnalysisPanel.module.css'; // Reutiliza os estilos
import { Activity } from 'lucide-react';

/**
 * REQ 5: Sistema de Badges Dinâmicos
 */
export const DynamicBadge = ({ percentage }) => {
  let badge;
  
  // Converte a % (0-100) para um status
  if (percentage > 40) {
    badge = { label: '🔥 Muito Quente', style: styles.badgeHot };
  } else if (percentage > 30) {
    badge = { label: '⚡ Quente', style: styles.badgeWarm };
  } else if (percentage > 20) {
    badge = { label: '📊 Normal', style: styles.badgeNormal }; // Você precisará adicionar .badgeNormal ao CSS
  } else if (percentage > 10) {
    badge = { label: '❄️ Frio', style: styles.badgeCold }; // Adicione .badgeCold
  } else {
    badge = { label: '🧊 Congelado', style: styles.badgeFrozen }; // Adicione .badgeFrozen
  }

  return (
    <span className={`${badge.style} ${styles.dynamicBadge}`}>
      {badge.label}
    </span>
  );
};

/**
 * REQ 3: Contador Regressivo de Atualização
 * (Baseado no tempo, não no spin)
 */
export const UpdateCountdown = ({ duration = 5000, countdownKey }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const percentage = (timeLeft / duration) * 100;

  useEffect(() => {
    // Reseta o contador a cada novo spin (mudança na key)
    setTimeLeft(duration);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 100) { // 100ms restantes
          clearInterval(interval);
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [countdownKey, duration]); // Depende da key para reiniciar

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <div className={styles['stat-row']}>
        <span className={styles['stat-label']}>
          <Activity size={16} /> Próxima atualização em:
        </span>
        <span className={styles['stat-value']} style={{ fontSize: '1.2rem' }}>
          {(timeLeft / 1000).toFixed(1)}s
        </span>
      </div>
      <div className={styles['progress-bar-container']} style={{ height: '8px', marginTop: '0.5rem' }}>
        <div 
          className={`${styles['progress-bar-fill']} ${styles['gold']}`} 
          style={{ 
            width: `${percentage}%`,
            transition: 'width 0.1s linear' // Animação suave
          }}
        >
        </div>
      </div>
    </div>
  );
};