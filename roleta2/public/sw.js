/*
 * Service Worker mínimo do Smart Análise.
 *
 * Existe APENAS para satisfazer o critério de "instalável" do Chrome/Edge
 * (manifest + service worker com handler de `fetch`), o que habilita o evento
 * `beforeinstallprompt` e, consequentemente, o botão "Criar Atalho" no header.
 *
 * NÃO faz cache offline de propósito: a ferramenta depende de dados ao vivo
 * (Socket.IO / API), então servir conteúdo cacheado causaria estado obsoleto.
 * O handler de fetch é pass-through (não chama respondWith) -> o navegador
 * trata cada requisição normalmente.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Handler obrigatório p/ instalabilidade. Pass-through: sem cache.
self.addEventListener('fetch', () => { /* deixa o navegador resolver */ });
