
// instrument.js - Inicialização do Sentry ANTES do servidor
// Este arquivo deve ser importado com --import antes do server.js

import * as Sentry from "@sentry/node";
import dotenv from 'dotenv';

// Carrega variáveis de ambiente
dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Integrações para captura automática
  integrations: [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
  ],
  
  // Taxa de amostragem de performance (1.0 = 100%)
  tracesSampleRate: 1.0,
  
  // Environment (development, production, staging)
  environment: process.env.NODE_ENV || 'development',
  
  // Filtrar dados sensíveis antes de enviar
  beforeSend(event) {
    // Remove cookies sensíveis
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    
    // Remove headers de autenticação
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    
    return event;
  },
  
  // Ignorar certos erros (opcional)
  ignoreErrors: [
    // Erros de rede que não são culpa do servidor
    'NetworkError',
    'Network request failed',
    // Erros de navegador que não importam
    'ResizeObserver loop limit exceeded',
  ],
});

console.log('✅ Sentry instrumentado com sucesso!');