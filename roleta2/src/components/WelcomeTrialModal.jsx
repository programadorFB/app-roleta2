// WelcomeTrialModal.jsx - Pop-up de Boas-Vindas Ultra-Sofisticado (Primeiro Acesso)
import React from 'react';
import { Crown, Sparkles, X, ChevronRight, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import './WelcomeTrialModal.css';

export const WelcomeTrialModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="welcome-modal-overlay" onClick={onClose}>
      <div className="welcome-modal-card" onClick={e => e.stopPropagation()}>
        <button className="welcome-close-btn" onClick={onClose} title="Fechar">
          <X size={16} />
        </button>

        <div className="welcome-emblem">
          <Crown size={36} />
        </div>

        <div className="welcome-vip-tag">
          ✦ CONVITE VIP EXCLUSIVO ✦
        </div>

        <h2 className="welcome-title">Seja bem-vindo à Experiência Smart Analise</h2>

        <p className="welcome-subtitle">
          Sua conta foi ativada com sucesso. Preparamos uma cortesia especial para dar início à sua jornada com máxima performance.
        </p>

        <div className="welcome-period-pill">
          <Sparkles size={16} /> 7 Dias de Degustação Premium Concedidos
        </div>

        <div className="welcome-features-list">
          <div className="welcome-feature-row">
            <Zap size={16} className="welcome-feature-bullet" />
            <span>Motor Algorítmico com 5 Estratégias Convergentes em Tempo Real</span>
          </div>
          <div className="welcome-feature-row">
            <BarChart3 size={16} className="welcome-feature-bullet" />
            <span>Painel Master com Sinais e Histórico Completo em Tempo Real</span>
          </div>
          <div className="welcome-feature-row">
            <ShieldCheck size={16} className="welcome-feature-bullet" />
            <span>Gestão Integrada de Riscos & Unidades de Aposta</span>
          </div>
        </div>

        <button className="welcome-action-btn" onClick={onClose}>
          ACESSAR AMBIENTE VIP <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default WelcomeTrialModal;
