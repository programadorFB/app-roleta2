/**
 * Users — busca, lista e ficha do usuário, com as ações de gestão.
 *
 * A lista sai de `subscriptions` (a base de identidade do produto) enriquecida
 * com a última sessão. Quem nunca entrou aparece com "—" em vez de sumir: é
 * justamente quem interessa olhar.
 */

import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import {
  adminApi, formatDuration, formatDate, formatMoney, formatCpf, formatPhone, formatAge,
  formatDelta, corDelta, descreverPremium, descreverPlano,
} from '../api.js';
import { useCarregar } from '../useCarregar.js';
import Paginacao from '../Paginacao.jsx';
import UserFinance from './UserFinance.jsx';
import CamposDaCasa from './CamposDaCasa.jsx';
import css from '../Admin.module.css';

const CLASSE_STATUS = {
  active:   css.tagAtivo,
  paid:     css.tagAtivo,
  trialing: css.tagTrial,
  canceled: css.tagCancelado,
};

function TagStatus({ status }) {
  return <span className={CLASSE_STATUS[status] || css.tagCancelado}>{status || '—'}</span>;
}

// ── Premium: quanto falta e de que plano ──────────────

const CLASSE_TOM = {
  ativo:    css.tagAtivo,
  alerta:   css.tagTrial,
  expirado: css.tagExpirado,
  neutro:   css.tagCancelado,
};

/**
 * "12 dias", "3 dias", "expirou há 5 d" — o dado que a lista não tinha.
 *
 * Antes desta coluna, saber se alguém ainda tinha acesso exigia abrir a ficha e
 * comparar a data de vencimento com a de hoje, linha por linha. A conta sai do
 * servidor (ver `dias_restantes` em adminService), então o fuso do navegador não
 * muda a resposta de "vence hoje ou amanhã?".
 */
function SeloPremium({ sub, comData = true }) {
  const { texto, tom, detalhe } = descreverPremium(sub);
  const titulo = [
    sub?.expires_at ? `Vence em ${formatDate(sub.expires_at)}` : 'Sem data de vencimento',
    detalhe,
  ].filter(Boolean).join(' · ');

  return (
    <span className={CLASSE_TOM[tom]} title={comData ? titulo : undefined}>{texto}</span>
  );
}

/** Nome do plano, com o carimbo de quem foi liberado na mão. */
function Plano({ sub }) {
  const { nome, personalizado, origem } = descreverPlano(sub);
  return (
    <>
      <span className={css.nota}>{nome}</span>
      {personalizado && (
        <span
          className={css.tagTrial}
          title={`Plano personalizado — liberado pelo painel${origem ? ` (origem: ${origem})` : ''}`}
        >
          {' '}personalizado
        </span>
      )}
    </>
  );
}

/**
 * O contador grande da ficha. É a primeira coisa que quem atende precisa saber
 * antes de responder qualquer pergunta: essa pessoa tem acesso, e por quanto
 * tempo ainda.
 */
function ContadorPremium({ sub }) {
  const { texto, tom, detalhe } = descreverPremium(sub);
  const dias = sub?.dias_restantes;
  const temNumero = sub?.premium_ativo && dias !== null && dias !== undefined;

  const classe = tom === 'alerta' ? css.contadorNumAlerta
    : tom === 'expirado' ? css.contadorNumExpirado
      : css.contadorNum;

  return (
    <div className={css.contador}>
      <span className={classe}>{temNumero ? dias : texto}</span>
      <span className={css.contadorRotulo}>
        {temNumero
          ? `dia${dias === 1 ? '' : 's'} de premium restante${dias === 1 ? '' : 's'}`
          : (detalhe || 'de premium')}
        {sub?.expires_at && <><br />vence em {formatDate(sub.expires_at)}</>}
      </span>
    </div>
  );
}

// ── Casa de apostas ───────────────────────────────────

/** Dinheiro que pode não ter sido lido. `null` é "não sei", não "R$ 0,00". */
function moeda(valor) {
  return valor === null || valor === undefined ? '—' : formatMoney(Number(valor));
}

function Linha({ rotulo, children }) {
  return <div className={css.linhaInfo}><span>{rotulo}</span><span>{children}</span></div>;
}

/**
 * CPF e telefone chegam MASCARADOS do servidor. Este hook busca os inteiros na
 * rota dedicada — que exige admin nominal, tem limite estreito e grava na
 * auditoria quem revelou o dado de quem.
 *
 * Por isso o botão é explícito em vez de um "mostrar tudo" automático: revelar
 * é um ato, e um ato que fica registrado com o nome de quem o praticou.
 */
function useRevelarPii(email) {
  const [pii, setPii] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const revelar = async () => {
    setCarregando(true);
    setErro('');
    try {
      setPii(await adminApi.pii(email));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  return { pii, revelar, carregando, erro };
}

/**
 * Espelho de /profile e /wallet da casa (API v2), capturado no login.
 *
 * Só leitura, e o saldo vem SEMPRE com a data da leitura: ele é o do último
 * login, não o de agora — a API v2 só responde com o token da própria pessoa,
 * então não há como atualizar isso pelo painel. Um saldo sem carimbo faria o
 * atendimento tratar um retrato de duas semanas atrás como o extrato de hoje.
 */
function CasaDeApostas({ email, plataforma }) {
  const { pii, revelar, carregando, erro } = useRevelarPii(email);

  if (!plataforma) {
    return (
      <div className={css.card}>
        <h2 className={css.cardTitulo}>Casa de apostas</h2>
        <div className={css.vazio}>
          Sem captura ainda — o espelho é preenchido no próximo login desta pessoa.
        </div>
      </div>
    );
  }

  const semSaldo = plataforma.saldo === null || plataforma.saldo === undefined;

  return (
    <div className={css.card}>
      <h2 className={css.cardTitulo}>Casa de apostas{plataforma.brand ? ` · ${plataforma.brand}` : ''}</h2>

      <div className={css.detalheGrid}>
        <div>
          <Linha rotulo="Nome">{plataforma.nome || '—'}</Linha>
          <Linha rotulo="CPF">
            {formatCpf(pii ? pii.documento : plataforma.documento)}
          </Linha>
          <Linha rotulo="Telefone">
            {(() => {
              const completo = pii?.telefone_completo || plataforma.telefone_completo;
              if (completo) return `+${completo}`;
              return formatPhone(pii ? pii.telefone : plataforma.telefone);
            })()}
          </Linha>
          <Linha rotulo="Nascimento">{plataforma.nascimento ? formatDate(plataforma.nascimento) : '—'}</Linha>
          <Linha rotulo="Cidade / UF">
            {[plataforma.cidade, plataforma.estado].filter(Boolean).join(' / ') || '—'}
          </Linha>
          <Linha rotulo="ID na casa">{plataforma.externo_id || '—'}</Linha>
          <Linha rotulo="Aceitou marketing">
            {plataforma.mkt_aceito_em ? formatDate(plataforma.mkt_aceito_em) : '—'}
          </Linha>
        </div>

        <div>
          <Linha rotulo="Saldo">{moeda(plataforma.saldo)}</Linha>
          <Linha rotulo="Disponível">{moeda(plataforma.saldo_disponivel)}</Linha>
          <Linha rotulo="Bônus">{moeda(plataforma.saldo_bonus)}</Linha>
          <Linha rotulo="Saldo lido em">
            {plataforma.saldo_em ? formatDate(plataforma.saldo_em) : '—'}
          </Linha>
          <Linha rotulo="1º depósito (FTD)">
            {moeda(plataforma.ftd_valor)}
            {plataforma.ftd_em ? ` · ${formatDate(plataforma.ftd_em)}` : ''}
          </Linha>
          <Linha rotulo="Trial na casa">
            {plataforma.is_trial === null || plataforma.is_trial === undefined
              ? '—'
              : plataforma.is_trial ? 'sim' : 'não'}
          </Linha>
          <Linha rotulo="Assinatura na casa">
            {plataforma.assinatura_expira_em ? `expira ${formatDate(plataforma.assinatura_expira_em)}` : '—'}
          </Linha>
        </div>
      </div>

      <p className={css.kpiNota} style={{ marginTop: '0.9rem' }}>
        Capturado no login — perfil em {formatDate(plataforma.perfil_em)}
        {plataforma.carteira_em ? ` · carteira em ${formatDate(plataforma.carteira_em)}` : ''}.
        {semSaldo && ' O saldo ainda não foi lido nenhuma vez.'}
        {plataforma.ultimo_erro && ` Última leitura incompleta: ${plataforma.ultimo_erro}.`}
      </p>

      {erro && <div className={css.erro} style={{ marginTop: '0.9rem' }}>{erro}</div>}

      {/* O botão só existe quando o servidor mascarou (ADMIN_MASK_PII=true).
          Com a máscara desligada — o padrão — o painel já mostra o número
          inteiro e não há nada a revelar. */}
      {plataforma.pii_mascarado && !pii && (
        <button
          className={css.buttonGhost}
          onClick={revelar}
          disabled={carregando}
          type="button"
          style={{ width: 'auto', marginTop: '0.4rem' }}
        >
          {carregando ? 'Revelando…' : 'Revelar CPF e telefone'}
        </button>
      )}

      {pii && (
        <p className={css.kpiNota} style={{ marginTop: '0.4rem' }}>
          Dado pessoal revelado — esta consulta ficou registrada na auditoria com o seu nome.
        </p>
      )}
    </div>
  );
}

// ── Credit: a curva do dinheiro na casa ───────────────

const EIXO = { stroke: 'rgba(255,255,255,0.35)', fontSize: 11 };
const TOOLTIP = {
  contentStyle: {
    background: '#14110d',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    fontSize: 12,
  },
};

/**
 * A série do saldo desta pessoa na casa.
 *
 * Cada ponto é uma LEITURA — no login, ou pelo coletor de 5 em 5 minutos
 * enquanto o app está aberto (server/creditCollector.js). Por isso a linha é
 * `stepAfter` e não uma curva: entre duas leituras não se sabe o que aconteceu,
 * e interpolar desenharia uma subida suave onde houve uma aposta seca.
 *
 * Buraco na linha é aba fechada, não saldo parado: a casa só responde o saldo
 * com o token da própria pessoa, então não há como ler quem não está logado.
 */
function CreditoDaCasa({ credito }) {
  if (!credito || credito.leituras === 0) {
    return (
      <div className={css.card}>
        <h2 className={css.cardTitulo}>Flutuação do credit</h2>
        <div className={css.vazio}>
          Sem histórico de saldo ainda. A série começa na próxima vez que esta
          pessoa entrar no app — o saldo só pode ser lido com o token dela.
        </div>
      </div>
    );
  }

  // A consulta devolve do mais novo para o mais antigo; o gráfico anda para a
  // frente no tempo.
  const serie = [...credito.pontos].reverse().map(p => ({
    ...p,
    saldo: Number(p.saldo),
    quando: new Date(p.lido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
  }));

  const ultimos = credito.pontos.slice(0, 12);

  return (
    <div className={css.card}>
      <h2 className={css.cardTitulo}>Flutuação do credit</h2>

      <div className={css.kpiGrid} style={{ marginBottom: '1.2rem' }}>
        <div className={css.kpi}>
          <div className={css.kpiLabel}>Variação no período</div>
          <div className={css.kpiValor} style={{ color: corDelta(credito.variacao) }}>
            {formatDelta(credito.variacao)}
          </div>
          <div className={css.kpiNota}>{credito.leituras} leitura(s)</div>
        </div>
        <div className={css.kpi}>
          <div className={css.kpiLabel}>Pico</div>
          <div className={css.kpiValor}>{formatMoney(credito.pico)}</div>
        </div>
        <div className={css.kpi}>
          <div className={css.kpiLabel}>Fundo</div>
          <div className={css.kpiValor}>{formatMoney(credito.fundo)}</div>
        </div>
        <div className={css.kpi}>
          <div className={css.kpiLabel}>Primeira leitura</div>
          <div className={css.kpiValor} style={{ fontSize: '1rem' }}>{formatDate(credito.primeiraEm)}</div>
          <div className={css.kpiNota}>última há {formatAge(credito.ultimaEm)}</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={serie}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="quando" {...EIXO} minTickGap={40} />
          <YAxis
            {...EIXO}
            width={62}
            tickFormatter={(v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          />
          <Tooltip {...TOOLTIP} formatter={(v) => [formatMoney(v), 'Saldo']} />
          <Line type="stepAfter" dataKey="saldo" name="Saldo" stroke="#c9a052" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <div className={css.tabelaWrap} style={{ marginTop: '1.1rem' }}>
        <table className={css.tabela}>
          <thead>
            <tr><th>Leitura</th><th>Saldo</th><th>Variação</th><th>Bônus</th><th>Origem</th></tr>
          </thead>
          <tbody>
            {ultimos.map((p, i) => (
              <tr key={i}>
                <td>{formatDate(p.lido_em)}</td>
                <td>{formatMoney(p.saldo)}</td>
                <td style={{ color: corDelta(p.delta) }}>{formatDelta(p.delta)}</td>
                <td>{formatMoney(p.saldo_bonus)}</td>
                <td><span className={css.nota}>{p.origem}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ficha ─────────────────────────────────────────────

function Ficha({ email, onVoltar }) {
  const { dados, erro, carregando, recarregar } = useCarregar(() => adminApi.userDetail(email), [email]);
  const [status, setStatus] = useState('active');
  const [dias, setDias] = useState('30');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');

  const aplicar = async () => {
    setSalvando(true);
    setAviso('');
    try {
      await adminApi.setSubscription(email, { status, days: Number(dias) || null });
      setAviso('Assinatura atualizada.');
      recarregar();
    } catch (e) {
      setAviso(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const derrubar = async () => {
    setSalvando(true);
    setAviso('');
    try {
      const r = await adminApi.disconnect(email);
      setAviso(`${r.derrubados} conexão(ões) encerrada(s).`);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const banir = async () => {
    setSalvando(true);
    setAviso('');
    try {
      await adminApi.createBan(email, 'manual');
      setAviso('Usuário banido.');
      recarregar();
    } catch (e) {
      setAviso(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const revogar = async () => {
    setSalvando(true);
    setAviso('');
    try {
      await adminApi.revokeBan(email);
      setAviso('Banimento revogado.');
      recarregar();
    } catch (e) {
      setAviso(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;

  const banAtivo = dados.bans?.find(b => !b.revoked_at && new Date(b.banned_until) > new Date());

  return (
    <>
      <button className={css.voltar} onClick={onVoltar} type="button">← Voltar para a lista</button>

      <h1 className={css.pageTitle}>{dados.email}</h1>
      <p className={css.pageSub}>
        {dados.totalVisits} visita(s) · {formatDuration(dados.totalSeconds)} no app ·
        média de {formatDuration(dados.avgVisitSeconds)} por visita
      </p>

      {aviso && <div className={css.aviso}>{aviso}</div>}

      <div className={css.detalheGrid}>
        <div className={css.card}>
          <h2 className={css.cardTitulo}>Assinatura</h2>
          {dados.subscription ? (
            <>
              <ContadorPremium sub={dados.subscription} />
              <div className={css.linhaInfo}><span>Situação</span><TagStatus status={dados.subscription.status} /></div>
              <div className={css.linhaInfo}>
                <span>Plano</span>
                <span><Plano sub={dados.subscription} /></span>
              </div>
              <div className={css.linhaInfo}><span>Origem</span><span>{dados.subscription.source || '—'}</span></div>
              <div className={css.linhaInfo}><span>Expira em</span><span>{formatDate(dados.subscription.expires_at)}</span></div>
              <div className={css.linhaInfo}><span>Criada em</span><span>{formatDate(dados.subscription.created_at)}</span></div>
              <div className={css.linhaInfo}><span>E-mail no app</span><span>{dados.subscription.main_app_email || '—'}</span></div>
            </>
          ) : (
            <div className={css.vazio}>Sem assinatura registrada.</div>
          )}
        </div>

        <div className={css.card}>
          <h2 className={css.cardTitulo}>Ações</h2>

          <div className={css.acoes} style={{ marginBottom: '1rem' }}>
            <div className={css.acaoCampo}>
              <label className={css.label} htmlFor="ficha-status">Situação</label>
              <select id="ficha-status" className={css.input} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">active</option>
                <option value="trialing">trialing</option>
                <option value="paid">paid</option>
                <option value="canceled">canceled</option>
              </select>
            </div>
            <div className={css.acaoCampo}>
              <label className={css.label} htmlFor="ficha-dias">Dias</label>
              <input
                id="ficha-dias"
                className={css.input}
                type="number"
                value={dias}
                onChange={e => setDias(e.target.value)}
                placeholder="mantém"
              />
            </div>
            <button className={css.acaoBotao} onClick={aplicar} disabled={salvando} type="button">
              Aplicar
            </button>
          </div>

          <div className={css.acoes}>
            <button className={css.buttonGhost} onClick={derrubar} disabled={salvando} type="button">
              Derrubar sessões
            </button>
            {banAtivo ? (
              <button className={css.buttonGhost} onClick={revogar} disabled={salvando} type="button">
                Revogar banimento
              </button>
            ) : (
              <button className={css.buttonDanger} onClick={banir} disabled={salvando} type="button">
                Banir
              </button>
            )}
          </div>

          {banAtivo && (
            <p className={css.kpiNota} style={{ marginTop: '0.85rem' }}>
              Banido até {formatDate(banAtivo.banned_until)} — motivo: {banAtivo.reason}
            </p>
          )}
        </div>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Visitas recentes</h2>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr><th>Entrada</th><th>Duração</th><th>Reconexões</th><th>Plano</th></tr>
            </thead>
            <tbody>
              {dados.visits.map((v, i) => (
                <tr key={i}>
                  <td>{formatDate(v.startedAt)}</td>
                  <td>{formatDuration(v.durationSeconds)}</td>
                  <td>{v.reconnects}</td>
                  <td>{v.isPremium ? 'premium' : 'free'}</td>
                </tr>
              ))}
              {dados.visits.length === 0 && (
                <tr><td colSpan={4} className={css.vazio}>Nunca acessou desde o início da coleta.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CasaDeApostas email={dados.email} plataforma={dados.plataforma} />

      <CreditoDaCasa credito={dados.credito} />

      <CamposDaCasa email={dados.email} />

      <UserFinance financeiro={dados.financeiro} />

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Mudanças de assinatura</h2>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr><th>Quando</th><th>De</th><th>Para</th><th>Origem</th></tr>
            </thead>
            <tbody>
              {dados.statusHistory.map((h, i) => (
                <tr key={i}>
                  <td>{formatDate(h.created_at)}</td>
                  <td>{h.from_status || '—'}</td>
                  <td>{h.to_status}</td>
                  <td>{h.triggered_by}</td>
                </tr>
              ))}
              {dados.statusHistory.length === 0 && (
                <tr><td colSpan={4} className={css.vazio}>Sem mudanças registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Filtros ───────────────────────────────────────────

const FILTROS_VAZIOS = {
  status: '', banido: '', comBanca: '', sessoesMin: '', saldoMin: '', acesso: '', premium: '',
};

/**
 * Barra de filtros da listagem.
 *
 * Aplica no submit, não a cada tecla: cada consulta faz três LATERAL joins
 * sobre app_sessions, access_bans e gerenciamento_transactions — disparar isso
 * por caractere digitado sairia caro com a base inteira.
 */
function Filtros({ valores, onAplicar, onLimpar, ativos }) {
  const [local, setLocal] = useState(valores);

  const campo = (k) => ({
    value: local[k],
    onChange: (e) => setLocal({ ...local, [k]: e.target.value }),
    className: css.input,
  });

  const submeter = (e) => {
    e.preventDefault();
    onAplicar(local);
  };

  const limpar = () => {
    setLocal(FILTROS_VAZIOS);
    onLimpar();
  };

  return (
    <form className={css.card} onSubmit={submeter} style={{ marginBottom: '1.25rem' }}>
      <div className={css.filtrosGrid}>
        <div>
          <label className={css.label} htmlFor="f-status">Situação</label>
          <select id="f-status" {...campo('status')}>
            <option value="">todas</option>
            <option value="active">active</option>
            <option value="trialing">trialing</option>
            <option value="paid">paid</option>
            <option value="canceled">canceled</option>
            <option value="pending">pending</option>
          </select>
        </div>

        {/* Situação do premium, que não é a mesma coisa que a situação da
            assinatura: uma linha `active` com vencimento no passado aparece
            como active na coluna ao lado e não dá acesso nenhum. */}
        <div>
          <label className={css.label} htmlFor="f-premium">Premium</label>
          <select id="f-premium" {...campo('premium')}>
            <option value="">qualquer</option>
            <option value="ativo">com acesso</option>
            <option value="expirando">vence em 7 dias</option>
            <option value="expirado">sem acesso</option>
            <option value="vitalicio">sem prazo</option>
          </select>
        </div>

        <div>
          <label className={css.label} htmlFor="f-acesso">Último acesso</label>
          <select id="f-acesso" {...campo('acesso')}>
            <option value="">qualquer</option>
            <option value="nunca">nunca acessou</option>
            <option value="7d">últimos 7 dias</option>
            <option value="30d">últimos 30 dias</option>
            <option value="sumiu">sumiu (+30 dias)</option>
          </select>
        </div>

        <div>
          <label className={css.label} htmlFor="f-banca">Banca</label>
          <select id="f-banca" {...campo('comBanca')}>
            <option value="">qualquer</option>
            <option value="sim">tem banca</option>
            <option value="nao">sem banca</option>
          </select>
        </div>

        <div>
          <label className={css.label} htmlFor="f-saldo">Saldo mínimo (R$)</label>
          <input id="f-saldo" type="number" placeholder="qualquer" {...campo('saldoMin')} />
        </div>

        <div>
          <label className={css.label} htmlFor="f-sessoes">Sessões (mín.)</label>
          <input id="f-sessoes" type="number" placeholder="qualquer" {...campo('sessoesMin')} />
        </div>

        <div>
          <label className={css.label} htmlFor="f-banido">Banimento</label>
          <select id="f-banido" {...campo('banido')}>
            <option value="">qualquer</option>
            <option value="sim">só banidos</option>
            <option value="nao">sem banimento</option>
          </select>
        </div>
      </div>

      <div className={css.acoes} style={{ marginTop: '1rem' }}>
        <button className={css.acaoBotao} type="submit">Filtrar</button>
        {ativos > 0 && (
          <button className={css.buttonGhost} onClick={limpar} type="button">
            Limpar {ativos} filtro(s)
          </button>
        )}
      </div>
    </form>
  );
}

/** Cabeçalho clicável que ordena pela coluna. */
function ColunaOrdenavel({ chave, atual, direcao, onOrdenar, children }) {
  const ativa = atual === chave;
  return (
    <th
      onClick={() => onOrdenar(chave)}
      className={css.thOrdenavel}
      title={`Ordenar por ${String(children).toLowerCase()}`}
    >
      {children}
      <span className={ativa ? css.setaAtiva : css.seta}>
        {ativa ? (direcao === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}

// ── Cadastro ──────────────────────────────────────────

/**
 * Dá acesso a alguém que ainda não está na base.
 *
 * Usa a mesma rota do ajuste de assinatura: o backend faz upsert, então criar e
 * editar são a mesma operação. O campo de e-mail de login existe porque o
 * acesso é resolvido por `email OU main_app_email` — quando a pessoa paga com
 * um endereço e entra no app com outro, sem preencher isso ela é cadastrada e
 * mesmo assim não consegue entrar.
 */
function NovoUsuario({ onCancelar, onCriado }) {
  const [email, setEmail] = useState('');
  const [emailLogin, setEmailLogin] = useState('');
  const [status, setStatus] = useState('active');
  const [plano, setPlano] = useState('');
  const [dias, setDias] = useState('30');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await adminApi.criarUsuario(email.trim().toLowerCase(), {
        status,
        days: Number(dias) || null,
        planName: plano.trim() || undefined,
        mainAppEmail: emailLogin.trim() ? emailLogin.trim().toLowerCase() : undefined,
      });
      onCriado(email.trim().toLowerCase());
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <button className={css.voltar} onClick={onCancelar} type="button">← Voltar para a lista</button>

      <h1 className={css.pageTitle}>Adicionar usuário</h1>
      <p className={css.pageSub}>Cria a assinatura e libera o acesso na hora.</p>

      {erro && <div className={css.erro}>{erro}</div>}

      <form className={css.card} onSubmit={salvar} style={{ maxWidth: 520 }}>
        <div className={css.field}>
          <label className={css.label} htmlFor="novo-email">E-mail *</label>
          <input
            id="novo-email"
            className={css.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="novo-email-login">
            E-mail de login no app (se for diferente)
          </label>
          <input
            id="novo-email-login"
            className={css.input}
            type="email"
            value={emailLogin}
            onChange={e => setEmailLogin(e.target.value)}
            placeholder="deixe vazio se for o mesmo"
          />
        </div>

        <div className={css.acoes} style={{ marginBottom: '1rem' }}>
          <div className={css.acaoCampo}>
            <label className={css.label} htmlFor="novo-status">Situação</label>
            <select id="novo-status" className={css.input} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="active">active</option>
              <option value="trialing">trialing</option>
              <option value="paid">paid</option>
              <option value="canceled">canceled</option>
            </select>
          </div>
          <div className={css.acaoCampo}>
            <label className={css.label} htmlFor="novo-dias">Dias de acesso</label>
            <input
              id="novo-dias"
              className={css.input}
              type="number"
              value={dias}
              onChange={e => setDias(e.target.value)}
            />
          </div>
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="novo-plano">Plano</label>
          <input
            id="novo-plano"
            className={css.input}
            value={plano}
            onChange={e => setPlano(e.target.value)}
            placeholder="Ajuste manual"
          />
        </div>

        <button className={css.button} type="submit" disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar e liberar acesso'}
        </button>
      </form>
    </>
  );
}

// ── Lista ─────────────────────────────────────────────

const POR_PAGINA_PADRAO = 50;

export default function Users() {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [pagina, setPagina] = useState(0);
  // Quantas linhas por vez. Fica no estado (e não numa constante) porque
  // "conferir 200 de uma vez" e "folhear de 25 em 25" são dois modos de uso
  // diferentes da mesma tela.
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO);
  const [selecionado, setSelecionado] = useState(null);
  const [criando, setCriando] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [ordenarPor, setOrdenarPor] = useState('ultimo_acesso');
  const [direcao, setDirecao] = useState('desc');

  const chaveDosFiltros = JSON.stringify(filtros);

  const { dados, erro, carregando } = useCarregar(
    () => adminApi.users({
      search: termo,
      limit: porPagina,
      offset: pagina * porPagina,
      ordenarPor,
      direcao,
      ...filtros,
    }),
    [termo, pagina, porPagina, ordenarPor, direcao, chaveDosFiltros],
  );

  // Trocar o tamanho volta para a primeira página: manter a página 7 ao passar
  // de 25 para 200 por página jogaria o operador para o fim da lista sem aviso.
  const trocarTamanho = (n) => { setPagina(0); setPorPagina(n); };

  // Busca no submit, não a cada tecla: cada consulta faz três LATERAL joins
  // sobre app_sessions, access_bans e gerenciamento_transactions, e disparar
  // isso por caractere não se paga.
  const buscar = (e) => {
    e.preventDefault();
    setPagina(0);          // termo novo recomeça da primeira página
    setTermo(busca);
  };

  const aplicarFiltros = (novos) => { setPagina(0); setFiltros(novos); };
  const limparFiltros  = () => { setPagina(0); setFiltros(FILTROS_VAZIOS); };

  // Clicar na coluna já ordenada inverte a direção; em outra, começa desc —
  // que é o que se quer em quase toda coluna aqui (maior saldo, mais sessões,
  // acesso mais recente).
  const ordenar = (chave) => {
    setPagina(0);
    if (chave === ordenarPor) {
      setDirecao(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenarPor(chave);
      setDirecao('desc');
    }
  };

  const filtrosAtivos = Object.values(filtros).filter(v => v !== '').length;

  if (selecionado) {
    return <Ficha email={selecionado} onVoltar={() => setSelecionado(null)} />;
  }

  if (criando) {
    return (
      <NovoUsuario
        onCancelar={() => setCriando(false)}
        onCriado={(email) => { setCriando(false); setSelecionado(email); }}
      />
    );
  }

  const total = dados?.total ?? 0;

  return (
    <>
      <h1 className={css.pageTitle}>Usuários</h1>
      <p className={css.pageSub}>
        {dados ? `${total.toLocaleString('pt-BR')} pessoa(s) na base` : 'Carregando…'}
        {' · clique numa linha para abrir a ficha'}
      </p>

      <div className={css.acoes} style={{ marginBottom: '1rem' }}>
        <form onSubmit={buscar} style={{ flex: 1, minWidth: 200 }}>
          <input
            className={css.busca}
            style={{ marginBottom: 0 }}
            placeholder="E-mail, nome, CPF ou telefone… (Enter)"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </form>
        <button className={css.acaoBotao} onClick={() => setCriando(true)} type="button">
          + Adicionar usuário
        </button>
      </div>

      <Filtros
        valores={filtros}
        onAplicar={aplicarFiltros}
        onLimpar={limparFiltros}
        ativos={filtrosAtivos}
      />

      {erro && <div className={css.erro}>{erro}</div>}

      <div className={css.card}>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr>
                <ColunaOrdenavel chave="email" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>E-mail</ColunaOrdenavel>
                <ColunaOrdenavel chave="nome" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>Nome</ColunaOrdenavel>
                <th>CPF</th>
                <th>Telefone</th>
                <ColunaOrdenavel chave="ftd" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>Depositou</ColunaOrdenavel>
                <ColunaOrdenavel chave="casa" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>Saldo</ColunaOrdenavel>
                <ColunaOrdenavel chave="premium" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>Premium</ColunaOrdenavel>
                <ColunaOrdenavel chave="status" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>Plano</ColunaOrdenavel>
                <ColunaOrdenavel chave="ultimo_acesso" atual={ordenarPor} direcao={direcao} onOrdenar={ordenar}>Último acesso</ColunaOrdenavel>
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td colSpan={9} className={css.vazio}>Carregando…</td></tr>}

              {dados?.users.map(u => (
                <tr key={u.email} className={css.linhaClicavel} onClick={() => setSelecionado(u.email)}>
                  <td className={css.celulaLonga} title={u.email}>
                    {u.email}{' '}
                    {u.banido && <span className={css.tagBanido}>banido</span>}
                  </td>

                  <td className={css.celulaLonga}>
                    {u.nome || '—'}
                    {(u.cidade || u.estado) && (
                      <span className={css.nota}> · {[u.cidade, u.estado].filter(Boolean).join('/')}</span>
                    )}
                  </td>

                  <td>{formatCpf(u.documento)}</td>

                  {/* O `title` carrega o número INTEIRO, com DDI e sem pontuação:
                      é o que se cola numa API de mensagem, e o operador copia daqui
                      sem montar o 55 na mão. */}
                  <td title={u.telefone_completo ? `+${u.telefone_completo}` : ''}>
                    {formatPhone(u.telefone)}
                  </td>

                  {/* FTD — o primeiro depósito na casa. Travessão aqui significa
                      "nunca depositou", e é o corte que separa curioso de cliente. */}
                  <td title={u.ftd_em ? `Primeiro depósito em ${formatDate(u.ftd_em)}` : 'Nunca depositou'}>
                    {moeda(u.ftd_valor)}
                  </td>

                  {/* Saldo com a IDADE da leitura ao lado. O número mora na casa e
                      só é relido quando a pessoa entra no app: sem a idade, o
                      operador agiria em cima de um saldo de duas semanas atrás
                      achando que é o de agora. */}
                  <td title={u.saldo_em ? `Lido em ${formatDate(u.saldo_em)}` : 'Nunca lido'}>
                    {moeda(u.saldo_casa)}
                    {u.saldo_casa != null && formatAge(u.saldo_em) && (
                      <span className={css.nota}> · {formatAge(u.saldo_em)}</span>
                    )}
                  </td>

                  {/* Dias de premium restantes. É a coluna que responde, sem
                      abrir ficha nenhuma, quem está prestes a cair. */}
                  <td><SeloPremium sub={u} /></td>

                  <td>
                    <TagStatus status={u.status} />{' '}
                    <Plano sub={u} />
                    {/* Trial da CASA, não nosso: quem está em teste grátis lá não é
                        pagante em lugar nenhum. */}
                    {u.is_trial && (
                      <span className={css.tagTrial} title="Em teste grátis na casa"> trial casa</span>
                    )}
                    {/* Aceite de marketing NA CASA: é o que sustenta juridicamente
                        um disparo. Sem o selo, a linha não entra em campanha. */}
                    {u.mkt_aceito_em && (
                      <span className={css.tagAtivo} title={`Aceitou marketing em ${formatDate(u.mkt_aceito_em)}`}> mkt</span>
                    )}
                  </td>

                  <td>{u.last_seen ? formatDate(u.last_seen) : '—'}</td>
                </tr>
              ))}

              {dados?.users.length === 0 && (
                <tr><td colSpan={9} className={css.vazio}>Nenhum usuário encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* A base tem mais de mil assinaturas: com "anterior/próxima" apenas,
            chegar na última página custava trinta cliques. */}
        <Paginacao
          pagina={pagina}
          porPagina={porPagina}
          total={total}
          carregando={carregando}
          onPagina={setPagina}
          onPorPagina={trocarTamanho}
          rotuloItens="pessoas"
        />
      </div>
    </>
  );
}
