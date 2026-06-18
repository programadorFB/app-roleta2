import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFinancial } from '../../contexts/FinancialContext';

// --- Icons ---
import { IoArrowBack, IoCalendar, IoAddCircle, IoRemoveCircle, IoTrendingUp, IoTrendingDown, IoCheckmark } from 'react-icons/io5';

// --- CSS Module ---
import styles from './TransactionScreen.module.css';

// --- Constants & Utilities ---
const TRANSACTION_TYPES = [
  { name: 'Depósito', key: 'deposit', icon: <IoAddCircle />, color: '#34d399', description: 'Dinheiro adicionado à banca' },
  { name: 'Saque', key: 'withdraw', icon: <IoRemoveCircle />, color: '#f87171', description: 'Dinheiro retirado da banca' },
  { name: 'Ganhos', key: 'gains', icon: <IoTrendingUp />, color: '#c9a052', description: 'Lucros obtidos em operações' },
  { name: 'Perda', key: 'losses', icon: <IoTrendingDown />, color: '#FFC107', description: 'Prejuízos em operações' }
];

// Data local (YYYY-MM-DD). NÃO usar toISOString() aqui: ele converte pra UTC e,
// à noite no Brasil (UTC-3), "hoje" vira amanhã → transação ia 1 dia pra frente.
const getCurrentDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// --- Reusable Sub-Components ---
// ✅ CORREÇÃO: Mudado defaultValue para value
const DatePicker = ({ visible, onClose, onDateSelect, selectedDate }) => {
  if (!visible) return null;
  return (
    <div className={styles.datePickerOverlay} onClick={onClose}>
      <div className={styles.datePickerContainer} onClick={e => e.stopPropagation()}>
        <h3>Selecione a Data</h3>
        <input 
          type="date" 
          value={selectedDate || ''} 
          onChange={e => onDateSelect(e.target.value)} 
        />
        <button onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
};

const DateInput = ({ value, onDateChange }) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const displayDate = value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }) : '';
  
  return (
    <div className={styles.dateInputContainer}>
      <input 
        type="text" 
        readOnly 
        value={displayDate} 
        onClick={() => setPickerVisible(true)} 
        placeholder="Selecione uma data" 
        className={styles.input} 
      />
      <button type="button" className={styles.calendarIcon} onClick={() => setPickerVisible(true)}>
        <IoCalendar />
      </button>
      <DatePicker 
        visible={pickerVisible} 
        onClose={() => setPickerVisible(false)} 
        onDateSelect={(newDate) => {
          onDateChange(newDate);
          setPickerVisible(false); // ✅ Fecha o picker após selecionar
        }} 
        selectedDate={value} 
      />
    </div>
  );
};

// --- Main Screen Component ---
const TransactionScreen = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { addTransaction } = useFinancial();

  const params = new URLSearchParams(location.search);
  const typeParam = params.get('type');
  const dateParam = params.get('defaultDate');

  const [transactionType, setTransactionType] = useState(typeParam || 'deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dateParam || getCurrentDate());
  const [loading, setLoading] = useState(false);
  const [isInitialBank, setIsInitialBank] = useState(false);
  
  const isValid = useMemo(() => amount && parseFloat(amount.replace(',', '.')) > 0 && date && transactionType, [amount, date, transactionType]);

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!isValid) return alert('Por favor, preencha todos os campos corretamente.');
    
    // ✅ Debug log para verificar a data
    console.log('📅 Data sendo enviada:', date);
    
    setLoading(true);
    const numericAmount = parseFloat(amount.replace(',', '.'));
    const selectedType = TRANSACTION_TYPES.find(type => type.key === transactionType);

    const result = await addTransaction({
      type: transactionType,
      amount: numericAmount,
      description: selectedType.name,
      category: selectedType.name,
      date,
      isInitialBank,
    });
    
    setLoading(false);
    
    if (result?.success) {
      alert('Transação adicionada com sucesso!');
      navigate('/dashboard');
    } else {
      alert(result?.error || 'Erro ao adicionar transação');
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}>
          <IoArrowBack /> Voltar
        </button>
        <h1>Nova Transação</h1>
        <div className={styles.headerSpacer} />
      </header>

      <main className={styles.content}>
        <form onSubmit={handleAddTransaction} className={styles.formContainer}>
          <div className={styles.inputGroup}>
            <label>Tipo de Transação *</label>
            <div className={styles.typeGrid}>
              {TRANSACTION_TYPES.map((type) => (
                <button
                  key={type.key}
                  type="button"
                  className={`${styles.typeButton} ${transactionType === type.key ? styles.typeButtonActive : ''}`}
                  onClick={() => setTransactionType(type.key)}
                  style={{'--type-color': type.color}}
                >
                  <div className={styles.typeButtonIcon}>{type.icon}</div>
                  <div className={styles.typeButtonText}>
                    <strong>{type.name}</strong>
                    <span>{type.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="amount">Valor *</label>
            <input 
              id="amount" 
              type="text" 
              inputMode="decimal" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              placeholder="R$ 0,00" 
              className={styles.input} 
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Data *</label>
            <DateInput value={date} onDateChange={setDate} />
          </div>
          
          {/* ✅ CORREÇÃO: Adicionado o checkbox de banca inicial que estava faltando */}
          {transactionType === 'deposit' && (
            <div className={styles.checkboxContainer} onClick={() => setIsInitialBank(!isInitialBank)}>
              <div className={`${styles.checkbox} ${isInitialBank ? styles.checkboxActive : ''}`}>
                {isInitialBank && <IoCheckmark />}
              </div>
              <div>
                <label className={styles.checkboxLabel}>Banca Inicial</label>
                <p className={styles.checkboxDescription}>Marque se este é um depósito inicial.</p>
              </div>
            </div>
          )}

          {transactionType === 'deposit' && isInitialBank && (
            <p className={styles.initialBankWarning}>
              ⚠️ Essa ação irá redefinir sua banca inicial.
            </p>
          )}

          <button type="submit" className={styles.submitButton} disabled={!isValid || loading}>
            {loading ? 'Processando...' : `Processar ${TRANSACTION_TYPES.find(t => t.key === transactionType)?.name}`}
          </button>
        </form>
      </main>
    </div>
  );
};

export default TransactionScreen;