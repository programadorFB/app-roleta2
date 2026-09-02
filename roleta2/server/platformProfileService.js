/**
 * platformProfileService.js — Espelho do cadastro e do dinheiro na casa de apostas.
 *
 * QUEM LÊ
 * ───────
 * O BACKEND, com o JWT do próprio usuário, no momento do login. Não é o app do
 * usuário que reporta quem ele é — se fosse, bastaria forjar um POST para se
 * declarar outra pessoa, e o painel passaria a mentir com ar de dado oficial.
 * O token que chega aqui é o mesmo que a casa emitiu para aquela conta; o que
 * ele destranca é o cadastro dela e de mais ninguém. E é também o ÚNICO
 * momento em que o temos: a API v2 não tem rota de servidor para consultar
 * terceiros.
 *
 * O E-MAIL DA RESPOSTA MANDA
 * ──────────────────────────
 * A linha é gravada no e-mail que o `/profile` devolveu, não no que o corpo do
 * login afirmou. São a mesma coisa em todo login normal; quando divergirem, o
 * que a casa diz sobre o dono do token vale mais do que o que o cliente digitou.
 *
 * O PARSER É TOLERANTE (menos para dinheiro)
 * ──────────────────────────────────────────
 * A doc avisa que "os demais campos do perfil são retornados diretamente pela
 * plataforma e podem variar por brand". Casar um formato exato quebraria calado
 * no dia em que a betou mudasse uma chave — e um espelho que quebra calado é
 * pior do que não ter espelho. Então procuramos cada dado por uma lista de
 * nomes conhecidos e guardamos a resposta inteira nos campos `*_bruto`.
 * Dinheiro é a exceção deliberada: ver o bloco DINHEIRO.
 *
 * Portado da implementação de referência do app_web_aviator
 * (`backend/perfil_parceiro.py`), que já pagou o preço de descobrir cada uma
 * das armadilhas comentadas abaixo.
 *
 * Tabela: migrations/add_platform_profiles.sql
 */

import { query } from './db.js';

// Mesmo host contra o qual o authService ja valida token (`/profile` responde
// 200 com o e-mail para token valido). O roleta2 fala com `api.appbackend.tech`,
// nao com o `api-v2` do roleta3 — o default acompanha isso para o caso de a var
// faltar. `/wallet` e a incognita deste host: se nao existir, a captura grava o
// perfil com saldo nulo e o motivo em `ultimo_erro`, sem quebrar nada.
const AUTH_TARGET = (process.env.PLATFORM_API_URL || process.env.AUTH_PROXY_TARGET || 'https://api.appbackend.tech').replace(/\/+$/, '');

// Brand da instalação. Cada stack serve UMA casa (main = betou, sortenabet =
// sortenabet), a mesma que o front manda no login via VITE_BRAND. É rótulo: a
// API resolve a brand pelo próprio token.
const BRAND = (process.env.BRAND || process.env.VITE_BRAND || 'betou').toLowerCase();

// Timeout curto de propósito: isto roda DENTRO do login, que ninguém espera.
// Se a casa estiver lenta, o certo é desistir do espelho — o próximo login
// busca de novo.
const TIMEOUT_MS = Number(process.env.PLATFORM_SYNC_TIMEOUT_MS) || 6000;

// Uma resposta de perfil são alguns KB. Um "perfil" de 2 MB é a API devolvendo
// outra coisa (página de erro, HTML de captcha) — não vai para o JSONB.
const LIMITE_BRUTO = 256 * 1024;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const platformSyncStats = {
  ok: 0, semSaldo: 0, profileErrors: 0, walletErrors: 0, saveErrors: 0, skipped: 0,
};

// ─── Leitura tolerante do JSON ────────────────────────────────

/**
 * Primeiro valor cuja chave está em `chaves`, varrendo em LARGURA.
 *
 * Largura e não profundidade porque o campo certo costuma estar na raiz: num
 * perfil com `{"name": "Joao", "affiliate": {"name": "Casa X"}}`, a busca em
 * profundidade poderia devolver o nome do afiliado.
 */
function busca(raiz, chaves) {
  const fila = [raiz];
  while (fila.length) {
    const no = fila.shift();
    if (Array.isArray(no)) {
      for (const v of no) if (v && typeof v === 'object') fila.push(v);
    } else if (no && typeof no === 'object') {
      for (const chave of chaves) {
        const v = no[chave];
        const vazio = v === null || v === undefined || v === ''
          || (Array.isArray(v) && v.length === 0)
          || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
        if (!vazio) return v;
      }
      for (const v of Object.values(no)) if (v && typeof v === 'object') fila.push(v);
    }
  }
  return null;
}

/** Desembrulha `{"number": "123..."}` — o formato do `document` na doc. */
function escalar(valor, subchaves = ['number', 'value', 'numero', 'valor']) {
  if (Array.isArray(valor)) return valor.length ? escalar(valor[0]) : null;
  if (valor && typeof valor === 'object') {
    for (const chave of subchaves) if (valor[chave]) return valor[chave];
    return null;
  }
  return valor;
}

/** String limpa e limitada, ou null. Corta em vez de deixar o INSERT falhar. */
function texto(valor, limite = 120) {
  const v = escalar(valor);
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  const limpo = String(v).split(/\s+/).filter(Boolean).join(' ');
  return limpo ? limpo.slice(0, limite) : null;
}

function digitos(valor, limite = 20) {
  const so = String(escalar(valor) ?? '').replace(/\D/g, '');
  return so ? so.slice(0, limite) : null;
}

function booleano(valor) {
  const v = escalar(valor);
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'sim', 'yes', 't'].includes(String(v).trim().toLowerCase());
}

/** ISO 8601 -> Date, ou null. Data inválida some, não derruba a leitura. */
function instante(valor) {
  const t = texto(valor, 40);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function data(valor) {
  const d = instante(valor);
  return d ? d.toISOString().slice(0, 10) : null;
}

// ─── DINHEIRO ─────────────────────────────────────────────────
//
// ATENÇÃO: a leitura de dinheiro é DELIBERADAMENTE menos tolerante que a do
// resto deste arquivo. Para nome e cidade, chutar errado produz um cadastro
// feio. Para saldo, chutar errado produz um NÚMERO ERRADO com cara de oficial —
// e o painel decide em cima dele.
//
// `balance` NÃO É O SALDO NESTA API. Numa conta com R$ 0,00 na betou a resposta
// real foi `balance = 4000`, `credit = 0`, `available_value = 0`. A doc mostra
// `{"balance": 150.00}`, o que induz ao erro — foi assim que o painel chegou a
// anunciar R$ 4.000,00 para uma conta zerada.
//
// Por isso, aqui:
//   - a lista de chaves é FECHADA (`credit`, `available_value`), sem `balance`
//     e sem nome genérico (`amount`, `value`, `total`) — `value` é inclusive o
//     valor da COBRANÇA, em centavos, no /wallet/add-credit;
//   - a busca NÃO varre a árvore inteira como `busca`: só a raiz e um nível
//     abaixo, em ninhos conhecidos. Um `credit` perdido dentro de outro objeto
//     provavelmente é de outra coisa;
//   - sem campo conhecido, o saldo fica null. Não saber é um estado honesto.

// O /wallet devolve DOIS numeros de dinheiro, e eles nao batem. Numa conta real
// veio credit=69187 e balance=181301 (centavos, ou seja R$ 691,87 contra
// R$ 1.813,01); noutra, credit=0 e balance=4000.
//
// O saldo e o `credit`, confirmado pelo dono do produto em 01/09/2026. O
// `balance` NAO e o dinheiro da pessoa e nao deve ser exibido como tal.
//
// Isto esta escrito aqui porque a diferenca chama atencao: quem abrir o
// carteira_bruto e vir um numero maior sendo ignorado vai supor que e bug e
// "consertar". Nao e. Se precisar do balance para conferencia, ele esta na
// resposta crua, visivel na aba Campos da Casa do painel.
const CHAVES_SALDO      = ['credit', 'available_value'];
const CHAVES_DISPONIVEL = ['available_value'];
const CHAVES_BONUS      = ['bonus', 'bonus_balance', 'bonusBalance'];

// Onde o objeto útil costuma se esconder quando não vem na raiz.
const NINHOS = ['wallet', 'data', 'result', 'carteira', 'user_profile'];

/**
 * Número >= 0 com 2 casas, ou null. Recusa lixo em vez de gravar NaN.
 * Aceita number e string ("150.00", "R$ 1.234,56"): a casa manda dos dois
 * jeitos, dependendo do campo.
 */
function dinheiro(valor) {
  if (valor === null || valor === undefined || typeof valor === 'boolean') return null;

  let bruto = valor;
  if (typeof bruto === 'string') {
    let limpo = bruto.replace(/[^\d,.-]/g, '');
    if (!limpo) return null;
    // Qual separador é o decimal: o ÚLTIMO que aparecer. "1.234,56" -> a
    // vírgula; "150.00" -> o ponto. Sem isso "1.234,56" viraria 1.23.
    limpo = limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(/,/g, '');
    bruto = limpo;
  }

  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0) return null;   // saldo negativo não existe nesta API
  if (n >= 1e12) return null;                      // estouraria o NUMERIC(14,2)
  return Math.round(n * 100) / 100;
}

// ─── A UNIDADE É CENTAVOS ─────────────────────────────────────
//
// `credit`, `available_value` e `bonus` vêm em CENTAVOS, não em reais —
// confirmado contra uma conta real com saldo conhecido, em que o painel
// mostrava 100x o valor de verdade.
//
// A doc induz ao erro de novo: mostra `{"balance": 150.00}`, com casa decimal,
// como se fosse reais — e `balance` já é o campo que não é saldo. O que sempre
// foi verdade é o `/wallet/add-credit`, que cobra em centavos (`credit_amount`
// na ida, `value` na volta): a plataforma inteira fala em centavos, e a doc é
// que está desalinhada.
//
// A conversão mora AQUI e em nenhum outro lugar. `dinheiro` continua sendo só o
// parser (texto/número -> float); quem sabe a unidade é esta camada.
const CENTAVOS = 100;

function reais(valor) {
  const n = dinheiro(valor);
  return n === null ? null : Math.round((n / CENTAVOS) * 100) / 100;
}

/** Primeiro valor monetário entre `chaves`, na raiz ou um nível abaixo. */
function valorDe(raiz, chaves, converter = reais) {
  if (!raiz || typeof raiz !== 'object') return null;
  for (const chave of chaves) {
    const n = converter(raiz[chave]);
    if (n !== null) return n;
  }
  for (const ninho of NINHOS) {
    const dentro = raiz[ninho];
    if (dentro && typeof dentro === 'object') {
      for (const chave of chaves) {
        const n = converter(dentro[chave]);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

/** Saldo, disponível e bônus, em REAIS. Sem chute — ver os blocos acima. */
export function extrairDinheiro(resposta) {
  return {
    saldo:            valorDe(resposta, CHAVES_SALDO),
    saldo_disponivel: valorDe(resposta, CHAVES_DISPONIVEL),
    saldo_bonus:      valorDe(resposta, CHAVES_BONUS),
  };
}

/**
 * Primeiro depósito. As DUAS rotas podem trazê-lo: o /profile tem `ftd_value`
 * na raiz; o /wallet o traz dentro de `user_profile`. Por isso a busca aqui é a
 * tolerante (em largura) e não a fechada do dinheiro — FTD é um valor histórico
 * e imutável, não o número em que alguém aposta agora.
 *
 * O FTD VEM EM REAIS, ao contrário do saldo. Sim, a mesma resposta mistura as
 * duas unidades: os `ftd_value` observados são 14, 10, 20, 40, 50, 100, 500 —
 * valores de depósito; em centavos seriam R$ 0,14, e não existe casa que aceite
 * depósito de quatorze centavos. Por isso `dinheiro` e não `reais`.
 */
export function extrairFtd(resposta) {
  return {
    ftd_valor: dinheiro(busca(resposta, ['ftd_value', 'ftd_valor', 'first_deposit_value'])),
    ftd_em:    instante(busca(resposta, ['ftd_date', 'ftd_at', 'first_deposit_at'])),
  };
}

/**
 * Devolve [numero_sem_ddi, ddi].
 *
 * O número chega de tudo quanto é jeito: "+55 (11) 98888-7777",
 * "5511988887777", "11988887777". Guardamos DDI e número separados porque só o
 * par serve para montar um link de WhatsApp; um "5511988887777" gravado como se
 * fosse o número local vira um telefone que não existe quando alguém prefixar
 * o 55 de novo.
 *
 * Quando o perfil traz o país num campo próprio, ELE manda. Sem esse campo o
 * resto é palpite pelo formato, e o palpite assume Brasil: a casa é .bet.br e o
 * produto é pt-BR.
 */
function telefoneDe(bruto, ddiDeclarado) {
  let so = digitos(bruto);
  if (!so) return [null, null];

  const declarado = digitos(ddiDeclarado, 4);
  if (declarado) {
    // "+55 11 98888-7777" com country_code=55: tirar o 55 duplicado, senão o
    // telefone_completo sai com o país duas vezes.
    if (so.startsWith(declarado) && so.length > declarado.length + 8) {
      so = so.slice(declarado.length);
    }
    return [so, declarado];
  }

  // 55 + DDD(2) + número(8 ou 9) = 12 ou 13 dígitos. Abaixo disso o 55 inicial
  // é o DDD 55 (Rio Grande do Sul), não o país.
  if (so.startsWith('55') && (so.length === 12 || so.length === 13)) return [so.slice(2), '55'];
  if (so.length === 10 || so.length === 11) return [so, '55'];
  return [so, null];
}

/** Resposta crua do /profile -> colunas de platform_profiles. */
export function extrairPerfil(perfil) {
  const [telefone, ddi] = telefoneDe(
    busca(perfil, ['phone', 'telefone', 'cellphone', 'mobile', 'phone_number', 'celular', 'whatsapp']),
    busca(perfil, ['ddi', 'country_code', 'phone_country', 'phone_code']),
  );

  return {
    externo_id: texto(busca(perfil, ['id', 'user_id', 'external_id']), 40),
    email:      (texto(busca(perfil, ['email', 'e_mail']), 160) || '').toLowerCase() || null,
    nome:       texto(busca(perfil, ['name', 'nome', 'full_name', 'fullname']), 160),
    documento:  digitos(busca(perfil, ['document', 'cpf', 'documento', 'document_number', 'tax_id'])),
    telefone,
    telefone_ddi: ddi,
    nascimento: data(busca(perfil, ['birth_date', 'birthdate', 'born_at', 'date_of_birth', 'nascimento'])),
    cidade:     texto(busca(perfil, ['city', 'cidade']), 80),
    estado:     texto(busca(perfil, ['state', 'uf', 'estado']), 40),
    assinatura_expira_em: instante(busca(perfil, ['subscription_expire_at', 'subscription_expires_at'])),
    is_trial:   booleano(busca(perfil, ['is_trial', 'trial'])),
    // Aceite de marketing na casa. Só o /profile tem, e é ele que sustenta
    // juridicamente qualquer disparo em cima desta lista.
    mkt_aceito_em: instante(busca(perfil, ['mkt_accepted_at', 'marketing_accepted_at'])),
    ...extrairFtd(perfil),
  };
}

// ─── Redação de segredos ──────────────────────────────────────
//
// O `GET /profile` devolve um campo `token` — uma credencial viva daquele
// usuário. Guardar a resposta inteira significaria uma tabela cheia de
// credenciais reutilizáveis, legível por qualquer admin pela ficha e por
// qualquer backup do banco. O espelho existe para saber QUEM a pessoa é, nunca
// para poder agir como ela.
//
// A lista é por nome de chave, em qualquer profundidade, e por substring: a
// casa tem centenas de campos e não há por que apostar que só um carrega segredo.
const CHAVES_SECRETAS = ['token', 'password', 'senha', 'secret', 'api_key', 'apikey', 'authorization', 'refresh'];
const REDIGIDO = '[redigido]';

export function redigir(no) {
  if (Array.isArray(no)) return no.map(redigir);
  if (no && typeof no === 'object') {
    const saida = {};
    for (const [chave, valor] of Object.entries(no)) {
      saida[chave] = CHAVES_SECRETAS.some(s => String(chave).toLowerCase().includes(s))
        ? REDIGIDO
        : redigir(valor);
    }
    return saida;
  }
  return no;
}

// ─── Ida à API v2 ─────────────────────────────────────────────

/** GET numa rota da v2 com o JWT do usuário. Nunca lança. */
async function buscarV2(caminho, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AUTH_TARGET}${caminho}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });

    if (res.status !== 200) {
      // 401 aqui é rotina: token expirado, usuário voltando com sessão velha.
      return { ok: false, status: res.status, body: null };
    }

    const bruto = await res.text();
    if (bruto.length > LIMITE_BRUTO) {
      return { ok: false, status: res.status, body: null, error: `corpo de ${bruto.length} bytes` };
    }

    let body = null;
    try { body = JSON.parse(bruto); } catch { /* corpo não-JSON */ }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, status: res.status, body: null, error: 'corpo não é objeto JSON' };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// COALESCE em quase toda parte: uma leitura que veio sem o telefone não apaga o
// telefone que a leitura de ontem trouxe. As exceções estão comentadas na query.
const SQL_UPSERT = `
  INSERT INTO platform_profiles (
    email, brand, externo_id, nome, documento, telefone, telefone_ddi,
    nascimento, cidade, estado, assinatura_expira_em, is_trial, mkt_aceito_em,
    ftd_valor, ftd_em, saldo, saldo_disponivel, saldo_bonus, saldo_em,
    perfil_em, perfil_bruto, carteira_em, carteira_bruto, ultimo_erro, updated_at
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
    -- A hora vale para a LEITURA, não para a linha: saldo_em com data de hoje e
    -- saldo de duas semanas atrás faria o painel mentir com carimbo.
    CASE WHEN $16::numeric IS NULL THEN NULL ELSE NOW() END,
    CASE WHEN $19::boolean THEN NOW() END, $20::jsonb,
    CASE WHEN $21::jsonb IS NULL THEN NULL ELSE NOW() END, $21::jsonb,
    $22, NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    brand        = COALESCE(EXCLUDED.brand, platform_profiles.brand),
    externo_id   = COALESCE(EXCLUDED.externo_id, platform_profiles.externo_id),
    nome         = COALESCE(EXCLUDED.nome, platform_profiles.nome),
    documento    = COALESCE(EXCLUDED.documento, platform_profiles.documento),
    nascimento   = COALESCE(EXCLUDED.nascimento, platform_profiles.nascimento),
    cidade       = COALESCE(EXCLUDED.cidade, platform_profiles.cidade),
    estado       = COALESCE(EXCLUDED.estado, platform_profiles.estado),
    is_trial     = COALESCE(EXCLUDED.is_trial, platform_profiles.is_trial),
    mkt_aceito_em = COALESCE(EXCLUDED.mkt_aceito_em, platform_profiles.mkt_aceito_em),
    -- FTD é imutável por definição (é o PRIMEIRO depósito): leitura vazia nunca
    -- apaga o que já sabíamos.
    ftd_valor    = COALESCE(EXCLUDED.ftd_valor, platform_profiles.ftd_valor),
    ftd_em       = COALESCE(EXCLUDED.ftd_em, platform_profiles.ftd_em),
    -- Saldo é o oposto do FTD: o valor NOVO manda, inclusive quando cai — um
    -- COALESCE aqui congelaria o maior saldo que a pessoa já teve. Mas leitura
    -- AUSENTE (null) não zera: não ler não é ler zero.
    saldo            = COALESCE(EXCLUDED.saldo, platform_profiles.saldo),
    saldo_disponivel = CASE WHEN EXCLUDED.saldo IS NULL
                            THEN platform_profiles.saldo_disponivel
                            ELSE EXCLUDED.saldo_disponivel END,
    saldo_bonus      = CASE WHEN EXCLUDED.saldo IS NULL
                            THEN platform_profiles.saldo_bonus
                            ELSE EXCLUDED.saldo_bonus END,
    saldo_em         = COALESCE(EXCLUDED.saldo_em, platform_profiles.saldo_em),
    -- Vencimento é o único campo em que a leitura nova manda mesmo vindo nula:
    -- null ali significa "esta conta não tem assinatura", e manter a data velha
    -- faria o painel mostrar assinatura para quem deixou de ter uma.
    assinatura_expira_em = EXCLUDED.assinatura_expira_em,
    -- DDI e número andam COLADOS: trocar um sem o outro produz um telefone
    -- completo que não existe.
    telefone     = COALESCE(EXCLUDED.telefone, platform_profiles.telefone),
    telefone_ddi = CASE WHEN EXCLUDED.telefone IS NULL THEN platform_profiles.telefone_ddi
                        ELSE EXCLUDED.telefone_ddi END,
    perfil_em    = COALESCE(EXCLUDED.perfil_em, platform_profiles.perfil_em),
    perfil_bruto = COALESCE(EXCLUDED.perfil_bruto, platform_profiles.perfil_bruto),
    -- Carteira que não respondeu não apaga a foto anterior: o operador prefere
    -- um retrato de ontem a uma tela em branco.
    carteira_em    = COALESCE(EXCLUDED.carteira_em, platform_profiles.carteira_em),
    carteira_bruto = COALESCE(EXCLUDED.carteira_bruto, platform_profiles.carteira_bruto),
    ultimo_erro    = EXCLUDED.ultimo_erro,
    updated_at     = NOW()
  RETURNING email`;

/**
 * Lê /profile e /wallet e grava o espelho. Nunca lança.
 *
 * As DUAS rotas, sempre. O /wallet é a FONTE DO SALDO, sem condicional: chamar
 * só quando o /profile não traz `credit` economizaria uma requisição e abriria
 * a porta para o pior erro possível — bastaria a casa ter, entre as centenas de
 * campos do perfil, um `credit` que significasse outra coisa (limite, crédito
 * promocional, saldo de outra carteira) para o painel exibir esse número como o
 * dinheiro da pessoa, e ninguém veria erro nenhum.
 *
 * Chamada SEM await no login (ninguém espera a casa responder para entrar); o
 * retorno serve para testes e para uma eventual rota de re-sincronização.
 */
export async function capturePlatformData(emailFallback, token, brand = BRAND) {
  const login = String(emailFallback || '').trim().toLowerCase();
  if (!token) {
    platformSyncStats.skipped++;
    return { ok: false, reason: 'sem token' };
  }

  const perfilRes = await buscarV2('/profile', token);
  if (!perfilRes.ok) {
    platformSyncStats.profileErrors++;
    // Sem perfil não há linha: o /wallet sozinho não diz quem é a pessoa.
    return { ok: false, reason: `profile ${perfilRes.status}${perfilRes.error ? ` (${perfilRes.error})` : ''}` };
  }

  const carteiraRes = await buscarV2('/wallet', token);
  if (!carteiraRes.ok) platformSyncStats.walletErrors++;

  const dados = extrairPerfil(perfilRes.body);

  // SALDO SÓ SAI DAQUI. Sem fallback para o /profile de propósito (ver acima).
  // Sem carteira, o saldo fica null e o UPSERT preserva a última leitura boa.
  const dinheiroLido = extrairDinheiro(carteiraRes.ok ? carteiraRes.body : {});
  if (carteiraRes.ok && dinheiroLido.saldo === null) platformSyncStats.semSaldo++;

  // FTD, ao contrário, vale de onde vier. A carteira manda por ser a leitura
  // mais próxima do dinheiro.
  if (carteiraRes.ok) {
    const ftd = extrairFtd(carteiraRes.body);
    if (ftd.ftd_valor !== null) Object.assign(dados, ftd);
  }

  const email = dados.email || login;
  if (!email || !EMAIL_RE.test(email)) {
    platformSyncStats.skipped++;
    return { ok: false, reason: 'sem e-mail utilizável' };
  }
  if (login && email !== login) {
    // Não é erro nem ataque necessariamente (a casa pode normalizar o e-mail),
    // mas é a única pista se um dia for.
    console.warn(`⚠️ [plataforma] perfil veio com e-mail ${email} para um login de ${login}`);
  }

  const erros = [
    !carteiraRes.ok ? `wallet ${carteiraRes.status}${carteiraRes.error ? ` (${carteiraRes.error})` : ''}` : null,
    carteiraRes.ok && dinheiroLido.saldo === null ? 'wallet sem campo de saldo conhecido' : null,
  ].filter(Boolean).join(' · ') || null;

  try {
    await query(SQL_UPSERT, [
      email,
      texto(brand, 40),
      dados.externo_id,
      dados.nome,
      dados.documento,
      dados.telefone,
      dados.telefone_ddi,
      dados.nascimento,
      dados.cidade,
      dados.estado,
      dados.assinatura_expira_em,
      dados.is_trial,
      dados.mkt_aceito_em,
      dados.ftd_valor,
      dados.ftd_em,
      dinheiroLido.saldo,
      dinheiroLido.saldo_disponivel,
      dinheiroLido.saldo_bonus,
      true,                                             // $19: perfil lido agora
      JSON.stringify(redigir(perfilRes.body)),          // $20
      carteiraRes.ok ? JSON.stringify(redigir(carteiraRes.body)) : null, // $21
      erros,                                            // $22
    ]);

    // Ponto na serie historica. Depois do UPSERT: o retrato de agora ja esta
    // salvo, e `registrarSaldo` nunca lanca — perder um ponto do grafico jamais
    // pode custar um login.
    await registrarSaldo(email, dinheiroLido, 'login');

    platformSyncStats.ok++;
    console.log(`🏦 [plataforma] espelho atualizado: ${email}${erros ? ` (parcial — ${erros})` : ''}`);
    return { ok: true, email, partial: !!erros, perfil: dados, dinheiro: dinheiroLido };
  } catch (err) {
    platformSyncStats.saveErrors++;
    console.error(`⚠️ [plataforma] falha ao gravar espelho de ${email}: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

// ─── Histórico do credit ────────────────────────
//
// `platform_profiles.saldo` é um retrato — cada leitura apaga a anterior. Para
// responder "o que aconteceu com o dinheiro dessa pessoa esta semana" é preciso
// guardar cada leitura, e isso não dá para reconstruir depois.
//
// Tabela: migrations/add_credit_history.sql

// Ponto de vida. Sem ele, quem passa dias com o mesmo saldo teria UM ponto no
// gráfico, e o operador não saberia se o saldo está parado ou se paramos de ler.
const HEARTBEAT_HORAS = Number(process.env.CREDIT_HEARTBEAT_HOURS) || 6;

// Quanto tempo a série do dinheiro sobrevive. Bem mais longa que a da telemetria
// (180 dias): uma linha por MUDANÇA é barata, e este é justamente o dado que só
// fica interessante com meses de acumulado.
export const CREDIT_RETENTION_DAYS = Number(process.env.CREDIT_RETENTION_DAYS) || 730;

export const creditHistoryStats = { gravados: 0, ignorados: 0, erros: 0 };

/**
 * Grava um ponto na série do saldo. Nunca lança.
 *
 * A regra de QUANDO gravar mora dentro do próprio INSERT, e não em duas idas ao
 * banco (ler a última, decidir, gravar): o coletor roda para dezenas de pessoas
 * ao mesmo tempo e dois workers do PM2 podem estar lendo a MESMA pessoa — com a
 * decisão fora da transação, os dois passariam pelo mesmo `if` e gravariam duas
 * linhas idênticas.
 *
 * Grava quando: o valor mudou desde a última leitura, a última leitura já tem
 * mais de `HEARTBEAT_HORAS`, ou não existe leitura nenhuma.
 */
export async function registrarSaldo(email, dinheiroLido, origem = 'login') {
  const clean = String(email || '').trim().toLowerCase();
  const saldo = dinheiroLido?.saldo;

  // Sem saldo não há ponto. Leitura falha já fica registrada em `ultimo_erro`;
  // gravar zero aqui seria inventar um saque que não houve.
  if (!clean || saldo === null || saldo === undefined) return { gravado: false, motivo: 'sem saldo' };

  try {
    const { rows } = await query(
      `WITH ultima AS (
         SELECT saldo, lido_em
           FROM platform_balance_history
          WHERE email = $1
          ORDER BY lido_em DESC
          LIMIT 1
       )
       INSERT INTO platform_balance_history
         (email, saldo, saldo_disponivel, saldo_bonus, delta, origem)
       SELECT $1::varchar, $2::numeric, $3::numeric, $4::numeric,
              -- Delta contra a leitura anterior. NULL na primeira: "não sei a
              -- variação" não é "variação zero", e o painel SOMA deltas para
              -- dizer quanto entrou e quanto saiu no período.
              (SELECT $2::numeric - u.saldo FROM ultima u),
              $5::varchar
        WHERE NOT EXISTS (
          SELECT 1 FROM ultima u
           WHERE u.saldo = $2::numeric
             AND u.lido_em > NOW() - ($6 || ' hours')::interval
        )
       RETURNING id, delta`,
      [clean, saldo, dinheiroLido.saldo_disponivel ?? null, dinheiroLido.saldo_bonus ?? null,
        String(origem).slice(0, 16), String(HEARTBEAT_HORAS)],
    );

    if (rows.length === 0) {
      creditHistoryStats.ignorados++;
      return { gravado: false, motivo: 'sem mudança' };
    }

    creditHistoryStats.gravados++;
    return { gravado: true, delta: rows[0].delta === null ? null : Number(rows[0].delta) };
  } catch (err) {
    creditHistoryStats.erros++;
    console.error(`⚠️ [credit] falha ao gravar histórico de ${clean}: ${err.message}`);
    return { gravado: false, motivo: err.message };
  }
}

// Lê SÓ a carteira e atualiza só o dinheiro. Sem o /profile: nome e CPF não mudam
// de cinco em cinco minutos, e cada requisição evitada é metade da carga que o
// coletor impõe à casa.
//
// COALESCE em `saldo`: leitura vazia não apaga a última boa — não ler não é ler
// zero. `saldo_em` só avança quando houve número: é o carimbo da LEITURA, e
// movê-lo sem valor novo faria o painel exibir saldo velho com cara de fresco.
const SQL_UPDATE_CARTEIRA = `
  UPDATE platform_profiles SET
    saldo            = COALESCE($2::numeric, saldo),
    saldo_disponivel = CASE WHEN $2::numeric IS NULL THEN saldo_disponivel ELSE $3::numeric END,
    saldo_bonus      = CASE WHEN $2::numeric IS NULL THEN saldo_bonus      ELSE $4::numeric END,
    saldo_em         = CASE WHEN $2::numeric IS NULL THEN saldo_em         ELSE NOW() END,
    carteira_em      = NOW(),
    carteira_bruto   = COALESCE($5::jsonb, carteira_bruto),
    ultimo_erro      = $6,
    updated_at       = NOW()
  WHERE email = $1
  RETURNING email`;

/**
 * Re-leitura do saldo de quem JÁ tem espelho. Nunca lança.
 *
 * É o que o coletor chama de 5 em 5 minutos. Pressupõe o perfil capturado no
 * login: se a pessoa ainda não tem linha, não inventa uma a partir da carteira —
 * o /wallet não diz QUEM ela é, e uma linha sem nome nem documento faria a lista
 * do painel ganhar um fantasma.
 */
export async function sincronizarCarteira(email, token, origem = 'coletor') {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !token) {
    platformSyncStats.skipped++;
    return { ok: false, reason: 'sem e-mail ou token' };
  }

  const carteiraRes = await buscarV2('/wallet', token);
  if (!carteiraRes.ok) {
    platformSyncStats.walletErrors++;
    // 401 aqui é rotina: token expirou com a aba aberta. Não suja o espelho.
    return { ok: false, reason: `wallet ${carteiraRes.status}${carteiraRes.error ? ` (${carteiraRes.error})` : ''}` };
  }

  const dinheiroLido = extrairDinheiro(carteiraRes.body);
  if (dinheiroLido.saldo === null) platformSyncStats.semSaldo++;

  const erro = dinheiroLido.saldo === null ? 'wallet sem campo de saldo conhecido' : null;

  try {
    const { rowCount } = await query(SQL_UPDATE_CARTEIRA, [
      clean,
      dinheiroLido.saldo,
      dinheiroLido.saldo_disponivel,
      dinheiroLido.saldo_bonus,
      JSON.stringify(redigir(carteiraRes.body)),
      erro,
    ]);

    // Sem espelho ainda: o próximo login cria a linha, com perfil e tudo.
    if (rowCount === 0) return { ok: false, reason: 'sem espelho — aguardando o próximo login' };

    const ponto = await registrarSaldo(clean, dinheiroLido, origem);
    return { ok: true, email: clean, dinheiro: dinheiroLido, ...ponto };
  } catch (err) {
    platformSyncStats.saveErrors++;
    console.error(`⚠️ [plataforma] falha ao atualizar carteira de ${clean}: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

/**
 * A série do saldo de uma pessoa, mais nova primeiro.
 *
 * O teto de pontos é do gráfico, não do banco: acima disso nenhum pixel novo
 * aparece na ficha e a resposta cresce à toa.
 */
export async function getCreditHistory(email, { days = 90, limit = 500 } = {}) {
  const clean = String(email || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT saldo, saldo_disponivel, saldo_bonus, delta, origem, lido_em
       FROM platform_balance_history
      WHERE email = $1
        AND lido_em > NOW() - ($2 || ' days')::interval
      ORDER BY lido_em DESC
      LIMIT $3`,
    [clean, String(days), Math.min(limit, 2000)],
  );
  return rows;
}

/** Purge por retenção. Roda no mesmo job da telemetria. */
export async function purgeOldCreditHistory() {
  const { rowCount } = await query(
    `DELETE FROM platform_balance_history WHERE lido_em < NOW() - ($1 || ' days')::interval`,
    [String(CREDIT_RETENTION_DAYS)],
  );
  return rowCount;
}

/** Espelho de uma pessoa (ficha do painel). Não devolve os JSONs crus. */
export async function getPlatformProfile(email) {
  const clean = String(email || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT email, brand, externo_id, nome, documento, telefone, telefone_ddi,
            telefone_completo, nascimento, cidade, estado,
            assinatura_expira_em, is_trial, mkt_aceito_em,
            saldo, saldo_disponivel, saldo_bonus, saldo_em, ftd_valor, ftd_em,
            perfil_em, carteira_em, ultimo_erro, updated_at
       FROM platform_profiles WHERE email = $1 LIMIT 1`,
    [clean],
  );
  return rows[0] || null;
}

/**
 * As respostas CRUAS da casa, para o navegador de campos do painel.
 *
 * São centenas de campos entre /profile e /wallet — o espelho só promove a
 * coluna os que sabemos consultar. Quando o operador precisa de um que ficou
 * de fora ("será que tem o CPF?", "de onde saiu esse telefone?"), é aqui que
 * ele está. Já vem redigido do INSERT: nenhum token sai desta rota.
 */
export async function getPlatformRaw(email) {
  const clean = String(email || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT perfil_bruto, perfil_em, carteira_bruto, carteira_em
       FROM platform_profiles WHERE email = $1 LIMIT 1`,
    [clean],
  );
  if (!rows[0]) return null;
  return {
    perfil: rows[0].perfil_bruto,
    perfilEm: rows[0].perfil_em,
    carteira: rows[0].carteira_bruto,
    carteiraEm: rows[0].carteira_em,
  };
}

// ─── Dado pessoal: mascarado por padrao ───────────────────────
//
// O painel guarda CPF e telefone de toda a base. Uma sessao de admin roubada,
// um notebook aberto ou um print num grupo de WhatsApp bastam para vazar isso
// em lote — e CPF nao se troca como se troca uma senha.
//
// Entao a regra e: a LISTA e a FICHA nunca carregam o numero inteiro. O
// suficiente para o suporte reconhecer quem esta do outro lado da linha fica
// visivel; o resto exige um clique proprio, que passa por rota separada, com
// limite estreito e registro nominal de quem revelou o que (ver server.js).
//
// Mascarar so no front seria teatro: o valor ja teria trafegado e estaria no
// devtools de qualquer um. Por isso a mascara nasce aqui, no servidor.

/** 12345678900 -> •••.•••.•••-00 (os 2 ultimos bastam para conferir por telefone). */
export function mascararCpf(digitos) {
  if (!digitos) return null;
  const d = String(digitos);
  if (d.length !== 11) return '•'.repeat(Math.max(0, d.length - 2)) + d.slice(-2);
  return `•••.•••.•••-${d.slice(-2)}`;
}

/** 11988887777 -> 11••••7777. DDD e os 4 ultimos: da para bater, nao para ligar. */
export function mascararTelefone(digitos) {
  if (!digitos) return null;
  const d = String(digitos);
  if (d.length < 7) return '•'.repeat(d.length);
  return `${d.slice(0, 2)}${'•'.repeat(d.length - 6)}${d.slice(-4)}`;
}

/** Aplica a mascara nos campos sensiveis de uma linha do espelho. */
export function mascararLinha(linha) {
  if (!linha) return linha;
  return {
    ...linha,
    documento: mascararCpf(linha.documento),
    telefone: mascararTelefone(linha.telefone),
    // O completo (DDI + numero) so existe para ser colado numa API de mensagem:
    // devolve-lo mascarado nao serve para nada e devolve-lo inteiro anula a
    // mascara do campo ao lado. Some da resposta ate alguem revelar.
    telefone_completo: undefined,
    pii_mascarado: true,
  };
}

/**
 * Os valores INTEIROS de CPF e telefone. Chamada so pela rota de revelacao,
 * que exige admin nominal e deixa registro de quem revelou o que.
 */
export async function getPlatformPii(email) {
  const clean = String(email || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT email, documento, telefone, telefone_ddi, telefone_completo
       FROM platform_profiles WHERE email = $1 LIMIT 1`,
    [clean],
  );
  return rows[0] || null;
}
