import React, { useState, useEffect } from 'react';
import { useFinancial } from '../contexts/FinancialContext';
import { MdAutorenew, MdInfo, MdClose, MdCheckCircle } from 'react-icons/md';
import ResetModal from './ResetModal';

// ========================================
// COMPONENTE: Badge de Contador de Dias
// ========================================
export const BankResetCountdown = () => {
  const { getBankResetStatus } = useFinancial();
  const [resetStatus, setResetStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResetStatus();
  }, []);

  const fetchResetStatus = async () => {
    try {
      const data = await getBankResetStatus();
      if (data && data.success) {
        setResetStatus(data);
      }
    } catch (error) {
      console.error('Erro ao buscar status de reset:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !resetStatus) return null;

  const { days_until_reset, reset_due } = resetStatus;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 14px',
      borderRadius: '20px',
      background: reset_due 
        ? 'linear-gradient(135deg, #d4af37 0%, #f9d971 100%)'
        : 'linear-gradient(135deg, #3a3a3c 0%, #2c2c2e 100%)',
      color: reset_due ? '#1a1a1a' : '#e8e8e8',
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: reset_due 
        ? '0 2px 8px rgba(212, 175, 55, 0.3)'
        : '0 2px 8px rgba(0, 0, 0, 0.2)'
    }}>
      <MdAutorenew size={16} />
      {reset_due ? (
        <span>Reset disponível!</span>
      ) : (
        <span>Reset em {days_until_reset} {days_until_reset === 1 ? 'dia' : 'dias'}</span>
      )}
    </div>
  );
};

// ========================================
// COMPONENTE: Modal de Notificação de Reset
// ========================================
export const BankResetNotification = ({ resetInfo, onClose }) => {
  if (!resetInfo || !resetInfo.reset_performed) return null;

  const { old_initial_bank, new_initial_bank, profit_loss } = resetInfo;
  const difference = parseFloat(profit_loss) || 0;
  const isProfit = difference > 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #1c1c1e 0%, #2c2c2e 100%)',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(212, 175, 55, 0.2)',
        position: 'relative',
        animation: 'slideInScale 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: '#b8b8b8',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(212, 175, 55, 0.1)';
            e.target.style.color = '#d4af37';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#b8b8b8';
          }}
        >
          <MdClose size={24} />
        </button>

        <div style={{
          textAlign: 'center',
          marginBottom: '24px'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d4af37 0%, #f9d971 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(212, 175, 55, 0.3)'
          }}>
            <MdAutorenew size={40} color="#1a1a1a" />
          </div>
          
          <h2 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#e8e8e8',
            marginBottom: '8px'
          }}>
            Reset Automático Realizado
          </h2>
          
          <p style={{
            fontSize: '14px',
            color: '#b8b8b8',
            lineHeight: '1.5'
          }}>
            Sua banca foi atualizada automaticamente após 30 dias
          </p>
        </div>

        <div style={{
          background: 'rgba(212, 175, 55, 0.05)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid rgba(212, 175, 55, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div>
              <p style={{ fontSize: '12px', color: '#b8b8b8', marginBottom: '4px' }}>
                Banca Anterior
              </p>
              <p style={{ fontSize: '18px', fontWeight: '600', color: '#e8e8e8' }}>
                R$ {parseFloat(old_initial_bank).toFixed(2).replace('.', ',')}
              </p>
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '12px', color: '#b8b8b8', marginBottom: '4px' }}>
                Nova Banca
              </p>
              <p style={{ 
                fontSize: '18px', 
                fontWeight: '700', 
                color: '#d4af37'
              }}>
                R$ {parseFloat(new_initial_bank).toFixed(2).replace('.', ',')}
              </p>
            </div>
          </div>

          <div style={{
            textAlign: 'center',
            padding: '12px',
            borderRadius: '8px',
            background: isProfit 
              ? 'rgba(34, 197, 94, 0.1)' 
              : 'rgba(239, 68, 68, 0.1)'
          }}>
            <p style={{ fontSize: '12px', color: '#b8b8b8', marginBottom: '4px' }}>
              Resultado do Período
            </p>
            <p style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: isProfit ? '#22c55e' : '#ef4444'
            }}>
              {isProfit ? '+' : ''} R$ {Math.abs(difference).toFixed(2).replace('.', ',')}
              <span style={{ fontSize: '14px', marginLeft: '8px' }}>
                ({isProfit ? '+' : ''}{((difference / parseFloat(old_initial_bank)) * 100).toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px',
          background: 'rgba(59, 130, 246, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(59, 130, 246, 0.1)',
          marginBottom: '24px'
        }}>
          <MdInfo size={24} color="#3b82f6" />
          <p style={{ 
            fontSize: '13px', 
            color: '#b8b8b8', 
            lineHeight: '1.5',
            margin: 0
          }}>
            A partir de agora, seu saldo atual se tornou sua nova banca inicial. O próximo reset ocorrerá em 30 dias.
          </p>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '14px',
            background: 'linear-gradient(135deg, #d4af37 0%, #f9d971 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#1a1a1a',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 20px rgba(212, 175, 55, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 12px rgba(212, 175, 55, 0.3)';
          }}
        >
          <MdCheckCircle size={20} />
          Entendi
        </button>
      </div>

      <style>{`
        @keyframes slideInScale {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

// ========================================
// COMPONENTE: Botão de Reset Manual
// ========================================
export const ManualResetButton = ({ onResetComplete }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  // A confirmação e o fluxo de reset ficam centralizados em <ResetModal />.
  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(212, 175, 55, 0.05) 100%)',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: '12px',
          color: '#d4af37',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
      >
        <MdAutorenew size={18} />
        Resetar Banca
      </button>

      <ResetModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onResetComplete={onResetComplete}
      />
    </>
  );
};