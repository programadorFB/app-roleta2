import React, { useState, useCallback, useMemo, memo } from 'react';
import './ResultsGrid.css';

// --- Helpers ---
const formatPullTooltip = (number, pullStats, previousStats) => {
  const pullStatsMap = pullStats?.get(number);
  const prevStatsMap = previousStats?.get(number);
  
  let pullString = "(Nenhum)";
  if (pullStatsMap && pullStatsMap.size > 0) {
    const pulledNumbers = [...pullStatsMap.keys()];
    const displayPull = pulledNumbers.slice(0, 5);
    pullString = displayPull.join(', ');
    if (pulledNumbers.length > 5) pullString += ', ...';
  }

  let prevString = "(Nenhum)";
  if (prevStatsMap && prevStatsMap.size > 0) {
    const prevNumbers = [...prevStatsMap.keys()];
    const displayPrev = prevNumbers.slice(0, 5);
    prevString = displayPrev.join(', ');
    if (prevNumbers.length > 5) prevString += ', ...';
  }
  return `Número: ${number}\nPuxou: ${pullString}\nVeio Antes: ${prevString}`;
};

// ✅ Lógica Centralizada de Filtros
const getSpecialClass = (number, mode, color) => {
  const terminal = number % 10;

  // Lógica Cavalos
  if (mode === 'cavalos') {
    if ([2, 5, 8].includes(terminal)) return 'bg-cavalo-blue';
    if ([1, 4, 7].includes(terminal)) return 'bg-cavalo-green';
    if ([0, 3, 6, 9].includes(terminal)) return 'bg-cavalo-red';
  }

  // Lógica Coliseu (0 e 5)
  if (mode === 'coliseu') {
    if (terminal === 0) return 'bg-coliseu-blue';
    if (terminal === 5) return 'bg-coliseu-green';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-coliseu-dimmed ${textColorClass}`;
  }

  // Lógica Coliseu 6-2 (6 e 2)
  if (mode === 'coliseu62') {
    if (terminal === 6) return 'bg-coliseu62-blue';
    if (terminal === 2) return 'bg-coliseu62-green';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-coliseu62-dimmed ${textColorClass}`;
  }

  // ✅ Lógica Gêmeos (11, 22, 33)
  if (mode === 'gemeos') {
    const dezena = Math.floor(number / 10);
    const unidade = number % 10;
    
    // Verifica se é número gêmeo (dezena == unidade)
    if (dezena === unidade && number > 0) {
      return 'bg-gemeos';
    }
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-gemeos-dimmed ${textColorClass}`;
  }

  // ✅ Lógica Espelho (apenas: 12, 21, 13, 31, 32, 23)
  if (mode === 'espelho') {
    const espelhoNumbers = [12, 21, 13, 31, 32, 23];
    
    if (espelhoNumbers.includes(number)) {
      return 'bg-espelho';
    }
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-espelho-dimmed ${textColorClass}`;
  }

  // ✅ Lógica Gêmeos + Espelho (COMBINADO)
  if (mode === 'gemeos-espelho') {
    const dezena = Math.floor(number / 10);
    const unidade = number % 10;
    
    // Verifica se é número gêmeo
    if (dezena === unidade && number > 0) {
      return 'bg-combo-gemeos';
    }
    
    // Verifica se é número espelho (lista específica)
    const espelhoNumbers = [12, 21, 13, 31, 32, 23];
    if (espelhoNumbers.includes(number)) {
      return 'bg-combo-espelho';
    }
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-combo-dimmed ${textColorClass}`;
  }

  return '';
};

// --- Componente ResultBox ---
const ResultBox = memo(({ number, color, index, isHighlighted, customClass }) => (
  <div 
    data-number={number}
    data-index={index}
    className={`result-number-box ${customClass || color} ${isHighlighted ? 'highlighted' : ''}`}
  >
    {number}
  </div>
));

ResultBox.displayName = 'ResultBox';

// --- Componente Principal ---
const ResultsGrid = memo(({ 
  latestNumbers, 
  numberPullStats, 
  numberPreviousStats,
  onResultClick 
}) => {
  const [hoveredNumber, setHoveredNumber] = useState(null);
  const [filterMode, setFilterMode] = useState('default');

  const handleMouseEvent = useCallback((e) => {
    if (e.type === 'mouseleave') {
      setHoveredNumber(null);
      return;
    }
    const target = e.target.closest('[data-number]');
    if (!target) return;
    const number = parseInt(target.dataset.number, 10);
    if (e.type === 'mouseenter' || e.type === 'mouseover') {
      setHoveredNumber(number);
    }
  }, []);

  const handleClick = useCallback((e) => {
    const target = e.target.closest('[data-number]');
    if (!target) return;
    const index = parseInt(target.dataset.index, 10);
    const result = latestNumbers[index];
    if (result && onResultClick) {
      onResultClick(e, result);
    }
  }, [latestNumbers, onResultClick]);

  const activeTooltip = useMemo(() => {
    if (hoveredNumber === null) return '';
    return formatPullTooltip(hoveredNumber, numberPullStats, numberPreviousStats);
  }, [hoveredNumber, numberPullStats, numberPreviousStats]);

  const gridClassName = useMemo(() => 
    `results-grid ${hoveredNumber !== null ? 'hover-active' : ''}`,
    [hoveredNumber]
  );

  return (
    <div className="results-container">
      
      {/* Header de Controles */}
      <div className="controls-header">
        
        {/* Área da Legenda Dinâmica */}
        <div className="legend-area">
          
          {/* Legenda Cavalos */}
          {filterMode === 'cavalos' && (
            <div className="legend-group">
              <div className="legend-item">
                <span className="legend-dot bg-cavalo-blue"></span>
                <span>2, 5, 8</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-cavalo-green"></span>
                <span>1, 4, 7</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-cavalo-red"></span>
                <span>0, 3, 6, 9</span>
              </div>
            </div>
          )}

          {/* Legenda Coliseu (0 e 5) */}
          {filterMode === 'coliseu' && (
            <div className="legend-group">
              <div className="legend-item">
                <span className="legend-dot bg-coliseu-blue"></span>
                <span>Terminal 0</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-coliseu-green"></span>
                <span>Terminal 5</span>
              </div>
            </div>
          )}

          {/* ✅ Legenda Coliseu 6-2 (6 e 2) */}
          {filterMode === 'coliseu62' && (
            <div className="legend-group">
              <div className="legend-item">
                <span className="legend-dot bg-coliseu62-blue"></span>
                <span>Terminal 6</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-coliseu62-green"></span>
                <span>Terminal 2</span>
              </div>
            </div>
          )}

          {/* ✅ Legenda Gêmeos */}
          {filterMode === 'gemeos' && (
            <div className="legend-group">
              <div className="legend-item">
                <span className="legend-dot bg-gemeos"></span>
                <span>Gêmeos (11, 22, 33)</span>
              </div>
            </div>
          )}

          {/* ✅ Legenda Espelho */}
          {filterMode === 'espelho' && (
            <div className="legend-group">
              <div className="legend-item">
                <span className="legend-dot bg-espelho"></span>
                <span>Espelho (12/21, 13/31)</span>
              </div>
            </div>
          )}

          {/* ✅ Legenda Gêmeos + Espelho */}
          {filterMode === 'gemeos-espelho' && (
            <div className="legend-group">
              <div className="legend-item">
                <span className="legend-dot bg-combo-gemeos"></span>
                <span>Gêmeos (11, 22, 33)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-combo-espelho"></span>
                <span>Espelho (12/21, 13/31)</span>
              </div>
            </div>
          )}
        </div>

        {/* Dropdown */}
        <div className="filter-wrapper">
          <select 
            value={filterMode} 
            onChange={(e) => setFilterMode(e.target.value)}
            className="filter-dropdown"
          >
            <option value="default">Cores Padrão</option>
            <option value="cavalos">Filtro: Cavalos</option>
            <option value="coliseu">Filtro: Coliseu (0-5)</option>
            <option value="coliseu62">Filtro: Coliseu (6-2)</option>
            <option value="gemeos">Filtro: Gêmeos</option>
            <option value="espelho">Filtro: Espelho</option>
            <option value="gemeos-espelho">Filtro: Gêmeos + Espelho</option>
          </select>
        </div>
      </div>

      <div 
        className={gridClassName}
        onMouseOver={handleMouseEvent}
        onMouseLeave={handleMouseEvent}
        onClick={handleClick}
        title={activeTooltip}
      >
        {latestNumbers.map((result, index) => {
          const specialClass = getSpecialClass(result.number, filterMode, result.color);

          return (
            <ResultBox
              key={result.signalId || `${result.number}-${index}`}
              number={result.number}
              color={result.color}
              index={index}
              isHighlighted={hoveredNumber === result.number}
              customClass={specialClass}
            />
          );
        })}
      </div>
    </div>
  );
});

ResultsGrid.displayName = 'ResultsGrid';

export default ResultsGrid;