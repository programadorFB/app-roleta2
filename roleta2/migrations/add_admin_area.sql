-- =============================================================
-- Área administrativa: telemetria de uso + contas de admin.
-- Idempotente: pode rodar múltiplas vezes.
--
-- Rodar em produção com:
--   docker exec -i postgres_principal psql -U postgres -d phantom-roleta < add_admin_area.sql
-- =============================================================

-- ── Sessões de uso ───────────────────────────────────────────
-- Uma linha por conexão Socket.IO. Reconexão gera linha nova de
-- propósito: costurar na escrita exigiria coordenação entre os
-- workers do PM2. A costura de gaps curtos é feita na leitura.
CREATE TABLE IF NOT EXISTS app_sessions (
  id               BIGSERIAL PRIMARY KEY,
  user_email       VARCHAR(255) NOT NULL,
  socket_id        VARCHAR(64)  NOT NULL,
  is_premium       BOOLEAN      NOT NULL DEFAULT FALSE,
  started_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  -- NULL = sessão aberta. O job de rollup fecha as órfãs (worker
  -- morto sem disconnect) usando last_seen_at.
  ended_at         TIMESTAMP,
  last_seen_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER,
  user_agent       VARCHAR(400),
  -- SHA-256 de (ip + salt). Conta únicos sem guardar o endereço.
  ip_hash          VARCHAR(64)
);

-- Consulta quente do admin: "sessões deste usuário", mais recentes antes.
CREATE INDEX IF NOT EXISTS idx_app_sessions_user
  ON app_sessions (user_email, started_at DESC);
-- Agregação por dia (DAU, tempo total) e purge por retenção.
CREATE INDEX IF NOT EXISTS idx_app_sessions_started
  ON app_sessions (started_at DESC);
-- Fechamento de órfãs e contagem de "online agora".
CREATE INDEX IF NOT EXISTS idx_app_sessions_open
  ON app_sessions (last_seen_at)
  WHERE ended_at IS NULL;

-- ── Eventos de uso ───────────────────────────────────────────
-- Volume alto: só nomes de evento da whitelist do servidor entram,
-- e meta tem cap de tamanho. Retenção de 90 dias.
CREATE TABLE IF NOT EXISTS app_events (
  id         BIGSERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  event      VARCHAR(40)  NOT NULL,
  view       VARCHAR(40),
  meta       JSONB,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_user    ON app_events (user_email, created_at DESC);
-- Engajamento por tela: "quanto tempo em cada view no período".
CREATE INDEX IF NOT EXISTS idx_app_events_event   ON app_events (event, created_at DESC);

-- ── Rollup diário ────────────────────────────────────────────
-- Agregado que sobrevive ao purge dos dados crus. É o que alimenta
-- os gráficos de série temporal do admin.
CREATE TABLE IF NOT EXISTS metrics_daily (
  day                  DATE PRIMARY KEY,
  dau                  INTEGER NOT NULL DEFAULT 0,
  premium_dau          INTEGER NOT NULL DEFAULT 0,
  free_dau             INTEGER NOT NULL DEFAULT 0,
  new_users            INTEGER NOT NULL DEFAULT 0,
  sessions             INTEGER NOT NULL DEFAULT 0,
  total_seconds        BIGINT  NOT NULL DEFAULT 0,
  avg_session_seconds  INTEGER NOT NULL DEFAULT 0,
  computed_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── subscriptions.source: de onde veio a assinatura ──────────
-- Valores que o codigo grava: 'kirvano' (gateway atual), 'hubla' (legado),
-- 'trial' (7 dias do primeiro acesso) e 'admin' (ajuste na mao pelo painel).
--
-- SEM DEFAULT, de proposito. O roleta2 migrou de Hubla para Kirvano em
-- 27/08/2026, entao um `DEFAULT 'hubla'` carimbaria de legado tanto as linhas
-- antigas quanto as vendas recentes que ja vieram por Kirvano — e nao ha como
-- distinguir as duas coisas depois do fato. Linha anterior a esta migracao fica
-- NULA: "veio de antes do rastreio" e a unica resposta honesta, e e melhor que
-- uma atribuicao errada com cara de dado.
--
-- Daqui pra frente quem chama o upsertSubscription sempre diz o source; nao ha
-- fallback no codigo justamente para o silencio nao virar carimbo.
--
-- Idempotente: nao faz nada onde a coluna ja existe.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source VARCHAR(32);

-- ── Contas de admin ──────────────────────────────────────────
-- Hash em scrypt (node:crypto), formato "scrypt$N$r$p$salt$hash".
-- Criadas pelo CLI server/scripts/createAdmin.js — não há
-- auto-registro por endpoint.
CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(120),
  role          VARCHAR(32)  NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMP,
  -- Preenchido para desativar sem apagar o histórico de auditoria.
  disabled_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active
  ON admin_users (email)
  WHERE disabled_at IS NULL;

-- ── Auditoria das ações de admin ─────────────────────────────
-- Toda ação mutante grava aqui. É o motivo de existir login por
-- pessoa em vez do ADMIN_SECRET compartilhado.
CREATE TABLE IF NOT EXISTS admin_audit (
  id           BIGSERIAL PRIMARY KEY,
  admin_email  VARCHAR(255) NOT NULL,
  action       VARCHAR(64)  NOT NULL,
  target_email VARCHAR(255),
  payload      JSONB,
  ip_hash      VARCHAR(64),
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target  ON admin_audit (target_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin   ON admin_audit (admin_email, created_at DESC);
