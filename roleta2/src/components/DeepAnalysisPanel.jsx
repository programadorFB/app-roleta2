// components/DeepAnalysisPanel.jsx

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    Flame, Snowflake, Layers, AlignCenter, TrendingUp, BarChart3,
    Target, PieChart, Cpu,
} from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css';
import { useNotifications } from '../contexts/NotificationContext';
import { checkConvergenceAlert, checkPatternBrokenAlert } from '../analysis/alertLogic';
import { calculateMasterScore } from '../analysis/masterScoring.js';

// Importe todos os seus componentes de aba
import SectorsAnalysis from './SectorAnalysis';
import NeighborAnalysis from './NeighborAnalysis';
import TerminalAnalysis from './TerminalAnalysis';
import AdvancedPatternsAnalysis from './AdvancedPatternsAnalysis';
import FrequencyTable from './FrequencyTable';


// 🔧 FIX #12: getNumberColor centralizado (era inline)
import { getNumberColor } from '../lib/roulette';

// 🔧 FIX #13: PHYSICAL_WHEEL centralizado (era rouletteNumbers inline)
import { PHYSICAL_WHEEL as rouletteNumbers } from '../constants/roulette';


// --- Funções Utilitárias ---
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
    const { addNotification } = useNotifications();
    const prevAnalysesRef = useRef();

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
            .sort(([, a], [, b]) => {
                const aValue = (a === -1) ? totalSpins : a;
                const bValue = (b === -1) ? totalSpins : b;
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

    // Fallback: importa calculateMasterScore para quando motorAnalysis não está disponível
    const masterResult = useMemo(() => {
        if (spinHistory.length < 50) return null;
        return calculateMasterScore(spinHistory);
    }, [spinHistory]);

    // Alertas usando motorAnalysis (backend) ou fallback local
    useEffect(() => {
        if (!masterResult || !masterResult.strategyScores?.length) return;

        // 1. Verificar Sinal Verde (convergência de 3+ estratégias)
        const convergenceAlert = checkConvergenceAlert(masterResult);
        if (convergenceAlert) {
            addNotification(convergenceAlert);
        }

        // 2. Verificar Padrão Quebrado
        const brokenPatternAlert = checkPatternBrokenAlert(masterResult, prevAnalysesRef.current);
        if (brokenPatternAlert) {
            addNotification(brokenPatternAlert);
        }

        // 3. Salvar análise atual para a próxima comparação
        prevAnalysesRef.current = masterResult;

    }, [masterResult, addNotification]);

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
                />
                <span className={styles['progress-bar-text']}>{percentage}%</span>
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
                       style={{ textAlign: 'center' }}>
                        Aguardando histórico de sinais para iniciar a análise...
                    </p>
                </div>
            </div>
        );
    }

    const tabCls = (tabName) =>
        `${styles.tab} ${activeTab === tabName ? styles.tabActive : ''}`;

    return (
        <div className={styles['strategies-info-panel']}>
            {/* Sistema de Abas */}
            <div className={styles.tabBar}>
                <button onClick={() => setActiveTab('statistics')} className={tabCls('statistics')}>
                    <TrendingUp size={14} />
                    <span>Geral</span>
                </button>
                <button onClick={() => setActiveTab('frequency')} className={tabCls('frequency')}>
                    <BarChart3 size={14} />
                    <span>Frequência</span>
                </button>
                <button onClick={() => setActiveTab('neighbors')} className={tabCls('neighbors')}>
                    <PieChart size={14} />
                    <span>Vizinhança</span>
                </button>
                <button onClick={() => setActiveTab('terminals')} className={tabCls('terminals')}>
                    <Target size={14} />
                    <span>Cavalos</span>
                </button>
                <button onClick={() => setActiveTab('advanced')} className={tabCls('advanced')}>
                    <Cpu size={14} />
                    <span>Avançado</span>
                </button>
                <button onClick={() => setActiveTab('sectors')} className={tabCls('sectors')}>
                    <Layers size={14} />
                    <span>Setores</span>
                </button>
            </div>

            {/* Conteúdo da Aba */}

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
                            <div key={num} className={styles['stat-row']}>
                                <span className={styles['stat-label']}>
                                    <NumberChip number={parseInt(num)} /> — {count}x
                                </span>
                                <ProgressBar value={count} max={analysis.totalSpins} colorClass="danger" />
                            </div>
                        ))}
                    </StatCard>

                    <StatCard
                        title="Números Atrasados"
                        icon={<Snowflake size={24} className={styles['infoIcon']} />}
                    >
                        {analysis.sleepers.map(({ num, ago }) => (
                            <div key={num} className={styles['stat-row']}>
                                <span className={styles['stat-label']}>
                                    <NumberChip number={parseInt(num)} /> — {ago} spins atrás
                                </span>
                            </div>
                        ))}
                    </StatCard>

                    <StatCard
                        title="Sequências"
                        icon={<TrendingUp size={24} style={{ color: '#f59e0b' }} />}
                    >
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Seq. Atual Vermelha:</span>
                            <span className={styles['stat-value']}>{analysis.streaks.red.current}</span>
                        </div>
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Seq. Atual Preta:</span>
                            <span className={styles['stat-value']}>{analysis.streaks.black.current}</span>
                        </div>
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Maior Seq. Vermelha:</span>
                            <span className={styles['stat-value']}>{analysis.streaks.red.longest}</span>
                        </div>
                        <div className={styles['stat-row']}>
                            <span className={styles['stat-label']}>Maior Seq. Preta:</span>
                            <span className={styles['stat-value']}>{analysis.streaks.black.longest}</span>
                        </div>
                    </StatCard>

                    <StatCard
                        title="Dúzias & Colunas"
                        icon={<Layers size={24} className={styles['infoIcon']} />}
                    >
                        {Object.entries(analysis.dozenCounts).map(([name, count]) => (
                            <div key={name}>
                                <div className={styles['stat-row']} style={{ marginBottom: '0.25rem' }}>
                                    <span className={styles['stat-label']}>{name}</span>
                                    <span className={styles['stat-value']}>{count} vezes</span>
                                </div>
                                <ProgressBar value={count} max={analysis.totalSpins} colorClass="gold" />
                            </div>
                        ))}
                    </StatCard>

                    <StatCard
                        title="Distribuição Geral"
                        icon={<AlignCenter size={24} style={{ color: '#a78bfa' }} />}
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

        </div>
    );
};

export default DeepAnalysisPanel;