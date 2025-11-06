// App.jsx (Com Histórico de Puxadas no Tooltip)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
    X, BarChart3, Clock, Hash, Percent, Layers, CheckSquare, Settings, 
    LogOut, Lock, Mail, AlertCircle, PlayCircle, Filter 
} from 'lucide-react';
import NotificationCenter from './components/NotificationCenter.jsx';
import MasterDashboard from './pages/MasterDashboard.jsx';
import RacingTrack from './components/RacingTrack.jsx';
import DeepAnalysisPanel from './components/DeepAnalysisPanel.jsx';
import './components/NotificationsCenter.css';
import  './App.modules.css';

// ... (GlobalStyles permanece o mesmo) ...
const GlobalStyles = () => (
  <style>{`
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: 'Arial', sans-serif;
        background-color: #1a1a1a;
        overflow-x: hidden;
    }

      .html { 
        overflow-x: hidden;
    }

    .dashboard-title {
        font-size: 1.25rem;
        font-weight: bold;
        color: #fde047;
        margin-bottom: 1rem;
        text-align: center;
    }

    .divider {
        border: 0;
        height: 1px;
        background: #4b5563;
        margin: 1.5rem 0;
    }

    .stat-title {
        font-size: 0.8rem;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .stat-value-lg {
        font-size: 2.1rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
        color: #fde047;
    }

    .stat-value-sm {
        font-size: 0.9rem;
        color: #d1d5db;
    }

    .roulette-selector {
      width: 100%;
      padding: 0.75rem;
      background: #1f2937;
      color: #fde047;
      border: 2px solid #a16207;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }

    .roulette-selector:hover {
      background: #374151;
      border-color: #ca8a04;
    }

    .roulette-selector:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(202, 138, 4, 0.3);
    }

    .monitoring-badge {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 0.5rem;
      font-size: 0.75rem;
      color: #10b981;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .history-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
      justify-content: center;
    }

    .history-number {
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      font-size: 0.75rem;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
      min-width: 25px;
      text-align: center;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .history-number:hover {
      transform: scale(1.1);
    }

    .history-number.red { background: #dc2626; }
    .history-number.black { background: #1f2937; }
    .history-number.green { background: #15803d; }

    .roulette-wrapper {
      grid-column: 2 / 3;
      display: flex;
      flex-direction: row; 
      align-items: flex-start;
      gap: 2rem;
      padding: 0 1rem;
      justify-content: center;
    }

    .roulette-and-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
      width: 100%;
    }

    .racetrack-and-results-wrapper {
      display: flex;
      flex-direction: row; 
      gap: 1.5rem;
      width: 100%;
      align-items: flex-start;
    }

    .racetrack-main-column {
      flex: 1; 
      min-width: 0; 
      display: flex;
      flex-direction: column;
      gap: 1.5rem; 
    }

    .latest-results-compact {
      border-radius: 1rem;
      margin-left:1px;
      width: 100%;
      flex-shrink: 0;
      position: static;
      top: auto;       
      -ms-overflow-style: none;
      scrollbar-width: none;
      margin-bottom: 1.5rem; 
    }

    .latest-results-title {
      font-size: 1.1rem;
      font-weight: bold;
      color: #fde047;
      margin-bottom: 1rem;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(40px, 1fr)); 
      gap: 0.5rem;
      margin-bottom: 1rem;
      transition: all 0.2s ease-in-out;
    }

    .result-number-box {
      aspect-ratio: 1; 
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      font-weight: bold;
      font-size: 1rem; 
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      opacity: 1;
    }
    
    .results-grid.hover-active .result-number-box {
        opacity: 0.3;
    }
    
    .results-grid.hover-active .result-number-box.highlighted {
        opacity: 1;
        transform: scale(1.15);
        border: 2px solid #fde047;
        box-shadow: 0 0 15px rgba(253, 224, 71, 0.7);
        z-index: 10;
    }

    .result-number-box:hover {
      transform: scale(1.1);
      z-index: 5;
    }

    .result-number-box.red { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
    .result-number-box.black { background: linear-gradient(135deg, #1f2937 0%, #000000 100%); }
    .result-number-box.green { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }

    .roulette-center {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
     .wood-border {
      width: 420px; height: 420px; border-radius: 50%;
      background: linear-gradient(135deg, #78350f 0%, #451a03 50%, #78350f 100%);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5); padding: 1rem;
      background-image: linear-gradient(90deg, rgba(101, 67, 33, 0.3) 1px, transparent 1px), linear-gradient(rgba(101, 67, 33, 0.3) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .gold-border {
      width: 100%; height: 100%; border-radius: 50%; padding: 0.75rem;
      background: linear-gradient(145deg, #FFD700, #FFA500, #FFD700, #DAA520);
      background-size: 200% 200%; box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .green-base {
       width: 100%; height: 100%; border-radius: 50%;
      background: linear-gradient(135deg, #15803d 0%, #166534 50%, #14532d 100%);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8); overflow: hidden;
    }
     .number-slot {
      position: absolute; width: 44px; height: 44px; border-radius: 4px;
      font-weight: bold; color: white; font-size: 0.875rem;
      box-shadow: inset 0 2px 8px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5);
      cursor: pointer; border: none; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center;
    }
    .number-slot:hover { transform: scale(1.1); z-index: 10; }
    .number-slot.green { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }
    .number-slot.red { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
    .number-slot.black { background: linear-gradient(135deg, #1f2937 0%, #000000 100%); }
     .ball {
      position: absolute; width: 24px; height: 24px; border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #ffffff, #e0e0e0 40%, #a0a0a0 70%, #707070);
      box-shadow: 0 4px 8px rgba(0,0,0,0.6), inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.8);
      pointer-events: none; z-index: 10;
      transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .title-section {
        text-align: center;
        margin-top: 1.5rem;
        margin-bottom: 0;
        width: 100%;
    }

    .main-title {
        font-size: 2rem;
        font-weight: bold;
        background: linear-gradient(90deg, #fde047 0%, #eab308 50%, #fde047 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 0.25rem;
    }

    .subtitle {
        color: #fde047;
        margin-top: 0.25rem;
        font-size: 0.95rem;
        font-weight: 600;
    }


    
    .popup-overlay {
       position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 1000;
    }
    .popup-content {
      background: linear-gradient(145deg, #1f2937 0%, #111827 100%); border-radius: 1rem; padding: 2rem;
      width: 90%; max-width: 700px; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7); color: #d1d5db;
      position: relative; max-height: 90vh; overflow-y: auto; border: 3px solid #ca8a04;
    }
    .popup-close-btn {
      position: absolute; top: 1rem; right: 1rem; background: transparent; color: #9ca3af;
      border: none; cursor: pointer; padding: 0.5rem; border-radius: 50%; transition: color 0.2s, background 0.2s;
    }
    .popup-close-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
    .popup-header {
      display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #374151;
    }
    .popup-number-icon {
      width: 60px; height: 60px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
      font-size: 2rem; font-weight: bold; color: #111827; box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
    }
    .popup-number-icon.red { background-color: #ef4444; }
    .popup-number-icon.black { background-color: #374151; color: #fff; }
    .popup-number-icon.green { background-color: #10b981; }
    .popup-title { font-size: 1.8rem; color: #fde047; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
    .info-card { background: rgba(255, 255, 255, 0.05); border-radius: 0.5rem; padding: 1rem; border-left: 3px solid #ca8a04; }
    .info-label { font-weight: 600; color: #9ca3af; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
    .info-value { font-size: 1.4rem; font-weight: bold; }
    .info-value.red { color: #ef4444; } .info-value.black { color: #d1d5db; } .info-value.green { color: #10b981; }
    .next-spins-title { font-size: 1.4rem; color: #eab308; margin-bottom: 1.5rem; border-bottom: 1px solid #374151; padding-bottom: 0.5rem; }
    .next-spins-container { display: flex; flex-direction: column; gap: 1.5rem; }
    .next-spins-card { background: rgba(0, 0, 0, 0.2); padding: 1rem; border-radius: 0.5rem; border: 1px solid #374151; }
    .next-spins-label { font-size: 1rem; color: #e5e7eb; margin-bottom: 0.75rem; font-weight: bold; }
    .next-numbers-list { display: flex; gap: 0.5rem; }
    .next-number {
      width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
      font-size: 0.9rem; font-weight: bold; color: #111827; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
    }
    .next-number.red { background-color: #fca5a5; } .next-number.black { background-color: #9ca3af; color: #111827; } .next-number.green { background-color: #6ee7b7; }
    .next-spins-incomplete { font-size: 0.85rem; color: #ef4444; margin-top: 0.5rem; }
    .next-spins-none { color: #9ca3af; text-align: center; font-style: italic; }
    .popup-footer-btn {
      margin-top: 2rem; width: 100%; background: linear-gradient(90deg, #ca8a04 0%, #eab308 100%); color: #111827;
      font-weight: bold; padding: 1rem 1.5rem; border-radius: 0.5rem; border: none; cursor: pointer; font-size: 1.125rem;
      box-shadow: 0 5px 15px rgba(234, 179, 8, 0.4); transition: transform 0.2s;
    }
    .popup-footer-btn:hover { transform: translateY(-2px); }

    @media (max-width: 1600px) {

    @media (max-width: 1400px) {
      .container { grid-template-columns: 1fr; padding: 1.5rem; }

      .roulette-wrapper { grid-column: auto; flex-direction: column; align-items: center; }
      .analysis-panel {
        position: static;
        max-height: none;
        grid-column: auto;
      }
      .racetrack-and-results-wrapper {
        flex-direction: column;
      }
      .latest-results-compact { 
        max-width: 100%; 
        width: 100%; 
        position: static; 
        max-height: none; 
      }
      .roulette-and-results { width: 100%; max-width: 800px; }
    }
    @media (max-width: 1024px) {
      .container { grid-template-columns: 1fr; padding: 1rem; }
      .wood-border { width: 350px; height: 350px; }
      .main-title { font-size: 1.75rem; }
      .subtitle { font-size: 0.9rem; }
    }
    @media (max-width: 600px) {
      .wood-border { width: 300px; height: 300px; }
      .number-slot { width: 28px; height: 28px; font-size: 0.7rem; }
      .ball { width: 16px; height: 16px; }
      .main-title { font-size: 1.5rem; }
      .subtitle { font-size: 0.85rem; }
      .popup-content { padding: 1rem; }
      .popup-title { font-size: 1.5rem; }
      .results-grid { grid-template-columns: repeat(6, 1fr); }
      .latest-results-compact { padding: 1rem; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}</style>
);

// ... (Login Component permanece exatamente igual) ...
const Login = ({ onLoginSuccess }) => {
  const [formData, setFormData] = useState({ email: '', password: '', brand: 'betou' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devMode, setDevMode] = useState(false);
  const brands = [
    { value: 'betou', label: 'Betou' },
    // { value: 'betfusion', label: 'BetFusion' },
    // { value: 'sortenabet', label: 'Sortena Bet' }
  ];
  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };
  const handleDevLogin = () => {
    const devJwt = 'dev-jwt-token-' + Date.now();
    localStorage.setItem('authToken', devJwt);
    localStorage.setItem('userEmail', formData.email || 'dev@teste.com');
    localStorage.setItem('userBrand', formData.brand);
    onLoginSuccess({ jwt: devJwt, email: formData.email });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (devMode) {
      setTimeout(() => {
        handleDevLogin();
        setLoading(false);
      }, 500);
      return;
    }
    try {
      const response = await fetch('/login', {
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
          setError('Login bem-sucedido, mas o token (jwt) não foi recebido.');
        }
      } else {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || `Erro ${response.status}: Resposta JSON inválida.`;
        } catch (e) {
          console.error("Erro não-JSON recebido do backend:", errorText);
          errorMessage = `Erro ${response.status}. O servidor retornou uma resposta inesperada.`;
        }
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Erro de fetch:', err);
      let errorMessage = 'Erro de conexão. ';
      if (err.message.includes('Failed to fetch')) {
        errorMessage += 'API offline ou CORS bloqueado. Ative Modo DEV para testar.';
      } else {
        errorMessage += err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#20311f', padding: '1rem'
    }}>
      <div style={{ width: '100%', maxWidth: '28rem' }}>
        <div style={{
          background: '#1a1a1a', borderRadius: '1rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)', padding: '2rem', border: '2px solid #a16207'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '5rem', height: '5rem', background: 'linear-gradient(135deg, #eab308, #eab308)',
              borderRadius: '50%', marginBottom: '1rem'
            }}>
              <Lock size={32} color="Black" />
            </div>
            <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>
              Bem-vindo
            </h2>
            <p style={{ color: '#9ca3af' }}>Este aplicativo é integrado com a casa BETOU. </p>
            <br/>
            <p style={{ color: '#9ca3af',marginBottom:"-25px" }}>Faça login com sua conta BETOU para acessar o aplicativo.</p>
          </div>
          {error && (
            <div style={{
              marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: '0.5rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
            }}>
              <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '0.125rem' }} />
              <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>

              {/* <select name="brand" value={formData.brand} onChange={handleChange} required
                style={{ width: '100%', padding: '0.75rem 1rem', background: '#374151', border: '1px solid #4b5563',
                  borderRadius: '0.5rem', color: 'white', fontSize: '1rem', cursor: 'pointer' }}>
                {brands.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select> */}
            </div>
            <div>

              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' }}>
                E-mail Betou
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="seu-email@gmail.com" required
                  style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: '#374151', border: '1px solid #4b5563',
                    borderRadius: '0.5rem', color: 'white', fontSize: '1rem' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' }}>
                Senha Betou
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" required
                  style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: '#374151', border: '1px solid #4b5563',
                    borderRadius: '0.5rem', color: 'white', fontSize: '1rem' }} />
              </div>
            </div>
            {/* <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem',
              background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '0.5rem', marginTop: '0.5rem'
            }}>

            </div> */}
          <p style={{ color: "white" }}>
              Ainda não tem cadastro na Betou?{" "}
              <a 
                href="https://go.aff.betou.bet.br/bhlfl7qf?utm_medium=newapp"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  backgroundColor: "transparent",
                  fontSize: "15px",
                  color: "#1b8dc2ff",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline" // se quiser parecer mais CTA
                }}
              >
                Clique Aqui
              </a>
            </p>

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '0.75rem 1rem',
                background: loading ? '#6b7280' : 'linear-gradient(135deg, #eab308, #eab308)',
                color: 'black', fontWeight: 'bold', fontSize: '1rem', borderRadius: '0.5rem', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: loading ? 0.7 : 1
              }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '1.25rem', height: '1.25rem', border: '2px solid white',
                    borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Dashboard Analítico de Roleta</p>
          </div>
        </div>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          Ao fazer login, você concorda com nossos Termos de Uso
        </p>
      </div>
    </div>
  );
};

// ... (Constants, getNumberColor, ROULETTE_SOURCES, ROULETTE_GAME_IDS, filterOptions permanecem iguais) ...
const rouletteNumbers = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

const ROULETTE_SOURCES = {
  immersive: '🌟 Roleta Immersive',
  brasileira: '🇧🇷 Roleta Brasileira',
  speed: '💨 Speed Roulette',
  xxxtreme: '⚡ Xxxtreme Lightning',
  vipauto: '🚘 Vip Auto Roulette'
};

const ROULETTE_GAME_IDS = {
  immersive: 55,
  brasileira: 34,
  speed: 36,
  xxxtreme: 33,
  vipauto: 31
};

const filterOptions = [
  { value: 100, label: 'Últimas 100 Rodadas' },
  { value: 300, label: 'Últimas 300 Rodadas' },
  { value: 500, label: 'Últimas 500 Rodadas' },
  { value: 1000, label: 'Últimas 1000 Rodadas' },
  { value: 'all', label: 'Histórico Completo' }
];

// <-- 1. FUNÇÃO HELPER PARA O TOOLTIP (FORMATO CORRIGIDO) -->
/**
* Formata o tooltip de "puxadas" e "anteriores" para um número, limitando a 5.
 * @param {number} number - O número que estamos analisando.
 * @param {Map<number, Map<number, number>>} pullStats - O mapa de números que vieram DEPOIS.
 * @param {Map<number, Map<number, number>>} previousStats - O mapa de números que vieram ANTES.
 * @returns {string} - A string formatada para o tooltip.
 */
const formatPullTooltip = (number, pullStats, previousStats) => {
  const pullStatsMap = pullStats.get(number);
  const prevStatsMap = previousStats.get(number);

  let pullString = "(Nenhum)";
  if (pullStatsMap && pullStatsMap.size > 0) {
    const pulledNumbers = [...pullStatsMap.keys()];
    const displayPull = pulledNumbers.slice(0, 5); // Pega os primeiros 5
    pullString = displayPull.join(', ');
    if (pulledNumbers.length > 5) {
      pullString += ', ...'; // Adiciona "..." se houver mais de 5
    }
  }

  let prevString = "(Nenhum)";
  if (prevStatsMap && prevStatsMap.size > 0) {
    const prevNumbers = [...prevStatsMap.keys()];
    const displayPrev = prevNumbers.slice(0, 5); // Pega os primeiros 5
    prevString = displayPrev.join(', ');
    if (prevNumbers.length > 5) {
      prevString += ', ...'; // Adiciona "..." se houver mais de 5
    }
  }

  // \n é a quebra de linha no tooltip do title
  return `Número: ${number}\nPuxou: ${pullString}\nVeio Antes: ${prevString}`;
};
// Main App
const App = () => {
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null);

  // App States
  const [selectedRoulette, setSelectedRoulette] = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [spinHistory, setSpinHistory] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [activePage, setActivePage] = useState('roulette');
  
  // Game States
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  
  const [entrySignals, setEntrySignals] = useState([]);

  // Filter State
  const [historyFilter, setHistoryFilter] = useState(filterOptions[0].value);
  
  const [hoveredNumber, setHoveredNumber] = useState(null);

  const greenBaseRef = useRef(null);
  const [dynamicRadius, setDynamicRadius] = useState(160);

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
  const handleLoginSuccess = (data) => {
    setIsAuthenticated(true);
    setJwtToken(data.jwt);
    setUserInfo({
      email: localStorage.getItem('userEmail'),
      brand: localStorage.getItem('userBrand'),
      ...data
    });
  };

  // Logout Handler
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userBrand');
    setIsAuthenticated(false);
    setUserInfo(null);
    setJwtToken(null);
    setActivePage('roulette');
    setGameUrl('');
  };
  
  // Close Game Handler
  const handleCloseGame = useCallback(() => {
    setGameUrl('');
    setLaunchError('');
  }, []);

  // Launch Game Handler
  const handleLaunchGame = async () => {
    setIsLaunching(true);
    setLaunchError('');
    const gameId = ROULETTE_GAME_IDS[selectedRoulette];
    
    if (!gameId || !jwtToken) {
      setLaunchError('Erro interno: ID do jogo ou Token não encontrado.');
      setIsLaunching(false);
      return;
    }
  
    try {
      const response = await fetch(`/start-game/${gameId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
  
      const rawResponseText = await response.text();
      console.log('🔍 Resposta completa do start-game:', rawResponseText);
  
      if (response.ok) {
        try {
          const data = JSON.parse(rawResponseText);
          console.log('📦 Dados parseados:', data);
  
          let gameUrl = null;
          gameUrl = data?.launchOptions?.launch_options?.game_url;
          if (!gameUrl) gameUrl = data?.launch_options?.game_url;
          if (!gameUrl) gameUrl = data?.game_url;
          if (!gameUrl) gameUrl = data?.url;
          
          if (!gameUrl) {
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
            gameUrl = findGameUrl(data);
          }
  
          if (gameUrl) {
            console.log("✅ URL do jogo encontrada:", gameUrl);
            setGameUrl(gameUrl);
            setLaunchError('');
          } else {
            console.warn("❌ game_url não encontrada na resposta. Estrutura completa:", data);
            setLaunchError('URL do jogo não encontrada na resposta da API. Estrutura: ' + JSON.stringify(data).substring(0, 200));
          }
  
        } catch (jsonError) {
          console.error("❌ Erro ao parsear JSON:", jsonError);
          console.error("📄 Resposta original:", rawResponseText);
          setLaunchError('Resposta da API não é um JSON válido: ' + rawResponseText.substring(0, 100));
        }
      } else {
        console.error("❌ Erro HTTP:", response.status, rawResponseText);
        setLaunchError(`Erro ${response.status} do servidor: ${rawResponseText.substring(0, 100)}`);
      }
    } catch (err) {
      console.error('❌ Erro de rede:', err);
      setLaunchError('Erro de conexão: ' + err.message);
    } finally {
      setIsLaunching(false);
    }
  };

  // Radius Effect
  useEffect(() => {
    const calculateRadius = () => {
      if (greenBaseRef.current) {
        const greenBaseWidth = greenBaseRef.current.clientWidth;
        const newRadius = (greenBaseWidth / 2) * 0.879;
        setDynamicRadius(newRadius);
      }
    };
    calculateRadius();
    window.addEventListener('resize', calculateRadius);
    return () => window.removeEventListener('resize', calculateRadius);
  }, []);

  // Fetch History
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/full-history?source=${selectedRoulette}`);
      if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
      const data = await response.json();
      const convertedData = data.map(item => {
        const num = parseInt(item.signal, 10);
        return {
          number: num,
          color: getNumberColor(num),
          signal: item.signal,
          gameId: item.gameId,
          signalId: item.signalId,
          date: item.timestamp
        };
      });
      setSpinHistory(convertedData);
      setSelectedResult(convertedData[0] || null);
    } catch (error) {
      console.error("Erro:", error);
      setSpinHistory([]);
      setSelectedResult(null);
    }
  }, [selectedRoulette]);

  // Fetch History Effect
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchHistory();
    const intervalId = setInterval(fetchHistory, 5000);
    return () => clearInterval(intervalId);
  }, [fetchHistory, isAuthenticated]);

  // Popup Handlers
  const handleNumberClick = useCallback((number) => {
    setPopupNumber(number);
    setIsPopupOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupNumber(null);
  }, []);

  // filteredSpinHistory (useMemo)
  const filteredSpinHistory = useMemo(() => {
    if (historyFilter === 'all') {
      return spinHistory;
    }
    return spinHistory.slice(0, Number(historyFilter));
  }, [spinHistory, historyFilter]);

  
  // stats (useMemo)
  const stats = useMemo(() => {
    const historyFilter = filteredSpinHistory.length;
    
    if (historyFilter === 0) return { historyFilter: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };
    
    const colorCounts = filteredSpinHistory.reduce((acc, curr) => {
      acc[curr.color] = (acc[curr.color] || 0) + 1;
      return acc;
    }, {});
    
    return {
      historyFilter, 
      colorFrequencies: {
        red: ((colorCounts.red || 0) / historyFilter * 100).toFixed(1),
        black: ((colorCounts.black || 0) / historyFilter * 100).toFixed(1),
        green: ((colorCounts.green || 0) / historyFilter * 100).toFixed(1)
      },
      latestNumbers: spinHistory.slice(0, 100), 
    };
  }, [filteredSpinHistory, spinHistory]);

  // popupStats (useMemo)
  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    
    const occurrences = [];
    filteredSpinHistory.forEach((spin, index) => {
      if (spin.number === popupNumber) occurrences.push({ index });
    });
    
    const count = occurrences.length;
    const historyFilter = filteredSpinHistory.length;
    const frequency = historyFilter > 0 ? ((count / historyFilter) * 100).toFixed(2) : '0.00';
    
    const nextOccurrences = occurrences.slice(0, 5).map(occ => {
      const prevSpins = filteredSpinHistory.slice(occ.index + 1, occ.index + 1 + 5).map(s => s.number);
      return { spinsAgo: occ.index + 1, prevSpins };
    });
    
    return {
      count, frequency, nextOccurrences, historyFilter,
      lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null
    };
  }, [popupNumber, isPopupOpen, filteredSpinHistory]);

  // <-- 2. useMemo PARA PRÉ-CALCULAR "PUXADAS" (RE-ADICIONADO) -->
  const numberPullStats = useMemo(() => {
    // Map<number, Map<pulledNumber, count>>
    const pullMap = new Map();

    // Inicializa o mapa para todos os 37 números
    for (let i = 0; i <= 36; i++) {
      pullMap.set(i, new Map());
    }

    // Itera sobre o histórico COMPLETO (spinHistory)
    // spinHistory[i] é o número ATUAL
    // spinHistory[i+1] é o número que veio IMEDIATAMENTE APÓS (o "puxado")
// ✅ AGORA CORRETO - Pega números que vieram DEPOIS
for (let i = 1; i < spinHistory.length; i++) {
  const currentNumber = spinHistory[i].number; // Número analisado
  const nextNumber = spinHistory[i - 1].number; // Número POSTERIOR (índice menor = mais recente)
  
  const numberStats = pullMap.get(currentNumber);
  const currentPullCount = numberStats.get(nextNumber) || 0;
  numberStats.set(nextNumber, currentPullCount + 1);
}
    
    return pullMap;
  }, [spinHistory]); // Depende apenas do histórico completo
  // <-- FIM DA MUDANÇA -->
  const numberPreviousStats = useMemo(() => {
    // Map<number, Map<previousNumber, count>>
    const prevMap = new Map();

    // Inicializa o mapa para todos os 37 números
    for (let i = 0; i <= 36; i++) {
      prevMap.set(i, new Map());
    }

    // Itera sobre o histórico COMPLETO (spinHistory)
    // spinHistory[i] é o número ATUAL
    // spinHistory[i+1] é o número que veio IMEDIATAMENTE ANTES
    for (let i = 0; i < spinHistory.length - 1; i++) {
      const currentNumber = spinHistory[i].number;     // Número analisado (o mais recente)
      const previousNumber = spinHistory[i + 1].number; // Número ANTERIOR (o mais antigo)
      
      const numberStats = prevMap.get(currentNumber);
      const currentPrevCount = numberStats.get(previousNumber) || 0;
      numberStats.set(previousNumber, currentPrevCount + 1);
    }
        
    return prevMap;
  }, [spinHistory])
  const getNumberPosition = useCallback((number, radius) => {
    const index = rouletteNumbers.indexOf(number);
    if (index === -1) return { x: 0, y: 0, angle: 0 };
    const angle = (index * 360) / rouletteNumbers.length;
    const x = radius * Math.cos((angle - 90) * (Math.PI / 180));
    const y = radius * Math.sin((angle - 90) * (Math.PI / 180));
    return { x, y, angle };
  }, []);

  const ballPosition = useMemo(() => {
    if (selectedResult === null) return null;
    return getNumberPosition(selectedResult.number, dynamicRadius);
  }, [selectedResult, getNumberPosition, dynamicRadius]);

  const centerDisplaySize = dynamicRadius * 0.625;
  const centerFontSize = centerDisplaySize * 0.56;

  if (checkingAuth) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%)',
        color: 'white', fontSize: '1.5rem'
      }}>
        Carregando...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <GlobalStyles />
      <div className="navbar">
        <div className="navbar-left">
        </div>
        <div className="navbar-right">
          {userInfo && (
            <div className="user-info">
              <span className="user-info-email">{userInfo.email}</span>
              <span className="user-info-brand">
                {userInfo.brand ? userInfo.brand.charAt(0).toUpperCase() + userInfo.brand.slice(1) : ''}
              </span>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="logout-btn"
            title="Sair"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </div>

      {activePage === 'roulette' && (
        <div className="container">
          
          <div className="stats-dashboard">
            <h3 className="dashboard-title">Estatísticas e Ações</h3>
            <div className="stat-card">

              <div style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                
                <div style={{ flex: 1 }}>
                  <h4 className="stat-title" style={{ 
                    marginBottom: '0.75rem', 
                    justifyContent: 'flex-start'
                  }}>
                    <Layers size={20} /> Roletas
                  </h4>
                  <select className="roulette-selector" value={selectedRoulette}
                    onChange={(e) => {
                      setSelectedRoulette(e.target.value);
                      setLaunchError('');
                    }}>
                    {Object.keys(ROULETTE_SOURCES).map(key => (
                      <option key={key} value={key}>{ROULETTE_SOURCES[key]}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <h4 className="stat-title" style={{ 
                    marginBottom: '0.75rem', 
                    justifyContent: 'flex-start'
                  }}>
                    <Filter size={20} /> Rodadas
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
                title={!ROULETTE_GAME_IDS[selectedRoulette] ? "Este jogo não possui integração para iniciar." : `Iniciar ${ROULETTE_SOURCES[selectedRoulette]}`}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: '#111827',
                  background: 'linear-gradient(90deg, #ca8a04 0%, #eab308 100%)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: (isLaunching || !ROULETTE_GAME_IDS[selectedRoulette]) ? 'not-allowed' : 'pointer',
                  opacity: (isLaunching || !ROULETTE_GAME_IDS[selectedRoulette]) ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {isLaunching ? (
                  <>
                    <div style={{ width: '1.25rem', height: '1.25rem', border: '2px solid #111827', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    Iniciando...
                  </>
                ) : (
                  <>
                    <PlayCircle size={20} />
                    Iniciar {ROULETTE_SOURCES[selectedRoulette]}
                  </>
                )}
              </button>
              
              {launchError && (
                <p style={{color: '#f87171', fontSize: '0.875rem', marginTop: '0.75rem', textAlign: 'center'}}>
                  {launchError}
                </p>
              )}
            </div>
            
            <div className="stat-card">
                  <div className="stat-card">
              <h4 className="stat-title"><BarChart3 size={10} /> Total de Sinais</h4>
             <p className="stat-value-lg">{filteredSpinHistory.length}</p>
            </div>
                  <div style={{marginTop: '2rem', width: '100%', maxWidth: '800px'}}>
                    {stats.historyFilter >= 50 ? (
                      <MasterDashboard 
                        spinHistory={filteredSpinHistory} 
                        onSignalUpdate={setEntrySignals}
                      />

                    ) : (
                      <div className="stat-card" style={{background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', border: '1px solid rgba(253, 224, 71, 0.2)', color: '#9ca3af', padding: '2rem', textAlign: 'center'}}>
                        Aguardando {50 - stats.historyFilter} spins (no filtro atual) para iniciar o Master Dashboard...
                      </div>
                    )}
                  </div>
            </div>
          </div>
          
          <div className="roulette-wrapper">
            <div className="roulette-and-results">

                  {gameUrl && (
                      <div className="game-iframe-wrapper">
                        <iframe 
                          src={gameUrl} 
                          title="Jogo de Roleta" 
                          className="game-iframe"
                          allowFullScreen 
                        />
                      </div>
                  )}
                  <div className="racetrack-and-results-wrapper">
                      <div className="racetrack-main-column">
                        <RacingTrack 
                          selectedResult={selectedResult}
                          onNumberClick={handleNumberClick}
                          entrySignals={entrySignals}
                        />
                      </div>
                  </div>
            </div>
          </div>

          {stats.historyFilter >= 50 ? (
            <div className="analysis-panel">
              
              <div className="latest-results-compact">
                <h4 className="latest-results-title">
                  <Clock size={20} /> Últimos Resultados (100)
                </h4>
                  <div style={{ display:'flex', gap:'12px', alignItems:'center', fontSize:'20px' }}>
                  <p className="stat-value-sm">Vermelho: <span style={{color: '#ef4444', fontWeight: 'bold'}}>{stats.colorFrequencies.red}%</span></p>
                  <p className="stat-value-sm">Zero: <span style={{color: '#10b981', fontWeight: 'bold'}}>{stats.colorFrequencies.green}%</span></p>
                  <p className="stat-value-sm">Preto: <span style={{color: '#d1d5db', fontWeight: 'bold'}}>{stats.colorFrequencies.black}%</span></p>
              </div>

                {/* <-- 3. JSX DO GRID ATUALIZADO (usando formatPullTooltip) --> */}
                <div 
                  className={`results-grid ${hoveredNumber !== null ? 'hover-active' : ''}`}
                  onMouseLeave={() => setHoveredNumber(null)}
                >
                  {stats.latestNumbers.map((result, index) => {
                    
                    const isHighlighted = hoveredNumber !== null && result.number === hoveredNumber;
                    
                    // Usa a nova função para gerar o tooltip com AMBOS os históricos
                    const tooltipTitle = formatPullTooltip(
                      result.number, 
                      numberPullStats,      // O que veio DEPOIS
                      numberPreviousStats   // O que veio ANTES
                    ); 

                    return (
                      <div 
                        key={index} 
                        className={`result-number-box ${result.color} ${isHighlighted ? 'highlighted' : ''}`}
                        onMouseEnter={() => setHoveredNumber(result.number)}
                        onClick={() => handleNumberClick(result.number)}
                        title={tooltipTitle} // Usa o novo tooltip
                      >
                        {result.number}
                      </div>
                    );
                  })}
                </div>
                {/* <-- FIM DA MUDANÇA --> */}

              </div>

              <DeepAnalysisPanel spinHistory={filteredSpinHistory} />
            </div>
          ) : (
            <div className="analysis-panel" style={{
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              textAlign: 'center', 
              color: '#9ca3af',
              padding: '2rem'
            }}>
              <div className="stat-card" style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', 
                border: '1px solid rgba(253, 224, 71, 0.2)', 
                color: '#9ca3af',
                marginBottom: 0
              }}>
                Aguardando {50 - stats.historyFilter} spins (no filtro atual) para iniciar o Painel de Análise...
              </div>
            </div>
          )}

        </div>
      )}

      {activePage === 'master' && (
        <div style={{
          padding: '2rem',
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%)',
          minHeight: 'calc(100vh - 65px)'
        }}>
          {stats.historyFilter >= 50 ? (
            <MasterDashboard 
              spinHistory={filteredSpinHistory} 
              onSignalUpdate={setEntrySignals}
            />
          ) : (
            <div className="stat-card" style={{background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', border: '1px solid rgba(253, 224, 71, 0.2)', color: '#9ca3af', padding: '2rem', textAlign: 'center', maxWidth: '800px', margin: '0 auto'}}>
              Aguardando {50 - stats.historyFilter} spins (no filtro atual) para iniciar o Master Dashboard...
            </div>
          )}
        </div>
      )}

      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </>
  );
};

// ... (Componente NumberStatsPopup permanece exatamente igual) ...
const NumberStatsPopup = ({ isOpen, onClose, number, stats }) => {
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
          <h2 className="popup-title">Análise do Número {number} (em {stats.historyFilter} spins)</h2>
        </div>
        <div className="stats-grid">
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
        <h3 className="next-spins-title">Últimas 5 Ocorrências (e 5 spins ANTERIORES)</h3>
        <div className="next-spins-container">
          {stats.nextOccurrences.length > 0 ? (
            stats.nextOccurrences.map((occ, index) => (
              <div key={index} className="next-spins-card">
                <p className="next-spins-label">Ocorrência #{stats.count - index} ({occ.spinsAgo} spins atrás)</p>
                <div className="next-numbers-list">
                  {occ.prevSpins.length > 0 ? occ.prevSpins.map((num, i) => (
                    <span key={i} className={`next-number ${getNumberColor(num)}`}
                      title={`Spin #${stats.historyFilter - (occ.spinsAgo + i)} (${5-i}º Spin ANTES)`}>
                      {num}
                    </span>
                  )) : <span style={{color: '#9ca3af', fontStyle: 'italic'}}>Início do histórico</span>}
                </div>
              </div>
            ))
          ) : (
            <p className="next-spins-none">O número {number} ainda não foi sorteado neste histórico.</p>
          )}
        </div>
        <button onClick={onClose} className="popup-footer-btn">Fechar</button>
      </div>
    </div>
  );
};


export default App;