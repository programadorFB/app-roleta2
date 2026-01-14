// App.jsx - VERSÃƒO FINAL OTIMIZADA (SEM RECARREGAMENTOS NO MOBILE)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
    X, BarChart3, Clock, Hash, Percent, Layers, 
    LogOut, Lock, Mail, AlertCircle, PlayCircle, Filter, ExternalLink
} from 'lucide-react';
import { io } from 'socket.io-client';
import PaywallModal from './components/PaywallModal.jsx'; 
import './components/PaywallModal.css';
import MasterDashboard from './pages/MasterDashboard.jsx';
import RacingTrack from './components/RacingTrack.jsx';
import DeepAnalysisPanel from './components/DeepAnalysisPanel.jsx';
import ResultsGrid from './components/ResultGrid.jsx';
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

// === FUNÃ‡Ã•ES AUXILIARES ===
const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

const ROULETTE_SOURCES = {
  immersive: '🌟 Immersive Roulette',
  brasileira: '🇧🇷 Roleta Brasileira',
  brasilPlay: '🎲 Brasileira Playtech !',
  speed: '💨 Speed Roulette',
  xxxtreme: '⚡ XXXtreme Lightning',
  vipauto: '🚘 Auto Roulette Vip',
  vip: '💎 Roleta Vip',
  lightning: '⚡ Lightning Roulette',
  aovivo: '🔴 Roleta ao Vivo',
  speedauto: '💨 Speed Auto Roulette',
  viproulette: '💎 Vip Roulette',
  relampago: '⚡ Roleta Relâmpago',
  malta: '🇲🇹 Casino Malta Roulette'
};


const ROULETTE_GAME_IDS = {
  auto: 120,
  vipauto: 31,
  bacbo: 54,
  malta: 80,
  footballstudio: 53,
  immersive: 55,
  lightning: 33,
  reddoor: 35,
  aovivo: 34,
  brasileira: 101,
  brasilPlay: 102,
  relampago: 81,
  speedauto: 82,
  speed: 36,
  viproulette: 32,
  xxxtreme: 83
};

const filterOptions = [
  { value: 100, label: 'Últimas 100 Rodadas' },
  { value: 300, label: 'Últimas 300 Rodadas' },
  { value: 500, label: 'Últimas 500 Rodadas' },
  { value: 1000, label: 'últimas 1000 Rodadas' },
  { value: 'all', label: 'Histórico Completo' }
];

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
              Ainda nÃ£o tem cadastro na plataforma?{" "}
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
            <p>Dashboard AnalÃ­tico de Roleta</p>
          </div>
        </div>
        
        <div className="alert-banner" style={{
            backgroundColor: '#fff3cd',
            borderLeft: '5px solid #ffc107',
            padding: '20px',
            marginBottom: '15px',
            marginTop: '15px',
            borderRadius: '4px',
            fontFamily: 'sans-serif'
        }}>
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

        <div className="terms-container" style={{
            marginTop: '20px',
            padding: '15px',
            borderTop: '1px solid #e0e0e0',
            textAlign: 'center'
        }}>
            <p className="terms-text" style={{
                fontSize: '0.85rem',
                color: '#666',
                fontWeight: '600',
                letterSpacing: '0.5px'
            }}>
                ⚠️ Ao fazer login, você concorda com nossos 
                <span style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}> Termos de Uso</span>
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
    <div 
      ref={wrapperRef}
      className={`game-iframe-wrapper ${isLoaded ? 'loaded' : ''}`}
    >
      <iframe 
        src={url} 
        title="Jogo de Roleta" 
        className="game-iframe"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
        onLoad={handleLoad}
        onError={onError}
      />
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
        <button onClick={onClose} className="popup-close-btn">
          <X size={24} />
        </button>
        <div className="popup-header">
          <div className={`popup-number-icon ${color}`}>{number}</div>
          <h2 className="popup-title">AnÃ¡lise do NÃºmero {number} (em {stats.historyFilter} spins)</h2>
        </div>
        <div className="popup-stats-grid">
          <div className="info-card">
            <p className="info-label"><Hash size={18} /> Ocorrências:</p>
            <p className="info-value">{stats.count} / {stats.historyFilter}</p>
          </div>
          <div className="info-card">
            <p className="info-label"><Percent size={18} /> Frequência:</p>
            <p className="info-value">{stats.frequency}%</p>
          </div>
          <div className="info-card">
            <p className="info-label"><Clock size={18} /> Última Vez:</p>
            <p className="info-value">{stats.lastHitAgo !== null ? `${stats.lastHitAgo} spins atrás` : 'Nunca'}</p>
          </div>
          <div className="info-card">
            <p className="info-label">Cor:</p>
            <p className={`info-value ${color}`}>{color.toUpperCase()}</p>
          </div>
        </div>
        <h3 className="next-spins-title">Últimas 5 Ocorrências (e 5 RODADAS ANTERIORES)</h3>
        <div className="next-spins-container">
          {stats.nextOccurrences.length > 0 ? (
            stats.nextOccurrences.map((occ, index) => (
              <div key={index} className="next-spins-card">
                <p className="next-spins-label">Ocorrência #{stats.count - index} ({occ.spinsAgo} spins atrás)</p>
                <div className="next-numbers-list">
                  {occ.prevSpins.length > 0 ? occ.prevSpins.map((num, i) => (
                    <span key={i} className={`next-number ${getNumberColor(num)}`}>
                      {num}
                    </span>
                  )) : <span className="no-data">Início do histórico</span>}
                </div>
              </div>
            ))
          ) : (
            <p className="next-spins-none">O número {number} ainda não foi sorteado.</p>
          )}
        </div>
        <button onClick={onClose} className="popup-footer-btn">Fechar</button>
      </div>
    </div>
  );
});

NumberStatsPopup.displayName = 'NumberStatsPopup';

// === HELPERS PARA CÃLCULOS ===
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

// === COMPONENTE PRINCIPAL APP ===
const App = () => {
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  
  // App States
  const [selectedRoulette, setSelectedRoulette] = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [spinHistory, setSpinHistory] = useState([]); 
  const [selectedResult, setSelectedResult] = useState(null);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [activePage] = useState('roulette');
  
  // Game States
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [iframeError, setIframeError] = useState(false);
  
  const [entrySignals, setEntrySignals] = useState([]);
  const [historyFilter, setHistoryFilter] = useState(filterOptions[0].value);

  // Mobile Tooltip State
  const [mobileTooltip, setMobileTooltip] = useState({
    visible: false,
    content: '',
    x: 0,
    y: 0,
    isBelow: false
  });

  // Pull stats calculados em idle
  const [numberPullStats, setNumberPullStats] = useState(() => new Map());
  const [numberPreviousStats, setNumberPreviousStats] = useState(() => new Map());

  // Inactivity timeout ref
  const inactivityTimeoutRef = useRef(null);

  // Ref para impedir mÃºltiplos auto-launches
  const hasLaunchedRef = useRef(false);

  // Check Auth
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

  // Login Handler
  const handleLoginSuccess = useCallback((data) => {
    setIsAuthenticated(true);
    setJwtToken(data.jwt);
    setUserInfo({
      email: localStorage.getItem('userEmail'),
      brand: localStorage.getItem('userBrand'),
      ...data
    });
  }, []);

  // Logout Handler
  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userBrand');
    setIsAuthenticated(false);
    setUserInfo(null);
    setJwtToken(null);
    setGameUrl('');
    // reset auto-launch guard ao deslogar
    hasLaunchedRef.current = false;
  }, []);

  // Registrar logout callback
  useEffect(() => {
    registerLogoutCallback(handleLogout);
    return () => clearLogoutCallback();
  }, [handleLogout]);

  // Reset do hasLaunchedRef quando roleta muda (permite re-auto-launch se desejar)
  useEffect(() => {
    hasLaunchedRef.current = false;
  }, [selectedRoulette, isAuthenticated]);

  // Monitor inatividade do iframe - logout apÃ³s 15 minutos com aba em foco
  useEffect(() => {
    if (!gameUrl || !isAuthenticated) {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      return;
    }

    const INACTIVITY_LIMIT = 90 * 60 * 1000; 

    const resetInactivityTimer = () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      
      inactivityTimeoutRef.current = setTimeout(() => {
        console.log('Usuário inativo por 15 minutos (com aba em foco) - executando logout');
        handleLogout();
        alert('Sessão encerrada por inatividade. Faça login novamente.');
      }, INACTIVITY_LIMIT);
    };

    const handleWindowBlur = () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
    
    const handleWindowFocus = () => resetInactivityTimer();
    const handlePageActivity = () => resetInactivityTimer();

    resetInactivityTimer(); 

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('mousemove', handlePageActivity, { passive: true });
    document.addEventListener('mousedown', handlePageActivity, { passive: true });
    document.addEventListener('keydown', handlePageActivity, { passive: true });
    document.addEventListener('touchstart', handlePageActivity, { passive: true });

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('mousemove', handlePageActivity);
      document.removeEventListener('mousedown', handlePageActivity);
      document.removeEventListener('keydown', handlePageActivity);
      document.removeEventListener('touchstart', handlePageActivity);
    };
  }, [gameUrl, isAuthenticated, handleLogout]);

  // Calcular pull stats de forma otimizada
  useEffect(() => {
    if (spinHistory.length === 0) return;

    // Debounce para evitar cálculos excessivos
    const timeoutId = setTimeout(() => {
      const pullStats = computePullStats(spinHistory);
      const prevStats = computePreviousStats(spinHistory);
      setNumberPullStats(pullStats);
      setNumberPreviousStats(prevStats);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [spinHistory]);

  // CORREÃ‡ÃƒO: FunÃ§Ã£o de Erro do Iframe Memorizada (ESTÃVEL)
  const handleIframeError = useCallback(() => {
      setLaunchError('Erro ao carregar o iframe do jogo.');
  }, []);

  // Launch Game Handler
  const handleLaunchGame = useCallback(async () => {
    setIsLaunching(true);
    setLaunchError('');
    const gameId = ROULETTE_GAME_IDS[selectedRoulette];
    
    if (!gameId || !jwtToken) {
      setLaunchError('Erro interno: ID do jogo ou Token nÃ£o encontrado.');
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
          const apiErrorMessage = data?.original?.message || data?.message;
          
          if ((data?.original?.status === 'error' || data?.status === 'error') && apiErrorMessage) {
            if (apiErrorMessage.includes('Failed to request Softswiss Url')) {
              setLaunchError('Problemas com a provedora Evolution. Tente novamente.');
            } else {
              setLaunchError(`Erro da API: ${apiErrorMessage.substring(0, 100)}...`);
            }
            return;
          }
  
          let gameUrlFound = data?.launchOptions?.launch_options?.game_url
            || data?.launch_options?.game_url
            || data?.game_url
            || data?.url
            || data?.gameURL;
          
          if (!gameUrlFound) {
            const findGameUrl = (obj) => {
              for (let key in obj) {
                if (key === 'game_url' && typeof obj[key] === 'string') return obj[key];
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                  const result = findGameUrl(obj[key]);
                  if (result) return result;
                }
              }
              return null;
            };
            gameUrlFound = findGameUrl(data);
          }
  
          if (gameUrlFound) {
            setGameUrl(gameUrlFound);
            setLaunchError('');
          } else {
            setLaunchError('URL do jogo não encontrada.');
          }
        } catch (jsonError) {
          setLaunchError('Resposta inválida da API.');
        }
      } else {
        const errorInfo = await processErrorResponse(response, 'game');
        displayError(errorInfo, setLaunchError, { showIcon: true });
      }
    } catch (err) {
      const errorInfo = translateNetworkError(err);
      displayError(errorInfo, setLaunchError, { showIcon: true });
    } finally {
      setIsLaunching(false);
    }
  }, [selectedRoulette, jwtToken]);

  // Auto-launch game on login (guarded para evitar loop infinito)
  useEffect(() => {
    if (
      !hasLaunchedRef.current &&
      isAuthenticated &&
      jwtToken &&
      !gameUrl &&
      !isLaunching
    ) {
      console.log('Autenticado, iniciando jogo automaticamente...');
      hasLaunchedRef.current = true;
      handleLaunchGame();
    }
  }, [isAuthenticated, jwtToken, gameUrl, isLaunching, handleLaunchGame]);

  // ==================================================================================
  // âš¡ LÃ“GICA DO WEBSOCKET (SOCKET.IO) - APENAS PARA 'Brasileira PlayTech'
  // ==================================================================================
  useEffect(() => {
    if (selectedRoulette !== 'Brasileira PlayTech') return;

    console.log("Iniciando conexão Socket para PlayTech...");

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      auth: {
        token: jwtToken,
        email: userInfo?.email
      }
    });

    // 1. Carga Inicial RÃ¡pida via API REST
    fetch(`${SOCKET_URL}/api/full-history?source=Brasileira PlayTech&userEmail=${encodeURIComponent(userInfo?.email || '')}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        let historyArray = [];
        if (Array.isArray(data)) {
          historyArray = data;
        } else if (data && Array.isArray(data.data)) {
          historyArray = data.data;
        } else if (data && Array.isArray(data.history)) {
          historyArray = data.history;
        } else {
          console.warn("API retornou formato inesperado:", data);
          return;
        }
        
        const formatted = historyArray.map(item => ({
          number: parseInt(item.signal, 10),
          color: getNumberColor(parseInt(item.signal, 10)),
          signal: item.signal,
          gameId: item.gameId,
          signalId: item.signalId,
          date: item.timestamp,
        }));
        
        console.log(`…Carregados ${formatted.length} spins históricos via Socket`);
        setSpinHistory(formatted);
      })
      .catch(err => {
        console.error("Erro ao carregar histórico socket:", err.message);
      });

    // 2. Escuta Novos Giros em Tempo Real
    socket.on('novo-giro', (payload) => {
      if (payload.source === 'Brasileira PlayTech') {
        console.log(" GIRO SOCKET RECEBIDO:", payload.data.signal);
        
        const newSpin = {
            number: parseInt(payload.data.signal, 10),
            color: getNumberColor(parseInt(payload.data.signal, 10)),
            signal: payload.data.signal,
            gameId: payload.data.gameId,
            signalId: payload.data.signalId,
            date: payload.data.createdAt
        };

        setSpinHistory(prev => {
            if (prev.length > 0 && prev[0].signalId === newSpin.signalId) return prev;
            return [newSpin, ...prev].slice(0, 1000);
        });
      }
    });

    return () => {
      console.log(" Desconectando Socket...");
      socket.disconnect();
    };
  }, [selectedRoulette]);


  // ==================================================================================
  // LÃ“GICA DE FETCH (POLLING) - PARA AS OUTRAS ROLETAS
  // ==================================================================================
  const fetchHistory = useCallback(async () => {
    const currentRoulette = selectedRoulette;
    if (!userInfo?.email) return;
    
    try {
      const response = await fetch(`${API_URL}/api/full-history?source=${currentRoulette}&userEmail=${encodeURIComponent(userInfo.email)}`);
      
      if (currentRoulette !== selectedRoulette) {
          console.warn(`[Abort] Roleta ${currentRoulette} abortada.`);
          return; 
      }

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
          const converted = data.map(item => ({
            number: parseInt(item.signal, 10),
            color: getNumberColor(parseInt(item.signal, 10)),
            signal: item.signal,
            gameId: item.gameId,
            signalId: item.signalId,
            date: item.timestamp
          }));
          return converted;
        }
        
        const latestId = prev[0]?.signalId;
        const newItems = [];
        
        for (const item of data) {
          if (item.signalid === latestId) break;
          newItems.push({
            number: parseInt(item.signal, 10),
            color: getNumberColor(parseInt(item.signal, 10)),
            signal: item.signal,
            gameId: item.gameId,
            signalId: item.signalid,
            date: item.timestamp
          });
        }
        
        if (newItems.length === 0) return prev;
        
        return [...newItems, ...prev];
      });
    } catch (error) {
      console.error("Erro ao buscar histórico:", error.message);
    }
  }, [selectedRoulette, userInfo]);

  useEffect(() => {
    if (!isAuthenticated || !userInfo) return;
    if (selectedRoulette === 'Brasileira PlayTech') return;

    // Polling mais lento em mobile para evitar sobrecarga
    const isMobile = window.innerWidth <= 1024;
    const pollInterval = isMobile ? 2000 : 1000;

    fetchHistory();
    const intervalId = setInterval(fetchHistory, pollInterval);
    return () => clearInterval(intervalId);
  }, [fetchHistory, isAuthenticated, userInfo, selectedRoulette]);

  // Sincronizar selectedResult com o primeiro item do spinHistory
  // Evita setState duplo que causa refresh no mobile
  useEffect(() => {
    if (spinHistory.length > 0) {
      setSelectedResult(spinHistory[0]);
    } else {
      setSelectedResult(null);
    }
  }, [spinHistory]);

  // Popup Handlers
  const handleNumberClick = useCallback((number) => {
    setPopupNumber(number);
    setIsPopupOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupNumber(null);
  }, []);

  // Mobile Tooltip Handlers
  const handleResultBoxClick = useCallback((e, result) => {
    if (window.innerWidth <= 1024) { 
      e.preventDefault();
      
      const tooltipTitle = formatPullTooltip(result.number, numberPullStats, numberPreviousStats);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = rect.left + (rect.width / 2);
      let y = rect.top - 10;
      let isBelow = false;
      
      if (y < 100) {
        y = rect.bottom + 10;
        isBelow = true;
      }
      
      setMobileTooltip(prev => {
        if (prev.visible && prev.content === tooltipTitle) {
          return { visible: false, content: '', x: 0, y: 0, isBelow: false };
        }
        return { visible: true, content: tooltipTitle, x, y, isBelow };
      });
    } else {
      handleNumberClick(result.number);
    }
  }, [numberPullStats, numberPreviousStats, handleNumberClick]);

  const closeMobileTooltip = useCallback(() => {
    setMobileTooltip({ visible: false, content: '', x: 0, y: 0, isBelow: false });
  }, []);

  // Memoized Values
  const filteredSpinHistory = useMemo(() => {
    if (historyFilter === 'all') return spinHistory;
    return spinHistory.slice(0, Number(historyFilter));
  }, [spinHistory, historyFilter]);

  const stats = useMemo(() => {
    const historyCount = filteredSpinHistory.length;
    if (historyCount === 0) {
      return { 
        historyFilter: 0, 
        colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, 
        latestNumbers: [] 
      };
    }
    
    const colorCounts = filteredSpinHistory.reduce((acc, curr) => {
      acc[curr.color] = (acc[curr.color] || 0) + 1;
      return acc;
    }, {});
    
    return {
      historyFilter: historyCount,
      colorFrequencies: {
        red: ((colorCounts.red || 0) / historyCount * 100).toFixed(1),
        black: ((colorCounts.black || 0) / historyCount * 100).toFixed(1),
        green: ((colorCounts.green || 0) / historyCount * 100).toFixed(1)
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [filteredSpinHistory, spinHistory]);

  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    
    const occurrences = [];
    filteredSpinHistory.forEach((spin, index) => {
      if (spin.number === popupNumber) occurrences.push({ index });
    });
    
    const count = occurrences.length;
    const historyCount = filteredSpinHistory.length;
    const frequency = historyCount > 0 ? ((count / historyCount) * 100).toFixed(2) : '0.00';
    
    const nextOccurrences = occurrences.slice(0, 5).map(occ => {
      const prevSpins = filteredSpinHistory.slice(occ.index + 1, occ.index + 6).map(s => s.number);
      return { spinsAgo: occ.index + 1, prevSpins };
    });
    
    return {
      count, frequency, nextOccurrences, historyFilter: historyCount,
      lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null
    };
  }, [popupNumber, isPopupOpen, filteredSpinHistory]);

  // âš¡ MEMOIZAÃ‡ÃƒO DO IFRAME (BLINDAGEM CONTRA RENDERIZAÃ‡ÃƒO)
  // Isolamos o Iframe aqui dentro. Ele sÃ³ serÃ¡ recriado se a 'gameUrl' mudar.
  // AtualizaÃ§Ãµes de 'spinHistory' ou 'stats' nÃ£o afetarÃ£o este bloco.
  const gameIframeComponent = useMemo(() => {
    if (!gameUrl) return null;
    
    return (
      <GameIframe 
        url={gameUrl} 
        onError={handleIframeError}
      />
    );
  }, [gameUrl, handleIframeError]);

  // Loading State
  if (checkingAuth) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner-large"></div>
        <p>Carregando...</p>
      </div>
    );
  }

  // Not Authenticated
  if (!isAuthenticated) {
    return <Login 
      onLoginSuccess={handleLoginSuccess} 
      setIsPaywallOpen={setIsPaywallOpen}
      setCheckoutUrl={setCheckoutUrl}
    />;
  }

  // Main Render
  return (
    <div className="app-root">
      {/* Mobile Tooltip */}
      {mobileTooltip.visible && (
        <>
          <div className="tooltip-backdrop" onClick={closeMobileTooltip} />
          <div 
            className="mobile-tooltip"
            style={{
              position: 'fixed',
              top: mobileTooltip.y,
              left: mobileTooltip.x,
              transform: mobileTooltip.isBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              zIndex: 2000,
            }}
          >
            {mobileTooltip.content.split('\n').map((line, index) => (
              <span key={index} className="tooltip-line">{line}</span>
            ))}
          </div>
        </>
      )}

      {/* Iframe Error Fallback */}
      {iframeError && (
        <div className="iframe-error-overlay">
          <div className="iframe-error-content">
            <p>âš ï¸ Erro de renderização detectado</p>
            <button onClick={() => {
              setGameUrl('');
              setIframeError(false);
              window.location.reload();
            }}>
              Recarregar Página
            </button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-left"></div>
        <div className="navbar-right">
          <a 
            href="https://betou.bet.br/"
            target="_blank" 
            rel="noopener noreferrer"
            className="nav-btn"
          >ENTRE NA PLATAFORMA<img src={W600} alt="Logo" style={{ height: "15px" }} />
            <span className="nav-btn-text"></span>
          </a>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={18} />
            <span className="logout-btn-text">Sair</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      {activePage === 'roulette' && (
        <main className="app-container">
          {/* Sidebar - Stats Dashboard */}
          <aside className="stats-dashboard">
            <h3 className="dashboard-title">Estatísticas e Ações</h3>
            
            {/* Selectors */}
            <div className="selectors-card">
              <div className="selectors-grid">
                <div className="selector-group">
                  <h4 className="selector-label">
                    <Layers size={15} /> Roletas
                  </h4>
               <select 
                    className="roulette-selector" 
                    value={selectedRoulette}
                    onChange={(e) => {
                      setSpinHistory([]); 
                      setSelectedResult(null); 
                      setSelectedRoulette(e.target.value);
                      setLaunchError('');
                      setGameUrl(''); 
                    }}
                  >
                    {Object.keys(ROULETTE_SOURCES).map(key => (
                      <option key={key} value={key}>{ROULETTE_SOURCES[key]}</option>
                    ))}
                  </select>
                </div>

                <div className="selector-group">
                  <h4 className="selector-label">
                    <Filter size={15} /> Rodadas
                  </h4>
                  <select 
                    className="roulette-selector" 
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  >
                    {filterOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleLaunchGame}
                disabled={isLaunching || !ROULETTE_GAME_IDS[selectedRoulette]}
                className="launch-button"
              >
                {isLaunching ? (
                  <>
                    <div className="spinner"></div>
                    Iniciando...
                  </>
                ) : (
                  <>
                    <PlayCircle size={20} />
                    {gameUrl ? `Reiniciar ${ROULETTE_SOURCES[selectedRoulette]}` : `Iniciar ${ROULETTE_SOURCES[selectedRoulette]}`}
                  </>
                )}
              </button>
              
              {launchError && (
                <p className="launch-error">{launchError}</p>
              )}
            </div>
            
            {/* Stats Card */}
            <div className="stats-card">
              <h4 className="stats-card-title">
                <BarChart3 size={18} /> Total de Sinais
              </h4>
              <p className="stats-card-value">{filteredSpinHistory.length}</p>
            </div>

            {/* Master Dashboard */}
            <div className="master-dashboard-wrapper">
              {stats.historyFilter >= 50 ? (
                <MasterDashboard 
                  spinHistory={filteredSpinHistory} 
                  onSignalUpdate={setEntrySignals}
                />
              ) : (
                <div className="waiting-card">
                  Aguardando {50 - stats.historyFilter} spins para iniciar o Master Dashboard...
                </div>
              )}
            </div>
          </aside>

          {/* Mobile Racetrack */}
          <div className="racetrack-mobile-only">
            <RacingTrack 
              selectedResult={selectedResult}
              onNumberClick={handleNumberClick}
              entrySignals={entrySignals}
            />
          </div>

          {/* Main Content Area */}
          <section className="main-content">
            <div className="game-area">
              
              {/* âœ… IFRAME BLINDADO AQUI (Substituindo a tag <GameIframe> direta) */}
              {gameIframeComponent}
              
              {/* Desktop Racetrack */}
              <div className="racetrack-desktop-only">
                <RacingTrack 
                  selectedResult={selectedResult}
                  onNumberClick={handleNumberClick}
                  entrySignals={entrySignals}
                />
              </div>
            </div>
          </section>

          {/* Analysis Panel */}
          <aside className="analysis-panel">
            {stats.historyFilter >= 50 ? (
              <>
                <div className="results-section">
                  <h4 className="section-title">
                    <Clock size={20} /> Últimos Resultados (100)
                  </h4>
                  <div className="color-frequencies">
                    <span className="freq-item">
                      Vermelho: <strong className="red">{stats.colorFrequencies.red}%</strong>
                    </span>
                    <span className="freq-item">
                      Zero: <strong className="green">{stats.colorFrequencies.green}%</strong>
                    </span>
                    <span className="freq-item">
                      Preto: <strong className="black">{stats.colorFrequencies.black}%</strong>
                    </span>
                  </div>
                <div className='latest-results'>

                  <ResultsGrid 
                    latestNumbers={stats.latestNumbers}
                    numberPullStats={numberPullStats}
                    numberPreviousStats={numberPreviousStats}
                    onResultClick={handleResultBoxClick}
                    />
                </div>
                    </div>

                <div>
                {/* Cerco integrado como opÃ§Ã£o dentro do DeepAnalysisPanel */}
                <DeepAnalysisPanel 
                  spinHistory={filteredSpinHistory} 
                  setIsPaywallOpen={setIsPaywallOpen}
                  cercoOptions={{
                    enablePreFormation: true,
                    enableFrequencyAnalysis: true,
                    enableCandidateTracking: true,
                    lookbackWindow: 50,
                    maxVisibleAlerts: 3
                  }}
                />
                </div>
              </>
            ) : (
              <div className="waiting-panel">
                <div className="waiting-card">
                  Aguardando {50 - stats.historyFilter} spins para iniciar o Painel de Análise...
                </div>
              </div>
            )}
          </aside>
        </main>
      )}

      {/* Modals */}
      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => {
          setIsPaywallOpen(false);
          handleLogout(); 
        }}
        userId={userInfo?.email} 
        checkoutUrl={checkoutUrl}
      />

      <NumberStatsPopup 
        isOpen={isPopupOpen}
        onClose={closePopup}
        number={popupNumber}
        stats={popupStats}
      />
    </div>
  );
};

export default App;