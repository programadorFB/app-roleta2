// hooks/useAnalysisSocket.js — Escuta análises pré-computadas do backend via Socket.IO
// Faz fetch inicial nos endpoints REST e atualiza via eventos em tempo real.
// ✅ FIX: Polling de backup a cada 15s para quando Socket.IO desconecta.

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../constants/roulette';

const POLL_INTERVAL = 15000; // 15s — backup quando socket cai

export const useAnalysisSocket = ({
  selectedRoulette,
  userEmail,
  jwtToken,
  isAuthenticated,
}) => {
  const [motorAnalysis, setMotorAnalysis] = useState(null);
  const [triggerAnalysis, setTriggerAnalysis] = useState(null);
  const socketRef = useRef(null);
  const lastSocketEventRef = useRef(0); // timestamp do último evento Socket.IO

  // Fetch REST (usado no mount e como backup)
  const fetchData = useCallback(async () => {
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
      console.error('[useAnalysisSocket] Erro no fetch:', err.message);
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
    fetchData();
  }, [fetchData, isAuthenticated, userEmail]);

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
        lastSocketEventRef.current = Date.now();
        setMotorAnalysis(data);
      }
    });

    socket.on('trigger-analysis', (data) => {
      if (data.source === selectedRoulette) {
        lastSocketEventRef.current = Date.now();
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

  // ✅ FIX: Polling de backup — se o Socket.IO parou de enviar eventos
  // por mais de POLL_INTERVAL, faz fetch REST pra manter dados frescos.
  useEffect(() => {
    if (!isAuthenticated || !userEmail || !selectedRoulette) return;

    const interval = setInterval(() => {
      const msSinceLastEvent = Date.now() - lastSocketEventRef.current;
      if (msSinceLastEvent > POLL_INTERVAL) {
        fetchData();
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [isAuthenticated, userEmail, selectedRoulette, fetchData]);

  return { motorAnalysis, triggerAnalysis };
};
