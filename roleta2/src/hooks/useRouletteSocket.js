// hooks/useRouletteSocket.js

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../constants/roulette';
import { getNumberColor } from '../utils/roulette';

/**
 * Hook para conexão Socket.IO com a roleta Brasileira PlayTech
 */
export const useRouletteSocket = ({
  selectedRoulette,
  jwtToken,
  userEmail,
  onNewSpin
}) => {
  useEffect(() => {
    // Só conecta para brasileira_playtech
    if (selectedRoulette !== 'brasileira_playtech') return;
    if (!jwtToken || !userEmail) return;

    console.log("🔌 Conectando Socket PlayTech...");

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: {
        token: jwtToken,
        email: userEmail
      },
      forceNew: true
    });

    socket.on('connect', () => {
      console.log("⚡ Socket Conectado!");
    });

    socket.on('novo-giro', (payload) => {
      if (payload.source === 'Brasileira PlayTech') {
        console.log("⚡ GIRO SOCKET:", payload.data.signal);

        const newSpin = {
          number: parseInt(payload.data.signal, 10),
          color: getNumberColor(parseInt(payload.data.signal, 10)),
          signal: payload.data.signal,
          gameId: payload.data.gameId,
          signalId: payload.data.signalId,
          date: payload.data.createdAt
        };

        onNewSpin(newSpin);
      }
    });

    socket.on('disconnect', () => {
      console.log("🔌 Socket desconectado");
    });

    socket.on('connect_error', (error) => {
      console.error("❌ Erro de conexão Socket:", error.message);
    });

    return () => {
      console.log("🔌 Desconectando Socket...");
      socket.disconnect();
    };
  }, [selectedRoulette, jwtToken, userEmail, onNewSpin]);
};