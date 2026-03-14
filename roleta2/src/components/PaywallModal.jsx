// PaywallModal.jsx — Obsidian Glass Premium v3 (polished)

import React, { useState, useEffect } from 'react';
import { X, Check, CreditCard, Shield, Zap, Info } from 'lucide-react';
import './PaywallModal.css';

const PaywallModal = ({ isOpen, onClose, userId, checkoutUrl }) => {
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('annual');

  const plans = {
    monthly: {
      price: 97,
      period: 'mês',
      checkoutUrl: 'https://pay.hub.la/1fA5DOZnF8bzlGTNW1XS',
      savings: null,
      installments: null
    },
    quarterly: {
      price: 197,
      period: 'trimestre',
      checkoutUrl: 'https://pay.hub.la/MMSfqPB6rwwmraNweEUh',
      savings: 'Economize R$ 94',
      installments: '3x R$ 70,04'
    },
    annual: {
      price: 497,
      period: 'ano',
      checkoutUrl: 'https://pay.hub.la/zwcPAbXDNlfSzhAcs9bg',
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
    window.location.href = 'https://free.smartanalise.com.br';
  };

  if (!isOpen) return null;

  return (
    <div className="paywall-overlay">
      <div className="paywall-modal">
        {/* Header */}
        <div className="paywall-header">
          <button className="paywall-close" onClick={onClose}>
            <X size={20} />
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
              {/* Badge & Title */}
              <div className="paywall-badge">
                <Shield size={32} className="badge-icon" />
              </div>

              <h2 className="paywall-title">Acesso Premium Necessário</h2>
              <p className="paywall-subtitle">
                Desbloqueie análises avançadas de roleta e maximize suas estratégias
              </p>

              {/* Status */}
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

              {/* Email Warning Top */}
              <div className="paywall-email-warning-top">
                <Info size={16} />
                <span>Importante: A compra deve ser realizada com o <strong>mesmo e-mail</strong> de acesso da plataforma.</span>
              </div>

              {/* Features */}
              <div className="paywall-features">
                <h3 className="features-title">O que você terá acesso:</h3>
                <ul className="features-list">
                  <li className="feature-item">
                    <Check size={16} className="feature-icon" />
                    <span>Análise de 14 fontes de roleta em tempo real</span>
                  </li>
                  <li className="feature-item">
                    <Check size={16} className="feature-icon" />
                    <span>Sistema de detecção de padrões avançado</span>
                  </li>
                  <li className="feature-item">
                    <Check size={16} className="feature-icon" />
                    <span>Alertas de convergência estatística</span>
                  </li>
                  <li className="feature-item">
                    <Check size={16} className="feature-icon" />
                    <span>Dashboard Master com scoring inteligente</span>
                  </li>
                  <li className="feature-item">
                    <Check size={16} className="feature-icon" />
                    <span>Análise de vizinhos e setores</span>
                  </li>
                  <li className="feature-item">
                    <Check size={16} className="feature-icon" />
                    <span>Histórico completo de sinais</span>
                  </li>
                </ul>
              </div>

              {/* Free Mode */}
              <button className="paywall-cta-free" onClick={handleFreeRedirect}>
                <span>Continuar no Modo Free</span>
              </button>

              {/* Plan Selector */}
              <div className="plan-selector">
                <button
                  className={`plan-option ${selectedPlan === 'annual' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('annual')}
                >
                  <div className="plan-badge-popular">
                    <Zap size={10} />
                    <span>Mais Popular</span>
                  </div>
                  <div className="plan-option-header">
                    <span className="plan-name">Anual</span>
                    <span className="plan-savings">Economize R$ 667</span>
                  </div>
                  <div className="plan-monthly">{plans.annual.installments}</div>
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
                  <div className="plan-monthly">{plans.quarterly.installments}</div>
                  <div className="plan-price">R$ 197/tri</div>
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
                  <h4 className="price-title">
                    Plano {selectedPlan === 'monthly' ? 'Mensal' : selectedPlan === 'quarterly' ? 'Trimestral' : 'Anual'}
                  </h4>
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

              {/* Email Warning Bottom */}
              <div className="paywall-email-warning">
                <Info size={16} />
                <span>Importante: A compra deve ser realizada com o <strong>mesmo e-mail</strong> de acesso da plataforma.</span>
              </div>

              {/* CTA */}
              <button className="paywall-cta" onClick={handleSubscribe}>
                <CreditCard size={18} />
                <span>Assinar Agora</span>
              </button>

              {/* Trust */}
              <div className="paywall-trust">
                <div className="trust-item">
                  <Shield size={13} />
                  <span>Pagamento Seguro</span>
                </div>
                <div className="trust-item">
                  <Check size={13} />
                  <span>Garantia de 7 dias</span>
                </div>
                <div className="trust-item">
                  <Zap size={13} />
                  <span>Acesso Imediato</span>
                </div>
              </div>

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