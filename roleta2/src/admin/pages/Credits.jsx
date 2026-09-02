/**
 * Credits — a flutuação do dinheiro que as pessoas têm na casa.
 *
 * O QUE ESTA TELA MOSTRA (e o que ela não mostra)
 * ──────────────────────────────────────────────
 * Só quem foi LIDO. O saldo na casa só pode ser consultado com o token da
 * própria pessoa, então o coletor (`server/creditCollector.js`) lê de 5 em 5
 * minutos quem está com o app aberto, e mais ninguém. "R$ 40 mil em carteira"
 * é o total de quem apareceu, nunca o total da base — e a tela diz isso em
 * texto, porque essa é a leitura errada mais fácil de fazer aqui.
 *
 * POR QUE SOMA DE DELTAS, E NÃO DIFERENÇA DE SALDOS
 * ────────────────────────────────────────────────
 * O gráfico do dia soma as VARIAÇÕES de cada pessoa. Uma que ganhou R$ 100 e
 * outra que perdeu R$ 100 aparecem as duas — uma barra para cima e uma para
 * baixo. Pela diferença do saldo total elas se anulariam, e um dia de muito
 * movimento pareceria um dia parado.
 */

import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

import { adminApi, formatMoney, formatDelta, corDelta, formatDate, formatAge } from '../api.js';
import { useCarregar } from '../useCarregar.js';
import css from '../Admin.module.css';

const EIXO = { stroke: 'rgba(255,255,255,0.35)', fontSize: 11 };
const TOOLTIP = {
  contentStyle: {
    background: '#14110d',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    fontSize: 12,
  },
};

// Verde sobe, vermelho desce — as mesmas cores que a ficha do usuário já usa
// para ganho e perda. A cor sozinha não carrega o significado: entrada e saída
// também estão separadas pela POSIÇÃO (acima e abaixo do zero), que é o que
// mantém o gráfico legível para quem não distingue as duas.
const VERDE = '#4ade80';
const VERMELHO = '#f87171';
const OURO = '#c9a052';

const JANELAS = [
  { dias: 7,  rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

/** R$ 1.234,56 -> "1,2 mil" no eixo. Eixo com valor inteiro rouba a metade da largura do gráfico. */
function eixoDinheiro(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  const sinal = n < 0 ? '−' : '';
  if (abs >= 1000) return `${sinal}${(abs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${sinal}${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function Kpi({ rotulo, valor, nota, cor, destaque }) {
  return (
    <div className={css.kpi}>
      <div className={css.kpiLabel}>{rotulo}</div>
      <div
        className={`${css.kpiValor} ${destaque ? css.kpiDestaque : ''}`}
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </div>
      {nota && <div className={css.kpiNota}>{nota}</div>}
    </div>
  );
}

/** Tabela de quem mais subiu ou mais caiu no período. */
function Ranking({ titulo, linhas, nota }) {
  return (
    <div className={css.card}>
      <h2 className={css.cardTitulo}>{titulo}</h2>
      <div className={css.tabelaWrap}>
        <table className={css.tabela}>
          <thead>
            <tr><th>Pessoa</th><th>Variação</th><th>Saldo agora</th><th>Leituras</th><th>Última</th></tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.email}>
                <td className={css.celulaLonga} title={l.email}>
                  {l.nome || l.email}
                  {l.nome && <span className={css.nota}> · {l.email}</span>}
                </td>
                <td style={{ color: corDelta(l.variacao), fontVariantNumeric: 'tabular-nums' }}>
                  {formatDelta(l.variacao)}
                </td>
                <td>{formatMoney(l.saldo_atual)}</td>
                <td>{l.leituras}</td>
                <td title={formatDate(l.ultima_em)}>{formatAge(l.ultima_em) || '—'}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={5} className={css.vazio}>{nota}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Credits() {
  const [dias, setDias] = useState(30);
  const { dados, erro, carregando } = useCarregar(() => adminApi.credit(dias), [dias]);

  if (carregando && !dados) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;
  if (!dados) return null;

  const { agora, periodo, faixas, altas, quedas, cobertura, coletor } = dados;

  const serie = (dados.serie || []).map(d => ({
    ...d,
    // dd/mm: o ano é o mesmo em toda a série e só rouba espaço do eixo.
    dia: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7),
  }));

  const semSerie = serie.length === 0;

  return (
    <>
      <h1 className={css.pageTitle}>Créditos</h1>
      <p className={css.pageSub}>
        Flutuação do saldo das pessoas na casa de apostas, lido de 5 em 5 minutos
        de quem está com o app aberto.
      </p>

      {/* Filtro de período em cima dos gráficos: é o único controle da tela e
          vale para todos eles ao mesmo tempo. */}
      <div className={css.acoes} style={{ marginBottom: '1.25rem' }}>
        {JANELAS.map(j => (
          <button
            key={j.dias}
            className={j.dias === dias ? css.acaoBotao : css.buttonGhost}
            onClick={() => setDias(j.dias)}
            type="button"
            style={{ width: 'auto' }}
          >
            {j.rotulo}
          </button>
        ))}
      </div>

      {semSerie && (
        <div className={css.aviso}>
          Ainda não há série de saldo neste período. O histórico começa a se
          formar quando as pessoas entram no app — cada leitura só é possível com
          o token de quem está logado, então o coletor não alcança quem está com
          a aba fechada.
        </div>
      )}

      <div className={css.kpiGrid}>
        <Kpi
          rotulo="Em carteira (lido)"
          valor={formatMoney(agora.total)}
          nota={`${agora.pessoas} pessoa(s) com saldo conhecido`}
          destaque
        />
        <Kpi rotulo="Saldo médio" valor={formatMoney(agora.media)} nota={`mediana ${formatMoney(agora.mediana)}`} />
        <Kpi
          rotulo="Zerados"
          valor={agora.zerados}
          nota={agora.pessoas ? `${Math.round((agora.zerados / agora.pessoas) * 100)}% dos lidos` : null}
        />
        <Kpi
          rotulo={`Entrou (${dias}d)`}
          valor={formatMoney(periodo.entradas)}
          cor={VERDE}
          nota="soma das altas de saldo"
        />
        <Kpi
          rotulo={`Saiu (${dias}d)`}
          valor={formatMoney(Math.abs(periodo.saidas))}
          cor={VERMELHO}
          nota="soma das quedas de saldo"
        />
        <Kpi
          rotulo="Resultado líquido"
          valor={formatDelta(periodo.liquido)}
          cor={corDelta(periodo.liquido)}
          nota="quanto a base ganhou ou perdeu"
        />
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Entradas e saídas por dia</h2>
        <p className={css.kpiNota} style={{ marginTop: 0, marginBottom: '0.9rem' }}>
          Soma das variações de saldo de cada pessoa. Para cima, dinheiro que
          entrou; para baixo, dinheiro que saiu.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={serie} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="dia" {...EIXO} />
            <YAxis {...EIXO} tickFormatter={eixoDinheiro} width={62} />
            <Tooltip
              {...TOOLTIP}
              formatter={(v, nome) => [formatMoney(Math.abs(Number(v))), nome]}
              labelFormatter={(d) => `Dia ${d}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* O zero precisa ser visível: é ele que separa ganho de perda, e
                sem a linha as barras curtas de cada lado se parecem. */}
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            <Bar dataKey="entradas" name="Entrou" fill={VERDE} radius={[3, 3, 0, 0]} />
            <Bar dataKey="saidas"   name="Saiu"   fill={VERMELHO} radius={[0, 0, 3, 3]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Saldo médio de quem foi lido</h2>
        <p className={css.kpiNota} style={{ marginTop: 0, marginBottom: '0.9rem' }}>
          Média por leitura do dia — sobe quando quem tem mais dinheiro está
          online, não só quando alguém ganha.
        </p>
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="dia" {...EIXO} />
            <YAxis {...EIXO} tickFormatter={eixoDinheiro} width={62} />
            <Tooltip
              {...TOOLTIP}
              formatter={(v) => [formatMoney(v), 'Saldo médio']}
              labelFormatter={(d) => `Dia ${d}`}
            />
            <Line type="monotone" dataKey="saldo_medio" name="Saldo médio" stroke={OURO} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Quanto cada um tem agora</h2>
        <p className={css.kpiNota} style={{ marginTop: 0, marginBottom: '0.9rem' }}>
          Última leitura conhecida de cada pessoa, por faixa de saldo.
        </p>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={faixas} layout="vertical" margin={{ left: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis type="number" {...EIXO} allowDecimals={false} />
            <YAxis type="category" dataKey="nome" {...EIXO} width={118} />
            <Tooltip
              {...TOOLTIP}
              formatter={(v, _n, item) => [`${v} pessoa(s) · ${formatMoney(item.payload.total)}`, 'Nesta faixa']}
            />
            <Bar dataKey="pessoas" name="Pessoas" fill={OURO} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={css.detalheGrid}>
        <Ranking
          titulo={`Maiores altas (${dias}d)`}
          linhas={altas}
          nota="Ninguém subiu de saldo no período."
        />
        <Ranking
          titulo={`Maiores quedas (${dias}d)`}
          linhas={quedas}
          nota="Ninguém caiu de saldo no período."
        />
      </div>

      {/* Sem isto, uma linha reta no gráfico é ambígua: pode ser o dinheiro
          parado ou o coletor fora do ar. */}
      <div className={css.card}>
        <h2 className={css.cardTitulo}>Coletor</h2>
        <div className={css.detalheGrid}>
          <div>
            <div className={css.linhaInfo}><span>Pontos no período</span><span>{cobertura.pontos}</span></div>
            <div className={css.linhaInfo}><span>Pessoas com histórico</span><span>{cobertura.pessoas}</span></div>
            <div className={css.linhaInfo}>
              <span>Origem dos pontos</span>
              <span>{cobertura.do_coletor} do coletor · {cobertura.do_login} de login</span>
            </div>
            <div className={css.linhaInfo}>
              <span>Último ponto</span>
              <span title={formatDate(cobertura.ultimo_ponto)}>
                {cobertura.ultimo_ponto ? `há ${formatAge(cobertura.ultimo_ponto)}` : 'nenhum'}
              </span>
            </div>
          </div>
          <div>
            <div className={css.linhaInfo}><span>Carteiras lidas em 24h</span><span>{agora.lidos_24h}</span></div>
            <div className={css.linhaInfo}><span>Varreduras deste worker</span><span>{coletor?.ciclos ?? '—'}</span></div>
            <div className={css.linhaInfo}>
              <span>Última varredura</span>
              <span title={formatDate(coletor?.ultimoCiclo)}>
                {coletor?.ultimoCiclo ? `há ${formatAge(coletor.ultimoCiclo)} · ${coletor.ultimoTotal} pessoa(s)` : '—'}
              </span>
            </div>
            <div className={css.linhaInfo}><span>Falhas de leitura</span><span>{coletor?.falhas ?? '—'}</span></div>
          </div>
        </div>
        <p className={css.kpiNota} style={{ marginTop: '0.9rem' }}>
          Os contadores do coletor são deste worker do PM2 — cada um varre as
          próprias conexões, então o número real do cluster é maior. A leitura só
          acontece com a pessoa logada: buraco no gráfico é app fechado, não
          saldo parado.
        </p>
      </div>
    </>
  );
}
