import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer'; // Font foi removido
import { format } from 'date-fns';

// --- NOVO: Função para formatar datas com segurança ---
const safeFormatDate = (dateString) => {
  try {
    const date = new Date(dateString);
    // Verifica se a data é válida
    if (isNaN(date.getTime())) {
      return 'Data inválida';
    }
    return format(date, 'dd/MM/yy');
  } catch (error) {
    return 'Erro na data';
  }
};

// Estilos para o PDF
const styles = StyleSheet.create({
  page: {
    // Removida a referência à fonte 'Roboto' para depuração
    fontSize: 10,
    padding: 30,
    backgroundColor: '#ffffff',
    color: '#333',
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 12,
    color: '#555',
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    backgroundColor: '#f0f0f0',
    padding: 5,
    marginBottom: 10,
  },
  summaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    border: '1px solid #eee',
    borderRadius: 5,
    padding: 10,
  },
  summaryItem: {
    width: '50%',
    marginBottom: 5,
  },
  summaryLabel: {
    fontWeight: 'bold',
  },
  table: {
    display: 'table',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#eee',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableColHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#eee',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
  },
  tableCell: {
    margin: 5,
    fontSize: 9,
  },
  positive: {
    color: '#28a745',
  },
  negative: {
    color: '#dc3545',
  },
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: 'grey',
  },
});

const formatCurrency = (amount) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount || 0);

const FinancialReportPDF = ({ data }) => {
  const { user, transactions, summary } = data;
  const generationDate = format(new Date(), 'dd/MM/yyyy \'às\' HH:mm');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ... (O resto do seu código de header e summary continua igual) ... */}
        <View style={styles.header}>
          <Text style={styles.title}>Extrato Financeiro</Text>
          <Text style={styles.subtitle}>Gerado em: {generationDate}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados do Cliente</Text>
          <Text>{user?.name || 'Usuário'}</Text>
          <Text>{user?.email || 'email@exemplo.com'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo do Período</Text>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryItem}><Text><Text style={styles.summaryLabel}>Saldo Inicial:</Text> {formatCurrency(summary.initialBalance)}</Text></View>
            <View style={styles.summaryItem}><Text><Text style={styles.summaryLabel}>Saldo Final:</Text> {formatCurrency(summary.finalBalance)}</Text></View>
            <View style={styles.summaryItem}><Text style={styles.positive}><Text style={styles.summaryLabel}>Total Depositado:</Text> {formatCurrency(summary.totalDeposits)}</Text></View>
            <View style={styles.summaryItem}><Text style={styles.negative}><Text style={styles.summaryLabel}>Total Sacado:</Text> {formatCurrency(summary.totalWithdraws)}</Text></View>
            <View style={styles.summaryItem}><Text style={styles.positive}><Text style={styles.summaryLabel}>Total de Ganhos:</Text> {formatCurrency(summary.totalGains)}</Text></View>
            <View style={styles.summaryItem}><Text style={styles.negative}><Text style={styles.summaryLabel}>Total de Perdas:</Text> {formatCurrency(summary.totalLosses)}</Text></View>
          </View>
        </View>


        {/* Seção de Transações */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lançamentos Detalhados</Text>
          <View style={styles.table}>
            {/* Cabeçalho da Tabela */}
            <View style={[styles.tableRow, styles.tableColHeader]}>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Data</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Descrição</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Tipo</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Valor</Text></View>
            </View>

            {/* Linhas da Tabela */}
            {transactions.map(tx => {
              const isPositive = ['gains', 'deposit'].includes(tx.type);
              return (
                <View style={styles.tableRow} key={tx.id || Math.random()}>
                  <View style={styles.tableCol}>
                    {/* --- ALTERAÇÃO: Usando a função segura --- */}
                    <Text style={styles.tableCell}>{safeFormatDate(tx.date)}</Text>
                  </View>
                  <View style={styles.tableCol}><Text style={styles.tableCell}>{tx.description || ''}</Text></View>
                  <View style={styles.tableCol}><Text style={styles.tableCell}>{tx.type || 'N/A'}</Text></View>
                  <View style={styles.tableCol}>
                    <Text style={[styles.tableCell, isPositive ? styles.positive : styles.negative]}>
                      {formatCurrency(tx.amount)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        
        <Text style={styles.footer} render={({ pageNumber, totalPages }) => (
          `Página ${pageNumber} de ${totalPages}`
        )} fixed />
      </Page>
    </Document>
  );
};

export default FinancialReportPDF;