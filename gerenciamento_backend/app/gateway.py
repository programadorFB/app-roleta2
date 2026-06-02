"""
Autenticação por gateway header.

O gerenciamento_backend não autentica diretamente: ele confia em um header
`X-User-Id` assinado por HMAC injetado pelo gateway Express (roleta3 backend),
que já validou JWT + subscription ativa.

Headers esperados em toda requisição protegida:
  X-User-Id       → subscriptions.user_id (string opaca do api.appbackend.tech)
  X-Gateway-Ts    → unix timestamp (segundos) da assinatura
  X-Gateway-Sig   → hex(HMAC_SHA256(secret, f"{user_id}:{ts}"))

A assinatura expira em GATEWAY_SIG_MAX_AGE_SECONDS (default 60s) para limitar
replay. Em dev, defina GATEWAY_AUTH_DEV_BYPASS=true para pular a verificação
e usar o header X-User-Id direto (apenas em desenvolvimento).
"""

import hmac
import hashlib
import os
import time
from functools import wraps

from flask import request, jsonify, g


GATEWAY_SIG_MAX_AGE_SECONDS = 60


def _verify_signature(user_id: str, ts: str, sig: str, secret: str) -> bool:
    if not (user_id and ts and sig and secret):
        return False
    try:
        ts_int = int(ts)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts_int) > GATEWAY_SIG_MAX_AGE_SECONDS:
        return False
    expected = hmac.new(
        secret.encode('utf-8'),
        f'{user_id}:{ts}'.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


def gateway_required(f):
    """Exige headers válidos do gateway. Popula g.user_id e injeta como 1º arg."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        user_id = request.headers.get('X-User-Id')
        secret = os.getenv('GATEWAY_SECRET', '')
        dev_bypass = os.getenv('GATEWAY_AUTH_DEV_BYPASS', '').lower() == 'true'

        if dev_bypass:
            if not user_id:
                return jsonify({'error': 'X-User-Id ausente (dev bypass ativo)'}), 401
        else:
            ts = request.headers.get('X-Gateway-Ts', '')
            sig = request.headers.get('X-Gateway-Sig', '')
            if not _verify_signature(user_id or '', ts, sig, secret):
                return jsonify({'error': 'Gateway signature inválida ou expirada'}), 401

        g.user_id = user_id
        return f(user_id, *args, **kwargs)

    return wrapper
