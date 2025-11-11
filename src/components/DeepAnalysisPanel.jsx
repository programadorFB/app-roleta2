import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
    Flame, Snowflake, Layers, AlignCenter, TrendingUp, BarChart3, Target, PieChart, Activity, Cpu, Info, Lock, Crown // <-- 1. Adicionado Lock e Crown
} from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css';
import { useNotifications } from '../contexts/NotificationContext';
import { checkConvergenceAlert, checkPatternBrokenAlert } from '../services/alertLogic';

// Importe todos os seus componentes de aba
import SectorsAnalysis from './SectorAnalysis';
import NeighborAnalysis from './NeighborAnalysis';
import TerminalAnalysis from './TerminalAnalysis';
import AdvancedPatternsAnalysis from './AdvancedPatternsAnalysis';
import FrequencyTable from './FrequencyTable';

import { UpdateCountdown } from './VisualIndicators';

import { analyzeCroupierPattern } from '../services/CroupieDetection.jsx';


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
// Assumindo que você passa o setter do Paywall e o status Premium do App.jsx
const DeepAnalysisPanel = ({ spinHistory, setIsPaywallOpen }) => { 
    const [activeTab, setActiveTab] = useState('statistics');
    const { addNotification } = useNotifications();
    const prevAnalysesRef = useRef(); 
    
    // 2. ESTADO DE BLOQUEIO (Simulando que o usuário NÃO tem Premium)
    // No seu App.jsx final, este valor viria de uma prop: const isPremium = user.isPremium;
    const isPremium = false; 

    const analysis = useMemo(() => {
        // ... (Lógica useMemo inalterada) ...
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
        const hotNumbers = sortedNumbers.slice(0, 5).map(([num, count]) => ({ num: parseInt(num), count }));
        
        const lastSeenIndex = rouletteNumbers.reduce((acc, num) => {
            const index = [...spinHistory].reverse().findIndex(s => s.number === num);
            acc[num] = index;
            return acc;
        }, {});

        const sleepers = Object.entries(lastSeenIndex)
            .sort(([,a], [,b]) => {
                const aValue = (a === -1) ? totalSpins : a;
                const bValue = (b === -1) ? totalSpins : b;
                return bValue - aValue;
            })
            .map(([num, index]) => ({ num: parseInt(num), ago: index === -1 ? totalSpins : index }))
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

    // --- LÓGICA DE GATILHO DE ALERTA (inalterada) ---
    useEffect(() => {
        if (spinHistory.length < 30) return;

        const allAnalyses = {
            croupierAnalysis: analyzeCroupierPattern(spinHistory, 30),
        };

        const convergenceAlert = checkConvergenceAlert(allAnalyses);
        if (convergenceAlert) {
            addNotification(convergenceAlert);
        }

        const brokenPatternAlert = checkPatternBrokenAlert(allAnalyses, prevAnalysesRef.current);
        if (brokenPatternAlert) {
            addNotification(brokenPatternAlert);
        }

        prevAnalysesRef.current = allAnalyses;

    }, [spinHistory, addNotification]);
    // ------------------------------------

    // --- Componentes Auxiliares (inalterados) ---
    const StatCard = ({ title, icon, children }) => (
        // ... (JSX de StatCard)
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
    // ------------------------------------
    
    // 3. ESTILOS CONDICIONAIS E HANDLER DE BLOQUEIO
    
    // Estilo para o botão Premium/Compra
    const premiumButtonStyle = {
        flex: 1,
        minWidth: '100px',
        padding: '0.75rem 0.5rem',
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        border: '2px solid #10b981',
        color: '#FFFFFF',
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
        boxShadow: '0 2px 8px #10b981',
    };
    
    // Estilo para a aba bloqueada
    const lockedButtonStyle = {
        background: 'rgba(255, 255, 255, 0.02)', // Fundo mais escuro
        color: '#9ca3af', // Texto acinzentado
        border: '1px dashed #4b5563', // Borda tracejada
        cursor: 'not-allowed',
        boxShadow: 'none'
    };

    // Função para gerar o estilo da aba dinamicamente
    const getTabStyle = (tabName, isLocked) => ({
        flex: 1,
        minWidth: '100px', 
        padding: '0.75rem 0.5rem',
        // Se a aba estiver ativa e desbloqueada: Dourado
        background: activeTab === tabName && !isLocked ? 'linear-gradient(135deg, #ca8a04, #eab308)' : (isLocked ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)'),
        // Se a aba estiver ativa e desbloqueada: Preto; Se bloqueada: Cinza; Senão: Branco/Cinza Claro
        color: activeTab === tabName && !isLocked ? '#111827' : (isLocked ? '#9ca3af' : '#d1d5db'),
        border: isLocked ? '1px dashed #4b5563' : 'none',
        borderRadius: '0.5rem',
        cursor: isLocked ? 'not-allowed' : 'pointer',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s',
        boxShadow: activeTab === tabName && !isLocked ? '0 2px 8px rgba(202, 138, 4, 0.4)' : 'none'
    });
    
    // Handler para abas bloqueadas
    const handleLockedClick = (e) => {
        e.preventDefault();
        // Alerta simples. Substitua por setIsPaywallOpen(true) se a prop estiver disponível
        if (setIsPaywallOpen) {
            setIsPaywallOpen(true);
        } else {
             alert('🔑 Conteúdo Premium! Assine para desbloquear esta análise avançada.');
        }
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


    // 4. MAPEAMENTO DE ABAS E BLOQUEIO
    const tabs = [
        { name: 'statistics', label: 'Geral', icon: TrendingUp, isLocked: false },
        { name: 'frequency', label: 'Frequência', icon: BarChart3, isLocked: !isPremium },
        { name: 'neighbors', label: 'Vizinhança', icon: PieChart, isLocked: !isPremium },
        { name: 'terminals', label: 'Cavalos', icon: Target, isLocked: !isPremium },
        { name: 'advanced', label: 'Avançado', icon: Cpu, isLocked: !isPremium },
        { name: 'sectors', label: 'Setores', icon: Layers, isLocked: !isPremium },
        // { name: 'visual', label: 'Status', icon: Activity, isLocked: !isPremium },
    ];


    return (
        <div className={styles['strategies-info-panel']}>
            {/* Sistema de Abas */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem',
                borderBottom: '2px solid #374151',
                paddingBottom: '0.5rem'
            }}>
                
                
                {/* Renderização Dinâmica das Abas */}
                {tabs.map(tab => (
                    <button
                        key={tab.name}
                        onClick={tab.isLocked ? handleLockedClick : () => setActiveTab(tab.name)}
                        style={getTabStyle(tab.name, tab.isLocked)}
                    >
                        {tab.icon && <tab.icon size={18} />}
                        {tab.label}
                        {tab.isLocked && <Lock size={14} style={{ marginLeft: '0.2rem' }} />}
                    </button>
                ))}
                
                {/* Botão Premium (Abre o Paywall) */}
                <button
                    onClick={handleLockedClick} // Abre o Paywall
                    style={premiumButtonStyle}
                >
                    <Crown size={18} />
                    Premium
                </button>
            </div>

            {/* 5. Conteúdo da Aba Renderizado Condicionalmente */}
            
            {activeTab === 'statistics' && (
                // ABA GERAL (DESBLOQUEADA)
                <>
                    <h3 className={styles['dashboard-title']}>
                        Análise Estatística ({analysis.totalSpins} Sinais)
                    </h3>
                    
                    {/* ... (StatCards de Números Quentes, Frio, Sequências, Dúzias, etc.) ... */}
                    <StatCard 
                        title="Números Quentes" 
                        icon={<Flame size={24} className={styles['dangerIcon']} />}
                    >
                        {analysis.hotNumbers.map(({ num, count }) => ( 
    <div className={styles['stat-row']} key={num}>
        <span className={styles['stat-label']}>
            {/* O NumberChip recebe apenas o número */}
            Número <NumberChip number={num} /> 
        </span>
        <span className={styles['stat-value']}>
            {/* Usa a contagem correta */}
            {count} vezes ({(count / analysis.totalSpins * 100).toFixed(1)}%)
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
            
            {/* ABAS AVANÇADAS (BLOQUEADAS) */}
            
            {(activeTab !== 'statistics' && !isPremium) && (
                <div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '1rem' }}>
                    <Lock size={48} style={{ color: '#ca8a04', marginBottom: '1rem' }} />
                    <h3 className={styles['dashboard-title']} style={{ color: '#fde047' }}>
                        Análise Premium
                    </h3>
                    <p style={{ color: '#d1d5db', marginBottom: '1.5rem' }}>
                        Desbloqueie {tabs.find(t => t.name === activeTab).label} e outras ferramentas avançadas assinando agora.
                    </p>
                    <button 
                        onClick={handleLockedClick} 
                        style={{ ...premiumButtonStyle, width: '70%', margin: '0 auto', fontSize: '1rem' }}
                    >
                        <Crown size={20} /> Assinar Premium
                    </button>
                </div>
            )}
            
            {/* Conteúdo das Abas Desbloqueadas (Só será renderizado se isPremium for true) */}
            
            {isPremium && activeTab === 'frequency' && (
                <FrequencyTable spinHistory={spinHistory} />
            )}

            {isPremium && activeTab === 'neighbors' && (
                <NeighborAnalysis spinHistory={spinHistory} />
            )}

            {isPremium && activeTab === 'terminals' && (
                <TerminalAnalysis spinHistory={spinHistory} />
            )}
            
            {isPremium && activeTab === 'advanced' && (
                <AdvancedPatternsAnalysis spinHistory={spinHistory} />
            )}

            {isPremium && activeTab === 'sectors' && (
                <SectorsAnalysis spinHistory={spinHistory} />
            )}
            
            {isPremium && activeTab === 'visual' && (
                <>
                    <h3 className={styles['dashboard-title']}>
                        Indicadores Visuais
                    </h3>
                    <StatCard title="Contador de Atualização" icon={<Activity size={24} className={styles.infoIcon} />}>
                        <UpdateCountdown countdownKey={spinHistory.length} duration={5000} />
                    </StatCard>
                   
                </>
            )}
        </div>
    );
};

export default DeepAnalysisPanel;