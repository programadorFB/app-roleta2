/**
 * creditCollector.js — Coletor do histórico de banca (o `credit` da casa).
 *
 * O QUE FAZ
 * ─────────
 * De 5 em 5 minutos, relê o saldo de quem está com o app aberto e grava um
 * ponto na série quando o número muda. É o que transforma o retrato de
 * `platform_profiles.saldo` numa curva — sem ele, o painel só sabe dizer quanto
 * a pessoa tem AGORA, nunca o que aconteceu com o dinheiro dela.
 *
 * DE ONDE VEM O TOKEN
 * ───────────────────
 * Do handshake do Socket.IO. O app já conecta com `auth: { token, email }` (ver
 * `useAnalysisSocket.js`), então enquanto a aba está aberta o servidor tem, em
 * memória, a credencial necessária para perguntar à casa o saldo daquela pessoa
 * — que é a única forma de perguntar: a API v2 não tem rota de servidor para
 * consultar terceiros, só responde com o JWT do próprio dono da conta.
 *
 * Consequência que o painel precisa dizer em voz alta: **só há leitura enquanto
 * a pessoa está com o app aberto**. Buraco no gráfico é app fechado, não saldo
 * parado. Guardar o token para ler depois resolveria isso e é exatamente o que
 * não se faz aqui — o espelho existe para saber quem a pessoa é, nunca para
 * poder agir como ela. O token vive o tempo da conexão e some com ela.
 *
 * POR QUE SÓ OS SOCKETS LOCAIS
 * ────────────────────────────
 * `io.fetchSockets()` traz o cluster inteiro, mas serializa o handshake — ou
 * seja, faria o JWT de cada usuário trafegar pelo Redis a cada varredura. Cada
 * worker do PM2 varre os SEUS sockets: nenhuma credencial sai do processo e a
 * carga se divide sozinha entre os workers.
 *
 * Ao contrário do loop de fetch das roletas, este job roda em TODOS os workers
 * de propósito: cada um só enxerga as próprias conexões.
 */

import { sincronizarCarteira } from './platformProfileService.js';

// 5 minutos. Curto o bastante para pegar uma sequência de apostas, longo o
// bastante para a casa não sentir: 200 pessoas online = 0,67 requisição/s.
const INTERVALO_MS = Number(process.env.CREDIT_POLL_INTERVAL_MS) || 5 * 60 * 1000;

// Piso entre duas leituras da MESMA pessoa neste worker. Existe por causa de
// reconexão: cair e voltar não pode virar uma leitura extra a cada vez.
const GAP_MINIMO_MS = Number(process.env.CREDIT_MIN_GAP_MS) || 4 * 60 * 1000;

// Quantas idas à casa ao mesmo tempo. A varredura não tem pressa — o que não
// pode é virar uma rajada de 200 requisições simultâneas contra o parceiro.
const CONCORRENCIA = Number(process.env.CREDIT_POLL_CONCURRENCY) || 4;

// Teto de pessoas por varredura. Vale como freio de emergência: com uma base
// muito maior do que o previsto, é melhor ler uma parte a cada ciclo do que
// derrubar a API da casa (e a próxima varredura pega quem sobrou).
const TETO_POR_CICLO = Number(process.env.CREDIT_POLL_MAX || 300);

export const creditCollectorStats = {
  ciclos: 0, lidos: 0, gravados: 0, falhas: 0, ultimoCiclo: null, ultimoTotal: 0,
};

// email -> timestamp da última leitura NESTE worker. Some no restart, e isso
// não é problema: o pior que acontece é uma leitura a mais depois do deploy.
const ultimaLeitura = new Map();

/** Quem está com o app aberto NESTE worker, com o token da conexão. */
function onlineComToken(io) {
  const porEmail = new Map();

  for (const socket of io.of('/').sockets.values()) {
    const email = socket.userEmail;
    const token = socket.handshake?.auth?.token;
    // Sem e-mail (fail-open do middleware de auth) ou sem token não há o que
    // perguntar à casa. Duas abas da mesma pessoa viram uma leitura só.
    if (email && token && !porEmail.has(email)) porEmail.set(email, token);
  }

  return porEmail;
}

/** Roda `tarefa` sobre `itens` com no máximo `limite` em voo. */
async function comLimite(itens, limite, tarefa) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    while (fila.length) {
      const item = fila.shift();
      await tarefa(item);
    }
  });
  await Promise.all(trabalhadores);
}

/** Uma varredura. Nunca lança — é chamada de dentro de um setInterval. */
export async function coletarCreditos(io) {
  const agora = Date.now();
  const candidatos = [...onlineComToken(io)]
    .filter(([email]) => agora - (ultimaLeitura.get(email) || 0) >= GAP_MINIMO_MS)
    .slice(0, TETO_POR_CICLO);

  creditCollectorStats.ciclos++;
  creditCollectorStats.ultimoCiclo = new Date().toISOString();
  creditCollectorStats.ultimoTotal = candidatos.length;

  if (candidatos.length === 0) return { lidos: 0, gravados: 0, falhas: 0 };

  let lidos = 0, gravados = 0, falhas = 0;

  await comLimite(candidatos, CONCORRENCIA, async ([email, token]) => {
    // Marca ANTES de ir à casa: se a requisição demorar mais que o intervalo, o
    // ciclo seguinte não pode disparar uma segunda leitura da mesma pessoa.
    ultimaLeitura.set(email, Date.now());

    const r = await sincronizarCarteira(email, token, 'coletor');
    if (r.ok) {
      lidos++;
      if (r.gravado) gravados++;
    } else {
      falhas++;
    }
  });

  // Limpeza do mapa: sem isto ele cresce com todo e-mail que já passou pelo
  // worker e nunca encolhe.
  const corte = Date.now() - 6 * 60 * 60 * 1000;
  for (const [email, quando] of ultimaLeitura) {
    if (quando < corte) ultimaLeitura.delete(email);
  }

  creditCollectorStats.lidos += lidos;
  creditCollectorStats.gravados += gravados;
  creditCollectorStats.falhas += falhas;

  // Só fala quando houve movimento: um log a cada 5 min dizendo "0 pontos"
  // enterraria o resto do output.
  if (gravados || falhas) {
    console.log(`💰 [credit] ${lidos} carteira(s) lida(s), ${gravados} ponto(s) novo(s)${falhas ? `, ${falhas} falha(s)` : ''}`);
  }

  return { lidos, gravados, falhas };
}

/**
 * Liga a varredura periódica. Devolve o timer (para os testes pararem).
 *
 * O primeiro ciclo entra com atraso aleatório dentro do intervalo: com vários
 * workers subindo juntos no deploy, começar todos no mesmo instante mandaria a
 * base inteira contra a casa de uma vez.
 */
export function startCreditCollector(io) {
  const rodar = () => {
    coletarCreditos(io).catch(err => {
      console.error('❌ [credit] varredura falhou:', err.message);
    });
  };

  setTimeout(() => {
    rodar();
    setInterval(rodar, INTERVALO_MS);
  }, Math.floor(Math.random() * INTERVALO_MS));

  console.log(`💰 Coletor de banca: a cada ${Math.round(INTERVALO_MS / 60000)} min sobre quem está com o app aberto`);
}
