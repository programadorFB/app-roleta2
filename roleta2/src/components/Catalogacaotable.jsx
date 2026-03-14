import React, { useState, useMemo } from 'react';
import { Search, Download, Plus, Trash2, Edit2, Filter } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css';

// Configurações da roleta
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

const SECTORS = {
  zero: [0, 32, 15, 19, 4, 21, 2, 25],
  opos: [1, 20, 14, 31, 9, 17, 34, 6],
  esquer: [5, 24, 16, 33, 1, 20, 14, 31, 9],
  direi: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33]
};

const CatalogacaoTable = ({ spinHistory }) => {
  const [searchNumber, setSearchNumber] = useState('');
  const [filterColor, setFilterColor] = useState('all');
  const [filterSector, setFilterSector] = useState('all');

  // Processar dados
  const catalogData = useMemo(() => {
    if (!spinHistory || spinHistory.length === 0) return [];

    return spinHistory.map((spin, index) => {
      const num = spin.num || spin.number;
      return {
        position: index + 1,
        num,
        cor: getColor(num),
        ab: getAltoBaixo(num),
        ip: getImparPar(num),
        col: getColuna(num),
        duz: getDuzia(num),
        setor: getSetor(num)
      };
    });
  }, [spinHistory]);

  // Aplicar filtros
  const filteredData = useMemo(() => {
    let filtered = catalogData;

    // Filtro por número
    if (searchNumber) {
      filtered = filtered.filter(item => 
        item.num.toString().includes(searchNumber)
      );
    }

    // Filtro por cor
    if (filterColor !== 'all') {
      filtered = filtered.filter(item => item.cor === filterColor);
    }

    // Filtro por setor
    if (filterSector !== 'all') {
      filtered = filtered.filter(item => item.setor === filterSector);
    }

    return filtered;
  }, [catalogData, searchNumber, filterColor, filterSector]);

  // Exportar CSV
  const exportCSV = () => {
    const headers = ['#', 'NUM', 'COR', 'A/B', 'I/P', 'COL', 'DÚZ', 'SETOR'];
    const rows = filteredData.map(item => [
      item.position,
      item.num,
      item.cor,
      item.ab,
      item.ip,
      item.col,
      item.duz,
      item.setor
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `catalogacao-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Limpar filtros
  const clearFilters = () => {
    setSearchNumber('');
    setFilterColor('all');
    setFilterSector('all');
  };

  if (!spinHistory || spinHistory.length === 0) {
    return (
      <div className={styles['empty-state']}>
        <p>Nenhum dado disponível para catalogação.</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#9ca3af' }}>
          Aguardando chegada de números...
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 className={styles['dashboard-title']}>
        Catalogação Completa ({filteredData.length} números)
      </h3>

      {/* Barra de Ferramentas */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '0.75rem',
        border: '1px solid #374151'
      }}>
        {/* Busca por número */}
        <div style={{ flex: '1', minWidth: '200px', position: 'relative' }}>
          <Search 
            size={18} 
            style={{ 
              position: 'absolute', 
              left: '0.75rem', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: '#9ca3af'
            }} 
          />
          <input
            type="text"
            placeholder="Buscar número..."
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.5rem',
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              color: '#d1d5db',
              fontSize: '0.875rem'
            }}
          />
        </div>

        {/* Filtro por cor */}
        <select
          value={filterColor}
          onChange={(e) => setFilterColor(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
            color: '#d1d5db',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          <option value="all">Todas as Cores</option>
          <option value="Vermelho">Vermelho</option>
          <option value="Preto">Preto</option>
          <option value="Verde">Verde</option>
        </select>

        {/* Filtro por setor */}
        <select
          value={filterSector}
          onChange={(e) => setFilterSector(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
            color: '#d1d5db',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          <option value="all">Todos os Setores</option>
          <option value="Zero">Zero</option>
          <option value="Opos">Opos</option>
          <option value="Esquer">Esquer</option>
          <option value="Direi">Direi</option>
        </select>

        {/* Botões de ação */}
        <button
          onClick={clearFilters}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem',
            color: '#ef4444',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 'bold'
          }}
        >
          <Filter size={16} />
          Limpar
        </button>

        <button
          onClick={exportCSV}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '0.5rem',
            color: '#10b981',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 'bold'
          }}
        >
          <Download size={16} />
          Exportar
        </button>
      </div>

      {/* Tabela de Catalogação */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '0.75rem',
        // padding: '1rem',
        width: '350px',
        overflowX: 'auto'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: '0 0.25rem'
        }}>
          <thead>
            <tr style={{ 
              background: 'rgba(0, 0, 0, 0.3)',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: '#9ca3af',
              fontWeight: 'bold'
            }}>
              <th style={headerStyle}>#</th>
              <th style={headerStyle}>NUM</th>
              <th style={headerStyle}>COR</th>
              <th style={headerStyle}>A/B</th>
              <th style={headerStyle}>I/P</th>
              <th style={headerStyle}>COL</th>
              <th style={headerStyle}>DÚZ</th>
              <th style={headerStyle}>SETOR</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => (
              <TableRow key={index} data={item} />
            ))}
          </tbody>
        </table>

        {filteredData.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.875rem'
          }}>
            Nenhum resultado encontrado com os filtros aplicados.
          </div>
        )}
      </div>

      {/* Resumo de Filtros */}
      {(searchNumber || filterColor !== 'all' || filterSector !== 'all') && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          color: '#fde047'
        }}>
          <strong>Filtros ativos:</strong>
          {' '}
          {searchNumber && `Número contém "${searchNumber}" `}
          {filterColor !== 'all' && `• Cor: ${filterColor} `}
          {filterSector !== 'all' && `• Setor: ${filterSector}`}
        </div>
      )}
    </div>
  );
};

// Componente de linha da tabela
const TableRow = ({ data }) => {
  return (
    <tr style={{
      background: 'rgba(255, 255, 255, 0.03)',
      transition: 'all 0.2s'
    }}>
      {/* Posição */}
      <td style={cellStyle}>
        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
          {data.position}
        </span>
      </td>

      {/* Número com cor */}
      <td style={cellStyle}>
        <div style={{
          ...numberChipStyle,
          background: getNumberBackground(data.cor)
        }}>
          {data.num}
        </div>
      </td>

      {/* Cor */}
      <td style={cellStyle}>
        <span style={{ 
          color: data.cor === 'Vermelho' ? '#ef4444' : 
                 data.cor === 'Preto' ? '#d1d5db' : '#10b981',
          fontWeight: 'bold',
          fontSize: '0.875rem'
        }}>
          {data.cor}
        </span>
      </td>

      {/* Alto/Baixo */}
      <td style={cellStyle}>
        <span style={badgeStyle}>
          {data.ab}
        </span>
      </td>

      {/* Ímpar/Par */}
      <td style={cellStyle}>
        <span style={badgeStyle}>
          {data.ip}
        </span>
      </td>

      {/* Coluna */}
      <td style={cellStyle}>
        <span style={{
          ...badgeStyle,
          background: getColunaColor(data.col),
          color: '#000',
          fontWeight: 'bold'
        }}>
          {data.col}
        </span>
      </td>

      {/* Dúzia */}
      <td style={cellStyle}>
        <span style={{
          ...badgeStyle,
          background: getDuziaColor(data.duz),
          color: '#fff',
          fontWeight: 'bold'
        }}>
          {data.duz}
        </span>
      </td>

      {/* Setor */}
      <td style={cellStyle}>
        <span style={{
          ...badgeStyle,
          background: getSetorColor(data.setor),
          color: data.setor === 'Zero' || data.setor === 'Esquer' ? '#000' : '#fff',
          fontWeight: 'bold'
        }}>
          {data.setor}
        </span>
      </td>
    </tr>
  );
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

const getColor = (num) => {
  if (num === 0) return 'Verde';
  return RED_NUMBERS.includes(num) ? 'Vermelho' : 'Preto';
};

const getAltoBaixo = (num) => {
  if (num === 0) return 'Zero';
  return num <= 18 ? 'Baixo' : 'Alto';
};

const getImparPar = (num) => {
  if (num === 0) return 'Zero';
  return num % 2 === 0 ? 'Par' : 'Ímpar';
};

const getColuna = (num) => {
  if (num === 0) return 'Zero';
  if (num % 3 === 1) return 'C1';
  if (num % 3 === 2) return 'C2';
  return 'C3';
};

const getDuzia = (num) => {
  if (num === 0) return 'Zero';
  if (num <= 12) return 'D1';
  if (num <= 24) return 'D2';
  return 'D3';
};

const getSetor = (num) => {
  if (SECTORS.zero.includes(num)) return 'Zero';
  if (SECTORS.opos.includes(num)) return 'Opos';
  if (SECTORS.esquer.includes(num)) return 'Esquer';
  if (SECTORS.direi.includes(num)) return 'Direi';
  return 'Outros';
};

const getNumberBackground = (cor) => {
  if (cor === 'Vermelho') return 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
  if (cor === 'Preto') return 'linear-gradient(135deg, #1f2937 0%, #000000 100%)';
  return 'linear-gradient(135deg, #15803d 0%, #14532d 100%)';
};

const getColunaColor = (col) => {
  if (col === 'C1') return '#fde047'; // Amarelo
  if (col === 'C2') return '#fbbf24'; // Amarelo escuro
  if (col === 'C3') return '#f59e0b'; // Laranja
  return '#6b7280'; // Cinza
};

const getDuziaColor = (duz) => {
  if (duz === 'D1') return '#ef4444'; // Vermelho
  if (duz === 'D2') return '#3b82f6'; // Azul
  if (duz === 'D3') return '#8b5cf6'; // Roxo
  return '#6b7280'; // Cinza
};

const getSetorColor = (setor) => {
  if (setor === 'Zero') return '#10b981'; // Verde
  if (setor === 'Opos') return '#f59e0b'; // Laranja
  if (setor === 'Esquer') return '#84cc16'; // Verde limão
  if (setor === 'Direi') return '#3b82f6'; // Azul
  return '#6b7280'; // Cinza
};

// ============================================
// ESTILOS
// ============================================

const headerStyle = {
  padding: '0.75rem 0.25rem',
  textAlign: 'center',
  borderBottom: '2px solid #374151',
  position: 'sticky',
  top: 0,
  background: '#1f2937', 
  zIndex: 1
};

const cellStyle = {
  padding: '0.75rem 0.25rem',
  textAlign: 'center',
  fontSize: '0.875rem',
  color: '#d1d5db'
};

const numberChipStyle = {
  display: 'inline-block',
  width: '36px',
  height: '36px',
  lineHeight: '36px',
  borderRadius: '0.5rem',
  color: 'white',
  fontWeight: 'bold',
  fontSize: '0.875rem',
  textAlign: 'center',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
  border: 'none'
};

const badgeStyle = {
  display: 'inline-block',
  padding: '0.3rem 0.6rem',
  borderRadius: '0.5rem',
  background: 'rgba(255, 255, 255, 0.1)',
  fontSize: '0.75rem',
  fontWeight: '600',
  border: 'none'
};

export default CatalogacaoTable;