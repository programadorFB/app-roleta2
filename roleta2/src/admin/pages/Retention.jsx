/**
 * Retention — matriz de coorte semanal.
 *
 * Linha = semana em que a pessoa apareceu pela primeira vez. Coluna = quantas
 * daquela turma voltaram N semanas depois. É a leitura que responde "o produto
 * segura gente ou só recebe gente nova".
 */

import React from 'react';

import { adminApi } from '../api.js';
import { useCarregar } from '../useCarregar.js';
import css from '../Admin.module.css';

/** Verde tão mais forte quanto maior a retenção — a matriz é para ser lida de relance. */
function corDaCelula(pct) {
  if (pct === undefined) return 'transparent';
  const alpha = Math.max(0.06, Math.min(0.85, pct / 100));
  return `rgba(74, 222, 128, ${alpha})`;
}

export default function Retention() {
  const { dados, erro, carregando } = useCarregar(() => adminApi.retention(8));

  if (carregando) return <div className={css.vazio}>Carregando…</div>;
  if (erro) return <div className={css.erro}>{erro}</div>;

  const coortes = dados || [];
  const maxOffset = coortes.reduce(
    (max, c) => Math.max(max, ...Object.keys(c.offsets).map(Number)),
    0,
  );
  const colunas = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  return (
    <>
      <h1 className={css.pageTitle}>Retenção</h1>
      <p className={css.pageSub}>Quantos de cada turma voltaram nas semanas seguintes.</p>

      <div className={css.aviso}>
        Cada linha é a semana do primeiro acesso. A coluna S0 é sempre 100% (é a própria
        semana de entrada); o que interessa é o quanto sobra em S1, S2 e adiante.
        Como a coleta começou agora, só existe uma linha por enquanto — a leitura fica
        útil de verdade com umas 4 semanas acumuladas.
      </div>

      <div className={css.card}>
        <div className={css.tabelaWrap}>
          <table className={css.coorte}>
            <thead>
              <tr>
                <th className={css.coorteLabel}>Turma</th>
                <th>Pessoas</th>
                {colunas.map(i => <th key={i}>S{i}</th>)}
              </tr>
            </thead>
            <tbody>
              {coortes.map(c => (
                <tr key={c.cohort}>
                  <td className={css.coorteLabel}>{c.cohort}</td>
                  <td>{c.size}</td>
                  {colunas.map(i => {
                    const pct = c.percents[i];
                    return (
                      <td
                        key={i}
                        className={css.celula}
                        style={{ background: corDaCelula(pct) }}
                        title={pct !== undefined ? `${c.offsets[i]} de ${c.size}` : 'sem dados'}
                      >
                        {pct !== undefined ? `${pct}%` : '·'}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {coortes.length === 0 && (
                <tr>
                  <td colSpan={colunas.length + 2} className={css.vazio}>
                    Ainda não há sessões suficientes para montar uma turma.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
