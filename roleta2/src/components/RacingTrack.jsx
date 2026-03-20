// components/RacingTrack.jsx — STADIUM RACETRACK v6 — GREEN TARGETS + GOLD NEIGHBORS
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './RacingTrack.css';
import { PHYSICAL_WHEEL } from '../constants/roulette.js';

const getNumColor = (n) => {
  if (n === 0) return '#10b981';
  const R = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  return R.includes(n) ? '#e53e3e' : '#ccc';
};

const WHEEL = PHYSICAL_WHEEL;

const HALF = Math.floor(WHEEL.length / 2) + 2;
const WHEEL_ROTATED = [...WHEEL.slice(HALF), ...WHEEL.slice(0, HALF)];

const RacingTrack = ({ selectedResult, onNumberClick, entrySignals = [], targetSignals = [] }) => {
  const [activeNumber, setActiveNumber] = useState(null);
  const [isFlipped, setIsFlipped] = useState(true);

  useEffect(() => {
    if (selectedResult) {
      setActiveNumber(selectedResult.number);
      const t = setTimeout(() => setActiveNumber(null), 3002);
      return () => clearTimeout(t);
    }
  }, [selectedResult]);

  const isActive = (n) => activeNumber === n;
  const isTarget = (n) => targetSignals.includes(n);
  const isNeighbor = (n) => entrySignals.includes(n) && !targetSignals.includes(n);

  const wheel = isFlipped ? WHEEL_ROTATED : WHEEL;

  // === STADIUM GEOMETRY ===
  const W = 700, H = 108;
  const pad = 16;
  const R = (H - pad * 2) / 2;
  const straightLen = W - pad * 2 - R * 2;
  const totalPerimeter = 2 * straightLen + 2 * Math.PI * R;

  const s1 = straightLen / totalPerimeter;
  const s2 = s1 + (Math.PI * R) / totalPerimeter;
  const s3 = s2 + straightLen / totalPerimeter;

  const leftCx = pad + R;
  const rightCx = W - pad - R;
  const cy = H / 2;

  const getPos = useCallback((t) => {
    const tt = ((t % 1) + 1) % 1;
    if (tt < s1) {
      const frac = tt / s1;
      return { x: leftCx + frac * straightLen, y: pad };
    } else if (tt < s2) {
      const frac = (tt - s1) / (s2 - s1);
      const angle = -Math.PI / 2 + frac * Math.PI;
      return { x: rightCx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
    } else if (tt < s3) {
      const frac = (tt - s2) / (s3 - s2);
      return { x: rightCx - frac * straightLen, y: H - pad };
    } else {
      const frac = (tt - s3) / (1 - s3);
      const angle = Math.PI / 2 + frac * Math.PI;
      return { x: leftCx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
    }
  }, [leftCx, rightCx, cy, pad, R, H, straightLen, s1, s2, s3]);

  const positions = useMemo(() => {
    return wheel.map((num, i) => {
      const t = i / wheel.length;
      const pos = getPos(t);
      return { num, ...pos };
    });
  }, [wheel, getPos]);

  const outlinePath = `
    M ${leftCx} ${pad}
    L ${rightCx} ${pad}
    A ${R} ${R} 0 0 1 ${rightCx} ${H - pad}
    L ${leftCx} ${H - pad}
    A ${R} ${R} 0 0 1 ${leftCx} ${pad} Z`;

  const Ri = R - 18;
  const innerPath = Ri > 4 ? `
    M ${leftCx} ${cy - Ri}
    L ${rightCx} ${cy - Ri}
    A ${Ri} ${Ri} 0 0 1 ${rightCx} ${cy + Ri}
    L ${leftCx} ${cy + Ri}
    A ${Ri} ${Ri} 0 0 1 ${leftCx} ${cy - Ri} Z` : '';

  const labels = isFlipped ? [
    { text: 'TIER', x: W * 0.22 },
    { text: 'ORPHELINS', x: W * 0.53 },
    { text: 'VOISINS', x: W * 0.78 },
  ] : [
    { text: 'VOISINS', x: W * 0.22 },
    { text: 'ORPHELINS', x: W * 0.47 },
    { text: 'TIER', x: W * 0.73 },
  ];

  const zeroLabelX = isFlipped ? W - pad - 2 : pad + 2;
  const cellR = 13;

  return (
    <div className="racetrack-oval-container">
      <svg viewBox={`0 0 ${W} ${H}`} className="racetrack-oval-svg" preserveAspectRatio="xMidYMid meet">

        {/* Stadium fill + border */}
        <path d={outlinePath} fill="rgba(180,120,50,0.015)" stroke="rgba(139,94,52,0.2)" strokeWidth="1" />

        {/* Inner outline */}
        {innerPath && (
          <path d={innerPath} fill="none" stroke="rgba(139,94,52,0.1)" strokeWidth="0.5" />
        )}

        {/* Section labels */}
        {labels.map(l => (
          <text key={l.text} x={l.x} y={cy} textAnchor="middle" dominantBaseline="central"
            fill="rgba(201,160,82,0.22)" fontSize="8" fontWeight="700"
            fontFamily="'Outfit',sans-serif" letterSpacing="0.15em"
          >{l.text}</text>
        ))}

        {/* ZERO label */}
        <text x={zeroLabelX} y={cy} textAnchor="middle" dominantBaseline="central"
          fill="rgba(201,160,82,0.22)" fontSize="7" fontWeight="700"
          fontFamily="'Outfit',sans-serif" letterSpacing="0.1em"
          transform={`rotate(-90, ${zeroLabelX}, ${cy})`}
        >ZERO</text>

        {/* Flip button */}
        <g onClick={() => setIsFlipped(f => !f)} style={{ cursor: 'pointer' }} className="rt-flip-btn">
          <circle cx={W / 2} cy={cy} r="10"
            fill="rgba(180,120,50,0.06)" stroke="rgba(201,160,82,0.2)" strokeWidth="0.5" />
          <path
            d={`M ${W/2 - 4} ${cy - 1} A 4 4 0 1 1 ${W/2 + 4} ${cy - 1}`}
            fill="none" stroke="rgba(201,160,82,0.5)" strokeWidth="1" strokeLinecap="round"
          />
          <path
            d={`M ${W/2 + 2} ${cy - 4} L ${W/2 + 4.5} ${cy - 1} L ${W/2 + 1.5} ${cy - 0.5}`}
            fill="rgba(201,160,82,0.5)" stroke="none"
          />
        </g>

        {/* Numbers */}
        {positions.map(({ num, x, y }) => {
          const act = isActive(num);
          const tgt = isTarget(num);
          const nbr = isNeighbor(num);
          const col = getNumColor(num);

          // Cores: target = verde, neighbor = ouro, nenhum = neutro
          const ringColor = tgt ? 'rgba(52,211,153,0.7)' : nbr ? 'rgba(201,160,82,0.55)' : null;
          const ringClass = tgt ? 'rt-target-ring' : 'rt-entry-ring';
          const fillColor = act ? 'rgba(253,224,71,0.12)'
            : tgt ? 'rgba(52,211,153,0.08)'
            : nbr ? 'rgba(201,160,82,0.06)'
            : 'rgba(255,255,255,0.015)';
          const strokeColor = act ? 'rgba(253,224,71,0.4)'
            : tgt ? 'rgba(52,211,153,0.4)'
            : nbr ? 'rgba(201,160,82,0.3)'
            : 'rgba(180,120,50,0.12)';

          return (
            <g key={num} onClick={() => onNumberClick(num)} style={{ cursor: 'pointer' }} className="rt-cell">
              {/* Entry/Target ring */}
              {(tgt || nbr) && !act && (
                <circle cx={x} cy={y} r={cellR + 3} fill="none"
                  stroke={ringColor} strokeWidth={tgt ? 2 : 1.5}
                  className={ringClass} />
              )}
              {/* Active ring */}
              {act && (
                <circle cx={x} cy={y} r={cellR + 5} fill="none"
                  stroke="rgba(253,224,71,0.65)" strokeWidth="2" className="rt-active-ring" />
              )}
              {/* Circle bg */}
              <circle cx={x} cy={y} r={cellR}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={act ? 1.2 : tgt ? 1 : 0.5}
              />
              {/* Number text */}
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                fill={act ? '#fde047' : tgt ? '#34d399' : col}
                fontSize="9.5" fontWeight="700" fontFamily="'Outfit',sans-serif"
                style={act ? { filter: 'drop-shadow(0 0 4px rgba(253,224,71,0.6))' }
                  : tgt ? { filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.4))' }
                  : {}}
              >{num}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default RacingTrack;