// subscriptionService.js - VERSÃO CORRIGIDA (Race-safe + Upsert Seletivo)
// Gerenciamento de assinaturas e controle de acesso via Hubla com PostgreSQL

import { query } from './db.js';
import { cacheAside, cacheDel, KEY, TTL } from './redisService.js';

/**
 * --- FUNÇÃO DE SEGURANÇA ---
 * Varre o payload inteiro em busca de dados do cliente de forma recursiva e segura.
 */
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
        payload 
    ];

    let email = null;
    let hublaId = null;
    let name = null;

    for (const candidate of candidates) {
        if (candidate && candidate.email) {
            email = candidate.email;
            hublaId = candidate.id || candidate.customerId;
            name = candidate.name;
            break; 
        }
    }

    if (!email) {
        try {
            const jsonString = JSON.stringify(payload);
            const emailMatch = jsonString.match(/"email"\s*:\s*"([^"]+)"/);
            if (emailMatch) {
                email = emailMatch[1];
                console.log('⚠️ [HUBLA_RESCUE] Email encontrado via Regex:', email);
            }
        } catch (e) {
            console.error('Erro na varredura profunda de email:', e);
        }
    }

    return { email, hublaId, name };
}

/**
 * --- REGRA DE NEGÓCIO ---
 * Calcula data de expiração baseada no valor pago (em centavos)
 */
function calculateExpirationByAmount(totalCents) {
    if (!totalCents) return null;
    
    const cents = parseInt(totalCents, 10);
    const date = new Date();

    // ✅ REGRAS CORRIGIDAS
    if (cents <= 9700) {
        // Até R$ 97,00 → 30 dias
        date.setDate(date.getDate() + 30);
        console.log(`📅 [PRAZO] R$ ${(cents/100).toFixed(2)} → 30 dias`);
    } 
    else if (cents <= 19700) {
        // ✅ CORRIGIDO: Até R$ 197,00 → 90 dias (era 20700)
        date.setDate(date.getDate() + 90);
        console.log(`📅 [PRAZO] R$ ${(cents/100).toFixed(2)} → 90 dias`);
    } 
    else {
        // Acima de R$ 197,00 → 12 meses
        date.setFullYear(date.getFullYear() + 1);
        console.log(`📅 [PRAZO] R$ ${(cents/100).toFixed(2)} → 12 meses`);
    }

    return date;
}

/**
 * ✅ VALIDAÇÃO DE TRANSIÇÕES DE ESTADO
 * Define quais mudanças de status são permitidas
 */
const VALID_TRANSITIONS = {
    'pending': ['active', 'canceled', 'failed'],
    'active': ['canceled', 'expired'],
    'trialing': ['active', 'canceled'],
    'canceled': ['active'], // Permite reativação
    'failed': ['pending', 'active'],
    'expired': ['active'] // Permite renovação
};

function isValidStatusTransition(currentStatus, newStatus) {
    if (!currentStatus) return true; // Primeira vez, permite qualquer status
    if (currentStatus === newStatus) return true; // Não mudou
    
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
        console.warn(`⚠️ [TRANSITION] Transição inválida: ${currentStatus} → ${newStatus}`);
        return false;
    }
    return true;
}

/**
 * ✅ UPSERT SELETIVO COM LOCK PESSIMISTA
 * Atualiza APENAS os campos explicitamente fornecidos
 */
export async function upsertSubscription(subscriptionData) {
    try {
        const {
            userId,
            email,
            hublaCustomerId,
            subscriptionId,
            status,
            planName,
            expiresAt
        } = subscriptionData;
        
        if (!email) {
            throw new Error('Email é obrigatório para criar/atualizar assinatura');
        }

        // Lock pessimista
        const lockSql = `SELECT * FROM subscriptions WHERE user_id = $1 FOR UPDATE NOWAIT`;
        
        let existing;
        try {
            const lockResult = await query(lockSql, [userId]);
            existing = lockResult.rows[0];
        } catch (lockError) {
            if (lockError.code === '55P03') {
                console.warn(`⚠️ [UPSERT] Lock ocupado para userId: ${userId} - retry em 100ms`);
                await new Promise(resolve => setTimeout(resolve, 100));
                const retryResult = await query(lockSql.replace('NOWAIT', ''), [userId]);
                existing = retryResult.rows[0];
            } else {
                throw lockError;
            }
        }

        // Validação de transição
        if (status && existing && !isValidStatusTransition(existing.status, status)) {
            console.error(`❌ [UPSERT] Transição bloqueada: ${existing.status} → ${status}`);
            throw new Error(`Transição de estado inválida: ${existing.status} → ${status}`);
        }

        let result;

        if (existing) {
            // UPDATE
            const updates = [];
            const values = [userId];
            let paramIndex = 2;

            if (email !== undefined) {
                updates.push(`email = $${paramIndex}`);
                values.push(email);
                paramIndex++;
            }
            if (hublaCustomerId !== undefined) {
                updates.push(`hubla_customer_id = $${paramIndex}`);
                values.push(hublaCustomerId);
                paramIndex++;
            }
            if (subscriptionId !== undefined) {
                updates.push(`subscription_id = $${paramIndex}`);
                values.push(subscriptionId);
                paramIndex++;
            }
            if (status !== undefined) {
                updates.push(`status = $${paramIndex}`);
                values.push(status);
                paramIndex++;
            }
            if (planName !== undefined) {
                updates.push(`plan_name = $${paramIndex}`);
                values.push(planName);
                paramIndex++;
            }
            if (expiresAt !== undefined) {
                updates.push(`expires_at = $${paramIndex}`);
                values.push(expiresAt);
                paramIndex++;
            }

            if (updates.length === 0) {
                console.log(`⚠️ [UPSERT] Nenhum campo para atualizar: ${userId}`);
                return existing;
            }

            updates.push('updated_at = NOW()');

            const updateSql = `
                UPDATE subscriptions 
                SET ${updates.join(', ')}
                WHERE user_id = $1
                RETURNING *
            `;

            result = await query(updateSql, values);
            console.log(`✅ [UPSERT] ATUALIZADO: ${email} | Status: ${status || existing.status}`);

            // ⚡ Invalida caches de subscription
            await cacheDel(KEY.sub(email));
            await cacheDel(KEY.adminStats());
            await cacheDel(KEY.activeSubs());

        } else {
            // INSERT
            const insertSql = `
                INSERT INTO subscriptions (
                    user_id, 
                    email, 
                    hubla_customer_id, 
                    subscription_id, 
                    status, 
                    plan_name, 
                    expires_at,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING *
            `;

            const insertValues = [
                userId,
                email,
                hublaCustomerId || null,
                subscriptionId || null,
                status || 'pending',
                planName || 'default',
                expiresAt || null
            ];

            result = await query(insertSql, insertValues);
            console.log(`✅ [UPSERT] CRIADO: ${email} | Status: ${status || 'pending'}`);

            // ⚡ Invalida caches de subscription
            await cacheDel(KEY.sub(email));
            await cacheDel(KEY.adminStats());
            await cacheDel(KEY.activeSubs());
        }
        
        return result.rows[0];

    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao atualizar assinatura:', error);
        throw error;
    }
}

// --- Funções de busca mantidas iguais ---
export async function getSubscriptionByUserId(userId) {
    try {
        const sql = 'SELECT * FROM subscriptions WHERE user_id = $1';
        const result = await query(sql, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao buscar por userId:', error);
        throw error;
    }
}

export async function getSubscriptionByEmail(email) {
    try {
        return await cacheAside(
            KEY.sub(email),
            TTL.SUBSCRIPTION,
            async () => {
                const sql = 'SELECT * FROM subscriptions WHERE email = $1';
                const result = await query(sql, [email]);
                return result.rows[0] || null;
            }
        );
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao buscar por email:', error);
        throw error;
    }
}

export async function getSubscriptionByHublaId(hublaCustomerId) {
    try {
        const sql = 'SELECT * FROM subscriptions WHERE hubla_customer_id = $1';
        const result = await query(sql, [hublaCustomerId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao buscar por Hubla ID:', error);
        throw error;
    }
}

export async function hasActiveAccess(userId) {
    try {
        const subscription = await getSubscriptionByUserId(userId);
        
        if (!subscription) {
            return false;
        }
        
        const activeStatuses = ['active', 'trialing', 'paid'];
        if (!activeStatuses.includes(subscription.status)) {
            return false;
        }
        
        if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
            console.log(`⚠️ [ACCESS] Assinatura expirada em: ${subscription.expires_at}`);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ [ACCESS] Erro ao verificar acesso:', error);
        return false;
    }
}

export async function logWebhookEvent(eventType, payload, status = 'success', errorMessage = null) {
    try {
        const sql = `
            INSERT INTO webhook_logs (event_type, payload, status, error_message)
            VALUES ($1, $2, $3, $4) RETURNING *;
        `;
        await query(sql, [eventType, JSON.stringify(payload || {}), status, errorMessage]);
    } catch (error) {
        console.error('❌ [WEBHOOK_LOG] Erro ao registrar evento:', error);
    }
}

/**
 * Processa evento de webhook da Hubla
 */
export async function processHublaWebhook(eventType, payload) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔔 [HUBLA WEBHOOK] Evento recebido: ${eventType}`);
    console.log(`${'='.repeat(80)}`);
    
    try {
        let result;
        
        switch (eventType) {
            case 'customer.member_added':
            case 'member.access_granted':
                result = await handleAccessGranted(payload);
                break;
            case 'customer.member_removed':
            case 'member.access_removed':
                result = await handleAccessRemoved(payload);
                break;
            case 'invoice.payment_succeeded':
                result = await handlePaymentSucceeded(payload);
                break;
            case 'invoice.status_updated':
                result = await handleInvoiceStatusUpdated(payload);
                break;
            case 'subscription.created':
                result = await handleSubscriptionCreated(payload);
                break;
            case 'subscription.deactivated':
            case 'subscription.canceled':
                result = await handleSubscriptionCanceled(payload);
                break;
            case 'subscription.activated':
            case 'subscription.renewed':
                result = await handleSubscriptionRenewed(payload);
                break;
            default:
                console.log(`⚠️ [HUBLA WEBHOOK] Evento não tratado: ${eventType}`);
                await logWebhookEvent(eventType, payload, 'ignored', 'Evento não tratado');
                return { status: 'ignored', message: 'Evento não tratado' };
        }
        
        await logWebhookEvent(eventType, payload, 'success');
        return result;
    } catch (error) {
        console.error(`❌ [HUBLA WEBHOOK] Erro ao processar evento:`, error);
        await logWebhookEvent(eventType, payload, 'error', error.message);
        throw error;
    }
}

async function handleAccessGranted(payload) {
    const { email, hublaId } = extractCustomerData(payload);
    
    if (!email) throw new Error('Email não encontrado para liberar acesso');
    
    const subscription = payload.event?.subscription || payload.subscription || payload.data?.subscription;
    const userId = hublaId || email.split('@')[0];
    
    // ✅ Envia apenas os campos relevantes
    const result = await upsertSubscription({
        userId: userId.toString(),
        email: email,
        hublaCustomerId: hublaId,
        subscriptionId: subscription?.id,
        status: 'active',
        planName: subscription?.planName || 'Membro'
    });
    
    console.log(`✅ [HUBLA] Acesso LIBERADO para: ${email}`);
    return result;
}

async function handleAccessRemoved(payload) {
    const { email } = extractCustomerData(payload);
    
    if (!email) throw new Error('Email não encontrado para remover acesso');
    
    const existing = await getSubscriptionByEmail(email);
    if (existing) {
        // ✅ Atualiza APENAS o status (mantém outros dados intactos)
        const result = await upsertSubscription({
            userId: existing.user_id,
            email: email,
            status: 'canceled'
        });
        console.log(`🚫 [HUBLA] Acesso removido para: ${email}`);
        return result;
    }
}

/**
 * Handler - Pagamento bem-sucedido (COM CÁLCULO DE PRAZO)
 */
async function handlePaymentSucceeded(payload) {
    console.log('🔍 [HUBLA] Processando pagamento e calculando prazo...');
    
    const { email, hublaId } = extractCustomerData(payload);
    if (!email) throw new Error('Email não encontrado no pagamento');
    
    const invoice = payload.event?.invoice || payload.invoice || payload.data?.invoice;
    
    // LÓGICA DE PREÇO AQUI
    let expiresAt = invoice?.periodEnd; // Fallback (se houver na Hubla)
    
    // Tenta pegar o valor total (suporta v1 e v2 da API)
    const totalCents = invoice?.amount?.totalCents || invoice?.totalCents;
    
    if (totalCents) {
        const calculatedDate = calculateExpirationByAmount(totalCents);
        if (calculatedDate) {
            expiresAt = calculatedDate; // Usa nossa data calculada
        }
    } else {
        console.warn('⚠️ [PRAZO] Valor da compra não encontrado, usando padrão do sistema');
    }

    const existing = await getSubscriptionByEmail(email);
    const userId = existing ? existing.user_id : (hublaId || email.split('@')[0]);
    const planName = invoice?.productName || 'Premium';

    // ✅ Envia todos os campos relevantes do pagamento
    const result = await upsertSubscription({
        userId: userId.toString(),
        email: email,
        hublaCustomerId: hublaId,
        subscriptionId: invoice?.subscriptionId,
        status: 'active',
        planName: planName,
        expiresAt: expiresAt
    });
    
    const valorFormatado = totalCents ? `R$ ${(totalCents/100).toFixed(2)}` : 'Valor desconhecido';
    console.log(`💰 [HUBLA] Pagamento: ${valorFormatado} | Prazo até: ${expiresAt instanceof Date ? expiresAt.toLocaleDateString() : expiresAt} | User: ${email}`);
    
    return result;
}

async function handleInvoiceStatusUpdated(payload) {
    const { email } = extractCustomerData(payload);
    const invoice = payload.event?.invoice || payload.invoice || payload.data?.invoice;
    
    if (!email) return { status: 'ignored' };
    
    const existing = await getSubscriptionByEmail(email);
    if (existing && invoice?.status) {
        const statusMap = { 
            'paid': 'active', 
            'pending': 'pending', 
            'canceled': 'canceled', 
            'failed': 'failed' 
        };
        const newStatus = statusMap[invoice.status] || existing.status;
        
        if (newStatus !== existing.status) {
            // ✅ Atualiza APENAS o status
            await upsertSubscription({ 
                userId: existing.user_id, 
                email: email, 
                status: newStatus 
            });
            console.log(`📊 [HUBLA] Status atualizado para ${email}: ${newStatus}`);
        }
        return existing;
    }
}

async function handleSubscriptionCreated(payload) {
    const { email, hublaId } = extractCustomerData(payload);
    const subscription = payload.event?.subscription || payload.subscription || payload.data?.subscription;
    
    if (!email) throw new Error('Email não encontrado (handleSubscriptionCreated)');
    
    const userId = hublaId || email.split('@')[0];
    const hublaStatus = subscription?.status;
    let dbStatus = (hublaStatus === 'inactive') ? 'pending' : (hublaStatus || 'active');
    
    // ✅ Envia todos os campos da nova assinatura
    const result = await upsertSubscription({
        userId: userId.toString(),
        email: email,
        hublaCustomerId: hublaId,
        subscriptionId: subscription?.id,
        status: dbStatus,
        planName: subscription?.planName || 'default',
        expiresAt: subscription?.nextBillingDate || null
    });
    console.log(`🆕 [HUBLA] Assinatura criada: ${email} (${dbStatus})`);
    return result;
}

async function handleSubscriptionCanceled(payload) {
    const { email } = extractCustomerData(payload);
    if (!email) throw new Error('Email não encontrado');
    
    const existing = await getSubscriptionByEmail(email);
    if (existing) {
        // ✅ Atualiza APENAS o status
        await upsertSubscription({ 
            userId: existing.user_id, 
            email: email, 
            status: 'canceled' 
        });
        console.log(`🚫 [HUBLA] Assinatura cancelada: ${email}`);
    }
}

async function handleSubscriptionRenewed(payload) {
    const { email } = extractCustomerData(payload);
    const subscription = payload.event?.subscription || payload.subscription || payload.data?.subscription;
    
    if (!email) throw new Error('Email não encontrado');
    
    const existing = await getSubscriptionByEmail(email);
    if (existing) {
        // ✅ Atualiza status e data de expiração
        await upsertSubscription({
            userId: existing.user_id,
            email: email,
            status: 'active',
            expiresAt: subscription?.nextBillingDate || null
        });
        console.log(`🔄 [HUBLA] Assinatura renovada: ${email}`);
    }
}

export function verifyHublaWebhook(hublaToken, expectedToken) {
    if (!expectedToken) console.error('❌ [HUBLA] Token .env ausente');
    return hublaToken === expectedToken;
}

export async function getActiveSubscriptions() {
    return cacheAside(
        KEY.activeSubs(),
        TTL.ACTIVE_SUBS,
        async () => {
            const sql = `SELECT * FROM subscriptions WHERE status IN ('active', 'trialing', 'paid') AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC;`;
            const result = await query(sql);
            return result.rows;
        }
    );
}

export async function getSubscriptionStats() {
    return cacheAside(
        KEY.adminStats(),
        TTL.ADMIN_STATS,
        async () => {
            const sql = `
                SELECT COUNT(*) as total,
                COUNT(CASE WHEN status IN ('active', 'trialing', 'paid') AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END) as active,
                COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) as expired
                FROM subscriptions;
            `;
            const result = await query(sql);
            return result.rows[0];
        }
    );
}

export async function getWebhookLogs(limit = 100) {
    const sql = `SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT $1;`;
    const result = await query(sql, [limit]);
    return result.rows;
}

export default {
    upsertSubscription,
    getSubscriptionByUserId,
    getSubscriptionByEmail,
    getSubscriptionByHublaId,
    hasActiveAccess,
    processHublaWebhook,
    verifyHublaWebhook,
    getActiveSubscriptions,
    getSubscriptionStats,
    logWebhookEvent,
    getWebhookLogs
};