// src/middleware/authProxy.js
import { createProxyMiddleware } from 'http-proxy-middleware';

const DEFAULT_AUTH_PROXY_TARGET = process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech';

/**
 * Middleware de proxy para autenticação
 * Redireciona requisições /login para o backend de autenticação
 * 
 * @param {string} target - URL do backend de autenticação
 * @returns {Function} Middleware do Express
 */
export function authProxyMiddleware(target = DEFAULT_AUTH_PROXY_TARGET) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: 60000,
    pathRewrite: { '^/login': '/login' },

    onProxyReq: (proxyReq, req, _res) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🔄 Proxy Request: ${req.method} ${req.url}`);
      console.log(`[${timestamp}] 🎯 Target: ${target}${req.url}`);

      // Simula um navegador para reduzir chance de bloqueio
      proxyReq.setHeader(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      proxyReq.setHeader('Accept', 'application/json');
      proxyReq.setHeader('Accept-Language', 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7');
      console.log(`[${timestamp}] Headers:`, req.headers);
      if (req.headers.authorization) {
        console.log(`[${timestamp}] 🔑 Auth: ${req.headers.authorization.substring(0, 30)}...`);
      }

      // Não manipulamos o body aqui - o proxy faz isso nativamente
    },

    onProxyRes: (proxyRes, req, res) => {
      const timestamp = new Date().toISOString();
      const duration = Date.now() - (req._startTime || Date.now());

      let body = [];
      proxyRes.on('data', chunk => body.push(chunk));

      proxyRes.on('end', () => {
        const responseBody = Buffer.concat(body).toString('utf8');

        // Log de erros
        if (proxyRes.statusCode >= 500) {
          console.error(`\n${'='.repeat(80)}`);
          console.error(`[${timestamp}] ❌ ERRO 500 DO BACKEND (LOGIN)`);
          console.error(`🔥 STATUS: ${proxyRes.statusCode}`);
          console.error(`🔥 DURATION: ${duration}ms`);
          console.error(`🔥 RESPONSE BODY:`, responseBody.substring(0, 500));
          console.error(`${'='.repeat(80)}\n`);
        } else if (proxyRes.statusCode >= 400) {
          console.warn(`[${timestamp}] ⚠️ ERRO 4XX (LOGIN): ${proxyRes.statusCode}`);
          console.warn(`[${timestamp}] Duration: ${duration}ms`);
          console.warn(`[${timestamp}] Response: ${responseBody.substring(0, 300)}`);
        } else {
          console.log(`[${timestamp}] ✅ SUCESSO (LOGIN): ${proxyRes.statusCode}`);
          console.log(`[${timestamp}] Duration: ${duration}ms`);
          console.log(`[${timestamp}] Response: ${responseBody.substring(0, 100)}...`);
        }

        // CORREÇÃO ESSENCIAL: Reenviar a resposta para o cliente
        // Como consumimos o stream 'proxyRes', temos que enviar a resposta 'res'
        
        // 1. Copia headers do backend para o cliente
        Object.keys(proxyRes.headers).forEach((key) => {
          try {
            res.setHeader(key, proxyRes.headers[key]);
          } catch (e) {
            console.warn(`Não foi possível setar header ${key}:`, e.message);
          }
        });

        // 2. Define o status
        res.status(proxyRes.statusCode);

        // 3. Envia o corpo da resposta e encerra
        res.end(responseBody);
      });
    },

    onError: (err, req, res) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ❌ PROXY ERROR (LOGIN):`, err.message);
      console.error(`[${timestamp}] Error Code:`, err.code);
      console.error(`[${timestamp}] Target:`, target);

      const errorMap = {
        'ECONNREFUSED': { status: 503, message: 'Backend de login indisponível' },
        'ETIMEDOUT': { status: 504, message: 'Timeout (60s) no login' },
        'ESOCKETTIMEDOUT': { status: 504, message: 'Socket timeout no login' },
        'ENOTFOUND': { status: 502, message: 'Backend de login não encontrado' },
        'ECONNRESET': { status: 502, message: 'Conexão resetada pelo backend de login' },
        'EHOSTUNREACH': { status: 503, message: 'Host do backend de login inacessível' },
        'ENETUNREACH': { status: 503, message: 'Rede do backend de login inacessível' },
      };

      const error = errorMap[err.code] || { 
        status: 500, 
        message: 'Erro interno no proxy de autenticação' 
      };

      try {
        if (!res.headersSent) {
          res.status(error.status).json({
            error: true,
            message: error.message,
            code: err.code,
            details: err.message,
            timestamp,
            url: req.url,
            target
          });
        } else {
          res.end();
        }
      } catch (e) {
        console.error('[authProxy] Erro ao enviar resposta de erro:', e);
      }
    },

    logLevel: 'warn'
  });
}

/**
 * Middleware de proxy para requisições de início de jogo
 * Redireciona requisições /start-game/* para o backend
 * 
 * @param {string} target - URL do backend
 * @returns {Function} Middleware do Express
 */
export function gameProxyMiddleware(target = DEFAULT_AUTH_PROXY_TARGET) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: 60000,
    
    pathRewrite: (path) => {
      const newPath = `/start-game${path}`;
      console.log(`[gameProxy] Path reescrito de "${path}" para "${newPath}"`);
      return newPath;
    },

    onProxyReq: (proxyReq, req, _res) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🎮 Game Proxy Request: ${req.method} ${req.url}`);
      console.log(`[${timestamp}] 🎯 Target: ${target}${proxyReq.path}`);

      // Simula navegador
      proxyReq.setHeader(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      proxyReq.setHeader('Accept', 'application/json');

      // Repassa autorização
      if (req.headers.authorization) {
        console.log(`[${timestamp}] 🔑 Auth: ${req.headers.authorization.substring(0, 30)}...`);
        proxyReq.setHeader('Authorization', req.headers.authorization);
      } else {
        console.warn(`[${timestamp}] ⚠️ Chamada sem Authorization header`);
      }
    },

    onProxyRes: (proxyRes, req, res) => {
      const timestamp = new Date().toISOString();
      let body = [];
      
      proxyRes.on('data', chunk => body.push(chunk));
      
      proxyRes.on('end', () => {
        const responseBody = Buffer.concat(body).toString('utf8');
        
        if (proxyRes.statusCode >= 400) {
          console.error(`[${timestamp}] ❌ Game Error: ${proxyRes.statusCode}`);
          console.error(`[${timestamp}] Body:`, responseBody.substring(0, 500));
        } else {
          console.log(`[${timestamp}] ✅ Game Success: ${proxyRes.statusCode}`);
          console.log(`[${timestamp}] Body:`, responseBody.substring(0, 100));
        }
        
        // Reenvia a resposta
        Object.keys(proxyRes.headers).forEach((key) => {
          try {
            res.setHeader(key, proxyRes.headers[key]);
          } catch (e) {
            console.warn(`Não foi possível setar header ${key}:`, e.message);
          }
        });
        
        res.status(proxyRes.statusCode);
        res.end(responseBody);
      });
    },

    onError: (err, req, res) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ❌ Game Proxy Error:`, err.message);

      if (!res.headersSent) {
        res.status(500).json({
          error: true,
          message: 'Erro ao iniciar jogo',
          code: err.code,
          details: err.message,
          timestamp
        });
      }
    },

    logLevel: 'warn'
  });
}

export default authProxyMiddleware;