// components/BanNotice.jsx — Advertência de acesso suspenso por scraping.
// Overlay bloqueante: quem foi banido não continua usando a ferramenta.

import React from 'react';
import { AlertTriangle, Headset } from 'lucide-react';
import styles from './BanNotice.module.css';

const SUPPORT_URL = 'https://wa.me/5551981794138?text=Meu%20acesso%20foi%20suspenso%20e%20acredito%20que%20houve%20engano.';

const formatUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const BanNotice = ({ message, bannedUntil, onLogout }) => {
  const until = formatUntil(bannedUntil);

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="ban-title">
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <AlertTriangle size={40} />
        </div>

        <h2 id="ban-title" className={styles.title}>ADVERTÊNCIA</h2>

        <p className={styles.message}>
          {message || 'Detectamos acesso automatizado (scraping) na sua conta, o que viola os Termos de Uso. Seu acesso está suspenso.'}
        </p>

        {until && (
          <div className={styles.untilBox}>
            <span className={styles.untilLabel}>Acesso liberado novamente em</span>
            <strong className={styles.untilValue}>{until}</strong>
          </div>
        )}

        <p className={styles.footnote}>
          Se você acredita que houve engano, fale com o suporte — o caso é revisado manualmente.
        </p>

        <div className={styles.actions}>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className={styles.supportBtn}>
            <Headset size={16} /> FALAR COM O SUPORTE
          </a>
          {onLogout && (
            <button type="button" onClick={onLogout} className={styles.logoutBtn}>
              SAIR
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BanNotice;
