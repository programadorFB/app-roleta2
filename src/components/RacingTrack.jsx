import React, { useState, useEffect } from 'react';
import './RacingTrack.css'; // Use o CSS "Dark Mode" abaixo

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

  useEffect(() => {
    if (selectedResult) {
      setActiveNumber(selectedResult.number);
      const timer = setTimeout(() => setActiveNumber(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedResult]);

  const isActive = (num) => activeNumber === num;
  const isEntry = (num) => entrySignals.includes(num);

  // === ARRAYS CORRIGIDOS PARA BATER COM A IMAGEM ===
  // (5 e 10 saíram daqui)
  const topRow = [24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35];
  // (8 foi adicionado aqui)
  const bottomRow = [8, 30, 11, 36, 13, 27, 6, 34, 17, 25, 2, 21, 4, 19, 15, 32];
  
  return (
    <div className="racetrack-flat-container">
      <div className="racetrack-flat-inner">

        {/* === COLUNA DA ESQUERDA CORRIGIDA === */}
        <div className="racetrack-flat-col left">
          <NumberBox num={5} onClick={onNumberClick} isActive={isActive(5)} isEntrySignal={isEntry(5)} />
          <NumberBox num={10} onClick={onNumberClick} isActive={isActive(10)} isEntrySignal={isEntry(10)} />
          <NumberBox num={23} onClick={onNumberClick} isActive={isActive(23)} isEntrySignal={isEntry(23)} />
        </div>

        <div className="racetrack-flat-col center">
          <div className="racetrack-flat-row">
            {topRow.map(num => (
              <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
            ))}
          </div>
            <div style={{height:"50px", backgroundColor:"#20311f"}}></div>
          {/* (Miolo removido como solicitado) */}
            
          <div className="racetrack-flat-row">
            {bottomRow.map(num => (
              <NumberBox key={num} num={num} onClick={onNumberClick} isActive={isActive(num)} isEntrySignal={isEntry(num)} />
            ))}
          </div>
        </div>

        {/* === COLUNA DA DIREITA (JÁ ESTAVA CORRETA) === */}
        <div className="racetrack-flat-col right">
          <NumberBox num={3} onClick={onNumberClick} isActive={isActive(3)} isEntrySignal={isEntry(3)} />
          <NumberBox num={26} onClick={onNumberClick} isActive={isActive(26)} isEntrySignal={isEntry(26)} />
          <NumberBox num={0} onClick={onNumberClick} isActive={isActive(0)} isEntrySignal={isEntry(0)} />
        </div>

      </div>
    </div>
  );
};

export default RacingTrack;