import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import * as XLSX from 'xlsx';
import { useFinancial } from '../../contexts/FinancialContext';
import { useAuth } from '../../contexts/AuthContext';
import FinancialReportPDF from '../../components/FinancialReportPDF';
import { IoArrowBack } from 'react-icons/io5';
import { FaFilePdf, FaFileExcel } from 'react-icons/fa';

// Importando o arquivo de estilos CSS Module
import styles from './ReportScreen.module.css';

const ReportScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    transactions, 
    balance, 
    initialBankBalance,
    totalDeposits,
    totalWithdraws,
    totalGains,
    totalLosses,
    loading
  } = useFinancial();

  // Função para exportar para Excel
  const handleExportToExcel = () => {
    // Preparar dados do resumo
    const summaryData = [
      ['RESUMO FINANCEIRO'],
      [''],
      ['Usuário:', user?.name || 'N/A'],
      ['Email:', user?.email || 'N/A'],
      ['Data do Relatório:', new Date().toLocaleDateString('pt-BR')],
      [''],
      ['Saldo Inicial:', `R$ ${initialBankBalance.toFixed(2)}`],
      ['Total de Depósitos:', `R$ ${totalDeposits.toFixed(2)}`],
      ['Total de Saques:', `R$ ${totalWithdraws.toFixed(2)}`],
      ['Total de Ganhos:', `R$ ${totalGains.toFixed(2)}`],
      ['Total de loss:', `R$ ${totalLosses.toFixed(2)}`],
      ['Saldo Final:', `R$ ${balance.toFixed(2)}`],
      [''],
    ];

    // Preparar dados das transações
    const transactionsHeader = [['HISTÓRICO DE TRANSAÇÕES']];
    const transactionsColumns = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor']];
    
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const transactionsData = sortedTransactions.map(t => [
      new Date(t.date).toLocaleDateString('pt-BR'),
      t.type === 'deposit' ? 'Depósito' : 
      t.type === 'withdraw' ? 'Saque' : 
      t.type === 'gain' ? 'Ganho' : 'Perda',
      t.category || 'N/A',
      t.description || 'N/A',
      `R$ ${t.amount.toFixed(2)}`
    ]);

    // Combinar todos os dados
    const allData = [
      ...summaryData,
      [''],
      ...transactionsHeader,
      [''],
      ...transactionsColumns,
      ...transactionsData
    ];

    // Criar a planilha
    const ws = XLSX.utils.aoa_to_sheet(allData);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 15 }
    ];

    // Criar o workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Financeiro');

    // Baixar o arquivo
    const fileName = `Extrato_Financeiro_${user?.name?.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (loading || !user) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Carregando Relatório...</h1>
      </div>
    );
  }

  const reportData = {
    user,
    transactions: [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)),
    summary: {
      initialBalance: initialBankBalance,
      finalBalance: balance,
      totalDeposits,
      totalWithdraws,
      totalGains,
      totalLosses,
    },
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button 
          className={styles.backButton} 
          onClick={() => navigate('/')}
        >
          <IoArrowBack size={22} />
        </button>
        <h1 className={styles.title}>Relatório Financeiro</h1>
      </header>
      
      <p className={styles.description}>
        Aqui você pode gerar e visualizar um extrato completo de suas atividades financeiras.
      </p>

      <div className={styles.actionsContainer}>
        {/* Botão para baixar Excel */}
        <button 
          className={styles.excelButton}
          onClick={handleExportToExcel}
        >
          <FaFileExcel size={20} />
          Exportar para Excel
        </button>

        {/* Botão para baixar PDF */}
        <PDFDownloadLink
          document={<FinancialReportPDF data={reportData} />}
          fileName={`Extrato_Financeiro_${user?.name?.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`}
          style={{ textDecoration: 'none' }}
        >
          {({ loading }) =>
            loading ? (
              <span className={styles.loadingText}>Gerando PDF...</span>
            ) : (
              <button className={styles.pdfButton}>
                <FaFilePdf size={20} />
                Baixar PDF
              </button>
            )
          }
        </PDFDownloadLink>
      </div>

      <section className={styles.viewerSection}>
        <h2 className={styles.viewerTitle}>Pré-visualização (PDF)</h2>
        <div className={styles.viewerWrapper}>
          <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
            <FinancialReportPDF data={reportData} />
          </PDFViewer>
        </div>
      </section>
    </div>
  );
};

export default ReportScreen;