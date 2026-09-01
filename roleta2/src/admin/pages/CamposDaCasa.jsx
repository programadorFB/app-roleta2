/**
 * CamposDaCasa — tudo que a casa devolve sobre a pessoa, campo a campo.
 *
 * POR QUE NÃO UM <pre> COM O JSON
 * ───────────────────────────────
 * São centenas de campos do /profile mais os do /wallet. Despejados como JSON
 * indentado viram trinta telas de rolagem em que ninguém acha nada — é um
 * paredão, não informação. O operador que abre isto está procurando UM campo
 * específico ("será que tem o CPF?", "de onde saiu esse telefone?"), então o
 * que serve é uma lista achatada e uma caixa de busca.
 *
 * Achatar também resolve o aninhamento: `user_profile.address.city` vira uma
 * linha só, e buscar por "city" acha onde quer que ele esteja.
 *
 * De qual rota veio fica marcado. Quando as duas trazem a mesma chave com
 * valores diferentes, essa divergência é exatamente o que importa — mesclar
 * apagaria justo isso.
 *
 * Carrega sob demanda: a ficha já é pesada, e a maioria das aberturas não
 * precisa disto.
 */

import React, { useMemo, useState } from 'react';

import { adminApi, formatDate } from '../api.js';
import css from '../Admin.module.css';

/** {a: {b: 1}} -> [['a.b', 1]]. Listas viram índice: `tags.0`. */
function achatar(no, prefixo = '', saida = []) {
  if (no === null || typeof no !== 'object') {
    saida.push([prefixo, no]);
    return saida;
  }
  const entradas = Array.isArray(no)
    ? no.map((v, i) => [String(i), v])
    : Object.entries(no);

  // Objeto/lista VAZIO tem que virar linha também: "veio vazio" é uma resposta,
  // e sumir da lista faria parecer que o campo não existe.
  if (entradas.length === 0) {
    saida.push([prefixo, Array.isArray(no) ? '[]' : '{}']);
    return saida;
  }
  for (const [chave, valor] of entradas) {
    achatar(valor, prefixo ? `${prefixo}.${chave}` : chave, saida);
  }
  return saida;
}

const mostrar = (v) => {
  if (v === null) return 'null';
  if (v === '') return '(vazio)';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

export default function CamposDaCasa({ email }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('');

  const abrir = async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await adminApi.plataformaBruta(email));
    } catch (e) {
      setErro(e.status === 404 ? 'Nada espelhado para este e-mail ainda.' : e.message);
    } finally {
      setCarregando(false);
    }
  };

  const linhas = useMemo(() => {
    if (!dados) return [];
    const juntas = [
      ...(dados.perfil ? achatar(dados.perfil).map(([k, v]) => ['profile', k, v]) : []),
      ...(dados.carteira ? achatar(dados.carteira).map(([k, v]) => ['wallet', k, v]) : []),
    ];
    return juntas.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  }, [dados]);

  const termo = filtro.trim().toLowerCase();
  // Busca no CAMINHO e no VALOR: às vezes o operador tem o número na mão (um
  // telefone, um id) e quer saber em que campo ele está.
  const visiveis = termo
    ? linhas.filter(([, k, v]) => `${k} ${mostrar(v)}`.toLowerCase().includes(termo))
    : linhas;

  if (!dados) {
    return (
      <div className={css.card}>
        <h2 className={css.cardTitulo}>Todos os campos da casa</h2>
        {erro && <div className={css.erro}>{erro}</div>}
        <button className={css.buttonGhost} onClick={abrir} disabled={carregando} type="button">
          {carregando ? 'Carregando…' : 'Ver as respostas cruas de /profile e /wallet'}
        </button>
      </div>
    );
  }

  return (
    <div className={css.card}>
      <h2 className={css.cardTitulo}>Todos os campos da casa</h2>

      <p className={css.kpiNota} style={{ marginBottom: '0.9rem' }}>
        {linhas.length} campos · perfil lido em {formatDate(dados.perfilEm)}
        {dados.carteiraEm ? ` · carteira em ${formatDate(dados.carteiraEm)}` : ' · carteira nunca lida'}.
        Credenciais aparecem como <code>[redigido]</code>.
      </p>

      <input
        className={css.busca}
        type="search"
        placeholder={`Filtrar entre ${linhas.length} campos…`}
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        aria-label="Filtrar campos da casa"
      />

      {visiveis.length === 0 ? (
        <div className={css.vazio}>Nenhum campo com &quot;{filtro.trim()}&quot;.</div>
      ) : (
        <div className={css.tabelaWrap} style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className={css.tabela}>
            <thead>
              <tr><th>Rota</th><th>Campo</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {visiveis.map(([rota, caminho, valor]) => (
                <tr key={`${rota}:${caminho}`}>
                  <td>
                    <span className={rota === 'wallet' ? css.tagTrial : css.tagCancelado}>{rota}</span>
                  </td>
                  <td className={css.celulaLonga} title={caminho}>{caminho}</td>
                  {/* `title` com o valor inteiro: a coluna corta, e o que
                      interessa costuma ser justamente o fim de um id longo. */}
                  <td className={css.celulaLonga} title={mostrar(valor)}>{mostrar(valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
