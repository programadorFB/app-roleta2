-- =============================================================
-- add_credit_history.sql — historico do credit (saldo na casa)
--
-- POR QUE UMA TABELA NOVA
-- ───────────────────────
-- `platform_profiles.saldo` e um RETRATO: cada leitura sobrescreve a anterior.
-- Serve para "quanto essa pessoa tem agora", nao responde "o que aconteceu com
-- o dinheiro dela na ultima semana" — que e a pergunta que o painel precisa
-- fazer. Uma linha por leitura resolve, e nao ha como reconstruir isso depois:
-- o que nao for gravado no momento da leitura esta perdido.
--
-- QUEM ESCREVE
-- ────────────
-- `platformProfileService.registrarSaldo`, chamado (a) no login, junto da
-- captura do perfil, e (b) pelo coletor de 5 em 5 minutos
-- (`server/creditCollector.js`), que varre quem esta com o app aberto.
--
-- O saldo so pode ser lido com o JWT da PROPRIA pessoa — a API v2 nao tem rota
-- de servidor para consultar terceiros. Por isso a serie so tem pontos enquanto
-- alguem esta logado, e um buraco no grafico significa "app fechado", nao
-- "saldo parado". A coluna `origem` diz de onde veio cada ponto.
--
-- POR QUE NAO GRAVAR TODA LEITURA
-- ───────────────────────────────
-- A cada 5 min sao 288 leituras por pessoa por dia, quase todas com o MESMO
-- numero (ninguem aposta o dia inteiro). Gravar tudo seria milhoes de linhas
-- por mes para desenhar uma reta. Entao a regra e: grava quando o valor MUDA,
-- mais um ponto de vida a cada `CREDIT_HEARTBEAT_HOURS` para a linha nao sumir
-- de quem esta parado. A regra mora no INSERT do servico.
--
-- Idempotente: pode rodar multiplas vezes.
--
-- Rodar em producao com:
--   docker exec -i postgres_principal psql -U postgres -d phantom-roleta < add_credit_history.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS platform_balance_history (
  id               BIGSERIAL PRIMARY KEY,
  email            VARCHAR(255) NOT NULL,
  -- Ja em REAIS, como em platform_profiles: a conversao de centavos acontece
  -- no servico, e ter duas unidades no banco seria pedir para alguem somar
  -- errado um dia.
  saldo            NUMERIC(14,2) NOT NULL,
  saldo_disponivel NUMERIC(14,2),
  saldo_bonus      NUMERIC(14,2),
  -- Variacao em relacao a leitura anterior DESTA pessoa. NULL na primeira
  -- leitura: nao saber a variacao e diferente de variacao zero, e o painel soma
  -- deltas para dizer quanto entrou e saiu no periodo.
  delta            NUMERIC(14,2),
  -- 'login' | 'coletor' | 'seed'. Um ponto de 'seed' e o retrato que ja existia
  -- em platform_profiles quando esta tabela nasceu — data da LEITURA, nao da
  -- migracao.
  origem           VARCHAR(16) NOT NULL DEFAULT 'login',
  lido_em          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Serie de uma pessoa (grafico da ficha) e a busca da leitura anterior, que
-- roda a cada gravacao: e o indice quente desta tabela.
CREATE INDEX IF NOT EXISTS idx_pbh_email_lido
  ON platform_balance_history (email, lido_em DESC);
-- Agregacao por dia no painel e purge por retencao.
CREATE INDEX IF NOT EXISTS idx_pbh_lido
  ON platform_balance_history (lido_em DESC);

-- ── Semente ──────────────────────────────────────────────────
-- O retrato que platform_profiles ja guardava vira o primeiro ponto da serie,
-- com a data em que ELE foi lido. Sem isto, quem nao voltar a entrar no app
-- ficaria sem ponto nenhum, e o total em caixa do painel comecaria zerado.
--
-- `NOT EXISTS` no lugar de ON CONFLICT porque a tabela nao tem chave natural
-- (a mesma pessoa tem varias leituras): a protecao contra rodar duas vezes e
-- "esta pessoa ja tem alguma linha".
INSERT INTO platform_balance_history (email, saldo, saldo_disponivel, saldo_bonus, delta, origem, lido_em)
SELECT pp.email, pp.saldo, pp.saldo_disponivel, pp.saldo_bonus, NULL, 'seed',
       COALESCE(pp.saldo_em, pp.updated_at)
  FROM platform_profiles pp
 WHERE pp.saldo IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM platform_balance_history h WHERE h.email = pp.email
   );
