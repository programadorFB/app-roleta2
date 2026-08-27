-- =============================================================
-- Banimento por abuso (scraping). Idempotente.
--
-- Rodar em producao com:
--   docker exec -i postgres_principal psql -U postgres -d fuzabalta_roulette < add_access_bans.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS access_bans (
  id           SERIAL PRIMARY KEY,
  user_email   VARCHAR(255) NOT NULL,
  reason       VARCHAR(64)  NOT NULL DEFAULT 'scraping',
  -- Evidencia do que disparou o ban: UA, IP, taxa observada. Sem isso nao da
  -- pra revisar um falso positivo depois.
  evidence     TEXT,
  banned_until TIMESTAMP    NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  -- Preenchido quando um humano revoga o ban (falso positivo).
  revoked_at   TIMESTAMP,
  revoked_by   VARCHAR(255)
);

-- Consulta quente: "este email esta banido agora?" — roda em toda request.
CREATE INDEX IF NOT EXISTS idx_access_bans_lookup
  ON access_bans (user_email, banned_until DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_access_bans_created ON access_bans (created_at DESC);
