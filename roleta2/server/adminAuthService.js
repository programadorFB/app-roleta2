/**
 * adminAuthService.js — Contas e sessões do painel administrativo.
 *
 * Por que não reusar o ADMIN_SECRET: um segredo compartilhado responde "é um
 * admin?", nunca "qual admin?". Como o painel banir usuário e mexer em
 * assinatura, a auditoria precisa de nome próprio.
 *
 * Por que sessão opaca no Redis e não o jsonwebtoken que já está no projeto:
 * JWT não é revogável. Logout e desativação de conta precisam valer na hora.
 */

import crypto from 'crypto';
import { query } from './db.js';
import { cacheGet, cacheSet, cacheDel, KEY, TTL } from './redisService.js';

// Parâmetros do scrypt. N=16384 leva ~50ms por verificação nesta classe de
// hardware: barato para um login por dia, caro para força bruta em massa.
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN   = 64;

/** Gera "scrypt$N$r$p$salt$hash". O formato carrega os parâmetros para permitir aumentá-los depois sem invalidar as senhas antigas. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt}$${hash.toString('hex')}`;
}

/** Confere a senha. Comparação em tempo constante — nunca com ===. */
export function verifyPassword(password, stored) {
  try {
    const [alg, n, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;

    const derived = crypto.scryptSync(password, salt, KEYLEN, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    const expected = Buffer.from(hash, 'hex');

    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Valida credenciais e abre a sessão.
 * Retorna { token, admin } ou null — a mensagem de erro é sempre a mesma para
 * não revelar se o email existe.
 */
export async function login(email, password) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !password) return null;

  const { rows } = await query(
    `SELECT id, email, password_hash, name, role
       FROM admin_users
      WHERE email = $1 AND disabled_at IS NULL`,
    [clean],
  );

  const admin = rows[0];
  // Hash falso quando o email não existe: sem isso, a resposta volta na hora e
  // o tempo de resposta vira um oráculo de quais emails são admin.
  if (!admin) {
    verifyPassword(password, hashPassword('senha-inexistente'));
    return null;
  }

  if (!verifyPassword(password, admin.password_hash)) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const session = { id: admin.id, email: admin.email, name: admin.name, role: admin.role };

  await cacheSet(KEY.adminSession(tokenHash(token)), session, TTL.ADMIN_SESSION);
  await query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [admin.id]);

  return { token, admin: session };
}

/** Resolve a sessão e renova o TTL (janela deslizante). Null se inválida. */
export async function resolveSession(token) {
  if (!token) return null;

  const key = KEY.adminSession(tokenHash(token));
  const session = await cacheGet(key);
  if (!session) return null;

  // A conta é reconferida no banco a cada request. Sem isso, desativar um admin
  // só impediria LOGIN NOVO — a sessão dele seguiria válida por até 8h, que é
  // exatamente o cenário em que revogar acesso precisa valer na hora (alguém
  // saiu da equipe, conta comprometida). É uma consulta por request, indexada
  // por idx_admin_users_active; num painel interno isso não pesa.
  const { rows } = await query(
    `SELECT id FROM admin_users WHERE id = $1 AND disabled_at IS NULL`,
    [session.id],
  );
  if (!rows[0]) {
    await cacheDel(key);
    return null;
  }

  // Renovação a cada request: quem está trabalhando não é deslogado no meio de
  // uma tarefa, e quem parou expira em 8h.
  await cacheSet(key, session, TTL.ADMIN_SESSION);
  return session;
}

export async function logout(token) {
  if (!token) return;
  await cacheDel(KEY.adminSession(tokenHash(token)));
}

/** Cria uma conta. Usado pelo CLI — não há endpoint de auto-registro. */
export async function createAdmin({ email, password, name, role = 'admin' }) {
  const clean = String(email).trim().toLowerCase();
  const { rows } = await query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name          = EXCLUDED.name,
       role          = EXCLUDED.role,
       disabled_at   = NULL
     RETURNING id, email, name, role, created_at`,
    [clean, hashPassword(password), name || null, role],
  );
  return rows[0];
}

export async function listAdmins() {
  const { rows } = await query(
    `SELECT id, email, name, role, created_at, last_login_at, disabled_at
       FROM admin_users ORDER BY created_at`,
  );
  return rows;
}

/**
 * Registra uma ação no log de auditoria.
 * Nunca lança: falha de auditoria não pode derrubar a ação em si, mas precisa
 * gritar no log para não passar despercebida.
 */
export async function logAdminAction({ adminEmail, action, targetEmail = null, payload = null, ipHash = null }) {
  try {
    await query(
      `INSERT INTO admin_audit (admin_email, action, target_email, payload, ip_hash)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [adminEmail, action, targetEmail, payload ? JSON.stringify(payload) : null, ipHash],
    );
  } catch (err) {
    console.error('❌ [admin] auditoria falhou:', err.message, { action, targetEmail });
  }
}

export async function listAdminAudit(limit = 100) {
  const { rows } = await query(
    `SELECT id, admin_email, action, target_email, payload, created_at
       FROM admin_audit ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
