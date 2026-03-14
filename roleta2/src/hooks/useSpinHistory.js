// src/hooks/useSpinHistory.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, POLLING_INTERVAL_MS, getNumberColor } from '../constants/roulette';
import { fetchFullHistory, fetchHistorySince } from '../services/api';

/**
 * Normaliza qualquer item do backend em formato padronizado.
 * Lida com diferenças de casing (signalId vs signalid) do PostgreSQL.
 */
function parseSpinItem(item) {
  const num = parseInt(item.signal, 10);
  return {
    number:   num,
    color:    getNumberColor(num),
    signal:   item.signal,
    gameId:   item.gameid   || item.gameId,
    signalId: item.signalid || item.signalId,
    date:     item.timestamp || item.date || item.createdAt,
  };
}

/**
 * Hook que gerencia todo o fluxo de dados de spins:
 *  - Fetch inicial completo
 *  - Polling incremental (só registros novos)
 *  - Socket.io para PlayTech
 *  - Guard contra fetches sobrepostos
 * 
 * @param {string} selectedRoulette - Chave da roleta selecionada
 * @param {string|null} userEmail - Email do usuário logado
 * @param {string|null} jwtToken - Token JWT para socket
 * @param {boolean} isAuthenticated - Se o usuário está logado
 * @returns {{ spinHistory, selectedResult }}
 */
export function useSpinHistory(selectedRoulette, userEmail, jwtToken, isAuthenticated) {
  const [spinHistory, setSpinHistory] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);

  // ── Refs de controle ──
  const latestTimestampRef = useRef(null);
  const isFirstFetchRef    = useRef(true);
  const isFetchingRef      = useRef(false);

  // ── Reset ao trocar roleta ──
  useEffect(() => {
    latestTimestampRef.current = null;
    isFirstFetchRef.current = true;
    isFetchingRef.current = false;
    setSpinHistory([]);
    setSelectedResult(null);
  }, [selectedRoulette]);

  // ── Fetch principal (incremental após o 1º) ──
  const fetchHistory = useCallback(async () => {
    if (isFetchingRef.current || !userEmail) return;
    isFetchingRef.current = true;

    try {
      const isFirstFetch = isFirstFetchRef.current || !latestTimestampRef.current;

      const result = isFirstFetch
        ? await fetchFullHistory(selectedRoulette, userEmail)
        : await fetchHistorySince(selectedRoulette, latestTimestampRef.current, userEmail);

      if (result.error) {
        // Paywall é tratado por quem consome o hook
        if (result.requiresPaywall) {
          // Dispara evento customizado para o App lidar
          window.dispatchEvent(new CustomEvent('paywall-required', {
            detail: { checkoutUrl: result.checkoutUrl },
          }));
        }
        return;
      }

      const data = result.data;
      if (!data || data.length === 0) return;

      if (isFirstFetch) {
        // Primeiro load: substitui tudo
        setSpinHistory(data.map(parseSpinItem));
        latestTimestampRef.current = data[0].timestamp;
        isFirstFetchRef.current = false;
      } else {
        // Incremental: prepend apenas novos
        const newItems = data.map(parseSpinItem);

        setSpinHistory(prev => {
          const existingIds = new Set(prev.slice(0, 50).map(s => s.signalId));
          const uniqueNew = newItems.filter(item => !existingIds.has(item.signalId));
          if (uniqueNew.length === 0) return prev;
          return [...uniqueNew, ...prev].slice(0, 1000);
        });

        latestTimestampRef.current = data[0].timestamp;
      }
    } catch (err) {
      console.error('[useSpinHistory] Erro:', err.message);
    } finally {
      isFetchingRef.current = false;
    }
  }, [selectedRoulette, userEmail]);

  // ── Polling com setTimeout (nunca sobrepõe) ──
  useEffect(() => {
    if (!isAuthenticated || !userEmail) return;
    if (selectedRoulette === 'Brasileira PlayTech') return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      await fetchHistory();
      if (cancelled) return;
      setTimeout(poll, POLLING_INTERVAL_MS);
    };

    poll();
    return () => { cancelled = true; };
  }, [fetchHistory, isAuthenticated, userEmail, selectedRoulette]);

  // ── Socket.io para PlayTech ──
  useEffect(() => {
    if (selectedRoulette !== 'Brasileira PlayTech') return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: jwtToken, email: userEmail },
    });

    // Carga inicial via HTTP
    fetch(`${SOCKET_URL}/api/full-history?source=Brasileira PlayTech&userEmail=${encodeURIComponent(userEmail || '')}`)
      .then(res => res.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : data.data || [];
        setSpinHistory(arr.map(parseSpinItem));
      })
      .catch(err => console.error('[Socket] Erro ao carregar histórico:', err));

    // Novos giros em tempo real
    socket.on('novo-giro', (payload) => {
      if (payload.source !== 'Brasileira PlayTech') return;

      const newSpin = parseSpinItem({
        signal:   payload.data.signal,
        gameId:   payload.data.gameId,
        signalId: payload.data.signalId,
        timestamp: payload.data.createdAt,
      });

      setSpinHistory(prev =>
        (prev.length > 0 && prev[0].signalId === newSpin.signalId)
          ? prev
          : [newSpin, ...prev].slice(0, 1000)
      );
    });

    return () => socket.disconnect();
  }, [selectedRoulette, jwtToken, userEmail]);

  // ── Atualiza selectedResult quando novo spin chega ──
  useEffect(() => {
    if (spinHistory.length === 0) {
      setSelectedResult(null);
      return;
    }
    setSelectedResult(prev => {
      const newest = spinHistory[0];
      if (prev?.signalId === newest.signalId) return prev;
      return newest;
    });
  }, [spinHistory]);

  return { spinHistory, selectedResult };
}