// pages/TutorialPage.jsx — Tutorial CINEMATIC MAGAZINE · INTERATIVO PREMIUM

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart3, Crosshair, Target, Zap, TrendingUp,
  Eye, Layers, Compass, Flame, Thermometer, Star, Shield,
  Gauge, Crown, ArrowRight, Sparkles, CircleDot,
  Play, RotateCcw, Check, X, ChevronRight, Trophy, HelpCircle, Hand,
  ListChecks, AlertTriangle,
} from 'lucide-react';
import { PHYSICAL_WHEEL } from '../constants/roulette.js';
import heroImg from '../assets/backlogin.png';
import styles from './TutorialPage.module.css';

/* ═══════════════ Dados ═══════════════ */
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const cellBg = { green: '#1f7a4d', red: '#b3271f', black: '#26262b' };
const wheelFill = { green: '#15663f', red: '#9e2018', black: '#161618' };

/* Geometria da roleta SVG (200x200, centro 100,100) */
const STEP = 360 / 37;
const polar = (cx, cy, r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const sectorPath = (cx, cy, rOut, rIn, a0, a1) => {
  const [x0, y0] = polar(cx, cy, rOut, a0);
  const [x1, y1] = polar(cx, cy, rOut, a1);
  const [x2, y2] = polar(cx, cy, rIn, a1);
  const [x3, y3] = polar(cx, cy, rIn, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${large} 0 ${x3},${y3} Z`;
};

// Estratégias com números de demonstração (para o explorador e o simulador)
const STRATEGIES = [
  { Icon: Target,   name: 'Cavalos',  color: '#c9a052', glow: 'rgba(201,160,82,0.08)',
    score: 100, short: 'Duplas no pano',
    desc: 'Analisa pares de numeros adjacentes no pano da mesa que saem juntos com frequencia anormal. Quando uma dupla repete, a estrategia a destaca.',
    nums: [6, 16, 26, 36, 14] },
  { Icon: Layers,   name: 'Setores',  color: '#34d399', glow: 'rgba(52,211,153,0.08)',
    score: 77, short: 'Regioes quentes',
    desc: 'Divide o cilindro em setores e monitora quais regioes recebem mais resultados que o esperado. Um setor quente sugere tendencia mecanica.',
    nums: [13, 16, 26, 8, 18] },
  { Icon: Compass,  name: 'Vizinhos', color: '#60a5fa', glow: 'rgba(96,165,250,0.08)',
    score: 64, short: 'Clusters no cilindro',
    desc: 'Identifica numeros proximos no cilindro fisico que formam clusters estatisticos — grupos de 2 a 5 vizinhos que repetem.',
    nums: [33, 16, 26, 14, 31] },
  { Icon: Eye,      name: 'Ausentes', color: '#f97316', glow: 'rgba(249,115,22,0.08)',
    score: 88, short: 'Numeros atrasados',
    desc: 'Monitora numeros que estao ha muito tempo sem sair. Cada numero deveria aparecer a cada ~37 giros; quem fica muito alem disso vira candidato.',
    nums: [28, 16, 26, 18, 6] },
  { Icon: Crosshair, name: 'Gatilhos', color: '#a78bfa', glow: 'rgba(167,139,250,0.08)',
    score: 52, short: 'Acionadores',
    desc: 'Trata cada numero como acionador: quando ele sai, analisa (chi-quadrado) quais numeros costumam vir logo depois e sugere a regiao mais provavel.',
    nums: [6, 14, 16, 18, 26] },
];

const TEMP_ITEMS = [
  { label: 'QUENTE',   color: '#ef4444', icon: Flame,       desc: 'Padrao muito forte — maior probabilidade de acerto.' },
  { label: 'AQUECIDO', color: '#f97316', icon: Thermometer, desc: 'Padrao forte — boa oportunidade.' },
  { label: 'MORNO',    color: '#c9a052', icon: Thermometer, desc: 'Padrao moderado — opere com cautela.' },
  { label: 'FRIO',     color: '#64748b', icon: Thermometer, desc: 'Padrao fraco — melhor evitar.' },
];

const QUIZ = [
  { q: 'Quantas estrategias precisam concordar para gerar um sinal de entrada?',
    options: ['Apenas 1', '3 ou mais', 'Todas as 5'], answer: 1 },
  { q: 'O que significa a estrategia "Ausentes"?',
    options: ['Numeros que mais saem', 'Numeros ha muito tempo sem sair', 'Numeros vermelhos'], answer: 1 },
  { q: 'Um gatilho marcado como "RED" significa que ele...',
    options: ['Acertou na 1a rodada', 'Nao acertou nas 3 tentativas', 'E um numero vermelho'], answer: 1 },
  { q: 'Qual temperatura indica o padrao mais confiavel?',
    options: ['FRIO', 'MORNO', 'QUENTE'], answer: 2 },
  { q: 'A estrategia "Vizinhos" analisa numeros...',
    options: ['Na ordem 1, 2, 3...', 'Proximos no cilindro fisico', 'Da mesma cor'], answer: 1 },
  { q: 'Por quantas rodadas vale um sinal de entrada do Dashboard?',
    options: ['1 rodada', '2 rodadas', '5 rodadas'], answer: 1 },
  { q: 'O gatilho "Terminal 7" cobre quais numeros?',
    options: ['7, 14, 21', '7, 17, 27', '1, 7, 70'], answer: 1 },
  { q: 'Um gatilho dispara e acerta so na 3a tentativa. Como e marcado?',
    options: ['G1', 'G3', 'RED'], answer: 1 },
  { q: 'Se a assertividade da mesa cai abaixo de 40%, o ideal e...',
    options: ['Apostar o dobro', 'Trocar de mesa', 'Ignorar e continuar'], answer: 1 },
  { q: 'Quanto da banca se recomenda arriscar por entrada?',
    options: ['2-3%', '20-30%', '100%'], answer: 0 },
];

const CHAPTERS = [
  { t: 'Visao Geral',   icon: Sparkles },
  { t: 'Estrategias',   icon: BarChart3 },
  { t: 'Convergencia',  icon: Zap },
  { t: 'Cilindro',      icon: Compass },
  { t: 'Gatilhos',      icon: Crosshair },
  { t: 'Temperatura',   icon: Flame },
  { t: 'Analise',       icon: ListChecks },
  { t: 'Quiz',          icon: HelpCircle },
];

/* ═══════════════ Hooks utilitários ═══════════════ */
// Reveal-on-scroll via IntersectionObserver
const useReveal = () => {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, shown];
};

const Reveal = ({ children, className = '' }) => {
  const [ref, shown] = useReveal();
  return (
    <div ref={ref} className={`${styles.reveal} ${shown ? styles.revealed : ''} ${className}`}>
      {children}
    </div>
  );
};

/* ═══════════════ Widgets interativos ═══════════════ */

// Gauge circular animado
const MiniGauge = ({ value, color }) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf; const start = performance && performance.now ? performance.now() : 0;
    const dur = 700;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const R = 34, C = 2 * Math.PI * R;
  const off = C * (1 - Math.min(100, v) / 100);
  return (
    <div className={styles.gaugeWrap}>
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle cx="46" cy="46" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 46 46)" />
      </svg>
      <div className={styles.gaugeValue} style={{ color }}>{Math.round(v)}<span>%</span></div>
    </div>
  );
};

// Explorador de estrategias: clique para ver gauge + numeros candidatos
const StrategyExplorer = () => {
  const [sel, setSel] = useState(0);
  const s = STRATEGIES[sel];
  return (
    <div className={styles.explorer}>
      <div className={styles.explorerTabs}>
        {STRATEGIES.map((st, i) => (
          <button key={st.name}
            className={`${styles.explorerTab} ${i === sel ? styles.explorerTabActive : ''}`}
            style={{ '--st-color': st.color }}
            onClick={() => setSel(i)}>
            <st.Icon size={15} />
            <span>{st.name}</span>
          </button>
        ))}
      </div>

      <div className={styles.explorerPanel} key={sel} style={{ '--st-color': s.color, '--st-glow': s.glow }}>
        <div className={styles.explorerHead}>
          <MiniGauge value={s.score} color={s.color} />
          <div className={styles.explorerInfo}>
            <div className={styles.explorerName} style={{ color: s.color }}>
              <s.Icon size={16} /> {s.name}
            </div>
            <p className={styles.explorerDesc}>{s.desc}</p>
          </div>
        </div>
        <div className={styles.explorerNumsLabel}>Numeros sugeridos por esta estrategia</div>
        <div className={styles.explorerNums}>
          {s.nums.map((n, i) => (
            <span key={n} className={styles.exNum}
              style={{ background: cellBg[colorOf(n)], borderColor: s.color, animationDelay: `${i * 60}ms` }}>
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// Simulador de convergencia
const ConvergenceSim = () => {
  const [phase, setPhase] = useState(0); // 0 idle, 1..5 estrategias, 6 resultado
  const timers = useRef([]);

  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearAll(), []);

  const run = () => {
    clearAll();
    setPhase(0);
    for (let i = 1; i <= 6; i++) {
      timers.current.push(setTimeout(() => setPhase(i), i * 650));
    }
  };

  // Conta quantas estrategias (até a fase atual) escolheram cada número
  const counts = {};
  STRATEGIES.slice(0, Math.min(phase, 5)).forEach(st =>
    st.nums.forEach(n => { counts[n] = (counts[n] || 0) + 1; }));
  const converged = Object.keys(counts).filter(n => counts[n] >= 3).map(Number).sort((a, b) => a - b);
  const done = phase >= 6;

  return (
    <div className={styles.convSim}>
      <div className={styles.convStrategies}>
        {STRATEGIES.map((st, i) => (
          <div key={st.name}
            className={`${styles.convChip} ${phase > i ? styles.convChipOn : ''}`}
            style={{ '--st-color': st.color }}>
            <st.Icon size={13} />
            <span>{st.name}</span>
            {phase > i && <Check size={12} className={styles.convCheck} />}
          </div>
        ))}
      </div>

      <div className={styles.convBoard}>
        {Array.from({ length: 37 }, (_, n) => {
          const c = counts[n] || 0;
          const isConv = done && c >= 3;
          return (
            <div key={n}
              className={`${styles.convNum} ${c > 0 ? styles.convNumHit : ''} ${isConv ? styles.convNumConv : ''}`}
              style={{ '--hit': c, background: c > 0 ? cellBg[colorOf(n)] : undefined }}>
              {n}
              {c > 1 && <span className={styles.convCount}>{c}</span>}
            </div>
          );
        })}
      </div>

      {done && (
        <div className={styles.convSignal}>
          <div className={styles.convSignalHead}>
            <Zap size={14} /> SINAL DE ENTRADA GERADO
          </div>
          <div className={styles.convSignalNums}>
            {converged.map(n => (
              <span key={n} style={{ background: cellBg[colorOf(n)] }}>{n}</span>
            ))}
          </div>
          <p className={styles.convSignalNote}>
            {converged.length} numeros bateram em 3+ estrategias — convergencia forte.
          </p>
        </div>
      )}

      <button className={styles.convBtn} onClick={run}>
        {phase === 0 ? <><Play size={14} /> Simular convergencia</> : <><RotateCcw size={14} /> Simular novamente</>}
      </button>
    </div>
  );
};

// Demo do cilindro: clique num numero e veja vizinhos + terminal
const WheelDemo = () => {
  const [sel, setSel] = useState(17);
  const idx = PHYSICAL_WHEEL.indexOf(sel);
  const neighbors = new Set();
  if (idx >= 0) {
    for (let d = 1; d <= 2; d++) {
      neighbors.add(PHYSICAL_WHEEL[(idx + d) % 37]);
      neighbors.add(PHYSICAL_WHEEL[(idx - d + 37) % 37]);
    }
  }
  const term = sel % 10;
  const terminalNums = PHYSICAL_WHEEL.filter(n => n % 10 === term && n !== sel);

  return (
    <div className={styles.wheelDemo}>
      <div className={styles.wheelHint}><Hand size={12} /> Toque em um numero</div>
      <div className={styles.wheelStrip}>
        {PHYSICAL_WHEEL.map(n => {
          const active = n === sel;
          const isN = neighbors.has(n);
          const isT = !isN && !active && n % 10 === term;
          return (
            <button key={n}
              className={`${styles.wheelNum} ${active ? styles.wheelActive : ''} ${isN ? styles.wheelNeighbor : ''} ${isT ? styles.wheelTerminal : ''}`}
              style={{ background: cellBg[colorOf(n)] }}
              onClick={() => setSel(n)}>
              {n}
            </button>
          );
        })}
      </div>
      <div className={styles.wheelLegend}>
        <span><i style={{ background: '#c9a052' }} /> Selecionado: <strong>{sel}</strong></span>
        <span><i style={{ background: '#60a5fa' }} /> Vizinhos (±2): <strong>{[...neighbors].join(', ')}</strong></span>
        <span><i style={{ background: '#a78bfa' }} /> Terminal {term}: <strong>{terminalNums.length ? terminalNums.join(', ') : '—'}</strong></span>
      </div>
    </div>
  );
};

// Medidor de temperatura arrastavel
const TempMeter = () => {
  const [val, setVal] = useState(85);
  const band = val >= 75 ? 0 : val >= 50 ? 1 : val >= 25 ? 2 : 3;
  const t = TEMP_ITEMS[band];
  const TIcon = t.icon;
  return (
    <div className={styles.tempMeter}>
      <div className={styles.tempReadout} style={{ '--temp-color': t.color }}>
        <div className={styles.tempIconRing} style={{ borderColor: t.color }}>
          <TIcon size={22} style={{ color: t.color }} />
        </div>
        <div>
          <div className={styles.tempReadName} style={{ color: t.color }}>{t.label}</div>
          <div className={styles.tempReadDesc}>{t.desc}</div>
        </div>
      </div>
      <input type="range" min="0" max="100" value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        className={styles.tempSlider}
        style={{ '--temp-color': t.color, '--fill': `${val}%` }} />
      <div className={styles.tempScale}>
        {TEMP_ITEMS.map((it, i) => (
          <span key={it.label} style={{ color: i === band ? it.color : 'rgba(255,255,255,0.25)' }}>{it.label}</span>
        )).reverse()}
      </div>
    </div>
  );
};

// Quiz interativo
const Quiz = () => {
  const [answers, setAnswers] = useState({}); // {qIndex: optIndex}
  const score = Object.entries(answers).filter(([qi, oi]) => QUIZ[qi].answer === oi).length;
  const allAnswered = Object.keys(answers).length === QUIZ.length;
  const pass = score >= QUIZ.length - 3; // 7/10+

  const choose = (qi, oi) => {
    if (answers[qi] !== undefined) return; // trava após responder
    setAnswers(prev => ({ ...prev, [qi]: oi }));
  };
  const reset = () => setAnswers({});

  return (
    <div className={styles.quiz}>
      {QUIZ.map((item, qi) => {
        const chosen = answers[qi];
        const answered = chosen !== undefined;
        return (
          <div key={qi} className={styles.quizQ}>
            <div className={styles.quizQTitle}><span>{qi + 1}</span>{item.q}</div>
            <div className={styles.quizOpts}>
              {item.options.map((opt, oi) => {
                const isAnswer = oi === item.answer;
                const isChosen = oi === chosen;
                let cls = styles.quizOpt;
                if (answered && isAnswer) cls += ` ${styles.quizOptCorrect}`;
                else if (answered && isChosen && !isAnswer) cls += ` ${styles.quizOptWrong}`;
                return (
                  <button key={oi} className={cls} disabled={answered} onClick={() => choose(qi, oi)}>
                    <span className={styles.quizOptText}>{opt}</span>
                    {answered && isAnswer && <Check size={14} />}
                    {answered && isChosen && !isAnswer && <X size={14} />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {allAnswered && (
        <div className={styles.quizResult}>
          {score === QUIZ.length && (
            <div className={styles.burst}>
              {[...Array(16)].map((_, i) => (
                <span key={i} style={{ '--i': i, '--rot': `${(360 / 16) * i}deg` }} />
              ))}
            </div>
          )}
          <Trophy size={20} style={{ color: pass ? '#34d399' : '#c9a052' }} />
          <div>
            <strong>{score}/{QUIZ.length} corretas</strong>
            <p>{score === QUIZ.length ? 'Perfeito! Voce dominou a ferramenta.'
              : pass ? 'Muito bom! Voce esta pronto para operar.'
              : 'Vale a pena reler os capitulos acima.'}</p>
          </div>
          <button className={styles.quizBtn} onClick={reset}><RotateCcw size={13} /> Refazer</button>
        </div>
      )}
    </div>
  );
};

// Roteiro de análise — checklist interativo (sugestões de análise)
const ANALYSIS_STEPS = [
  { Icon: Zap, title: 'Confirme a convergencia', text: 'So considere entrar quando 3+ estrategias apontarem os mesmos numeros. Convergencia fraca = sinal fraco.' },
  { Icon: Flame, title: 'Cheque a temperatura', text: 'Priorize sinais QUENTE ou AQUECIDO. Ignore os FRIOS, por mais tentador que pareca.' },
  { Icon: Gauge, title: 'Olhe o placar da mesa', text: 'Veja o WIN/LOSS recente. Mesa com assertividade alta e mais confiavel para operar agora.' },
  { Icon: Crosshair, title: 'Valide o gatilho ativo', text: 'Confira a porcentagem individual do gatilho que disparou. Abaixo de 40%, melhor esperar.' },
  { Icon: TrendingUp, title: 'Cruze as janelas', text: 'Poucas rodadas = padrao recente; muitas = padrao consolidado. Use as duas visoes antes de decidir.' },
  { Icon: Shield, title: 'Gestao de banca', text: 'Aposte no maximo 2-3% da banca por entrada. Disciplina vale mais que qualquer sinal.' },
];

const AnalysisChecklist = () => {
  const [done, setDone] = useState(() => new Set());
  const toggle = (i) => setDone(prev => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  return (
    <div className={styles.checklist}>
      <div className={styles.checklistHead}>
        <ListChecks size={14} />
        <span>Roteiro de Analise</span>
        <span className={styles.checklistCount}>{done.size}/{ANALYSIS_STEPS.length}</span>
      </div>
      {ANALYSIS_STEPS.map((s, i) => {
        const on = done.has(i);
        return (
          <button key={i} className={`${styles.checkItem} ${on ? styles.checkItemOn : ''}`} onClick={() => toggle(i)}>
            <span className={styles.checkBox}>{on && <Check size={12} />}</span>
            <span className={styles.checkIcon}><s.Icon size={15} /></span>
            <span className={styles.checkText}>
              <strong>{i + 1}. {s.title}</strong>
              <span>{s.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

// Roleta europeia girável — showstopper
const RouletteWheel = () => {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const k = Math.floor(Math.random() * 37);
    const desiredMod = (((360 - k * STEP) % 360) + 360) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = (((desiredMod - currentMod) % 360) + 360) % 360;
    const target = rotation + 360 * 6 + delta;
    setRotation(target);
    timer.current = setTimeout(() => {
      const num = PHYSICAL_WHEEL[k];
      setResult(num);
      setHistory(h => [num, ...h].slice(0, 9));
      setSpinning(false);
    }, 4700);
  };

  const resColor = result != null ? colorOf(result) : null;

  return (
    <section className={styles.wheelExp}>
      <div className={styles.wheelExpHead}>
        <span className={styles.wheelExpKicker}>Experimente</span>
        <h2 className={styles.wheelExpTitle}>Gire a Roleta</h2>
        <p className={styles.wheelExpSub}>Toque no centro e veja onde a bola para — exatamente como nas mesas que a ferramenta analisa.</p>
      </div>

      <div className={styles.wheelStage}>
        <div className={styles.wheelPointer} />
        <div className={`${styles.wheelGlow} ${spinning ? styles.wheelGlowOn : ''}`} />
        <svg viewBox="0 0 200 200" className={styles.wheelSvg} aria-hidden="true">
          <defs>
            <radialGradient id="wheelRim" cx="50%" cy="42%" r="58%">
              <stop offset="83%" stopColor="#241809" />
              <stop offset="89%" stopColor="#f0d18a" />
              <stop offset="92%" stopColor="#c9a052" />
              <stop offset="96%" stopColor="#7a5a24" />
              <stop offset="100%" stopColor="#1c1308" />
            </radialGradient>
            <radialGradient id="wheelHub" cx="50%" cy="36%" r="70%">
              <stop offset="0%" stopColor="#2a1f10" />
              <stop offset="100%" stopColor="#080604" />
            </radialGradient>
          </defs>
          {/* Aro dourado + faixa interna escura */}
          <circle cx="100" cy="100" r="99" fill="url(#wheelRim)" />
          <circle cx="100" cy="100" r="91" fill="#0f0a04" />
          <g className={styles.wheelRotor} style={{ transform: `rotate(${rotation}deg)` }}>
            {/* Casas */}
            {PHYSICAL_WHEEL.map((n, i) => (
              <path key={`s${n}`} d={sectorPath(100, 100, 90, 53, i * STEP - STEP / 2, i * STEP + STEP / 2)}
                fill={wheelFill[colorOf(n)]} />
            ))}
            {/* Frets dourados (divisorias metalicas entre as casas) */}
            {PHYSICAL_WHEEL.map((n, i) => {
              const b = i * STEP - STEP / 2;
              const [x0, y0] = polar(100, 100, 53, b);
              const [x1, y1] = polar(100, 100, 90, b);
              return <line key={`f${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(214,176,98,0.6)" strokeWidth="0.7" />;
            })}
            {/* Numeros */}
            {PHYSICAL_WHEEL.map((n, i) => (
              <text key={`t${n}`} x="100" y="20.6" fontSize="8" fontWeight="800"
                fill="#fdfaf2" textAnchor="middle"
                transform={`rotate(${i * STEP} 100 100)`}>{n}</text>
            ))}
            <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(214,176,98,0.55)" strokeWidth="0.9" />
            <circle cx="100" cy="100" r="53" fill="none" stroke="rgba(214,176,98,0.55)" strokeWidth="0.9" />
          </g>
          {/* Cubo central */}
          <circle cx="100" cy="100" r="48" fill="url(#wheelHub)" stroke="rgba(214,176,98,0.45)" strokeWidth="1.4" />
          <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(214,176,98,0.18)" strokeWidth="0.8" />
        </svg>

        <button className={styles.wheelHub} onClick={spin} disabled={spinning}>
          {result != null ? (
            <span className={styles.wheelHubResult} style={{ color: resColor === 'red' ? '#ff7a6e' : resColor === 'green' ? '#4ade80' : '#eaeaee' }}>
              {result}
            </span>
          ) : spinning ? (
            <span className={styles.wheelHubSpin}><span /><span /><span /></span>
          ) : (
            <span className={styles.wheelHubGo}><Play size={15} /> GIRAR</span>
          )}
        </button>
      </div>

      <div className={styles.wheelHistory}>
        <span className={styles.wheelHistoryLabel}>Resultados</span>
        <div className={styles.wheelHistoryRow}>
          {history.length === 0 && <span className={styles.wheelHistoryEmpty}>— gire para comecar —</span>}
          {history.map((n, i) => (
            <span key={i} className={styles.wheelChip} style={{ background: cellBg[colorOf(n)] }}>{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ═══════════════ Página ═══════════════ */
const TutorialPage = () => {
  const rootRef = useRef(null);
  const sectionRefs = useRef([]);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);

  // Barra de progresso de leitura (captura scroll de qualquer container)
  useEffect(() => {
    const onScroll = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const total = rect.height - vh;
      const scrolled = -rect.top;
      const p = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;
      setProgress(p);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Scrollspy do sumario
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const i = Number(e.target.dataset.sec);
          if (!Number.isNaN(i)) setActive(i);
        }
      });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: 0 });
    sectionRefs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const goTo = (i) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const setRef = (i) => (el) => { sectionRefs.current[i] = el; };

  // Glow que segue o cursor na capa
  const coverRef = useRef(null);
  const onCoverMove = useCallback((e) => {
    const el = coverRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  return (
    <div className={styles.magazine} ref={rootRef}>
      {/* Barra de progresso */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* ═══ HERO: CAPA + ROLETA LADO A LADO ═══ */}
      <div className={styles.hero}>
      {/* ═══ CAPA ═══ */}
      <header className={styles.cover} ref={coverRef} onMouseMove={onCoverMove}>
        <div className={styles.coverCursor} />
        <div className={styles.coverVignette} />
        <div className={styles.coverGlow} />
        <div className={styles.coverParticles}>
          {[...Array(6)].map((_, i) => (
            <span key={i} className={styles.particle} style={{ animationDelay: `${i * 0.8}s`, left: `${15 + i * 14}%` }} />
          ))}
        </div>
        <img src={heroImg} alt="Smart Analise" className={styles.coverLogo} />
        <div className={styles.coverBadge}><Crown size={10} /><span>PREMIUM</span></div>
        <h1 className={styles.coverTitle}>
          <span className={styles.coverTitleLine}>Guia</span>
          <span className={styles.coverTitleAccent}>Interativo</span>
        </h1>
        <p className={styles.coverTagline}>Aprenda a dominar a ferramenta — tocando, simulando e testando.</p>
        <button className={styles.coverCta} onClick={() => goTo(0)}>
          Comecar agora <ChevronRight size={15} />
        </button>
        <div className={styles.coverEdition}>
          <span className={styles.editionLine} /><span>SMART ANALISE</span>
          <span className={styles.coverDot} /><span>EDICAO UNICA</span><span className={styles.editionLine} />
        </div>
      </header>

      {/* ═══ ROLETA INTERATIVA (hero) ═══ */}
      <RouletteWheel />
      </div>

      {/* ═══ SUMARIO (scrollspy) ═══ */}
      <nav className={styles.toc}>
        <div className={styles.tocHeader}>
          <span className={styles.tocLine} /><h2 className={styles.tocTitle}>Sumario</h2><span className={styles.tocLine} />
        </div>
        <div className={styles.tocGrid}>
          {CHAPTERS.map((item, i) => {
            const TocIcon = item.icon;
            return (
              <button key={i} onClick={() => goTo(i)}
                className={`${styles.tocItem} ${active === i ? styles.tocItemActive : ''}`}>
                <span className={styles.tocNum}>0{i + 1}</span>
                <TocIcon size={13} className={styles.tocIcon} />
                <span className={styles.tocLabel}>{item.t}</span>
                <ArrowRight size={11} className={styles.tocArrow} />
              </button>
            );
          })}
        </div>
      </nav>

      {/* ═══ 01 — VISAO GERAL ═══ */}
      <article id="sec-0" data-sec="0" ref={setRef(0)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>01</span></div>
            <div><h2 className={styles.chapterTitle}>Visao Geral</h2><p className={styles.chapterSub}>Como a ferramenta funciona</p></div>
          </div>
        </Reveal>
        <Reveal>
          <div className={styles.articleBody}>
            <p className={styles.leadText}>
              <span className={styles.dropCap}>A</span>
              Smart Analise e um sistema de analise estatistica de roletas ao vivo. Ela monitora
              centenas de resultados em tempo real, identifica padroes e gera sinais de entrada
              com base em dados — nao em sorte.
            </p>
            <div className={styles.pullQuote}>
              <Sparkles size={16} className={styles.quoteIcon} />
              <p>"Quando a ferramenta detecta um padrao forte, ela gera um sinal com os numeros recomendados para apostar."</p>
            </div>
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
                <p>Quando um numero sai, indica quais tem mais chance de sair em seguida.</p>
              </div>
            </div>
          </div>
        </Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 02 — ESTRATEGIAS (explorador) ═══ */}
      <article id="sec-1" data-sec="1" ref={setRef(1)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>02</span></div>
            <div><h2 className={styles.chapterTitle}>As 5 Estrategias</h2><p className={styles.chapterSub}>Toque para explorar cada uma</p></div>
          </div>
        </Reveal>
        <Reveal>
          <p className={styles.bodyText}>
            O Dashboard combina <strong>5 estrategias independentes</strong>. Cada uma analisa os
            resultados de um angulo diferente e sugere seus proprios numeros. Selecione abaixo:
          </p>
        </Reveal>
        <Reveal><StrategyExplorer /></Reveal>
        <Reveal>
          <div className={styles.infoBox}>
            <Gauge size={16} className={styles.infoBoxIcon} />
            <div>
              <strong>O ponteiro</strong> de cada estrategia mostra a forca do padrao atual (0–100%).
              Quanto mais alto, mais "carregada" esta a estrategia.
            </div>
          </div>
        </Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 03 — CONVERGENCIA (simulador) ═══ */}
      <article id="sec-2" data-sec="2" ref={setRef(2)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>03</span></div>
            <div><h2 className={styles.chapterTitle}>Convergencia</h2><p className={styles.chapterSub}>Onde nasce o sinal</p></div>
          </div>
        </Reveal>
        <Reveal>
          <p className={styles.bodyText}>
            A forca do Dashboard esta na <strong>convergencia</strong>: quando um mesmo numero e apontado
            por <strong>3 ou mais</strong> estrategias ao mesmo tempo, ele entra no sinal. Rode a simulacao
            e veja os numeros se acenderem:
          </p>
        </Reveal>
        <Reveal><ConvergenceSim /></Reveal>
        <Reveal>
          <div className={styles.infoBox}>
            <Zap size={16} className={styles.infoBoxIcon} />
            <div>
              <strong>Sinal de Entrada:</strong> voce tem 2 rodadas para apostar nos numeros sugeridos.
              O placar (WIN/LOSS) e calculado em 3 modos: numero exato, com 1 vizinho e com 2 vizinhos.
            </div>
          </div>
        </Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 04 — CILINDRO (wheel demo) ═══ */}
      <article id="sec-3" data-sec="3" ref={setRef(3)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>04</span></div>
            <div><h2 className={styles.chapterTitle}>Vizinhos & Terminais</h2><p className={styles.chapterSub}>Entenda o cilindro</p></div>
          </div>
        </Reveal>
        <Reveal>
          <p className={styles.bodyText}>
            Muitas estrategias trabalham com a posicao fisica dos numeros no cilindro (nao na ordem 1-36).
            <strong> Vizinhos</strong> sao os numeros ao lado no cilindro; <strong>terminal</strong> e o
            ultimo digito (terminal 7 = 7, 17, 27). Toque num numero:
          </p>
        </Reveal>
        <Reveal><WheelDemo /></Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 05 — GATILHOS ═══ */}
      <article id="sec-4" data-sec="4" ref={setRef(4)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>05</span></div>
            <div><h2 className={styles.chapterTitle}>Gatilhos</h2><p className={styles.chapterSub}>Numeros que acionam apostas</p></div>
          </div>
        </Reveal>
        <Reveal>
          <p className={styles.leadText}>
            <span className={styles.dropCap}>C</span>
            ada numero pode ser um gatilho. Quando ele sai, a ferramenta analisa o historico
            (chi-quadrado, p &lt; 0.05) e indica quais numeros tem mais chance de sair nas proximas 3 rodadas.
          </p>
        </Reveal>

        <Reveal>
          <h3 className={styles.subHeading}><CircleDot size={14} /> Os 2 tipos de gatilho</h3>
          <div className={styles.twoCards}>
            <div className={styles.featureCard}>
              <div className={styles.featureIconWrap} style={{ background: 'rgba(96,165,250,0.06)', borderColor: 'rgba(96,165,250,0.15)' }}>
                <Crosshair size={24} style={{ color: '#60a5fa' }} />
              </div>
              <h4>Regiao</h4>
              <p>Baseado em vizinhos no cilindro fisico. Testa raios de 2 a 5 vizinhos ao redor do numero. Ex.: "17 com 3 vizinhos" cobre o 17 e os 3 de cada lado (7 numeros).</p>
              <div className={styles.featureSubtypes}>
                <span><strong>Curta</strong> (2-3 viz): area menor, mais precisa.</span>
                <span><strong>Larga</strong> (4-5 viz): area maior, mais cobertura.</span>
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIconWrap} style={{ background: 'rgba(167,139,250,0.06)', borderColor: 'rgba(167,139,250,0.15)' }}>
                <Target size={24} style={{ color: '#a78bfa' }} />
              </div>
              <h4>Terminal</h4>
              <p>Baseado no ultimo digito. Terminal 7 cobre 7, 17, 27. Pode ser combinado com vizinhos para ampliar a cobertura.</p>
              <div className={styles.featureSubtypes}>
                <span><strong>Puro</strong>: so os numeros do terminal (3-4).</span>
                <span><strong>+ Vizinhos</strong>: terminal expandido com 1-2 vizinhos.</span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <h3 className={styles.subHeading}><CircleDot size={14} /> Porcentagem individual</h3>
          <p className={styles.bodyText}>
            Cada gatilho tem sua propria taxa de acerto, calculada separadamente. Ao expandir uma
            categoria na tabela de assertividade, voce ve o desempenho de cada numero (ex.: "17 → 65%, 11/17"),
            o que ajuda a identificar quais gatilhos sao mais confiaveis na mesa atual.
          </p>
        </Reveal>

        <Reveal>
          <h3 className={styles.subHeading}><CircleDot size={14} /> Assertividade — G1 / G2 / G3 / RED</h3>
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
            <div><strong>Dica:</strong> priorize gatilhos com alta porcentagem individual e temperatura QUENTE ou AQUECIDO. Abaixo de 40%, evite.</div>
          </div>
        </Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 06 — TEMPERATURA (medidor) ═══ */}
      <article id="sec-5" data-sec="5" ref={setRef(5)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>06</span></div>
            <div><h2 className={styles.chapterTitle}>Temperatura</h2><p className={styles.chapterSub}>Arraste e veja a forca</p></div>
          </div>
        </Reveal>
        <Reveal>
          <p className={styles.bodyText}>
            Cada padrao recebe um label de temperatura que indica sua forca estatistica.
            Arraste o controle para ver cada nivel:
          </p>
        </Reveal>
        <Reveal><TempMeter /></Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 07 — SUGESTOES DE ANALISE ═══ */}
      <article id="sec-6" data-sec="6" ref={setRef(6)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>07</span></div>
            <div><h2 className={styles.chapterTitle}>Sugestoes de Analise</h2><p className={styles.chapterSub}>Como ler a ferramenta na pratica</p></div>
          </div>
        </Reveal>
        <Reveal>
          <p className={styles.bodyText}>
            A ferramenta entrega os dados — a leitura e com voce. Siga este roteiro antes de cada entrada.
            Toque para marcar cada passo conforme confere:
          </p>
        </Reveal>
        <Reveal><AnalysisChecklist /></Reveal>
        <Reveal>
          <div className={styles.alertBox}>
            <AlertTriangle size={16} className={styles.alertBoxIcon} />
            <div>
              <strong>Sinais de alerta — quando NAO entrar:</strong> convergencia abaixo de 3 estrategias,
              temperatura FRIA, mesa com placar recente negativo, ou gatilho com menos de 40% de acerto.
              Na duvida, espere o proximo sinal — a paciencia protege a banca.
            </div>
          </div>
        </Reveal>
        <Reveal>
          <div className={styles.infoBox}>
            <Star size={16} className={styles.infoBoxIcon} />
            <div><strong>Regra de ouro:</strong> nenhum sinal e garantia. O objetivo e operar onde a probabilidade esta a seu favor, com disciplina e gestao — nao perseguir todas as rodadas.</div>
          </div>
        </Reveal>
      </article>

      <div className={styles.divider}><span className={styles.dividerDiamond} /></div>

      {/* ═══ 08 — QUIZ ═══ */}
      <article id="sec-7" data-sec="7" ref={setRef(7)} className={styles.article}>
        <Reveal>
          <div className={styles.articleHead}>
            <div className={styles.chapterBadge}><span className={styles.chapterNum}>08</span></div>
            <div><h2 className={styles.chapterTitle}>Teste seu Conhecimento</h2><p className={styles.chapterSub}>10 perguntas rapidas</p></div>
          </div>
        </Reveal>
        <Reveal><Quiz /></Reveal>
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
};

export default TutorialPage;
