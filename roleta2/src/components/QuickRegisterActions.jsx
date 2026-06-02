import React, { useState } from 'react';
import apiService from '../gerenciamento/services/api';
import styles from './QuickRegisterActions.module.css';

// Ações rápidas para registrar lançamentos da banca (gerenciamento) sem sair
// do dashboard principal da ferramenta. Usa o mesmo apiService embarcado
// (/api/gerenciamento, auth via localStorage authToken + userEmail).

const TYPES = [
  { key: 'gains', label: 'Ganho', variant: 'pos' },
  { key: 'losses', label: 'Perda', variant: 'neg' },
  { key: 'deposit', label: 'Depósito', variant: 'pos' },
  { key: 'withdraw', label: 'Saque', variant: 'neg' },
];

const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const QuickRegisterActions = () => {
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { ok, msg }

  const open = (type) => {
    setSelected(type);
    setAmount('');
    setFeedback(null);
  };

  const close = () => {
    if (!saving) setSelected(null);
  };

  const submit = async () => {
    const value = parseFloat(String(amount).replace(',', '.'));
    if (!value || value <= 0) {
      setFeedback({ ok: false, msg: 'Informe um valor válido.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiService.createTransaction({
        type: selected.key,
        amount: value,
        date: todayLocal(),
      });
      if (res?.success) {
        setFeedback({ ok: true, msg: `${selected.label} de ${formatBRL(value)} registrado!` });
        setAmount('');
        setTimeout(() => { setSelected(null); setFeedback(null); }, 1300);
      } else {
        setFeedback({ ok: false, msg: res?.error || 'Não foi possível registrar.' });
      }
    } catch (err) {
      setFeedback({ ok: false, msg: 'Erro ao conectar com o servidor.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <span className={styles.title}>Registro rápido</span>
      <div className={styles.buttons}>
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={`${styles.actionBtn} ${styles[t.variant]}`}
            onClick={() => open(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className={styles.overlay} onClick={close}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Registrar {selected.label}</h3>
            <label className={styles.label}>Valor (R$)</label>
            <input
              className={styles.input}
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9,.]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="0,00"
            />
            {feedback && (
              <p className={feedback.ok ? styles.ok : styles.err}>{feedback.msg}</p>
            )}
            <div className={styles.modalActions}>
              <button className={styles.cancel} onClick={close} disabled={saving}>
                Cancelar
              </button>
              <button className={styles.confirm} onClick={submit} disabled={saving}>
                {saving ? 'Salvando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickRegisterActions;
