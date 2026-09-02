/**
 * Paginacao — a barra de navegação das listas do painel.
 *
 * A versão anterior tinha só "anterior/próxima" e a página atual escrita no
 * meio. Com 1.500+ assinaturas isso são 30 páginas: chegar na última exigia
 * trinta cliques, e não havia como pular para o meio nem como pedir mais linhas
 * de uma vez.
 *
 * Aqui a barra faz o que uma lista grande precisa: números clicáveis com
 * reticências, primeira/última, tamanho de página e — só quando há páginas
 * demais para caber em números — um campo para digitar o destino.
 */

import React, { useState, useEffect } from 'react';

import css from './Admin.module.css';

// O backend limita a 200 por requisição (server.js). Oferecer 500 aqui só
// produziria uma página truncada em silêncio.
const TAMANHOS = [25, 50, 100, 200];

// Quantos números aparecem em volta da página atual. 2 de cada lado mantém a
// barra estável: ela não muda de largura conforme se anda pela lista.
const VIZINHOS = 2;

/**
 * Os números a desenhar, com `null` onde entram as reticências.
 * Primeira e última página estão SEMPRE presentes — são os dois destinos que
 * mais se usa numa lista ordenada (o maior saldo e o menor, o mais novo e o
 * mais antigo).
 */
function paginasVisiveis(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);

  const paginas = new Set([0, total - 1, atual]);
  for (let d = 1; d <= VIZINHOS; d++) {
    if (atual - d >= 0) paginas.add(atual - d);
    if (atual + d <= total - 1) paginas.add(atual + d);
  }

  const ordenadas = [...paginas].sort((a, b) => a - b);
  const saida = [];
  let anterior = null;

  for (const p of ordenadas) {
    // Buraco de UMA página vira o número, não reticências: "1 … 3" esconderia
    // o 2 sem economizar espaço nenhum.
    if (anterior !== null && p - anterior === 2) saida.push(anterior + 1);
    else if (anterior !== null && p - anterior > 2) saida.push(null);
    saida.push(p);
    anterior = p;
  }

  return saida;
}

/** Campo "ir para a página N". Só aparece quando os números não dão conta. */
function IrPara({ atual, ultima, onIr }) {
  const [valor, setValor] = useState(String(atual + 1));

  // Segue a navegação feita pelos botões: o campo mostra onde se está, não o
  // último número digitado.
  useEffect(() => { setValor(String(atual + 1)); }, [atual]);

  const submeter = (e) => {
    e.preventDefault();
    const n = parseInt(valor, 10);
    if (!Number.isFinite(n)) return setValor(String(atual + 1));
    // Fora do intervalo, vai para a ponta mais próxima em vez de não fazer
    // nada: digitar 999 numa lista de 30 páginas quer dizer "a última".
    onIr(Math.min(Math.max(n - 1, 0), ultima));
  };

  return (
    <form className={css.irPara} onSubmit={submeter}>
      <label className={css.label} htmlFor="pag-ir">Ir para</label>
      <input
        id="pag-ir"
        className={css.inputPagina}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={submeter}
        inputMode="numeric"
        aria-label={`Ir para uma página entre 1 e ${ultima + 1}`}
      />
      <span className={css.nota}>de {ultima + 1}</span>
    </form>
  );
}

export default function Paginacao({
  pagina,
  porPagina,
  total,
  carregando = false,
  onPagina,
  onPorPagina,
  rotuloItens = 'itens',
}) {
  const ultima = Math.max(0, Math.ceil(total / porPagina) - 1);
  const primeiroDaPagina = total === 0 ? 0 : pagina * porPagina + 1;
  const ultimoDaPagina = Math.min((pagina + 1) * porPagina, total);

  const ir = (p) => {
    if (p < 0 || p > ultima || p === pagina) return;
    onPagina(p);
  };

  const numeros = paginasVisiveis(pagina, ultima + 1);

  return (
    <div className={css.paginacao}>
      <div className={css.paginacaoInfo}>
        {total === 0
          ? `Nenhum ${rotuloItens.replace(/s$/, '')} encontrado`
          : <>
              <strong>{primeiroDaPagina.toLocaleString('pt-BR')}–{ultimoDaPagina.toLocaleString('pt-BR')}</strong>
              {' de '}{total.toLocaleString('pt-BR')} {rotuloItens}
            </>}
      </div>

      {/* Com uma página só, os controles de navegação não têm o que fazer — mas
          o tamanho de página continua valendo (é ele que pode revelar a
          segunda página). */}
      {ultima > 0 && (
        <nav className={css.paginas} aria-label="Paginação">
          <button
            className={css.paginaBotao}
            onClick={() => ir(0)}
            disabled={pagina === 0 || carregando}
            type="button"
            title="Primeira página"
            aria-label="Primeira página"
          >
            «
          </button>
          <button
            className={css.paginaBotao}
            onClick={() => ir(pagina - 1)}
            disabled={pagina === 0 || carregando}
            type="button"
            title="Página anterior"
            aria-label="Página anterior"
          >
            ‹
          </button>

          {numeros.map((p, i) => (
            p === null
              ? <span key={`gap-${i}`} className={css.paginaGap}>…</span>
              : (
                <button
                  key={p}
                  className={p === pagina ? css.paginaAtual : css.paginaBotao}
                  onClick={() => ir(p)}
                  disabled={carregando}
                  type="button"
                  aria-current={p === pagina ? 'page' : undefined}
                >
                  {p + 1}
                </button>
              )
          ))}

          <button
            className={css.paginaBotao}
            onClick={() => ir(pagina + 1)}
            disabled={pagina >= ultima || carregando}
            type="button"
            title="Próxima página"
            aria-label="Próxima página"
          >
            ›
          </button>
          <button
            className={css.paginaBotao}
            onClick={() => ir(ultima)}
            disabled={pagina >= ultima || carregando}
            type="button"
            title="Última página"
            aria-label="Última página"
          >
            »
          </button>
        </nav>
      )}

      <div className={css.paginacaoControles}>
        {/* O campo só entra quando as reticências começam a esconder páginas:
            até 7 páginas, todos os números estão à vista e ele seria ruído. */}
        {ultima >= 7 && <IrPara atual={pagina} ultima={ultima} onIr={ir} />}

        <div className={css.porPagina}>
          <label className={css.label} htmlFor="pag-tamanho">Por página</label>
          <select
            id="pag-tamanho"
            className={css.inputPagina}
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            disabled={carregando}
          >
            {TAMANHOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
