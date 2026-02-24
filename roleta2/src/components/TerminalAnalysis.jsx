// components/TerminalAnalysis.jsx

import React, { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Clock, Repeat, AlertOctagon, Flame } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css'; // Reutilizamos o mesmo CSS

// --- Componentes Auxiliares de UI ---

// Card Padrão (reutilizado do DeepAnalysisPanel)
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


// ==================================================================
// [MODIFICADO] Componente de Barra de Progresso
// A barra agora representa a "Dívida" (Ausência Atual / Média de Intervalo)
// ==================================================================
const AbsenceBar = ({ absence, averageInterval, debtRatio }) => {
    // O 'debtRatio' já é a porcentagem.
    // Limitamos a 150% para não estourar a barra visualmente.
    const percentage = Math.min(debtRatio, 150);

    // Lógica de cor baseada na "Dívida" (debtRatio)
    let status = { color: '#10b981' }; // Verde (FRIO - Longe da média)
    
    if (debtRatio >= 90) { // Atrasado (passou da média)
        status = { color: '#ef4444' }; // Vermelho (QUENTE)
    } else if (debtRatio >= 70) { // Próximo da média
        status = { color: '#f59e0b' }; // Amarelo (NORMAL)
    }

    return (
        <div 
            className={styles['progress-bar-container']} 
            title={`Média de Intervalo: ${averageInterval.toFixed(0)} rodadas`}
            style={{ 
                height: '24px', 
                background: 'rgba(0, 0, 0, 0.3)', 
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)'
            }}
        >
            <div 
                className={styles['progress-bar-fill']} 
                style={{ 
                    width: `${percentage}%`,
                    backgroundColor: status.color, // Cor baseada na Dívida
                    boxShadow: `0 0 10px ${status.color}77`, 
                    minWidth: 'fit-content', 
                    padding: '0 0.75rem',
                    justifyContent: 'flex-start', 
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                }}
            >
                Ausente há {absence} rodadas
            </div>
        </div>
    );
};

// ==================================================================
// [NOVO] Componente de Destaque Visual (Ausência vs Média)
// ==================================================================
const VisualDebtMeter = ({ absence, averageInterval, debtRatio }) => {
    // Define a cor da ausência atual com base na dívida
    let statusColor = '#10b981'; // Verde (Frio)
    if (debtRatio >= 90) { // Quente
        statusColor = '#ef4444';
    } else if (debtRatio >= 70) { // Normal
        statusColor = '#f59e0b';
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.5rem 0 0.75rem 0',
            width: '100%',
        }}>
            {/* Bloco 1: Ausência Atual */}
            <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Ausência</span>
                <span style={{ 
                    fontSize: '1.5rem', // Tamanho grande
                    fontWeight: 'bold', 
                    color: statusColor, // Cor dinâmica
                    display: 'block' 
                }}>
                    {absence}
                </span>
            </div>
            
            {/* Bloco 2: Média de Intervalo */}
            <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase' }}>Média</span>
                <span style={{ 
                    fontSize: '1.5rem', // Tamanho grande
                    fontWeight: 'bold', 
                    color: '#6b7280', // Cor neutra para a "meta"
                    display: 'block' 
                }}>
                    {averageInterval.toFixed(0)}
                </span>
            </div>
        </div>
    );
};


// ==================================================================
// Componente Principal
// ==================================================================
const TerminalAnalysis = ({ spinHistory }) => {

    const analysis = useMemo(() => {
        const totalSpins = spinHistory.length;
        if (totalSpins < 30) {
            return { 
                totalSpins: 0, 
                terminalStats: [], 
                mostDue: null, 
                bestCandidate: null,
                timeline: []
            };
        }

        const terminals = spinHistory.map(spin => spin.number % 10).reverse(); 
        const timeline = terminals.slice(-110).reverse(); 

        let terminalStats = Array.from({ length: 10 }, (_, i) => ({
            terminal: i,
            count: 0,
            absence: totalSpins,
            hitsIndices: [], 
            averageInterval: 0, 
            debtRatio: 0           
        }));

        terminals.forEach((terminal, index) => {
            const stat = terminalStats[terminal]; 
            stat.count++;
            stat.hitsIndices.push(index); 
        });
        
        terminalStats.forEach(stat => {
            if (stat.count === 0) {
                stat.absence = totalSpins;
                stat.averageInterval = 0; 
                stat.debtRatio = 0;
                return;
            }
            
            const lastHitIndex = stat.hitsIndices[stat.hitsIndices.length - 1];
            stat.absence = (totalSpins - 1) - lastHitIndex;

            if (stat.count < 2) {
                stat.averageInterval = 0; 
            } else {
                const intervals = [];
                for (let i = 0; i < stat.hitsIndices.length - 1; i++) {
                    const interval = stat.hitsIndices[i+1] - stat.hitsIndices[i];
                    intervals.push(interval);
                }
                const sum = intervals.reduce((a, b) => a + b, 0);
                // [NOVO] Define a média como 'totalSpins' se for o primeiro intervalo
                stat.averageInterval = sum / intervals.length;
            }
            
            // [MODIFICADO] Se a média for 0 (só saiu 1x), usamos o total de spins como média
            const safeAverage = stat.averageInterval > 0 ? stat.averageInterval : totalSpins;
            stat.debtRatio = (stat.absence / safeAverage) * 100;
            
            // Se a média foi 0, resetamos para exibir corretamente
            if (stat.averageInterval === 0) stat.averageInterval = totalSpins; 
        });

        const sortedByAbsence = [...terminalStats].sort((a, b) => b.absence - a.absence);
        const mostDue = sortedByAbsence[0]; 
        
        let bestCandidate = null;
        const candidates = [...terminalStats]; // Usar todos os stats
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.debtRatio - a.debtRatio);
            bestCandidate = candidates[0];
        } else {
            bestCandidate = mostDue; // Fallback
        }

        return {
            totalSpins,
            terminalStats,
            mostDue,
            bestCandidate,
            timeline
        };

    }, [spinHistory]);

    const TIMELINE_COLUMNS = 22;
    
    const timelineRows = useMemo(() => {
        const rows = [];
        if (analysis.timeline) {
            for (let i = 0; i < analysis.timeline.length; i += TIMELINE_COLUMNS) {
                rows.push(analysis.timeline.slice(i, i + TIMELINE_COLUMNS));
            }
        }
        return rows;
    }, [analysis.timeline]);


    if (analysis.totalSpins === 0) {
        return (
            <div className={styles['strategy-card']}>
                <p className={`${styles['card-concept']} ${styles['empty-state']}`} style={{ textAlign: 'center' }}>
                    Aguardando {30 - (spinHistory?.length || 0)} sinais para análise de intervalos...
                </p>
            </div>
        );
    }

    return (
        
<>
      <h3 className={styles['dashboard-title']}>
        Análise de Cavalos ({analysis.totalSpins} Sinais)
      </h3>

      {/* --- Cards de Métricas Principais --- */}
      <div className={styles['stats-grid']}>
        {/* ================================================================== */}
        {/* [MODIFICADO] Card "Mais Ausente" agora mostra sua média */}
        {/* ================================================================== */}
        <StatCard title="Cavalo Mais Ausente" icon={<AlertOctagon size={24} className={styles.dangerIcon} />}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2.0rem', fontWeight: 'bold', color: '#fde047' }}>
              Cavalo {analysis.mostDue.terminal}
            </span>
            <div style={{ fontSize: '1.2rem', textAlign: 'left' }}>
              {analysis.mostDue.absence} Rodadas
              <div style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
                (Média: {analysis.mostDue.averageInterval.toFixed(0)} r.)
              </div>
            </div>
          </div>
                        {/* [MODIFICADO] Usa o novo componente visual */}
                        <VisualDebtMeter 
                            absence={analysis.bestCandidate.absence}
                            averageInterval={analysis.bestCandidate.averageInterval}
                            debtRatio={analysis.bestCandidate.debtRatio}
                        />
                    </StatCard>
       
            </div>

            {/* --- Status dos Terminais (com Barras) --- */}
            <StatCard title="Status dos Cavalos" icon={<Target size={24} className={styles.infoIcon} />}>

                
                {/* --- Lista de Barras --- */}
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1.25rem' 
                }}>
                    {/* Ordena pela DÍVIDA (mais "devido" no topo) */}
                    {analysis.terminalStats
                        .sort((a, b) => b.debtRatio - a.debtRatio) 
                        .map(stat => (
                            <div key={stat.terminal} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.25rem' // Espaço menor entre os elementos
                            }}>
                                {/* Linha 1: Título */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fde047', minWidth: '70px' }}>
                                        CAVALO {stat.terminal}
                                    </span>
                                    <div style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
                                        {stat.count} acertos
                                    </div>
                                </div>
                                
                                {/* [NOVO] Linha 2: Destaque Visual (Ausência vs Média) */}
                                <VisualDebtMeter 
                                    absence={stat.absence}
                                    averageInterval={stat.averageInterval}
                                    debtRatio={stat.debtRatio}
                                />
                                
                                {/* Linha 3: Barra de Progresso */}
                                <AbsenceBar 
                                    absence={stat.absence}
                                    averageInterval={stat.averageInterval}
                                    debtRatio={stat.debtRatio}
                                />
                            </div>
                        ))}
                </div>
            </StatCard>
            
            {/* --- Timeline (Tabela) --- */}
            <StatCard title="Timeline de Cavalos (Últimos 110)" icon={<Clock size={24} className={styles.infoIcon} />}>
                {/* Wrapper para permitir scroll horizontal da tabela */}
                <div style={{
                  overflowX: 'auto',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '0.5rem',
                    border: '1px solid #374151',
                    padding: '0.25rem'
                }}>
                    <table 
                        className={styles.analysisTable} 
                        style={{ 
                          width: '100%', 
                          borderCollapse: 'collapse', 
                          borderSpacing: 0,
                        }}
                    >
                        <tbody>
                            {timelineRows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {row.map((terminal, cellIndex) => (
                                        <td 
                                            key={cellIndex}
                                            style={{
                                              width: '28px', 
                                              height: '28px',
                                              padding: '0.25rem',
                                              color: '#fde047',
                                              fontWeight: 'bold',
                                              fontSize: '0.9rem',
                                              textAlign: 'center',
                                              background: 'rgba(255, 255, 255, 0.05)',
                                              border: '1px solid #374151',
                                              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
                                            }}
                                        >
                                            {terminal}
                                        </td>
                                    ))}
                                    {/* Preenche células vazias se a última linha for curta */}
                                    {row.length < TIMELINE_COLUMNS && (
                                        Array.from({ length: TIMELINE_COLUMNS - row.length }).map((_, i) => (
                                            <td key={`empty-${i}`} style={{
                                              width: '28px',
                                              height: '28px',
                                              padding: '0.25rem',
                                              background: 'rgba(0, 0, 0, 0.1)',
                                                border: '1px solid #374151',
                                              }}>
                                                &nbsp;
                                            </td>
                                        ))
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </StatCard>
                                              <strong style={{color: '#fde047', fontSize: '0.9rem'}}>Legenda da Dívida:</strong>
                                              <ul style={{margin: '0.5rem 0 0 0', paddingLeft: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                                                  <li>
                                                      <span style={{color: '#ef4444', marginRight: '0.5rem', fontSize: '1.2rem', verticalAlign: 'middle', lineHeight: '1'}}>■</span>
                                                      <strong>NÚMERO (QUENTE):</strong> Dívida ≥ 90% (Atrasado).
                                                  </li>
                                                  <li>
                                                      <span style={{color: '#f59e0b', marginRight: '0.5rem', fontSize: '1.2rem', verticalAlign: 'middle', lineHeight: '1'}}>■</span>
                                                      <strong>NÚMERO (NORMAL):</strong> Dívida 70-90% (Próximo).
                                                  </li>
                                                  <li>
                                                      <span style={{color: '#10b981', marginRight: '0.5rem', fontSize: '1.2rem', verticalAlign: 'middle', lineHeight: '1'}}>■</span>
                                                      <strong>NÚMERO (FRIO):</strong> Dívida &lt; 70% (Longe da média).
                                                  </li>
                                                  <li>
                                                      <span style={{color: '#9ca3af', marginRight: '0.5rem', fontSize: '1.2rem', verticalAlign: 'middle', lineHeight: '1'}}>■</span>
                                                      <strong>BARRA:</strong> (Ausência Atual / Média de Intervalo).
                                                  </li>
                                              </ul>
        </>
    );
};

export default TerminalAnalysis;