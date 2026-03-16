// pages/ToolsPage.jsx — Nossas Ferramentas (Cinematic)

import React from 'react';
import {
  BarChart3, Crosshair, Crown, Sparkles,
  Target, Layers, Zap, TrendingUp,
  Flame, Wallet, PieChart, Goal, AlertTriangle,
  FileText, FlaskConical, Atom, Binary, GitBranch,
  Microscope, Trophy, Video, Star,
  Users, ShoppingBag, Swords, CheckCircle2, ArrowUpRight,
} from 'lucide-react';
import heroImg from '../assets/backlogin.png';
import styles from './ToolsPage.module.css';

const TOOLS = [
  {
    id: 'analise',
    color: '#c9a052',
    colorRgb: '201,160,82',
    icon: BarChart3,
    name: 'Smart Analise',
    tagline: 'Analise estatistica de roletas em tempo real',
    link: null, // current app
    desc: 'Sistema completo de analise estatistica que monitora roletas ao vivo, identifica padroes e gera sinais de entrada com base em dados. Combina 5 estrategias independentes no Dashboard e analise individual de gatilhos para maximizar suas chances.',
    features: [
      { icon: Target, color: '#c9a052', text: '5 Estrategias combinadas (Cavalos, Setores, Vizinhos, Ocultos, Croupier)' },
      { icon: Crosshair, color: '#34d399', text: 'Gatilhos inteligentes com assertividade individual por numero' },
      { icon: Flame, color: '#f97316', text: 'Temperatura de padroes (Quente, Aquecido, Morno, Frio)' },
      { icon: TrendingUp, color: '#60a5fa', text: 'Motor de Score automatico com placar em tempo real' },
      { icon: Zap, color: '#fbbf24', text: 'Sinais em progresso com rastreamento G1/G2/G3' },
    ],
  },
  {
    id: 'gerenciamento',
    color: '#34d399',
    colorRgb: '52,211,153',
    icon: Wallet,
    name: 'Smart Gerenciamento',
    tagline: 'Controle total da sua banca e performance',
    link: 'https://appgerenciamento.smartanalise.com.br',
    desc: 'Plataforma profissional de gestao financeira feita sob medida para quem leva a serio o jogo. Acompanhe sua banca em tempo real, defina metas de lucro diario, controle stop-loss automatico e visualize sua evolucao com graficos detalhados.',
    features: [
      { icon: PieChart, color: '#34d399', text: 'Dashboard financeiro com lucro real, depositos e saques' },
      { icon: AlertTriangle, color: '#f97316', text: 'Stop-loss e meta diaria com alertas automaticos de protecao' },
      { icon: Goal, color: '#60a5fa', text: 'Objetivos financeiros com rastreamento de progresso' },
      { icon: FileText, color: '#a78bfa', text: 'Relatorios profissionais em PDF e Excel' },
      { icon: TrendingUp, color: '#fbbf24', text: 'Graficos de performance, win rate e fator de lucro' },
    ],
  },
  {
    id: 'laboratorio',
    color: '#06b6d4',
    colorRgb: '6,182,212',
    icon: FlaskConical,
    name: 'Smart Laboratorio',
    tagline: 'Laboratorio de assertividade e backtesting',
    link: 'https://laboratorio.smartanalise.com.br',
    desc: 'O laboratorio onde estrategias vencedoras nascem. Cataloga spins de 6 mesas simultaneamente, executa 4 algoritmos proprietarios em tempo real e valida cada gatilho contra dados historicos reais.',
    features: [
      { icon: Atom, color: '#06b6d4', text: '4 algoritmos proprietarios (Royal, Firezone, Royal 2X, Firezone 2X)' },
      { icon: Microscope, color: '#a78bfa', text: 'Auditoria de gatilhos com sequencia exata de entrada e saida' },
      { icon: GitBranch, color: '#f97316', text: 'Analise de puxadores — quais numeros atraem quais' },
      { icon: Binary, color: '#34d399', text: 'Simulador de banca com Gale, vizinhos e filtro por horario' },
      { icon: Layers, color: '#fbbf24', text: 'Catalogo completo com setor, coluna, duzia e ranking' },
    ],
  },
  {
    id: 'academy',
    color: '#a78bfa',
    colorRgb: '167,139,250',
    icon: Trophy,
    name: 'Smart Academy',
    tagline: 'Comunidade gamificada de aprendizado',
    link: 'https://members.smartanalise.com.br',
    desc: 'Mais do que cursos — uma jornada. Plataforma gamificada com 11 niveis de ranking, conquistas exclusivas e sistema de XP que transforma seu aprendizado em progressao real.',
    features: [
      { icon: Star, color: '#fbbf24', text: '11 niveis de ranking — de "Inicio da Jornada" ate "Lenda Viva"' },
      { icon: Video, color: '#f97316', text: 'Cursos em video com progresso automatico e certificacao' },
      { icon: Swords, color: '#ef4444', text: 'Missoes diarias, semanais e mensais com recompensas' },
      { icon: ShoppingBag, color: '#34d399', text: 'Loja exclusiva — troque pontos por produtos premium' },
      { icon: Users, color: '#60a5fa', text: 'Mentoria com especialistas e ranking global competitivo' },
    ],
  },
];

const ToolsPage = () => (
  <div className={styles.page}>

    {/* ═══ CINEMATIC HERO ═══ */}
    <header className={styles.hero}>
      <div className={styles.heroVignette} />
      <div className={styles.heroGlow} />
      <div className={styles.heroGlow2} />
      <div className={styles.heroLines}>
        {[...Array(4)].map((_, i) => (
          <span key={i} className={styles.heroLine} style={{ animationDelay: `${i * 2}s`, left: `${15 + i * 22}%` }} />
        ))}
      </div>
      <div className={styles.heroParticles}>
        {[...Array(8)].map((_, i) => (
          <span key={i} className={styles.particle} style={{ animationDelay: `${i * 0.9}s`, left: `${5 + i * 12}%` }} />
        ))}
      </div>

      <div className={styles.heroBadge}>
        <Crown size={10} />
        <span>ECOSSISTEMA PREMIUM</span>
      </div>

      <h1 className={styles.heroTitle}>
        <span className={styles.heroTitleThin}>Nossas</span>
        <span className={styles.heroTitleBold}>Ferramentas</span>
      </h1>

      <p className={styles.heroSub}>
        4 plataformas integradas para dominar cada aspecto do jogo
      </p>

      <div className={styles.heroStats}>
        <div className={styles.heroStat}>
          <span className={styles.heroStatNum}>4</span>
          <span className={styles.heroStatLabel}>Plataformas</span>
        </div>
        <div className={styles.heroStatDivider} />
        <div className={styles.heroStat}>
          <span className={styles.heroStatNum}>20+</span>
          <span className={styles.heroStatLabel}>Recursos</span>
        </div>
        <div className={styles.heroStatDivider} />
        <div className={styles.heroStat}>
          <span className={styles.heroStatNum}>24/7</span>
          <span className={styles.heroStatLabel}>Tempo Real</span>
        </div>
      </div>
    </header>

    {/* ═══ TOOL CARDS ═══ */}
    <div className={styles.grid}>
      {TOOLS.map((tool, idx) => {
        const Icon = tool.icon;
        return (
          <article key={tool.id} className={styles.card} style={{ '--card-color': tool.color, '--card-rgb': tool.colorRgb, animationDelay: `${idx * 0.12}s` }}>

            {/* background layers */}
            <div className={styles.cardGlow} />
            <div className={styles.cardShine} />
            <div className={styles.cardBorder} />

            {/* number watermark */}
            <span className={styles.cardNumber}>0{idx + 1}</span>

            {/* header */}
            <div className={styles.cardTop}>
              <div className={styles.cardIconRing}>
                <div className={styles.cardIconInner}>
                  <Icon size={26} />
                </div>
              </div>
              <div className={styles.cardMeta}>
                <div className={styles.cardBadge}>
                  <CheckCircle2 size={8} />
                  <span>ATIVA</span>
                </div>
                <h2 className={styles.cardName}>{tool.name}</h2>
                <p className={styles.cardTagline}>{tool.tagline}</p>
              </div>
            </div>

            {/* divider */}
            <div className={styles.cardDivider}>
              <span className={styles.cardDividerDiamond} />
            </div>

            {/* description */}
            <p className={styles.cardDesc}>{tool.desc}</p>

            {/* features */}
            <ul className={styles.cardFeatures}>
              {tool.features.map((f, fi) => {
                const FIcon = f.icon;
                return (
                  <li key={fi} className={styles.cardFeature}>
                    <span className={styles.featureIcon} style={{ '--feat-color': f.color }}>
                      <FIcon size={13} />
                    </span>
                    <span>{f.text}</span>
                  </li>
                );
              })}
            </ul>

            {/* status bar */}
            <div className={styles.cardStatus}>
              <span className={styles.statusPulse} />
              <span className={styles.statusText}>
                {tool.link ? 'Disponivel agora' : 'Voce esta aqui'}
              </span>
              {tool.link ? (
                <a href={tool.link} target="_blank" rel="noopener noreferrer" className={styles.accessBtn} style={{ '--card-color': tool.color, '--card-rgb': tool.colorRgb }}>
                  <span>Acessar</span>
                  <ArrowUpRight size={12} />
                </a>
              ) : (
                <span className={styles.currentTag}>ATUAL</span>
              )}
            </div>
          </article>
        );
      })}
    </div>

    {/* ═══ FOOTER ═══ */}
    <footer className={styles.footer}>
      <div className={styles.footerGlow} />
      <img src={heroImg} alt="" className={styles.footerLogo} />
      <p className={styles.footerBrand}>Smart Analise</p>
      <p className={styles.footerSub}>Tecnologia &amp; Precisao</p>
    </footer>

  </div>
);

export default ToolsPage;
