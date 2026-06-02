/**
 * Gateway HTTP para o gerenciamento_backend (Flask).
 *
 * Fluxo de uma requisição em /api/gerenciamento/*:
 *   1. Middleware extrai email do JWT (Authorization: Bearer ...)
 *   2. Consulta subscriptions por email; rejeita se inativo/expirado
 *   3. Assina HMAC-SHA256(secret, "<user_id>:<ts>") e injeta nos headers
 *   4. http-proxy-middleware encaminha para GERENCIAMENTO_BACKEND_URL
 *
 * O Flask só aceita requests com X-Gateway-Sig válido (window de 60s).
 */

import crypto from 'crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { getSubscriptionByEmail, ACTIVE_STATUSES } from './subscriptionService.js';

const GERENCIAMENTO_BACKEND_URL =
  process.env.GERENCIAMENTO_BACKEND_URL || 'http://gerenciamento_backend:5004';
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || '';

function extractEmailFromAuth(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const parts = auth.slice(7).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    // O JWT do api.appbackend.tech pode usar claims não-padrão. Tenta os mais comuns.
    const candidate = payload.email || payload.sub || payload.user_email
      || payload.userEmail || payload.username || payload.preferred_username
      || (payload.user && (payload.user.email || payload.user.sub));
    return (candidate || '').toString().trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function extractEmailFromHeader(req) {
  const raw = req.headers['x-user-email'];
  if (!raw) return null;
  const email = String(raw).trim().toLowerCase();
  // sanity check leve (não validamos email formalmente — só evitamos injeção)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function signUserId(userId) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac('sha256', GATEWAY_SECRET)
    .update(`${userId}:${ts}`)
    .digest('hex');
  return { ts, sig };
}

export async function gerenciamentoAuthMiddleware(req, res, next) {
  if (!GATEWAY_SECRET) {
    return res.status(500).json({ error: 'GATEWAY_SECRET não configurado' });
  }

  const auth = req.headers.authorization || '';
  if (!auth) {
    return res.status(401).json({ error: 'Token ausente', code: 'NO_TOKEN' });
  }
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Header deve ser "Bearer <jwt>"', code: 'BAD_HEADER' });
  }
  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) {
    return res.status(401).json({
      error: `JWT mal formado (esperado 3 partes, recebido ${parts.length})`,
      code: 'MALFORMED_JWT',
    });
  }

  // Prefere X-User-Email (vem de localStorage.userEmail, gravado no login).
  // Fallback: tenta extrair do JWT (api.appbackend.tech usa claims não padrão).
  const email = extractEmailFromHeader(req) || extractEmailFromAuth(req);
  if (!email) {
    return res.status(401).json({
      error: 'Email do usuário não identificado (X-User-Email ausente e JWT sem claim)',
      code: 'NO_EMAIL_CLAIM',
    });
  }

  let sub;
  try {
    sub = await getSubscriptionByEmail(email);
  } catch (err) {
    console.error('[gerenciamentoGateway] erro consultando subscription:', err.message);
    return res.status(500).json({ error: 'Erro ao validar assinatura' });
  }
  if (!sub) {
    return res.status(403).json({ error: 'Sem assinatura', code: 'NO_SUBSCRIPTION' });
  }
  if (!ACTIVE_STATUSES.includes(sub.status)) {
    return res.status(403).json({ error: 'Assinatura inativa', code: 'INACTIVE_SUBSCRIPTION' });
  }
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
    return res.status(403).json({ error: 'Assinatura expirada', code: 'EXPIRED_SUBSCRIPTION' });
  }

  req.gerenciamentoUser = { userId: sub.user_id, email: sub.email };
  next();
}

export const gerenciamentoProxy = createProxyMiddleware({
  target: GERENCIAMENTO_BACKEND_URL,
  changeOrigin: true,
  timeout: 30000,
  // /api/gerenciamento/transactions -> /transactions
  pathRewrite: { '^/api/gerenciamento': '' },

  // http-proxy-middleware v3 usa `on:` para eventos (ver mudança em 3.0)
  on: {
    proxyReq: (proxyReq, req) => {
      const userId = req.gerenciamentoUser?.userId;
      if (!userId) {
        proxyReq.destroy(new Error('userId ausente após auth middleware'));
        return;
      }
      const { ts, sig } = signUserId(userId);
      proxyReq.setHeader('X-User-Id', userId);
      proxyReq.setHeader('X-Gateway-Ts', ts);
      proxyReq.setHeader('X-Gateway-Sig', sig);
      // Não vaza o JWT do roleta3 para o backend interno
      proxyReq.removeHeader('authorization');
      proxyReq.removeHeader('cookie');
    },
    error: (err, req, res) => {
      console.error('[gerenciamentoGateway] proxy error:', err.message);
      if (res && !res.headersSent && typeof res.status === 'function') {
        res.status(502).json({
          error: 'gerenciamento_backend indisponível',
          detail: err.message,
        });
      }
    },
  },
});
