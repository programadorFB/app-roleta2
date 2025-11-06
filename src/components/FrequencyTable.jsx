import React, { useMemo, useState } from 'react';
import { BarChart3, Clock } from 'lucide-react';

// vezes da roleta na ordem do layout físico
const rouletteNumbers = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// Função para determinar a cor do número
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// Opções de filtro de tempo (em minutos)
// const TIME_FILTERS = [
//   { value: 30, label: '30 min' },
//   { value: 60, label: '1 hora' },
//   { value: 120, label: '2 horas' },
//   { value: 360, label: '6 horas' },
//   { value: 720, label: '12 horas' },
//   { value: 1440, label: '24 horas' },
//   { value: 0, label: 'Tudo' }
// ];

// --- FUNÇÃO CORRIGIDA ---
const getSpinTime = (spin) => {
  // Usa especificamente o campo 'date'
  const dateValue = spin.date;

  if (dateValue) {
    // new Date() consegue processar tanto strings ISO
    // quanto vezes de timestamp.
    return new Date(dateValue);
  }

  // Se o campo date não existe ou é inválido
  return null;
};

// -------------------------


const FrequencyTable = ({ spinHistory = [] }) => {
  const [timeFilter, setTimeFilter] = useState(0);

  // Filtrar histórico por tempo
  const filteredHistory = useMemo(() => {
    if (timeFilter === 0 || !spinHistory.length) return spinHistory;

    const now = new Date();
    const filterTimeMs = timeFilter * 60 * 1000;

    return spinHistory.filter(spin => {
      // Usa a função helper corrigida
      const spinTime = getSpinTime(spin);
      
      // Se não houver data válida, remove
      if (!spinTime) {
        return false;
      }
      
      const timeDiff = now - spinTime; // Diferença em milissegundos
      
      // O spin deve estar no passado (timeDiff >= 0)
      // E dentro da janela de tempo (timeDiff <= filterTimeMs)
      return timeDiff >= 0 && timeDiff <= filterTimeMs;
    });
  }, [spinHistory, timeFilter]);

  // Calcular dados de frequência
  const frequencyData = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) {
      return { numbers: [], totalSpins: 0, hottestNumber: null, coldestNumber: null };
    }

    const totalSpins = filteredHistory.length;
    const numberCounts = {};
    
    rouletteNumbers.forEach(num => {
      numberCounts[num] = 0;
    });

    // O campo 'signal' contém o número que saiu
    filteredHistory.forEach(spin => {
      const number = parseInt(spin.signal, 10);
      if (!isNaN(number) && numberCounts[number] !== undefined) {
        numberCounts[number]++;
      }
    });

    const numbersData = rouletteNumbers.map(num => {
      const vezes = numberCounts[num];
      const frequency = totalSpins > 0 ? (vezes / totalSpins) * 100 : 0;
      return {
        number: num,
        color: getNumberColor(num),
        vezes,
        frequency: frequency.toFixed(2),
        percentage: frequency
      };
    });

    numbersData.sort((a, b) => b.vezes - a.vezes);

    const hottestNumber = numbersData[0];
    const coldestNumber = numbersData[numbersData.length - 1];

    return {
      numbers: numbersData,
      totalSpins,
      hottestNumber,
      coldestNumber,
      avgHits: (totalSpins / rouletteNumbers.length).toFixed(1)
    };
  }, [filteredHistory]);

  const maxHits = frequencyData.numbers.length > 0 
    ? Math.max(...frequencyData.numbers.map(n => n.vezes), 1) 
    : 1;

  // Calcular o período filtrado
  const timeRangeInfo = useMemo(() => {
    if (timeFilter === 0 || filteredHistory.length === 0) return null;
    
    let oldestDate = null;
    let newestDate = null;

    filteredHistory.forEach(spin => {
      const spinTime = getSpinTime(spin);
      if (spinTime) {
        if (!oldestDate || spinTime < oldestDate) {
          oldestDate = spinTime;
        }
        if (!newestDate || spinTime > newestDate) {
          newestDate = spinTime;
        }
      }
    });

    if (!oldestDate || !newestDate) return null;
    
    const formatDate = (date) => {
      return date.toLocaleString('pt-BR', { 
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    };
    
    return {
      start: formatDate(oldestDate),
      end: formatDate(newestDate),
      count: filteredHistory.length
    };
  }, [filteredHistory, timeFilter]);

  // Estado vazio
  if (spinHistory.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
        borderRadius: '1rem',
        
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
        
        textAlign: 'center',
        color: '#9ca3af'
      }}>
        <BarChart3 size={48} style={{  color: '#fde047' }} />
        <h3 style={{ color: '#fde047', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Tabela de Frequência
        </h3>
        <p>Aguardando dados dos sinais...</p>
      </div>
    );
  }

  return (
    <div style={{
      // background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
      borderRadius: '1rem',

      // boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',

      maxHeight: 'calc(100vh - 4rem)',
      overflowY: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid #374151'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <BarChart3 size={28} style={{ color: '#fde047' }} />
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#fde047',
            margin: 0
          }}>
            Tabela de Frequência
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={20} style={{ color: '#9ca3af' }} />
          {/* <select 
            value={timeFilter}
            onChange={(e) => setTimeFilter(Number(e.target.value))}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#374151',
              color: 'white',
              border: '1px solid #4b5563',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#4b5563'}
            onMouseLeave={(e) => e.target.style.background = '#374151'}
          > */}
            {/* {TIME_FILTERS.map(filter => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))} */}
          {/* </select> */}
        </div>
      </div>

      {/* Badge de Período */}
      {timeRangeInfo && (
        <div style={{
          padding: '0.5rem 1rem',
          background: 'rgba(234, 179, 8, 0.1)',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          fontSize: '0.75rem',
          color: '#fbbf24',
          textAlign: 'center'
        }}>
          📅 Período: {timeRangeInfo.start} - {timeRangeInfo.end} ({timeRangeInfo.count} sinais)
        </div>
      )}

      {/* Resumo Estatístico */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '0.75rem',
        padding: '1rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Total de Spins
          </p>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fde047' }}>
            {frequencyData.totalSpins}
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Mais Quente
          </p>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444' }}>
            {frequencyData.hottestNumber?.number} ({frequencyData.hottestNumber?.vezes}x)
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Mais Frio
          </p>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#60a5fa' }}>
            {frequencyData.coldestNumber?.number} ({frequencyData.coldestNumber?.vezes}x)
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        borderRadius: '0.75rem',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead style={{
            background: 'rgba(0, 0, 0, 0.4)',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <tr>
              {['Rank', 'Nº', 'vezes', '%', 'Distribuição'].map(header => (
                <th key={header} style={{
                  padding: '0.75rem 0.5rem',
                  textAlign: 'center',
                  color: '#fbbf24',
                  fontWeight: 'bold',
                  borderBottom: '2px solid #4b5563'
                }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frequencyData.numbers.map((item, index) => {
              const barWidth = (item.vezes / maxHits) * 100;
              const isHot = item.vezes > frequencyData.avgHits * 1.2;
              const isCold = item.vezes < frequencyData.avgHits * 0.8;
              
              return (
                <tr 
                  key={item.number}
                  style={{
                    borderBottom: '1px solid #374151',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{
                    padding: '0.5rem',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontWeight: 'bold'
                  }}>
                    #{index + 1}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        color: 'white',
                        fontSize: '0.85rem',
                        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.5)',
                        background: item.color === 'red' 
                          ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' 
                          : item.color === 'black' 
                          ? 'linear-gradient(135deg, #1f2937 0%, #000000 100%)' 
                          : 'linear-gradient(135deg, #15803d 0%, #14532d 100%)'
                      }}>
                        {item.number}
                      </div>
                    </div>
                  </td>
                  <td style={{
                    padding: '0.5rem',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '0.85rem'
                  }}>
                    {item.vezes}
                  </td>
                  <td style={{
                    padding: '0.5rem',
                    textAlign: 'center',
                    color: '#fde047',
                    fontWeight: 'bold',
                    fontSize: '0.9rem'
                  }}>
                    {item.frequency}%
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{
                      width: '100%',
                      height: '16px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${barWidth}%`,
                        borderRadius: '8px',
                        transition: 'width 0.3s ease',
                        background: isHot 
                          ? 'linear-gradient(90deg, #dc2626, #ef4444)' 
                          : isCold 
                          ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' 
                          : 'linear-gradient(90deg, #eab308, #fde047)',
                        boxShadow: isHot 
                          ? '0 0 8px rgba(239, 68, 68, 0.5)' 
                          : isCold 
                          ? '0 0 8px rgba(96, 165, 250, 0.5)' 
                          : '0 0 8px rgba(253, 224, 71, 0.3)'
                      }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div style={{
        marginTop: '1rem',

        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '0.5rem',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: '#9ca3af',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          🔥 <strong style={{ color: '#ef4444' }}>Quente</strong>: Acima de {(frequencyData.avgHits * 1.2).toFixed(1)} vezes | 
          ❄️ <strong style={{ color: '#60a5fa' }}> Frio</strong>: Abaixo de {(frequencyData.avgHits * 0.8).toFixed(1)} vezes
        </p>
      </div>
    </div>
  );
};

export default FrequencyTable;