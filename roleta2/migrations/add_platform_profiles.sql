-- =============================================================
-- add_platform_profiles.sql — espelho do cadastro que o usuario tem na casa
--
-- DE ONDE VEM
-- ───────────
-- Das rotas `GET /profile` e `GET /wallet` da API v2 (api.appbackend.tech),
-- lidas pelo BACKEND com o JWT do proprio usuario, no login. Nao e o app que
-- reporta quem ele e — se fosse, bastaria forjar um POST para se declarar
-- outra pessoa. Ver `server/platformProfileService.js`.
--
-- POR QUE JSONB ALEM DAS COLUNAS
-- ──────────────────────────────
-- A doc do parceiro avisa que "os demais campos do perfil sao retornados
-- diretamente pela plataforma e podem variar por brand". Colunas fixas
-- perderiam calado o que a betou manda hoje e a sortenabet mandar amanha.
-- `perfil_bruto`/`carteira_bruto` guardam a resposta inteira (com credenciais
-- redigidas); as colunas sao so o que ja sabemos consultar e ordenar.
--
-- SOBRE O SALDO
-- ─────────────
-- `saldo`, `saldo_disponivel` e `saldo_bonus` vem do /wallet e ja estao em
-- REAIS: a API responde em CENTAVOS e a conversao acontece no serviço. O `ftd_valor`,
-- na mesma resposta, ja vem em reais — a mesma carga mistura as duas unidades.
-- Detalhes e a prova de cada afirmacao estao no serviço.
--
-- Idempotente: pode rodar multiplas vezes.
--
-- Rodar em producao com:
--   docker exec -i postgres_principal psql -U postgres -d phantom-roleta < add_platform_profiles.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS platform_profiles (
  email       VARCHAR(255) PRIMARY KEY,
  brand       VARCHAR(40),          -- betou | sortenabet | betfusion
  externo_id  VARCHAR(64),          -- id do usuario NA CASA
  nome        VARCHAR(160),
  documento   VARCHAR(32),          -- so digitos
  telefone    VARCHAR(24),          -- so digitos, SEM o DDI
  telefone_ddi VARCHAR(8),
  nascimento  DATE,
  cidade      VARCHAR(120),
  estado      VARCHAR(60),

  -- Assinatura NA CASA (trial/afiliado), que e outra coisa do plano vendido por
  -- Hubla/Kirvano. Separadas para o painel nao dizer "premium" a quem so esta
  -- num trial de 7 dias da plataforma. So vem preenchida quando o login manda
  -- `src` (produto afiliado) — hoje nao mandamos, entao costuma ser nula.
  assinatura_expira_em TIMESTAMP,
  is_trial             BOOLEAN,
  -- Aceite de marketing NA CASA: e ele que sustenta juridicamente disparo em
  -- cima desta lista.
  mkt_aceito_em        TIMESTAMP,

  -- Dinheiro, ja em reais.
  saldo            NUMERIC(14,2),
  saldo_disponivel NUMERIC(14,2),
  saldo_bonus      NUMERIC(14,2),
  saldo_em         TIMESTAMP,       -- carimbo da LEITURA do saldo, nao da linha
  ftd_valor        NUMERIC(14,2),   -- primeiro deposito (imutavel)
  ftd_em           TIMESTAMP,

  perfil_em      TIMESTAMP,
  perfil_bruto   JSONB,
  carteira_em    TIMESTAMP,
  carteira_bruto JSONB,

  ultimo_erro TEXT,                 -- ultima leitura parcial, para diagnostico
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Numero pronto para colar numa API de mensagem: DDI + numero, sem pontuacao.
-- Coluna GERADA para nao existir a versao "quase certa" montada na mao em
-- cinco lugares diferentes do codigo.
ALTER TABLE platform_profiles ADD COLUMN IF NOT EXISTS telefone_completo VARCHAR(32)
  GENERATED ALWAYS AS (
    CASE WHEN telefone IS NULL THEN NULL
         ELSE COALESCE(telefone_ddi, '55') || telefone END
  ) STORED;

-- Telefone e documento sao o que o suporte cola na busca quando a pessoa liga
-- sem lembrar com que e-mail se cadastrou.
CREATE INDEX IF NOT EXISTS idx_platform_profiles_telefone
  ON platform_profiles (telefone) WHERE telefone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_profiles_documento
  ON platform_profiles (documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_profiles_saldo
  ON platform_profiles (saldo DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_platform_profiles_ftd
  ON platform_profiles (ftd_em DESC NULLS LAST) WHERE ftd_valor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_profiles_brand
  ON platform_profiles (brand);
