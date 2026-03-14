import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, BarChart3, Clock, Hash, Percent, Layers,
  LogOut, PlayCircle, Filter, Crosshair
} from 'lucide-react';
import PaywallModal from './components/PaywallModal.jsx';
import './components/PaywallModal.css';
import MasterDashboard from './pages/MasterDashboard.jsx';
import RacingTrack from './components/RacingTrack.jsx';
import DeepAnalysisPanel from './components/DeepAnalysisPanel.jsx';
import ResultsGrid from './components/ResultGrid.jsx';
import GameIframe from './components/GameIframe.jsx';
import TriggersPage from './pages/TriggersPage.jsx';
import Login from './components/Login.jsx';
import { calculateMasterScore } from './services/masterScoring.jsx';
import './components/NotificationsCenter.css';
import './App.modules.css';
import './index.css';
import W600 from "./assets/w=600.svg";
import { ROULETTE_SOURCES, ROULETTE_GAME_IDS, FILTER_OPTIONS } from './constants/roulette';
import { getNumberColor, formatPullTooltip } from './utils/roulette';
import {
  registerLogoutCallback, clearLogoutCallback
} from './errorHandler.js';

// 🔧 FIX: Importa hooks em vez de reimplementar
import { useGameLauncher, LAUNCH_FAILURE } from './hooks/useGameLauncher.js';
import { useSpinHistory } from './hooks/useSpinHistory.js';

const API_URL = import.meta.env.VITE_API_URL;


// === NUMBER STATS POPUP ===
const NumberStatsPopup = React.memo(({ isOpen, onClose, number, stats }) => {
  if (!isOpen || !stats) return null;
  const color = getNumberColor(number);
  return (
    <div className="popup-overlay" onClick={onClose}><div className="popup-content" onClick={(e) => e.stopPropagation()}>
      <button onClick={onClose} className="popup-close-btn"><X size={24} /></button>
      <div className="popup-header"><div className={`popup-number-icon ${color}`}>{number}</div><h2 className="popup-title">Análise do Número {number} (em {stats.historyFilter} spins)</h2></div>
      <div className="popup-stats-grid">
        <div className="info-card"><p className="info-label"><Hash size={18} /> Ocorrências:</p><p className="info-value">{stats.count} / {stats.historyFilter}</p></div>
        <div className="info-card"><p className="info-label"><Percent size={18} /> Frequência:</p><p className="info-value">{stats.frequency}%</p></div>
        <div className="info-card"><p className="info-label"><Clock size={18} /> Última Vez:</p><p className="info-value">{stats.lastHitAgo !== null ? `${stats.lastHitAgo} spins atrás` : 'Nunca'}</p></div>
        <div className="info-card"><p className="info-label">Cor:</p><p className={`info-value ${color}`}>{color.toUpperCase()}</p></div>
      </div>
      <h3 className="next-spins-title">Últimas 5 Ocorrências (e 5 RODADAS ANTERIORES)</h3>
      <div className="next-spins-container">
        {stats.nextOccurrences.length > 0 ? stats.nextOccurrences.map((occ, index) => (
          <div key={index} className="next-spins-card"><p className="next-spins-label">Ocorrência #{stats.count - index} ({occ.spinsAgo} spins atrás)</p><div className="next-numbers-list">{occ.prevSpins.length > 0 ? occ.prevSpins.map((num, i) => <span key={i} className={`next-number ${getNumberColor(num)}`}>{num}</span>) : <span className="no-data">Início do histórico</span>}</div></div>
        )) : <p className="next-spins-none">O número {number} ainda não foi sorteado.</p>}
      </div>
      <button onClick={onClose} className="popup-footer-btn">Fechar</button>
    </div></div>
  );
});
NumberStatsPopup.displayName = 'NumberStatsPopup';

// ════════════════════════════════════════════════════════════
// === APP PRINCIPAL ===
// ════════════════════════════════════════════════════════════

const App = () => {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');

  // UI
  const [selectedRoulette, setSelectedRoulette] = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [entrySignals, setEntrySignals] = useState({ targets: [], expanded: [] });
  const [historyFilter, setHistoryFilter] = useState(FILTER_OPTIONS[1].value);
  const [mobileTooltip, setMobileTooltip] = useState({ visible: false, content: '', x: 0, y: 0, isBelow: false });
  const [activeView, setActiveView] = useState('dashboard');
  const [rouletteAssertiveness, setRouletteAssertiveness] = useState([]);
  const inactivityTimeoutRef = useRef(null);

  // ════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const email = localStorage.getItem('userEmail');
    const brand = localStorage.getItem('userBrand');
    if (token) { setIsAuthenticated(true); setJwtToken(token); setUserInfo({ email, brand }); }
    setCheckingAuth(false);
  }, []);

  const handleLoginSuccess = useCallback((data) => {
    setIsAuthenticated(true); setJwtToken(data.jwt);
    setUserInfo({ email: localStorage.getItem('userEmail'), brand: localStorage.getItem('userBrand'), ...data });
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); localStorage.removeItem('userBrand');
    setIsAuthenticated(false); setUserInfo(null); setJwtToken(null);
  }, []);

  useEffect(() => { registerLogoutCallback(handleLogout); return () => clearLogoutCallback(); }, [handleLogout]);

  // ════════════════════════════════════════════════════════════
  // useSpinHistory hook
  // ════════════════════════════════════════════════════════════

  const handlePaywallRequired = useCallback((url) => {
    setCheckoutUrl(url || ''); setIsPaywallOpen(true);
  }, []);

  const history = useSpinHistory({
    selectedRoulette,
    userEmail: userInfo?.email || '',
    jwtToken,
    isAuthenticated,
    historyFilter,
    onPaywallRequired: handlePaywallRequired,
  });

  const {
    spinHistory, filteredSpinHistory, selectedResult, setSelectedResult,
    numberPullStats, numberPreviousStats, stats, clearHistory,
  } = history;

  // ════════════════════════════════════════════════════════════
  // useGameLauncher hook
  // ════════════════════════════════════════════════════════════

  const game = useGameLauncher({
    selectedRoulette, jwtToken, isAuthenticated,
    userEmail: userInfo?.email || '',
  });

  const {
    isLaunching, launchError, gameUrl, iframeError, failureType,
    retryCount, isRetrying, handleLaunchGame, handleIframeError,
    retryFromError, cancelRetry, resetGame,
  } = game;

  // ════════════════════════════════════════════════════════════
  // Paywall event listener
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    const handler = (e) => { setCheckoutUrl(e.detail?.checkoutUrl || ''); setIsPaywallOpen(true); };
    window.addEventListener('paywall-required', handler);
    return () => window.removeEventListener('paywall-required', handler);
  }, []);

  // ════════════════════════════════════════════════════════════
  // Inactivity timeout
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!gameUrl || !isAuthenticated) { if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current); return; }
    const INACTIVITY_LIMIT = 90 * 60 * 1000;
    const resetTimer = () => { if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = setTimeout(() => { handleLogout(); alert('Sessão encerrada por inatividade.'); }, INACTIVITY_LIMIT); };
    const onActivity = () => resetTimer();
    resetTimer();
    document.addEventListener('mousemove', onActivity); document.addEventListener('keydown', onActivity); document.addEventListener('touchstart', onActivity);
    return () => { clearTimeout(inactivityTimeoutRef.current); document.removeEventListener('mousemove', onActivity); document.removeEventListener('keydown', onActivity); document.removeEventListener('touchstart', onActivity); };
  }, [gameUrl, isAuthenticated, handleLogout]);

  // ════════════════════════════════════════════════════════════
  // Background monitor
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isAuthenticated || !userInfo?.email) return;

    const fetchAndAnalyze = async (source) => {
      try {
        const response = await fetch(
          `${API_URL}/api/full-history?source=${source}&userEmail=${encodeURIComponent(userInfo.email)}`
        );
        if (!response.ok) return null;

        const data = await response.json();
        const hist = Array.isArray(data)
          ? data.slice(0, 100).map(item => ({
              number: parseInt(item.signal || item.result, 10),
              color: getNumberColor(parseInt(item.signal || item.result, 10)),
              signalId: item.signalid || item.signalId || item.id,
              date: item.timestamp,
            }))
          : [];

        if (hist.length < 50) return null;

        const s = calculateMasterScore(hist);
        if (!s) return null;

        return {
          key: source,
          globalAssertiveness: Number(s.globalAssertiveness || 0),
          totalSignals: s.totalSignals || 0,
          hasEntrySignal: !!s.entrySignal,
          greenCount: s.strategyScores?.filter(st => st.status === '🟢').length || 0,
        };
      } catch (e) {
        console.warn(`[Monitor] Erro em ${source}:`, e.message);
        return null;
      }
    };

    const monitorAllRoulettes = async () => {
      const results = await Promise.allSettled(
        Object.keys(ROULETTE_SOURCES).map(source => fetchAndAnalyze(source))
      );

      const analysisResults = results
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      setRouletteAssertiveness(analysisResults);
    };

    monitorAllRoulettes();
    const interval = setInterval(monitorAllRoulettes, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, userInfo]);

  // ════════════════════════════════════════════════════════════
  // UI HANDLERS
  // ════════════════════════════════════════════════════════════

  const handleNumberClick = useCallback((number) => { setPopupNumber(number); setIsPopupOpen(true); }, []);
  const closePopup = useCallback(() => { setIsPopupOpen(false); setPopupNumber(null); }, []);

  const handleResultBoxClick = useCallback((e, result) => {
    if (window.innerWidth <= 1024) {
      e.preventDefault();
      const tooltipTitle = formatPullTooltip(result.number, numberPullStats, numberPreviousStats);
      const rect = e.currentTarget.getBoundingClientRect(); const x = rect.left + (rect.width / 2);
      let y = rect.top - 10; let isBelow = false; if (y < 100) { y = rect.bottom + 10; isBelow = true; }
      setMobileTooltip(prev => (prev.visible && prev.content === tooltipTitle) ? { visible: false, content: '', x: 0, y: 0, isBelow: false } : { visible: true, content: tooltipTitle, x, y, isBelow });
    } else { handleNumberClick(result.number); }
  }, [numberPullStats, numberPreviousStats, handleNumberClick]);

  const closeMobileTooltip = useCallback(() => setMobileTooltip({ visible: false, content: '', x: 0, y: 0, isBelow: false }), []);

  const handleRouletteChange = useCallback((e) => {
    clearHistory();
    setSelectedRoulette(e.target.value);
    resetGame();
  }, [clearHistory, resetGame]);

  // ════════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ════════════════════════════════════════════════════════════

  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    const occurrences = []; filteredSpinHistory.forEach((spin, index) => { if (spin.number === popupNumber) occurrences.push({ index }); });
    const count = occurrences.length; const historyCount = filteredSpinHistory.length;
    const nextOccurrences = occurrences.slice(0, 5).map(occ => ({ spinsAgo: occ.index + 1, prevSpins: filteredSpinHistory.slice(occ.index + 1, occ.index + 6).map(s => s.number) }));
    return { count, frequency: historyCount > 0 ? ((count / historyCount) * 100).toFixed(2) : '0.00', nextOccurrences, historyFilter: historyCount, lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null };
  }, [popupNumber, isPopupOpen, filteredSpinHistory]);

  const gameIframeComponent = useMemo(() => !gameUrl ? null : (
    <GameIframe url={gameUrl} onError={handleIframeError} onRetry={retryFromError} />
  ), [gameUrl, handleIframeError, retryFromError]);

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  if (checkingAuth) return <div className="loading-screen"><div className="loading-spinner-large"></div><p>Carregando...</p></div>;
  if (!isAuthenticated) return <Login onLoginSuccess={handleLoginSuccess} setIsPaywallOpen={setIsPaywallOpen} setCheckoutUrl={setCheckoutUrl} />;

  return (
    <div className="app-root">
      {mobileTooltip.visible && (<><div className="tooltip-backdrop" onClick={closeMobileTooltip} /><div className="mobile-tooltip" style={{ position: 'fixed', top: mobileTooltip.y, left: mobileTooltip.x, transform: mobileTooltip.isBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)', zIndex: 2000 }}>{mobileTooltip.content.split('\n').map((line, i) => <span key={i} className="tooltip-line">{line}</span>)}</div></>)}

      {/* ═══════════════════════════════════════════
          NAVBAR — Command bar com seletores integrados
          ═══════════════════════════════════════════ */}
      <nav className="navbar">
        {/* Esquerda: Tabs */}
        <div className="navbar-left">
          <button className={`navbar-tab ${activeView === 'dashboard' ? 'navbar-tab--active' : ''}`} onClick={() => setActiveView('dashboard')}>
            <BarChart3 size={16} /><span className="navbar-tab-text">Dashboard</span>
          </button>
          <button className={`navbar-tab ${activeView === 'triggers' ? 'navbar-tab--active' : ''}`} onClick={() => setActiveView('triggers')}>
            <Crosshair size={16} /><span className="navbar-tab-text">Gatilhos</span>
          </button>
        </div>

        {/* Centro: Seletores + Launch + Badge */}
        <div className="navbar-center">
          <div className="navbar-selector-group">
            <select className="navbar-select" value={selectedRoulette} onChange={handleRouletteChange}>
              {Object.keys(ROULETTE_SOURCES).map(key => (
                <option key={key} value={key}>{ROULETTE_SOURCES[key]}</option>
              ))}
            </select>
          </div>

          <div className="navbar-selector-group">
            <select className="navbar-select navbar-select--small" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              {FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleLaunchGame(0)}
            disabled={isLaunching || !ROULETTE_GAME_IDS[selectedRoulette]}
            className="navbar-launch-btn"
          >
            {isLaunching
              ? <><div className="spinner"></div><span className="navbar-launch-text">{isRetrying ? `${retryCount}/3...` : '...'}</span></>
              : <><PlayCircle size={14} /><span className="navbar-launch-text">{gameUrl ? 'Reiniciar' : 'Iniciar'}</span></>
            }
          </button>

          <div className="navbar-signal-badge">
            <span className="navbar-signal-count">{filteredSpinHistory.length}</span>
            <span className="navbar-signal-label">sinais</span>
          </div>
        </div>

        {/* Direita: Plataforma + Logout */}
        <div className="navbar-right">
          <a href="https://betou.bet.br/" target="_blank" rel="noopener noreferrer" className="nav-btn">
            PLATAFORMA<img src={W600} alt="Logo" style={{ height: "13px", marginLeft: "4px" }} />
          </a>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Barra de erro abaixo da navbar */}
      {launchError && (
        <div className="navbar-error-bar">
          <span className="navbar-error-text">{launchError}</span>
          {failureType === LAUNCH_FAILURE.PAYWALL && (
            <button onClick={() => { setCheckoutUrl(game?.checkoutUrl || ''); setIsPaywallOpen(true); }} className="navbar-error-action">💳 Renovar</button>
          )}
          {failureType === LAUNCH_FAILURE.FORBIDDEN && (
            <button onClick={handleLogout} className="navbar-error-action">🔄 Re-login</button>
          )}
          {(failureType === LAUNCH_FAILURE.SERVER_ERROR || failureType === LAUNCH_FAILURE.NETWORK_ERROR) && !isRetrying && (
            <button onClick={retryFromError} className="navbar-error-action">🔄 Tentar</button>
          )}
          {isRetrying && (
            <button onClick={cancelRetry} className="navbar-error-action navbar-error-action--cancel">✕ Cancelar</button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          DASHBOARD VIEW
          ═══════════════════════════════════════════ */}
      {activeView === 'dashboard' && (
      <main className="app-container">

        {/* Sidebar Esquerda — Apenas MasterDashboard */}
        <aside className="stats-dashboard">
          <div className="master-dashboard-wrapper">
            {stats.historyFilter >= 20
              ? <MasterDashboard spinHistory={filteredSpinHistory} onSignalUpdate={setEntrySignals} />
              : <div className="waiting-card">Aguardando {20 - stats.historyFilter} spins para o Painel Master...</div>
            }
          </div>
        </aside>

        <div className="racetrack-mobile-only"><RacingTrack selectedResult={selectedResult} onNumberClick={handleNumberClick} entrySignals={entrySignals.expanded} targetSignals={entrySignals.targets} /></div>

        {/* Centro — Jogo + Racetrack */}
        <section className="main-content">
          <div className="game-area">
            {gameIframeComponent}
            <div className="racetrack-desktop-only"><RacingTrack selectedResult={selectedResult} onNumberClick={handleNumberClick} entrySignals={entrySignals.expanded} targetSignals={entrySignals.targets} /></div>
          </div>
        </section>

        {/* Sidebar Direita — Análise */}
        <aside className="analysis-panel">
          {stats.historyFilter >= 20 ? (<>
            <div className="results-section">
              <h4 className="section-title"><Clock size={20} /> Últimos Resultados (100)</h4>
              <div className="color-frequencies">
                <span className="freq-item">Vermelho: <strong className="red">{stats.colorFrequencies.red}%</strong></span>
                <span className="freq-item">Zero: <strong className="green">{stats.colorFrequencies.green}%</strong></span>
                <span className="freq-item">Preto: <strong className="black">{stats.colorFrequencies.black}%</strong></span>
              </div>
              <div className='latest-results'><ResultsGrid latestNumbers={stats.latestNumbers} numberPullStats={numberPullStats} numberPreviousStats={numberPreviousStats} onResultClick={handleResultBoxClick} /></div>
            </div>
            <div><DeepAnalysisPanel spinHistory={filteredSpinHistory} setIsPaywallOpen={setIsPaywallOpen} cercoOptions={{ enablePreFormation: true, enableFrequencyAnalysis: true, enableCandidateTracking: true, lookbackWindow: 50, maxVisibleAlerts: 3 }} /></div>
          </>) : <div className="waiting-panel"><div className="waiting-card">Aguardando {50 - stats.historyFilter} spins para iniciar o Painel de Análise...</div></div>}
        </aside>
      </main>
      )}

      {/* ═══════════════════════════════════════════
          TRIGGERS VIEW
          ═══════════════════════════════════════════ */}
      {activeView === 'triggers' && (
        <TriggersPage
          filteredSpinHistory={filteredSpinHistory}
          gameIframeComponent={gameIframeComponent}
        />
      )}

      <PaywallModal isOpen={isPaywallOpen} onClose={() => { setIsPaywallOpen(false); handleLogout(); }} userId={userInfo?.email} checkoutUrl={checkoutUrl} />
      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </div>
  );
};

export default App;