// PaywallModal.jsx
// Componente React para exibir modal de assinatura - Design Profissional e Clean

import React, { useState, useEffect } from 'react';
import { X, Check, CreditCard, Shield, Zap } from 'lucide-react';
import './PaywallModal.css';

const PaywallModal = ({ isOpen, onClose, userId, checkoutUrl }) => {
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('annual');

  
    const plans = {
    monthly: {
      price: 97,
      period: 'mês',
      checkoutUrl: 'https://pay.hub.la/dBlQouYA2q2Q7a4TV6oz?utm_source=ph',
      savings: null,
      installments: null
    },
    quarterly: {
      price: 197,
      period: 'trimestre',
      checkoutUrl: 'https://pay.hub.la/MMSfqPB6rwwmraNweEUh?utm_source=ph',
      savings: 'Economize R$ 94',
      installments: '3x R$ 70,04'
    },
    annual: {
      price: 497,
      period: 'ano',
      checkoutUrl: 'https://pay.hub.la/NGeiiXVSbzSGwjbLzZhT?utm_source=ph',
      savings: 'Economize R$ 667',
      installments: '12x R$ 50,80'
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
    window.open(plans[selectedPlan].checkoutUrl);
  };

  const handleFreeRedirect = () => {
    window.location.href = 'https://gratis.smartanalise.com.br';
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
              {/* Badge & Title Section */}
              <div className="paywall-badge">
                <Shield size={40} className="badge-icon" />
              </div>

              <h2 className="paywall-title">
                Acesso Premium Necessário
              </h2>
              <p className="paywall-subtitle">
                Desbloqueie análises avançadas de roleta e maximize suas estratégias
              </p>

              {/* Status Section */}
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

              {/* Features Section */}
              <div className="paywall-features">
                <h3 className="features-title">O que você terá acesso:</h3>
                <ul className="features-list">
                  <li className="feature-item">
                    <Check size={18} className="feature-icon" />
                    <span>Análise de 6 fontes de roleta em tempo real</span>
                  </li>
                  <li className="feature-item">
                    <Check size={18} className="feature-icon" />
                    <span>Sistema de detecção de padrões avançado</span>
                  </li>
                  <li className="feature-item">
                    <Check size={18} className="feature-icon" />
                    <span>Alertas de convergência estatística</span>
                  </li>
                  <li className="feature-item">
                    <Check size={18} className="feature-icon" />
                    <span>Dashboard Master com scoring inteligente</span>
                  </li>
                  <li className="feature-item">
                    <Check size={18} className="feature-icon" />
                    <span>Análise de vizinhos e setores</span>
                  </li>
                  <li className="feature-item">
                    <Check size={18} className="feature-icon" />
                    <span>Histórico completo de sinais</span>
                  </li>
                </ul>
              </div>

              {/* Free Mode Button - Positioned at top */}
              <button 
                className="paywall-cta-free"
                onClick={handleFreeRedirect}
              >
                <span>Continuar no Modo Free</span>
              </button>

              {/* Plan Selector */}
              <div className="plan-selector">
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
                  {plans.annual.installments && (
                    <div className="plan-monthly">{plans.annual.installments}</div>
                  )}
                  <div className="plan-price">R$ 497/ano</div>
                </button>

                <button 
                  className={`plan-option ${selectedPlan === 'quarterly' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('quarterly')}
                >
                  <div className="plan-option-header">
                    <span className="plan-name">Trimestral</span>
                    <span className="plan-savings">Economize R$ 94</span>
                  </div>
                  {plans.quarterly.installments && (
                    <div className="plan-monthly">{plans.quarterly.installments}</div>
                  )}
                  <div className="plan-price">R$ 197/trimestre</div>
                </button>
                
                <button 
                  className={`plan-option ${selectedPlan === 'monthly' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('monthly')}
                >
                  <div className="plan-option-header">
                    <span className="plan-name">Mensal</span>
                  </div>
                  <div className="plan-monthly">R$ 97/mês</div>
                </button>
              </div>

              {/* Selected Plan Details */}
              <div className="paywall-pricing">
                <div className="price-card">
                  <h4 className="price-title">Plano {selectedPlan === 'monthly' ? 'Mensal' : selectedPlan === 'quarterly' ? 'Trimestral' : 'Anual'}</h4>
                  <div className="price-value">
                    {plans[selectedPlan].installments ? (
                      <>
                        <div className="price-installments">{plans[selectedPlan].installments}</div>
                        <div className="price-total">
                          <span className="price-currency">R$</span>
                          <span className="price-amount">{plans[selectedPlan].price}</span>
                          <span className="price-period">/{plans[selectedPlan].period}</span>
                        </div>
                      </>
                    ) : (
                      <div className="price-installments">
                        R$ {plans[selectedPlan].price}/{plans[selectedPlan].period}
                      </div>
                    )}
                  </div>
                  {plans[selectedPlan].savings && (
                    <div className="savings-badge">{plans[selectedPlan].savings}</div>
                  )}
                  <ul className="price-features">
                    <li>✓ Acesso ilimitado a todas as funcionalidades</li>
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
                  <Shield size={14} />
                  <span>Pagamento Seguro</span>
                </div>
                <div className="trust-item">
                  <Check size={14} />
                  <span>Garantia de 7 dias</span>
                </div>
                <div className="trust-item">
                  <Zap size={14} />
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