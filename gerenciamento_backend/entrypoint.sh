#!/usr/bin/env bash
# Entrypoint do gerenciamento_backend.
# 1) Aguarda postgres ficar disponível.
# 2) Aguarda a tabela `subscriptions` existir (criada pelo roleta3_backend).
# 3) Roda migrations (`flask db upgrade`).
# 4) Exec do CMD recebido (gunicorn).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL não definida}"

echo "[gerenciamento] aguardando postgres..."
until python - <<'PY'
import os, sys, psycopg2
try:
    conn = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=3)
    conn.close()
except Exception as e:
    print(f"db ainda não pronto: {e}", file=sys.stderr)
    sys.exit(1)
PY
do
    sleep 2
done
echo "[gerenciamento] postgres OK."

echo "[gerenciamento] aguardando tabela subscriptions..."
until python - <<'PY'
import os, sys, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=3)
try:
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name='subscriptions'"
    )
    if cur.fetchone() is None:
        sys.exit(1)
finally:
    conn.close()
PY
do
    sleep 2
done
echo "[gerenciamento] tabela subscriptions encontrada."

echo "[gerenciamento] aplicando migrations..."
export FLASK_APP=wsgi.py
flask db upgrade

echo "[gerenciamento] iniciando aplicação: $*"
exec "$@"
