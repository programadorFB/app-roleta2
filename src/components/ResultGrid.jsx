import React, { useState, useCallback, useMemo, memo } from 'react';
import './ResultGrid.css';

// --- Helpers (Mantidos inalterados) ---
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

// ✅ Lógica Centralizada de Filtros (Mantida inalterada)
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
    
    if (dezena === unidade && number > 0) {
      return 'bg-combo-gemeos';
    }
    
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
  onResultClick,
  // Novas props para controle de Premium (passar via App.jsx ou Pai)
  isPremium = false, 
  setIsPaywallOpen
}) => {
  const [hoveredNumber, setHoveredNumber] = useState(null);
  const [filterMode, setFilterMode] = useState('default');

  // --- Handler de Mouse ---
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

  // --- Handler de Clique no Grid ---
  const handleClick = useCallback((e) => {
    const target = e.target.closest('[data-number]');
    if (!target) return;
    const index = parseInt(target.dataset.index, 10);
    const result = latestNumbers[index];
    if (result && onResultClick) {
      onResultClick(e, result);
    }
  }, [latestNumbers, onResultClick]);

  // --- Handler de Mudança de Filtro (COM BLOQUEIO) ---
  const handleFilterChange = (e) => {
    const selectedValue = e.target.value;
    
    // Lista de modos permitidos para usuários gratuitos
    const freeModes = ['default', 'cavalos'];

    // Se não for premium e tentar selecionar um modo fora da lista free
    if (!isPremium && !freeModes.includes(selectedValue)) {
      // Aciona o Paywall
      if (setIsPaywallOpen) {
        setIsPaywallOpen(true);
      } else {
        alert("🔒 Conteúdo Premium! Assine para desbloquear.");
      }
      // IMPORTANTE: Não atualizamos o setFilterMode, mantendo a seleção anterior
      return; 
    }

    // Se for permitido, atualiza
    setFilterMode(selectedValue);
  };

  const activeTooltip = useMemo(() => {
    if (hoveredNumber === null) return '';
    return formatPullTooltip(hoveredNumber, numberPullStats, numberPreviousStats);
  }, [hoveredNumber, numberPullStats, numberPreviousStats]);

  const gridClassName = useMemo(() => 
    `results-grid ${hoveredNumber !== null ? 'hover-active' : ''}`,
    [hoveredNumber]
  );

  // Função auxiliar para renderizar texto da opção com cadeado se necessário
  const renderOptionLabel = (label, isLocked) => {
    return isLocked && !isPremium ? `🔒 ${label}` : label;
  };

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

        {/* Dropdown com Lógica de Bloqueio */}
        <div className="filter-wrapper">
          <select 
            value={filterMode} 
            onChange={handleFilterChange}
            className="filter-dropdown"
            style={{
                borderColor: (!isPremium && filterMode === 'default') ? '#34495e' : '#3498db'
            }}
          >
            <option value="default">Cores Padrão</option>
            <option value="cavalos">Filtro: Cavalos</option>
            
            {/* Opções Bloqueadas (Visualmente marcadas) */}
            <option value="coliseu">
                {renderOptionLabel("Filtro: Coliseu (0-5)", true)}
            </option>
            <option value="coliseu62">
                {renderOptionLabel("Filtro: Coliseu (6-2)", true)}
            </option>
            <option value="gemeos">
                {renderOptionLabel("Filtro: Gêmeos", true)}
            </option>
            <option value="espelho">
                {renderOptionLabel("Filtro: Espelho", true)}
            </option>
            <option value="gemeos-espelho">
                {renderOptionLabel("Filtro: Gêmeos + Espelho", true)}
            </option>
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