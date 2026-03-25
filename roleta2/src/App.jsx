import React, {
  useState, useMemo, useCallback, useEffect, lazy, Suspense,
} from 'react';
import {
  X, BarChart3, Clock, Hash, Percent, LogOut, PlayCircle, Crosshair, BookOpen, Headset, Wrench,
} from 'lucide-react';

import Login        from './components/Login.jsx';
import PaywallModal from './components/PaywallModal.jsx';
import './components/PaywallModal.css';
import './components/NotificationsCenter.css';
import './App.modules.css';
import './index.css';

import W600 from './assets/w=600.svg';
import { ROULETTE_SOURCES, ROULETTE_GAME_IDS, FILTER_OPTIONS } from './constants/roulette';
import { getNumberColor, formatPullTooltip } from './lib/roulette';
import { useAuth }               from './hooks/useAuth.js';
import { useGameLauncher, LAUNCH_FAILURE } from './hooks/useGameLauncher.js';
import { useSpinHistory }        from './hooks/useSpinHistory.js';
import { useInactivityTimeout }  from './hooks/useInactivityTimeout.js';
import { useAnalysisSocket }    from './hooks/useAnalysisSocket.js';

// Heavy components — carregados só quando necessários
const MasterDashboard   = lazy(() => import('./pages/MasterDashboard.jsx'));
const RacingTrack       = lazy(() => import('./components/RacingTrack.jsx'));
const DeepAnalysisPanel = lazy(() => import('./components/DeepAnalysisPanel.jsx'));
const ResultsGrid       = lazy(() => import('./components/ResultGrid.jsx'));
const GameIframe        = lazy(() => import('./components/GameIframe.jsx'));
const TriggersPage      = lazy(() => import('./pages/TriggersPage.jsx'));
const TutorialPage      = lazy(() => import('./pages/TutorialPage.jsx'));
const ToolsPage         = lazy(() => import('./pages/ToolsPage.jsx'));

const Spinner = () => <div className="loading-screen"><div className="loading-spinner-large" /></div>;

// ── NumberStatsPopup ──────────────────────────────────────────

const NumberStatsPopup = React.memo(({ isOpen, onClose, number, stats }) => {
  if (!isOpen || !stats) return null;
  const color = getNumberColor(number);
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="popup-close-btn"><X size={24} /></button>
        <div className="popup-header">
          <div className={`popup-number-icon ${color}`}>{number}</div>
          <h2 className="popup-title">Análise do Número {number} (em {stats.historyFilter} spins)</h2>
        </div>
        <div className="popup-stats-grid">
          <div className="info-card"><p className="info-label"><Hash size={18} /> Ocorrências:</p><p className="info-value">{stats.count} / {stats.historyFilter}</p></div>
          <div className="info-card"><p className="info-label"><Percent size={18} /> Frequência:</p><p className="info-value">{stats.frequency}%</p></div>
          <div className="info-card"><p className="info-label"><Clock size={18} /> Última Vez:</p><p className="info-value">{stats.lastHitAgo !== null ? `${stats.lastHitAgo} spins atrás` : 'Nunca'}</p></div>
          <div className="info-card"><p className="info-label">Cor:</p><p className={`info-value ${color}`}>{color.toUpperCase()}</p></div>
        </div>
        <h3 className="next-spins-title">Últimas 5 Ocorrências (e 5 rodadas anteriores)</h3>
        <div className="next-spins-container">
          {stats.nextOccurrences.length > 0
            ? stats.nextOccurrences.map((occ, i) => (
              <div key={i} className="next-spins-card">
                <p className="next-spins-label">Ocorrência #{stats.count - i} ({occ.spinsAgo} spins atrás)</p>
                <div className="next-numbers-list">
                  {occ.prevSpins.length > 0
                    ? occ.prevSpins.map((n, j) => <span key={j} className={`next-number ${getNumberColor(n)}`}>{n}</span>)
                    : <span className="no-data">Início do histórico</span>
                  }
                </div>
              </div>
            ))
            : <p className="next-spins-none">O número {number} ainda não foi sorteado.</p>
          }
        </div>
        <button onClick={onClose} className="popup-footer-btn">Fechar</button>
      </div>
    </div>
  );
});
NumberStatsPopup.displayName = 'NumberStatsPopup';

// ── App ───────────────────────────────────────────────────────

const App = () => {
  const { isAuthenticated, userInfo, checkingAuth, jwtToken, handleLoginSuccess, handleLogout } = useAuth();

  const [isPaywallOpen,   setIsPaywallOpen]   = useState(false);
  const [checkoutUrl,     setCheckoutUrl]     = useState('');
  const [selectedRoulette,     setSelectedRoulette]     = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [popupNumber,          setPopupNumber]          = useState(null);
  const [isPopupOpen,          setIsPopupOpen]          = useState(false);
  const [entrySignals,         setEntrySignals]         = useState({ targets: [], expanded: [] });
  const [historyFilter,        setHistoryFilter]        = useState(FILTER_OPTIONS[1].value);
  const [mobileTooltip,        setMobileTooltip]        = useState({ visible: false, content: '', x: 0, y: 0, isBelow: false });
  const [activeView,           setActiveView]           = useState('dashboard');

  // ── Paywall event bus ─────────────────────────────────────

  const handlePaywallRequired = useCallback((url) => {
    setCheckoutUrl(url || '');
    setIsPaywallOpen(true);
  }, []);

  useEffect(() => {
    const handler = (e) => { setCheckoutUrl(e.detail?.checkoutUrl || ''); setIsPaywallOpen(true); };
    window.addEventListener('paywall-required', handler);
    return () => window.removeEventListener('paywall-required', handler);
  }, []);

  // ── Hooks ─────────────────────────────────────────────────

  const {
    spinHistory, filteredSpinHistory, selectedResult,
    numberPullStats, numberPreviousStats, stats, clearHistory,
  } = useSpinHistory({
    selectedRoulette,
    userEmail:  userInfo?.email || '',
    jwtToken,
    isAuthenticated,
    historyFilter,
    onPaywallRequired: handlePaywallRequired,
  });


  const {
    isLaunching, launchError, gameUrl, failureType, checkoutUrl: gameCheckoutUrl,
    retryCount, isRetrying, handleLaunchGame, handleIframeError,
    retryFromError, cancelRetry, resetGame,
  } = useGameLauncher({
    selectedRoulette,
    jwtToken,
    isAuthenticated,
    userEmail: userInfo?.email || '',
  });

  useInactivityTimeout({
    isActive:  !!(gameUrl && isAuthenticated),
    onTimeout: handleLogout,
  });

  const { motorAnalysis, triggerAnalysis } = useAnalysisSocket({
    selectedRoulette,
    userEmail: userInfo?.email || '',
    jwtToken,
    isAuthenticated,
  });

  // ── UI handlers ───────────────────────────────────────────

  const handleNumberClick = useCallback((number) => {
    setPopupNumber(number);
    setIsPopupOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupNumber(null);
  }, []);

  const handleResultBoxClick = useCallback((e, result) => {
    if (window.innerWidth <= 1024) {
      e.preventDefault();
      const content = formatPullTooltip(result.number, numberPullStats, numberPreviousStats);
      const rect    = e.currentTarget.getBoundingClientRect();
      const x       = rect.left + rect.width / 2;
      const below   = rect.top < 100;
      const y       = below ? rect.bottom + 10 : rect.top - 10;
      setMobileTooltip(prev =>
        prev.visible && prev.content === content
          ? { visible: false, content: '', x: 0, y: 0, isBelow: false }
          : { visible: true, content, x, y, isBelow: below },
      );
    } else {
      handleNumberClick(result.number);
    }
  }, [numberPullStats, numberPreviousStats, handleNumberClick]);

  const closeMobileTooltip = useCallback(() =>
    setMobileTooltip({ visible: false, content: '', x: 0, y: 0, isBelow: false }),
  []);

  const handleRouletteChange = useCallback((e) => {
    clearHistory();
    setSelectedRoulette(e.target.value);
    resetGame();
  }, [clearHistory, resetGame]);

  const handleFilterChange = useCallback((e) => {
    setHistoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
  }, []);

  const setDashboard = useCallback(() => setActiveView('dashboard'), []);
  const setTriggers  = useCallback(() => setActiveView('triggers'),  []);
  const setTutorial  = useCallback(() => setActiveView('tutorial'),  []);
  const setTools     = useCallback(() => setActiveView('tools'),     []);

  // ── Computed ──────────────────────────────────────────────

  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    const occurrences = filteredSpinHistory.reduce((acc, spin, i) => {
      if (spin.number === popupNumber) acc.push(i);
      return acc;
    }, []);
    const count = occurrences.length;
    return {
      count,
      frequency:       filteredSpinHistory.length > 0 ? ((count / filteredSpinHistory.length) * 100).toFixed(2) : '0.00',
      nextOccurrences: occurrences.slice(0, 5).map(i => ({
        spinsAgo:  i + 1,
        prevSpins: filteredSpinHistory.slice(i + 1, i + 6).map(s => s.number),
      })),
      historyFilter: filteredSpinHistory.length,
      lastHitAgo:    occurrences.length > 0 ? occurrences[0] + 1 : null,
    };
  }, [popupNumber, isPopupOpen, filteredSpinHistory]);

  const gameIframeComponent = useMemo(() => !gameUrl ? null : (
    <Suspense fallback={<Spinner />}>
      <GameIframe url={gameUrl} onError={handleIframeError} onRetry={retryFromError} />
    </Suspense>
  ), [gameUrl, handleIframeError, retryFromError]);

  const racingTrackProps = {
    selectedResult,
    onNumberClick:  handleNumberClick,
    entrySignals:   entrySignals.expanded,
    targetSignals:  entrySignals.targets,
  };

  // ── Render ────────────────────────────────────────────────

  if (checkingAuth)     return <Spinner />;
  if (!isAuthenticated) return (
    <Login
      onLoginSuccess={handleLoginSuccess}
      setIsPaywallOpen={setIsPaywallOpen}
      setCheckoutUrl={setCheckoutUrl}
    />
  );

  return (
    <div className="app-root">

      {mobileTooltip.visible && (
        <>
          <div className="tooltip-backdrop" onClick={closeMobileTooltip} />
          <div
            className="mobile-tooltip"
            style={{
              position:  'fixed',
              top:       mobileTooltip.y,
              left:      mobileTooltip.x,
              transform: mobileTooltip.isBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              zIndex:    2000,
            }}
          >
            {mobileTooltip.content.split('\n').map((line, i) => (
              <span key={i} className="tooltip-line">{line}</span>
            ))}
          </div>
        </>
      )}

      <nav className="navbar">
        <div className="navbar-left">
          <button
            className={`navbar-tab ${activeView === 'dashboard' ? 'navbar-tab--active' : ''}`}
            onClick={setDashboard}
          >
            <BarChart3 size={16} /><span className="navbar-tab-text">Dashboard</span>
          </button>
          <button
            className={`navbar-tab ${activeView === 'triggers' ? 'navbar-tab--active' : ''}`}
            onClick={setTriggers}
          >
            <Crosshair size={16} /><span className="navbar-tab-text">Gatilhos</span>
          </button>
          <button
            className={`navbar-tab ${activeView === 'tutorial' ? 'navbar-tab--active' : ''}`}
            onClick={setTutorial}
          >
            <BookOpen size={16} /><span className="navbar-tab-text">Tutorial</span>
          </button>
          {/* <button
            className={`navbar-tab ${activeView === 'tools' ? 'navbar-tab--active' : ''}`}
            onClick={setTools}
          >
            <Wrench size={16} /><span className="navbar-tab-text">Ferramentas</span>
          </button> */}
        </div>

        <div className="navbar-center">
          <div className="navbar-selector-group">
            <select className="navbar-select" value={selectedRoulette} onChange={handleRouletteChange}>
              {Object.keys(ROULETTE_SOURCES).map(key => (
                <option key={key} value={key}>{ROULETTE_SOURCES[key]}</option>
              ))}
            </select>
          </div>

          <div className="navbar-selector-group">
            <select className="navbar-select navbar-select--small" value={historyFilter} onChange={handleFilterChange}>
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
              ? <><div className="spinner" /><span className="navbar-launch-text">{isRetrying ? `${retryCount}/3...` : '...'}</span></>
              : <><PlayCircle size={14} /><span className="navbar-launch-text">{gameUrl ? 'Reiniciar' : 'Iniciar'}</span></>
            }
          </button>

          <div className="navbar-signal-badge">
            <span className="navbar-signal-count">{filteredSpinHistory.length}</span>
            <span className="navbar-signal-label">sinais</span>
          </div>
        </div>

        <div className="navbar-right">
          <a href="https://betou.bet.br/" target="_blank" rel="noopener noreferrer" className="nav-btn">
            PLATAFORMA<img src={W600} alt="Logo" style={{ height: '13px', marginLeft: '4px' }} />
          </a>
          <a href="https://wa.me/5551981794138?text=Fala%20Fuza!%20Vim%20pela%20ferramenta%20e%20estou%20com%20d%C3%BAvidas..." target="_blank" rel="noopener noreferrer" className="support-btn" title="Suporte">
            <Headset size={14} />
            <span className="support-btn-text">SUPORTE</span>
          </a>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {launchError && (
        <div className="navbar-error-bar">
          <span className="navbar-error-text">{launchError}</span>
          {failureType === LAUNCH_FAILURE.PAYWALL && (
            <button
              onClick={() => { setCheckoutUrl(gameCheckoutUrl || ''); setIsPaywallOpen(true); }}
              className="navbar-error-action"
            >
              💳 Renovar
            </button>
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

      {activeView === 'dashboard' && (
        <main className="app-container">
          <aside className="stats-dashboard">
            <div className="master-dashboard-wrapper">
              {stats.historyFilter >= 20
                ? (
                  <Suspense fallback={<div className="waiting-card">Carregando painel...</div>}>
                    <MasterDashboard spinHistory={filteredSpinHistory} fullHistory={spinHistory} onSignalUpdate={setEntrySignals} backendMotorAnalysis={motorAnalysis} />
                  </Suspense>
                )
                : <div className="waiting-card">Aguardando {20 - stats.historyFilter} spins para o Painel Master...</div>
              }
            </div>
          </aside>

          <div className="racetrack-mobile-only">
            <Suspense fallback={null}>
              <RacingTrack {...racingTrackProps} />
            </Suspense>
          </div>

          <section className="main-content">
            <div className="game-area">
              {gameIframeComponent}
              <div className="racetrack-desktop-only">
                <Suspense fallback={null}>
                  <RacingTrack {...racingTrackProps} />
                </Suspense>
              </div>
            </div>
          </section>

          <aside className="analysis-panel">
            {stats.historyFilter >= 20 ? (
              <>
                <div className="results-section">
                  <h4 className="section-title"><Clock size={20} /> Resultados ({stats.historyFilter})</h4>
                  <div className="color-frequencies">
                    <span className="freq-item">Vermelho: <strong className="red">{stats.colorFrequencies.red}%</strong></span>
                    <span className="freq-item">Zero: <strong className="green">{stats.colorFrequencies.green}%</strong></span>
                    <span className="freq-item">Preto: <strong className="black">{stats.colorFrequencies.black}%</strong></span>
                  </div>
                  <div className="latest-results">
                    <Suspense fallback={null}>
                      <ResultsGrid
                        latestNumbers={filteredSpinHistory}
                        numberPullStats={numberPullStats}
                        numberPreviousStats={numberPreviousStats}
                        onResultClick={handleResultBoxClick}
                        forceCols={10}
                      />
                    </Suspense>
                  </div>
                </div>
                <Suspense fallback={null}>
                  <DeepAnalysisPanel
                    spinHistory={filteredSpinHistory}
                    setIsPaywallOpen={setIsPaywallOpen}
                    cercoOptions={{
                      enablePreFormation:      true,
                      enableFrequencyAnalysis: true,
                      enableCandidateTracking: true,
                      lookbackWindow:          50,
                      maxVisibleAlerts:        3,
                    }}
                  />
                </Suspense>
              </>
            ) : (
              <div className="waiting-panel">
                <div className="waiting-card">Aguardando {50 - stats.historyFilter} spins para o Painel de Análise...</div>
              </div>
            )}
          </aside>
        </main>
      )}

      {activeView === 'triggers' && (
        <Suspense fallback={<Spinner />}>
          <TriggersPage
            filteredSpinHistory={filteredSpinHistory}
            fullHistory={spinHistory}
            gameIframeComponent={gameIframeComponent}
            selectedResult={selectedResult}
            numberPullStats={numberPullStats}
            numberPreviousStats={numberPreviousStats}
            onResultClick={handleResultBoxClick}
            onNumberClick={handleNumberClick}
            backendTriggerAnalysis={triggerAnalysis}
          />
        </Suspense>
      )}

      {activeView === 'tutorial' && (
        <Suspense fallback={<Spinner />}>
          <TutorialPage />
        </Suspense>
      )}

      {activeView === 'tools' && (
        <Suspense fallback={<Spinner />}>
          <ToolsPage />
        </Suspense>
      )}

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => { setIsPaywallOpen(false); handleLogout(); }}
        userId={userInfo?.email}
        checkoutUrl={checkoutUrl}
      />
      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </div>
  );
};

export default App;
