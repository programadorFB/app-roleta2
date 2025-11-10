// PaywallModal.jsx
// Componente React para exibir modal de assinatura quando o usuário não tem acesso

import React, { useState, useEffect } from 'react';
import { X, Check, CreditCard, Shield, Zap } from 'lucide-react';
import './PaywallModal.css';

const PaywallModal = ({ isOpen, onClose, userId, checkoutUrl }) => {
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('monthly');

const plans = {
  monthly: {
    price: 97,
    period: 'mês',
    checkoutUrl: 'https://pay.hub.la/1fA5DOZnF8bzlGTNW1XS',
    savings: null
  },
  quarterly: {
    price: 197,
    period: 'trimestre',
    checkoutUrl: 'https://pay.hub.la/d6g4aytmFqMJM3MPiSz1',
    savings: 'Economize R$ 94'
  },
  annual: {
    price: 597,
    period: 'ano',
    checkoutUrl: 'https://pay.hub.la/zwcPAbXDNlfSzhAcs9bg',
    savings: 'Economize R$ 567'
  }
};

  useEffect(() => {
    if (isOpen && userId) {
      checkSubscriptionStatus();
    }
  }, [isOpen, userId]);

  const checkSubscriptionStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/subscription/status?userEmail=${encodeURIComponent(userId)}`);
      const data = await response.json();
      
      setSubscriptionStatus(data);
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = () => {
    // Redireciona para o checkout da Hubla com o plano selecionado
    window.open(plans[selectedPlan].checkoutUrl);
  };

  const handleFreeRedirect = () => {
    // Redireciona para a versão free
    window.location.href = 'https://app-roleta2.onrender.com';
  };

  if (!isOpen) return null;

  return (
    <div className="paywall-overlay">
      <div className="paywall-modal">
        {/* Header */}
        <div className="paywall-header">
          <button className="paywall-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="paywall-content">
          {loading ? (
            <div className="paywall-loading">
              <div className="spinner"></div>
              <p>Verificando assinatura...</p>
            </div>
          ) : (
            <>
              {/* Badge */}
              <div className="paywall-badge">
                <Shield size={48} className="badge-icon" />
              </div>

              {/* Title */}
              <h2 className="paywall-title">
                Acesso Premium Necessário
              </h2>
              <p className="paywall-subtitle">
                Desbloqueie análises avançadas de roleta e maximize suas estratégias
              </p>

              {/* Status atual */}
              {subscriptionStatus && (
                <div className="paywall-status">
                  {subscriptionStatus.subscription ? (
                    <div className="status-card status-inactive">
                      <p className="status-label">Status Atual</p>
                      <p className="status-value">
                        {subscriptionStatus.subscription.status === 'canceled' && 'Assinatura Cancelada'}
                        {subscriptionStatus.subscription.status === 'expired' && 'Assinatura Expirada'}
                        {subscriptionStatus.subscription.status === 'pending' && 'Pagamento Pendente'}
                      </p>
                    </div>
                  ) : (
                    <div className="status-card status-none">
                      <p className="status-label">Status Atual</p>
                      <p className="status-value">Sem Assinatura</p>
                    </div>
                  )}
                </div>
              )}

              {/* Features */}
              <div className="paywall-features">
                <h3 className="features-title">O que você terá acesso:</h3>
                <ul className="features-list">
                  <li className="feature-item">
                    <Check size={20} className="feature-icon" />
                    <span>Análise de 6 fontes de roleta em tempo real</span>
                  </li>
                  <li className="feature-item">
                    <Check size={20} className="feature-icon" />
                    <span>Sistema de detecção de padrões avançado</span>
                  </li>
                  <li className="feature-item">
                    <Check size={20} className="feature-icon" />
                    <span>Alertas de convergência estatística</span>
                  </li>
                  <li className="feature-item">
                    <Check size={20} className="feature-icon" />
                    <span>Dashboard Master com scoring inteligente</span>
                  </li>
                  <li className="feature-item">
                    <Check size={20} className="feature-icon" />
                    <span>Análise de vizinhos e setores</span>
                  </li>
                  <li className="feature-item">
                    <Check size={20} className="feature-icon" />
                    <span>Histórico completo de sinais</span>
                  </li>
                </ul>
              </div>

              {/* Plan Selector */}
              <div className="plan-selector">
                
              {/* Free Mode Button */}
              <button 
                className="paywall-cta-free"
                onClick={handleFreeRedirect}
              >
                <span>Continuar no Modo Free</span>
              </button>
                <button 
                  className={`plan-option ${selectedPlan === 'annual' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('annual')}
                >
                  <div className="plan-badge-popular">
                    <Zap size={12} />
                    <span>Mais Popular</span>
                  </div>
                  <div className="plan-option-header">
                    <span className="plan-name">Anual</span>
                    <span className="plan-savings">Economize R$ 567</span>
                  </div>
                  <div className="plan-price">R$ 597/ano</div>
                  <div className="plan-monthly">R$ 49,75/mês</div>
                </button>
                <button 
                  className={`plan-option ${selectedPlan === 'quarterly' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('quarterly')}
                >
                  <div className="plan-option-header">
                    <span className="plan-name">Trimestral</span>
                    <span className="plan-savings">Economize R$ 94</span>
                  </div>
                  <div className="plan-price">R$ 197/trimestre</div>
                  <div className="plan-monthly">R$ 65,67/mês</div>
                </button>
                
                <button 
                  className={`plan-option ${selectedPlan === 'monthly' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('monthly')}
                >
                  <div className="plan-option-header">
                    <span className="plan-name">Mensal</span>
                  </div>
                  <div className="plan-price">R$ 97/mês</div>
                </button>
              </div>

              {/* Selected Plan Details */}
              <div className="paywall-pricing">
                <div className="price-card">
                  <h4 className="price-title">Acesso Premium - {plans[selectedPlan].period}</h4>
                  <div className="price-value">
                    <span className="price-currency">R$</span>
                    <span className="price-amount">{plans[selectedPlan].price}</span>
                    <span className="price-period">/{plans[selectedPlan].period}</span>
                  </div>
                  {plans[selectedPlan].savings && (
                    <div className="savings-badge">{plans[selectedPlan].savings}</div>
                  )}
                  <ul className="price-features">
                    <li>✓ Acesso ilimitado</li>
                    <li>✓ Atualizações em tempo real</li>
                    <li>✓ Suporte prioritário</li>
                    <li>✓ Cancele quando quiser</li>
                  </ul>
                </div>
              </div>

              {/* CTA Button */}
              <button 
                className="paywall-cta"
                onClick={handleSubscribe}
              >
                <CreditCard size={20} />
                <span>Assinar Agora</span>
              </button>


              {/* Trust badges */}
              <div className="paywall-trust">
                <div className="trust-item">
                  <Shield size={16} />
                  <span>Pagamento Seguro</span>
                </div>
                <div className="trust-item">
                  <Check size={16} />
                  <span>Garantia de 7 dias</span>
                </div>
                <div className="trust-item">
                  <Zap size={16} />
                  <span>Acesso Imediato</span>
                </div>
              </div>

              {/* Footer */}
              <p className="paywall-footer">
                Pagamento processado de forma segura pela Hubla
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaywallModal;