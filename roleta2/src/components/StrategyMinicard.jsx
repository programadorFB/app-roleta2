// components/StrategyMiniCard.jsx — HALF-CIRCLE GAUGE v2

import React from 'react';
import styles from '../pages/MasterDashboard.module.css';

const StrategyMiniCard = ({ name, score, status }) => {
  const clampedScore = Math.max(0, Math.min(100, score));

  const getColor = (s) => {
    if (s >= 70) return '#34d399';
    if (s >= 40) return '#fbbf24';
    return '#ef4444';
  };

  const color = getColor(clampedScore);

  // Geometria do meio-círculo
  const cx = 50;
  const cy = 48;
  const r = 34;
  const sw = 8;

  // 0% = direita (0°), 100% = esquerda (180°)
  const polarToCartesian = (pct) => {
    const angle = Math.PI * (1 - pct);
    return {
      x: cx + r * Math.cos(angle),
      y: cy - r * Math.sin(angle),
    };
  };

  const trackStart = polarToCartesian(0);
  const trackEnd = polarToCartesian(1);
  const trackPath = `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

  const pct = clampedScore / 100;
  const progressEnd = polarToCartesian(pct);
  const largeArc = pct > 0.5 ? 1 : 0;
  const fillPath = pct > 0
    ? `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${progressEnd.x} ${progressEnd.y}`
    : '';

  return (
    <div className={styles.gaugeCard}>
      <svg viewBox="0 0 100 56" className={styles.gaugeSvg}>
        {/* Glow ambient atrás */}
        <path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={sw + 8}
          strokeLinecap="round"
          opacity="0.04"
        />

        {/* Track de fundo */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={sw}
          strokeLinecap="round"
        />

        {/* Arco preenchido */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 5px ${color}66)`,
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Porcentagem — grande e centralizada */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="16"
          fontWeight="500"
          fontFamily="'Outfit', sans-serif"
          style={{ filter: `drop-shadow(0 0 10px ${color}55)` }}
        >
          {clampedScore.toFixed(0)}%
        </text>
      </svg>

      {/* Nome da estratégia */}
      <div className={styles.gaugeName}>{name}</div>
    </div>
  );
};

export default StrategyMiniCard;