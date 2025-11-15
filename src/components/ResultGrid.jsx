// components/ResultsGrid.jsx
// ✅ Componente otimizado com event delegation e hover state isolado
import React, { useState, useCallback, useMemo, memo } from 'react';

// Função auxiliar para formatar tooltip
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

// Componente individual memoizado
const ResultBox = memo(({ number, color, index, isHighlighted }) => (
  <div 
    data-number={number}
    data-index={index}
    className={`result-number-box ${color} ${isHighlighted ? 'highlighted' : ''}`}
  >
    {number}
  </div>
));

ResultBox.displayName = 'ResultBox';

// Componente principal com event delegation
const ResultsGrid = memo(({ 
  latestNumbers, 
  numberPullStats, 
  numberPreviousStats,
  onResultClick 
}) => {
  // ✅ Estado de hover ISOLADO - não causa re-render do App
  const [hoveredNumber, setHoveredNumber] = useState(null);

  // ✅ Event delegation - UMA função para todos os elementos
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

  // ✅ Event delegation para clicks
  const handleClick = useCallback((e) => {
    const target = e.target.closest('[data-number]');
    if (!target) return;

    const index = parseInt(target.dataset.index, 10);
    const result = latestNumbers[index];
    
    if (result && onResultClick) {
      onResultClick(e, result);
    }
  }, [latestNumbers, onResultClick]);

  // ✅ Tooltip calculado apenas quando hover ativo (lazy evaluation)
  const activeTooltip = useMemo(() => {
    if (hoveredNumber === null) return '';
    return formatPullTooltip(hoveredNumber, numberPullStats, numberPreviousStats);
  }, [hoveredNumber, numberPullStats, numberPreviousStats]);

  const gridClassName = useMemo(() => 
    `results-grid ${hoveredNumber !== null ? 'hover-active' : ''}`,
    [hoveredNumber]
  );

  return (
    <div 
      className={gridClassName}
      onMouseOver={handleMouseEvent}
      onMouseLeave={handleMouseEvent}
      onClick={handleClick}
      title={activeTooltip}
    >
      {latestNumbers.map((result, index) => (
        <ResultBox
          key={result.signalId || `${result.number}-${index}`}
          number={result.number}
          color={result.color}
          index={index}
          isHighlighted={hoveredNumber === result.number}
        />
      ))}
    </div>
  );
});

ResultsGrid.displayName = 'ResultsGrid';

export default ResultsGrid;