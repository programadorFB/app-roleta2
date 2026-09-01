/**
 * api.js — Cliente das rotas /api/admin.
 *
 * Usa signedFetch para continuar assinando as chamadas: o painel é servido do
 * mesmo bundle do app, então tem a chave e não precisa de isenção de HMAC.
 * O Bearer aqui é a sessão do ADMIN, não o token do usuário final — por isso é
 * setado explicitamente (o signedFetch só preenche o header se ele faltar).
 */

import { signedFetch } from '../lib/signedFetch.js';

const API_URL = import.meta.env.VITE_API_URL || '';
const STORAGE_KEY = 'adminToken';

export function getAdminToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // sessionStorage bloqueado (aba anônima com restrição): a sessão vive só
    // em memória e o admin reloga ao recarregar.
    return null;
  }
}

export function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* segue sem persistir */ }
}

/** Erro com status, para a UI distinguir 401 (sessão morta) de falha real. */
export class AdminApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body = null, token } = {}) {
  const url = new URL(`${API_URL}/api/admin${path}`, window.location.origin);

  const headers = { Accept: 'application/json' };
  const auth = token || getAdminToken();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await signedFetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch { /* resposta sem corpo */ }

  if (!res.ok) {
    throw new AdminApiError(data?.error || `Falha na requisição (${res.status})`, res.status);
  }
  return data;
}

export const adminApi = {
  login:  (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me:     (token)           => request('/auth/me', { token }),
  logout: ()                => request('/auth/logout', { method: 'POST' }),

  overview:   ()      => request('/metrics/overview'),
  retention:  (weeks) => request(`/metrics/retention?weeks=${weeks || 8}`),
  engagement: (days)  => request(`/metrics/engagement?days=${days || 14}`),
  funnel:     ()      => request('/metrics/funnel'),

  users:      (params = {}) => {
    // Só manda o que tem valor: parâmetro vazio na query string vira filtro
    // vazio no backend e atrapalha o cache do navegador à toa.
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== '' && v !== null && v !== undefined) q.set(k, v);
    }
    return request(`/users?${q}`);
  },
  userDetail: (email) => request(`/users/${encodeURIComponent(email)}`),
  // CPF e telefone INTEIROS. Rota separada de propósito: exige admin nominal,
  // tem limite estreito e grava na auditoria quem revelou o dado de quem.
  pii: (email) => request(`/users/${encodeURIComponent(email)}/pii`),
  // Campos crus da casa (centenas): rota à parte para não pesar a ficha.
  plataformaBruta: (email) => request(`/users/${encodeURIComponent(email)}/plataforma`),
  // Mesma rota serve para criar: o backend faz upsert e o login procura por
  // email OU main_app_email.
  criarUsuario: (email, payload) =>
    request(`/users/${encodeURIComponent(email)}/subscription`, { method: 'POST', body: payload }),

  setSubscription: (email, payload) =>
    request(`/users/${encodeURIComponent(email)}/subscription`, { method: 'POST', body: payload }),
  disconnect: (email) =>
    request(`/users/${encodeURIComponent(email)}/disconnect`, { method: 'POST' }),

  bans:       ()      => request('/bans'),
  revokeBan:  (email) => request('/bans/revoke', { method: 'POST', body: { email } }),
  createBan:  (email, reason) => request('/bans', { method: 'POST', body: { email, reason } }),

  auditLog:   (limit) => request(`/audit-log?limit=${limit || 100}`),
};

/** Segundos → "2h 13min" / "4min 20s". Usado em toda métrica de permanência. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

/** Numero -> R$ 1.234,56. Devolve traco quando nao ha valor, para a tela nao
    exibir "R$ 0,00" onde o certo e "nao informado". */
export function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** 12345678900 -> 123.456.789-00. Fora do tamanho, devolve como veio. */
export function formatCpf(digitos) {
  if (!digitos) return '—';
  const d = String(digitos);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** 11988887777 -> (11) 98888-7777. Sem DDI: o completo vive no `title`. */
export function formatPhone(digitos) {
  if (!digitos) return '—';
  const d = String(digitos);
  const m = /^(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
}

/**
 * Ha quanto tempo — "agora", "40 min", "3 h", "12 d".
 *
 * Existe por causa do saldo: ele mora na casa e so e relido quando a pessoa
 * entra no app. Sem a idade ao lado, o operador agiria em cima de um numero de
 * duas semanas atras achando que e o de agora.
 */
export function formatAge(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(min) || min < 0) return '';
  if (min < 2) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
