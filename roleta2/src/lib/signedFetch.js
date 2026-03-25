// lib/signedFetch.js — Drop-in replacement para fetch() com HMAC-SHA256 signing
// Toda request API recebe headers X-Sig e X-Ts que o backend valida.

/* eslint-disable no-undef */
const _p1 = 'sM4r';
const _p2 = 'tAn4';
const _p3 = 'l1s3';
const _p4 = 'X9kQ';
const _FALLBACK = [_p1, _p2, _p3, _p4].join('');

// __SIGNING_KEY__ é injetado pelo Vite define em build time
const _KEY = (typeof __SIGNING_KEY__ !== 'undefined') ? __SIGNING_KEY__ : _FALLBACK;

let _cachedCryptoKey = null;

async function getCryptoKey() {
  if (_cachedCryptoKey) return _cachedCryptoKey;
  const enc = new TextEncoder();
  _cachedCryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return _cachedCryptoKey;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * fetch() assinado — adiciona X-Sig e X-Ts a requests /api/
 * Assinatura: HMAC-SHA256(key, timestamp + ":" + pathname)
 */
export async function signedFetch(url, options = {}) {
  // Resolve URL para extrair pathname
  let pathname;
  try {
    const urlObj = new URL(url, window.location.origin);
    pathname = urlObj.pathname;
  } catch {
    pathname = url;
  }

  // Só assina rotas de API
  const shouldSign = pathname.startsWith('/api/') || pathname.startsWith('/login') || pathname.startsWith('/start-game');

  if (shouldSign && crypto?.subtle) {
    try {
      const ts = Math.floor(Date.now() / 1000);
      const msg = `${ts}:${pathname}`;
      const key = await getCryptoKey();
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));

      const headers = new Headers(options.headers || {});
      headers.set('X-Sig', toHex(sig));
      headers.set('X-Ts', String(ts));

      return fetch(url, { ...options, headers });
    } catch {
      // Fallback: envia sem assinatura (nao bloqueia o user)
    }
  }

  return fetch(url, options);
}

export default signedFetch;
