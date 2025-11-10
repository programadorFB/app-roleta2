// subscriptionService.js
// Gerenciamento de assinaturas e controle de acesso via Hubla com PostgreSQL

import { query, transaction } from './db.js';

/**
 * Cria ou atualiza uma assinatura
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
        
        const sql = `
            INSERT INTO subscriptions (
                user_id, email, hubla_customer_id, subscription_id, 
                status, plan_name, expires_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET
                email = COALESCE($2, subscriptions.email),
                hubla_customer_id = COALESCE($3, subscriptions.hubla_customer_id),
                subscription_id = COALESCE($4, subscriptions.subscription_id),
                status = COALESCE($5, subscriptions.status),
                plan_name = COALESCE($6, subscriptions.plan_name),
                expires_at = COALESCE($7, subscriptions.expires_at),
                updated_at = NOW()
            RETURNING *;
        `;
        
        const values = [
            userId,
            email || null,
            hublaCustomerId || null,
            subscriptionId || null,
            status || 'pending',
            planName || 'default',
            expiresAt || null
        ];
        
        const result = await query(sql, values);
        const subscription = result.rows[0];
        
        console.log(`✅ [SUBSCRIPTIONS] Assinatura atualizada - userId: ${userId}, status: ${status}`);
        return subscription;
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao atualizar assinatura:', error);
        throw error;
    }
}

/**
 * Busca assinatura por userId
 */
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

/**
 * Busca assinatura por email
 */
export async function getSubscriptionByEmail(email) {
    try {
        const sql = 'SELECT * FROM subscriptions WHERE email = $1';
        const result = await query(sql, [email]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao buscar por email:', error);
        throw error;
    }
}

/**
 * Busca assinatura por hublaCustomerId
 */
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

/**
 * Verifica se o usuário tem acesso ativo
 */
export async function hasActiveAccess(userId) {
    try {
        const subscription = await getSubscriptionByUserId(userId);
        
        if (!subscription) {
            console.log(`⚠️ [ACCESS] Usuário ${userId} sem assinatura`);
            return false;
        }
        
        // Verifica se o status está ativo
        const activeStatuses = ['active', 'trialing', 'paid'];
        if (!activeStatuses.includes(subscription.status)) {
            console.log(`⚠️ [ACCESS] Usuário ${userId} com status inativo: ${subscription.status}`);
            return false;
        }
        
        // Verifica se não expirou
        if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
            console.log(`⚠️ [ACCESS] Usuário ${userId} com assinatura expirada`);
            return false;
        }
        
        console.log(`✅ [ACCESS] Usuário ${userId} com acesso ativo`);
        return true;
    } catch (error) {
        console.error('❌ [ACCESS] Erro ao verificar acesso:', error);
        return false;
    }
}

/**
 * Registra evento de webhook no banco
 */
export async function logWebhookEvent(eventType, payload, status = 'success', errorMessage = null) {
    try {
        const sql = `
            INSERT INTO webhook_logs (
                event_type, payload, status, error_message
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        
        const result = await query(sql, [
            eventType,
            JSON.stringify(payload),
            status,
            errorMessage
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('❌ [WEBHOOK_LOG] Erro ao registrar evento:', error);
        // Não lança erro para não interromper o processamento do webhook
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
            case 'member.access_granted':
                result = await handleAccessGranted(payload);
                break;
            
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
            
            case 'subscription.canceled':
                result = await handleSubscriptionCanceled(payload);
                break;
            
            case 'subscription.renewed':
                result = await handleSubscriptionRenewed(payload);
                break;
            
            default:
                console.log(`⚠️ [HUBLA WEBHOOK] Evento não tratado: ${eventType}`);
                await logWebhookEvent(eventType, payload, 'ignored', 'Evento não tratado');
                return { status: 'ignored', message: 'Evento não tratado' };
        }
        
        await logWebhookEvent(eventType, payload, 'success');
        console.log(`✅ [HUBLA WEBHOOK] Evento processado com sucesso`);
        console.log(`${'='.repeat(80)}\n`);
        
        return result;
        
    } catch (error) {
        console.error(`❌ [HUBLA WEBHOOK] Erro ao processar evento:`, error);
        await logWebhookEvent(eventType, payload, 'error', error.message);
        throw error;
    }
}

/**
 * Handler: Acesso concedido
 */
async function handleAccessGranted(payload) {
    const member = payload.event?.member || payload.member;
    const subscription = payload.event?.subscription || payload.subscription;
    
    if (!member?.email) {
        throw new Error('Email do membro não encontrado no payload');
    }
    
    const userId = member.id || member.email.split('@')[0];
    
    const result = await upsertSubscription({
        userId,
        email: member.email,
        hublaCustomerId: member.id,
        subscriptionId: subscription?.id || null,
        status: 'active',
        planName: subscription?.planName || 'default',
        expiresAt: subscription?.nextBillingDate || null
    });
    
    console.log(`✅ [HUBLA] Acesso concedido para: ${member.email}`);
    return result;
}

/**
 * Handler: Acesso removido
 */
async function handleAccessRemoved(payload) {
    const member = payload.event?.member || payload.member;
    
    if (!member?.email) {
        throw new Error('Email do membro não encontrado no payload');
    }
    
    const existing = await getSubscriptionByEmail(member.email);
    if (existing) {
        const result = await upsertSubscription({
            userId: existing.user_id,
            status: 'canceled'
        });
        
        console.log(`❌ [HUBLA] Acesso removido para: ${member.email}`);
        return result;
    }
}

/**
 * Handler: Pagamento realizado com sucesso
 */
async function handlePaymentSucceeded(payload) {
    const invoice = payload.event?.invoice || payload.invoice;
    const customer = invoice?.customer;
    
    if (!customer?.email) {
        throw new Error('Email do cliente não encontrado no payload');
    }
    
    const existing = await getSubscriptionByEmail(customer.email);
    if (existing) {
        const result = await upsertSubscription({
            userId: existing.user_id,
            status: 'paid'
        });
        
        console.log(`💰 [HUBLA] Pagamento confirmado para: ${customer.email}`);
        return result;
    }
}

/**
 * Handler: Status da fatura atualizado
 */
async function handleInvoiceStatusUpdated(payload) {
    const invoice = payload.event?.invoice || payload.invoice;
    const customer = invoice?.customer;
    
    if (!customer?.email) {
        return { status: 'ignored', message: 'Email não encontrado' };
    }
    
    const existing = await getSubscriptionByEmail(customer.email);
    if (existing && invoice.status) {
        // Mapeia status da invoice para status da assinatura
        const statusMap = {
            'paid': 'active',
            'pending': 'pending',
            'canceled': 'canceled',
            'failed': 'failed'
        };
        
        const newStatus = statusMap[invoice.status] || existing.status;
        
        const result = await upsertSubscription({
            userId: existing.user_id,
            status: newStatus
        });
        
        console.log(`📊 [HUBLA] Status atualizado para ${customer.email}: ${newStatus}`);
        return result;
    }
}

/**
 * Handler: Assinatura criada
 */
async function handleSubscriptionCreated(payload) {
    const subscription = payload.event?.subscription || payload.subscription;
    const customer = subscription?.customer;
    
    if (!customer?.email) {
        throw new Error('Email do cliente não encontrado no payload');
    }
    
    const userId = customer.id || customer.email.split('@')[0];
    
    const result = await upsertSubscription({
        userId,
        email: customer.email,
        hublaCustomerId: customer.id,
        subscriptionId: subscription.id,
        status: subscription.status || 'active',
        planName: subscription.planName || 'default',
        expiresAt: subscription.nextBillingDate || null
    });
    
    console.log(`🆕 [HUBLA] Nova assinatura criada para: ${customer.email}`);
    return result;
}

/**
 * Handler: Assinatura cancelada
 */
async function handleSubscriptionCanceled(payload) {
    const subscription = payload.event?.subscription || payload.subscription;
    const customer = subscription?.customer;
    
    if (!customer?.email) {
        throw new Error('Email do cliente não encontrado no payload');
    }
    
    const existing = await getSubscriptionByEmail(customer.email);
    if (existing) {
        const result = await upsertSubscription({
            userId: existing.user_id,
            status: 'canceled'
        });
        
        console.log(`🚫 [HUBLA] Assinatura cancelada para: ${customer.email}`);
        return result;
    }
}

/**
 * Handler: Assinatura renovada
 */
async function handleSubscriptionRenewed(payload) {
    const subscription = payload.event?.subscription || payload.subscription;
    const customer = subscription?.customer;
    
    if (!customer?.email) {
        throw new Error('Email do cliente não encontrado no payload');
    }
    
    const existing = await getSubscriptionByEmail(customer.email);
    if (existing) {
        const result = await upsertSubscription({
            userId: existing.user_id,
            status: 'active',
            expiresAt: subscription.nextBillingDate || null
        });
        
        console.log(`🔄 [HUBLA] Assinatura renovada para: ${customer.email}`);
        return result;
    }
}

/**
 * Verifica a assinatura do token de webhook da Hubla
 */
export function verifyHublaWebhook(hublaToken, expectedToken) {
    if (!expectedToken) {
        console.warn('⚠️ [HUBLA] Token de verificação não configurado no servidor');
        return true; // Aceita temporariamente se não houver token configurado
    }
    
    const isValid = hublaToken === expectedToken;
    
    if (!isValid) {
        console.error('❌ [HUBLA] Token de webhook inválido');
    }
    
    return isValid;
}

/**
 * Lista todas as assinaturas ativas
 */
export async function getActiveSubscriptions() {
    try {
        const sql = `
            SELECT * FROM subscriptions 
            WHERE status IN ('active', 'trialing', 'paid')
            AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC;
        `;
        
        const result = await query(sql);
        return result.rows;
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao buscar assinaturas ativas:', error);
        throw error;
    }
}

/**
 * Estatísticas de assinaturas
 */
export async function getSubscriptionStats() {
    try {
        const sql = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status IN ('active', 'trialing', 'paid') 
                           AND (expires_at IS NULL OR expires_at > NOW()) 
                           THEN 1 END) as active,
                COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) as expired
            FROM subscriptions;
        `;
        
        const result = await query(sql);
        return result.rows[0];
    } catch (error) {
        console.error('❌ [SUBSCRIPTIONS] Erro ao buscar estatísticas:', error);
        throw error;
    }
}

/**
 * Lista logs de webhook
 */
export async function getWebhookLogs(limit = 100) {
    try {
        const sql = `
            SELECT * FROM webhook_logs 
            ORDER BY created_at DESC 
            LIMIT $1;
        `;
        
        const result = await query(sql, [limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ [WEBHOOK_LOG] Erro ao buscar logs:', error);
        throw error;
    }
}

// Exporta funções principais
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
