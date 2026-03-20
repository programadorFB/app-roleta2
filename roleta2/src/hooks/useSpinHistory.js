import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../constants/roulette';
import { convertSpinItem, getNumberColor, computePullStats, computePreviousStats } from '../lib/roulette';
import { processErrorResponse } from '../lib/errorHandler';

const POLL_INTERVAL_MS = 1000;
const MAX_HISTORY      = 1000;

const getItemId = (item) => item?.signalId || item?.signalid || null;

export const useSpinHistory = ({
  selectedRoulette,
  userEmail,
  jwtToken,
  isAuthenticated,
  historyFilter,
  onPaywallRequired,
}) => {
  const [spinHistory,          setSpinHistory]          = useState([]);
  const [selectedResult,       setSelectedResult]       = useState(null);
  const [numberPullStats,      setNumberPullStats]      = useState(() => new Map());
  const [numberPreviousStats,  setNumberPreviousStats]  = useState(() => new Map());

  const latestIdRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    if (!userEmail) return;

    try {
      const latestId = latestIdRef.current;
      const endpoint = latestId
        ? `${API_URL}/api/history-delta?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}&since=${latestId}`
        : `${API_URL}/api/full-history?source=${selectedRoulette}&userEmail=${encodeURIComponent(userEmail)}`;

      const response = await fetch(endpoint);
      if (response.status === 304) return;

      if (!response.ok) {
        const errorInfo = await processErrorResponse(response, 'history');
        if (errorInfo.requiresPaywall || response.status === 403) {
          onPaywallRequired(errorInfo.checkoutUrl || '');
        }
        throw new Error(errorInfo.message);
      }

      const result = await response.json();

      if (result.data !== undefined) {
        const items = result.data;
        if (items.length === 0) return;

        const converted = items.map(convertSpinItem);

        if (result.full) {
          latestIdRef.current = getItemId(converted[0]);
          setSpinHistory(converted);
          setSelectedResult(converted[0] || null);
        } else {
          setSpinHistory(prev => {
            if (prev.length > 0 && String(getItemId(prev[0])) === String(getItemId(converted[0]))) return prev;
            latestIdRef.current = getItemId(converted[0]);
            setSelectedResult(converted[0]);
            return [...converted, ...prev].slice(0, MAX_HISTORY);
          });
        }
        return;
      }

      // Fallback: array direto
      const data = result;
      setSpinHistory(prev => {
        if (data.length === 0) return prev;
        if (prev.length === 0) {
          const converted = data.map(convertSpinItem);
          latestIdRef.current = getItemId(converted[0]);
          setSelectedResult(converted[0] || null);
          return converted;
        }

        const newItems = [];
        for (const item of data) {
          if (String(getItemId(item)) === String(getItemId(prev[0]))) break;
          newItems.push(convertSpinItem(item));
        }
        if (newItems.length === 0) return prev;
        latestIdRef.current = getItemId(newItems[0]);
        setSelectedResult(newItems[0]);
        return [...newItems, ...prev].slice(0, MAX_HISTORY);
      });
    } catch (err) {
      console.error('[useSpinHistory] Erro:', err.message);
    }
  }, [selectedRoulette, userEmail, onPaywallRequired]);

  // Polling
  useEffect(() => {
    if (!isAuthenticated || !userEmail) return;

    fetchHistory();
    if (selectedRoulette === 'brasileira_playtech') return;

    const id = setInterval(fetchHistory, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchHistory, isAuthenticated, userEmail, selectedRoulette]);

  // Socket.IO para PlayTech
  useEffect(() => {
    if (selectedRoulette !== 'brasileira_playtech' || !jwtToken || !userEmail) return;

    const socket = io(API_URL, {
      transports: ['websocket'],
      auth:       { token: jwtToken, email: userEmail },
      forceNew:   true,
    });

    socket.on('novo-giro', (payload) => {
      if (payload.source !== 'Brasileira PlayTech') return;
      const newSpin = {
        number:   parseInt(payload.data.signal, 10),
        color:    getNumberColor(parseInt(payload.data.signal, 10)),
        signal:   payload.data.signal,
        gameId:   payload.data.gameId,
        signalId: payload.data.signalId,
        date:     payload.data.createdAt,
      };
      setSpinHistory(prev => {
        if (prev.length > 0 && String(getItemId(prev[0])) === String(newSpin.signalId)) return prev;
        latestIdRef.current = newSpin.signalId;
        setSelectedResult(newSpin);
        return [newSpin, ...prev].slice(0, MAX_HISTORY);
      });
    });

    socket.on('connect_error', (err) => console.error('[Socket] erro:', err.message));

    return () => socket.disconnect();
  }, [selectedRoulette, jwtToken, userEmail]);

  // Computa pull stats de forma não-bloqueante
  useEffect(() => {
    if (spinHistory.length === 0) return;

    const id = setTimeout(() => {
      const compute = () => {
        setNumberPullStats(computePullStats(spinHistory));
        setNumberPreviousStats(computePreviousStats(spinHistory));
      };
      'requestIdleCallback' in window
        ? requestIdleCallback(compute, { timeout: 2000 })
        : compute();
    }, 300);

    return () => clearTimeout(id);
  }, [spinHistory]);

  const addSpin = useCallback((newSpin) => {
    setSpinHistory(prev => {
      if (prev.length > 0 && String(getItemId(prev[0])) === String(newSpin.signalId)) return prev;
      latestIdRef.current = newSpin.signalId;
      setSelectedResult(newSpin);
      return [newSpin, ...prev].slice(0, MAX_HISTORY);
    });
  }, []);

  const clearHistory = useCallback(() => {
    latestIdRef.current = null;
    setSpinHistory([]);
    setSelectedResult(null);
    setNumberPullStats(new Map());
    setNumberPreviousStats(new Map());
  }, []);

  const filteredSpinHistory = useMemo(() => (
    historyFilter === 'all' ? spinHistory : spinHistory.slice(0, Number(historyFilter))
  ), [spinHistory, historyFilter]);

  const stats = useMemo(() => {
    const total = filteredSpinHistory.length;
    if (total === 0) return { historyFilter: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };

    const counts = filteredSpinHistory.reduce((acc, s) => {
      acc[s.color] = (acc[s.color] || 0) + 1;
      return acc;
    }, {});

    return {
      historyFilter: total,
      colorFrequencies: {
        red:   ((counts.red   || 0) / total * 100).toFixed(1),
        black: ((counts.black || 0) / total * 100).toFixed(1),
        green: ((counts.green || 0) / total * 100).toFixed(1),
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [filteredSpinHistory, spinHistory]);

  return {
    spinHistory, filteredSpinHistory,
    selectedResult, setSelectedResult,
    numberPullStats, numberPreviousStats,
    stats, addSpin, clearHistory,
  };
};
