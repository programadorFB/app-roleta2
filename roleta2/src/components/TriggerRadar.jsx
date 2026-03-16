// components/TriggerRadar.jsx — Radar dos 5 Gatilhos Mais Fortes
// Mostra visualmente os top triggers com instruções claras de aposta

import React, { useMemo } from 'react';
import { Radar } from 'lucide-react';
import { getActiveTriggers } from '../services/triggerAnalysis';
import { RED_NUMBERS } from '../constants/roulette';
import styles from './TriggerRadar.module.css';

const TOP_N = 5;
const CX = 130;
const CY = 130;
const R = 80;
const RINGS = 4;

function getColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

function getHeatLabel(lift) {
  if (lift >= 35) return { label: 'QUENTE', color: '#ef4444' };
  if (lift >= 15)  return { label: 'AQUECIDO', color: '#f97316' };
  if (lift >= 10)  return { label: 'MORNO', color: '#c9a052' };
  return { label: 'FRIO', color: '#64748b' };
}

const CHIP_COLORS = {
  red:   { bg: 'rgba(220,38,38,0.8)', text: '#fff' },
  black: { bg: 'rgba(30,30,30,0.9)',  text: '#ccc', border: 'rgba(255,255,255,0.15)' },
  green: { bg: 'rgba(5,150,105,0.8)', text: '#fff' },
};

function polarPoint(axisIndex, total, fraction) {
  const angle = (Math.PI * 2 * axisIndex) / total - Math.PI / 2;
  return {
    x: CX + R * fraction * Math.cos(angle),
    y: CY + R * fraction * Math.sin(angle),
  };
}

function polygonPts(values, total) {
  return values
    .map((v, i) => {
      const p = polarPoint(i, total, Math.max(0.05, Math.min(1, v / 100)));
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

const TriggerRadar = ({ triggerMap, spinHistory }) => {
  const topTriggers = useMemo(() => {
    if (!triggerMap || triggerMap.size === 0 || spinHistory.length < 10) return [];
    const all = getActiveTriggers(triggerMap);
    return all.slice(0, TOP_N);
  }, [triggerMap, spinHistory]);

  if (topTriggers.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.shine} />
        <div className={styles.header}>
          <Radar size={13} className={styles.headerIcon} />
          <span>Top Gatilhos</span>
        </div>
        <div className={styles.empty}>Aguardando dados...</div>
      </div>
    );
  }

  const count = topTriggers.length;
  // Normaliza lift para 0-100 (lift 0→0, lift 15+→100)
  const values = topTriggers.map(t => Math.min(100, ((t.lift || 0) / 15) * 100));
  const dataPoints = polygonPts(values, count);

  return (
    <div className={styles.container}>
      <div className={styles.shine} />
      <div className={styles.header}>
        <Radar size={13} className={styles.headerIcon} />
        <span>Top {count} Gatilhos</span>
      </div>

      {/* Radar SVG */}
      <div className={styles.radarWrap}>
        <svg viewBox="0 0 260 260" className={styles.radarSvg}>
          {/* Rings */}
          {Array.from({ length: RINGS }, (_, ri) => {
            const frac = (ri + 1) / RINGS;
            const pts = Array.from({ length: count }, (_, ai) => {
              const p = polarPoint(ai, count, frac);
              return `${p.x},${p.y}`;
            }).join(' ');
            return (
              <polygon key={ri} points={pts} fill="none"
                stroke="rgba(201,160,82,0.08)"
                strokeWidth={ri === RINGS - 1 ? 1.2 : 0.6} />
            );
          })}

          {/* Axis lines */}
          {Array.from({ length: count }, (_, i) => {
            const p = polarPoint(i, count, 1);
            return (
              <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="rgba(201,160,82,0.1)" strokeWidth={0.6} />
            );
          })}

          {/* Data fill */}
          <polygon points={dataPoints} fill="rgba(201,160,82,0.1)" stroke="none" />

          {/* Data stroke */}
          <polygon points={dataPoints} fill="none"
            stroke="rgba(201,160,82,0.7)" strokeWidth={1.5}
            strokeLinejoin="round" className={styles.dataPolygon} />

          {/* Vertex dots */}
          {values.map((v, i) => {
            const p = polarPoint(i, count, Math.max(0.05, Math.min(1, v / 100)));
            return (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#c9a052"
                className={styles.vertexDot}
                style={{ animationDelay: `${i * 0.4}s` }} />
            );
          })}

          {/* Axis labels: trigger number chip + confidence */}
          {topTriggers.map((t, i) => {
            const p = polarPoint(i, count, 1.28);
            const col = getColor(t.triggerNumber);
            const _anchor = Math.abs(p.x - CX) < 5 ? 'middle'
              : p.x > CX ? 'start' : 'end';
            const yOff = p.y < CY - 20 ? -2 : p.y > CY + 20 ? 10 : 4;
            return (
              <g key={i}>
                {/* Chip circle */}
                <circle cx={p.x} cy={p.y + yOff - 6} r={11}
                  fill={CHIP_COLORS[col].bg}
                  stroke={CHIP_COLORS[col].border || 'none'} strokeWidth={1} />
                <text x={p.x} y={p.y + yOff - 2}
                  textAnchor="middle" fill={CHIP_COLORS[col].text}
                  fontSize="9" fontWeight="800" fontFamily="Outfit, sans-serif">
                  {t.triggerNumber}
                </text>
                {/* Heat label below chip */}
                <text x={p.x} y={p.y + yOff + 12}
                  textAnchor="middle"
                  fill={getHeatLabel(t.lift).color}
                  fontSize="8" fontWeight="800" fontFamily="Outfit, sans-serif">
                  {getHeatLabel(t.lift).label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Lista clara: Saiu X → Aposte em Y */}
      <div className={styles.tipsList}>
        {topTriggers.map((t, _i) => {
          const col = getColor(t.triggerNumber);
          return (
            <div key={t.triggerNumber} className={styles.tipRow}>
              <span className={`${styles.tipChip} ${styles[`tipChip--${col}`]}`}>
                {t.triggerNumber}
              </span>
              <span className={styles.tipArrow}>&rarr;</span>
              <span className={styles.tipAction}>
                {t.label}
              </span>
              <span className={styles.tipConf} style={{ color: getHeatLabel(t.lift).color }}>
                {getHeatLabel(t.lift).label}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        Quando sair o numero, aposte nos indicados por {spinHistory.length} rodadas
      </div>
    </div>
  );
};

export default TriggerRadar;
