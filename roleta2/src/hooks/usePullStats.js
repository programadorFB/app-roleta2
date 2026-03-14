// src/hooks/usePullStats.js
import { useState, useEffect, useRef } from 'react';

/** Computa Map<number, Map<nextNumber, count>> para 37 números. */
function computePullStats(history) {
  const pullMap = new Map();
  for (let i = 0; i <= 36; i++) pullMap.set(i, new Map());
  for (let i = 1; i < history.length; i++) {
    const curr = history[i].number;
    const next = history[i - 1].number;
    const stats = pullMap.get(curr);
    stats.set(next, (stats.get(next) || 0) + 1);
  }
  return pullMap;
}

function computePreviousStats(history) {
  const prevMap = new Map();
  for (let i = 0; i <= 36; i++) prevMap.set(i, new Map());
  for (let i = 0; i < history.length - 1; i++) {
    const curr = history[i].number;
    const prev = history[i + 1].number;
    const stats = prevMap.get(curr);
    stats.set(prev, (stats.get(prev) || 0) + 1);
  }
  return prevMap;
}

/**
 * Computa pull stats com debounce inteligente:
 *  - Full recompute no primeiro load ou reset
 *  - Debounce de 500ms para evitar cascata de renders
 * 
 * @param {Array} spinHistory - Array de spins
 * @returns {{ numberPullStats, numberPreviousStats }}
 */
export function usePullStats(spinHistory) {
  const [numberPullStats, setNumberPullStats] = useState(() => new Map());
  const [numberPreviousStats, setNumberPreviousStats] = useState(() => new Map());
  
  const timeoutRef = useRef(null);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (spinHistory.length === 0) return;
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      // Recomputa apenas quando realmente há mudança substancial
      const needsFull = prevLengthRef.current === 0
        || spinHistory.length < prevLengthRef.current // roleta mudou (reset)
        || (spinHistory.length - prevLengthRef.current) > 20; // muitos novos

      if (needsFull || prevLengthRef.current === 0) {
        setNumberPullStats(computePullStats(spinHistory));
        setNumberPreviousStats(computePreviousStats(spinHistory));
      }
      // Para 1-20 novos spins, o impacto visual é mínimo — pula

      prevLengthRef.current = spinHistory.length;
    }, 500);

    return () => clearTimeout(timeoutRef.current);
  }, [spinHistory]);

  return { numberPullStats, numberPreviousStats };
}