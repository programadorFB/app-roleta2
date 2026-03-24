-- Adiciona resultado (win/loss) e label do padrão aos sinais pendentes
-- Necessário para servir sinais ativos do DB sem depender do triggerMap volátil

ALTER TABLE trigger_pending_signals
  ADD COLUMN IF NOT EXISTS result VARCHAR(4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pattern_label VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lift REAL DEFAULT NULL;
