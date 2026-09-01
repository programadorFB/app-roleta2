/**
 * telemetry.js — Coleta de uso do app, consumida pela área administrativa.
 *
 * Regras que valem para tudo aqui:
 * - Telemetria NUNCA quebra o app. Todo caminho de erro é engolido.
 * - Envio em lote. Uma request por evento transformaria a navegação normal em
 *   dezenas de chamadas por minuto.
 * - O batimento 'alive' só sai com a aba visível: é ele que faz o backend medir
 *   tempo de uso, e não tempo de aba esquecida aberta.
 */

import { signedFetch } from './signedFetch.js';

const API_URL = import.meta.env.VITE_API_URL || '';

const FLUSH_INTERVAL_MS   = 15_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const FLUSH_AT_COUNT      = 20;
// Teto da fila: se o backend está fora, a fila não pode crescer sem limite e
// virar vazamento de memória numa aba deixada aberta o dia todo.
const MAX_QUEUE = 100;

const state = {
  email: null,
  sessionId: null,
  queue: [],
  flushTimer: null,
  heartbeatTimer: null,
  started: false,
};

/** Identifica o usuário. Sem email não há coleta. */
export function setTelemetryUser(email) {
  state.email = email ? String(email).trim().toLowerCase() : null;
  if (!state.email) state.queue = [];
}

/** Id da sessão devolvido pelo socket no evento 'session:started'. */
export function setTelemetrySession(sessionId) {
  state.sessionId = sessionId || null;
}

/** Enfileira um evento. */
export function track(event, view = null, meta = null) {
  if (!state.email) return;

  state.queue.push({ event, view, meta });
  if (state.queue.length > MAX_QUEUE) state.queue = state.queue.slice(-MAX_QUEUE);
  if (state.queue.length >= FLUSH_AT_COUNT) flush();
}

/**
 * Envia o que está na fila.
 * @param {boolean} keepalive — usar no unload, para o request sobreviver à
 *   navegação. sendBeacon não serve aqui: não aceita headers, e sem X-Sig o
 *   backend em enforce recusaria a chamada.
 */
export async function flush(keepalive = false) {
  if (!state.email || state.queue.length === 0) return;

  const batch = state.queue;
  state.queue = [];

  try {
    const url = new URL(`${API_URL}/api/telemetry`, window.location.origin);
    url.searchParams.set('userEmail', state.email);

    await signedFetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch, sessionId: state.sessionId }),
      keepalive,
    });
  } catch {
    // Lote perdido de propósito: recolocar na fila faz a próxima tentativa
    // levar o dobro e, com o backend fora, vira uma bola de neve.
  }
}

/** Liga os timers e os listeners de visibilidade. Idempotente. */
export function startTelemetry() {
  if (state.started || typeof document === 'undefined') return;
  state.started = true;

  state.flushTimer = setInterval(() => flush(), FLUSH_INTERVAL_MS);

  state.heartbeatTimer = setInterval(() => {
    if (document.visibilityState === 'visible') track('alive');
  }, HEARTBEAT_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
}

export function stopTelemetry() {
  if (!state.started) return;
  state.started = false;

  clearInterval(state.flushTimer);
  clearInterval(state.heartbeatTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);

  flush(true);
}

function onVisibilityChange() {
  // Sair da aba é o melhor momento para despachar: é quando o usuário pode não
  // voltar mais, e o lote pendente se perderia.
  if (document.visibilityState === 'hidden') flush(true);
  else track('alive');
}

function onPageHide() {
  flush(true);
}
