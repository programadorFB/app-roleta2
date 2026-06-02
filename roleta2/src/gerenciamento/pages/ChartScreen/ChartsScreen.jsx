import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFinancial } from '../../contexts/FinancialContext';
import apiService from '../../services/api';
import { useNavigate } from 'react-router-dom';

// --- Charting Library Imports ---
import { Line, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// --- Icons ---
import {
  FaArrowLeft,
  FaChartLine,
  FaExclamationTriangle,
  FaArrowUp,
  FaArrowDown,
  FaTrophy,
  FaFire,
  FaShieldAlt,
  FaDice
} from 'react-icons/fa';
import { FaArrowTrendUp } from 'react-icons/fa6';
import { GiCrownCoin, GiDiamondTrophy } from 'react-icons/gi';

// --- CSS Module ---
import styles from './ChartsScreen.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
);

const CHART_TYPES = [
  { key: 'performance', label: 'Desempenho', icon: <FaArrowTrendUp /> },
  { key: 'risk', label: 'Análise de Risco', icon: <FaExclamationTriangle /> }
];

const ChartsScreen = () => {
  const { transactions } = useFinancial();
  const navigate = useNavigate();
  const [selectedChart, setSelectedChart] = useState('performance');
  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState(null);
  const [trendsData, setTrendsData] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, trendsRes] = await Promise.all([
        apiService.getAnalyticsOverview(),
        apiService.getMonthlyAnalytics('12')
      ]);

      if (overviewRes.success) setOverviewData(overviewRes.data);
      if (trendsRes.success) setTrendsData(trendsRes.data.sort((a, b) => new Date(a.month) - new Date(b.month)));
    } catch (error) {
      console.error("Failed to fetch chart data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Análises estatísticas
  const statisticalAnalysis = useMemo(() => {
    const operationalTxs = transactions.filter(tx =>
      apiService.isOperationalTransaction(tx.type)
    );

    const gains = operationalTxs.filter(tx => tx.type === 'gains');
    const losses = operationalTxs.filter(tx => tx.type === 'losses');

    const gainAmounts = gains.map(tx => tx.amount);
    const lossAmounts = losses.map(tx => tx.amount);

    const totalGains = gainAmounts.reduce((a, b) => a + b, 0);
    const totalLosses = lossAmounts.reduce((a, b) => a + b, 0);
    const netProfit = totalGains - totalLosses;

    const avgGain = gains.length > 0 ? totalGains / gains.length : 0;
    const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
    const winRate = operationalTxs.length > 0 ? (gains.length / operationalTxs.length) * 100 : 0;

    const returns = operationalTxs.map(tx =>
      tx.type === 'gains' ? tx.amount : -tx.amount
    );
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((acc, val) => acc + Math.pow(val - meanReturn, 2), 0) / returns.length : 0;
    const volatility = Math.sqrt(variance);

    const sharpeRatio = volatility > 0 ? (meanReturn / volatility) : 0;
    const maxGain = gains.length > 0 ? Math.max(...gainAmounts) : 0;
    const maxLoss = losses.length > 0 ? Math.max(...lossAmounts) : 0;

    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    operationalTxs.forEach(tx => {
      if (tx.type === 'gains') {
        currentStreak = Math.max(currentStreak + 1, 1);
        maxWinStreak = Math.max(maxWinStreak, currentStreak);
      } else {
        currentStreak = Math.min(currentStreak - 1, -1);
        maxLossStreak = Math.min(maxLossStreak, currentStreak);
      }
    });

    let runningBalance = 0;
    let peak = 0;
    let maxDrawdown = 0;

    operationalTxs.forEach(tx => {
      runningBalance += tx.type === 'gains' ? tx.amount : -tx.amount;
      if (runningBalance > peak) peak = runningBalance;
      const drawdown = peak > 0 ? ((peak - runningBalance) / peak) * 100 : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    return {
      totalGains,
      totalLosses,
      netProfit,
      avgGain,
      avgLoss,
      winRate,
      volatility,
      sharpeRatio,
      maxGain,
      maxLoss,
      maxWinStreak: Math.abs(maxWinStreak),
      maxLossStreak: Math.abs(maxLossStreak),
      totalTrades: operationalTxs.length,
      winningTrades: gains.length,
      losingTrades: losses.length,
      profitFactor: totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? Infinity : 0,
      maxDrawdown,
      expectancy: (avgGain * (winRate/100)) - (avgLoss * ((100-winRate)/100))
    };
  }, [transactions]);

  const renderEmptyState = () => (
    <div className={styles.casinoEmpty}>
      <GiDiamondTrophy className={styles.emptyIcon} />
      <h2>Sem Dados para Análise</h2>
      <p>Faça suas primeiras apostas para ver estatísticas</p>
      <FaDice className={styles.diceIcon} />
    </div>
  );

  const renderChartContent = () => {
    if (loading) {
      return (
        <div className={styles.casinoLoading}>
          <div className={styles.loadingSpinner}></div>
          <p>Calculando probabilidades...</p>
        </div>
      );
    }

    if (transactions.length === 0) return renderEmptyState();

    switch(selectedChart) {
      case 'performance':
        return (
          <div className={styles.casinoPerformance}>
            {/* Card Principal - Gráfico */}
            <div className={styles.casinoCard}>
              <div className={styles.cardHeader}>
                <GiCrownCoin className={styles.headerIcon} />
                <h2>Evolução do Patrimônio</h2>
                <div className={styles.headerGlow}></div>
              </div>
              
              <div className={styles.chartZone}>
                <Line
                  data={{
                    labels: trendsData.map(d => new Date(d.month).toLocaleString('default', { month: 'short' })),
                    datasets: [{
                      label: 'Patrimônio Acumulado',
                      data: trendsData.map((d, index) => {
                        const base = parseFloat(overviewData?.initial_balance || 0);
                        return trendsData.slice(0, index + 1).reduce((acc, month) =>
                          acc + (parseFloat(month.net_profit) || 0), base
                        );
                      }),
                      borderColor: '#c9a052',
                      backgroundColor: 'rgba(255, 215, 0, 0.15)',
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: '#c9a052',
                      pointBorderColor: '#000',
                      pointBorderWidth: 3,
                      pointRadius: 6,
                      pointHoverRadius: 10,
                      borderWidth: 4
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: { 
                          color: '#c9a052',
                          font: { size: 14, weight: 'bold' },
                          padding: 15
                        }
                      },
                      tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#c9a052',
                        bodyColor: '#FFFFFF',
                        borderColor: '#c9a052',
                        borderWidth: 2,
                        cornerRadius: 12,
                        padding: 15,
                        displayColors: false,
                        callbacks: {
                          label: function(context) {
                            return 'R$ ' + context.parsed.y.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            });
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        grid: { 
                          color: 'rgba(255, 215, 0, 0.1)',
                          lineWidth: 1
                        },
                        ticks: { 
                          color: '#c9a052',
                          font: { size: 12, weight: 'bold' }
                        }
                      },
                      y: {
                        grid: { 
                          color: 'rgba(255, 215, 0, 0.1)',
                          lineWidth: 1
                        },
                        ticks: {
                          color: '#c9a052',
                          font: { size: 12, weight: 'bold' },
                          callback: function(value) {
                            return 'R$ ' + value.toLocaleString('pt-BR');
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Cards de Métricas */}
            <div className={styles.metricsDisplay}>
              <div className={styles.casinoMetricCard}>
                <FaTrophy className={styles.metricIconGold} />
                <div className={styles.metricContent}>
                  <span className={styles.metricLabel}>Win Rate</span>
                  <span className={styles.metricValueLarge}>{statisticalAnalysis.winRate.toFixed(1)}%</span>
                </div>
                <div className={styles.cardShine}></div>
              </div>

              <div className={styles.casinoMetricCard}>
                <FaFire className={styles.metricIconRed} />
                <div className={styles.metricContent}>
                  <span className={styles.metricLabel}>Maior Sequência</span>
                  <span className={styles.metricValueLarge}>{statisticalAnalysis.maxWinStreak} Wins</span>
                </div>
                <div className={styles.cardShine}></div>
              </div>

              <div className={styles.casinoMetricCard}>
                <GiDiamondTrophy className={styles.metricIconDiamond} />
                <div className={styles.metricContent}>
                  <span className={styles.metricLabel}>Maior Ganho</span>
                  <span className={styles.metricValueLarge} style={{color: '#34d399'}}>
                    R$ {statisticalAnalysis.maxGain.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className={styles.cardShine}></div>
              </div>

              <div className={styles.casinoMetricCard}>
                <div className={styles.metricIconCircle}>
                  <FaArrowUp />
                </div>
                <div className={styles.metricContent}>
                  <span className={styles.metricLabel}>Sharpe Ratio</span>
                  <span className={styles.metricValue}>{statisticalAnalysis.sharpeRatio.toFixed(3)}</span>
                </div>
              </div>

              <div className={styles.casinoMetricCard}>
                <div className={styles.metricIconCircle}>
                  <FaChartLine />
                </div>
                <div className={styles.metricContent}>
                  <span className={styles.metricLabel}>Expectativa</span>
                  <span className={styles.metricValue}>
                    R$ {statisticalAnalysis.expectancy.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className={styles.casinoMetricCard}>
                <div className={styles.metricIconCircle}>
                  <FaArrowDown />
                </div>
                <div className={styles.metricContent}>
                  <span className={styles.metricLabel}>Maior Perda</span>
                  <span className={styles.metricValue} style={{color: '#f87171'}}>
                    R$ {statisticalAnalysis.maxLoss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'risk':
        const operationalTransactions = transactions.filter(tx =>
          apiService.isOperationalTransaction(tx.type)
        );

        if (operationalTransactions.length === 0) return renderEmptyState();

        return (
          <div className={styles.casinoRisk}>
            {/* Card Principal - Scatter */}
            <div className={styles.casinoCard}>
              <div className={styles.cardHeader}>
                <FaShieldAlt className={styles.headerIcon} />
                <h2>Distribuição de Resultados</h2>
                <div className={styles.headerGlow}></div>
              </div>
              
              <div className={styles.chartZone}>
                <Scatter
                  data={{
                    datasets: [{
                      label: 'Operações',
                      data: operationalTransactions.map(tx => ({
                        x: tx.amount,
                        y: tx.type === 'gains' ? tx.amount : -tx.amount,
                      })),
                      backgroundColor: operationalTransactions.map(tx =>
                        tx.type === 'gains' ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)'
                      ),
                      borderColor: operationalTransactions.map(tx =>
                        tx.type === 'gains' ? '#34d399' : '#f87171'
                      ),
                      borderWidth: 2,
                      pointRadius: 8,
                      pointHoverRadius: 12
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: { 
                          color: '#c9a052',
                          font: { size: 14, weight: 'bold' }
                        }
                      },
                      tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#c9a052',
                        bodyColor: '#FFFFFF',
                        borderColor: '#c9a052',
                        borderWidth: 2,
                        cornerRadius: 12,
                        padding: 15,
                        callbacks: {
                          label: function(context) {
                            return 'R$ ' + context.parsed.x.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2
                            });
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Valor da Operação (R$)',
                          color: '#c9a052',
                          font: { size: 14, weight: 'bold' }
                        },
                        grid: { color: 'rgba(255, 215, 0, 0.1)' },
                        ticks: {
                          color: '#c9a052',
                          font: { size: 11, weight: 'bold' },
                          callback: function(value) {
                            return 'R$ ' + value.toLocaleString('pt-BR');
                          }
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: 'Resultado Líquido (R$)',
                          color: '#c9a052',
                          font: { size: 14, weight: 'bold' }
                        },
                        grid: { color: 'rgba(255, 215, 0, 0.1)' },
                        ticks: {
                          color: '#c9a052',
                          font: { size: 11, weight: 'bold' },
                          callback: function(value) {
                            return 'R$ ' + value.toLocaleString('pt-BR');
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Indicadores de Risco */}
            <div className={styles.riskIndicators}>
              <div className={styles.casinoRiskCard}>
                <div className={styles.riskHeader}>
                  <span className={styles.riskLabel}>Profit Factor</span>
                  <span className={styles.riskValue}>
                    {statisticalAnalysis.profitFactor === Infinity ? '∞' : statisticalAnalysis.profitFactor.toFixed(2)}
                  </span>
                </div>
                <div className={styles.riskBar}>
                  <div 
                    className={styles.riskFill}
                    style={{ 
                      width: `${Math.min((statisticalAnalysis.profitFactor / 3) * 100, 100)}%`,
                      background: statisticalAnalysis.profitFactor >= 2 ? '#34d399' : statisticalAnalysis.profitFactor >= 1 ? '#c9a052' : '#f87171'
                    }}
                  ></div>
                </div>
              </div>

              <div className={styles.casinoRiskCard}>
                <div className={styles.riskHeader}>
                  <span className={styles.riskLabel}>Max Drawdown</span>
                  <span className={styles.riskValue} style={{
                    color: statisticalAnalysis.maxDrawdown > 20 ? '#f87171' : statisticalAnalysis.maxDrawdown > 10 ? '#f59e0b' : '#34d399'
                  }}>
                    {statisticalAnalysis.maxDrawdown.toFixed(1)}%
                  </span>
                </div>
                <div className={styles.riskBar}>
                  <div 
                    className={styles.riskFill}
                    style={{ 
                      width: `${Math.min(statisticalAnalysis.maxDrawdown, 100)}%`,
                      background: statisticalAnalysis.maxDrawdown > 20 ? '#f87171' : statisticalAnalysis.maxDrawdown > 10 ? '#f59e0b' : '#c9a052'
                    }}
                  ></div>
                </div>
              </div>

              <div className={styles.casinoRiskCard}>
                <div className={styles.riskHeader}>
                  <span className={styles.riskLabel}>Volatilidade</span>
                  <span className={styles.riskValue}>
                    {((statisticalAnalysis.volatility / (parseFloat(overviewData?.current_balance) || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className={styles.riskBar}>
                  <div 
                    className={styles.riskFill}
                    style={{ 
                      width: `${Math.min((statisticalAnalysis.volatility / 100) * 100, 100)}%`,
                      background: 'linear-gradient(90deg, #c9a052, #f59e0b)'
                    }}
                  ></div>
                </div>
              </div>

              <div className={styles.casinoRiskCard}>
                <div className={styles.riskHeader}>
                  <span className={styles.riskLabel}>Total de Operações</span>
                  <span className={styles.riskValue}>{statisticalAnalysis.totalTrades}</span>
                </div>
                <div className={styles.operationsSplit}>
                  <div className={styles.splitItem}>
                    <FaArrowUp style={{color: '#34d399'}} />
                    <span>{statisticalAnalysis.winningTrades} Wins</span>
                  </div>
                  <div className={styles.splitItem}>
                    <FaArrowDown style={{color: '#f87171'}} />
                    <span>{statisticalAnalysis.losingTrades} Losses</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.casinoContainer}>
      <div className={styles.casinoHeader}>
        <button onClick={() => navigate(-1)} className={styles.casinoBackButton}>
          <FaArrowLeft />
          <span>Voltar</span>
        </button>

        <div className={styles.casinoNav}>
          {CHART_TYPES.map(chart => (
            <button
              key={chart.key}
              className={`${styles.casinoNavButton} ${selectedChart === chart.key ? styles.casinoNavActive : ''}`}
              onClick={() => setSelectedChart(chart.key)}
            >
              {chart.icon}
              <span>{chart.label}</span>
              {selectedChart === chart.key && <div className={styles.activeGlow}></div>}
            </button>
          ))}
        </div>
      </div>

      <main className={styles.casinoMain}>
        {renderChartContent()}
      </main>
    </div>
  );
};

export default ChartsScreen;