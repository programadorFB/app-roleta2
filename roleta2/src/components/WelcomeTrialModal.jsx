// WelcomeTrialModal.jsx - Pop-up de Boas-Vindas Ultra-Sofisticado (Primeiro Acesso)
import React, { useEffect } from 'react';
import { Crown, Sparkles, X, ChevronRight, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import './WelcomeTrialModal.css';

// Player VTurb (converteai). O <script> injeta o custom element <vturb-smartplayer>;
// por isso ele é carregado sob demanda, uma única vez, quando o modal abre.
const VTURB_PLAYER_ID  = 'vid-6a88bb5df917d565e46060e5';
const VTURB_SCRIPT_SRC = 'https://scripts.converteai.net/ef9987e4-45c8-4851-adea-85ddfad5d0d1/players/6a88bb5df917d565e46060e5/v4/player.js';

export const WelcomeTrialModal = ({ isOpen, onClose }) => {
  // Hook antes do early return: as regras de hooks não permitem chamada condicional.
  useEffect(() => {
    if (!isOpen) return;
    if (document.querySelector(`script[src="${VTURB_SCRIPT_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = VTURB_SCRIPT_SRC;
    script.async = true;
    document.head.appendChild(script);
  }, [isOpen]);

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

        <div className="welcome-video">
          <vturb-smartplayer
            id={VTURB_PLAYER_ID}
            style={{ display: 'block', margin: '0 auto', width: '100%' }}
          >
            <div
              className="vturb-player-placeholder"
              style={{ position: 'relative', width: '100%', padding: '56.25% 0 0', zIndex: 0, backgroundColor: 'black' }}
            />
          </vturb-smartplayer>
        </div>

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
