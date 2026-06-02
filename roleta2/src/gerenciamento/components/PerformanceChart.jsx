import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MdTrendingUp } from 'react-icons/md';
import { FaChartLine, FaCoins } from 'react-icons/fa';
import styles from './PerformanceChart.module.css';

const PerformanceChart = ({ transactions, currentBalance, initialBalance }) => {
    const [dateFilter, setDateFilter] = useState('7days');

    // Formatar moeda
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    // Processar TODAS as transações (modo ALL)
    const processAllTransactions = React.useCallback((transactions) => {
        const sortedTransactions = [...transactions].sort((a, b) => 
            new Date(a.created_at || a.date) - new Date(b.created_at || b.date)
        );

        const dataByDate = {};
        let runningBalance = initialBalance || 0;

        console.log('📊 ALL - Começando da banca inicial:', runningBalance);

        sortedTransactions.forEach(tx => {
            const txDate = new Date(tx.created_at || tx.date);
            const dateKey = txDate.toISOString().split('T')[0];

            if (!dataByDate[dateKey]) {
                dataByDate[dateKey] = {
                    date: dateKey,
                    transactions: []
                };
            }

            dataByDate[dateKey].transactions.push(tx);
        });

        const chartData = Object.keys(dataByDate)
            .sort()
            .map(dateKey => {
                const dayData = dataByDate[dateKey];
                
                dayData.transactions.forEach(tx => {
                    const amount = parseFloat(tx.amount) || 0;
                    if (tx.type === 'deposit' || tx.type === 'gains') {
                        runningBalance += amount;
                    } else if (tx.type === 'withdraw' || tx.type === 'losses') {
                        runningBalance -= amount;
                    }
                });

                return {
                    date: dateKey,
                    balance: runningBalance,
                    dateFormatted: new Date(dateKey).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit'
                    }),
                    transactionCount: dayData.transactions.length
                };
            });

        console.log('📊 ALL - Saldo final:', runningBalance);
        return chartData;
    }, [initialBalance]);

    // Função para calcular saldo ao longo do tempo com precisão diária
    const processChartData = useMemo(() => {
        if (!transactions || transactions.length === 0) {
            console.log('📊 Gráfico: Sem transações, usando saldo atual:', currentBalance);
            return [{
                date: new Date().toISOString().split('T')[0],
                balance: currentBalance || 0,
                dateFormatted: new Date().toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit'
                }),
                transactionCount: 0
            }];
        }

        const today = new Date();
        let startDate = new Date();
        
        // Determinar data inicial baseada no filtro
        switch (dateFilter) {
            case '7days':
                startDate.setDate(today.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(today.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(today.getDate() - 90);
                break;
            case 'all':
                console.log('📊 Modo ALL - Banca Inicial:', initialBalance, 'Saldo Atual:', currentBalance);
                return processAllTransactions(transactions);
            default:
                startDate.setDate(today.getDate() - 7);
        }

        console.log('📊 Filtro:', dateFilter, 'Banca Inicial:', initialBalance, 'Saldo Atual:', currentBalance);

        // Filtrar e ordenar transações dentro do período
        const filteredTransactions = transactions
            .filter(tx => {
                const txDate = new Date(tx.created_at || tx.date);
                return txDate >= startDate && txDate <= today;
            })
            .sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date));

        console.log('📊 Transações filtradas:', filteredTransactions.length);

        if (filteredTransactions.length === 0) {
            console.log('📊 Sem transações no período, usando saldo atual:', currentBalance);
            return [{
                date: startDate.toISOString().split('T')[0],
                balance: currentBalance || 0,
                dateFormatted: startDate.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit'
                }),
                transactionCount: 0
            }];
        }

        // Agrupar transações por data
        const dataByDate = {};
        
        filteredTransactions.forEach(tx => {
            const txDate = new Date(tx.created_at || tx.date);
            const dateKey = txDate.toISOString().split('T')[0];

            if (!dataByDate[dateKey]) {
                dataByDate[dateKey] = {
                    date: dateKey,
                    transactions: []
                };
            }

            dataByDate[dateKey].transactions.push(tx);
        });

        // Calcular saldo inicial do período subtraindo transações do período do saldo atual
        const sortedDates = Object.keys(dataByDate).sort();
        let runningBalance = currentBalance || 0;

        // Calcular total de mudanças no período
        let periodTotal = 0;
        filteredTransactions.forEach(tx => {
            const amount = parseFloat(tx.amount) || 0;
            if (tx.type === 'deposit' || tx.type === 'gains') {
                periodTotal += amount;
            } else if (tx.type === 'withdraw' || tx.type === 'losses') {
                periodTotal -= amount;
            }
        });

        // Saldo no início do período = saldo atual - total de mudanças do período
        const startBalance = runningBalance - periodTotal;
        runningBalance = startBalance;

        console.log('📊 Saldo início do período:', startBalance);
        console.log('📊 Total de mudanças no período:', periodTotal);

        // Processar de frente para trás
        const chartData = sortedDates.map(dateKey => {
            const dayData = dataByDate[dateKey];
            
            dayData.transactions.forEach(tx => {
                const amount = parseFloat(tx.amount) || 0;
                if (tx.type === 'deposit' || tx.type === 'gains') {
                    runningBalance += amount;
                } else if (tx.type === 'withdraw' || tx.type === 'losses') {
                    runningBalance -= amount;
                }
            });

            return {
                date: dateKey,
                balance: runningBalance,
                dateFormatted: new Date(dateKey).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit'
                }),
                transactionCount: dayData.transactions.length
            };
        });

        console.log('📊 Saldo final no gráfico:', chartData[chartData.length - 1]?.balance);
        console.log('📊 Dados do gráfico:', chartData);

        return chartData;
    }, [transactions, dateFilter, processAllTransactions, currentBalance, initialBalance]);

    // Calcular estatísticas do período
    const periodStats = useMemo(() => {
        if (processChartData.length === 0) {
            return {
                startBalance: 0,
                endBalance: 0,
                variation: 0,
                variationPercent: 0,
                highestBalance: 0,
                lowestBalance: 0
            };
        }

        const startBalance = processChartData[0].balance;
        const endBalance = processChartData[processChartData.length - 1].balance;
        const variation = endBalance - startBalance;
        const variationPercent = startBalance !== 0 ? (variation / startBalance) * 100 : 0;

        const balances = processChartData.map(item => item.balance);
        const highestBalance = Math.max(...balances);
        const lowestBalance = Math.min(...balances);

        return {
            startBalance,
            endBalance,
            variation,
            variationPercent,
            highestBalance,
            lowestBalance
        };
    }, [processChartData]);

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            
            return (
                <div className={styles.customTooltip}>
                    <p className={styles.tooltipDate}>
                        {data.dateFormatted}
                    </p>
                    <div className={styles.tooltipRow}>
                        <span className={styles.tooltipLabel}>
                            <FaCoins /> Saldo:
                        </span>
                        <span className={styles.tooltipValueBalance}>
                            {formatCurrency(payload[0].value)}
                        </span>
                    </div>
                    {data.transactionCount > 0 && (
                        <div className={styles.tooltipInfo}>
                            <small>
                                {data.transactionCount} transação(ões) neste dia
                            </small>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div className={styles.chartContainer}>
            {/* Header com filtros */}
            <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>
                    <FaChartLine />
                    <h3>Performance</h3>
                </div>
                
                <div className={styles.dateFilters}>
                    <button
                        className={`${styles.filterButton} ${dateFilter === '7days' ? styles.active : ''}`}
                        onClick={() => setDateFilter('7days')}
                    >
                        7 dias
                    </button>
                    <button
                        className={`${styles.filterButton} ${dateFilter === '30days' ? styles.active : ''}`}
                        onClick={() => setDateFilter('30days')}
                    >
                        30 dias
                    </button>
                    <button
                        className={`${styles.filterButton} ${dateFilter === '90days' ? styles.active : ''}`}
                        onClick={() => setDateFilter('90days')}
                    >
                        90 dias
                    </button>
                    <button
                        className={`${styles.filterButton} ${dateFilter === 'all' ? styles.active : ''}`}
                        onClick={() => setDateFilter('all')}
                    >
                        Tudo
                    </button>
                </div>
            </div>

            {/* Estatísticas do Período */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>
                        <FaCoins /> Saldo Inicial
                    </span>
                    <span className={styles.statValueBalance}>
                        {formatCurrency(periodStats.startBalance)}
                    </span>
                    <span className={styles.statAvg}>
                        Início do período
                    </span>
                </div>

                <div className={styles.statCard}>
                    <span className={styles.statLabel}>
                        <FaCoins /> Saldo Final
                    </span>
                    <span className={styles.statValueBalance}>
                        {formatCurrency(periodStats.endBalance)}
                    </span>
                    <span className={styles.statAvg}>
                        Final do período
                    </span>
                </div>

                <div className={styles.statCard}>
                    <span className={styles.statLabel}>
                        <MdTrendingUp /> Variação
                    </span>
                    <span className={`${styles.statValueNet} ${
                        periodStats.variation >= 0 ? styles.positive : styles.negative
                    }`}>
                        {periodStats.variation >= 0 ? '+' : ''}{formatCurrency(periodStats.variation)}
                    </span>
                    <span className={`${styles.statAvg} ${
                        periodStats.variation >= 0 ? styles.positive : styles.negative
                    }`}>
                        {periodStats.variation >= 0 ? '▲' : '▼'} {Math.abs(periodStats.variationPercent).toFixed(2)}%
                    </span>
                </div>
            </div>

            {/* Gráfico */}
            <div className={styles.chartWrapper}>
                {processChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                        <LineChart 
                            data={processChartData}
                            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis 
                                dataKey="dateFormatted" 
                                stroke="#999"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis 
                                stroke="#999"
                                style={{ fontSize: '12px' }}
                                tickFormatter={(value) => `R$ ${value.toFixed(0)}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend 
                                wrapperStyle={{ 
                                    paddingTop: '20px',
                                    fontSize: '14px'
                                }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#c9a052" 
                                strokeWidth={3}
                                name="Saldo Atual"
                                dot={{ fill: '#c9a052', r: 4 }}
                                activeDot={{ r: 7, fill: '#c9a052' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className={styles.emptyChart}>
                        <FaChartLine size={48} />
                        <p>Nenhum dado disponível para o período selecionado</p>
                        <small>Adicione transações para visualizar a evolução do saldo</small>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PerformanceChart;