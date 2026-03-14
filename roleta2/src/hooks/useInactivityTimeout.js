// hooks/useInactivityTimeout.js

import { useEffect, useRef } from 'react';

const INACTIVITY_LIMIT = 90 * 60 * 1000; // 90 minutos

export const useInactivityTimeout = ({ 
  isActive, 
  onTimeout 
}) => {
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        console.log('Usuário inativo por 90 minutos - executando logout');
        onTimeout();
        alert('Sessão encerrada por inatividade. Faça login novamente.');
      }, INACTIVITY_LIMIT);
    };

    const handleWindowBlur = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    
    const handleWindowFocus = () => resetTimer();
    const handleActivity = () => resetTimer();

    // Initial timer
    resetTimer();

    // Event listeners
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('mousemove', handleActivity, { passive: true });
    document.addEventListener('mousedown', handleActivity, { passive: true });
    document.addEventListener('keydown', handleActivity, { passive: true });
    document.addEventListener('touchstart', handleActivity, { passive: true });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('mousemove', handleActivity);
      document.removeEventListener('mousedown', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      document.removeEventListener('touchstart', handleActivity);
    };
  }, [isActive, onTimeout]);
};