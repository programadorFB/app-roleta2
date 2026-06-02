import React from 'react';

const BalanceSection = ({ initialBankBalance, balance, overallProfit, currentObjective, formatCurrency }) => (
  <section className="balance-section">
    <div className="balance-card">
      <div className="card-header">💵 Valor Inicial</div>
      <div className="balance-amount initial">{formatCurrency(initialBankBalance)}</div>
      <div className="card-subtitle">Banca inicial</div>
    </div>
    
    <div className="balance-card main">
      <div className="card-header">🪙 Saldo Banca</div>
      <div className="balance-amount main">{formatCurrency(balance)}</div>
      <div className="performance" style={{ color: overallProfit >= 0 ? '#34d399' : '#f87171' }}>
        {overallProfit >= 0 ? '📈' : '📉'} {formatCurrency(overallProfit)}
      </div>
    </div>
    
    <div className="balance-card">
      <div className="card-header">🎯 Objetivo</div>
      {currentObjective ? (
        <>
          <div className="balance-amount objective">{formatCurrency(currentObjective.target_amount)}</div>
          <div className="card-subtitle">{currentObjective.title}</div>
        </>
      ) : (
        <div className="balance-amount">--</div>
      )}
    </div>
  </section>
);

export default BalanceSection;