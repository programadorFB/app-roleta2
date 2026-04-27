import crypto from 'crypto';
import { query } from './db.js';
import { cacheAside, cacheDel, KEY, TTL } from './redisService.js';
import { sendWelcomeEmail, sendExpirationReminderEmail } from './emailService.js';

// Status que representam acesso ativo — definido uma única vez
export const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];

function extractCustomerData(payload) {
  const candidates = [
    payload.data?.customer,
    payload.data?.user,
    payload.event?.member,
    payload.event?.user,
    payload.event?.invoice?.payer,
    payload.member,
    payload.user,
    payload.customer,
    payload.payer,
    payload,
  ];

  for (const c of candidates) {
    if (c?.email) {
      return { email: c.email, hublaId: c.id || c.customerId, name: c.name };
    }
  }

  try {
    const match = JSON.stringify(payload).match(/"email"\s*:\s*"([^"]+)"/);
    if (match) {
      console.warn('⚠️ [HUBLA] Email encontrado via regex:', match[1]);
      return { email: match[1], hublaId: null, name: null };
    }
  } catch { /* ignore */ }

  return { email: null, hublaId: null, name: null };
}

function calculateExpirationByAmount(totalCents) {
  if (!totalCents) return null;
  const cents = parseInt(totalCents, 10);
  const date  = new Date();
  if (cents <= 9700)       date.setDate(date.getDate() + 30);
  else if (cents <= 19700) date.setDate(date.getDate() + 90);
  else                     date.setFullYear(date.getFullYear() + 1);
  console.log(`📅 [PRAZO] R$ ${(cents / 100).toFixed(2)} → ${date.toLocaleDateString()}`);
  return date;
}

const VALID_TRANSITIONS = {
  pending:  ['active', 'canceled', 'failed'],
  active:   ['canceled', 'expired'],
  trialing: ['active', 'canceled'],
  canceled: ['active'],
  failed:   ['pending', 'active'],
  expired:  ['active'],
};

function isValidStatusTransition(current, next) {
  if (!current || current === next) return true;
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    console.warn(`⚠️ [TRANSITION] Bloqueada: ${current} → ${next}`);
    return false;
  }
  return true;
}

async function invalidateSubscriptionCaches(email) {
  await Promise.all([
    cacheDel(KEY.sub(email)),
    cacheDel(KEY.adminStats()),
    cacheDel(KEY.activeSubs()),
  ]);
}

export async function logSubscriptionAudit(userId, email, fromStatus, toStatus, triggeredBy = 'webhook') {
  try {
    await query(
      `INSERT INTO subscription_audit (user_id, email, from_status, to_status, triggered_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, email, fromStatus || null, toStatus, triggeredBy],
    );
  } catch (err) {
    console.error('❌ [AUDIT] Falha ao registrar:', err.message);
  }
}

export async function upsertSubscription(subscriptionData) {
  const { userId, email, hublaCustomerId, subscriptionId, status, planName, expiresAt } = subscriptionData;

  if (!email) throw new Error('Email obrigatório para criar/atualizar assinatura');

  const lockSql = `SELECT * FROM subscriptions WHERE user_id = $1 FOR UPDATE NOWAIT`;
  let existing;

  try {
    const { rows } = await query(lockSql, [userId]);
    existing = rows[0];
  } catch (lockErr) {
    if (lockErr.code === '55P03') {
      console.warn(`⚠️ [UPSERT] Lock ocupado para ${userId} — aguardando`);
      await new Promise(r => setTimeout(r, 100));
      const { rows } = await query(lockSql.replace('NOWAIT', ''), [userId]);
      existing = rows[0];
    } else {
      throw lockErr;
    }
  }

  if (status && existing && !isValidStatusTransition(existing.status, status)) {
    throw new Error(`Transição inválida: ${existing.status} → ${status}`);
  }

  let result;

  if (existing) {
    const updates = [];
    const values  = [userId];
    let   i       = 2;

    if (email           !== undefined) { updates.push(`email = $${i++}`);              values.push(email); }
    if (hublaCustomerId !== undefined) { updates.push(`hubla_customer_id = $${i++}`);  values.push(hublaCustomerId); }
    if (subscriptionId  !== undefined) { updates.push(`subscription_id = $${i++}`);   values.push(subscriptionId); }
    if (status          !== undefined) { updates.push(`status = $${i++}`);             values.push(status); }
    if (planName        !== undefined) { updates.push(`plan_name = $${i++}`);          values.push(planName); }
    if (expiresAt       !== undefined) { updates.push(`expires_at = $${i++}`);         values.push(expiresAt); }

    if (updates.length === 0) return existing;

    updates.push('updated_at = NOW()');
    result = await query(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE user_id = $1 RETURNING *`,
      values,
    );
    console.log(`✅ [UPSERT] Atualizado: ${email} | ${status || existing.status}`);
  } else {
    result = await query(
      `INSERT INTO subscriptions
         (user_id, email, hubla_customer_id, subscription_id, status, plan_name, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [userId, email, hublaCustomerId || null, subscriptionId || null, status || 'pending', planName || 'default', expiresAt || null],
    );
    console.log(`✅ [UPSERT] Criado: ${email} | ${status || 'pending'}`);
  }

  const updated = result.rows[0];

  if (status && status !== existing?.status) {
    await logSubscriptionAudit(userId, email, existing?.status || null, status);
  }

  await invalidateSubscriptionCaches(email);

  return updated;
}

export async function getSubscriptionByUserId(userId) {
  const { rows } = await query('SELECT * FROM subscriptions WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

export async function getSubscriptionByEmail(email) {
  return cacheAside(KEY.sub(email), TTL.SUBSCRIPTION, async () => {
    const { rows } = await query('SELECT * FROM subscriptions WHERE email = $1', [email]);
    return rows[0] || null;
  });
}

export async function getSubscriptionByHublaId(hublaCustomerId) {
  const { rows } = await query('SELECT * FROM subscriptions WHERE hubla_customer_id = $1', [hublaCustomerId]);
  return rows[0] || null;
}

export async function hasActiveAccess(userId) {
  try {
    const sub = await getSubscriptionByUserId(userId);
    if (!sub) return false;
    if (!ACTIVE_STATUSES.includes(sub.status)) return false;
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function logWebhookEvent(eventType, payload, status = 'success', errorMessage = null) {
  try {
    await query(
      `INSERT INTO webhook_logs (event_type, payload, status, error_message) VALUES ($1, $2, $3, $4)`,
      [eventType, JSON.stringify(payload || {}), status, errorMessage],
    );
  } catch (err) {
    console.error('❌ [WEBHOOK_LOG] Erro ao registrar:', err.message);
  }
}

export function verifyHublaWebhook(hublaToken, expectedToken) {
  if (!expectedToken || !hublaToken) return false;
  try {
    const a = Buffer.from(String(hublaToken));
    const b = Buffer.from(String(expectedToken));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function handleAccessGranted(payload) {
  const { email, hublaId, name } = extractCustomerData(payload);
  if (!email) throw new Error('Email não encontrado para liberar acesso');

  const subscription = payload.event?.subscription || payload.subscription || payload.data?.subscription;
  const userId       = hublaId || email.split('@')[0];
  const planName     = subscription?.planName || 'Membro';

  const existing = await getSubscriptionByEmail(email);

  const result = await upsertSubscription({
    userId: userId.toString(), email, hublaCustomerId: hublaId,
    subscriptionId: subscription?.id, status: 'active', planName,
  });
  console.log(`✅ [HUBLA] Acesso liberado: ${email}`);

  // Envia email de boas-vindas apenas para novos membros
  if (!existing || existing.status !== 'active') {
    sendWelcomeEmail({ name, email, planName }).catch(err =>
      console.error(`❌ [HUBLA] Falha ao enviar email de boas-vindas para ${email}:`, err.message),
    );
  }

  return result;
}

async function handleAccessRemoved(payload) {
  const { email } = extractCustomerData(payload);
  if (!email) throw new Error('Email não encontrado para remover acesso');

  const existing = await getSubscriptionByEmail(email);
  if (!existing) return;

  const result = await upsertSubscription({ userId: existing.user_id, email, status: 'canceled' });
  console.log(`🚫 [HUBLA] Acesso removido: ${email}`);
  return result;
}

async function handlePaymentSucceeded(payload) {
  const { email, hublaId, name } = extractCustomerData(payload);
  if (!email) throw new Error('Email não encontrado no pagamento');

  const invoice    = payload.event?.invoice || payload.invoice || payload.data?.invoice;
  const totalCents = invoice?.amount?.totalCents || invoice?.totalCents;
  const expiresAt  = totalCents ? calculateExpirationByAmount(totalCents) : invoice?.periodEnd;
  const planName   = invoice?.productName || 'Premium';

  const existing = await getSubscriptionByEmail(email);
  const userId   = existing ? existing.user_id : (hublaId || email.split('@')[0]);

  const result = await upsertSubscription({
    userId: userId.toString(), email, hublaCustomerId: hublaId,
    subscriptionId: invoice?.subscriptionId, status: 'active',
    planName, expiresAt,
  });

  console.log(`💰 [HUBLA] Pagamento: R$ ${totalCents ? (totalCents / 100).toFixed(2) : '?'} | Prazo: ${expiresAt instanceof Date ? expiresAt.toLocaleDateString() : expiresAt} | ${email}`);

  // Envia email de boas-vindas para novos membros ou reativações
  if (!existing || existing.status !== 'active') {
    sendWelcomeEmail({ name, email, planName, expiresAt, amount: totalCents }).catch(err =>
      console.error(`❌ [HUBLA] Falha ao enviar email de boas-vindas para ${email}:`, err.message),
    );
  }

  return result;
}

async function handleInvoiceStatusUpdated(payload) {
  const { email } = extractCustomerData(payload);
  const invoice   = payload.event?.invoice || payload.invoice || payload.data?.invoice;
  if (!email) return { status: 'ignored' };

  const existing = await getSubscriptionByEmail(email);
  if (!existing || !invoice?.status) return existing;

  const statusMap = { paid: 'active', pending: 'pending', canceled: 'canceled', failed: 'failed' };
  const newStatus = statusMap[invoice.status] || existing.status;

  if (newStatus !== existing.status) {
    await upsertSubscription({ userId: existing.user_id, email, status: newStatus });
    console.log(`📊 [HUBLA] Status → ${newStatus}: ${email}`);
  }
  return existing;
}

async function handleSubscriptionCreated(payload) {
  const { email, hublaId } = extractCustomerData(payload);
  if (!email) throw new Error('Email não encontrado (handleSubscriptionCreated)');

  const subscription = payload.event?.subscription || payload.subscription || payload.data?.subscription;
  const hublaStatus  = subscription?.status;
  const dbStatus     = hublaStatus === 'inactive' ? 'pending' : (hublaStatus || 'active');
  const userId       = hublaId || email.split('@')[0];

  const result = await upsertSubscription({
    userId: userId.toString(), email, hublaCustomerId: hublaId,
    subscriptionId: subscription?.id, status: dbStatus,
    planName: subscription?.planName || 'default', expiresAt: subscription?.nextBillingDate || null,
  });
  console.log(`🆕 [HUBLA] Assinatura criada: ${email} (${dbStatus})`);
  return result;
}

async function handleSubscriptionCanceled(payload) {
  const { email } = extractCustomerData(payload);
  if (!email) throw new Error('Email não encontrado');

  const existing = await getSubscriptionByEmail(email);
  if (!existing) return;

  await upsertSubscription({ userId: existing.user_id, email, status: 'canceled' });
  console.log(`🚫 [HUBLA] Cancelada: ${email}`);
}

async function handleSubscriptionRenewed(payload) {
  const { email }    = extractCustomerData(payload);
  const subscription = payload.event?.subscription || payload.subscription || payload.data?.subscription;
  if (!email) throw new Error('Email não encontrado');

  const existing = await getSubscriptionByEmail(email);
  if (!existing) return;

  await upsertSubscription({
    userId: existing.user_id, email, status: 'active',
    expiresAt: subscription?.nextBillingDate || null,
  });
  console.log(`🔄 [HUBLA] Renovada: ${email}`);
}

export async function processHublaWebhook(eventType, payload) {
  console.log(`\n🔔 [HUBLA] Evento: ${eventType}`);
  try {
    let result;
    switch (eventType) {
      case 'customer.member_added':
      case 'member.access_granted':
        result = await handleAccessGranted(payload); break;
      case 'customer.member_removed':
      case 'member.access_removed':
        result = await handleAccessRemoved(payload); break;
      case 'invoice.payment_succeeded':
        result = await handlePaymentSucceeded(payload); break;
      case 'invoice.status_updated':
        result = await handleInvoiceStatusUpdated(payload); break;
      case 'subscription.created':
        result = await handleSubscriptionCreated(payload); break;
      case 'subscription.deactivated':
      case 'subscription.canceled':
        result = await handleSubscriptionCanceled(payload); break;
      case 'subscription.activated':
      case 'subscription.renewed':
        result = await handleSubscriptionRenewed(payload); break;
      default:
        console.log(`⚠️ [HUBLA] Evento não tratado: ${eventType}`);
        await logWebhookEvent(eventType, payload, 'ignored', 'Evento não tratado');
        return { status: 'ignored' };
    }
    await logWebhookEvent(eventType, payload, 'success');
    return result;
  } catch (err) {
    console.error(`❌ [HUBLA] Erro ao processar ${eventType}:`, err);
    await logWebhookEvent(eventType, payload, 'error', err.message);
    throw err;
  }
}

export async function getActiveSubscriptions() {
  return cacheAside(KEY.activeSubs(), TTL.ACTIVE_SUBS, async () => {
    const { rows } = await query(
      `SELECT * FROM subscriptions
       WHERE status IN ('active', 'trialing', 'paid')
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
    );
    return rows;
  });
}

// ── Aviso de vencimento (2 dias antes) ──────────────────────────
//
// Janela temporal: expires_at entre NOW()+36h e NOW()+60h — captura assinaturas
// ~2 dias de vencimento, com folga de ±12h para absorver atrasos/antecipações
// do job sem perder ninguém nem duplicar.
export async function sendExpirationReminders({ dryRun = false } = {}) {
  const { rows } = await query(
    `SELECT user_id, email, plan_name, expires_at, expiration_reminder_sent_at
       FROM subscriptions
      WHERE status IN ('active', 'trialing', 'paid')
        AND expires_at IS NOT NULL
        AND expires_at BETWEEN NOW() + INTERVAL '36 hours'
                           AND NOW() + INTERVAL '60 hours'
        AND (
          expiration_reminder_sent_at IS NULL
          OR expiration_reminder_sent_at < expires_at - INTERVAL '7 days'
        )`
  );

  if (rows.length === 0) {
    return { sent: 0, skipped: 0, failed: 0, total: 0 };
  }

  console.log(`📧 [REMINDER] ${rows.length} assinatura(s) candidata(s) a aviso de vencimento${dryRun ? ' (DRY-RUN)' : ''}`);

  let sent = 0, failed = 0;

  for (const sub of rows) {
    const msLeft   = new Date(sub.expires_at).getTime() - Date.now();
    const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    if (dryRun) {
      console.log(`  [DRY] ${sub.email} — ${daysLeft}d — vence ${new Date(sub.expires_at).toLocaleString('pt-BR')}`);
      continue;
    }

    try {
      const ok = await sendExpirationReminderEmail({
        email:     sub.email,
        planName:  sub.plan_name,
        expiresAt: sub.expires_at,
        daysLeft,
      });
      if (ok) {
        await query(
          `UPDATE subscriptions SET expiration_reminder_sent_at = NOW() WHERE user_id = $1`,
          [sub.user_id],
        );
        await invalidateSubscriptionCaches(sub.email);
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`❌ [REMINDER] Falha em ${sub.email}:`, err.message);
    }
  }

  console.log(`📧 [REMINDER] Concluído — enviados: ${sent}, falhas: ${failed}`);
  return { sent, skipped: 0, failed, total: rows.length };
}

export async function getSubscriptionStats() {
  return cacheAside(KEY.adminStats(), TTL.ADMIN_STATS, async () => {
    const { rows } = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status IN ('active','trialing','paid') AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END) AS active,
         COUNT(CASE WHEN status = 'canceled' THEN 1 END) AS canceled,
         COUNT(CASE WHEN status = 'pending'  THEN 1 END) AS pending,
         COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) AS expired
       FROM subscriptions`,
    );
    return rows[0];
  });
}

export async function getWebhookLogs(limit = 100) {
  const { rows } = await query(
    `SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getSubscriptionAuditLog(email, limit = 50) {
  const { rows } = await query(
    `SELECT * FROM subscription_audit WHERE email = $1 ORDER BY created_at DESC LIMIT $2`,
    [email, limit],
  );
  return rows;
}

export async function getAllAuditLogs(limit = 100) {
  const { rows } = await query(
    `SELECT * FROM subscription_audit ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export default {
  upsertSubscription, getSubscriptionByUserId, getSubscriptionByEmail,
  getSubscriptionByHublaId, hasActiveAccess, processHublaWebhook,
  verifyHublaWebhook, getActiveSubscriptions, getSubscriptionStats,
  logWebhookEvent, getWebhookLogs, logSubscriptionAudit,
  getSubscriptionAuditLog, getAllAuditLogs, sendExpirationReminders,
};
