// src/components/auth/Login.jsx
import React, { useState, useCallback } from 'react';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { API_URL } from '../../constants/roulette';
import { processErrorResponse, translateNetworkError, displayError } from '../../errorHandler';

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
        body: JSON.stringify(formData),
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
            <div className="login-icon"><Lock size={32} color="black" /></div>
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
                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="seu-email@gmail.com" required />
              </div>
            </div>

            <div className="form-group">
              <label>Senha plataforma</label>
              <div className="input-wrapper">
                <Lock size={20} className="input-icon" />
                <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" required />
              </div>
            </div>

            <p className="register-link">
              Ainda não tem cadastro na plataforma?{' '}
              <a href="https://go.aff.betou.bet.br/tgml0e19?utm_medium=appcmd" target="_blank" rel="noopener noreferrer">Clique Aqui</a>
            </p>

            <button type="submit" disabled={loading} className="login-button">
              {loading ? <span className="loading-spinner"><div className="spinner"></div>Entrando...</span> : 'Entrar'}
            </button>
          </form>

          <div className="login-footer"><p>Dashboard Analítico de Roleta</p></div>
        </div>

        <div className="alert-banner" style={{ backgroundColor: '#fff3cd', borderLeft: '5px solid #ffc107', padding: '20px', marginBottom: '15px', marginTop: '15px', borderRadius: '4px', fontFamily: 'sans-serif' }}>
          <strong style={{ color: '#856404', display: 'block', marginBottom: '10px', fontSize: '1.1rem' }}>⚠️ Atenção - Para liberar seu acesso:</strong>
          <p style={{ color: '#856404', margin: '0 0 10px 0' }}>
            Clica no link azul acima "Clique aqui" e faça o cadastro na plataforma, verifique seu email/número e finalize a <strong>verificação facial</strong> (basta clicar em alguma Roleta como se fosse jogar).
          </p>
          <p style={{ color: '#856404', fontWeight: 'bold', margin: '0' }}>Após concluir, volte e faça seu login aqui.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;