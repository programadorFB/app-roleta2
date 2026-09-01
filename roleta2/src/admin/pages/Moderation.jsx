/**
 * Moderation — banimentos por abuso.
 *
 * A tabela access_bans e as rotas já existiam (política anti-scraping); esta
 * tela só dá rosto a elas. A coluna de evidência é o que permite revisar um
 * falso positivo antes de deixar alguém 15 dias fora.
 */

import React, { useState } from 'react';

import { adminApi, formatDate } from '../api.js';
import { useCarregar } from '../useCarregar.js';
import css from '../Admin.module.css';

export default function Moderation() {
  const { dados, erro, carregando, recarregar } = useCarregar(() => adminApi.bans());
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const revogar = async (email) => {
    setOcupado(true);
    setAviso('');
    try {
      await adminApi.revokeBan(email);
      setAviso(`Banimento de ${email} revogado.`);
      recarregar();
    } catch (e) {
      setAviso(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (carregando) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;

  // A rota devolve { bans, mode, banDays }, nao um array cru.
  const bans = dados?.bans || [];
  const modo = dados?.mode;
  const ativo = (b) => !b.revoked_at && new Date(b.banned_until) > new Date();

  return (
    <>
      <h1 className={css.pageTitle}>Moderação</h1>
      <p className={css.pageSub}>
        Banimentos aplicados pela política anti-scraping · política em <strong>{modo || '—'}</strong>
        {modo === 'observe' && ' (registra quem seria banido, sem banir)'}
        {dados?.banDays ? ` · ${dados.banDays} dias por ban` : ''}
      </p>

      {aviso && <div className={css.aviso}>{aviso}</div>}

      <div className={css.card}>
        <div className={css.tabelaWrap}>
          <table className={css.tabela}>
            <thead>
              <tr>
                <th>E-mail</th><th>Motivo</th><th>Evidência</th>
                <th>Até</th><th>Situação</th><th />
              </tr>
            </thead>
            <tbody>
              {bans.map(b => (
                <tr key={b.id}>
                  <td>{b.user_email}</td>
                  <td>{b.reason}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 380, fontSize: '0.78rem', opacity: 0.75 }}>
                    {b.evidence || '—'}
                  </td>
                  <td>{formatDate(b.banned_until)}</td>
                  <td>
                    {ativo(b)
                      ? <span className={css.tagBanido}>ativo</span>
                      : <span className={css.tagCancelado}>{b.revoked_at ? 'revogado' : 'expirado'}</span>}
                  </td>
                  <td>
                    {ativo(b) && (
                      <button
                        className={css.sair}
                        onClick={() => revogar(b.user_email)}
                        disabled={ocupado}
                        type="button"
                      >
                        revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {bans.length === 0 && (
                <tr><td colSpan={6} className={css.vazio}>Nenhum banimento registrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
