/**
 * UserFinance — o que o módulo de Gerenciamento sabe sobre a pessoa.
 *
 * Só leitura. Quem escreve nessas tabelas é o backend do gerenciamento; o
 * painel mostra para dar contexto ao suporte ("esse assinante usa mesmo a
 * ferramenta?", "ele está no vermelho?"), não para editar banca de ninguém.
 */

import React from 'react';

import { formatMoney, formatDuration, formatDate } from '../api.js';
import css from '../Admin.module.css';

const RISCO = { 1: 'Conservador', 2: 'Moderado', 3: 'Arrojado', 4: 'Agressivo', 5: 'Máximo' };

function Kpi({ rotulo, valor, nota, cor }) {
  return (
    <div className={css.kpi}>
      <div className={css.kpiLabel}>{rotulo}</div>
      <div className={css.kpiValor} style={cor ? { color: cor } : undefined}>{valor}</div>
      {nota && <div className={css.kpiNota}>{nota}</div>}
    </div>
  );
}

export default function UserFinance({ financeiro }) {
  if (!financeiro) return null;

  const {
    saldoAtual, bancaInicial, totaisPorTipo = {}, perfil, objetivos = [],
    sessoes = [], estatisticas = [], transacoes = [], preferencias, temDados,
  } = financeiro;

  const ganhos = totaisPorTipo.gains?.total || 0;
  const perdas = totaisPorTipo.losses?.total || 0;
  const resultado = ganhos - perdas;

  if (!temDados) {
    return (
      <div className={css.card}>
        <h2 className={css.cardTitulo}>Gerenciamento de banca</h2>
        <div className={css.vazio}>
          Esta pessoa nunca usou o módulo de gerenciamento — nenhuma banca, transação ou objetivo.
        </div>
      </div>
    );
  }

  return (
    <>
      {temDados && (
        <>
          <div className={css.kpiGrid}>
            <Kpi rotulo="Saldo atual" valor={formatMoney(saldoAtual)} destaque />
            <Kpi rotulo="Banca inicial" valor={formatMoney(bancaInicial)} />
            <Kpi
              rotulo="Ganhos"
              valor={formatMoney(ganhos)}
              nota={`${totaisPorTipo.gains?.n || 0} lançamento(s)`}
              cor="#4ade80"
            />
            <Kpi
              rotulo="Perdas"
              valor={formatMoney(perdas)}
              nota={`${totaisPorTipo.losses?.n || 0} lançamento(s)`}
              cor="#f87171"
            />
            <Kpi
              rotulo="Resultado"
              valor={formatMoney(resultado)}
              cor={resultado >= 0 ? '#4ade80' : '#f87171'}
            />
          </div>

          {perfil && (
            <div className={css.card}>
              <h2 className={css.cardTitulo}>Perfil de investimento</h2>
              <div className={css.linhaInfo}><span>Perfil</span><span>{perfil.title || perfil.profile_type || '—'}</span></div>
              <div className={css.linhaInfo}><span>Nível de risco</span><span>{RISCO[perfil.risk_level] || perfil.risk_level || '—'}</span></div>
              <div className={css.linhaInfo}><span>Banca inicial</span><span>{formatMoney(perfil.initial_balance)}</span></div>
              <div className={css.linhaInfo}><span>Stop loss</span><span>{formatMoney(perfil.stop_loss)}{perfil.stop_loss_percentage ? ` (${perfil.stop_loss_percentage}%)` : ''}</span></div>
              <div className={css.linhaInfo}><span>Meta de lucro</span><span>{formatMoney(perfil.profit_target)}</span></div>
              <div className={css.linhaInfo}><span>Ativo</span><span>{perfil.is_active ? 'sim' : 'não'}</span></div>
            </div>
          )}

          {objetivos.length > 0 && (
            <div className={css.card}>
              <h2 className={css.cardTitulo}>Objetivos ({objetivos.length})</h2>
              <div className={css.tabelaWrap}>
                <table className={css.tabela}>
                  <thead>
                    <tr><th>Objetivo</th><th>Meta</th><th>Acumulado</th><th>Progresso</th><th>Prazo</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {objetivos.map((o, i) => {
                      const pct = o.target_amount > 0
                        ? Math.round((Number(o.current_amount || 0) / Number(o.target_amount)) * 100)
                        : null;
                      return (
                        <tr key={i}>
                          <td>{o.title}</td>
                          <td>{formatMoney(o.target_amount)}</td>
                          <td>{formatMoney(o.current_amount)}</td>
                          <td>{pct !== null ? `${pct}%` : '—'}</td>
                          <td>{o.target_date || '—'}</td>
                          <td>
                            {o.is_achieved
                              ? <span className={css.tagAtivo}>alcançado</span>
                              : <span className={css.tagTrial}>{o.status || 'em curso'}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sessoes.length > 0 && (
            <div className={css.card}>
              <h2 className={css.cardTitulo}>Sessões de aposta ({sessoes.length})</h2>
              <div className={css.tabelaWrap}>
                <table className={css.tabela}>
                  <thead>
                    <tr>
                      <th>Início</th><th>Jogo</th><th>Entrou com</th><th>Saiu com</th>
                      <th>Resultado</th><th>Apostas</th><th>Duração</th><th>Encerrou por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessoes.map((s, i) => (
                      <tr key={i}>
                        <td>{formatDate(s.started_at)}</td>
                        <td>{s.game_type || '—'}</td>
                        <td>{formatMoney(s.start_balance)}</td>
                        <td>{formatMoney(s.end_balance)}</td>
                        <td style={{ color: Number(s.net_result) >= 0 ? '#4ade80' : '#f87171' }}>
                          {formatMoney(s.net_result)}
                        </td>
                        <td>{s.total_bets} ({s.winning_bets}V/{s.losing_bets}D)</td>
                        <td>{formatDuration(s.duration_seconds)}</td>
                        <td>
                          {s.stop_loss_hit ? 'stop loss' : s.profit_target_hit ? 'meta batida' : (s.status || '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {estatisticas.length > 0 && (
            <div className={css.card}>
              <h2 className={css.cardTitulo}>Estatísticas por período</h2>
              <div className={css.tabelaWrap}>
                <table className={css.tabela}>
                  <thead>
                    <tr>
                      <th>Período</th><th>Abriu</th><th>Fechou</th><th>Resultado</th>
                      <th>Sessões</th><th>Acerto</th><th>Maior queda</th><th>Maior lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estatisticas.map((e, i) => (
                      <tr key={i}>
                        <td>{e.period_date} ({e.period_type})</td>
                        <td>{formatMoney(e.starting_balance)}</td>
                        <td>{formatMoney(e.ending_balance)}</td>
                        <td style={{ color: Number(e.net_profit_loss) >= 0 ? '#4ade80' : '#f87171' }}>
                          {formatMoney(e.net_profit_loss)}
                        </td>
                        <td>{e.total_sessions} ({e.winning_sessions}V/{e.losing_sessions}D)</td>
                        <td>{e.win_rate !== null ? `${Number(e.win_rate).toFixed(1)}%` : '—'}</td>
                        <td>{formatMoney(e.max_drawdown)}</td>
                        <td>{formatMoney(e.max_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {transacoes.length > 0 && (
            <div className={css.card}>
              <h2 className={css.cardTitulo}>Transações (últimas {transacoes.length})</h2>
              <div className={css.tabelaWrap}>
                <table className={css.tabela}>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Categoria</th><th>Saldo depois</th><th>Descrição</th></tr>
                  </thead>
                  <tbody>
                    {transacoes.map((t, i) => (
                      <tr key={i}>
                        <td>{formatDate(t.date)}</td>
                        <td>
                          {t.is_initial_bank
                            ? <span className={css.tagTrial}>banca inicial</span>
                            : t.type}
                        </td>
                        <td style={{ color: t.type === 'gains' ? '#4ade80' : t.type === 'losses' ? '#f87171' : undefined }}>
                          {formatMoney(t.amount)}
                        </td>
                        <td>{t.category || '—'}</td>
                        <td>{formatMoney(t.balance_after)}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 260, fontSize: '0.78rem', opacity: 0.75 }}>
                          {t.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preferencias && (
            <div className={css.card}>
              <h2 className={css.cardTitulo}>Preferências</h2>
              <div className={css.linhaInfo}><span>Usa o gerenciamento desde</span><span>{formatDate(preferencias.created_at)}</span></div>
              <div className={css.linhaInfo}><span>Último reset de banca</span><span>{formatDate(preferencias.last_bank_reset)}</span></div>
              <div className={css.linhaInfo}><span>Foto de perfil</span><span>{preferencias.profile_photo ? 'sim' : 'não'}</span></div>
            </div>
          )}
        </>
      )}

    </>
  );
}
