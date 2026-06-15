-- =============================================================
-- add_free_status.sql
-- Permite o status 'free' em subscriptions: usuário que entrou na
-- aplicação (login) e nunca assinou. Registrado para persistência e
-- identidade estável no gerenciamento.
-- Idempotente: pode rodar múltiplas vezes.
-- =============================================================

BEGIN;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE subscriptions ADD CONSTRAINT valid_status CHECK (
  status IN (
    'free', 'pending', 'active', 'paid', 'trialing', 'canceled', 'failed', 'expired'
  )
);

COMMIT;
