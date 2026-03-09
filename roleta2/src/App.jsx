// src/App.jsx
// ════════════════════════════════════════════════
// Orquestrador principal — conecta hooks e renderiza layout.
// Toda lógica pesada vive nos hooks e services.
// ════════════════════════════════════════════════

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart3, Clock, Layers, LogOut, PlayCircle, Filter } from 'lucide-react';

// ── Constants ─────────────────────────────────
import {
  ROULETTE_SOURCES, ROULETTE_GAME_IDS, FILTER_OPTIONS,
  DEFAULT_ROULETTE, getNumberColor,
} from './constants/roulette';

// ── Hooks ─────────────────────────────────────
import { useAuth }               from './hooks/useAuth';
import { useSpinHistory }        from './hooks/useSpinHistory';
import { usePullStats }          from './hooks/usePullStats';
import { useGameLauncher }       from './hooks/useGameLauncher';
import { useInactivityTimeout }  from './hooks/useInactivityTimeout';

// ── Components ────────────────────────────────
import Login              from './components/auth/Login';
import GameIframe         from './components/game/GameIframe';
import NumberStatsPopup   from './components/common/NumberStatsPopup';
import PaywallModal       from './components/PaywallModal';
import MasterDashboard    from './pages/MasterDashboard';
import RacingTrack        from './components/RacingTrack';
import DeepAnalysisPanel  from './components/DeepAnalysisPanel';
import ResultsGrid        from './components/ResultGrid';

// ── Styles ────────────────────────────────────
import './components/PaywallModal.css';
import './components/NotificationsCenter.css';
import './App.modules.css';
import './index.css';
import W600 from './assets/w=600.svg';

// ── Helpers ───────────────────────────────────
const formatPullTooltip = (number, pullStats, previousStats) => {
  const fmt = (map) => {
    if (!map || map.size === 0) return '(Nenhum)';
    const keys = [...map.keys()].slice(0, 5);
    return keys.join(', ') + (map.size > 5 ? ', ...' : '');
  };
  return `Número: ${number}\nPuxou: ${fmt(pullStats?.get(number))}\nVeio Antes: ${fmt(previousStats?.get(number))}`;
};

// ════════════════════════════════════════════════
const App = () => {
  // ── State via hooks ──
  const auth = useAuth();
  const [selectedRoulette, setSelectedRoulette] = useState(DEFAULT_ROULETTE);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');

  const { spinHistory, selectedResult } = useSpinHistory(
    selectedRoulette, auth.userInfo?.email, auth.jwtToken, auth.isAuthenticated
  );

  const game = useGameLauncher(selectedRoulette, auth.jwtToken, auth.isAuthenticated);
  const { numberPullStats, numberPreviousStats } = usePullStats(spinHistory);

  useInactivityTimeout(
    !!(game.gameUrl && auth.isAuthenticated),
    auth.handleLogout
  );

  // ── UI state local ──
  const [entrySignals, setEntrySignals] = useState([]);
  const [historyFilter, setHistoryFilter] = useState(FILTER_OPTIONS[1].value);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [mobileTooltip, setMobileTooltip] = useState({ visible: false, content: '', x: 0, y: 0, isBelow: false });

  // ── Paywall event listener (vindo do useSpinHistory) ──
  useEffect(() => {
    const handler = (e) => {
      setCheckoutUrl(e.detail.checkoutUrl || '');
      setIsPaywallOpen(true);
    };
    window.addEventListener('paywall-required', handler);
    return () => window.removeEventListener('paywall-required', handler);
  }, []);

  // ── Computed ──
  const filteredSpinHistory = useMemo(
    () => historyFilter === 'all' ? spinHistory : spinHistory.slice(0, Number(historyFilter)),
    [spinHistory, historyFilter]
  );

  const stats = useMemo(() => {
    const len = filteredSpinHistory.length;
    if (len === 0) return { historyFilter: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };
    const counts = filteredSpinHistory.reduce((acc, s) => { acc[s.color] = (acc[s.color] || 0) + 1; return acc; }, {});
    return {
      historyFilter: len,
      colorFrequencies: {
        red:   ((counts.red || 0) / len * 100).toFixed(1),
        black: ((counts.black || 0) / len * 100).toFixed(1),
        green: ((counts.green || 0) / len * 100).toFixed(1),
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [filteredSpinHistory, spinHistory]);

  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    const occurrences = [];
    filteredSpinHistory.forEach((spin, i) => { if (spin.number === popupNumber) occurrences.push({ index: i }); });
    const count = occurrences.length;
    const len = filteredSpinHistory.length;
    const nextOccurrences = occurrences.slice(0, 5).map(occ => ({
      spinsAgo: occ.index + 1,
      prevSpins: filteredSpinHistory.slice(occ.index + 1, occ.index + 6).map(s => s.number),
    }));
    return { count, frequency: len > 0 ? ((count / len) * 100).toFixed(2) : '0.00', nextOccurrences, historyFilter: len, lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null };
  }, [popupNumber, isPopupOpen, filteredSpinHistory]);

  // ── Handlers ──
  const handleNumberClick = useCallback((n) => { setPopupNumber(n); setIsPopupOpen(true); }, []);
  const closePopup = useCallback(() => { setIsPopupOpen(false); setPopupNumber(null); }, []);
  const closeMobileTooltip = useCallback(() => setMobileTooltip({ visible: false, content: '', x: 0, y: 0, isBelow: false }), []);

  const handleResultBoxClick = useCallback((e, result) => {
    if (window.innerWidth <= 1024) {
      e.preventDefault();
      const content = formatPullTooltip(result.number, numberPullStats, numberPreviousStats);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      let y = rect.top - 10;
      let isBelow = false;
      if (y < 100) { y = rect.bottom + 10; isBelow = true; }
      setMobileTooltip(prev => (prev.visible && prev.content === content) ? { visible: false, content: '', x: 0, y: 0, isBelow: false } : { visible: true, content, x, y, isBelow });
    } else {
      handleNumberClick(result.number);
    }
  }, [numberPullStats, numberPreviousStats, handleNumberClick]);

  const handleRouletteChange = useCallback((e) => {
    setSelectedRoulette(e.target.value);
    game.resetGame();
  }, [game]);

  // ── Game iframe memo ──
  const gameIframe = useMemo(
    () => game.gameUrl ? <GameIframe url={game.gameUrl} onError={game.handleIframeError} /> : null,
    [game.gameUrl, game.handleIframeError]
  );

  // ── Guards ──
  if (auth.checkingAuth) return <div className="loading-screen"><div className="loading-spinner-large" /><p>Carregando...</p></div>;
  if (!auth.isAuthenticated) return <Login onLoginSuccess={auth.handleLoginSuccess} setIsPaywallOpen={setIsPaywallOpen} setCheckoutUrl={setCheckoutUrl} />;

  // ── Render ──
  return (
    <div className="app-root">
      {/* Mobile Tooltip */}
      {mobileTooltip.visible && (
        <>
          <div className="tooltip-backdrop" onClick={closeMobileTooltip} />
          <div className="mobile-tooltip" style={{ position: 'fixed', top: mobileTooltip.y, left: mobileTooltip.x, transform: mobileTooltip.isBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)', zIndex: 2000 }}>
            {mobileTooltip.content.split('\n').map((line, i) => <span key={i} className="tooltip-line">{line}</span>)}
          </div>
        </>
      )}

      {/* Iframe Error Overlay */}
      {game.iframeError && (
        <div className="iframe-error-overlay">
          <div className="iframe-error-content">
            <p>⚠️ Erro de renderização detectado</p>
            <button onClick={() => { game.resetGame(); game.setIframeError(false); window.location.reload(); }}>Recarregar Página</button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-left" />
        <div className="navbar-right">
          <a href="https://betou.bet.br/" target="_blank" rel="noopener noreferrer" className="nav-btn">
            ENTRE NA PLATAFORMA<img src={W600} alt="Logo" style={{ height: '15px' }} /><span className="nav-btn-text" />
          </a>
          <button onClick={auth.handleLogout} className="logout-btn"><LogOut size={18} /><span className="logout-btn-text">Sair</span></button>
        </div>
      </nav>

      <main className="app-container">
        {/* Sidebar Esquerda */}
        <aside className="stats-dashboard">
          <h3 className="dashboard-title">Estatísticas e Ações</h3>
          <div className="selectors-card">
            <div className="selectors-grid">
              <div className="selector-group">
                <h4 className="selector-label"><Layers size={15} /> Roletas</h4>
                <select className="roulette-selector" value={selectedRoulette} onChange={handleRouletteChange}>
                  {Object.keys(ROULETTE_SOURCES).map(key => <option key={key} value={key}>{ROULETTE_SOURCES[key]}</option>)}
                </select>
              </div>
              <div className="selector-group">
                <h4 className="selector-label"><Filter size={15} /> Rodadas</h4>
                <select className="roulette-selector" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                  {FILTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <button onClick={game.handleLaunchGame} disabled={game.isLaunching || !ROULETTE_GAME_IDS[selectedRoulette]} className="launch-button">
              {game.isLaunching ? <><div className="spinner" />Iniciando...</> : <><PlayCircle size={20} />{game.gameUrl ? `Reiniciar ${ROULETTE_SOURCES[selectedRoulette]}` : `Iniciar ${ROULETTE_SOURCES[selectedRoulette]}`}</>}
            </button>
            {game.launchError && <p className="launch-error">{game.launchError}</p>}
          </div>

          <div className="stats-card">
            <h4 className="stats-card-title"><BarChart3 size={18} /> Total de Sinais</h4>
            <p className="stats-card-value">{filteredSpinHistory.length}</p>
          </div>

          <div className="master-dashboard-wrapper">
            {stats.historyFilter >= 20
              ? <MasterDashboard spinHistory={filteredSpinHistory} onSignalUpdate={setEntrySignals} />
              : <div className="waiting-card">Aguardando {20 - stats.historyFilter} spins para o Painel Master...</div>
            }
          </div>
        </aside>

        {/* Racetrack Mobile */}
        <div className="racetrack-mobile-only">
          <RacingTrack selectedResult={selectedResult} onNumberClick={handleNumberClick} entrySignals={entrySignals} />
        </div>

        {/* Central */}
        <section className="main-content">
          <div className="game-area">
            {gameIframe}
            <div className="racetrack-desktop-only">
              <RacingTrack selectedResult={selectedResult} onNumberClick={handleNumberClick} entrySignals={entrySignals} />
            </div>
          </div>
        </section>

        {/* Sidebar Direita */}
        <aside className="analysis-panel">
          {stats.historyFilter >= 20 ? (
            <>
              <div className="results-section">
                <h4 className="section-title"><Clock size={20} /> Últimos Resultados (100)</h4>
                <div className="color-frequencies">
                  <span className="freq-item">Vermelho: <strong className="red">{stats.colorFrequencies.red}%</strong></span>
                  <span className="freq-item">Zero: <strong className="green">{stats.colorFrequencies.green}%</strong></span>
                  <span className="freq-item">Preto: <strong className="black">{stats.colorFrequencies.black}%</strong></span>
                </div>
                <div className="latest-results">
                  <ResultsGrid latestNumbers={stats.latestNumbers} numberPullStats={numberPullStats} numberPreviousStats={numberPreviousStats} onResultClick={handleResultBoxClick} />
                </div>
              </div>
              <DeepAnalysisPanel spinHistory={filteredSpinHistory} setIsPaywallOpen={setIsPaywallOpen} cercoOptions={{ enablePreFormation: true, enableFrequencyAnalysis: true, enableCandidateTracking: true, lookbackWindow: 50, maxVisibleAlerts: 3 }} />
            </>
          ) : (
            <div className="waiting-panel"><div className="waiting-card">Aguardando {50 - stats.historyFilter} spins para o Painel de Análise...</div></div>
          )}
        </aside>
      </main>

      {/* Modals */}
      <PaywallModal isOpen={isPaywallOpen} onClose={() => { setIsPaywallOpen(false); auth.handleLogout(); }} userId={auth.userInfo?.email} checkoutUrl={checkoutUrl} />
      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </div>
  );
};

export default App;