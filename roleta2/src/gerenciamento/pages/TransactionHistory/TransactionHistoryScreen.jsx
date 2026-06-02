import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancial } from '../../contexts/FinancialContext';
import { MdArrowBack, MdInfoOutline, MdEdit, MdDelete, MdClose, MdEvent, MdAccessTime } from 'react-icons/md';
import { FaPlusCircle, FaMinusCircle, FaReceipt } from 'react-icons/fa';
import styles from './TransactionHistoryScreen.module.css';

// Cores metálicas
const METALLIC_COLORS = {
    gold: '#D4AF37',
    greenMetal: '#5A8A6A',
    redMetal: '#A44A4A',
};

// --- Edit Transaction Modal (Web Version) ---
const EditTransactionModal = ({ visible, transaction, onClose, onSave }) => {
    const [editedTransaction, setEditedTransaction] = useState({});
    
    React.useEffect(() => {
        if (transaction) {
            const dateObj = new Date(transaction.date);
            setEditedTransaction({
                ...transaction,
                dateInput: dateObj.toISOString().split('T')[0], // YYYY-MM-DD
                timeInput: dateObj.toTimeString().split(' ')[0].substring(0, 5), // HH:MM
            });
        }
    }, [transaction]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEditedTransaction(prev => ({ ...prev, [name]: value }));
    };

    const handleTypeChange = (e) => {
        const { value } = e.target;
        setEditedTransaction(prev => ({ ...prev, type: value }));
    };

    const handleSave = () => {
        const finalDate = new Date(`${editedTransaction.dateInput}T${editedTransaction.timeInput}:00`);
        const normalizedTransaction = {
            ...editedTransaction,
            date: finalDate.toISOString(),
            amount: parseFloat(String(editedTransaction.amount).replace(',', '.')),
        };
        onSave(normalizedTransaction);
        onClose();
    };

    if (!visible) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContainer}>
                <header className={styles.modalHeader}>
                    <h3>Editar Transação</h3>
                    <button onClick={onClose}><MdClose size={24} /></button>
                </header>
                <main className={styles.modalContent}>
                    <div className={styles.inputGroup}>
                        <label>Tipo de Transação</label>
                        <select name="type" value={editedTransaction.type || ''} onChange={handleTypeChange}>
                            <option value="deposit">Depósito</option>
                            <option value="withdraw">Saque</option>
                            <option value="gains">Ganho</option>
                            <option value="losses">Perda</option>
                        </select>
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Categoria</label>
                        <input type="text" name="category" value={editedTransaction.category || ''} onChange={handleChange} />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Valor (R$)</label>
                        <input type="text" inputMode="decimal" name="amount" value={editedTransaction.amount || ''} onChange={handleChange} />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Data e Hora</label>
                        <div className={styles.dateTimeContainer}>
                            <input type="date" name="dateInput" value={editedTransaction.dateInput || ''} onChange={handleChange} />
                            <input type="time" name="timeInput" value={editedTransaction.timeInput || ''} onChange={handleChange} />
                        </div>
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Descrição</label>
                        <textarea name="description" value={editedTransaction.description || ''} onChange={handleChange} rows="3"></textarea>
                    </div>
                </main>
                <footer className={styles.modalActions}>
                    <button className={styles.cancelButton} onClick={onClose}>Cancelar</button>
                    <button className={styles.saveButton} onClick={handleSave}>Salvar</button>
                </footer>
            </div>
        </div>
    );
};

// --- Transaction Item (Web Version) ---
const TransactionItem = React.memo(({ item, onEdit, onDelete }) => {
    // Função para determinar se é entrada (positiva) ou saída (negativa)
    const getTransactionInfo = (transaction) => {
        const amount = parseFloat(transaction.amount) || 0;
        
        switch (transaction.type) {
            case 'deposit':
            case 'gains':
                return {
                    isPositive: true,
                    icon: <FaPlusCircle color={METALLIC_COLORS.greenMetal} size={20} />,
                    color: METALLIC_COLORS.greenMetal,
                    backgroundColor: 'rgba(90, 138, 106, 0.15)',
                    sign: '+'
                };
            case 'withdraw':
            case 'losses':
                return {
                    isPositive: false,
                    icon: <FaMinusCircle color={METALLIC_COLORS.redMetal} size={20} />,
                    color: METALLIC_COLORS.redMetal,
                    backgroundColor: 'rgba(164, 74, 74, 0.15)',
                    sign: '-'
                };
            default:
                // Fallback baseado no valor se o tipo não for reconhecido
                const isPositive = amount >= 0;
                return {
                    isPositive,
                    icon: isPositive ? 
                        <FaPlusCircle color={METALLIC_COLORS.greenMetal} size={20} /> : 
                        <FaMinusCircle color={METALLIC_COLORS.redMetal} size={20} />,
                    color: isPositive ? METALLIC_COLORS.greenMetal : METALLIC_COLORS.redMetal,
                    backgroundColor: isPositive ? 'rgba(90, 138, 106, 0.15)' : 'rgba(164, 74, 74, 0.15)',
                    sign: isPositive ? '+' : '-'
                };
        }
    };

    const transactionInfo = getTransactionInfo(item);
    const amountValue = Math.abs(parseFloat(item.amount) || 0);
    
    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
    }).format(value);
    
    const formatDate = (dateStr) => new Date(dateStr).toLocaleString('pt-BR', { 
        dateStyle: 'short', 
        timeStyle: 'short' 
    });

    const getTypeLabel = (type) => {
        const labels = {
            'deposit': 'Depósito',
            'withdraw': 'Saque',
            'gains': 'Ganho',
            'losses': 'Perda'
        };
        return labels[type] || type;
    };

    return (
        <div className={styles.itemContainer}>
            <div className={styles.itemTouchable}>
                <div 
                    className={styles.iconContainer} 
                    style={{ backgroundColor: transactionInfo.backgroundColor }}
                >
                    {transactionInfo.icon}
                </div>
                <div className={styles.detailsContainer}>
                    <div className={styles.categoryRow}>
                        <p className={styles.itemCategory}>
                            {item.category || 'Não categorizado'}
                        </p>
                        <span className={styles.typeBadge}>
                            {getTypeLabel(item.type)}
                        </span>
                    </div>
                    <p className={styles.itemDate}>{formatDate(item.date)}</p>
                    {item.description && (
                        <p className={styles.itemDescription}>{item.description}</p>
                    )}
                </div>
                <p 
                    className={styles.itemAmount} 
                    style={{ color: transactionInfo.color }}
                >
                    {transactionInfo.sign} {formatCurrency(amountValue)}
                </p>
            </div>
            <div className={styles.permanentActions}>
                <button onClick={() => onEdit(item)} className={styles.editButton}>
                    <MdEdit size={18} />
                </button>
                <button onClick={() => onDelete(item.id)} className={styles.deleteButton}>
                    <MdDelete size={18} />
                </button>
            </div>
        </div>
    );
});

// --- Main Screen Component (Web Version) ---
const TransactionHistoryScreen = () => {
    const navigate = useNavigate();
    const { transactions, loading, refreshData, updateTransaction, deleteTransaction } = useFinancial();
    const [filter, setFilter] = useState('all');
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const onRefresh = useCallback(() => { refreshData(true); }, [refreshData]);

    const handleEditTransaction = (transaction) => {
        setSelectedTransaction(transaction);
        setEditModalVisible(true);
    };
    
    const handleSaveTransaction = async (editedTransaction) => {
        await updateTransaction(editedTransaction.id, editedTransaction);
        onRefresh(); // Refresh data after update
    };

    const handleDeleteTransaction = (transactionId) => {
        if (window.confirm('Tem certeza que deseja excluir esta transação?')) {
            deleteTransaction(transactionId).then(() => onRefresh());
        }
    };

    const filteredTransactions = useMemo(() => {
        const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (filter === 'all') return sorted;
        
        // Filtro para entradas (positivas)
        if (filter === 'incomes') {
            return sorted.filter(tx => tx.type === 'deposit' || tx.type === 'gains');
        }
        
        // Filtro para saídas (negativas)
        if (filter === 'outcomes') {
            return sorted.filter(tx => tx.type === 'withdraw' || tx.type === 'losses');
        }
        
        // Filtro individual por tipo
        return sorted.filter(tx => tx.type === filter);
    }, [transactions, filter]);
    
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <button onClick={() => navigate(-1)} className={styles.backButton}>
                    <MdArrowBack size={24} />
                </button>
                <h1>Histórico de Transações</h1>
                <button className={styles.infoButton} onClick={() => alert('Para editar ou excluir uma transação, use os botões à direita de cada item.')}>
                    <MdInfoOutline size={20} />
                </button>
            </header>

            <div className={styles.filterContainer}>
                <button onClick={() => setFilter('all')} className={filter === 'all' ? styles.filterActive : ''}>
                    Todas
                </button>
                <button onClick={() => setFilter('incomes')} className={filter === 'incomes' ? styles.filterActive : ''}>
                    Entradas
                </button>
                <button onClick={() => setFilter('outcomes')} className={filter === 'outcomes' ? styles.filterActive : ''}>
                    Saídas
                </button>
                <button onClick={() => setFilter('gains')} className={filter === 'gains' ? styles.filterActive : ''}>
                    Ganhos
                </button>
                <button onClick={() => setFilter('losses')} className={filter === 'losses' ? styles.filterActive : ''}>
                    Loss
                </button>
            </div>

            <main className={styles.listContainer}>
                {loading && transactions.length === 0 ? (
                    <div className={styles.loadingContainer}>Carregando...</div>
                ) : filteredTransactions.length === 0 ? (
                    <div className={styles.emptyContainer}>
                        <FaReceipt size={50} />
                        <p>Nenhuma Transação Encontrada</p>
                    </div>
                ) : (
                    filteredTransactions.map(item => (
                        <TransactionItem 
                            key={item.id} 
                            item={item} 
                            onEdit={handleEditTransaction} 
                            onDelete={handleDeleteTransaction} 
                        />
                    ))
                )}
            </main>
            
            <EditTransactionModal
                visible={editModalVisible}
                transaction={selectedTransaction}
                onClose={() => setEditModalVisible(false)}
                onSave={handleSaveTransaction}
            />
        </div>
    );
};

export default TransactionHistoryScreen;