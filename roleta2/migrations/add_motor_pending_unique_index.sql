-- =============================================================
-- Índice parcial único: garante no máximo 1 sinal pendente por source
-- Evita duplicatas de sinais não resolvidos que bloqueiam novos sinais
-- Necessário pelo ON CONFLICT (source) WHERE resolved = FALSE em motorScoreEngine.js
-- =============================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_motor_pending_source_unresolved
  ON motor_pending_signals (source)
  WHERE resolved = FALSE;

COMMIT;
