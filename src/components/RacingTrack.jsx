import React, { useState, useEffect } from 'react';
import './RacingTrack.css';

const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

const NumberBox = ({ num, onClick, isActive, isEntrySignal }) => (
  <div
    className={`racetrack-flat-number ${getNumberColor(num)} ${isActive ? 'active' : ''} ${isEntrySignal ? 'entry-signal-glow' : ''}`}
    onClick={() => onClick(num)}
    title={`Número ${num}`}
  >
    {num}
  </div>
);

const RacingTrack = ({ selectedResult, onNumberClick, entrySignals = [] }) => {
  const [activeNumber, setActiveNumber] = useState(null);
  // 'isFlipped' agora significa "mostrar Layout 2 (Francês)"
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    if (selectedResult) {
      setActiveNumber(selectedResult.number);
      const timer = setTimeout(() => setActiveNumber(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedResult]);

  const handleFlip = () => {
    setIsFlipped(prev => !prev);
  };

  const isActive = (num) => activeNumber === num;
  const isEntry = (num) => entrySignals.includes(num);

  // === DEFINIÇÃO DOS DOIS LAYOUTS ===

  // LAYOUT 1 (Padrão, da imagem original image_d0ed00.png)
  const layout1_leftCol = [5, 10, 23];
  const layout1_topRow = [24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35]; // 15 números
  const layout1_rightCol = [3, 26, 0];
  const layout1_bottomRow = [8, 30, 11, 36, 13, 27, 6, 34, 17, 25, 2, 21, 4, 19, 15, 32]; // 16 números

  // LAYOUT 2 (Layout Francês, da nova imagem image_d0ffcd.png)
  const layout2_leftCol = [32, 0, 26];
  const layout2_topRow = [15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30]; // 14 números
  const layout2_rightCol = [23, 10, 5];
  const layout2_bottomRow = [3, 35, 12, 28, 7, 29, 18, 22, 9, 31, 14, 20, 1, 33, 16, 24]; // 16 números

  // === LÓGICA DE RENDERIZAÇÃO ===
  // Escolhe qual layout usar com base no estado 'isFlipped'
  const leftCol = isFlipped ? layout2_leftCol : layout1_leftCol;
  const topRow = isFlipped ? layout2_topRow : layout1_topRow;
  const rightCol = isFlipped ? layout2_rightCol : layout1_rightCol;
  const bottomRow = isFlipped ? layout2_bottomRow : layout1_bottomRow;

  return (
    <div className="racetrack-flat-container">
      <div className="racetrack-flat-inner">

        {/* Coluna da Esquerda (Dinâmica) */}
        <div className="racetrack-flat-col left">
          {leftCol.map(num => (
             <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
          ))}
        </div>

        <div className="racetrack-flat-col center">
          <div className="racetrack-flat-row">
            {/* Linha de Cima (Dinâmica) */}
            {topRow.map(num => (
              <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
            ))}
          </div>

          {/* Botão para alternar a visualização */}
          <div className="racetrack-divider-bar">
            <button className="racetrack-flip-button" onClick={handleFlip} title="Mudar Visualização">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-9L21 12m0 0l-4.5 4.5M21 12H7.5" />
              </svg>
            </button>
          </div>
            
          <div className="racetrack-flat-row">
            {/* Linha de Baixo (Dinâmica) */}
            {bottomRow.map(num => (
              <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
            ))}
          </div>
        </div>

        {/* Coluna da Direita (Dinâmica) */}
        <div className="racetrack-flat-col right">
          {rightCol.map(num => (
            <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
          ))}
        </div>

      </div>
    </div>
  );
};

export default RacingTrack;