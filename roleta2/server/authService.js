import crypto from 'crypto';
import { cacheAside, KEY, TTL } from './redisService.js';

// Mesmo alvo do proxy de /login — quem emite o token e quem sabe valida-lo.
const AUTH_TARGET = (process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech').replace(/\/+$/, '');

// 'observe' registra sem bloquear; 'enforce' exige token valido.
export const TOKEN_AUTH_MODE = (process.env.TOKEN_AUTH_MODE || 'observe').toLowerCase();

const VERIFY_TIMEOUT_MS = Number(process.env.TOKEN_AUTH_TIMEOUT_MS) || 4000;

export const tokenStats = {
  ok: 0, invalid: 0, mismatch: 0, missing: 0, upstreamError: 0, cacheHit: 0,
};

/** Nunca guardamos o token em claro — a chave de cache e o hash dele. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);

export function extractBearer(req) {
  const raw = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return m ? m[1].trim() : null;
}

/**
 * Le o email do payload do JWT SEM validar a assinatura.
 * Serve so para telemetria e para pular a chamada externa quando o email do
 * token ja nao bate com o da query — nunca como prova de identidade.
 */
export function peekEmailFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf-8'));
    const email = payload.email || payload.sub || null;
    return email ? String(email).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Valida o token no emissor e devolve o email real do dono.
 *
 * O token e HS256 (segredo compartilhado): sem o segredo do provedor nao da
 * para verificar a assinatura aqui. Entao perguntamos a quem sabe — GET
 * /profile responde 200 com o email para token valido e 401 para invalido.
 * O resultado vai para o Redis por TTL.TOKEN_AUTH, senao seria uma ida a
 * rede a cada request do polling.
 *
 * Retorna { valid, email, reason }. Nunca lanca.
 */
export async function verifyToken(token) {
  if (!token) return { valid: false, email: null, reason: 'missing' };

  const cacheKey = KEY.tokenAuth(hashToken(token));

  try {
    const result = await cacheAside(cacheKey, TTL.TOKEN_AUTH, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

      try {
        const res = await fetch(`${AUTH_TARGET}/profile`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: controller.signal,
        });

        if (res.status === 401 || res.status === 403) {
          return { valid: false, email: null, reason: 'invalid' };
        }
        if (!res.ok) {
          // 5xx do upstream: nao e prova de token invalido. Marcamos para o
          // middleware liberar (fail-open) em vez de derrubar o usuario.
          return { valid: false, email: null, reason: 'upstream_error', transient: true };
        }

        const body = await res.json();
        const email = body?.email ? String(body.email).trim().toLowerCase() : null;
        if (!email) return { valid: false, email: null, reason: 'no_email', transient: true };

        return { valid: true, email, reason: 'ok' };
      } finally {
        clearTimeout(timer);
      }
    });

    return result || { valid: false, email: null, reason: 'upstream_error', transient: true };
  } catch (err) {
    // Timeout, DNS, Redis fora: instabilidade nossa ou do upstream nao pode
    // virar bloqueio de assinante.
    return { valid: false, email: null, reason: 'upstream_error', transient: true, error: err.message };
  }
}
