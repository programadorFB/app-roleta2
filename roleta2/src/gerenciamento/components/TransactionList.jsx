import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MdClose, MdEvent, MdAccessTime, MdEdit, MdDelete, MdInfoOutline, MdTouchApp } from 'react-icons/md';
import { FaPlusCircle, FaMinusCircle, FaReceipt } from 'react-icons/fa';
import { FinancialProvider, useFinancial } from '../contexts/FinancialContext';
import styles from './TransactionList.module.css';

// --- COMPONENTE DO MODAL DE EDIÇÃO ---
const EditTransactionModal = ({ visible, transaction, onClose, onSave }) => {
  const [editedTransaction, setEditedTransaction] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (transaction) {
      const raw = transaction.date;
      // Extrai a data SEM converter timezone (evita "pular" de dia).
      let dateInput;
      let timeInput;
      if (typeof raw === 'string' && raw.length >= 10) {
        dateInput = raw.substring(0, 10); // YYYY-MM-DD (já é a data local pretendida)
        timeInput = raw.includes('T') ? (raw.split('T')[1]?.substring(0, 5) || '12:00') : '12:00';
      } else {
        const d = raw ? new Date(raw) : new Date();
        dateInput = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        timeInput = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      setEditedTransaction({ ...transaction, dateInput, timeInput });
      setErrors({});
    }
  }, [transaction]);

  const validateFields = () => {
    const newErrors = {};
    if (!editedTransaction.category?.trim()) newErrors.category = 'Categoria é obrigatória';
    if (!editedTransaction.amount || editedTransaction.amount <= 0) newErrors.amount = 'Valor deve ser maior que zero';
    if (!editedTransaction.type) newErrors.type = 'Tipo é obrigatório';
    if (!editedTransaction.dateInput || !editedTransaction.timeInput) newErrors.date = 'Data e hora são obrigatórias';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateFields()) {
      alert('Erro: Por favor, corrija os campos antes de salvar.');
      return;
    }
    const dataToSave = {
      ...editedTransaction,
      // Envia a data local (YYYY-MM-DD); o backend ancora ao meio-dia, sem shift de fuso.
      date: editedTransaction.dateInput,
      amount: parseFloat(editedTransaction.amount),
      category: editedTransaction.category.trim(),
      description: editedTransaction.description?.trim() || '',
    };
    onSave(dataToSave);
    onClose();
  };

  const handleAmountChange = (e) => {
    const { value } = e.target;
    const numericValue = value.replace(/[^0-9,.]/g, '').replace(',', '.');
    setEditedTransaction(prev => ({ ...prev, amount: numericValue }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedTransaction(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleTypeChange = (type) => {
    setEditedTransaction(prev => ({ ...prev, type }));
    if (errors.type) {
      setErrors(prev => ({ ...prev, type: null }));
    }
  };

  const predefinedCategories = ['Alimentação', 'Transporte', 'Entretenimento', 'Saúde', 'Educação', 'Compras', 'Contas', 'Investimento', 'Emergência', 'Outros'];

  if (!visible) return null;

  return createPortal(
    <div className={styles.modalOverlay} style={{ zIndex: 3000 }}>
      <div className={styles.modalContainer}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Editar Transação</h2>
          <button onClick={onClose} className={styles.closeButton}>
            <MdClose size={24} />
          </button>
        </header>

        <div className={styles.modalContent}>
          {/* Tipo */}
          <div className={styles.inputContainer}>
            <label className={styles.inputLabel}>Tipo *</label>
            <div className={styles.typeContainer}>
              <button
                className={`${styles.typeButton} ${editedTransaction.type === 'deposit' ? styles.typeButtonActiveDeposit : ''}`}
                onClick={() => handleTypeChange('deposit')}
              >
                <FaPlusCircle /> Depósito
              </button>
              <button
                className={`${styles.typeButton} ${editedTransaction.type === 'withdraw' ? styles.typeButtonActiveWithdraw : ''}`}
                onClick={() => handleTypeChange('withdraw')}
              >
                <FaMinusCircle /> Saque
              </button>
              <button
                className={`${styles.typeButton} ${editedTransaction.type === 'gains' ? styles.typeButtonActiveDeposit : ''}`}
                onClick={() => handleTypeChange('gains')}
              >
                <FaPlusCircle /> Ganho
              </button>
              <button
                className={`${styles.typeButton} ${editedTransaction.type === 'losses' ? styles.typeButtonActiveWithdraw : ''}`}
                onClick={() => handleTypeChange('losses')}
              >
                <FaMinusCircle /> Perda
              </button>
            </div>
            {errors.type && <p className={styles.errorText}>{errors.type}</p>}
          </div>

          {/* Categoria */}
          <div className={styles.inputContainer}>
            <label className={styles.inputLabel}>Categoria *</label>
            <input
              type="text"
              name="category"
              className={`${styles.textInput} ${errors.category ? styles.inputError : ''}`}
              value={editedTransaction.category || ''}
              onChange={handleChange}
              placeholder="Digite ou selecione uma categoria"
            />
            {errors.category && <p className={styles.errorText}>{errors.category}</p>}
            <div className={styles.categoriesGrid}>
              {predefinedCategories.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.categoryChip} ${editedTransaction.category === cat ? styles.categoryChipSelected : ''}`}
                  onClick={() => setEditedTransaction(prev => ({ ...prev, category: cat }))}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div className={styles.inputContainer}>
            <label className={styles.inputLabel}>Valor (R$) *</label>
            <input
              type="text"
              inputMode="decimal"
              className={`${styles.textInput} ${errors.amount ? styles.inputError : ''}`}
              value={editedTransaction.amount || ''}
              onChange={handleAmountChange}
              placeholder="0,00"
            />
            {errors.amount && <p className={styles.errorText}>{errors.amount}</p>}
          </div>

          {/* Data e Hora */}
          <div className={styles.inputContainer}>
            <label className={styles.inputLabel}>Data e Hora *</label>
            <div className={styles.dateTimeContainer}>
              <div className={styles.dateTimeInputWrapper}>
                <MdEvent className={styles.dateTimeIcon} />
                <input type="date" name="dateInput" value={editedTransaction.dateInput || ''} onChange={handleChange} className={styles.dateTimeInput} />
              </div>
              <div className={styles.dateTimeInputWrapper}>
                <MdAccessTime className={styles.dateTimeIcon} />
                <input type="time" name="timeInput" value={editedTransaction.timeInput || ''} onChange={handleChange} className={styles.dateTimeInput} />
              </div>
            </div>
            {errors.date && <p className={styles.errorText}>{errors.date}</p>}
          </div>

          {/* Descrição */}
          <div className={styles.inputContainer}>
            <label className={styles.inputLabel}>Descrição (Opcional)</label>
            <textarea
              name="description"
              className={styles.textInput}
              value={editedTransaction.description || ''}
              onChange={handleChange}
              placeholder="Adicione uma descrição..."
              rows={3}
            />
          </div>
        </div>

        <footer className={styles.modalActions}>
          <button className={styles.cancelButton} onClick={onClose}>Cancelar</button>
          <button className={styles.saveButton} onClick={handleSave}>Salvar Alterações</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

// --- COMPONENTE DO ITEM DA TRANSAÇÃO ---
const TransactionItem = ({ item, showActions = true }) => {
  const { updateTransaction, deleteTransaction, refreshData } = useFinancial();
  const [actionsVisible, setActionsVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Função para determinar as cores e ícones baseados no tipo
  const getTransactionInfo = () => {
    switch (item.type) {
      case 'deposit':
      case 'gains':
        return {
          isPositive: true,
          icon: <FaPlusCircle className={styles.depositColor} size={20} />,
          sideIndicatorClass: styles.depositBg,
          iconBgClass: styles.depositIconBg,
          amountClass: styles.depositColor,
          sign: '+',
          typeLabel: item.type === 'gains' ? 'Ganho' : 'Depósito'
        };
      case 'withdraw':
      case 'losses':
        return {
          isPositive: false,
          icon: <FaMinusCircle className={styles.withdrawColor} size={20} />,
          sideIndicatorClass: styles.withdrawBg,
          iconBgClass: styles.withdrawIconBg,
          amountClass: styles.withdrawColor,
          sign: '-',
          typeLabel: item.type === 'losses' ? 'Perda' : 'Saque'
        };
      default:
        // Fallback para tipos desconhecidos
        const isPositive = parseFloat(item.amount) >= 0;
        return {
          isPositive,
          icon: isPositive ? 
            <FaPlusCircle className={styles.depositColor} size={20} /> : 
            <FaMinusCircle className={styles.withdrawColor} size={20} />,
          sideIndicatorClass: isPositive ? styles.depositBg : styles.withdrawBg,
          iconBgClass: isPositive ? styles.depositIconBg : styles.withdrawIconBg,
          amountClass: isPositive ? styles.depositColor : styles.withdrawColor,
          sign: isPositive ? '+' : '-',
          typeLabel: 'Transação'
        };
    }
  };

  const transactionInfo = getTransactionInfo();
  const amountValue = Math.abs(parseFloat(item.amount) || 0);

  // Categoria exibida: traduz o marcador técnico "initial_bank" para "Banca Inicial"
  const isInitialBank = item.is_initial_bank || item.isInitialBank || item.category === 'initial_bank';
  const displayCategory = isInitialBank ? 'Banca Inicial' : (item.category || 'Não categorizado');

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const handleEdit = (e) => {
    e.stopPropagation();
    setEditModalVisible(true);
    setActionsVisible(false);
  };
  
  const handleDelete = (e) => {
    e.stopPropagation();
    const confirmationMessage = `Tem certeza que deseja excluir a transação "${item.category}"?\n\nValor: ${formatCurrency(item.amount)}\nData: ${formatDate(item.date)}\nTipo: ${transactionInfo.typeLabel}\n\nEsta ação não pode ser desfeita.`;
    if (window.confirm(confirmationMessage)) {
      confirmDelete();
    }
    setActionsVisible(false);
  };
  
  const confirmDelete = async () => {
    try {
      setIsDeleting(true); // Ativa a animação de saída
      setTimeout(async () => {
        const result = await deleteTransaction(item.id);
        if (result.success) {
          alert('Transação excluída com sucesso!');
          await refreshData();
        } else {
          alert(result.error || 'Não foi possível excluir a transação.');
          setIsDeleting(false); // Reverte se der erro
        }
      }, 300); // Espera a animação terminar
    } catch (error) {
      alert('Erro ao excluir a transação.');
      setIsDeleting(false);
    }
  };

  const handleSaveTransaction = async (editedTransaction) => {
    try {
      const result = await updateTransaction(editedTransaction.id, editedTransaction);
      if (result.success) {
        alert('Transação atualizada com sucesso!');
        await refreshData();
      } else {
        alert(result.error || 'Não foi possível atualizar a transação.');
      }
    } catch (error) {
      alert('Erro ao atualizar a transação.');
    }
  };

  const itemClasses = `${styles.transactionItem} ${isDeleting ? styles.isDeleting : ''}`;

  return (
    <>
      <div className={itemClasses} onClick={() => showActions && setActionsVisible(!actionsVisible)}>
        <div className={`${styles.sideIndicator} ${transactionInfo.sideIndicatorClass}`} />
        
        <div className={`${styles.transactionIcon} ${transactionInfo.iconBgClass}`}>
          {transactionInfo.icon}
        </div>
        
        <div className={styles.transactionDetails}>
          <div className={styles.categoryRow}>
            <p className={styles.transactionCategory}>{displayCategory}</p>
            <span className={styles.typeBadge}>{transactionInfo.typeLabel}</span>
          </div>
          <p className={styles.transactionDate}>{formatDate(item.date)}</p>
          {item.description && <p className={styles.transactionDescription}>{item.description}</p>}
        </div>
        
        <div className={styles.transactionAmountContainer}>
          <p className={`${styles.transactionAmount} ${transactionInfo.amountClass}`}>
            {transactionInfo.sign} {formatCurrency(amountValue)}
          </p>
          {showActions && <span className={styles.longPressHint}>Clique para ações</span>}
        </div>

        {showActions && (
          <div className={`${styles.actionButtonsContainer} ${actionsVisible ? styles.actionsVisible : ''}`}>
            <button className={styles.editActionButton} onClick={handleEdit}>
              <MdEdit size={18} /> Editar
            </button>
            <button className={styles.deleteActionButton} onClick={handleDelete}>
              <MdDelete size={18} /> Excluir
            </button>
          </div>
        )}
      </div>

      <EditTransactionModal
        visible={editModalVisible}
        transaction={item}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveTransaction}
      />
    </>
  );
};

// --- COMPONENTE PRINCIPAL DA LISTA ---
const TransactionList = ({ transactions, showActions = true, emptyMessage, sortByRecent = true }) => {
  // Ordena as transações por data (mais recentes primeiro)
  const sortedTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    return [...transactions].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      
      if (sortByRecent) {
        // Mais recentes primeiro (padrão)
        return dateB - dateA;
      } else {
        // Mais antigos primeiro
        return dateA - dateB;
      }
    });
  }, [transactions, sortByRecent]);

  if (!transactions || transactions.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyIconContainer}><FaReceipt size={50} /></div>
        <p className={styles.emptyText}>{emptyMessage || 'Nenhuma transação ainda'}</p>
        <p className={styles.emptySubtext}>As transações aparecerão aqui assim que você adicionar uma.</p>
        {showActions && (
          <div className={styles.tipContainer}>
            <MdInfoOutline size={16} />
            <p className={styles.tipText}>Clique em uma transação para editá-la ou excluí-la.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.listContainer}>
      {sortedTransactions.map((transaction) => (
        <TransactionItem key={transaction.id} item={transaction} showActions={showActions} />
      ))}
      {showActions && sortedTransactions.length > 3 && (
        <div className={styles.listFooter}>
          <div className={styles.tipContainer}>
            <MdTouchApp size={16} />
            <p className={styles.tipText}>Clique em qualquer transação para editar ou excluir.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionList;