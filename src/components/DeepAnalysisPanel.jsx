import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
    Flame, Snowflake, Layers, AlignCenter, TrendingUp, BarChart3, Target, PieChart, Activity, Cpu, Info, Lock // <-- 1. ÍCONE DE CADEADO IMPORTADO
} from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css';
import { useNotifications } from '../contexts/NotificationContext'; // Importe o hook de notificações
import { checkConvergenceAlert, checkPatternBrokenAlert } from '../services/alertLogic'; // Importe a lógica de alerta

// Importe todos os seus componentes de aba
import SectorsAnalysis from './SectorAnalysis';
import NeighborAnalysis from './NeighborAnalysis';
import TerminalAnalysis from './TerminalAnalysis';
import AdvancedPatternsAnalysis from './AdvancedPatternsAnalysis';
import FrequencyTable from './FrequencyTable'; // <-- 1. IMPORTADO AQUI

import { UpdateCountdown } from './VisualIndicators';

// Importe as lógicas de análise para os alertas
// (Você precisará centralizar isso ou importar as funções individuais)
import { analyzeCroupierPattern } from '../services/CroupieDetection.jsx';
// Supondo que você crie serviços de lógica centralizados:
// import { analyzeTerminals } from '../services/terminalAnalysis';
// import { analyzeFiboNasa } from '../services/fiboNasaAnalysis';
// import { analyzeHidden } from '../services/advancedAnalysis';


// --- Constantes e Funções Utilitárias ---
const rouletteNumbers = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

const getDozen = (num) => {
    if (num >= 1 && num <= 12) return '1ª Dúzia';
    if (num >= 13 && num <= 24) return '2ª Dúzia';
    if (num >= 25 && num <= 36) return '3ª Dúzia';
    return null;
};

const getColumn = (num) => {
    if (num === 0) return null;
    if (num % 3 === 1) return 'Coluna 1';
    if (num % 3 === 2) return 'Coluna 2';
    if (num % 3 === 0) return 'Coluna 3';
    return null;
};

// --- Componente Principal com Abas ---
const DeepAnalysisPanel = ({ spinHistory }) => {
    const [activeTab, setActiveTab] = useState('statistics');
    const { addNotification } = useNotifications(); // Hook de notificações
    const prevAnalysesRef = useRef(); // Ref para alertas

    const analysis = useMemo(() => {
        const totalSpins = spinHistory.length;
        if (totalSpins === 0) {
            return {
                hotNumbers: [], 
                sleepers: [],
                dozenCounts: {}, 
                columnCounts: {}, 
                highLowCounts: {}, 
                evenOddCounts: {},
                streaks: { red: { longest: 0, current: 0 }, black: { longest: 0, current: 0 } },
                totalSpins: 0,
            };
        }

        const counts = rouletteNumbers.reduce((acc, num) => ({ ...acc, [num]: 0 }), {});
        const dozenCounts = { '1ª Dúzia': 0, '2ª Dúzia': 0, '3ª Dúzia': 0 };
        const columnCounts = { 'Coluna 1': 0, 'Coluna 2': 0, 'Coluna 3': 0 };
        const highLowCounts = { 'Baixo (1-18)': 0, 'Alto (19-36)': 0 };
        const evenOddCounts = { 'Par': 0, 'Ímpar': 0 };
        
        let longestRedStreak = 0, currentRedStreak = 0;
        let longestBlackStreak = 0, currentBlackStreak = 0;
        
        [...spinHistory].reverse().forEach(spin => {
            if (spin.color === 'red') {
                currentRedStreak++;
                currentBlackStreak = 0;
                if (currentRedStreak > longestRedStreak) longestRedStreak = currentRedStreak;
            } else if (spin.color === 'black') {
                currentBlackStreak++;
                currentRedStreak = 0;
                if (currentBlackStreak > longestBlackStreak) longestBlackStreak = currentBlackStreak;
            } else {
                currentRedStreak = 0;
                currentBlackStreak = 0;
            }
        });
        
        let currentRed = 0, currentBlack = 0;
        for (const spin of spinHistory) {
            if (spin.color === 'red') {
                if (currentBlack > 0) break;
                currentRed++;
            } else if (spin.color === 'black') {
                if (currentRed > 0) break;
                currentBlack++;
            } else break;
        }

        spinHistory.forEach(spin => {
            counts[spin.number]++;
            const dozen = getDozen(spin.number);
            const column = getColumn(spin.number);
            if (dozen) dozenCounts[dozen]++;
            if (column) columnCounts[column]++;
            if (spin.number > 0) {
                if (spin.number <= 18) highLowCounts['Baixo (1-18)']++;
                else highLowCounts['Alto (19-36)']++;
                if (spin.number % 2 === 0) evenOddCounts['Par']++;
                else evenOddCounts['Ímpar']++;
            }
        });

        const sortedNumbers = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const hotNumbers = sortedNumbers.slice(0, 5);
        
        const lastSeenIndex = rouletteNumbers.reduce((acc, num) => {
            acc[num] = spinHistory.findIndex(s => s.number === num);
            return acc;
        }, {});

const sleepers = Object.entries(lastSeenIndex)
            .sort(([,a], [,b]) => {
                // Trata -1 (nunca saiu) como o valor mais "antigo" (totalSpins)
                const aValue = (a === -1) ? totalSpins : a;
                const bValue = (b === -1) ? totalSpins : b;
                
                // Ordena de forma descendente (maior "ago" primeiro)
                return bValue - aValue;
            })
            .map(([num, index]) => ({ num, ago: index === -1 ? totalSpins : index }))
            .slice(0, 5);
        return {
            hotNumbers, 
            sleepers, 
            totalSpins,
            dozenCounts, 
            columnCounts, 
            highLowCounts, 
            evenOddCounts,
            streaks: {
                red: { longest: longestRedStreak, current: currentRed },
                black: { longest: longestBlackStreak, current: currentBlack }
            },
        };
    }, [spinHistory]);

    // --- LÓGICA DE GATILHO DE ALERTA ---
    // (Esta é uma versão simplificada; idealmente, você centralizaria
    // todas as lógicas de 'useMemo' de todas as abas aqui)
    useEffect(() => {
        if (spinHistory.length < 30) return; // Não dispare alertas sem dados suficientes

        // Simulação de coleta de dados de análise
        const allAnalyses = {
            croupierAnalysis: analyzeCroupierPattern(spinHistory, 30),
            // Adicione outras análises reais aqui
            // terminalAnalysis: ..., 
            // fiboNasaAnalysis: ...,
            // hiddenAnalysis: ...,
        };

        // 1. Verificar Sinal Verde
        const convergenceAlert = checkConvergenceAlert(allAnalyses);
        if (convergenceAlert) {
            // Evitar spam: idealmente, você guardaria o ID do alerta e não o enviaria novamente
            addNotification(convergenceAlert);
        }

        // 2. Verificar Padrão Quebrado
        const brokenPatternAlert = checkPatternBrokenAlert(allAnalyses, prevAnalysesRef.current);
        if (brokenPatternAlert) {
            addNotification(brokenPatternAlert);
        }

        // 3. Salvar análise atual para a próxima comparação
        prevAnalysesRef.current = allAnalyses;

    }, [spinHistory, addNotification]);
    // ------------------------------------

    // --- Componentes Auxiliares ---

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
    
    const NumberChip = ({ number }) => {
        const color = getNumberColor(number);
        return (
            <span 
                className={`${styles['history-number']} ${styles[color]}`}
                style={{ cursor: 'default' }}
            >
                {number}
            </span>
        );
    };

    const ProgressBar = ({ value, max, colorClass }) => {
        const percentage = max > 0 ? (value / max * 100).toFixed(1) : 0;
        return (
            <div className={styles['progress-bar-container']}>
                <div 
                    className={`${styles['progress-bar-fill']} ${styles[colorClass]}`} 
                    style={{ width: `${percentage}%` }}
                >
                    {percentage}%
                </div>
            </div>
        );
    };

    // --- Renderização Principal ---

    if (analysis.totalSpins === 0) {
        return (
            <div className={styles['strategies-info-panel']}>
                <h3 className={styles['dashboard-title']}>Análise Estatística</h3>
                <div className={styles['strategy-card']}>
                    <p className={`${styles['card-concept']} ${styles['empty-state']}`} 
                       style={{textAlign: 'center'}}>
                        Aguardando histórico de sinais para iniciar a análise...
                    </p>
                </div>
            </div>
        );
    }

    // --- 2. ESTILO UNIFICADO PARA BOTÕES BLOQUEADOS ---
    const lockedButtonStyle = {
        flex: 1,
        minWidth: '100px',
        padding: '0.75rem 0.5rem',
        background: 'rgba(255, 255, 255, 0.05)', // Cor inativa
        color: '#6b7280', // Cor desabilitada
        border: 'none',
        borderRadius: '0.5rem',
        cursor: 'not-allowed',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s',
        opacity: 0.6 // Opacidade desabilitada
    };


    return (
        <div className={styles['strategies-info-panel']}>
            {/* Sistema de Abas (Sempre Visível) */}
<div style={{
                display: 'flex',
                flexWrap: 'wrap', // Permite quebra de linha em telas menores
                gap: '0.5rem',
                marginBottom: '1rem',
                borderBottom: '2px solid #374151',
                paddingBottom: '0.5rem'
            }}>
                
                {/* --- BOTÃO GERAL (PERMANECE ATIVO) --- */}
                <button
                    onClick={() => setActiveTab('statistics')}
                    style={{
                        flex: 1,
                        minWidth: '100px', // Largura mínima para botões
                        padding: '0.75rem 0.5rem',
                        background: activeTab === 'statistics' ? 'linear-gradient(135deg, #ca8a04, #eab308)' : 'rgba(255, 255, 255, 0.05)',
                        color: activeTab === 'statistics' ? '#111827' : '#d1d5db',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                        boxShadow: activeTab === 'statistics' ? '0 2px 8px rgba(202, 138, 4, 0.4)' : 'none'
                    }}
                >
                    <TrendingUp size={18} />
                    Geral
                </button>
                
                {/* --- BOTÕES BLOQUEADOS COM EMOJI DE CADEADO --- */}
                <button
                    disabled={true}
                    title="Em breve"
                    style={lockedButtonStyle}
                >
                    <Lock size={16} /> {/* Ícone da Lucide */}
                    Frequência 🔒 
                </button>

                <button
                    disabled={true}
                    title="Em breve"
                    style={lockedButtonStyle}
                >
                    <Lock size={16} /> {/* Ícone da Lucide */}
                    Vizinhança 🔒
                </button>
                
                <button
                    disabled={true}
                    title="Em breve"
                    style={lockedButtonStyle}
                >
                    <Lock size={16} /> {/* Ícone da Lucide */}
                    Cavalos 🔒
                </button>
       
                <button
                    disabled={true}
                    title="Em breve"
                    style={lockedButtonStyle}
                >
                    <Lock size={16} /> {/* Ícone da Lucide */}
                    Avançado 🔒
                </button>

                <button
                    disabled={true}
                    title="Em breve"
                    style={lockedButtonStyle}
                >
                    <Lock size={16} /> {/* Ícone da Lucide */}
                    Setores Secos 🔒
                </button>
                
            </div>

            {/* Conteúdo da Aba */}
            {/* O conteúdo das outras abas (frequency, neighbors, etc.)
                nunca será exibido, já 'activeTab' nunca será setado para eles.
                Apenas 'statistics' funcionará. */}

            {activeTab === 'statistics' && (
                <>
                    <h3 className={styles['dashboard-title']}>
                        Análise Estatística ({analysis.totalSpins} Sinais)
                    </h3>

                    <StatCard 
                        title="Números Quentes" 
                        icon={<Flame size={24} className={styles['dangerIcon']} />}
                    >
                        {analysis.hotNumbers.map(([num, count]) => (
                            <div className={styles['stat-row']} key={num}>
                                <span className={styles['stat-label']}>
                                    Número <NumberChip number={parseInt(num)} />
                                </span>
                                <span className={styles['stat-value']}>
                                    {count} vezes ({(count/analysis.totalSpins * 100).toFixed(1)}%)
                                </span>
                            </div>
                        ))}
                    </StatCard>
                    
                    <StatCard 
                        title="Congelados (Mais Tempo Sem Sair)" 
                        icon={<Snowflake size={24} style={{color: '#38bdf8'}} />}
                    >
                        {analysis.sleepers.map(({ num, ago }) => (
                            <div className={styles['stat-row']} key={num}>
                                <span className={styles['stat-label']}>
                                    Número <NumberChip number={parseInt(num)} />
                                </span>
                                <span className={styles['stat-value']}>
                                    {ago} rodadas atrás
                                </span>
                            </div>
                        ))}
                    </StatCard>

                    <StatCard 
                        title="Sequências de Cores" 
                        icon={<TrendingUp size={24} className={styles['warningIcon']} />}
                    >
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Sequência Atual:</span>
                            <span className={`${styles['stat-value']} ${
                                analysis.streaks.red.current > 0 ? styles['red'] : styles['black']
                            }`}>
                                {analysis.streaks.red.current > 0 
                                    ? `${analysis.streaks.red.current} Vermelhos` 
                                    : `${analysis.streaks.black.current} Pretos`
                                }
                            </span>
                        </div>
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Maior Seq. Vermelha:</span>
                            <span className={styles['stat-value']}>
                                {analysis.streaks.red.longest}
                            </span>
                        </div>
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Maior Seq. Preta:</span>
                            <span className={styles['stat-value']}>
                                {analysis.streaks.black.longest}
                            </span>
                        </div>
                    </StatCard>

                    <StatCard 
                        title="Dúzias & Colunas" 
                        icon={<Layers size={24} className={styles['infoIcon']} />}
                    >
                        {Object.entries(analysis.dozenCounts).map(([name, count]) => (
                            <div key={name}>
                                <div className={styles['stat-row']} style={{marginBottom: '0.25rem'}}>
                                    <span className={styles['stat-label']}>{name}</span>
                                    <span className={styles['stat-value']}>{count} vezes</span>
                                </div>
                                <ProgressBar value={count} max={analysis.totalSpins} colorClass="gold" />
                            </div>
                        ))}
                    </StatCard>

                    <StatCard 
                        title="Distribuição Geral" 
                        icon={<AlignCenter size={24} style={{color: '#a78bfa'}} />}
                    >
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>
                                Baixos (1-18) vs Altos (19-36)
                            </span>
                            <span className={styles['stat-value']}>
                                {analysis.highLowCounts['Baixo (1-18)']} / {analysis.highLowCounts['Alto (19-36)']}
                            </span>
                        </div>
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Pares vs Ímpares</span>
                            <span className={styles['stat-value']}>
                                {analysis.evenOddCounts['Par']} / {analysis.evenOddCounts['Ímpar']}
                            </span>
                        </div>
                    </StatCard>
                </>
            )}
            
            {/* O conteúdo abaixo nunca será renderizado, pois o activeTab
                está "preso" em 'statistics' */}
                
            {activeTab === 'frequency' && (
                <FrequencyTable spinHistory={spinHistory} />
            )}

            {activeTab === 'neighbors' && (
                <NeighborAnalysis spinHistory={spinHistory} />
            )}

            {activeTab === 'terminals' && (
                <TerminalAnalysis spinHistory={spinHistory} />
            )}
            
            {activeTab === 'advanced' && (
                <AdvancedPatternsAnalysis spinHistory={spinHistory} />
            )}

            {activeTab === 'sectors' && (
                <SectorsAnalysis spinHistory={spinHistory} />
            )}
            
            {activeTab === 'visual' && (
                <>
                    <h3 className={styles['dashboard-title']}>
                        Indicadores Visuais
                    </h3>
                    <StatCard title="Contador de Atualização" icon={<Activity size={24} className={styles.infoIcon} />}>
                        {/* 5000ms = 5 segundos (deve bater com seu 'fetchHistory' do App.jsx) */}
                        <UpdateCountdown countdownKey={spinHistory.length} duration={5000} />
                    </StatCard>
                   
                </>
            )}
        </div>
    );
};

export default DeepAnalysisPanel;