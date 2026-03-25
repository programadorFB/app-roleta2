-- Adiciona coluna resolved à motor_pending_signals
-- Permite manter sinais resolvidos para filtro por rodadas (igual trigger_pending_signals)
ALTER TABLE motor_pending_signals ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_motor_pending_resolved ON motor_pending_signals (source, resolved);
