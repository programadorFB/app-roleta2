// App.jsx (Corrigido)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
// ... (ícones importados permanecem os mesmos)
import { X, BarChart3, Clock, Hash, Percent, Layers, CheckSquare, Settings, LogOut, Lock, Mail, AlertCircle, PlayCircle, Filter } from 'lucide-react'; // Adicionei PlayCircle e Filter
import FrequencyTable from './components/FrequencyTable';
import NotificationCenter from './components/NotificationCenter.jsx';
import MasterDashboard from './pages/MasterDashboard.jsx';
import './components/NotificationsCenter.css';
import  './App.modules.css';

// GlobalStyles (mantido igual)
const GlobalStyles = () => (
  <style>{`
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: 'Arial', sans-serif;
        background-color: #064e3b;
        overflow-x: hidden;
    }

    .container {
        min-height: calc(100vh - 65px);
        background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%);
        display: grid;
        grid-template-columns: 380px 1fr;
        gap: 1.5rem;
        align-items: flex-start;
        padding: 1.5rem;
        overflow-x: hidden;
        max-width: 2400px;
        margin: 0 auto;
    }
      .html { /* <-- ADICIONE ESTA REGRA */
        overflow-x: hidden;
    }

    .stats-dashboard {
        grid-column: 1 / 2;
        background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
        border-radius: 1rem;
        padding: 1.25rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        border: 2px solid #a16207;
        position: sticky;
        top: 1.5rem;
        max-height: calc(100vh - 3rem - 65px);
        overflow-y: auto;
        color: white;
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

    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.75rem;
        padding: 1rem;
        border: 1px solid #374151;
        margin-bottom: 1.5rem;
        text-align: center;
    }

    .stat-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .stat-value-lg {
        font-size: 2rem;
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

    .latest-results-compact {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      border-radius: 1rem;
      padding: 1.5rem;
      border: 2px solid #a16207;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      width: 300px;
      flex-shrink: 0;
      position: sticky;
      top: 1.5rem;
      -ms-overflow-style: none;
      scrollbar-width: none;
      max-height: calc(100vh - 3rem - 65px);
      overflow-y: auto;
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
      grid-template-columns: repeat(5, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .result-number-box {
      aspect-ratio: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      font-weight: bold;
      font-size: 1rem;
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      transition: all 0.2s;
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

    .wood-border, .gold-border, .green-base, .number-slot, .ball {
       position: relative;
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

    .analysis-panel {
        grid-column: 3 / 4;
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border-radius: 1rem;
        padding: 1.25rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        border: 2px solid #a16207;
        position: sticky;
        top: 1.5rem;
        max-height: calc(100vh - 3rem - 65px);
        overflow-y: auto;
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
      .container { grid-template-columns: 340px 1fr; gap: 1rem; }
      .wood-border { width: 380px; height: 380px; }
      .roulette-wrapper { flex-direction: column; align-items: center; }
      .latest-results-compact { max-width: 100%; width: 100%; position: static; max-height: none; }
    }

    @media (max-width: 1400px) {
      .container { grid-template-columns: 1fr; padding: 1.5rem; }
      .stats-dashboard { position: static; max-height: none; grid-column: auto; }
      .roulette-wrapper { grid-column: auto; flex-direction: column; align-items: center; }
      .latest-results-compact { max-width: 100%; width: 100%; position: static; max-height: none; }
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
      .results-grid { grid-template-columns: repeat(4, 1fr); }
      .latest-results-compact { padding: 1rem; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}</style>
);

// Login Component (Sem alterações)
const Login = ({ onLoginSuccess }) => {
  const [formData, setFormData] = useState({ email: '', password: '', brand: 'betou' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devMode, setDevMode] = useState(false);

  const brands = [
    { value: 'betou', label: 'Betou' },
    { value: 'betfusion', label: 'BetFusion' },
    { value: 'sortenabet', label: 'Sortena Bet' }
  ];

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleDevLogin = () => {
    // Usar um JWT de desenvolvimento falso, se necessário, ou apenas um token simples.
    // O importante é que `onLoginSuccess` seja chamado com um objeto que inclua `jwt`.
    const devJwt = 'dev-jwt-token-' + Date.now();
    localStorage.setItem('authToken', devJwt);
    localStorage.setItem('userEmail', formData.email || 'dev@teste.com');
    localStorage.setItem('userBrand', formData.brand);
    onLoginSuccess({ jwt: devJwt, email: formData.email }); // Passa o JWT falso
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
      // *** CORREÇÃO ***
      // A URL é relativa ('/login') para usar o proxy no mesmo host (porta 3000)
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(formData)
      });

      // LÓGICA MODIFICADA PARA USAR 'jwt'
      if (response.ok) {
        const data = await response.json(); // Espera { success: true, jwt: "..." }
        
        if (data.jwt) {
          localStorage.setItem('authToken', data.jwt); // Salva o JWT
          localStorage.setItem('userEmail', formData.email);
          localStorage.setItem('userBrand', formData.brand);
          onLoginSuccess(data); // Passa os dados (incluindo o jwt) para o componente App
        } else {
          setError('Login bem-sucedido, mas o token (jwt) não foi recebido.');
        }
      } else {
        // ... (lógica de tratamento de erro permanece a mesma) ...
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
      // ... (lógica de tratamento de erro permanece a mesma) ...
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
  
  // O JSX do componente Login permanece o mesmo
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%)', padding: '1rem'
    }}>
      <div style={{ width: '100%', maxWidth: '28rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', borderRadius: '1rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)', padding: '2rem', border: '2px solid #a16207'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '4rem', height: '4rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              borderRadius: '50%', marginBottom: '1rem'
            }}>
              <Lock size={32} color="white" />
            </div>
            <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>
              Bem-vindo
            </h2>
            <p style={{ color: '#9ca3af' }}>Faça login para acessar o dashboard</p>
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
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' }}>
                Plataforma
              </label>
              <select name="brand" value={formData.brand} onChange={handleChange} required
                style={{ width: '100%', padding: '0.75rem 1rem', background: '#374151', border: '1px solid #4b5563',
                  borderRadius: '0.5rem', color: 'white', fontSize: '1rem', cursor: 'pointer' }}>
                {brands.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' }}>
                Email
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
                Senha
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" required
                  style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: '#374151', border: '1px solid #4b5563',
                    borderRadius: '0.5rem', color: 'white', fontSize: '1rem' }} />
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem',
              background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '0.5rem', marginTop: '0.5rem'
            }}>
              <input type="checkbox" id="devMode" checked={devMode} onChange={(e) => setDevMode(e.target.checked)}
                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer', accentColor: '#3b82f6' }} />
              <label htmlFor="devMode" style={{ color: '#93c5fd', fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }}>
                🔧 Modo Desenvolvedor (Bypass API)
              </label>
            </div>

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '0.75rem 1rem',
                background: loading ? '#6b7280' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: 'white', fontWeight: 'bold', fontSize: '1rem', borderRadius: '0.5rem', border: 'none',
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

// Constants
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

// Mapeamento dos nomes das fontes para os IDs dos jogos
const ROULETTE_GAME_IDS = {
  immersive: 55,  // Immersive Roulette
  brasileira: 34, // Roleta ao Vivo (assumindo ser a Brasileira)
  speed: 36,      // Speed Roulette
  xxxtreme: 33,   // Lightning Roulette (assumindo ser a Xxxtreme)
  vipauto: 31     // Auto Roulette Vip
};

// *** NOVO *** - Opções para o filtro
const filterOptions = [
  { value: 'all', label: 'Histórico Completo' },
  { value: 100, label: 'Últimos 100 spins' },
  { value: 250, label: 'Últimos 250 spins' },
  { value: 500, label: 'Últimos 500 spins' },
];

// Main App
const App = () => {
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null); // Estado para o token JWT

  // App States
  const [selectedRoulette, setSelectedRoulette] = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [spinHistory, setSpinHistory] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [activePage, setActivePage] = useState('roulette');
  
  // Estados para o lançamento do jogo
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  
  // *** NOVO ESTADO ***
  // Armazena a URL do jogo para exibir no iframe
  const [gameUrl, setGameUrl] = useState('');

  // *** NOVOS ESTADOS ***
  const [historyFilter, setHistoryFilter] = useState(100); // Filtro (default 100)
  const [entrySignals, setEntrySignals] = useState([]); // Para o MasterDashboard

  const greenBaseRef = useRef(null);
  const [dynamicRadius, setDynamicRadius] = useState(160);

  // Check Auth -- MODIFICADO --
  useEffect(() => {
    const token = localStorage.getItem('authToken'); // Este agora é o JWT
    const email = localStorage.getItem('userEmail');
    const brand = localStorage.getItem('userBrand');
    if (token) {
      setIsAuthenticated(true);
      setJwtToken(token); // Carrega o JWT no estado
      setUserInfo({ email, brand });
    }
    setCheckingAuth(false);
  }, []);

  // Login Handler -- MODIFICADO --
  const handleLoginSuccess = (data) => {
    setIsAuthenticated(true);
    setJwtToken(data.jwt); // Armazena o JWT do login no estado
    setUserInfo({
      email: localStorage.getItem('userEmail'),
      brand: localStorage.getItem('userBrand'),
      ...data
    });
  };

  // Logout Handler -- MODIFICADO --
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userBrand');
    setIsAuthenticated(false);
    setUserInfo(null);
    setJwtToken(null); // Limpa o JWT do estado
    setActivePage('roulette');
    setGameUrl(''); // *** NOVO *** Garante que o jogo feche ao sair
  };
  
  // *** NOVA FUNÇÃO ***
  // Função para fechar o iframe do jogo e voltar ao dashboard
  const handleCloseGame = useCallback(() => {
    setGameUrl('');
    setLaunchError(''); // Limpa erros de lançamento
  }, []);

  
  // *** FUNÇÃO MODIFICADA ***
  // Função para iniciar o jogo
// Em App.jsx

  // *** FUNÇÃO CORRIGIDA ***
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

        // MÚLTIPLAS TENTATIVAS DE ENCONTRAR A URL DO JOGO
        let gameUrl = null;

        // Tentativa 1: Estrutura mais comum
        gameUrl = data?.launchOptions?.launch_options?.game_url;
        
        // Tentativa 2: Estrutura alternativa
        if (!gameUrl) {
          gameUrl = data?.launch_options?.game_url;
        }
        
        // Tentativa 3: Estrutura direta
        if (!gameUrl) {
          gameUrl = data?.game_url;
        }
        
        // Tentativa 4: Estrutura com URL direta
        if (!gameUrl) {
          gameUrl = data?.url;
        }
        
        // Tentativa 5: Busca recursiva em todo o objeto
        if (!gameUrl) {
          const findGameUrl = (obj) => {
            for (let key in obj) {
              if (key === 'game_url' && typeof obj[key] === 'string') {
                return obj[key];
              }
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

  const fetchHistory = useCallback(async () => {
    try {
      // URL relativa para usar o proxy no mesmo host (porta 3000)
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

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchHistory();
    const intervalId = setInterval(fetchHistory, 5000);
    return () => clearInterval(intervalId);
  }, [fetchHistory, isAuthenticated]);

  const handleNumberClick = useCallback((number) => {
    setPopupNumber(number);
    setIsPopupOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupNumber(null);
  }, []);

  // ... (useMemo para stats e popupStats permanece o mesmo) ...
  const stats = useMemo(() => {
    const totalSpins = spinHistory.length;
    if (totalSpins === 0) return { totalSpins: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };
    const colorCounts = spinHistory.reduce((acc, curr) => {
      acc[curr.color] = (acc[curr.color] || 0) + 1;
      return acc;
    }, {});
    return {
      totalSpins,
      colorFrequencies: {
        red: ((colorCounts.red || 0) / totalSpins * 100).toFixed(1),
        black: ((colorCounts.black || 0) / totalSpins * 100).toFixed(1),
        green: ((colorCounts.green || 0) / totalSpins * 100).toFixed(1)
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [spinHistory]);

  // *** NOVO *** - Histórico filtrado com base no seletor
  const filteredSpinHistory = useMemo(() => {
    if (historyFilter === 'all') {
      return spinHistory;
    }
    return spinHistory.slice(0, historyFilter);
  }, [spinHistory, historyFilter]);


  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;
    const occurrences = [];
    spinHistory.forEach((spin, index) => {
      if (spin.number === popupNumber) occurrences.push({ index });
    });
    const count = occurrences.length;
    const totalSpins = spinHistory.length;
    const frequency = totalSpins > 0 ? ((count / totalSpins) * 100).toFixed(2) : '0.00';
    const nextOccurrences = occurrences.slice(0, 5).map(occ => {
      const prevSpins = spinHistory.slice(occ.index + 1, occ.index + 1 + 5).map(s => s.number);
      return { spinsAgo: occ.index + 1, prevSpins };
    });
    return {
      count, frequency, nextOccurrences, totalSpins,
      lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null
    };
  }, [popupNumber, isPopupOpen, spinHistory]);

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
    // ... (JSX de carregamento permanece o mesmo) ...
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

  // Renderiza o dashboard normal (o jogo agora aparece dentro do layout)
  return (
    <>
      <GlobalStyles />
      {/* Navbar */}
      <div style={{
        className:'navbar',
        background: '#111827', padding: '0.75rem 2rem', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '3px solid #a16207'
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setActivePage('roulette')}
            style={activePage === 'roulette' ? activeTabStyle : inactiveTabStyle}>
            <Settings size={18} /> Roleta Detalhada
          </button>
          <button onClick={() => setActivePage('master')}
            style={activePage === 'master' ? activeTabStyle : inactiveTabStyle}>
            <CheckSquare size={18} /> Painel Master
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {userInfo && (
            <div style={{
              color: '#d1d5db', fontSize: '0.875rem', display: 'flex',
              flexDirection: 'column', alignItems: 'flex-end'
            }}>
              <span style={{ fontWeight: 'bold', color: '#fde047' }}>{userInfo.email}</span>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {userInfo.brand ? userInfo.brand.charAt(0).toUpperCase() + userInfo.brand.slice(1) : ''}
              </span>
            </div>
          )}
          <button onClick={handleLogout}
            style={{
              ...inactiveTabStyle, background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444', color: '#ef4444', padding: '0.5rem 1rem'
            }} title="Sair">
            <LogOut size={18} /> Sair
          </button>
        </div>
      </div>

      {/* Pages */}
      {activePage === 'roulette' && (
        <div className="container">
          
          {/* === COLUNA 1: SIDEBAR ESQUERDA === */}
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
                    <Layers size={20} /> Fonte de Dados
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
                    <Filter size={20} /> Filtro de Análise
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
            
            <hr className="divider" />

            {/* Tabela de Frequência movida para a sidebar */}
            <div className="stat-card">
              <h4 className="stat-title" style={{ justifyContent: 'flex-start' }}>
                <BarChart3 size={20} /> Frequência (Todos)
              </h4>
              {stats.totalSpins > 0 ? (
                <FrequencyTable spinHistory={spinHistory} />
              ) : (
                <p style={{color: '#9ca3af', fontSize: '0.875rem'}}>Aguardando dados...</p>
              )}
            </div>

          </div>
          {/* === FIM DA COLUNA 1 === */}


          {/* === COLUNA 2: CONTEÚDO CENTRAL === */}
          <div className="roulette-wrapper">

            {/* Sub-coluna 1: Conteúdo Principal */}
            <div className="roulette-and-results">
              
              <div className="title-section">
                <h1 className="main-title">Dashboard Analítico de Roleta</h1>
                <p className="subtitle">{ROULETTE_SOURCES[selectedRoulette]}</p>
              </div>

              {/* Container do Jogo - Aparece aqui quando gameUrl está definido */}
              {gameUrl && (
                <div className="game-container" style={{marginTop: '2rem', width: '100%'}}>
                  <div className="game-header">
                    <h3 className="game-title">
                      <PlayCircle size={24} />
                      {ROULETTE_SOURCES[selectedRoulette]}
                    </h3>
                    <button 
                      onClick={handleCloseGame} 
                      className="game-close-btn"
                      title="Fechar Jogo"
                    >
                      <X size={20} />
                      Fechar
                    </button>
                  </div>
                  <div className="game-iframe-wrapper">
                    <iframe 
                      src={gameUrl} 
                      title="Jogo de Roleta" 
                      className="game-iframe"
                      allowFullScreen 
                    />
                  </div>
                </div>
              )}

              {/* Master Dashboard (agora no local correto) */}
              <div style={{marginTop: '2rem', width: '100%', maxWidth: '800px'}}>
                {filteredSpinHistory.length >= 50 ? (
                  <MasterDashboard 
                    spinHistory={filteredSpinHistory} 
                    onSignalUpdate={setEntrySignals}
                  />
                ) : (
                  <div className="stat-card" style={{background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', border: '1px solid rgba(253, 224, 71, 0.2)', color: '#9ca3af', padding: '2rem', textAlign: 'center'}}>
                    Aguardando {50 - filteredSpinHistory.length} spins (no filtro atual) para iniciar o Master Dashboard...
                  </div>
                )}
              </div>
            </div>

            {/* Sub-coluna 2: Barra Lateral de Resultados */}
            <div className="latest-results-compact">
              <h4 className="latest-results-title">
                <Clock size={20} /> Últimos Resultados (100)
              </h4>
              <div className="results-grid">
                {stats.latestNumbers.map((result, index) => (
                  <div key={index} className={`result-number-box ${result.color}`}
                    onClick={() => handleNumberClick(result.number)}
                    title={`Spin #${stats.totalSpins - index}`}>
                    {result.number}
                  </div>
                ))}
              </div>
            </div>

          </div>
          {/* === FIM DA COLUNA 2 === */}

        </div>
      )}
      {/* === FIM DA PÁGINA 'roulette' === */}


      {activePage === 'master' && (
        <div style={{
          padding: '2rem',
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%)',
          minHeight: 'calc(100vh - 65px)'
        }}>
          <MasterDashboard spinHistory={spinHistory} />
        </div>
      )}

      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </>
  );
};

// ... (activeTabStyle e inactiveTabStyle permanecem os mesmos) ...
const activeTabStyle = {
  padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #ca8a04, #eab308)',
  color: '#111827', border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
  fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
  boxShadow: '0 4px 10px rgba(202, 138, 4, 0.4)', transition: 'all 0.2s'
};

const inactiveTabStyle = {
  padding: '0.75rem 1.5rem', background: 'rgba(255, 255, 255, 0.05)', color: '#d1d5db',
  border: '1px solid #4b5563', borderRadius: '0.5rem', cursor: 'pointer',
  fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
  transition: 'all 0.2s'
};

// ... (Componente NumberStatsPopup permanece o mesmo) ...
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
          <h2 className="popup-title">Análise do Número {number}</h2>
        </div>
        <div className="stats-grid">
          <div className="info-card">
            <p className="info-label"><Hash size={18} /> Ocorrências:</p>
            <p className="info-value">{stats.count} / {stats.totalSpins}</p>
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
                      title={`Spin #${stats.totalSpins - (occ.spinsAgo + i)} (${5-i}º Spin ANTES)`}>
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