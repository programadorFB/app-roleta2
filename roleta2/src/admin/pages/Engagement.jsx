/**
 * Engagement — em que telas as pessoas ficam e a que horas entram.
 *
 * "Hits" é troca de aba, não tempo: mede para onde a atenção vai. O tempo total
 * está na Visão geral, onde ele sai das sessões.
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { adminApi } from '../api.js';
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

// Os mesmos rotulos das abas da navbar (App.jsx). Quem le o painel e quem
// atende o usuario: se a tela se chama "Ferramentas" para ele, tem que se
// chamar "Ferramentas" aqui.
//
// Nao ha 'triggers': os gatilhos de sinal sairam do roleta2 nas Portarias
// SPA/MF 1.964/2026 e Interministerial 73/2026. View desconhecida cai no
// proprio nome cru, entao uma aba nova aparece no grafico antes de alguem
// lembrar de vir aqui.
const NOME_DA_VIEW = {
  dashboard:     'Dashboard',
  tutorial:      'Tutorial',
  gerenciamento: 'Gerenciamento',
  tools:         'Ferramentas',
};

export default function Engagement() {
  const { dados, erro, carregando } = useCarregar(() => adminApi.engagement(14));

  if (carregando) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;

  const views = (dados.views || []).map(v => ({
    ...v,
    nome: NOME_DA_VIEW[v.view] || v.view,
  }));

  // 24 posições fixas: sem isso as horas sem nenhuma sessão sumiriam do eixo e
  // o gráfico daria a impressão de movimento constante.
  const porHora = Array.from({ length: 24 }, (_, h) => ({
    hora: `${String(h).padStart(2, '0')}h`,
    sessions: dados.byHour?.find(x => x.hour === h)?.sessions || 0,
  }));

  return (
    <>
      <h1 className={css.pageTitle}>Engajamento</h1>
      <p className={css.pageSub}>Últimos 14 dias.</p>

      <div className={css.kpiGrid}>
        <div className={css.kpi}>
          <div className={css.kpiLabel}>Aberturas de jogo</div>
          <div className={`${css.kpiValor} ${css.kpiDestaque}`}>{dados.games?.opens || 0}</div>
          <div className={css.kpiNota}>por {dados.games?.users || 0} pessoa(s)</div>
        </div>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Telas mais acessadas</h2>
        {views.length === 0 ? (
          <div className={css.vazio}>Nenhuma navegação registrada ainda.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, views.length * 42)}>
            <BarChart data={views} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" {...EIXO} allowDecimals={false} />
              <YAxis type="category" dataKey="nome" width={120} {...EIXO} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="hits" name="Acessos" fill="#c9a052" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Horário de entrada</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={porHora}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="hora" {...EIXO} interval={1} />
            <YAxis {...EIXO} allowDecimals={false} />
            <Tooltip {...TOOLTIP} />
            <Bar dataKey="sessions" name="Sessões" fill="#4ade80" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={css.card}>
        <h2 className={css.cardTitulo}>Detalhe por tela</h2>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr><th>Tela</th><th>Acessos</th><th>Pessoas</th><th>Acessos por pessoa</th></tr>
            </thead>
            <tbody>
              {views.map(v => (
                <tr key={v.view}>
                  <td>{v.nome}</td>
                  <td>{v.hits}</td>
                  <td>{v.users}</td>
                  <td>{v.users ? (v.hits / v.users).toFixed(1) : '—'}</td>
                </tr>
              ))}
              {views.length === 0 && (
                <tr><td colSpan={4} className={css.vazio}>Sem dados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
