-- =============================================================
-- Adiciona rastreio de aviso de vencimento (2 dias antes)
-- Data: 2026-04-13
-- =============================================================

BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS expiration_reminder_sent_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at
  ON subscriptions (expires_at);

-- Índice auxiliar: permite buscar rapidamente quem precisa receber aviso
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiration_reminder
  ON subscriptions (expires_at, expiration_reminder_sent_at)
  WHERE status IN ('active', 'trialing', 'paid');

COMMIT;
