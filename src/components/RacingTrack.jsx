import React, { useState, useEffect } from 'react';
import './RacingTrack.css'; // O CSS já tem o .entry-signal-glow

// ... (getNumberColor permanece igual) ...
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};


// 1. MODIFIQUE O NumberBox para aceitar 'isEntrySignal'
const NumberBox = ({ num, onClick, isActive, isEntrySignal }) => (
  <div
    className={`racetrack-flat-number ${getNumberColor(num)} ${isActive ? 'active' : ''} ${isEntrySignal ? 'entry-signal-glow' : ''}`}
    onClick={() => onClick(num)}
    title={`Número ${num}`}
  >
    {num}
  </div>
);

// 2. RECEBA 'entrySignals' como prop (com um valor padrão de [])
const RacingTrack = ({ selectedResult, onNumberClick, entrySignals = [] }) => {
  const [activeNumber, setActiveNumber] = useState(null);

  // ... (useEffect de selectedResult permanece igual) ...
  useEffect(() => {
    if (selectedResult) {
      setActiveNumber(selectedResult.number);
      const timer = setTimeout(() => setActiveNumber(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedResult]);

  const isActive = (num) => activeNumber === num;

  // 3. ADICIONE esta função
  const isEntry = (num) => entrySignals.includes(num);

  // ... (Arrays topRow e bottomRow permanecem iguais) ...
  const topRow = [10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35];
  const bottomRow = [30, 11, 36, 13, 27, 6, 34, 17, 25, 2, 21, 4, 19, 15, 32];
  
  return (
    <div className="racetrack-flat-container">
      <div className="racetrack-flat-inner">

        {/* 4. ATUALIZE TODAS AS CHAMADAS do NumberBox */}
        <div className="racetrack-flat-col left">
          <NumberBox num={23} onClick={onNumberClick} isActive={isActive(23)} isEntrySignal={isEntry(23)} />
          <NumberBox num={8} onClick={onNumberClick} isActive={isActive(8)} isEntrySignal={isEntry(8)} />
        </div>

        <div className="racetrack-flat-col center">
          <div className="racetrack-flat-row">
            {topRow.map(num => (
              <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
            ))}
          </div>

          {/* Centro Verde (permanece igual) */}
          <div className="racetrack-flat-middle-green">
            <span className="sector-label-text"></span>
            <span className="sector-label-text"></span>
            <span className="sector-label-text"></span>
            <div className="sector-label-box zero-label"></div>
          </div>

          <div className="racetrack-flat-row">
            {bottomRow.map(num => (
              <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
            ))}
          </div>
        </div>

        <div className="racetrack-flat-col right">
          <NumberBox num={3} onClick={onNumberClick} isActive={isActive(3)} isEntrySignal={isEntry(3)} />
          <NumberBox num={26} onClick={onNumberClick} isActive={isActive(26)} isEntrySignal={isEntry(26)} />
          <NumberBox num={0} onClick={onNumberClick} isActive={isActive(0)} isEntrySignal={isEntry(0)} />
        </div>

      </div>
       {/* Label "Neighbours" (não está no seu código, mas estava no meu anterior) */}
       {/* <div className="neighbours-label-flat">Neighbours</div> */}
    </div>
  );
};

export default RacingTrack;