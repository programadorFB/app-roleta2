-- =============================================================
-- add_subscription_main_app_email.sql
--
-- Coluna que o painel administrativo consulta ao procurar uma pessoa
-- (`WHERE email = $1 OR main_app_email = $1`).
--
-- No roleta3 ela guarda o e-mail do PAGADOR quando ele difere do e-mail com que
-- a pessoa entra no app — o webhook de assinatura faz esse vinculo. O roleta2
-- ainda nao porta esse vinculo: aqui a coluna nasce e permanece NULA, e a
-- clausula do painel vira um no-op.
--
-- Ela existe assim mesmo por dois motivos: sem a coluna, TODA consulta do painel
-- estoura com 'column "main_app_email" does not exist'; e mante-la deixa o
-- adminService.js identico ao do roleta3, que e o que torna o proximo port
-- barato.
--
-- Idempotente: pode rodar multiplas vezes.
--
-- Rodar em producao com:
--   docker exec -i postgres_principal psql -U postgres -d phantom-roleta < add_subscription_main_app_email.sql
-- =============================================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS main_app_email VARCHAR;

CREATE INDEX IF NOT EXISTS idx_subscriptions_main_app_email
  ON subscriptions (main_app_email);
