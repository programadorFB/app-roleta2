// components/NotificationCenter.jsx
import React, { useState, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { CheckCircle, AlertTriangle, XCircle, Info, X, Volume2, VolumeX } from 'lucide-react';
import './NotificationsCenter.css';

// Ícones para cada tipo de alerta
const ICONS = {
  success: <CheckCircle size={24} />,
  warning: <AlertTriangle size={24} />,
  danger: <XCircle size={24} />,
  info: <Info size={24} />,
};

// Sub-componente para um único toast
const Notification = ({ notification, onRemove }) => {
  const [timeLeft, setTimeLeft] = useState(notification.duration);

  // REQ 3: Contador regressivo animado
  useEffect(() => {
    const updateInterval = 50; // Atualiza a barra a cada 50ms
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - notification.startTime;
      const remaining = notification.duration - elapsed;
      
      if (remaining <= 0) {
        clearInterval(interval);
        onRemove(notification.id);
      } else {
        setTimeLeft(remaining);
      }
    }, updateInterval);

    return () => clearInterval(interval);
  }, [notification, onRemove]);

  const percentageLeft = (timeLeft / notification.duration) * 100;

  return (
    <div className={`notification-toast ${notification.type}`}>
      <div className="notification-icon">
        {ICONS[notification.type] || <Info size={24} />}
      </div>
      <div className="notification-content">
        <strong className="notification-title">{notification.title}</strong>
        <p className="notification-message">{notification.message}</p>
        
        {/* Ações (botões) se existirem */}
        {notification.actions && (
          <div className="notification-actions">
            {notification.actions.map((action, index) => (
              <button key={index} onClick={() => {
                if(action.onClick) action.onClick();
                onRemove(notification.id); // Fecha ao clicar
              }}>
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="notification-close" onClick={() => onRemove(notification.id)}>
        <X size={18} />
      </button>
      
      {/* REQ 3: Contador regressivo visual */}
      <div className="notification-timer">
        <div 
          className="notification-timer-bar" 
          style={{ width: `${percentageLeft}%` }}
        ></div>
      </div>
    </div>
  );
};

// Componente principal do Centro de Notificações
const NotificationCenter = () => {
  const { notifications, removeNotification, isSoundEnabled, toggleSound } = useNotifications();

  return (
    <div className="notification-container">
      {/* Botão de Som (REQ 1) */}
      <div className="notification-sound-toggle">
        <button onClick={toggleSound} title={isSoundEnabled ? "Desativar sons" : "Ativar sons"}>
          {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>
      
      {/* Fila de Notificações */}
      <div className="notification-wrapper">
        {notifications.map((n) => (
          <Notification key={n.id} notification={n} onRemove={removeNotification} />
        ))}
      </div>
    </div>
  );
};

export default NotificationCenter;