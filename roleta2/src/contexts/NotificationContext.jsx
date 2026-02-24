// contexts/NotificationContext.js
import React, { createContext, useState, useCallback, useContext, useEffect, useRef } from 'react';

const NotificationContext = createContext();

// Sons (placeholders)
// Você precisará ter esses arquivos na sua pasta /public
const SOUNDS = {
  success: '/sounds/ding.mp3', // Som de "Sinal Verde"
  warning: '/sounds/warning.mp3',
  danger: '/sounds/error.mp3',
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const audioRef = useRef(null);

  // Função para tocar som
  const playSound = (soundType) => {
    if (!isSoundEnabled || !soundType || !SOUNDS[soundType]) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(SOUNDS[soundType]);
    audioRef.current.play().catch(e => console.error("Erro ao tocar som:", e));
  };

  // Função para remover uma notificação
  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Função para adicionar uma notificação (chamada por outros componentes)
  const addNotification = useCallback((notificationProps) => {
    const id = Date.now() + Math.random();
    const duration = notificationProps.duration || 5000;

    const newNotification = {
      ...notificationProps,
      id,
      duration,
      startTime: Date.now(),
    };

    setNotifications((prev) => [newNotification, ...prev]);

    // Tocar som se aplicável
    playSound(notificationProps.type);

    // Auto-remoção
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }, [isSoundEnabled, removeNotification]);

  const toggleSound = () => setIsSoundEnabled((prev) => !prev);

  const value = {
    addNotification,
    removeNotification,
    toggleSound,
    isSoundEnabled,
    notifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Hook customizado para facilitar o uso
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications deve ser usado dentro de um NotificationProvider');
  }
  return context;
};