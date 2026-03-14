// components/NumberStatsPopup.jsx

import React from 'react';
import { X, Hash, Percent, Clock } from 'lucide-react';
import { getNumberColor } from '../utils/roulette';

const NumberStatsPopup = React.memo(({ isOpen, onClose, number, stats }) => {
  if (!isOpen || !stats) return null;
  
  const color = getNumberColor(number);

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="popup-close-btn">
          <X size={24} />
        </button>
        
        <div className="popup-header">
          <div className={`popup-number-icon ${color}`}>{number}</div>
          <h2 className="popup-title">
            Análise do Número {number} (em {stats.historyFilter} spins)
          </h2>
        </div>
        
        <div className="popup-stats-grid">
          <div className="info-card">
            <p className="info-label"><Hash size={18} /> Ocorrências:</p>
            <p className="info-value">{stats.count} / {stats.historyFilter}</p>
          </div>
          <div className="info-card">
            <p className="info-label"><Percent size={18} /> Frequência:</p>
            <p className="info-value">{stats.frequency}%</p>
          </div>
          <div className="info-card">
            <p className="info-label"><Clock size={18} /> Última Vez:</p>
            <p className="info-value">
              {stats.lastHitAgo !== null ? `${stats.lastHitAgo} spins atrás` : 'Nunca'}
            </p>
          </div>
          <div className="info-card">
            <p className="info-label">Cor:</p>
            <p className={`info-value ${color}`}>{color.toUpperCase()}</p>
          </div>
        </div>
        
        <h3 className="next-spins-title">
          Últimas 5 Ocorrências (e 5 spins ANTERIORES)
        </h3>
        
        <div className="next-spins-container">
          {stats.nextOccurrences.length > 0 ? (
            stats.nextOccurrences.map((occ, index) => (
              <div key={index} className="next-spins-card">
                <p className="next-spins-label">
                  Ocorrência #{stats.count - index} ({occ.spinsAgo} spins atrás)
                </p>
                <div className="next-numbers-list">
                  {occ.prevSpins.length > 0 ? (
                    occ.prevSpins.map((num, i) => (
                      <span key={i} className={`next-number ${getNumberColor(num)}`}>
                        {num}
                      </span>
                    ))
                  ) : (
                    <span className="no-data">Início do histórico</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="next-spins-none">
              O número {number} ainda não foi sorteado.
            </p>
          )}
        </div>
        
        <button onClick={onClose} className="popup-footer-btn">
          Fechar
        </button>
      </div>
    </div>
  );
});

NumberStatsPopup.displayName = 'NumberStatsPopup';

export default NumberStatsPopup;