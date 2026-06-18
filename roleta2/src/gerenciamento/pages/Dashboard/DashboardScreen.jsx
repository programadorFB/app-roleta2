import React, { useEffect, useMemo, useState, useCallback } from 'react'; // ✅ NOVO: Importado useState e useCallback
import { useNavigate } from 'react-router-dom';

// --- Contexts ---
import { useAuth } from '../../contexts/AuthContext';
import { useFinancial } from '../../contexts/FinancialContext';
import { BettingProvider, useBetting } from '../../contexts/BettingContext'; 
import { useSideMenu } from '../../contexts/SideMenuContext';
import apiService from '../../services/api';
// --- Components ---
import SideMenu from '../../components/SideMenu';
import TransactionList from '../../components/TransactionList';
import ObjectivesList from '../../components/ObjectivesList';
import PerformanceChart from '../../components/PerformanceChart';
// ✅ NOVO: Importando os sub-componentes do calendário
// (Ajuste o caminho se sua CalendarScreen não estiver em 'pages/CalendarScreen/CalendarScreen.jsx')
import { CalendarGrid, DayTransactionsModal } from '../../components/CalendarScreen';
import ResetModal from '../../components/ResetModal';
import InitialBankModal from '../../components/InitialBankModal';

// --- Icons ---
import { 
    MdAccountBalanceWallet, 
    MdFlag, 
    MdAdd, 
    MdRemove, 
    MdTrendingUp, 
    MdTrendingDown, 
    MdWarning,
    MdRefresh 
} from 'react-icons/md';
import { 
    FaCoins, 
    FaReceipt, 
    FaBullseye, 
    FaShieldAlt, 
    FaChartLine, 
    FaDice, 
    FaFire, 
    FaBalanceScale,
    FaCalendarDay 
} from 'react-icons/fa';

// --- Assets ---
// import background from '../../assets/fundoLuxo.jpg'; // ⛔ Removido no tema XP

// --- Avatares Locais ---
import avatar1 from '../../assets/avatares/1.png';
import avatar2 from '../../assets/avatares/2.png';
import avatar3 from '../../assets/avatares/3.png';
import avatar4 from '../../assets/avatares/4.png';
import avatar5 from '../../assets/avatares/5.png';
import avatar6 from '../../assets/avatares/6.png';

// --- CSS Module ---
// Apontando para o CSS do tema XP
import styles from '../../styles/DashboardScreen.module.css'; 

// --- Avatares ---
const PREDEFINED_AVATARS = [
    { id: 'avatar1', url: avatar1, name: 'Avatar 1' },
    { id: 'avatar2', url: avatar2, name: 'Avatar 2' },
    { id: 'avatar3', url: avatar3, name: 'Avatar 3' },
    { id: 'avatar4', url: avatar4, name: 'Avatar 4' },
    { id: 'avatar5', url: avatar5, name: 'Avatar 5' },
    { id: 'avatar6', url: avatar6, name: 'Avatar 6' }
];

const Dashboard = () => {
    const navigate = useNavigate();
    const { user, isLoading } = useAuth();
    const {
        balance,
        transactions,
        objectives,
        refreshData,
        addTransaction,
        getRealProfit,
        getEffectiveInitialBalance,
        totalLosses,
        totalDeposits,
        totalWithdraws,
        totalGains,
        dailyGains,
        dailyLosses,
        lastResetDate
    } = useFinancial();
    const initialBalance = getEffectiveInitialBalance();
    const { bettingProfile } = useBetting(); 
    const { openMenu } = useSideMenu();

    // ✅ NOVO: Estados para o Calendário e Modal
    const [calendarDate, setCalendarDate] = useState(new Date()); // Data atual do calendário no dashboard
    const [modalDate, setModalDate] = useState(null);
    const [modalTransactions, setModalTransactions] = useState([]);
    const [showResetModal, setShowResetModal] = useState(false);
    const [showInitialModal, setShowInitialModal] = useState(false);

    useEffect(() => {
        if (!isLoading && !user) {
            navigate('/login');
        }
    }, [user, isLoading, navigate]);

    useEffect(() => {
        if (user) {
            refreshData();
        }
    }, [user, refreshData]);

    // Agrupa transações por dia (mesma lógica à prova de fuso do CalendarScreen).
    // Pega YYYY-MM-DD direto da string para não deixar o navegador converter para
    // o dia anterior por causa do timezone (toISOString jogava ±1 dia em fusos extremos).
    const transactionsByDay = useMemo(() => {
        const map = {};
        transactions.forEach(tx => {
            try {
                let dateKey;
                if (typeof tx.date === 'string' && tx.date.length >= 10) {
                    dateKey = tx.date.substring(0, 10);
                } else if (tx.date instanceof Date) {
                    const y = tx.date.getFullYear();
                    const m = String(tx.date.getMonth() + 1).padStart(2, '0');
                    const d = String(tx.date.getDate()).padStart(2, '0');
                    dateKey = `${y}-${m}-${d}`;
                } else {
                    dateKey = new Date(tx.date).toISOString().split('T')[0];
                }
                if (!map[dateKey]) {
                    map[dateKey] = [];
                }
                map[dateKey].push(tx);
            } catch (e) {
                console.error("Transação com data inválida:", tx);
            }
        });
        return map;
    }, [transactions]);
    // Abre o modal limpo de banca inicial (substitui o prompt do navegador).
    const handleQuickEditInitial = () => setShowInitialModal(true);

    // Salva a banca inicial (cria se ainda não existe, senão ajusta o valor).
    // Retorna { ok, error } para o modal exibir feedback inline.
    const saveInitialBank = async (rawValue) => {
        const valor = parseFloat(String(rawValue).replace(',', '.'));
        if (isNaN(valor) || valor <= 0) {
            return { ok: false, error: 'Digite um valor válido, maior que zero.' };
        }

        const initialTx = transactions.find(tx =>
            tx.is_initial_bank === true ||
            tx.description?.toLowerCase().includes('inicial') ||
            tx.category?.toLowerCase().includes('inicial')
        );

        try {
            let response;
            if (!initialTx) {
                const hoje = new Date();
                const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
                response = await addTransaction({
                    type: 'deposit',
                    amount: valor,
                    description: 'Banca inicial',
                    category: 'Banca inicial',
                    date: dataHoje,
                    isInitialBank: true,
                });
            } else {
                response = await apiService.updateTransaction(initialTx.id, {
                    amount: valor,
                    description: initialTx.description,
                });
            }

            if (response?.success) {
                if (refreshData) await refreshData();
                return { ok: true };
            }
            return { ok: false, error: response?.error || 'Não foi possível salvar agora. Tente de novo.' };
        } catch (e) {
            return { ok: false, error: 'Não foi possível salvar. Verifique sua conexão e tente de novo.' };
        }
    };
    // ✅ NOVO: Funções para controlar o modal (copiado de CalendarScreen)
    const handleDayClick = (date, transactions) => {
        setModalDate(date);
        setModalTransactions(transactions);
    };

    const closeModal = () => {
        setModalDate(null);
        setModalTransactions([]);
    };


    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getProfileIcon = () => {
        if (!bettingProfile?.isInitialized) return null;
        
        // Identidade Mogno & Ouro: ícone dourado
        const color = '#c9a052';
        const iconName = bettingProfile.iconName || 'dice';
        
        switch(iconName) {
            case 'shield-alt':
            case 'shield':
                return <FaShieldAlt color={color} />;
            case 'fire':
                return <FaFire color={color} />;
            case 'balance-scale':
            case 'balance':
                return <FaBalanceScale color={color} />;
            case 'dice':
            default:
                return <FaDice color={color} />;
        }
    };

    const calculateProfitTarget = () => {
        const riskLevel = bettingProfile?.riskLevel || 5;
        return balance * (riskLevel / 100);
    };

    const calculateDailyProfitProgress = () => {
        const profitTarget = calculateProfitTarget();
        if (profitTarget <= 0) return 0;
        return Math.min((dailyGains / profitTarget) * 100, 100);
    };

// ✅ CORREÇÃO: Prioriza o cálculo dinâmico pela porcentagem
    const stopLossMonetaryValue = useMemo(() => {
        // 1. Tenta calcular usando a porcentagem salva e a banca inicial real
        if (bettingProfile?.stopLossPercentage && bettingProfile.stopLossPercentage > 0) {
            return initialBalance * (bettingProfile.stopLossPercentage / 100);
        }
        
        // 2. Se não tiver porcentagem, tenta usar o valor fixo salvo (fallback)
        if (bettingProfile?.stopLoss && bettingProfile.stopLoss > 0) {
            return bettingProfile.stopLoss;
        }

        return 0;
    }, [bettingProfile, initialBalance]);

    const isStopLossTriggered = useMemo(() => {
        if (!stopLossMonetaryValue || stopLossMonetaryValue <= 0) return false;
        return dailyLosses >= stopLossMonetaryValue;
    }, [dailyLosses, stopLossMonetaryValue]);

    const stopLossDistance = useMemo(() => {
        if (!stopLossMonetaryValue) return null;
        return stopLossMonetaryValue - dailyLosses;
    }, [dailyLosses, stopLossMonetaryValue]);

    const getAvatarUrl = () => {
        if (!user?.profile_photo) return null;
        const avatar = PREDEFINED_AVATARS.find(a => a.id === user.profile_photo);
        return avatar ? avatar.url : null;
    };

    const avatarUrl = getAvatarUrl();

    const getInitials = () => {
        if (!user?.name) return 'J';
        return user.name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    if (isLoading || !user) {
        return (
            <div className={styles.loadingContainer}>
                <p>Carregando...</p>
            </div>
        );
    }


    const overallProfit = balance - initialBalance;
    const realProfit = getRealProfit();
    const profitTarget = calculateProfitTarget();
    const dailyProfitProgress = calculateDailyProfitProgress();
    
    const recentTransactions = transactions.slice(-5).reverse();
    const incompleteObjectives = objectives.filter(obj => obj.current_amount < obj.target_amount);
    
    return (
        // O fundo 'background' foi removido, o CSS cuida disso
        <div className={styles.dashboardContainer}>
            {/* O overlayGradient foi removido, o CSS cuida disso */}
            
            <header className={styles.header}>
                <button className={styles.menuButton} onClick={openMenu}>
                    <span className={styles.menuIcon}></span>
                </button>

                <div className={styles.profileWrapper} style={{ marginLeft: 'auto', marginRight: 12 }}>
                    <div className={styles.profileAvatarContainer}>
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt="Avatar"
                                className={styles.profileAvatar}
                            />
                        ) : (
                            <div className={`${styles.profileAvatar} ${styles.profileAvatarPlaceholder}`}>
                                <span>{getInitials()}</span>
                            </div>
                        )}
                    </div>

                    {bettingProfile?.isInitialized && (
                        <div className={styles.profileIconBadge} title={bettingProfile.title}>
                            {getProfileIcon()}
                        </div>
                    )}
                </div>

                <button
                    className={styles.headerResetButton}
                    onClick={() => setShowResetModal(true)}
                    title="Resetar dados"
                    aria-label="Resetar dados"
                >
                    <MdRefresh size={15} /> Reset
                </button>
            </header>

            <main className={styles.scrollView}>
                
                {/* Seção de Saldos */}
                <section className={styles.balanceSection}>
    <div
        className={styles.balanceCard}
        onClick={handleQuickEditInitial}
        style={{ cursor: 'pointer' }}
        title={initialBalance > 0 ? 'Clique para ajustar sua banca inicial' : 'Clique para inserir sua banca inicial'}
    >
        <div className={styles.cardHeader}>
            <MdAccountBalanceWallet size={20} />
            <span>Banca Inicial</span>
            {/* Ícone visual: editar quando já existe, adicionar quando ainda é 0 */}
            {initialBalance > 0
                ? <MdRefresh size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                : <MdAdd size={16} style={{ marginLeft: 'auto', opacity: 0.7 }} />}
        </div>
        {initialBalance > 0 ? (
            <p className={`${styles.balanceAmount} ${styles.initial}`}>
                {formatCurrency(initialBalance)}
            </p>
        ) : (
            <p
                className={`${styles.balanceAmount} ${styles.initial}`}
                style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.9 }}
            >
                Insira sua banca inicial
            </p>
        )}
    </div>

                    <div className={`${styles.balanceCard} ${styles.main}`}>
                        <div className={styles.cardHeader}>
                            {/* O CSS forçará a cor correta (azul) */}
                            <FaCoins size={20} />
                            <span>Saldo Atual</span>
                        </div>
                        <p className={`${styles.balanceAmount} ${styles.main}`}>
                            {formatCurrency(balance)}
                        </p>
                        <div className={`${styles.performance} ${overallProfit >= 0 ? styles.positive : styles.negative}`}>
                            {overallProfit >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(overallProfit))}
                        </div>
                    </div>

                    <div className={styles.balanceCard}>
                        <div className={styles.cardHeader}>
                            {/* O CSS forçará a cor correta (azul) */}
                            <MdFlag size={20} />
                            <span>Lucro Real</span>
                        </div>
                        <p className={`${styles.balanceAmount} ${realProfit >= 0 ? styles.positive : styles.negative}`}>
                            {formatCurrency(realProfit)}
                        </p>
                    </div>
                </section>

                {/* Container para Gestão de Risco e Resumo Financeiro */}
                <section className={styles.overviewSection}>
                    {/* Gestão de Risco com valores DIÁRIOS */}
                    <div className={styles.riskManagementSection}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Gestão de Risco (Diária)</h2>
                        <button 
                            className={styles.seeAllButton} 
                            onClick={() => navigate('/investment-profile')}
                        >
                            Configurar
                        </button>
                    </div>

                    <div className={styles.riskCardsContainer}>
                        {/* Card Meta de Lucro DIÁRIA */}
                        <div className={styles.riskCard}>
                            <div className={styles.riskCardHeader}>
                                <div className={styles.riskIconWrapper}>
                                    {/* O CSS forçará a cor correta (branca) */}
                                    <FaChartLine size={18} />
                                </div>
                                <span className={styles.riskCardTitle}>Win Diário</span>
                            </div>
                            
                            {/* 👇 Wrapper do Corpo da Janela ADICIONADO 👇 */}
                            <div className={styles.riskCardBody}>
                                {bettingProfile?.riskLevel && bettingProfile.riskLevel > 0 ? (
                                    <>
                                        <div className={styles.riskCardValue}>
                                            <span className={styles.riskMainValue}>
                                                {formatCurrency(profitTarget)}
                                            </span>
                                            <span className={styles.riskPercentage}>
                                                {bettingProfile.riskLevel}% da banca
                                            </span>
                                        </div>
                                        
                                        <div className={styles.progressBarContainer}>
                                            <div className={styles.progressBar}>
                                                <div 
                                                    className={styles.progressBarFill}
                                                    style={{ 
                                                        width: `${dailyProfitProgress}%`,
                                                        // A cor de fundo azul é definida no CSS
                                                    }}
                                                />
                                            </div>
                                            <div className={styles.progressInfo}>
                                                <span className={styles.progressCurrent}>
                                                    {formatCurrency(dailyGains)}
                                                </span>
                                                <span className={styles.progressPercent}>
                                                    {dailyProfitProgress.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {dailyProfitProgress >= 100 && (
                                            <div className={styles.successBanner}>
                                                <MdFlag size={16} />
                                                <span>Meta do Dia Alcançada! 🎉</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className={styles.riskCardEmpty}>
                                        <p>Defina seu perfil de risco</p>
                                        <button 
                                            className={styles.configureButton}
                                            onClick={() => navigate('/investment-profile')}
                                        >
                                            Definir perfil
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Card Stop Loss DIÁRIO */}
                        <div className={`${styles.riskCard} ${isStopLossTriggered ? styles.stopLossTriggered : ''}`}>
                            <div className={styles.riskCardHeader}>
                                <div className={styles.riskIconWrapper}>
                                    {/* O CSS forçará a cor correta (branca) */}
                                    <FaShieldAlt size={18} />
                                </div>
                                <span className={styles.riskCardTitle}>Limite de Perda Diário</span>
                            </div>
                            
                            {/* 👇 Wrapper do Corpo da Janela ADICIONADO 👇 */}
                            <div className={styles.riskCardBody}>
                                {stopLossMonetaryValue > 0 ? (
                                    <>
                                        <div className={styles.riskCardValue}>
                                            <span className={styles.riskMainValue}>
                                                {formatCurrency(stopLossMonetaryValue)}
                                            </span>
                                            <span className={styles.riskPercentage}>
                                                Limite de perda
                                            </span>
                                        </div>
                                        
                                        <div className={styles.progressBarContainer}>
                                            <div className={styles.progressBar}>
                                                <div 
                                                    className={styles.progressBarFill}
                                                    style={{ 
                                                        width: `${Math.min((dailyLosses / stopLossMonetaryValue) * 100, 100)}%`,
                                                        // A cor de fundo azul é definida no CSS
                                                    }}
                                                />
                                            </div>
                                            <div className={styles.progressInfo}>
                                                <span className={styles.progressCurrent}>
                                                    {formatCurrency(dailyLosses)}
                                                </span>
                                                <span className={styles.progressPercent}>
                                                    {((dailyLosses / stopLossMonetaryValue) * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {isStopLossTriggered ? (
                                            <div className={styles.alertBanner}>
                                                <MdWarning size={16} />
                                                <span>Limite do Dia Atingido!</span>
                                            </div>
                                        ) : stopLossDistance && stopLossDistance < stopLossMonetaryValue * 0.2 ? (
                                            // Usando o .alertBanner para "Atenção" também
                                            <div className={styles.alertBanner}> 
                                                <MdWarning size={16} />
                                                <span>Atenção! Faltam {formatCurrency(stopLossDistance)}</span>
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className={styles.riskCardEmpty}>
                                        <p>Não configurado</p>
                                        <button 
                                            className={styles.configureButton}
                                            onClick={() => navigate('/investment-profile')}
                                        >
                                            Configurar agora
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        </div>
                    </div>

                    {/* Seção Resumo Financeiro - TOTAIS GERAIS */}
                    <div className={styles.summarySection}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Resumo Financeiro (Total)</h2>
                    </div>
                    
                    <div className={styles.summaryCardUnified}>
                        <div className={styles.summaryRow}>
                            <div className={styles.summaryLabel}>
                                {/* O CSS forçará a cor correta (azul) */}
                                <MdAdd size={22} />
                                <span>Total Depositado</span>
                            </div>
                            <p className={`${styles.summaryValue} ${styles.positive}`}>
                                {formatCurrency(totalDeposits)}
                            </p>
                        </div>

                        <div className={styles.summaryRow}>
                            <div className={styles.summaryLabel}>
                                {/* O CSS forçará a cor correta (cinza) */}
                                <MdRemove size={22} />
                                <span>Total Sacado</span>
                            </div>
                            <p className={`${styles.summaryValue} ${styles.negative}`}>
                                {formatCurrency(totalWithdraws)}
                            </p>
                        </div>

                        <div className={styles.summaryRow}>
                            <div className={styles.summaryLabel}>
                                {/* O CSS forçará a cor correta (azul) */}
                                <MdTrendingUp size={22} />
                                <span>Total de Ganhos</span>
                            </div>
                            <p className={`${styles.summaryValue} ${styles.positive}`}>
                                {formatCurrency(totalGains)}
                            </p>
                        </div>

                        <div className={styles.summaryRow}>
                            <div className={styles.summaryLabel}>
                                {/* O CSS forçará a cor correta (cinza) */}
                                <MdTrendingDown size={22} />
                                <span>Total de Perdas</span>
                            </div>
                            <p className={`${styles.summaryValue} ${styles.negative}`}>
                                {formatCurrency(totalLosses)}
                            </p>
                        </div>
                        </div>
                    </div>
                </section>
                
                {/* Ações Rápidas (Agora estilo botão XP) */}
                    <section className={styles.quickActions}>
                        <button 
                            className={styles.actionButton} 
                            onClick={() => navigate('/transaction?type=deposit')}
                        >
                            <MdAdd /> Depósito
                        </button>
                        <button 
                            className={styles.actionButton} 
                            onClick={() => navigate('/transaction?type=withdraw')}
                        >
                            <MdRemove /> Saque
                        </button>
                        <button 
                            className={styles.actionButton} 
                            onClick={() => navigate('/transaction?type=gains')}
                        >
                            <MdTrendingUp /> Ganhos
                        </button>
                        <button 
                            className={styles.actionButton} 
                            onClick={() => navigate('/transaction?type=losses')}
                        >
                            <MdTrendingDown /> Perdas
                        </button>
                    </section>


                {/* Gráfico de Performance */}
                {/* <PerformanceChart 
                    transactions={transactions}
                    currentBalance={balance}
                    initialBalance={initialBalance}
                /> */}

{/* Modal de Confirmação de Reset - Adicione no final do return */}
<ResetModal
    open={showResetModal}
    onClose={() => setShowResetModal(false)}
    onResetComplete={(option) => {
        const msg = {
            bank: '✅ Banca resetada com sucesso!',
            daily: '✅ Valores do dia zerados!',
            all: '✅ Tudo resetado! Banca zerada.',
        }[option];
        if (msg) alert(msg);
    }}
/>

<InitialBankModal
    open={showInitialModal}
    currentValue={initialBalance > 0 ? initialBalance : null}
    onSave={saveInitialBank}
    onClose={() => setShowInitialModal(false)}
/>
                {/* =======================================================
                ✅ NOVO: Seção do Calendário inserida abaixo do gráfico
                =======================================================
                */}
              <section className={styles.calendarSection}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Calendário de Transações</h2>
                    <button
                        className={styles.seeAllButton}
                        onClick={() => navigate('/calendar')}
                    >
                        Ver Tela Cheia
                    </button>
                </div>
                
                <CalendarGrid
                    currentDate={calendarDate}
                    transactionsByDay={transactionsByDay}
                    onDayClick={handleDayClick}
                />
            </section>
                {/* ======================================================= */}


                {/* Transações Recentes */}
                <section className={styles.transactionsList}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Transações Recentes</h2>
                        <button 
                            className={styles.seeAllButton} 
                            onClick={() => navigate('/history')}
                        >
                            Ver Todas
                        </button>
                    </div>
                    {recentTransactions.length > 0 ? (
                       <TransactionList 
                            transactions={recentTransactions}
                            emptyMessage="Nenhuma transação encontrada"
                            />
                    ) : (
                        <div className={styles.emptyState}>
                            <FaReceipt size={40} />
                            <p>Nenhuma transação ainda.</p>
                        </div>
                    )}
                </section>

                {/* Objetivos Ativos (Desativado no seu código original) */}
                {/* <section className={styles.objectivesList}>
                    ...
                </section> */}
            </main>

            <SideMenu />

            {/* =======================================================
            ✅ NOVO: Modal do Calendário 
            (Renderizado aqui para sobrepor todo o conteúdo)
            =======================================================
            */}
            <DayTransactionsModal
                date={modalDate}
                transactions={modalTransactions}
                onClose={closeModal}
            />
        </div>
    );
};

// Wrapper com Provider do Betting Context
const DashboardWithProvider = () => {
    return (
        <BettingProvider>
            <Dashboard />
        </BettingProvider>
    );
};

export default DashboardWithProvider;
