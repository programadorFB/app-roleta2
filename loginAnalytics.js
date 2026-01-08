// loginAnalytics.js - Sistema de análise de padrões de login

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANALYTICS_FILE = path.join(__dirname, 'login_analytics.json');

// Inicializa arquivo se não existir
if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify({ sessions: [] }, null, 2));
}

/**
 * Extrai informações detalhadas do User-Agent
 */
function parseUserAgent(ua) {
    if (!ua) return { browser: 'unknown', os: 'unknown', device: 'unknown' };
    
    // Browser detection
    let browser = 'unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
    
    // OS detection
    let os = 'unknown';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    
    // Device type
    let device = 'desktop';
    if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) device = 'mobile';
    else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'tablet';
    
    return { browser, os, device };
}

/**
 * Extrai geolocalização aproximada do IP (usando headers do proxy)
 */
function extractGeoInfo(req) {
    return {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown',
        country: req.headers['cf-ipcountry'] || req.headers['x-country'] || 'unknown',
        region: req.headers['cf-region'] || req.headers['x-region'] || 'unknown',
    };
}

/**
 * Registra tentativa de login com metadados completos
 */
export function logLoginAttempt(req, result) {
    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
        
        const ua = parseUserAgent(req.headers['user-agent']);
        const geo = extractGeoInfo(req);
        
        const session = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            
            // Request info
            email: req.body.email || 'N/A',
            brand: req.body.brand || 'N/A',
            
            // Client info
            browser: ua.browser,
            os: ua.os,
            device: ua.device,
            userAgent: req.headers['user-agent'] || 'unknown',
            
            // Network info
            ip: geo.ip,
            country: geo.country,
            region: geo.region,
            
            // Result
            success: result.success,
            statusCode: result.statusCode,
            responseTime: result.responseTime,
            errorType: result.errorType || null,
            errorMessage: result.errorMessage || null,
            
            // Timing
            hour: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            
            // Additional headers que podem ser úteis
            acceptLanguage: req.headers['accept-language'] || 'unknown',
            referer: req.headers['referer'] || 'direct'
        };
        
        data.sessions.push(session);
        
        // Mantém apenas últimas 1000 sessões para não explodir o arquivo
        if (data.sessions.length > 1000) {
            data.sessions = data.sessions.slice(-1000);
        }
        
        fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
        
    } catch (err) {
        console.error('❌ Erro ao salvar analytics:', err.message);
    }
}

/**
 * Analisa padrões e retorna insights
 */
export function analyzePatterns() {
    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
        const sessions = data.sessions;
        
        if (sessions.length === 0) {
            return { error: 'Nenhuma sessão registrada ainda' };
        }
        
        const successful = sessions.filter(s => s.success);
        const failed = sessions.filter(s => !s.success);
        
        // Taxa de sucesso geral
        const successRate = ((successful.length / sessions.length) * 100).toFixed(2);
        
        // Análise por browser
        const byBrowser = groupAndAnalyze(sessions, 'browser');
        
        // Análise por OS
        const byOS = groupAndAnalyze(sessions, 'os');
        
        // Análise por device
        const byDevice = groupAndAnalyze(sessions, 'device');
        
        // Análise por país
        const byCountry = groupAndAnalyze(sessions, 'country');
        
        // Análise por horário
        const byHour = groupAndAnalyze(sessions, 'hour');
        
        // Análise por brand
        const byBrand = groupAndAnalyze(sessions, 'brand');
        
        // Tipos de erro mais comuns
        const errorTypes = failed.reduce((acc, s) => {
            const type = s.errorType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        
        // Tempo médio de resposta
        const avgResponseTime = {
            successful: avg(successful.map(s => s.responseTime).filter(Boolean)),
            failed: avg(failed.map(s => s.responseTime).filter(Boolean))
        };
        
        // Últimas 10 falhas
        const recentFailures = failed.slice(-10).map(s => ({
            timestamp: s.timestamp,
            email: s.email,
            browser: s.browser,
            os: s.os,
            country: s.country,
            errorType: s.errorType,
            errorMessage: s.errorMessage
        }));
        
        return {
            summary: {
                totalSessions: sessions.length,
                successful: successful.length,
                failed: failed.length,
                successRate: `${successRate}%`
            },
            byBrowser,
            byOS,
            byDevice,
            byCountry,
            byHour,
            byBrand,
            errorTypes,
            avgResponseTime,
            recentFailures,
            
            // 🎯 INSIGHTS AUTOMÁTICOS
            insights: generateInsights({
                byBrowser,
                byOS,
                byDevice,
                byCountry,
                errorTypes,
                avgResponseTime
            })
        };
        
    } catch (err) {
        console.error('❌ Erro ao analisar padrões:', err.message);
        return { error: err.message };
    }
}

/**
 * Agrupa sessões por campo e calcula taxa de sucesso
 */
function groupAndAnalyze(sessions, field) {
    const groups = sessions.reduce((acc, s) => {
        const key = s[field] || 'unknown';
        if (!acc[key]) {
            acc[key] = { total: 0, successful: 0, failed: 0 };
        }
        acc[key].total++;
        if (s.success) acc[key].successful++;
        else acc[key].failed++;
        return acc;
    }, {});
    
    // Calcula taxa de sucesso para cada grupo
    Object.keys(groups).forEach(key => {
        groups[key].successRate = ((groups[key].successful / groups[key].total) * 100).toFixed(2) + '%';
    });
    
    return groups;
}

/**
 * Calcula média de um array
 */
function avg(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/**
 * Gera insights automáticos baseado nos dados
 */
function generateInsights(data) {
    const insights = [];
    
    // Insight 1: Browser problemático
    const browsers = data.byBrowser;
    for (const [browser, stats] of Object.entries(browsers)) {
        const rate = parseFloat(stats.successRate);
        if (stats.total >= 5 && rate < 50) {
            insights.push({
                type: 'browser_issue',
                severity: 'high',
                message: `⚠️ ${browser} tem taxa de sucesso muito baixa (${stats.successRate}). Pode haver problema de compatibilidade.`
            });
        }
    }
    
    // Insight 2: OS problemático
    const systems = data.byOS;
    for (const [os, stats] of Object.entries(systems)) {
        const rate = parseFloat(stats.successRate);
        if (stats.total >= 5 && rate < 50) {
            insights.push({
                type: 'os_issue',
                severity: 'high',
                message: `⚠️ ${os} tem taxa de sucesso muito baixa (${stats.successRate}). Pode haver problema de rede/firewall.`
            });
        }
    }
    
    // Insight 3: Dispositivo mobile vs desktop
    if (data.byDevice.mobile && data.byDevice.desktop) {
        const mobileRate = parseFloat(data.byDevice.mobile.successRate);
        const desktopRate = parseFloat(data.byDevice.desktop.successRate);
        const diff = Math.abs(mobileRate - desktopRate);
        
        if (diff > 30) {
            const problematic = mobileRate < desktopRate ? 'Mobile' : 'Desktop';
            insights.push({
                type: 'device_disparity',
                severity: 'medium',
                message: `📱 ${problematic} tem taxa de sucesso ${diff.toFixed(0)}% menor. Verifique responsividade/API.`
            });
        }
    }
    
    // Insight 4: Erro dominante
    const errors = data.errorTypes;
    const totalErrors = Object.values(errors).reduce((a, b) => a + b, 0);
    for (const [errorType, count] of Object.entries(errors)) {
        const percentage = (count / totalErrors) * 100;
        if (percentage > 50) {
            insights.push({
                type: 'dominant_error',
                severity: 'high',
                message: `🔥 ${percentage.toFixed(0)}% dos erros são do tipo "${errorType}". Este é o problema principal.`
            });
        }
    }
    
    // Insight 5: Performance
    const { successful, failed } = data.avgResponseTime;
    if (successful > 5000) {
        insights.push({
            type: 'slow_api',
            severity: 'medium',
            message: `🐌 API respondendo lento (${successful}ms em média). Pode causar timeouts.`
        });
    }
    
    if (insights.length === 0) {
        insights.push({
            type: 'all_good',
            severity: 'info',
            message: '✅ Nenhum padrão problemático identificado. Erros parecem aleatórios.'
        });
    }
    
    return insights;
}

/**
 * Gera relatório em texto formatado para o console
 */
export function printAnalyticsReport() {
    const analysis = analyzePatterns();
    
    if (analysis.error) {
        console.log('\n❌ Erro na análise:', analysis.error);
        return;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 RELATÓRIO DE ANÁLISE DE LOGIN');
    console.log('='.repeat(80));
    
    console.log('\n📈 RESUMO GERAL');
    console.log(`   Total de Sessões: ${analysis.summary.totalSessions}`);
    console.log(`   ✅ Sucessos: ${analysis.summary.successful}`);
    console.log(`   ❌ Falhas: ${analysis.summary.failed}`);
    console.log(`   📊 Taxa de Sucesso: ${analysis.summary.successRate}`);
    
    console.log('\n🌐 POR NAVEGADOR');
    printTable(analysis.byBrowser);
    
    console.log('\n💻 POR SISTEMA OPERACIONAL');
    printTable(analysis.byOS);
    
    console.log('\n📱 POR DISPOSITIVO');
    printTable(analysis.byDevice);
    
    console.log('\n🌍 POR PAÍS');
    printTable(analysis.byCountry);
    
    console.log('\n🏷️ POR MARCA');
    printTable(analysis.byBrand);
    
    console.log('\n❌ TIPOS DE ERRO');
    Object.entries(analysis.errorTypes).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}x`);
    });
    
    console.log('\n⏱️ TEMPO MÉDIO DE RESPOSTA');
    console.log(`   Sucessos: ${analysis.avgResponseTime.successful}ms`);
    console.log(`   Falhas: ${analysis.avgResponseTime.failed}ms`);
    
    console.log('\n🎯 INSIGHTS AUTOMÁTICOS');
    analysis.insights.forEach(insight => {
        const emoji = insight.severity === 'high' ? '🔴' : insight.severity === 'medium' ? '🟡' : '🟢';
        console.log(`   ${emoji} ${insight.message}`);
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
}

function printTable(data) {
    Object.entries(data).forEach(([key, stats]) => {
        console.log(`   ${key.padEnd(15)} | Total: ${String(stats.total).padStart(3)} | ✅ ${String(stats.successful).padStart(3)} | ❌ ${String(stats.failed).padStart(3)} | Taxa: ${stats.successRate}`);
    });
}

export default {
    logLoginAttempt,
    analyzePatterns,
    printAnalyticsReport
};