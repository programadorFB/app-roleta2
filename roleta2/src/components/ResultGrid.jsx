import React, { useState, useCallback, useMemo, memo } from 'react';
import './ResultGrid.css';

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

// ✅ Lógica Centralizada de Estilos
const getSpecialClass = (number, mode, color, isDuplicate, isTerminalMatch, sequenceType) => {
  const terminal = number % 10;

  // 1. Cavalos
  if (mode === 'cavalos') {
    if ([2, 5, 8].includes(terminal)) return 'bg-cavalo-blue';
    if ([1, 4, 7].includes(terminal)) return 'bg-cavalo-green';
    if ([0, 3, 6, 9].includes(terminal)) return 'bg-cavalo-red';
  }

  // 2. Coliseu (0 e 5)
  if (mode === 'coliseu') {
    if (terminal === 0) return 'bg-coliseu-blue';
    if (terminal === 5) return 'bg-coliseu-green';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-coliseu-dimmed ${textColorClass}`;
  }

  // 3. Coliseu 6-2
  if (mode === 'coliseu62') {
    if (terminal === 6) return 'bg-coliseu62-blue';
    if (terminal === 2) return 'bg-coliseu62-green';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-coliseu62-dimmed ${textColorClass}`;
  }

  // 4. Gêmeos
  if (mode === 'gemeos') {
    const dezena = Math.floor(number / 10);
    const unidade = number % 10;
    
    if (dezena === unidade && number > 0) return 'bg-gemeos';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-gemeos-dimmed ${textColorClass}`;
  }

  // 5. Espelho
  if (mode === 'espelho') {
    const espelhoNumbers = [12, 21, 13, 31, 32, 23];
    if (espelhoNumbers.includes(number)) return 'bg-espelho';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-espelho-dimmed ${textColorClass}`;
  }

  // 6. Duplicados (Repetidos)
  if (mode === 'dublicados') {
    if (isDuplicate) return 'bg-dublicados';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-dublicados-dimmed ${textColorClass}`;
  }

  // 7. Terminais Iguais (Cores Individuais)
  if (mode === 'terminais') {
    if (isTerminalMatch) {
      return `bg-terminal-${terminal}`; // Retorna bg-terminal-0 até bg-terminal-9
    }
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-terminais-dimmed ${textColorClass}`;
  }

  // 8. Quina (Grupos Específicos)
  if (mode === 'quina') {
    const group1 = [10, 5, 24]; // Azul
    const group2 = [23, 8, 30]; // Verde
    const group3 = [15, 32, 0]; // Amarelo
    const group4 = [26, 3, 35]; // Roxo

    if (group1.includes(number)) return 'bg-quina-1';
    if (group2.includes(number)) return 'bg-quina-2';
    if (group3.includes(number)) return 'bg-quina-3';
    if (group4.includes(number)) return 'bg-quina-4';

    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-quina-dimmed ${textColorClass}`;
  }

  // 9. Sequência (Crescente/Decrescente)
  if (mode === 'sequencia') {
    if (sequenceType === 'mixed') return 'bg-seq-mixed';
    if (sequenceType === 'asc') return 'bg-seq-asc';
    if (sequenceType === 'desc') return 'bg-seq-desc';

    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-seq-dimmed ${textColorClass}`;
  }

  // 10. Gêmeos + Espelho
  if (mode === 'gemeos-espelho') {
    const dezena = Math.floor(number / 10);
    const unidade = number % 10;
    
    if (dezena === unidade && number > 0) return 'bg-combo-gemeos';
    
    const espelhoNumbers = [12, 21, 13, 31, 32, 23];
    if (espelhoNumbers.includes(number)) return 'bg-combo-espelho';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-combo-dimmed ${textColorClass}`;
  }

  // 11. Filtros de Setores da Roleta Europeia
  if (mode === 'setores') {
    const tiers = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33];
    const orphelins = [1, 20, 14, 31, 9, 6, 34, 17];
    const voisins = [19, 4, 21, 2, 25, 22, 18, 29, 7, 28];
    const zero = [12, 35, 3, 26, 0, 32, 15];

    if (tiers.includes(number)) return 'bg-tiers';
    if (orphelins.includes(number)) return 'bg-orphelins';
    if (voisins.includes(number)) return 'bg-voisins';
    if (zero.includes(number)) return 'bg-zero';
    
    const textColorClass = color === 'red' ? 'text-red' : 'text-white';
    return `bg-setores-dimmed ${textColorClass}`;
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
  latestNumbers = [], 
  numberPullStats, 
  numberPreviousStats,
  onResultClick,
  isPremium = false, 
  setIsPaywallOpen
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

  const handleFilterChange = (e) => {
    setFilterMode(e.target.value);
  };

  const activeTooltip = useMemo(() => {
    if (hoveredNumber === null) return '';
    return formatPullTooltip(hoveredNumber, numberPullStats, numberPreviousStats);
  }, [hoveredNumber, numberPullStats, numberPreviousStats]);

  const gridClassName = useMemo(() => 
    `results-grid ${hoveredNumber !== null ? 'hover-active' : ''}`,
    [hoveredNumber]
  );

  // Contagem de resultados por setor do cilindro
  const sectorCounts = useMemo(() => {
    const tiers = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33];
    const orphelins = [1, 20, 14, 31, 9, 6, 34, 17];
    const voisins = [19, 4, 21, 2, 25, 22, 18, 29, 7, 28];
    const zero = [12, 35, 3, 26, 0, 32, 15];

    return latestNumbers.reduce((acc, result) => {
      const num = result.number;
      if (tiers.includes(num)) acc.tiers++;
      else if (orphelins.includes(num)) acc.orphelins++;
      else if (voisins.includes(num)) acc.voisins++;
      else if (zero.includes(num)) acc.zero++;
      return acc;
    }, { tiers: 0, orphelins: 0, voisins: 0, zero: 0 });
  }, [latestNumbers]);

  const renderOptionLabel = (label, isLocked) => {
    return isLocked && !isPremium ? ` ${label}` : label;
  };

  return (
    <div className="results-container">
      <div className="controls-header">
        
        {/* --- ÁREA DAS LEGENDAS DINÂMICAS --- */}
        <div className="legend-area">
          
          {filterMode === 'cavalos' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-cavalo-blue"></span><span>2, 5, 8</span></div>
              <div className="legend-item"><span className="legend-dot bg-cavalo-green"></span><span>1, 4, 7</span></div>
              <div className="legend-item"><span className="legend-dot bg-cavalo-red"></span><span>0, 3, 6, 9</span></div>
            </div>
          )}

          {filterMode === 'coliseu' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-coliseu-blue"></span><span>Terminal 0</span></div>
              <div className="legend-item"><span className="legend-dot bg-coliseu-green"></span><span>Terminal 5</span></div>
            </div>
          )}

          {filterMode === 'coliseu62' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-coliseu62-blue"></span><span>Terminal 6</span></div>
              <div className="legend-item"><span className="legend-dot bg-coliseu62-green"></span><span>Terminal 2</span></div>
            </div>
          )}

          {filterMode === 'gemeos' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-gemeos"></span><span>Gêmeos</span></div>
            </div>
          )}

          {filterMode === 'espelho' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-espelho"></span><span>Espelho</span></div>
            </div>
          )}

          {filterMode === 'dublicados' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-dublicados"></span><span>Repetidos</span></div>
            </div>
          )}

          {/* Legenda Terminais (0 a 9) */}
          {filterMode === 'terminais' && (
            <div className="legend-group" style={{maxWidth: '100%', flexWrap: 'wrap', gap: '8px'}}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => (
                <div key={t} className="legend-item" style={{marginRight: '0'}}>
                  <span className={`legend-dot bg-terminal-${t}`}></span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}

          {/* Legenda Quina */}
          {filterMode === 'quina' && (
            <div className="legend-group" style={{flexWrap: 'wrap'}}>
              <div className="legend-item"><span className="legend-dot bg-quina-1"></span><span>10, 5, 24</span></div>
              <div className="legend-item"><span className="legend-dot bg-quina-2"></span><span>23, 8, 30</span></div>
              <div className="legend-item"><span className="legend-dot bg-quina-3"></span><span>15, 32, 0</span></div>
              <div className="legend-item"><span className="legend-dot bg-quina-4"></span><span>26, 3, 35</span></div>
            </div>
          )}

          {/* Legenda Sequência */}
          {filterMode === 'sequencia' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-seq-asc"></span><span>Crescente</span></div>
              <div className="legend-item"><span className="legend-dot bg-seq-desc"></span><span>Decrescente</span></div>
              <div className="legend-item"><span className="legend-dot bg-seq-mixed"></span><span>Inversão</span></div>
            </div>
          )}

          {filterMode === 'gemeos-espelho' && (
            <div className="legend-group">
              <div className="legend-item"><span className="legend-dot bg-combo-gemeos"></span><span>Gêmeos</span></div>
              <div className="legend-item"><span className="legend-dot bg-combo-espelho"></span><span>Espelho</span></div>
            </div>
          )}

          {/* Legenda Setores com Contagem */}
          {filterMode === 'setores' && (
            <div className="legend-group" style={{ flexWrap: 'wrap' }}>
              <div className="legend-item">
                <span className="legend-dot bg-tiers"></span>
                <span>Tiers ({sectorCounts.tiers})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-orphelins"></span>
                <span>Orphelins ({sectorCounts.orphelins})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-voisins"></span>
                <span>Voisins ({sectorCounts.voisins})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot bg-zero"></span>
                <span>Zero ({sectorCounts.zero})</span>
              </div>
            </div>
          )}
        </div>

        {/* --- DROPDOWN DE FILTROS --- */}
        <div className="filter-wrapper">
          <select 
            value={filterMode} 
            onChange={handleFilterChange}
            className="filter-dropdown"
            style={{ borderColor: (!isPremium && filterMode === 'default') ? '#34495e' : '#3498db' }}
          >
            <option value="default">Cores Padrão</option>
            <option value="cavalos">Filtro: Cavalos</option>
            
            <option value="setores">{renderOptionLabel("Filtro: Setores do Cilindro", true)}</option>
            <option value="dublicados">{renderOptionLabel("Filtro: Duplicados", true)}</option>
            <option value="terminais">{renderOptionLabel("Filtro: Terminais Iguais", true)}</option>
            <option value="quina">{renderOptionLabel("Filtro: Quina", true)}</option>
            <option value="sequencia">{renderOptionLabel("Filtro: Sequência (+/- 1)", true)}</option>

            <option value="coliseu">{renderOptionLabel("Filtro: Coliseu (0-5)", true)}</option>
            <option value="coliseu62">{renderOptionLabel("Filtro: Coliseu (6-2)", true)}</option>
            <option value="gemeos-espelho">{renderOptionLabel("Filtro: Gêmeos + Espelho", true)}</option>
          </select>
        </div>
      </div>

      {/* --- GRID DE RESULTADOS --- */}
      <div 
        className={gridClassName}
        onMouseOver={handleMouseEvent}
        onMouseLeave={handleMouseEvent}
        onClick={handleClick}
        title={activeTooltip}
      >
        {latestNumbers.map((result, index) => {
          
          // --- Preparação dos Dados ---
          const olderNeighbor = latestNumbers[index + 1];
          const newerNeighbor = latestNumbers[index - 1];
          const currTerm = result.number % 10;
          
          // 1. Cálculo de Duplicados
          const isDuplicate = (olderNeighbor && result.number === olderNeighbor.number) || 
                              (newerNeighbor && result.number === newerNeighbor.number);

          // 2. Cálculo de Terminais
          const matchTermOlder = olderNeighbor && (olderNeighbor.number % 10 === currTerm);
          const matchTermNewer = newerNeighbor && (newerNeighbor.number % 10 === currTerm);
          const isTerminalMatch = matchTermOlder || matchTermNewer;

          // 3. Cálculo de Sequência (Crescente/Decrescente)
          let isAscending = false;
          let isDescending = false;

          const checkAsc = (t1, t2) => (t2 === t1 + 1) || (t1 === 9 && t2 === 0);
          const checkDesc = (t1, t2) => (t2 === t1 - 1) || (t1 === 0 && t2 === 9);

          // Verifica relação com vizinho MAIS VELHO (Anterior)
          if (olderNeighbor) {
            const oldTerm = olderNeighbor.number % 10;
            if (checkAsc(oldTerm, currTerm)) isAscending = true; // Subiu
            if (checkDesc(oldTerm, currTerm)) isDescending = true; // Desceu
          }

          // Verifica relação com vizinho MAIS NOVO (Posterior)
          if (newerNeighbor) {
            const newTerm = newerNeighbor.number % 10;
            if (checkAsc(currTerm, newTerm)) isAscending = true; // Parte de subida
            if (checkDesc(currTerm, newTerm)) isDescending = true; // Parte de descida
          }

          let sequenceType = null;
          if (isAscending && isDescending) sequenceType = 'mixed';
          else if (isAscending) sequenceType = 'asc';
          else if (isDescending) sequenceType = 'desc';

          // --- Chamada da Função de Estilo ---
          const specialClass = getSpecialClass(
            result.number, 
            filterMode, 
            result.color, 
            isDuplicate, 
            isTerminalMatch,
            sequenceType
          );

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