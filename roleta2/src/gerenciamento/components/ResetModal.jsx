import React, { useState } from 'react';
import {
  IoClose,
  IoWarning,
  IoArrowBack,
  IoWalletOutline,
  IoTodayOutline,
  IoChevronForward,
  IoTrashBinOutline,
} from 'react-icons/io5';
import { useFinancial } from '../contexts/FinancialContext';
import styles from './ResetModal.module.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

/**
 * Centro de reset — popup único com as opções de reset disponíveis ao usuário.
 *
 * Fonte única de verdade do fluxo e dos textos de reset. Tem duas telas:
 *  - menu: lista as opções;
 *  - confirmação: detalha o que acontece e pede confirmação.
 *
 * Opções:
 *  1. Resetar banca  → forceResetBank() (POST /users/reset-bank).
 *     Saldo atual vira a nova banca inicial; apaga o histórico; zera lucro/prejuízo.
 *     Perfil, objetivos e configurações são preservados.
 *  2. Resetar valores do dia → manualResetDaily().
 *     Zera os contadores de ganhos/perdas do dia (Stop Loss diário). Não toca em transações.
 *  3. Resetar tudo → resetAll() (POST /users/reset-all).
 *     Apaga TODAS as transações (zera a banca, saldo R$ 0). Mantém objetivos e perfil de risco.
 *
 * Props: open, onClose, onResetComplete?(optionKey, resetInfo)
 */
const ResetModal = ({ open, onClose, onResetComplete }) => {
  const { balance, forceResetBank, resetAll, manualResetDaily } = useFinancial();
  const [selected, setSelected] = useState(null); // null = menu | 'bank' | 'daily'
  const [isResetting, setIsResetting] = useState(false);

  if (!open) return null;

  const OPTIONS = {
    bank: {
      icon: <IoWalletOutline size={20} />,
      title: 'Resetar banca',
      summary: 'Saldo atual vira a nova banca inicial',
      danger: true,
      details: [
        <>Seu <strong>saldo atual ({formatCurrency(balance)})</strong> se tornará a nova <strong>banca inicial</strong>.</>,
        <>O histórico de transações será <strong>apagado permanentemente</strong>.</>,
        <>O lucro/prejuízo acumulado será <strong>zerado</strong>.</>,
        <>Perfil de risco, objetivos e configurações são <strong>preservados</strong>.</>,
      ],
      confirmLabel: 'Sim, resetar banca',
      run: forceResetBank,
    },
    daily: {
      icon: <IoTodayOutline size={20} />,
      title: 'Resetar valores do dia',
      summary: 'Zera ganhos/perdas de hoje',
      danger: false,
      details: [
        <>Os contadores de <strong>ganhos e perdas de hoje</strong> serão zerados.</>,
        <>Usado no acompanhamento do <strong>Stop Loss diário</strong>.</>,
        <>Suas transações e o saldo <strong>não</strong> são alterados.</>,
      ],
      confirmLabel: 'Zerar valores do dia',
      run: async () => { await manualResetDaily(); return { success: true }; },
    },
    all: {
      icon: <IoTrashBinOutline size={20} />,
      title: 'Resetar tudo',
      summary: 'Apaga tudo e zera a banca (R$ 0)',
      danger: true,
      details: [
        <>Todas as transações serão <strong>apagadas permanentemente</strong>.</>,
        <>Seu saldo voltará para <strong>R$ 0,00</strong> (banca zerada).</>,
        <>Objetivos e perfil de risco são <strong>preservados</strong>.</>,
        <>É como começar do zero o controle da banca.</>,
      ],
      confirmLabel: 'Sim, resetar tudo',
      run: resetAll,
    },
  };

  const close = () => {
    if (isResetting) return;
    setSelected(null);
    onClose();
  };

  const goBack = () => {
    if (!isResetting) setSelected(null);
  };

  const handleConfirm = async () => {
    const opt = OPTIONS[selected];
    if (!opt) return;
    setIsResetting(true);
    try {
      const result = await opt.run();
      if (result?.success !== false) {
        if (onResetComplete) onResetComplete(selected, result?.resetInfo);
        setSelected(null);
        onClose();
      } else {
        alert(`Erro ao resetar: ${result?.error || 'tente novamente'}`);
      }
    } catch (error) {
      console.error('Erro no reset:', error);
      alert('Erro ao conectar com o servidor.');
    } finally {
      setIsResetting(false);
    }
  };

  const opt = selected ? OPTIONS[selected] : null;

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            {opt ? (
              <>
                <button className={styles.backButton} onClick={goBack} disabled={isResetting} aria-label="Voltar">
                  <IoArrowBack size={18} />
                </button>
                {opt.title}
              </>
            ) : (
              <><IoWarning size={18} /> Resetar dados</>
            )}
          </h2>
          <button onClick={close} className={styles.closeButton} disabled={isResetting} aria-label="Fechar">
            <IoClose size={20} />
          </button>
        </header>

        {!opt ? (
          <div className={styles.menu}>
            <p className={styles.menuHint}>O que você deseja resetar?</p>
            {Object.entries(OPTIONS).map(([key, o]) => (
              <button
                key={key}
                className={`${styles.optionRow} ${o.danger ? styles.optionDanger : ''}`}
                onClick={() => setSelected(key)}
              >
                <span className={styles.optionIcon}>{o.icon}</span>
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>{o.title}</span>
                  <span className={styles.optionSummary}>{o.summary}</span>
                </span>
                <IoChevronForward size={18} className={styles.optionArrow} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className={styles.content}>
              <ul className={styles.list}>
                {opt.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
              {opt.danger && (
                <p className={styles.danger}>
                  <IoWarning size={14} /> <strong>Esta ação não pode ser desfeita.</strong>
                </p>
              )}
            </div>
            <div className={styles.actions}>
              <button className={styles.cancelButton} onClick={goBack} disabled={isResetting}>
                Voltar
              </button>
              <button
                className={`${styles.confirmButton} ${opt.danger ? styles.confirmDanger : ''}`}
                onClick={handleConfirm}
                disabled={isResetting}
              >
                {isResetting ? 'Processando…' : opt.confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetModal;
