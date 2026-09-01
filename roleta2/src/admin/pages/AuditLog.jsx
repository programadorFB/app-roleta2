/**
 * AuditLog — rastro das ações feitas pelo painel.
 *
 * É o motivo de o painel ter login por pessoa em vez do ADMIN_SECRET
 * compartilhado: aqui cada linha tem nome. Ações executadas com o secret
 * antigo aparecem como "secret" — sinal de que vieram de script, não da UI.
 */

import React from 'react';

import { adminApi, formatDate } from '../api.js';
import { useCarregar } from '../useCarregar.js';
import css from '../Admin.module.css';

const ROTULO_ACAO = {
  login:               'entrou no painel',
  subscription_update: 'alterou assinatura',
  force_disconnect:    'derrubou sessões',
  ban:                 'baniu',
  ban_revoke:          'revogou banimento',
};

export default function AuditLog() {
  const { dados, erro, carregando } = useCarregar(() => adminApi.auditLog(200));

  if (carregando) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;

  const linhas = dados || [];

  return (
    <>
      <h1 className={css.pageTitle}>Auditoria</h1>
      <p className={css.pageSub}>Tudo que foi feito pelo painel, e por quem.</p>

      <div className={css.card}>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr><th>Quando</th><th>Admin</th><th>Ação</th><th>Alvo</th><th>Detalhe</th></tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.id}>
                  <td>{formatDate(l.created_at)}</td>
                  <td>{l.admin_email}</td>
                  <td>{ROTULO_ACAO[l.action] || l.action}</td>
                  <td>{l.target_email || '—'}</td>
                  <td style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                    {l.payload ? JSON.stringify(l.payload) : '—'}
                  </td>
                </tr>
              ))}

              {linhas.length === 0 && (
                <tr><td colSpan={5} className={css.vazio}>Nenhuma ação registrada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
