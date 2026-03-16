// pages/TutorialPage.jsx — Tutorial CINEMATIC MAGAZINE

import React from 'react';
import {
  BarChart3, Crosshair, Target, Zap, TrendingUp,
  Eye, Layers, Compass, CheckCircle2, AlertTriangle,
  Flame, Thermometer, Star, Shield, Gauge, Crown,
  ArrowRight, Sparkles, CircleDot,
} from 'lucide-react';
import heroImg from '../assets/backlogin.png';
import styles from './TutorialPage.module.css';

const TEMP_ITEMS = [
  { label: 'QUENTE', color: '#ef4444', icon: Flame, desc: 'Padrao muito forte — maior probabilidade de acerto.', glow: 'rgba(239,68,68,0.15)' },
  { label: 'AQUECIDO', color: '#f97316', icon: Thermometer, desc: 'Padrao forte — boa oportunidade.', glow: 'rgba(249,115,22,0.12)' },
  { label: 'MORNO', color: '#c9a052', icon: Thermometer, desc: 'Padrao moderado — cautela.', glow: 'rgba(201,160,82,0.1)' },
  { label: 'FRIO', color: '#64748b', icon: Thermometer, desc: 'Padrao fraco — evite.', glow: 'rgba(100,116,139,0.08)' },
];

const STRATEGIES = [
  { Icon: Target,  name: 'Cavalos',  desc: 'Analisa pares de numeros adjacentes no pano da mesa que aparecem juntos com frequencia anormal. Quando dois numeros vizinhos na mesa saem em sequencia repetidamente, a estrategia detecta o padrao e sugere a dupla.', color: '#c9a052', glow: 'rgba(201,160,82,0.08)' },
  { Icon: Layers,  name: 'Setores',  desc: 'Divide o cilindro fisico em setores e monitora quais regioes recebem mais resultados que o esperado. Um setor "quente" indica possivel tendencia mecanica — desgaste, inclinacao ou habito do croupier.', color: '#34d399', glow: 'rgba(52,211,153,0.08)' },
  { Icon: Compass, name: 'Vizinhos', desc: 'Identifica numeros proximos no cilindro fisico que formam clusters estatisticos. Foco em grupos menores (2-5 vizinhos) centrados em numeros especificos que repetem com frequencia.', color: '#60a5fa', glow: 'rgba(96,165,250,0.08)' },
  { Icon: Eye,     name: 'Ocultos',  desc: 'Detecta numeros individuais com frequencia acima do esperado. Se um numero deveria aparecer ~2.7% das vezes mas esta aparecendo 5%+, a estrategia o destaca como anomalia estatistica.', color: '#f97316', glow: 'rgba(249,115,22,0.08)' },
  { Icon: Shield,  name: 'Croupier', desc: 'Analisa padroes de lancamento do croupier — velocidade, forca e ponto de soltura. Croupiers tendem a repetir movimentos, criando tendencias de onde a bola cai. Esta estrategia detecta esses vieses.', color: '#a78bfa', glow: 'rgba(167,139,250,0.08)' },
];

const TutorialPage = () => (
  <div className={styles.magazine}>

    {/* ═══ CAPA CINEMATICA ═══ */}
    <header className={styles.cover}>
      <div className={styles.coverVignette} />
      <div className={styles.coverGlow} />
      <div className={styles.coverParticles}>
        {[...Array(6)].map((_, i) => (
          <span key={i} className={styles.particle} style={{ animationDelay: `${i * 0.8}s`, left: `${15 + i * 14}%` }} />
        ))}
      </div>
      <img src={heroImg} alt="Smart Analise" className={styles.coverLogo} />
      <div className={styles.coverBadge}>
        <Crown size={10} />
        <span>PREMIUM</span>
      </div>
      <h1 className={styles.coverTitle}>
        <span className={styles.coverTitleLine}>Guia</span>
        <span className={styles.coverTitleAccent}>Completo</span>
      </h1>
      <p className={styles.coverTagline}>Tudo que voce precisa saber para dominar a ferramenta</p>
      <div className={styles.coverEdition}>
        <span className={styles.editionLine} />
        <span>SMART ANALISE</span>
        <span className={styles.coverDot} />
        <span>EDICAO UNICA</span>
        <span className={styles.editionLine} />
      </div>
    </header>

    {/* ═══ SUMARIO ═══ */}
    <nav className={styles.toc}>
      <div className={styles.tocHeader}>
        <span className={styles.tocLine} />
        <h2 className={styles.tocTitle}>Sumario</h2>
        <span className={styles.tocLine} />
      </div>
      <div className={styles.tocGrid}>
        {[
          { t: 'Visao Geral', icon: Sparkles },
          { t: 'Dashboard', icon: BarChart3 },
          { t: 'Gatilhos', icon: Crosshair },
          { t: 'Sinais', icon: Zap },
          { t: 'Temperatura', icon: Flame },
          { t: 'Dicas de Ouro', icon: Crown },
        ].map((item, i) => {
          const TocIcon = item.icon;
          return (
            <a key={i} href={`#sec-${i}`} className={styles.tocItem}>
              <span className={styles.tocNum}>0{i + 1}</span>
              <TocIcon size={13} className={styles.tocIcon} />
              <span className={styles.tocLabel}>{item.t}</span>
              <ArrowRight size={11} className={styles.tocArrow} />
            </a>
          );
        })}
      </div>
    </nav>

    {/* ═══ 01 — VISAO GERAL ═══ */}
    <article id="sec-0" className={styles.article}>
      <div className={styles.articleHead}>
        <div className={styles.chapterBadge}>
          <span className={styles.chapterNum}>01</span>
        </div>
        <div>
          <h2 className={styles.chapterTitle}>Visao Geral</h2>
          <p className={styles.chapterSub}>Como a ferramenta funciona</p>
        </div>
      </div>
      <div className={styles.articleBody}>
        <p className={styles.leadText}>
          <span className={styles.dropCap}>A</span>
          Smart Analise e um sistema de analise estatistica de roletas ao vivo.
          Ela monitora centenas de resultados em tempo real, identifica padroes
          e gera sinais de entrada com base em dados — nao em sorte.
        </p>
        <div className={styles.pullQuote}>
          <Sparkles size={16} className={styles.quoteIcon} />
          <p>"Quando a ferramenta detecta um padrao forte, ela gera um sinal
          com os numeros recomendados para apostar."</p>
        </div>
        <p className={styles.bodyText}>
          A ferramenta tem duas abas principais: o <strong>Dashboard</strong>,
          que combina 5 estrategias para gerar sinais de entrada, e os <strong>Gatilhos</strong>,
          que analisa cada numero como um potencial acionador de apostas.
        </p>
        <div className={styles.twoCards}>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} style={{ background: 'rgba(52,211,153,0.06)', borderColor: 'rgba(52,211,153,0.15)' }}>
              <BarChart3 size={24} style={{ color: '#34d399' }} />
            </div>
            <h4>Dashboard</h4>
            <p>5 estrategias combinadas que convergem para gerar entradas precisas.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} style={{ background: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.15)' }}>
              <Crosshair size={24} style={{ color: '#f97316' }} />
            </div>
            <h4>Gatilhos</h4>
            <p>Quando um numero sai, indica quais numeros tem mais chance de sair em seguida.</p>
          </div>
        </div>
      </div>
    </article>

    <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

    {/* ═══ 02 — DASHBOARD ═══ */}
    <article id="sec-1" className={styles.article}>
      <div className={styles.articleHead}>
        <div className={styles.chapterBadge}>
          <span className={styles.chapterNum}>02</span>
        </div>
        <div>
          <h2 className={styles.chapterTitle}>Dashboard</h2>
          <p className={styles.chapterSub}>O painel das 5 estrategias</p>
        </div>
      </div>
      <div className={styles.articleBody}>
        <p className={styles.bodyText}>
          O Dashboard combina <strong>5 estrategias independentes</strong>.
          Quando 3 ou mais concordam nos mesmos numeros, um sinal de entrada e gerado
          com 5 numeros sugeridos.
        </p>

        <div className={styles.stratGrid}>
          {STRATEGIES.map((s, i) => (
            <div key={i} className={styles.stratCard} style={{ '--strat-color': s.color, '--strat-glow': s.glow }}>
              <div className={styles.stratIconWrap} style={{ borderColor: s.color }}>
                <s.Icon size={18} style={{ color: s.color }} />
              </div>
              <div className={styles.stratContent}>
                <strong>{s.name}</strong>
                <span>{s.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.pullQuote}>
          <Sparkles size={16} className={styles.quoteIcon} />
          <p>"A forca do Dashboard esta na convergencia — quando 3 estrategias independentes
          apontam para os mesmos numeros, a probabilidade sobe significativamente."</p>
        </div>

        <h3 className={styles.subHeading}>
          <CircleDot size={14} />
          Como o sinal e gerado
        </h3>
        <p className={styles.bodyText}>
          Cada estrategia analisa os ultimos resultados e gera uma lista de numeros candidatos.
          O sistema cruza as 5 listas e identifica os numeros que aparecem em <strong>3 ou mais</strong> estrategias
          simultaneamente. Esses numeros formam o sinal de entrada — geralmente 5 numeros com alta convergencia.
        </p>
        <p className={styles.bodyText}>
          O Motor de Score acompanha automaticamente cada sinal gerado, verificando se algum dos numeros
          sugeridos saiu nas rodadas seguintes. O placar (WIN/LOSS) e calculado em 3 modos de vizinhanca:
          numero exato, com 1 vizinho e com 2 vizinhos no cilindro.
        </p>

        <div className={styles.infoBox}>
          <Zap size={16} className={styles.infoBoxIcon} />
          <div>
            <strong>Sinal de Entrada:</strong> Voce tem 2 rodadas para apostar nos 5 numeros sugeridos.
            O placar (WIN/LOSS) e calculado automaticamente em 3 modos de vizinhanca.
          </div>
        </div>
      </div>
    </article>

    <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

    {/* ═══ 03 — GATILHOS ═══ */}
    <article id="sec-2" className={styles.article}>
      <div className={styles.articleHead}>
        <div className={styles.chapterBadge}>
          <span className={styles.chapterNum}>03</span>
        </div>
        <div>
          <h2 className={styles.chapterTitle}>Gatilhos</h2>
          <p className={styles.chapterSub}>Numeros que acionam apostas</p>
        </div>
      </div>
      <div className={styles.articleBody}>
        <p className={styles.leadText}>
          <span className={styles.dropCap}>C</span>
          ada numero da roleta pode ser um gatilho. Quando ele sai,
          a ferramenta analisa o historico e indica quais numeros tem
          mais probabilidade de sair nas proximas 3 rodadas.
        </p>

        <p className={styles.bodyText}>
          O sistema usa analise estatistica (chi-quadrado, p &lt; 0.05) para identificar
          correlacoes reais entre numeros. Se o numero 17 sai e, historicamente, os numeros
          ao redor dele no cilindro tambem saem nas proximas rodadas com frequencia
          acima do esperado, o 17 se torna um <strong>gatilho ativo</strong>.
        </p>

        <h3 className={styles.subHeading}>
          <CircleDot size={14} />
          Tipos de Gatilho
        </h3>

        <div className={styles.twoCards}>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} style={{ background: 'rgba(96,165,250,0.06)', borderColor: 'rgba(96,165,250,0.15)' }}>
              <Crosshair size={24} style={{ color: '#60a5fa' }} />
            </div>
            <h4>Regiao</h4>
            <p>
              Baseado em vizinhos no cilindro fisico. O sistema testa raios de 2 a 5 vizinhos
              ao redor de cada numero. Exemplo: "17 com 3 vizinhos" aposta no 17 e nos 3 numeros
              de cada lado no cilindro (total: 7 numeros).
            </p>
            <div className={styles.featureSubtypes}>
              <span><strong>Regiao Curta</strong> (2-3 viz): area menor, mais precisa.</span>
              <span><strong>Regiao Larga</strong> (4-5 viz): area maior, mais chances de acerto.</span>
            </div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} style={{ background: 'rgba(167,139,250,0.06)', borderColor: 'rgba(167,139,250,0.15)' }}>
              <Target size={24} style={{ color: '#a78bfa' }} />
            </div>
            <h4>Terminal</h4>
            <p>
              Baseado no ultimo digito do numero. Terminal 7 cobre: 7, 17, 27.
              Pode ser combinado com vizinhos no cilindro para aumentar a cobertura.
            </p>
            <div className={styles.featureSubtypes}>
              <span><strong>Terminal Puro</strong>: apenas os numeros do terminal (3-4 numeros).</span>
              <span><strong>Terminal + Viz</strong>: terminal expandido com 1-2 vizinhos de cada numero.</span>
            </div>
          </div>
        </div>

        <h3 className={styles.subHeading}>
          <CircleDot size={14} />
          Porcentagem Individual
        </h3>
        <p className={styles.bodyText}>
          Cada gatilho possui sua propria porcentagem de acertos calculada individualmente.
          Ao expandir uma categoria na tabela de assertividade, voce ve a taxa de acerto
          de cada numero gatilho (ex: "17 → 65% 11/17"), permitindo identificar quais
          numeros especificos sao mais confiaveis na mesa atual.
        </p>

        <h3 className={styles.subHeading}>
          <CircleDot size={14} />
          Assertividade — G1 / G2 / G3 / RED
        </h3>
        <p className={styles.bodyText}>
          A tabela mostra o desempenho historico por categoria de gatilho.
          Quando um gatilho dispara, o sistema acompanha as proximas 3 rodadas:
        </p>
        <div className={styles.gGrid}>
          {[
            { code: 'G1', color: '#34d399', text: 'Acertou na 1a rodada — resultado ideal.' },
            { code: 'G2', color: '#34d399', text: 'Acertou na 2a rodada — bom resultado.' },
            { code: 'G3', color: '#34d399', text: 'Acertou na 3a rodada — acerto no limite.' },
            { code: 'RED', color: '#ef4444', text: 'Nao acertou em nenhuma das 3 tentativas.' },
          ].map((g, i) => (
            <div key={i} className={styles.gItem} style={{ '--g-color': g.color }}>
              <span className={styles.gCode} style={{ color: g.color }}>{g.code}</span>
              <span className={styles.gText}>{g.text}</span>
            </div>
          ))}
        </div>

        <div className={styles.infoBox}>
          <TrendingUp size={16} className={styles.infoBoxIcon} />
          <div>
            <strong>Dica:</strong> Priorize gatilhos com alta porcentagem individual de acerto
            e temperatura QUENTE ou AQUECIDO. Gatilhos com menos de 40% de acerto devem ser evitados.
          </div>
        </div>
      </div>
    </article>

    <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

    {/* ═══ 04 — SINAIS ═══ */}
    <article id="sec-3" className={styles.article}>
      <div className={styles.articleHead}>
        <div className={styles.chapterBadge}>
          <span className={styles.chapterNum}>04</span>
        </div>
        <div>
          <h2 className={styles.chapterTitle}>Sinais em Progresso</h2>
          <p className={styles.chapterSub}>Acompanhe suas entradas</p>
        </div>
      </div>
      <div className={styles.articleBody}>
        <p className={styles.bodyText}>
          Quando um gatilho dispara, ele aparece na lista de sinais em progresso.
          Voce tem <strong>3 rodadas</strong> para o sinal acertar.
        </p>
        <div className={styles.signalExamples}>
          {[
            { badge: '2/3', label: 'PENDENTE — faltam 2 tentativas', bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
            { badge: 'G1', label: 'ACERTOU na 1a tentativa', bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' },
            { badge: 'G2', label: 'ACERTOU na 2a tentativa', bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' },
            { badge: 'MISS', label: 'ERROU todas as 3 rodadas', bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
          ].map((s, i) => (
            <div key={i} className={styles.signalEx}>
              <span className={styles.signalBadge} style={{ background: s.bg, color: s.color, borderColor: s.border }}>{s.badge}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className={styles.infoBox}>
          <Gauge size={16} className={styles.infoBoxIcon} />
          <div>
            <strong>Filtro de Rodadas:</strong> Use o seletor no topo para alterar o tamanho da amostra.
            Menos rodadas = padroes recentes. Mais rodadas = padroes consolidados.
          </div>
        </div>
      </div>
    </article>

    <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

    {/* ═══ 05 — TEMPERATURA ═══ */}
    <article id="sec-4" className={styles.article}>
      <div className={styles.articleHead}>
        <div className={styles.chapterBadge}>
          <span className={styles.chapterNum}>05</span>
        </div>
        <div>
          <h2 className={styles.chapterTitle}>Temperatura</h2>
          <p className={styles.chapterSub}>A forca de cada gatilho</p>
        </div>
      </div>
      <div className={styles.articleBody}>
        <p className={styles.bodyText}>
          Cada gatilho recebe um label de temperatura que indica sua forca
          estatistica. Quanto mais quente, maior a confianca no padrao.
        </p>
        <div className={styles.tempStrip}>
          {TEMP_ITEMS.map(t => {
            const TIcon = t.icon;
            return (
              <div key={t.label} className={styles.tempCard} style={{ '--temp-color': t.color, '--temp-glow': t.glow }}>
                <div className={styles.tempIconRing} style={{ borderColor: t.color }}>
                  <TIcon size={20} style={{ color: t.color }} />
                </div>
                <span className={styles.tempName} style={{ color: t.color }}>{t.label}</span>
                <span className={styles.tempCardDesc}>{t.desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </article>

    <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

    {/* ═══ 06 — DICAS ═══ */}
    <article id="sec-5" className={styles.article}>
      <div className={styles.articleHead}>
        <div className={styles.chapterBadge}>
          <span className={styles.chapterNum}>06</span>
        </div>
        <div>
          <h2 className={styles.chapterTitle}>Dicas de Ouro</h2>
          <p className={styles.chapterSub}>Maximize seus resultados</p>
        </div>
      </div>
      <div className={styles.articleBody}>
        <div className={styles.tipsList}>
          {[
            { icon: Star, title: 'Gestao de Banca', text: 'Nunca aposte mais de 2-3% da banca em uma entrada. A ferramenta gera muitos sinais — voce nao precisa apostar em todos.' },
            { icon: Flame, title: 'Quando Apostar', text: 'Priorize sinais QUENTE ou AQUECIDO. Sinais FRIO sao menos confiaveis.' },
            { icon: TrendingUp, title: 'Troca de Mesa', text: 'Se a assertividade cair abaixo de 40%, troque de mesa pelo seletor no topo.' },
            { icon: Shield, title: 'Paciencia', text: 'Nem toda rodada gera sinal. Espere por gatilhos fortes — disciplina e a diferenca entre lucro e prejuizo.' },
          ].map((tip, i) => {
            const TIcon = tip.icon;
            return (
              <div key={i} className={styles.tipCard}>
                <div className={styles.tipNum}>{i + 1}</div>
                <div className={styles.tipContent}>
                  <div className={styles.tipHeader}>
                    <TIcon size={14} style={{ color: '#c9a052' }} />
                    <strong>{tip.title}</strong>
                  </div>
                  <p>{tip.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>

    {/* ═══ FOOTER ═══ */}
    <footer className={styles.footer}>
      <div className={styles.footerGlow} />
      <img src={heroImg} alt="" className={styles.footerLogo} />
      <p className={styles.footerBrand}>Smart Analise</p>
      <p className={styles.footerSub}>Analise Inteligente &amp; Precisa</p>
    </footer>

  </div>
);

export default TutorialPage;
