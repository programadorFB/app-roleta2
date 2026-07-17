// pages/TriggersDisabledNotice.jsx — Aviso regulatório no lugar da aba Gatilhos.
// Substitui a TriggersPage, desativada em adequação às regras de comunicação e
// publicidade de apostas de quota fixa vigentes a partir de 17/07/2026.
import React from 'react';
import { Ban, ExternalLink } from 'lucide-react';
import styles from './TriggersDisabledNotice.module.css';

// Texto exato do art. 13, II da Portaria SPA/MF nº 1.231/2024, na redação dada
// pela Portaria SPA/MF nº 1.964/2026. Não parafrasear: a frase é literal e a
// portaria exige clareza, legibilidade e no mínimo 10% do tamanho do anúncio.
const ADVERTENCIA = 'Ministério da Fazenda adverte: Aposta não é investimento';

const VEDACOES = [
  {
    alinea: 'b',
    texto: 'apresentem a aposta como fonte de renda, forma de investimento, alternativa ao emprego, solução para problemas pessoais, sociais ou financeiros ou meio de recuperação de valores perdidos em apostas anteriores.',
  },
  {
    alinea: 'c',
    texto: 'encorajem práticas excessivas de aposta ou contenham chamadas para ação, inclusive com mecânicas promocionais, que sugiram ato imediato por parte do apostador.',
  },
  {
    alinea: 'd',
    texto: 'contenham informação falsa ou enganosa, inclusive quanto às probabilidades de ganhar ou quanto à possibilidade de a habilidade, a destreza ou a experiência do apostador influenciar o resultado da aposta.',
  },
];

const FONTES = [
  {
    titulo: 'Portaria SPA/MF nº 1.964, de 3 de julho de 2026',
    url: 'https://www.in.gov.br/web/dou/-/portaria-spa/mf-n-1.964-de-3-de-julho-de-2026-718408857',
  },
  {
    titulo: 'Portaria Interministerial MF/SECOM/MJSP nº 73, de 10 de julho de 2026',
    url: 'https://www.in.gov.br/en/web/dou/-/portaria-interministerial-mf/secom/mjsp-n-73-de-10-de-julho-de-2026-718408679',
  },
];

const TriggersDisabledNotice = () => (
  <main className={styles.page}>
    <div className={styles.card}>

      <div className={styles.iconWrap}>
        <Ban size={26} className={styles.icon} />
      </div>

      <h1 className={styles.title}>Aba de Gatilhos desativada</h1>

      <p className={styles.lead}>
        Desativamos os Gatilhos em adequação às novas regras federais de comunicação,
        publicidade e oferta de apostas de quota fixa, em vigor desde 17 de julho de 2026.
      </p>

      {/* Advertência obrigatória — art. 13, II da Portaria SPA/MF nº 1.231/2024 (red. 1.964/2026) */}
      <div className={styles.advertencia}>{ADVERTENCIA}</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Por que a aba saiu do ar</h2>
        <p className={styles.text}>
          A roleta é um jogo de azar: cada giro é independente e nenhum padrão do
          histórico altera a probabilidade do giro seguinte. Um recurso que aponta
          "gatilhos" de entrada sugere o contrário — que dá para prever o resultado a
          partir dos números anteriores. É exatamente isso que a norma passou a vedar.
        </p>
        <p className={styles.text}>
          A Portaria Interministerial MF/SECOM/MJSP nº 73/2026, no art. 4º, inciso VII,
          caracteriza como publicidade enganosa ou abusiva as ações que:
        </p>
        <ul className={styles.list}>
          {VEDACOES.map(({ alinea, texto }) => (
            <li key={alinea} className={styles.listItem}>
              <span className={styles.alinea}>{alinea})</span>
              <span>{texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>O que continua disponível</h2>
        <p className={styles.text}>
          As demais áreas da ferramenta seguem no ar: Dashboard, Tutorial e
          Gerenciamento de banca. O histórico de resultados continua sendo exibido como
          registro do que já saiu — sem prognóstico do que virá.
        </p>
      </section>

      <footer className={styles.sources}>
        <span className={styles.sourcesLabel}>Base normativa</span>
        {FONTES.map(({ titulo, url }) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            <ExternalLink size={12} />
            <span>{titulo}</span>
          </a>
        ))}
      </footer>

    </div>
  </main>
);

export default TriggersDisabledNotice;
