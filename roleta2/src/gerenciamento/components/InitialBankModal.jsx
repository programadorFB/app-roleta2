import React, { useState, useEffect } from 'react';
import { IoClose } from 'react-icons/io5';
import styles from './InitialBankModal.module.css';

/**
 * Modal limpo para inserir/ajustar a banca inicial — substitui o prompt() do
 * navegador. `onSave(valor)` deve retornar { ok: boolean, error?: string }.
 */
const InitialBankModal = ({ open, currentValue, onSave, onClose }) => {
  const isEdit = currentValue != null && Number(currentValue) > 0;
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue(isEdit ? String(currentValue).replace('.', ',') : '');
      setError('');
      setSaving(false);
    }
  }, [open, currentValue, isEdit]);

  if (!open) return null;

  const handleSave = async () => {
    setError('');
    setSaving(true);
    const result = await onSave(value);
    setSaving(false);
    if (result?.ok) {
      onClose();
    } else {
      setError(result?.error || 'Não foi possível salvar. Tente de novo.');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isEdit ? 'Ajustar banca inicial' : 'Insira sua banca inicial'}
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <IoClose size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.subtitle}>
            {isEdit
              ? 'Atualize o valor com que você começou. Seu saldo será recalculado.'
              : 'Quanto você está colocando para começar? É o valor de partida da sua banca.'}
          </p>

          <div className={styles.inputWrap}>
            <span className={styles.currency}>R$</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="0,00"
              className={styles.input}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className={styles.save} onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitialBankModal;
