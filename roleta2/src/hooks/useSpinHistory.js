/**
 * hooks/useSpinHistory.js — Hook unificado de histórico de spins
 *
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../constants/roulette';
import {
  convertSpinItem,
  getNumberColor,
  computePullStats,
  computePreviousStats
} from '../utils/roulette';
import { processErrorResponse } from '../errorHandler';

const POLL_INTERVAL_MS = 5000;

export const useSpinHistory = ({
  selectedRoulette,
  userEmail,
  jwtToken,
  isAuthenticated,
  historyFilter,
  onPaywallRequired
}) => {
  const [spinHistory, setSpinHistory] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [numberPullStats, setNumberPullStats] = useState(() => new Map());
  const [numberPreviousStats, setNumberPreviousStats] = useState(() => new Map());

  // ════════════════════════════════════════════════════════════
  // ✅ Ref para guardar o latestId sem re-criar fetchHistory
  // Evita que spinHistory entre na dependency array do useCallback
  // ════════════════════════════════════════════════════════════
  const latestIdRef = useRef(null);

  useEffect(() => {
    if (spinHistory.length > 0) {
      latestIdRef.current = spinHistory[0]?.signalId || spinHistory[0]?.signalid || null;
    } else {
      latestIdRef.current = null;
    }
  }, [spinHistory]);

  // ════════════════════════════════════════════════════════════
  // FETCH HISTORY — com delta updates
  // ════════════════════════════════════════════════════════════

  const fetchHistory = useCallback(async () => {
    if (!userEmail) return;

    try {
      const latestId = latestIdRef.current;

      // ✅ DELTA: se já tem histórico, pede só os novos
      const endpoint = latestId
        ? `${API_URL}/api/history-delta?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}&since=${latestId}`
        : `${API_URL}/api/full-history?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}`;

      const response = await fetch(endpoint);

      // ✅ 304 Not Modified — nada novo, retorna sem processar
      if (response.status === 304) return;

      if (!response.ok) {
        const errorInfo = await processErrorResponse(response, 'history');
        if (errorInfo.requiresPaywall || response.status === 403) {
          onPaywallRequired(errorInfo.checkoutUrl || '');
        }
        throw new Error(errorInfo.message);
      }

      const result = await response.json();

      // ── Resposta do endpoint delta (objeto com { full, data }) ──
      if (result.data !== undefined) {
        const items = result.data;
        if (items.length === 0) return;

        const converted = items.map(convertSpinItem);

        if (result.full) {
          // Primeira carga: substitui tudo
          setSpinHistory(converted);
          setSelectedResult(converted[0] || null);
        } else {
          // Delta: prepend apenas os novos
          setSpinHistory(prev => {
            if (prev.length > 0 && String(prev[0]?.signalId) === String(converted[0]?.signalId)) {
              return prev; // Dedup
            }
            setSelectedResult(converted[0]);
            return [...converted, ...prev];
          });
        }
        return;
      }

      // ── Fallback: resposta do endpoint antigo (array direto) ──
      const data = result;

      setSpinHistory(prev => {
        if (data.length === 0) return prev;

        if (prev.length === 0) {
          const converted = data.map(convertSpinItem);
          setSelectedResult(converted[0] || null);
          return converted;
        }

        const existingLatestId = prev[0]?.signalId;
        const newItems = [];
        for (const item of data) {
          const currentId = item.signalId || item.signalid || item.id;
          if (String(currentId) === String(existingLatestId)) break;
          newItems.push(convertSpinItem(item));
        }

        if (newItems.length === 0) return prev;

        setSelectedResult(newItems[0]);
        return [...newItems, ...prev];
      });
    } catch (error) {
      console.error("Erro ao buscar histórico:", error.message);
    }
  }, [selectedRoulette, userEmail, onPaywallRequired]);

  // ════════════════════════════════════════════════════════════
  // Polling a 5s — PlayTech usa socket em vez de polling
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isAuthenticated || !userEmail) return;

    // Fetch inicial (roda para TODAS as sources)
    fetchHistory();

    // PlayTech usa socket — não faz polling
    if (selectedRoulette === 'brasileira_playtech') {
      console.log("Polling desativado para PlayTech (usando Socket)");
      return;
    }

    console.log(`Polling ativado (${POLL_INTERVAL_MS / 1000}s) para ${selectedRoulette}`);
    const intervalId = setInterval(fetchHistory, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchHistory, isAuthenticated, userEmail, selectedRoulette]);

  // ════════════════════════════════════════════════════════════
  // Socket.IO integrado para PlayTech
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (selectedRoulette !== 'brasileira_playtech') return;
    if (!jwtToken || !userEmail) return;

    console.log('[useSpinHistory] Conectando Socket PlayTech...');

    const socket = io(API_URL, {
      transports: ['websocket'],
      auth: { token: jwtToken, email: userEmail },
      forceNew: true
    });

    socket.on('connect', () => console.log('Socket conectado!'));

    socket.on('novo-giro', (payload) => {
      if (payload.source === 'Brasileira PlayTech') {
        const newSpin = {
          number: parseInt(payload.data.signal, 10),
          color: getNumberColor(parseInt(payload.data.signal, 10)),
          signal: payload.data.signal,
          gameId: payload.data.gameId,
          signalId: payload.data.signalId,
          date: payload.data.createdAt
        };

        setSpinHistory(prev => {
          if (prev.length > 0 && String(prev[0].signalId) === String(newSpin.signalId)) return prev;
          setSelectedResult(newSpin);
          return [newSpin, ...prev].slice(0, 1000);
        });
      }
    });

    socket.on('disconnect', () => console.log('Socket desconectado'));
    socket.on('connect_error', (err) => console.error('Socket erro:', err.message));

    return () => {
      console.log('Desconectando Socket...');
      socket.disconnect();
    };
  }, [selectedRoulette, jwtToken, userEmail]);

  // ════════════════════════════════════════════════════════════
  // Pull stats (computados com requestIdleCallback)
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (spinHistory.length === 0) return;

    const timeoutId = setTimeout(() => {
      const compute = () => {
        setNumberPullStats(computePullStats(spinHistory));
        setNumberPreviousStats(computePreviousStats(spinHistory));
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(compute, { timeout: 2000 });
      } else {
        compute();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [spinHistory]);

  // ════════════════════════════════════════════════════════════
  // addSpin — para updates manuais (ex: socket externo)
  // ════════════════════════════════════════════════════════════

  const addSpin = useCallback((newSpin) => {
    setSpinHistory(prev => {
      if (prev.length > 0 && String(prev[0].signalId) === String(newSpin.signalId)) return prev;
      setSelectedResult(newSpin);
      return [newSpin, ...prev].slice(0, 1000);
    });
  }, []);

  // ════════════════════════════════════════════════════════════
  // clearHistory — para troca de roleta
  // ════════════════════════════════════════════════════════════

  const clearHistory = useCallback(() => {
    setSpinHistory([]);
    setSelectedResult(null);
    setNumberPullStats(new Map());
    setNumberPreviousStats(new Map());
  }, []);

  // ════════════════════════════════════════════════════════════
  // filteredSpinHistory e stats computados aqui
  // ════════════════════════════════════════════════════════════

  const filteredSpinHistory = useMemo(() => {
    if (historyFilter === 'all') return spinHistory;
    return spinHistory.slice(0, Number(historyFilter));
  }, [spinHistory, historyFilter]);

  const stats = useMemo(() => {
    const historyCount = filteredSpinHistory.length;
    if (historyCount === 0) return { historyFilter: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };
    const counts = filteredSpinHistory.reduce((acc, curr) => { acc[curr.color] = (acc[curr.color] || 0) + 1; return acc; }, {});
    return {
      historyFilter: historyCount,
      colorFrequencies: {
        red: ((counts.red || 0) / historyCount * 100).toFixed(1),
        black: ((counts.black || 0) / historyCount * 100).toFixed(1),
        green: ((counts.green || 0) / historyCount * 100).toFixed(1),
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [filteredSpinHistory, spinHistory]);

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    spinHistory,
    filteredSpinHistory,
    selectedResult,
    setSelectedResult,
    numberPullStats,
    numberPreviousStats,
    stats,
    addSpin,
    clearHistory,
  };
};