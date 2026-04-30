-- =============================================================
-- Init script para desenvolvimento local (docker-compose.local.yml)
-- Roda automaticamente no primeiro start do container postgres.
-- Combina deploy_roleta2.sql + migrations incrementais.
-- =============================================================

BEGIN;

-- 1) signals
CREATE TABLE IF NOT EXISTS signals (
  signalid  VARCHAR     NOT NULL,
  gameid    VARCHAR,
  signal    VARCHAR,
  source    VARCHAR(64) NOT NULL,
  timestamp TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (signalid, source)
);

CREATE INDEX IF NOT EXISTS idx_signals_source    ON signals (source);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals (timestamp DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'id'
  ) THEN
    ALTER TABLE signals ADD COLUMN id SERIAL;
    CREATE INDEX IF NOT EXISTS idx_signals_id ON signals (id DESC);
  END IF;
END $$;

-- 2) subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                     VARCHAR     NOT NULL PRIMARY KEY,
  email                       VARCHAR     NOT NULL,
  hubla_customer_id           VARCHAR,
  subscription_id             VARCHAR,
  status                      VARCHAR     NOT NULL DEFAULT 'pending',
  plan_name                   VARCHAR              DEFAULT 'default',
  expires_at                  TIMESTAMP,
  expiration_reminder_sent_at TIMESTAMP,
  created_at                  TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_email       ON subscriptions (email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status      ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_hubla_id    ON subscriptions (hubla_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at  ON subscriptions (expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiration_reminder
  ON subscriptions (expires_at, expiration_reminder_sent_at)
  WHERE status IN ('active', 'trialing', 'paid');

-- 3) subscription_audit
CREATE TABLE IF NOT EXISTS subscription_audit (
  id           SERIAL PRIMARY KEY,
  user_id      VARCHAR NOT NULL,
  email        VARCHAR NOT NULL,
  from_status  VARCHAR,
  to_status    VARCHAR NOT NULL,
  triggered_by VARCHAR NOT NULL DEFAULT 'webhook',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_audit_email      ON subscription_audit (email);
CREATE INDEX IF NOT EXISTS idx_sub_audit_created_at ON subscription_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_audit_user_id    ON subscription_audit (user_id);

-- 4) webhook_logs
CREATE TABLE IF NOT EXISTS webhook_logs (
  id            SERIAL PRIMARY KEY,
  event_type    VARCHAR   NOT NULL,
  payload       JSONB,
  status        VARCHAR   NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created    ON webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs (event_type);

-- 5) motor_scores
CREATE TABLE IF NOT EXISTS motor_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  neighbor_mode SMALLINT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (source, neighbor_mode)
);

CREATE INDEX IF NOT EXISTS idx_motor_scores_source ON motor_scores (source);

-- 6) motor_pending_signals
CREATE TABLE IF NOT EXISTS motor_pending_signals (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  suggested_numbers INT[] NOT NULL,
  spins_after SMALLINT NOT NULL DEFAULT 0,
  resolved_modes JSONB NOT NULL DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  spin_results INT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_motor_pending_source ON motor_pending_signals (source);
CREATE INDEX IF NOT EXISTS idx_motor_pending_resolved ON motor_pending_signals (source, resolved);
-- Partial unique index: impede 2 sinais pendentes (resolved=FALSE) para mesma source.
-- Usado pelo ON CONFLICT (source) WHERE resolved = FALSE em motorScoreEngine.js
CREATE UNIQUE INDEX IF NOT EXISTS idx_motor_pending_source_unresolved
  ON motor_pending_signals (source) WHERE resolved = FALSE;

-- 7) trigger_scores
CREATE TABLE IF NOT EXISTS trigger_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL UNIQUE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_scores_source ON trigger_scores (source);

-- 8) trigger_pending_signals
CREATE TABLE IF NOT EXISTS trigger_pending_signals (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  trigger_number SMALLINT NOT NULL,
  covered_numbers INT[] NOT NULL,
  spins_after SMALLINT NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  result VARCHAR(4) DEFAULT NULL,
  pattern_label VARCHAR(64) DEFAULT NULL,
  confidence REAL DEFAULT NULL,
  lift REAL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_pending_source ON trigger_pending_signals (source);
-- Partial unique index: 1 sinal pendente por (source, trigger_number) por vez.
-- Usado pelo ON CONFLICT (source, trigger_number) WHERE resolved = FALSE em triggerScoreEngine.js
CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_pending_source_trigger_unresolved
  ON trigger_pending_signals (source, trigger_number) WHERE resolved = FALSE;

COMMIT;
