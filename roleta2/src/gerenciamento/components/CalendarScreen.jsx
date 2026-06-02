import React, { useState, useMemo, useEffect } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { useFinancial } from '../contexts/FinancialContext'; 
import TransactionList from '../components/TransactionList'; 
import { 
    IoArrowBack, 
    IoChevronBack, 
    IoChevronForward, 
    IoClose, 
    IoAdd,
    IoPlayBack,
    IoPlayForward
} from 'react-icons/io5';
import styles from './CalendarScreen.module.css';
// Função auxiliar para formatar a data que vai na URL quando clicamos em "Adicionar Transação"
const formatLocalDate = (date) => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const CalendarGrid = ({ currentDate, transactionsByDay, onDayClick }) => {
  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatCompact = (num) => {
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace('R$', '');
  }

  const days = useMemo(() => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const daysArray = [];
    const firstDayOfWeek = date.getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    const prevMonthDays = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
    for (let i = firstDayOfWeek; i > 0; i--) {
      daysArray.push({
        date: null,
        day: prevMonthDays - i + 1,
        isOtherMonth: true,
        summary: { gain: 0, loss: 0, deposit: 0, withdrawal: 0 }
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const fullDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      
      // GERA A CHAVE DO DIA (YYYY-MM-DD) DE FORMA SEGURA
      const dateKey = formatLocalDate(fullDate);
      
      const dailyTransactions = transactionsByDay[dateKey] || [];
      
      let dailyGain = 0;
      let dailyLoss = 0;
      let dailyDeposit = 0;
      let dailyWithdrawal = 0;

      dailyTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0; 
        if (tx.type === 'gains') dailyGain += amount;
        else if (tx.type === 'losses') dailyLoss += amount;
        else if (tx.type === 'deposit') dailyDeposit += amount;
        else if (tx.type === 'withdraw') dailyWithdrawal += amount;
      });

      daysArray.push({
        date: fullDate,
        day: i,
        isOtherMonth: false,
        isToday: fullDate.getTime() === today.getTime(),
        hasData: dailyTransactions.length > 0,
        transactions: dailyTransactions,
        summary: { gain: dailyGain, loss: dailyLoss, deposit: dailyDeposit, withdrawal: dailyWithdrawal },
      });
    }

    const remainingCells = 42 - daysArray.length; 
    for (let i = 1; i <= remainingCells; i++) {
      daysArray.push({ date: null, day: i, isOtherMonth: true, summary: { gain: 0, loss: 0, deposit: 0, withdrawal: 0 } });
    }

    return daysArray;
  }, [currentDate, transactionsByDay, today]);

  return (
    <table className={styles.calendarGrid}>
      <thead>
        <tr>{daysOfWeek.map((day) => <th key={day} className={styles.dayHeader}>{day}</th>)}</tr>
      </thead>
      <tbody>
        {Array.from({ length: 6 }).map((_, weekIndex) => (
          <tr key={weekIndex}>
            {days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
              const cellClasses = [
                styles.dayCell,
                day.isOtherMonth ? styles.otherMonth : '',
                day.isToday ? styles.today : '',
                (day.summary.gain > 0 || day.summary.loss > 0 || day.summary.deposit > 0 || day.summary.withdrawal > 0) ? styles.dayWithData : '',
              ].join(' ');

              return (
                <td
                  key={day.isOtherMonth ? `p-${weekIndex}-${dayIndex}` : day.day}
                  className={cellClasses}
                  onClick={() => !day.isOtherMonth && onDayClick(day.date, day.transactions)}
                >
                  <div className={styles.dayNumber}>{day.day}</div>
                  {(day.summary.gain > 0 || day.summary.loss > 0 || day.summary.deposit > 0 || day.summary.withdrawal > 0) && (
                    <div className={styles.daySummary}>
                      {day.summary.gain > 0 && <span className={styles.summaryGain}>+{formatCompact(day.summary.gain)}</span>}
                      {day.summary.loss > 0 && <span className={styles.summaryLoss}>-{formatCompact(day.summary.loss)}</span>}
                      {day.summary.deposit > 0 && <span className={styles.summaryDeposit}>+{formatCompact(day.summary.deposit)}</span>}
                      {day.summary.withdrawal > 0 && <span className={styles.summaryWithdrawal}>-{formatCompact(day.summary.withdrawal)}</span>}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const DayTransactionsModal = ({ date, transactions, onClose }) => {
  const navigate = useNavigate();
  const { dailyNotes, saveDailyNote } = useFinancial();
  const [noteText, setNoteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const noteDateKey = useMemo(() => formatLocalDate(date), [date]);

  useEffect(() => {
    if (noteDateKey && dailyNotes) {
      setNoteText(dailyNotes[noteDateKey] || '');
    } else {
      setNoteText('');
    }
  }, [noteDateKey, dailyNotes]);

  if (!date) return null;

  const handleSaveNote = async () => {
    if (!saveDailyNote || !noteDateKey) return;
    setIsSaving(true);
    try { await saveDailyNote(noteDateKey, noteText); } 
    catch (error) { console.error("Erro ao salvar anotação:", error); } 
    finally { setIsSaving(false); }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContainer}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</h2>
          <button onClick={onClose} className={styles.closeButton}><IoClose size={24} /></button>
        </header>
        
        <div className={styles.notesSection}>
          <h4 className={styles.notesTitle}>Anotações do Dia</h4>
          <textarea className={styles.notesTextarea} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Observações..." rows={4} />
          <button className={styles.saveNoteButton} onClick={handleSaveNote} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Anotação'}</button>
        </div>

        <div className={styles.modalContent}>
          <h4 className={styles.notesTitle}>Transações do Dia</h4>
          <TransactionList transactions={transactions} showActions={true} emptyMessage="Nenhuma transação." />
        </div>
        
        <div className={styles.modalActions}>
          <button className={styles.addTransactionButton} onClick={() => navigate(`/transaction?defaultDate=${noteDateKey}`)}>
            <IoAdd /> Adicionar Transação
          </button>
        </div>
      </div>
    </div>
  );
};

const CalendarScreen = () => {
  const navigate = useNavigate();
  const { transactions } = useFinancial();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalDate, setModalDate] = useState(null);
  const [modalTransactions, setModalTransactions] = useState([]);
  
  // LOGICA PRINCIPAL DE AGRUPAMENTO (EVITA BUG DE FUSO HORÁRIO)
  const transactionsByDay = useMemo(() => {
    const map = {};
    transactions.forEach(tx => {
      try {
        let dateKey;
        // Pega os 10 primeiros caracteres (YYYY-MM-DD) diretamente da string
        // Isso impede que o navegador converta para o dia anterior por causa do fuso horário
        if (typeof tx.date === 'string' && tx.date.length >= 10) {
            dateKey = tx.date.substring(0, 10);
        } else if (tx.date instanceof Date) {
            dateKey = formatLocalDate(tx.date);
        } else {
            // Fallback
            dateKey = new Date(tx.date).toISOString().split('T')[0];
        }
        
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(tx);
      } catch (e) {
        console.error("Erro data:", tx);
      }
    });
    return map;
  }, [transactions]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const handlePrevYear = () => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
  const handleNextYear = () => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));

  const handleDayClick = (date, transactions) => {
    setModalDate(date);
    setModalTransactions(transactions);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}>
          <IoArrowBack /> Voltar
        </button>
        
        <div className={styles.headerControls}>
          <button className={`${styles.navButton} ${styles.yearButton}`} onClick={handlePrevYear}>
            <IoPlayBack />
          </button>
          <button className={styles.navButton} onClick={handlePrevMonth}>
            <IoChevronBack />
          </button>
          <h1 className={styles.monthTitle}>
            {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h1>
          <button className={styles.navButton} onClick={handleNextMonth}>
            <IoChevronForward />
          </button>
          <button className={`${styles.navButton} ${styles.yearButton}`} onClick={handleNextYear}>
            <IoPlayForward />
          </button>
        </div>

      </header>

      <main className={styles.content}>
        <CalendarGrid 
          currentDate={currentDate} 
          transactionsByDay={transactionsByDay} 
          onDayClick={handleDayClick} 
        />
      </main>

      <DayTransactionsModal 
        date={modalDate} 
        transactions={modalTransactions} 
        onClose={() => { 
          setModalDate(null); 
          setModalTransactions([]); 
        }} 
      />

    </div>
  );
};

export default CalendarScreen;