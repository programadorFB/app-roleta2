// src/components/AuditModal.jsx
import React from 'react';
import { X, Activity, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

const AuditModal = ({ isOpen, onClose, auditData }) => {
  if (!isOpen || !auditData) return null;

  const isInsufficient = auditData.status === "INSUFFICIENT_DATA";
  
  return (
    <div className="popup-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', zIndex: 3000, backdropFilter: 'blur(5px)'
    }}>
      <div className="popup-content" onClick={e => e.stopPropagation()} style={{ 
        maxWidth: '600px', width: '90%', background: '#0f172a', 
        border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' 
      }}>
        
        {/* HEADER */}
        <div style={{ padding: '15px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#6366f1', padding: '8px', borderRadius: '8px', display: 'flex' }}>
              <Activity size={20} color="white" />
            </div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>Auditoria Estatística</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={24} /></button>
        </div>

        <div style={{ padding: '1.5rem', color: '#cbd5e1', maxHeight: '70vh', overflowY: 'auto' }}>
          
          {/* STATUS CARD */}
          <div style={{ 
            background: isInsufficient ? '#334155' : (auditData.status === 'EDGE_DETECTED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
            border: `1px solid ${isInsufficient ? '#475569' : (auditData.status === 'EDGE_DETECTED' ? '#059669' : '#b91c1c')}`,
            padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center'
          }}>
            <h3 style={{ margin: 0, color: isInsufficient ? '#cbd5e1' : (auditData.status === 'EDGE_DETECTED' ? '#34d399' : '#f87171') }}>
              {isInsufficient ? 'DADOS INSUFICIENTES' : (auditData.status === 'EDGE_DETECTED' ? '⚠️ VIES DETECTADO (ANOMALIA)' : 'PADRÃO ALEATÓRIO (SEM VIES)')}
            </h3>
            <p style={{ fontSize: '0.85rem', margin: '8px 0 0 0', opacity: 0.8 }}>
              Baseado em {auditData.spins} rodadas analisadas.<br/>
              {!isInsufficient && `Teste Qui-Quadrado: ${auditData.statistics?.chiPassed ? 'PASSOU (Amostra válida)' : 'FALHOU (Amostra suspeita)'}`}
            </p>
          </div>

          {!isInsufficient && (
            <>
              {/* Z-SCORES */}
              <h4 style={{ color: '#fde047', borderBottom: '1px solid #334155', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} />
                Maiores Desvios (Z-Score > 1.5)
              </h4>
              
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {auditData.candidates.length === 0 ? 
                  <p style={{ textAlign: 'center', padding: '1rem', background: '#1e293b', borderRadius: '6px' }}>Nenhum desvio estatístico relevante encontrado nesta amostra.</p> : 
                  auditData.candidates.map((cand) => (
                    <div key={cand.number} style={{ 
                      display: 'flex', justifyContent: 'space-between', background: '#1e293b', 
                      padding: '1rem', borderRadius: '8px', alignItems: 'center', border: '1px solid #334155' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ 
                          width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem',
                          background: cand.number === 0 ? '#059669' : ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(cand.number) ? '#dc2626' : '#1f2937'),
                          color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                        }}>
                          {cand.number}
                        </span>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frequência Real</div>
                          <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{cand.freq}x</div>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.9rem', color: '#fde047', fontWeight: 'bold' }}>Z: {cand.z.toFixed(2)}σ</div>
                        <div style={{ fontSize: '0.75rem', marginTop: '2px', color: cand.ev > 0 ? '#10b981' : '#ef4444' }}>
                          EV: {(cand.ev * 100).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>

              <div style={{ marginTop: '1.5rem', background: 'rgba(99, 102, 241, 0.1)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', color: '#94a3b8', borderLeft: '3px solid #6366f1' }}>
                <strong>Nota Técnica:</strong> O Z-Score mede quantos desvios padrão um número está longe da média esperada. Valores acima de 2.0 ou 3.0 em amostras curtas indicam forte tendência momentânea ("número quente").
              </div>
            </>
          )}
        </div>
        
        <div style={{ padding: '1rem', borderTop: '1px solid #334155', textAlign: 'center' }}>
            <button onClick={onClose} style={{ 
                padding: '10px 30px', background: '#334155', color: 'white', border: 'none', 
                borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' 
            }}>Fechar Análise</button>
        </div>
      </div>
    </div>
  );
};

export default AuditModal;