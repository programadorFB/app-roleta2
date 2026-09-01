/**
 * Overview — KPIs de uso e a série dos últimos 30 dias.
 *
 * DAU/WAU/MAU saem das sessões cruas (janela móvel); a série sai do rollup
 * diário. O dia corrente na série é sempre parcial — o rollup roda de hora em
 * hora, então ele cresce ao longo do dia.
 */

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

import { adminApi, formatDuration } from '../api.js';
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

function Kpi({ rotulo, valor, nota, destaque }) {
  return (
    <div className={css.kpi}>
      <div className={css.kpiLabel}>{rotulo}</div>
      <div className={`${css.kpiValor} ${destaque ? css.kpiDestaque : ''}`}>{valor}</div>
      {nota && <div className={css.kpiNota}>{nota}</div>}
    </div>
  );
}

export default function Overview() {
  const { dados, erro, carregando } = useCarregar(() => adminApi.overview());
  const funil = useCarregar(() => adminApi.funnel());

  if (carregando) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;

  const serie = (dados.series || []).map(d => ({
    ...d,
    dia: d.day.slice(5),
    minutos: Math.round(Number(d.total_seconds || 0) / 60),
  }));

  const semDados = serie.every(d => d.dau === 0);
  const f = funil.dados;

  return (
    <>
      <h1 className={css.pageTitle}>Visão geral</h1>
      <p className={css.pageSub}>Uso do app e situação da base.</p>

      {semDados && (
        <div className={css.aviso}>
          A telemetria começou a coletar agora — não há histórico anterior para reconstruir.
          Os números de fluxo e permanência se enchem conforme as pessoas usarem o app;
          retenção por coorte fica realmente legível depois de umas 4 semanas.
          O quadro de assinaturas abaixo, esse já vale desde hoje.
        </div>
      )}

      <div className={css.kpiGrid}>
        <Kpi rotulo="Online agora" valor={dados.online} destaque />
        <Kpi rotulo="Ativos hoje" valor={dados.dau} nota="últimas 24h" />
        <Kpi rotulo="Ativos na semana" valor={dados.wau} nota="últimos 7 dias" />
        <Kpi rotulo="Ativos no mês" valor={dados.mau} nota="últimos 30 dias" />
        <Kpi
          rotulo="Fidelidade"
          valor={`${dados.stickiness}%`}
          nota="do mensal que volta por dia"
        />
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Pessoas por dia</h2>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="dia" {...EIXO} />
            <YAxis {...EIXO} allowDecimals={false} />
            <Tooltip {...TOOLTIP} />
            <Line type="monotone" dataKey="dau" name="Ativos" stroke="#c9a052" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="new_users" name="Novos" stroke="#4ade80" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Tempo total no app, por dia (minutos)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="dia" {...EIXO} />
            <YAxis {...EIXO} />
            <Tooltip {...TOOLTIP} />
            <Bar dataKey="minutos" name="Minutos" fill="#c9a052" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Assinaturas</h2>
        {funil.carregando && <div className={css.vazio}>Carregando…</div>}
        {f && (
          <div className={css.kpiGrid} style={{ marginBottom: 0 }}>
            <Kpi rotulo="Total na base" valor={f.total} />
            <Kpi rotulo="Pagantes" valor={f.pagante} destaque />
            <Kpi rotulo="Em trial" valor={f.trial} />
            <Kpi rotulo="Cancelados" valor={f.cancelado} />
            <Kpi rotulo="Novos (30d)" valor={f.novos_30d} />
            <Kpi
              rotulo="Trials convertidos"
              valor={f.trial_convertido}
              nota={f.trial_convertido === 0 ? 'nenhum registro ainda' : 'viraram pagantes'}
            />
          </div>
        )}
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Permanência média por visita</h2>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr><th>Dia</th><th>Ativos</th><th>Visitas</th><th>Média por visita</th><th>Tempo total</th></tr>
            </thead>
            <tbody>
              {[...serie].reverse().slice(0, 14).map(d => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.dau}</td>
                  <td>{d.sessions}</td>
                  <td>{formatDuration(d.avg_session_seconds)}</td>
                  <td>{formatDuration(Number(d.total_seconds || 0))}</td>
                </tr>
              ))}
              {serie.length === 0 && (
                <tr><td colSpan={5} className={css.vazio}>Sem dados ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
