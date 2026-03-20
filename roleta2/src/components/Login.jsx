// components/Login.jsx — Split-Screen Professional Layout

import React, { useState, useCallback } from 'react';
import { Lock, Mail, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { API_URL } from '../constants/roulette';
import { 
  processErrorResponse, 
  translateNetworkError, 
  displayError 
} from '../lib/errorHandler';
import backLoginImg from '../assets/backlogin.png';
import logoSvg from '../assets/w=600.svg';
import './Login.css';

const Login = ({ onLoginSuccess, setIsPaywallOpen, setCheckoutUrl }) => {
  const [formData, setFormData] = useState({ 
    email: '', 
    password: '', 
    brand: 'betou' 
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json' 
        },
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
          displayError({ icon: '❓', message: 'Token não recebido.' }, setError);
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
    <div className="login-split">
      {/* ═══ LEFT: Image Panel ═══ */}
      <div className="login-split__image">
        <img 
          src={backLoginImg} 
          alt="" 
          className="login-split__bg" 
        />
        <div className="login-split__image-overlay" />
        <div className="login-split__image-content">
          {/* <img src={logoSvg} alt="Logo" className="login-split__logo" /> */}
          <h1 className="login-split__brand">Smart Analise</h1>
          <p className="login-split__tagline">
            Dashboard analítico de roleta em tempo real
          </p>
          <div className="login-split__features">
            <div className="login-split__feature">
              <span className="login-split__feature-dot" />
              Sinais em tempo real
            </div>
            <div className="login-split__feature">
              <span className="login-split__feature-dot" />
              Análise estatística avançada
            </div>
            <div className="login-split__feature">
              <span className="login-split__feature-dot" />
              Múltiplas mesas monitoradas
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT: Form Panel ═══ */}
      <div className="login-split__form-panel">
        <div className="login-split__form-wrapper">
          {/* Mobile logo (hidden on desktop) */}
          <div className="login-split__mobile-logo">
            {/* <img src={logoSvg} alt="Logo" className="login-split__mobile-logo-img" /> */}
          </div>

          <div className="login-split__header">
            <h2 className="login-split__title">Bem-vindo de volta</h2>
            <p className="login-split__subtitle">
              Faça login com sua conta da plataforma.{' '}
              <a 
                href="https://go.aff.betou.bet.br/bhlfl7qf?utm_medium=apprgr"
                target="_blank"
                rel="noopener noreferrer"
                className="login-split__link"
              >
                Criar conta
              </a>
            </p>
          </div>

          {error && (
            <div className="login-split__error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-split__form">
            <div className="login-split__field">
              <label className="login-split__label">Email</label>
              <div className="login-split__input-wrap">
                <Mail size={18} className="login-split__input-icon" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="login-split__input"
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-split__field">
              <label className="login-split__label">Senha</label>
              <div className="login-split__input-wrap">
                <Lock size={18} className="login-split__input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="login-split__input login-split__input--password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-split__eye-btn"
                  onClick={() => setShowPassword(p => !p)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="login-split__submit"
            >
              {loading ? (
                <span className="login-split__spinner-wrap">
                  <span className="login-split__spinner" />
                  Entrando...
                </span>
              ) : (
                <>
                  Entrar
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Alert banner */}
          <div className="login-split__alert">
            <div className="login-split__alert-icon">⚠️</div>
            <div className="login-split__alert-body">
              <strong>Para liberar seu acesso:</strong>
              <p>
                Clique em{' '}
                <a 
                  href="https://go.aff.betou.bet.br/tgml0e19?utm_medium=appcmd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="login-split__link"
                >
                  Criar conta
                </a>
                , faça o cadastro, verifique seu email e finalize a verificação facial.
                Após concluir, volte e faça seu login aqui.
              </p>
            </div>
          </div>

          {/* Terms */}
          <p className="login-split__terms">
            Ao fazer login, você concorda com nossos{' '}
            <span className="login-split__terms-link">Termos de Uso</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;