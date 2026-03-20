// hooks/useAnalysisSocket.js — Escuta análises pré-computadas do backend via Socket.IO
// Faz fetch inicial nos endpoints REST e atualiza via eventos em tempo real.

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../constants/roulette';

export const useAnalysisSocket = ({
  selectedRoulette,
  userEmail,
  jwtToken,
  isAuthenticated,
}) => {
  const [motorAnalysis, setMotorAnalysis] = useState(null);
  const [triggerAnalysis, setTriggerAnalysis] = useState(null);
  const socketRef = useRef(null);

  // Fetch inicial (REST) ao trocar de roleta ou ao montar
  const fetchInitialData = useCallback(async () => {
    if (!userEmail || !selectedRoulette) return;

    try {
      const [motorRes, triggerRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/motor-analysis?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}`),
        fetch(`${API_URL}/api/trigger-analysis?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}`),
      ]);

      if (motorRes.status === 'fulfilled' && motorRes.value.ok) {
        const data = await motorRes.value.json();
        if (data.source === selectedRoulette) setMotorAnalysis(data);
      }

      if (triggerRes.status === 'fulfilled' && triggerRes.value.ok) {
        const data = await triggerRes.value.json();
        if (data.source === selectedRoulette) setTriggerAnalysis(data);
      }
    } catch (err) {
      console.error('[useAnalysisSocket] Erro no fetch inicial:', err.message);
    }
  }, [selectedRoulette, userEmail]);

  // Reset ao trocar de roleta
  useEffect(() => {
    setMotorAnalysis(null);
    setTriggerAnalysis(null);
  }, [selectedRoulette]);

  // Fetch inicial
  useEffect(() => {
    if (!isAuthenticated || !userEmail) return;
    fetchInitialData();
  }, [fetchInitialData, isAuthenticated, userEmail]);

  // Socket.IO — escuta eventos de análise
  useEffect(() => {
    if (!isAuthenticated || !jwtToken || !userEmail) return;

    const socket = io(API_URL, {
      transports: ['websocket'],
      auth: { token: jwtToken, email: userEmail },
      forceNew: false,
      multiplex: true,
    });
    socketRef.current = socket;

    socket.on('motor-analysis', (data) => {
      if (data.source === selectedRoulette) {
        setMotorAnalysis(data);
      }
    });

    socket.on('trigger-analysis', (data) => {
      if (data.source === selectedRoulette) {
        setTriggerAnalysis(data);
      }
    });

    return () => {
      socket.off('motor-analysis');
      socket.off('trigger-analysis');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, jwtToken, userEmail, selectedRoulette]);

  return { motorAnalysis, triggerAnalysis };
};
