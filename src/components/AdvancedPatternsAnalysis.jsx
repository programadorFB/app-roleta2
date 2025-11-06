// components/AdvancedPatternsAnalysis.jsx

import React, { useMemo } from 'react';
import { Target, TrendingUp, AlertOctagon, Cpu, Zap, Activity, Repeat } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css'; // Reutilizamos o mesmo CSS

// --- Constantes de Análise ---

// REQ 1: Níveis de Ocultos
export const HIDDEN_LEVELS = [
  { level: 6, min: 100, label: 'Nível 6 (CRÍTICO)', color: '#ef4444' },
  { level: 5, min: 80, label: 'Nível 5', color: '#f59e0b' },
  { level: 4, min: 60, label: 'Nível 4', color: '#eab308' },
  { level: 3, min: 40, label: 'Nível 3', color: '#a3e635' },
  { level: 2, min: 25, label: 'Nível 2', color: '#38bdf8' },
  { level: 1, min: 15, label: 'Nível 1', color: '#818cf8' },
];

// REQ 2: Mapeamento de "Cavalos" (Apostas Divididas)
// Mapeia cada número para seus vizinhos no *layout da mesa*
const HORSE_MAP = {
  0: [1, 2, 3], 1: [2, 4], 2: [1, 3, 5], 3: [2, 6], 4: [1, 5, 7], 5: [2, 4, 6, 8],
  6: [3, 5, 9], 7: [4, 8, 10], 8: [5, 7, 9, 11], 9: [6, 8, 12], 10: [7, 11, 13], 11: [8, 10, 12, 14],
  12: [9, 11, 15], 13: [10, 14, 16], 14: [11, 13, 15, 17], 15: [12, 14, 18], 16: [13, 17, 19], 17: [14, 16, 18, 20],
  18: [15, 17, 21], 19: [16, 20, 22], 20: [17, 19, 21, 23], 21: [18, 20, 24], 22: [19, 23, 25], 23: [20, 22, 24, 26],
  24: [21, 23, 27], 25: [22, 26, 28], 26: [23, 25, 27, 29], 27: [24, 26, 30], 28: [25, 29, 31], 29: [26, 28, 30, 32],
  30: [27, 29, 33], 31: [28, 32, 34], 32: [29, 31, 33, 35], 33: [30, 32, 36], 34: [31, 35], 35: [32, 34, 36], 36: [33, 35]
};

// Gera a lista de todos os 114 pares únicos de cavalos
const ALL_HORSES_PAIRS = (() => {
  const pairs = new Set();
  for (let num = 0; num <= 36; num++) {
    if (HORSE_MAP[num]) {
      HORSE_MAP[num].forEach(neighbor => {
        const pairKey = [num, neighbor].sort((a, b) => a - b).join('-');
        pairs.add(pairKey);
      });
    }
  }
  return Array.from(pairs).map(key => key.split('-').map(Number));
})(); // Total: 114 cavalos

// --- Funções Auxiliares (REQ 2 & 3) ---
const getDozen = (num) => {
  if (num === 0) return 0; // 'Zero'
  if (num >= 1 && num <= 12) return 1; // 1ª Dúzia
  if (num >= 13 && num <= 24) return 2; // 2ª Dúzia
  if (num >= 25 && num <= 36) return 3; // 3ª Dúzia
};

const getHiddenLevel = (absence) => {
  for (const level of HIDDEN_LEVELS) {
    if (absence >= level.min) {
      return level;
    }
  }
  return { level: 0, label: 'Nível 0', color: '#6b7280' };
};

// --- Componentes Auxiliares de UI ---
const StatCard = ({ title, icon, children }) => (
    <div className={styles['strategy-card']}>
        <div className={styles['strategy-header']}>
            {icon}
            <h4 className={styles['card-title']}>{title}</h4>
        </div>
        <div className={styles['analysis-content']}>
            {children}
        </div>
    </div>
);

const NumberChip = ({ number, isHighlighted }) => {
  const color = number % 2 === 0 ? 'red' : 'black'; // Apenas para exemplo, não é a cor real
  return (
    <span style={{
      padding: '0.2rem 0.6rem',
      borderRadius: '4px',
      fontWeight: 'bold',
      fontSize: '0.9rem',
      background: color === 'red' ? '#dc2626' : '#1f2937',
      color: 'white',
      border: isHighlighted ? '2px solid #fde047' : '2px solid transparent',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)'
    }}>
      {number}
    </span>
  );
};


// --- Componente Principal ---
const AdvancedPatternsAnalysis = ({ spinHistory }) => {

  const analysis = useMemo(() => {
    const totalSpins = spinHistory.length;
    // Análises avançadas exigem um histórico maior
    if (totalSpins < 50) {
      return { totalSpins, top10Ocultos: [], top5HotHorses: [], mostFrequentSequence: null };
    }

    const recentSpins = spinHistory.slice(0, 50);

    // --- 1. Lógica de OCULTOS (REQ 1) ---
    const ocultosAnalysis = [];
    const expectedFreq = totalSpins / 37;

    for (let num = 0; num <= 36; num++) {
      const lastAppearance = spinHistory.findIndex(s => s.number === num);
      const absence = lastAppearance === -1 ? totalSpins : lastAppearance;
      
      // REQ 1: "score de oculto"
      const score = (absence / expectedFreq) * 100;
      const level = getHiddenLevel(absence);

      ocultosAnalysis.push({ number: num, absence, level, score });
    }
    const top10Ocultos = ocultosAnalysis.sort((a, b) => b.absence - a.absence).slice(0, 10);


    // --- 2. Lógica de CAVALOS (REQ 2) ---
    const horseAnalysis = [];
    
    // REQ 2: Algoritmo "findHotHorses" (versão otimizada)
    // Encontra os cavalos que *mais saíram* (hits) nos últimos 50 spins
    ALL_HORSES_PAIRS.forEach(pair => {
      const [num1, num2] = pair;
      let hits = 0;
      recentSpins.forEach(spin => {
        if (spin.number === num1 || spin.number === num2) {
          hits++;
        }
      });

      const score = (hits / 50) * 100; // % de hits nos últimos 50
      if (hits > 0) {
        horseAnalysis.push({ pair: `${num1}-${num2}`, hits, score });
      }
    });
    const top5HotHorses = horseAnalysis.sort((a, b) => b.score - a.score).slice(0, 5);


    // --- 3. Lógica de SEQUÊNCIA DE REGIÕES (REQ 3) ---
    const patternLength = 3;
    const dozenHistory = spinHistory.map(s => getDozen(s.number)).reverse(); // reverse() para ordem cronológica
    const patternCounts = {};
    let mostFrequentSequence = null;

    // REQ 3: Algoritmo "detectRegionPattern" (versão O(n))
    for (let i = 0; i <= dozenHistory.length - patternLength; i++) {
      const pattern = dozenHistory.slice(i, i + patternLength).join(' → ');
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    }

    let maxOccurrences = 1; // Só nos interessam padrões que se repetem
    for (const [pattern, occurrences] of Object.entries(patternCounts)) {
      if (occurrences > maxOccurrences) {
        maxOccurrences = occurrences;
        const lastSeenIndex = dozenHistory.join(',').lastIndexOf(pattern.split(' → ').join(','));
        const spinsAgo = dozenHistory.length - lastSeenIndex - patternLength;

        mostFrequentSequence = {
          pattern: pattern, // Ex: "1 → 3 → 2"
          occurrences,
          spinsAgo: spinsAgo,
        };
      }
    }

    return { totalSpins, top10Ocultos, top5HotHorses, mostFrequentSequence };

  }, [spinHistory]);


  // --- Renderização ---
  if (analysis.totalSpins < 50) {
    return (
      <div className={styles['strategy-card']}>
        <p className={`${styles['card-concept']} ${styles['empty-state']}`} style={{ textAlign: 'center' }}>
          Aguardando {50 - analysis.totalSpins} spins para iniciar Análises Avançadas...
        </p>
      </div>
    );
  }

  return (
    <>
      <h3 className={styles['dashboard-title']}>
        Análise Avançada de Padrões
      </h3>

      {/* --- Card 1: Ocultos (REQ 1 & 3) --- */}
      <StatCard title="Números Ausentes (Top 10)" icon={<AlertOctagon size={24} className={styles.dangerIcon} />}>
        <table className={styles.analysisTable}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Ausência</th>
              <th>Nível</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {analysis.top10Ocultos.map(item => (
              <tr key={item.number}>
                <td><NumberChip number={item.number} /></td>
                <td>{item.absence} spins</td>
                <td style={{ color: item.level.color, fontWeight: 'bold' }}>
                  {item.level.label}
                </td>
                <td>{item.score.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </StatCard>

      {/* --- Card 3: Sequências (REQ 3) --- */}
      {/* <StatCard title="Sequência de Dúzias (Padrão de 3)" icon={<Repeat size={24} className={styles.warningIcon} />}>
        {analysis.mostFrequentSequence ? (
          <>
            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>Padrão Dominante:</span>
              <span className={styles['stat-value']} style={{fontSize: '1.2rem'}}>
                {analysis.mostFrequentSequence.pattern}
              </span>
            </div>
            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>Ocorrências:</span>
              <span className={styles['stat-value']}>
                {analysis.mostFrequentSequence.occurrences} vezes
              </span>
            </div>
            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>Última Vez:</span>
              <span className={styles['stat-value']}>
                {analysis.mostFrequentSequence.spinsAgo} spins atrás
              </span>
            </div>
          </>
        ) : (
          <p className={styles['card-concept']} style={{ textAlign: 'center' }}>
            Nenhuma sequência de 3 dúzias se repetiu ainda.
          </p>
        )}
      </StatCard> */}
    </>
  );
};

export default AdvancedPatternsAnalysis;