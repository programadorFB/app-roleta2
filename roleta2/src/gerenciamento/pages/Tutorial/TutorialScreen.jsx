import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdDashboard,
  MdArrowBack,
  MdHelpOutline,
} from 'react-icons/md';
import {
  FaChartLine,
  FaBullseye,
  FaUserTie,
  FaFileExport,
  FaRegCalendarAlt,
  FaMoneyBillWave,
  FaRedoAlt,
} from 'react-icons/fa';
import { FiDownload } from 'react-icons/fi';
import styles from './TutorialScreen.module.css';

const TOOLS = [
  {
    icon: <MdDashboard size={20} />,
    title: 'Dashboard',
    what: 'A tela inicial: visão geral da sua banca.',
    how: [
      'Banca Inicial, Saldo Atual e Lucro Real no topo.',
      'Gestão de Risco diária: Win Diário (meta do dia) e Limite de Perda.',
      'Calendário do mês e suas Transações Recentes.',
    ],
  },
  {
    icon: <FiDownload size={20} />,
    title: 'Lançamentos',
    what: 'Onde você registra cada movimento da banca.',
    how: [
      'Escolha o tipo: Depósito, Saque, Ganho ou Perda.',
      'Informe o valor, a data e (opcional) categoria e descrição.',
      'Ganho/Perda mexem no resultado; Depósito/Saque mexem na banca.',
    ],
  },
  {
    icon: <FaRegCalendarAlt size={18} />,
    title: 'Calendário',
    what: 'Visualize seus resultados dia a dia.',
    how: [
      'Cada dia mostra os totais de ganhos, perdas, depósitos e saques.',
      'Clique em um dia para ver/editar as transações e escrever uma anotação.',
      'O dia atual fica destacado em vermelho.',
    ],
  },
  {
    icon: <FaBullseye size={17} />,
    title: 'Objetivos',
    what: 'Defina metas de lucro e acompanhe o progresso.',
    how: [
      'Crie um objetivo com um valor-alvo.',
      'O progresso é calculado pelo seu lucro real (ganhos − perdas).',
      'Conclua ou exclua objetivos quando quiser.',
    ],
  },
  {
    icon: <FaUserTie size={17} />,
    title: 'Perfil de Investimento',
    what: 'Configura seu estilo de jogo e a proteção da banca.',
    how: [
      'Defina o nível de risco (1 a 10) — ele determina a meta diária.',
      'Configure o Limite de Perda (stop loss) em % da banca.',
      'Salve para aplicar; os valores aparecem no Dashboard.',
    ],
  },
  {
    icon: <FaChartLine size={17} />,
    title: 'Análise',
    what: 'Estatísticas de desempenho da sua banca.',
    how: [
      'Taxa de acerto (win rate), sequências e evolução do saldo.',
      'Use para entender seus padrões ao longo do tempo.',
    ],
  },
  {
    icon: <FaFileExport size={17} />,
    title: 'Gerar relatório',
    what: 'Exporta um resumo financeiro em PDF.',
    how: [
      'Gera saldo inicial/final, total de ganhos e perdas e lista de transações.',
      'Útil para guardar ou compartilhar seu histórico.',
    ],
  },
  {
    icon: <FaRedoAlt size={16} />,
    title: 'Resetar dados',
    what: 'Botão ↻ no topo do Dashboard abre as opções de reset.',
    how: [
      'Resetar banca: saldo atual vira a nova banca inicial (apaga histórico).',
      'Resetar valores do dia: zera só os ganhos/perdas de hoje.',
      'Resetar tudo: apaga tudo e zera a banca (R$ 0).',
    ],
  },
];

const TutorialScreen = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/dashboard')}>
          <MdArrowBack size={20} /> Voltar
        </button>
        <h2 className={styles.headerTitle}>
          <MdHelpOutline size={18} /> Tutorial
        </h2>
        <div className={styles.headerRight} />
      </header>

      <main className={styles.content}>
        <div className={styles.intro}>
          <h1 className={styles.introTitle}>Como usar o Gerenciamento</h1>
          <p className={styles.introText}>
            Um guia rápido de cada ferramenta. Toque em uma seção do menu para começar a usar.
          </p>
        </div>

        <div className={styles.grid}>
          {TOOLS.map((tool) => (
            <section key={tool.title} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>{tool.icon}</span>
                <h3 className={styles.cardTitle}>{tool.title}</h3>
              </div>
              <p className={styles.cardWhat}>{tool.what}</p>
              <ul className={styles.cardList}>
                {tool.how.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
};

export default TutorialScreen;
