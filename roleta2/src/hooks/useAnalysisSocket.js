// hooks/useAnalysisSocket.js — Escuta análises pré-computadas do backend via Socket.IO
// Faz fetch inicial nos endpoints REST e atualiza via eventos em tempo real.
// ✅ FIX: Rejeita dados com timestamp=0 (backend não processou ainda).
// ✅ FIX: Nunca regride timestamp (dado mais antigo não sobrescreve mais recente).
// ✅ FIX: Polling de backup a cada 15s quando Socket.IO cai.

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../constants/roulette';
import { signedFetch } from '../lib/signedFetch';

const POLL_INTERVAL = 8000; // 8s — backup quando socket cai (era 15s — gap muito longo)

export const useAnalysisSocket = ({
  selectedRoulette,
  userEmail,
  jwtToken,
  isAuthenticated,
}) => {
  const [motorAnalysis, setMotorAnalysis] = useState(null);
  const socketRef = useRef(null);
  const lastSocketEventRef = useRef(0);

  // ── Setter seguro: rejeita timestamp=0 e nunca regride ──
  const safeMotorUpdate = useCallback((data) => {
    if (!data || !data.timestamp || data.timestamp === 0) return;
    setMotorAnalysis(prev => {
      if (prev && prev.timestamp > data.timestamp) return prev;
      return data;
    });
  }, []);

  // Fetch REST (usado no mount e como backup)
  const fetchData = useCallback(async () => {
    if (!userEmail || !selectedRoulette) return;

    try {
      const res = await signedFetch(
        `${API_URL}/api/motor-analysis?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}`
      );

      if (res.ok) {
        const data = await res.json();
        if (data.source === selectedRoulette) safeMotorUpdate(data);
      }
    } catch (err) {
      console.error('[useAnalysisSocket] Erro no fetch:', err.message);
    }
  }, [selectedRoulette, userEmail, safeMotorUpdate]);

  // Reset de segurança apenas se mudar de roleta (opcional: manter dados antigos até os novos chegarem)
  useEffect(() => {
    // Em vez de null, poderíamos marcar como 'carregando' se quiséssemos, 
    // mas remover o reset abrupto evita o flash de 'Aguardando dados'.
    // setMotorAnalysis(null);
    // setTriggerAnalysis(null);
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
        safeMotorUpdate(data);
      }
    });

    return () => {
      socket.off('motor-analysis');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, jwtToken, userEmail, selectedRoulette, safeMotorUpdate]);

  // Polling de backup — se Socket.IO parou de enviar eventos
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

  return { motorAnalysis };
};
