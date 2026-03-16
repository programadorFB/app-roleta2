-- Motor score: placar de acertos/erros do motor por roleta e modo de vizinho
CREATE TABLE IF NOT EXISTS motor_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  neighbor_mode SMALLINT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (source, neighbor_mode)
);

-- Sinais pendentes aguardando resolução
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
