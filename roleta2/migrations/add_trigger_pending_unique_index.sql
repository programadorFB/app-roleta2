-- =============================================================
-- Índice parcial único: 1 sinal pendente por (source, trigger_number) por vez.
-- Evita duplicatas geradas por race entre workers PM2 inserindo o mesmo
-- trigger_number em milisegundos. Usado pelo ON CONFLICT em triggerScoreEngine.js
-- =============================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_pending_source_trigger_unresolved
  ON trigger_pending_signals (source, trigger_number)
  WHERE resolved = FALSE;

COMMIT;
