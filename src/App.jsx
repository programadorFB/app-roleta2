// App.jsx - MONITORAMENTO DE BACKGROUND ATIVO (SEM UI DE RANKING)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
    X, BarChart3, Clock, Hash, Percent, Layers, 
    LogOut, Lock, Mail, AlertCircle, PlayCircle, Filter
} from 'lucide-react';
import { io } from 'socket.io-client';
import PaywallModal from './components/PaywallModal.jsx'; 
import './components/PaywallModal.css';
import MasterDashboard from './pages/MasterDashboard.jsx';
import RacingTrack from './components/RacingTrack.jsx';
import DeepAnalysisPanel from './components/DeepAnalysisPanel.jsx';
import ResultsGrid from './components/ResultGrid.jsx';
// IMPORTANTE: Importamos a lógica da estratégia para rodar em background
import { calculateMasterScore } from './services/masterScoring.jsx'; 
import './components/NotificationsCenter.css';
import './App.modules.css';
import './index.css';
import W600 from "./assets/w=600.svg";

import { 
  processErrorResponse, 
  translateNetworkError, 
  displayError, 
  registerLogoutCallback,
  clearLogoutCallback
} from './errorHandler.js';

const API_URL = import.meta.env.VITE_API_URL || ''; 
const SOCKET_URL = "https://roleta-fuza.sortehub.online";

// === FUNÇÕES AUXILIARES ===
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

const ROULETTE_SOURCES = {
  brasilPlay: '🇧🇷  Brasileira - Playtech',
  aovivo: '🇧🇷 Roleta Brasileira  - Evolution',
  immersive: '🌟 Immersive Roulette - Evolution',
  viproulette: '💎 Vip Roulette - Evolution',
  xxxtreme: '⚡ XXXtreme Lightning - Evolution',
  speed: '💨 Speed Roulette - Evolution',
  vipauto: '🚘 Auto Roulette Vip - Evolution',
  vip: '💎 Roleta Vip - Evolution',
  lightning: '⚡ Lightning Roulette - Evolution',
  speedauto: '💨 Speed Auto Roulette - Evolution',
  relampago: '⚡ Roleta Relâmpago - Evolution',
  brasileira: '🇧🇷 Roleta Brasileira - Pragmatic',
  malta: '🇲🇹 Casino Malta Roulette - Evolution'
};

const ROULETTE_GAME_IDS = {
  auto: 120, vipauto: 31, bacbo: 54, malta: 80, footballstudio: 53,
  immersive: 55, lightning: 33, reddoor: 35, aovivo: 34,
  brasileira: 101, brasilPlay: 102, relampago: 81, speedauto: 82,
  speed: 36, viproulette: 32, xxxtreme: 83
};

const filterOptions = [
  { value: 50, label: 'Últimas 50 Rodadas' },
  { value: 100, label: 'Últimas 100 Rodadas' },
  { value: 300, label: 'Últimas 300 Rodadas' },
  { value: 500, label: 'Últimas 500 Rodadas' },
  { value: 1000, label: 'últimas 1000 Rodadas' },
  { value: 'all', label: 'Histórico Completo' }
];

// --- Helper de Tooltip ---
const formatPullTooltip = (number, pullStats, previousStats) => {
  const pullStatsMap = pullStats?.get(number);
  const prevStatsMap = previousStats?.get(number);

  let pullString = "(Nenhum)";
  if (pullStatsMap && pullStatsMap.size > 0) {
    const pulledNumbers = [...pullStatsMap.keys()].slice(0, 5);
    pullString = pulledNumbers.join(', ');
    if (pullStatsMap.size > 5) pullString += ', ...';
  }

  let prevString = "(Nenhum)";
  if (prevStatsMap && prevStatsMap.size > 0) {
    const prevNumbers = [...prevStatsMap.keys()].slice(0, 5);
    prevString = prevNumbers.join(', ');
    if (prevStatsMap.size > 5) prevString += ', ...';
  }

  return `Número: ${number}\nPuxou: ${pullString}\nVeio Antes: ${prevString}`;
};

// === LÓGICA DE EXTRAÇÃO DE ASSERTIVIDADE (BACKTEST) ===
// Esta função roda silenciosamente para calcular Win/Loss das estratégias
const runBacktest = (history) => {
    // Precisa de histórico suficiente
    if (!history || history.length < 60) return { wins: 0, losses: 0, accuracy: 0, signals: 0 };

    let wins = 0;
    let losses = 0;
    let signalsCount = 0;

    // Varre o histórico simulando o passado (limite para não pesar o browser)
    const checkLimit = Math.min(history.length - 55, 100); 

    for (let i = checkLimit; i >= 5; i--) { 
        // Pega fatia do histórico como se fosse o momento 'i'
        const pastHistoryState = history.slice(i, i + 55); 
        
        // Aplica as estratégias do MasterScoring nesse passado
        const analysis = calculateMasterScore(pastHistoryState);

        if (analysis?.entrySignal) {
            signalsCount++;
            const suggested = analysis.entrySignal.suggestedNumbers;
            const validFor = analysis.entrySignal.validFor || 3;

            // Verifica "Futuro" (se deu win nos spins seguintes)
            let isWin = false;
            for (let j = 1; j <= validFor; j++) {
                if (i - j < 0) break; 
                const resultNumber = history[i - j].number;
                if (suggested.includes(resultNumber)) {
                    isWin = true;
                    break;
                }
            }

            if (isWin) wins++;
            else losses++;
        }
    }

    const totalResolved = wins + losses;
    const accuracy = totalResolved > 0 ? ((wins / totalResolved) * 100).toFixed(0) : 0;

    return { wins, losses, accuracy, signals: totalResolved };
};

// === COMPONENTE LOGIN ===
const Login = ({ onLoginSuccess, setIsPaywallOpen, setCheckoutUrl }) => {
  const [formData, setFormData] = useState({ email: '', password: '', brand: 'betou' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.jwt) {
          localStorage.setItem('authToken', data.jwt);
          localStorage.setItem('userEmail', formData.email);
          localStorage.setItem('userBrand', formData.brand);
          onLoginSuccess(data);
        } else {
          displayError({ icon: '⚠️', message: 'Token não recebido.' }, setError);
        }
      } else {
        const errorInfo = await processErrorResponse(response, 'login');
        if (errorInfo.requiresPaywall) {
          setCheckoutUrl(errorInfo.checkoutUrl || '');
          setIsPaywallOpen(true);
        }
        displayError(errorInfo, setError, { showIcon: true });
      }
    } catch (err) {
      const errorInfo = translateNetworkError(err);
      displayError(errorInfo, setError, { showIcon: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">
              <Lock size={32} color="black" />
            </div>
            <h2 className="login-title">Bem-vindo</h2>
            <p className="login-subtitle">Essa ferramenta é integrada diretamente com uma casa de aposta.</p>
            <p className="login-subtitle">Faça o Login com sua conta aqui abaixo pra acessar</p>
          </div>
          
          {error && (
            <div className="login-error">
              <AlertCircle size={20} color="#ef4444" />
              <p>{error}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>E-mail plataforma</label>
              <div className="input-wrapper">
                <Mail size={20} className="input-icon" />
                <input 
                  type="email" 
                  name="email" 
                  value={formData.email} 
                  onChange={handleChange} 
                  placeholder="seu-email@gmail.com" 
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Senha plataforma</label>
              <div className="input-wrapper">
                <Lock size={20} className="input-icon" />
                <input 
                  type="password" 
                  name="password" 
                  value={formData.password} 
                  onChange={handleChange} 
                  placeholder="••••••••" 
                  required
                />
              </div>
            </div>
            
            <p className="register-link">
              Ainda não tem cadastro na plataforma?{" "}
              <a 
                href="https://go.aff.betou.bet.br/tgml0e19?utm_medium=appcmd"
                target="_blank"
                rel="noopener noreferrer"
              >
                Clique Aqui
              </a>
            </p>

            <button type="submit" disabled={loading} className="login-button">
              {loading ? (
                <span className="loading-spinner">
                  <div className="spinner"></div>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>

          <div className="login-footer">
            <p>Dashboard Analítico de Roleta</p>
          </div>
        </div>
        
        <div className="alert-banner" style={{ backgroundColor: '#fff3cd', borderLeft: '5px solid #ffc107', padding: '20px', marginBottom: '15px', marginTop: '15px', borderRadius: '4px', fontFamily: 'sans-serif' }}>
            <strong style={{ color: '#856404', display: 'block', marginBottom: '10px', fontSize: '1.1rem' }}>
                ⚠️ Atenção - Para liberar seu acesso:
            </strong>
            <p style={{ color: '#856404', margin: '0 0 10px 0' }}>
                Clica no link azul acima "Clique aqui" e faça o cadastro na plataforma, verifique seu email/número e finalize a 
                <strong> verificação facial</strong> (basta clicar em alguma Roleta como se fosse jogar).
            </p>
            <p style={{ color: '#856404', fontWeight: 'bold', margin: '0' }}>
                Após concluir, volte e faça seu login aqui.
            </p>
        </div>
      </div>
    </div>
  );
};

// === COMPONENTE GAME IFRAME ===
const GameIframe = React.memo(({ url, onError }) => {
  const wrapperRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    if (wrapperRef.current) {
      requestAnimationFrame(() => {
        wrapperRef.current.style.opacity = '0.99';
        requestAnimationFrame(() => {
          wrapperRef.current.style.opacity = '1';
        });
      });
    }
  }, []);

  return (
    <div ref={wrapperRef} className={`game-iframe-wrapper ${isLoaded ? 'loaded' : ''}`}>
      <iframe src={url} title="Jogo de Roleta" className="game-iframe" allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy" onLoad={handleLoad} onError={onError} />
    </div>
  );
});
GameIframe.displayName = 'GameIframe';

// === COMPONENTE NUMBER STATS POPUP ===
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
        <h3 className="next-spins-title">Últimas 5 Ocorrências (e 5 RODADAS ANTERIORES)</h3>
        <div className="next-spins-container">
          {stats.nextOccurrences.length > 0 ? (
            stats.nextOccurrences.map((occ, index) => (
              <div key={index} className="next-spins-card">
                <p className="next-spins-label">Ocorrência #{stats.count - index} ({occ.spinsAgo} spins atrás)</p>
                <div className="next-numbers-list">
                  {occ.prevSpins.length > 0 ? occ.prevSpins.map((num, i) => <span key={i} className={`next-number ${getNumberColor(num)}`}>{num}</span>) : <span className="no-data">Início do histórico</span>}
                </div>
              </div>
            ))
          ) : <p className="next-spins-none">O número {number} ainda não foi sorteado.</p>}
        </div>
        <button onClick={onClose} className="popup-footer-btn">Fechar</button>
      </div>
    </div>
  );
});
NumberStatsPopup.displayName = 'NumberStatsPopup';

// === HELPERS ===
const computePullStats = (history) => {
  const pullMap = new Map();
  for (let i = 0; i <= 36; i++) pullMap.set(i, new Map());
  for (let i = 1; i < history.length; i++) {
    const curr = history[i].number;
    const next = history[i - 1].number;
    const stats = pullMap.get(curr);
    stats.set(next, (stats.get(next) || 0) + 1);
  }
  return pullMap;
};

const computePreviousStats = (history) => {
  const prevMap = new Map();
  for (let i = 0; i <= 36; i++) prevMap.set(i, new Map());
  for (let i = 0; i < history.length - 1; i++) {
    const curr = history[i].number;
    const prev = history[i + 1].number;
    const stats = prevMap.get(curr);
    stats.set(prev, (stats.get(prev) || 0) + 1);
  }
  return prevMap;
};

// === COMPONENTE APP PRINCIPAL ===
const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  
  const [selectedRoulette, setSelectedRoulette] = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [spinHistory, setSpinHistory] = useState([]); 
  const [selectedResult, setSelectedResult] = useState(null);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [activePage] = useState('roulette');
  
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [iframeError, setIframeError] = useState(false);
  
  const [entrySignals, setEntrySignals] = useState([]);
  const [historyFilter, setHistoryFilter] = useState(filterOptions[1].value);
  const [mobileTooltip, setMobileTooltip] = useState({ visible: false, content: '', x: 0, y: 0, isBelow: false });
  const [numberPullStats, setNumberPullStats] = useState(() => new Map());
  const [numberPreviousStats, setNumberPreviousStats] = useState(() => new Map());

  // ESTADO GLOBAL DE ASSERTIVIDADE (Mantido em memória, mas não exibido)
  const [rouletteAssertiveness, setRouletteAssertiveness] = useState([]);

  const inactivityTimeoutRef = useRef(null);
  const hasLaunchedRef = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const email = localStorage.getItem('userEmail');
    const brand = localStorage.getItem('userBrand');
    if (token) {
      setIsAuthenticated(true);
      setJwtToken(token);
      setUserInfo({ email, brand });
    }
    setCheckingAuth(false);
  }, []);

  const handleLoginSuccess = useCallback((data) => {
    setIsAuthenticated(true);
    setJwtToken(data.jwt);
    setUserInfo({ email: localStorage.getItem('userEmail'), brand: localStorage.getItem('userBrand'), ...data });
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userBrand');
    setIsAuthenticated(false);
    setUserInfo(null);
    setJwtToken(null);
    setGameUrl('');
    hasLaunchedRef.current = false;
  }, []);

  useEffect(() => {
    registerLogoutCallback(handleLogout);
    return () => clearLogoutCallback();
  }, [handleLogout]);

  useEffect(() => {
    hasLaunchedRef.current = false;
  }, [selectedRoulette, isAuthenticated]);

  useEffect(() => {
    if (!gameUrl || !isAuthenticated) {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      return;
    }
    const INACTIVITY_LIMIT = 90 * 60 * 1000; 
    const resetInactivityTimer = () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = setTimeout(() => {
        handleLogout();
        alert('Sessão encerrada por inatividade. Faça login novamente.');
      }, INACTIVITY_LIMIT);
    };
    const handleActivity = () => resetInactivityTimer();
    resetInactivityTimer();
    window.addEventListener('blur', () => clearTimeout(inactivityTimeoutRef.current));
    window.addEventListener('focus', handleActivity);
    document.addEventListener('mousemove', handleActivity);
    document.addEventListener('keydown', handleActivity);
    document.addEventListener('touchstart', handleActivity);

    return () => {
      clearTimeout(inactivityTimeoutRef.current);
      document.removeEventListener('mousemove', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      document.removeEventListener('touchstart', handleActivity);
    };
  }, [gameUrl, isAuthenticated, handleLogout]);

  useEffect(() => {
    if (spinHistory.length === 0) return;
    const timeoutId = setTimeout(() => {
      const pullStats = computePullStats(spinHistory);
      const prevStats = computePreviousStats(spinHistory);
      setNumberPullStats(pullStats);
      setNumberPreviousStats(prevStats);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [spinHistory]);

  const handleIframeError = useCallback(() => setLaunchError('Erro ao carregar o iframe do jogo.'), []);

  const handleLaunchGame = useCallback(async () => {
    setIsLaunching(true);
    setLaunchError('');
    const gameId = ROULETTE_GAME_IDS[selectedRoulette];
    if (!gameId || !jwtToken) {
      setLaunchError('Erro interno: ID ou Token não encontrado.');
      setIsLaunching(false);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/start-game/${gameId}`, { 
        method: 'GET',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      const rawResponseText = await response.text();
      if (response.ok) {
        try {
          const data = JSON.parse(rawResponseText);
          let gameUrlFound = data?.launchOptions?.launch_options?.game_url || data?.launch_options?.game_url || data?.game_url || data?.url || data?.gameURL;
          if (!gameUrlFound) {
             const findGameUrl = (obj) => {
               for (let key in obj) {
                 if (key === 'game_url' && typeof obj[key] === 'string') return obj[key];
                 if (typeof obj[key] === 'object' && obj[key] !== null) {
                   const res = findGameUrl(obj[key]);
                   if (res) return res;
                 }
               }
               return null;
             };
             gameUrlFound = findGameUrl(data);
          }
          if (gameUrlFound) { setGameUrl(gameUrlFound); setLaunchError(''); }
          else setLaunchError('URL do jogo não encontrada.');
        } catch { setLaunchError('Resposta inválida da API.'); }
      } else {
        const errorInfo = await processErrorResponse(response, 'game');
        displayError(errorInfo, setLaunchError, { showIcon: true });
      }
    } catch (err) {
      const errorInfo = translateNetworkError(err);
      displayError(errorInfo, setLaunchError, { showIcon: true });
    } finally { setIsLaunching(false); }
  }, [selectedRoulette, jwtToken]);

  useEffect(() => {
    if (!hasLaunchedRef.current && isAuthenticated && jwtToken && !gameUrl && !isLaunching) {
      hasLaunchedRef.current = true;
      handleLaunchGame();
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

  // === MONITORAMENTO GLOBAL DE TODAS AS ROLETAS (BACKGROUND) ===
  // Calcula e armazena assertividade, mas NÃO EXIBE nada na interface
  useEffect(() => {
    if (!isAuthenticated || !userInfo?.email) return;

    const monitorAllRoulettes = async () => {
      const analysisResults = [];
      const sources = Object.keys(ROULETTE_SOURCES);

      for (const source of sources) {
        try {
          // Busca histórico para backtest
          const response = await fetch(`${API_URL}/api/latest?source=${source}&limit=100&userEmail=${encodeURIComponent(userInfo.email)}`);
          if (response.ok) {
            const data = await response.json();
            
            const history = Array.isArray(data) ? data.map(item => ({
                number: parseInt(item.signal || item.result, 10),
                color: getNumberColor(parseInt(item.signal || item.result, 10)),
                signalId: item.signalid || item.id,
                date: item.timestamp
            })) : [];

            if (history.length > 50) {
                // Roda o Backtest para extrair assertividade
                const stats = runBacktest(history);
                analysisResults.push({
                    key: source,
                    accuracy: Number(stats.accuracy),
                    wins: stats.wins,
                    losses: stats.losses,
                    signals: stats.signals
                });
            }
          }
        } catch (e) {
          console.warn(`[Background Monitor] Erro em ${source}:`, e);
        }
      }
      
      // Atualiza o estado apenas para manter os dados vivos
      setRouletteAssertiveness(analysisResults);
      // Se quiser debugar: console.log("Assertividade Atualizada:", analysisResults);
    };

    monitorAllRoulettes();
    const interval = setInterval(monitorAllRoulettes, 20000); // 20 segundos
    return () => clearInterval(interval);
  }, [isAuthenticated, userInfo]);

  // === FETCH POLLING DA ROLETA SELECIONADA ===
  const fetchHistory = useCallback(async () => {
    const currentRoulette = selectedRoulette;
    if (!userInfo?.email) return;
    try {
      const response = await fetch(`${API_URL}/api/full-history?source=${currentRoulette}&userEmail=${encodeURIComponent(userInfo.email)}`);
      if (currentRoulette !== selectedRoulette) return;
      if (!response.ok) {
        const errorInfo = await processErrorResponse(response, 'history');
        if (errorInfo.requiresPaywall || response.status === 403) {
          setCheckoutUrl(errorInfo.checkoutUrl || '');
          setIsPaywallOpen(true);
        }
        throw new Error(errorInfo.message);
      }
      const data = await response.json();
      setSpinHistory(prev => {
        if (data.length === 0) return prev;
        if (prev.length === 0) {
          return data.map(item => ({
            number: parseInt(item.signal, 10),
            color: getNumberColor(parseInt(item.signal, 10)),
            signal: item.signal, gameId: item.gameId, signalId: item.signalId, date: item.timestamp
          }));
        }
        const latestId = prev[0]?.signalId;
        const newItems = [];
        for (const item of data) {
          if (item.signalid === latestId) break;
          newItems.push({
            number: parseInt(item.signal, 10), color: getNumberColor(parseInt(item.signal, 10)),
            signal: item.signal, gameId: item.gameId, signalId: item.signalid, date: item.timestamp
          });
        }
        return newItems.length === 0 ? prev : [...newItems, ...prev];
      });
    } catch (error) { console.error("Erro fetchHistory:", error.message); }
  }, [selectedRoulette, userInfo]);

  useEffect(() => {
    if (!isAuthenticated || !userInfo) return;
    if (selectedRoulette === 'Brasileira PlayTech') return;
    fetchHistory();
    const intervalId = setInterval(fetchHistory, 2000);
    return () => clearInterval(intervalId);
  }, [fetchHistory, isAuthenticated, userInfo, selectedRoulette]);

  // SOCKET
  useEffect(() => {
    if (selectedRoulette !== 'Brasileira PlayTech') return;
    const socket = io(SOCKET_URL, { transports: ['websocket'], auth: { token: jwtToken, email: userInfo?.email } });
    fetch(`${SOCKET_URL}/api/full-history?source=Brasileira PlayTech&userEmail=${encodeURIComponent(userInfo?.email || '')}`)
      .then(res => res.json())
      .then(data => {
        const arr = (Array.isArray(data) ? data : data.data || []);
        setSpinHistory(arr.map(item => ({
          number: parseInt(item.signal, 10), color: getNumberColor(parseInt(item.signal, 10)),
          signal: item.signal, gameId: item.gameId, signalId: item.signalId, date: item.timestamp
        })));
      });
    socket.on('novo-giro', (payload) => {
      if (payload.source === 'Brasileira PlayTech') {
        const newSpin = {
            number: parseInt(payload.data.signal, 10), color: getNumberColor(parseInt(payload.data.signal, 10)),
            signal: payload.data.signal, gameId: payload.data.gameId, signalId: payload.data.signalId, date: payload.data.createdAt
        };
        setSpinHistory(prev => (prev.length > 0 && prev[0].signalId === newSpin.signalId) ? prev : [newSpin, ...prev].slice(0, 1000));
      }
    });
    return () => socket.disconnect();
  }, [selectedRoulette]);

  useEffect(() => {
    if (spinHistory.length > 0) setSelectedResult(spinHistory[0]);
    else setSelectedResult(null);
  }, [spinHistory]);

  const handleNumberClick = useCallback((number) => { setPopupNumber(number); setIsPopupOpen(true); }, []);
  const closePopup = useCallback(() => { setIsPopupOpen(false); setPopupNumber(null); }, []);
  
  const handleResultBoxClick = useCallback((e, result) => {
    if (window.innerWidth <= 1024) { 
      e.preventDefault();
      const tooltipTitle = formatPullTooltip(result.number, numberPullStats, numberPreviousStats);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = rect.left + (rect.width / 2);
      let y = rect.top - 10;
      let isBelow = false;
      if (y < 100) { y = rect.bottom + 10; isBelow = true; }
      setMobileTooltip(prev => (prev.visible && prev.content === tooltipTitle) ? { visible: false, content: '', x: 0, y: 0, isBelow: false } : { visible: true, content: tooltipTitle, x, y, isBelow });
    } else { handleNumberClick(result.number); }
  }, [numberPullStats, numberPreviousStats, handleNumberClick]);

  const closeMobileTooltip = useCallback(() => setMobileTooltip({ visible: false, content: '', x: 0, y: 0, isBelow: false }), []);

  const filteredSpinHistory = useMemo(() => historyFilter === 'all' ? spinHistory : spinHistory.slice(0, Number(historyFilter)), [spinHistory, historyFilter]);

  const stats = useMemo(() => {
    const historyCount = filteredSpinHistory.length;
    if (historyCount === 0) return { historyFilter: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };
    const counts = filteredSpinHistory.reduce((acc, curr) => { acc[curr.color] = (acc[curr.color] || 0) + 1; return acc; }, {});
    return {
      historyFilter: historyCount,
      colorFrequencies: {
        red: ((counts.red || 0) / historyCount * 100).toFixed(1),
        black: ((counts.black || 0) / historyCount * 100).toFixed(1),
        green: ((counts.green || 0) / historyCount * 100).toFixed(1)
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [filteredSpinHistory, spinHistory]);

  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    const occurrences = [];
    filteredSpinHistory.forEach((spin, index) => { if (spin.number === popupNumber) occurrences.push({ index }); });
    const count = occurrences.length;
    const historyCount = filteredSpinHistory.length;
    const nextOccurrences = occurrences.slice(0, 5).map(occ => ({ spinsAgo: occ.index + 1, prevSpins: filteredSpinHistory.slice(occ.index + 1, occ.index + 6).map(s => s.number) }));
    return { count, frequency: historyCount > 0 ? ((count / historyCount) * 100).toFixed(2) : '0.00', nextOccurrences, historyFilter: historyCount, lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null };
  }, [popupNumber, isPopupOpen, filteredSpinHistory]);

  const gameIframeComponent = useMemo(() => !gameUrl ? null : <GameIframe url={gameUrl} onError={handleIframeError} />, [gameUrl, handleIframeError]);

  if (checkingAuth) return <div className="loading-screen"><div className="loading-spinner-large"></div><p>Carregando...</p></div>;
  if (!isAuthenticated) return <Login onLoginSuccess={handleLoginSuccess} setIsPaywallOpen={setIsPaywallOpen} setCheckoutUrl={setCheckoutUrl} />;

  return (
    <div className="app-root">
      {mobileTooltip.visible && (
        <>
          <div className="tooltip-backdrop" onClick={closeMobileTooltip} />
          <div className="mobile-tooltip" style={{ position: 'fixed', top: mobileTooltip.y, left: mobileTooltip.x, transform: mobileTooltip.isBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)', zIndex: 2000 }}>
            {mobileTooltip.content.split('\n').map((line, index) => <span key={index} className="tooltip-line">{line}</span>)}
          </div>
        </>
      )}

      {iframeError && <div className="iframe-error-overlay"><div className="iframe-error-content"><p>⚠️ Erro de renderização detectado</p><button onClick={() => { setGameUrl(''); setIframeError(false); window.location.reload(); }}>Recarregar Página</button></div></div>}

      <nav className="navbar">
        <div className="navbar-left"></div>
        <div className="navbar-right">
          <a href="https://betou.bet.br/" target="_blank" rel="noopener noreferrer" className="nav-btn">ENTRE NA PLATAFORMA<img src={W600} alt="Logo" style={{ height: "15px" }} /><span className="nav-btn-text"></span></a>
          <button onClick={handleLogout} className="logout-btn"><LogOut size={18} /><span className="logout-btn-text">Sair</span></button>
        </div>
      </nav>

      <main className="app-container">
        <aside className="stats-dashboard">
          <h3 className="dashboard-title">Estatísticas e Ações</h3>
          <div className="selectors-card">
            <div className="selectors-grid">
              <div className="selector-group">
                <h4 className="selector-label"><Layers size={15} /> Roletas</h4>
                <select className="roulette-selector" value={selectedRoulette} onChange={(e) => { setSpinHistory([]); setSelectedResult(null); setSelectedRoulette(e.target.value); setLaunchError(''); setGameUrl(''); }}>
                  {Object.keys(ROULETTE_SOURCES).map(key => <option key={key} value={key}>{ROULETTE_SOURCES[key]}</option>)}
                </select>
              </div>
              <div className="selector-group">
                <h4 className="selector-label"><Filter size={15} /> Rodadas</h4>
                <select className="roulette-selector" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                  {filterOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleLaunchGame} disabled={isLaunching || !ROULETTE_GAME_IDS[selectedRoulette]} className="launch-button">
              {isLaunching ? <><div className="spinner"></div>Iniciando...</> : <><PlayCircle size={20} />{gameUrl ? `Reiniciar ${ROULETTE_SOURCES[selectedRoulette]}` : `Iniciar ${ROULETTE_SOURCES[selectedRoulette]}`}</>}
            </button>
            {launchError && <p className="launch-error">{launchError}</p>}
          </div>
          
          <div className="stats-card">
            <h4 className="stats-card-title"><BarChart3 size={18} /> Total de Sinais</h4>
            <p className="stats-card-value">{filteredSpinHistory.length}</p>
          </div>

          <div className="master-dashboard-wrapper">
            {stats.historyFilter >= 20 ? <MasterDashboard spinHistory={filteredSpinHistory} onSignalUpdate={setEntrySignals} /> : <div className="waiting-card">Aguardando {20 - stats.historyFilter} spins para o Painel Master...</div>}
          </div>

          {/* RANKING LATERAL FOI REMOVIDO AQUI, MAS O CÁLCULO ESTÁ ATIVO NO USEEFFECT ACIMA */}

        </aside>

        <div className="racetrack-mobile-only"><RacingTrack selectedResult={selectedResult} onNumberClick={handleNumberClick} entrySignals={entrySignals} /></div>

        <section className="main-content">
          <div className="game-area">
            {gameIframeComponent}
            <div className="racetrack-desktop-only"><RacingTrack selectedResult={selectedResult} onNumberClick={handleNumberClick} entrySignals={entrySignals} /></div>
          </div>
        </section>

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
                <div className='latest-results'><ResultsGrid latestNumbers={stats.latestNumbers} numberPullStats={numberPullStats} numberPreviousStats={numberPreviousStats} onResultClick={handleResultBoxClick} /></div>
              </div>
              <div><DeepAnalysisPanel spinHistory={filteredSpinHistory} setIsPaywallOpen={setIsPaywallOpen} cercoOptions={{ enablePreFormation: true, enableFrequencyAnalysis: true, enableCandidateTracking: true, lookbackWindow: 50, maxVisibleAlerts: 3 }} /></div>
            </>
          ) : <div className="waiting-panel"><div className="waiting-card">Aguardando {50 - stats.historyFilter} spins para iniciar o Painel de Análise...</div></div>}
        </aside>
      </main>

      <PaywallModal isOpen={isPaywallOpen} onClose={() => { setIsPaywallOpen(false); handleLogout(); }} userId={userInfo?.email} checkoutUrl={checkoutUrl} />
      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </div>
  );
};

export default App;