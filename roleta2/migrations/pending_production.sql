-- =============================================================
-- Tabelas faltando no banco de produção (fuzabalta_roulette)
-- Rodar no servidor com:
--   docker exec -i postgres_principal psql -U postgres -d fuzabalta_roulette < pending_production.sql
-- =============================================================

-- 1) Motor scores — placar de acertos/erros do motor por roleta
CREATE TABLE IF NOT EXISTS motor_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  neighbor_mode SMALLINT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (source, neighbor_mode)
);

CREATE TABLE IF NOT EXISTS motor_pending_signals (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  suggested_numbers INT[] NOT NULL,
  spins_after SMALLINT NOT NULL DEFAULT 0,
  resolved_modes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_motor_pending_source ON motor_pending_signals (source);
CREATE INDEX IF NOT EXISTS idx_motor_scores_source ON motor_scores (source);

-- 2) Trigger scores — placar de acertos/erros dos gatilhos por roleta
CREATE TABLE IF NOT EXISTS trigger_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL UNIQUE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trigger_pending_signals (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  trigger_number SMALLINT NOT NULL,
  covered_numbers INT[] NOT NULL,
  spins_after SMALLINT NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_pending_source ON trigger_pending_signals (source);
CREATE INDEX IF NOT EXISTS idx_trigger_scores_source ON trigger_scores (source);

-- 3) Subscription audit — log de mudanças de status de assinatura
CREATE TABLE IF NOT EXISTS subscription_audit (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  from_status VARCHAR,
  to_status VARCHAR NOT NULL,
  triggered_by VARCHAR NOT NULL DEFAULT 'webhook',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_audit_email ON subscription_audit (email);
CREATE INDEX IF NOT EXISTS idx_sub_audit_created_at ON subscription_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_audit_user_id ON subscription_audit (user_id);
