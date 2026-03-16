-- =============================================================
-- Migration para deploy do roleta2 no banco phantom-roleta
-- Rodar com:
--   docker exec -i postgres_principal psql -U postgres -d phantom-roleta < migrations/deploy_roleta2.sql
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) signals: adicionar coluna id serial para delta queries
--    O código usa "WHERE id > ..." e "ORDER BY id DESC"
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'id'
  ) THEN
    ALTER TABLE signals ADD COLUMN id SERIAL;
    -- Preenche IDs em ordem cronológica para dados existentes
    WITH ordered AS (
      SELECT ctid, ROW_NUMBER() OVER (ORDER BY "timestamp" ASC) AS rn
      FROM signals
    )
    UPDATE signals SET id = ordered.rn FROM ordered WHERE signals.ctid = ordered.ctid;
    -- Ajusta a sequence para continuar após o último ID
    SELECT setval('signals_id_seq', COALESCE(MAX(id), 0) + 1, false) FROM signals;
    CREATE INDEX IF NOT EXISTS idx_signals_id ON signals (id DESC);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2) subscription_audit: log de mudanças de status
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 3) motor_scores: placar do motor por roleta e modo de vizinho
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 4) motor_pending_signals: sinais pendentes do motor
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS motor_pending_signals (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  suggested_numbers INT[] NOT NULL,
  spins_after SMALLINT NOT NULL DEFAULT 0,
  resolved_modes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_motor_pending_source ON motor_pending_signals (source);

-- ─────────────────────────────────────────────────────────────
-- 5) trigger_scores: placar de acertos/erros dos gatilhos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trigger_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL UNIQUE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_scores_source ON trigger_scores (source);

-- ─────────────────────────────────────────────────────────────
-- 6) trigger_pending_signals: sinais de gatilho pendentes
-- ─────────────────────────────────────────────────────────────
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

COMMIT;
