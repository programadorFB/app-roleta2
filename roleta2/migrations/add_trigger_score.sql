-- Trigger score: placar de acertos/erros dos gatilhos por roleta
CREATE TABLE IF NOT EXISTS trigger_scores (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL UNIQUE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sinais de gatilho pendentes aguardando resolução (até 3 spins)
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
