// src/services/rouletteAuditEngine.js
// Sistema Profissional de Auditoria de Roleta - Versão Client Side

/* =========================
   CONFIG
========================= */

const CONFIG = {
  MIN_SPINS: 5000, // Padrão original (científico)
  CHI_CRITICAL: 58.62, // alpha 0.01, df=36
  Z_THRESHOLD: 3.0,
  MIN_EV: 0.05,
  KELLY_FACTOR: 0.25,
  TARGET_P: 1 / 37
};

/* =========================
   CORE STATS
========================= */

function buildFrequency(spins) {
  const freq = Array(37).fill(0);
  spins.forEach(s => {
    // Garante que é número
    const num = typeof s.number === 'string' ? parseInt(s.number, 10) : s.number;
    if (!isNaN(num) && num >= 0 && num <= 36) {
      freq[num]++;
    }
  });
  return freq;
}

/* =========================
   CHI-SQUARE
========================= */

function chiSquare(spins) {
  const n = spins.length;
  const expected = n / 37;
  const freq = buildFrequency(spins);
  let chi = 0;

  for (let i = 0; i < 37; i++) {
    chi += Math.pow(freq[i] - expected, 2) / expected;
  }
  return chi;
}

/* =========================
   Z-SCORES
========================= */

function zScores(spins) {
  const n = spins.length;
  const p = CONFIG.TARGET_P;
  const freq = buildFrequency(spins);
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));

  return freq.map((x, i) => ({
    number: i,
    z: (x - mean) / sd,
    freq: x
  }));
}

/* =========================
   RUNS TEST (SIMPLE)
========================= */

function runsTest(spins) {
  if (spins.length < 2) return 0;
  let runs = 1;
  for (let i = 1; i < spins.length; i++) {
    if (spins[i].number !== spins[i - 1].number) {
      runs++;
    }
  }
  return runs;
}

/* =========================
   CUSUM DRIFT
========================= */

function cusum(spins) {
  let s = 0;
  let max = 0;
  const freq = Array(37).fill(0);

  return spins.map((spin, i) => {
    const num = typeof spin.number === 'string' ? parseInt(spin.number, 10) : spin.number;
    if(!isNaN(num)) freq[num]++;
    
    const p = freq[num] / (i + 1);
    s += p - CONFIG.TARGET_P;
    max = Math.max(max, Math.abs(s));
    return max;
  });
}

/* =========================
   EXPECTED VALUE
========================= */

function expectedValue(pReal) {
  return 36 * pReal - 1;
}

/* =========================
   KELLY
========================= */

function kellyFraction(p) {
  const b = 35;
  const q = 1 - p;
  return (b * p - q) / b;
}

/* =========================
   MAIN AUDIT ENGINE (MODIFICADO)
========================= */

export function runRouletteAudit(spins, bankroll = 1000, customMinSpins = null) {

  // Adaptação: Permite sobrescrever o mínimo de spins para uso no frontend
  const minRequired = customMinSpins || CONFIG.MIN_SPINS;

  if (!spins || spins.length < minRequired) {
    return {
      status: "INSUFFICIENT_DATA",
      spins: spins ? spins.length : 0,
      required: minRequired
    };
  }

  /* ---- Global Bias Test ---- */
  const chi = chiSquare(spins);
  
  // Ajuste do critério crítico para amostras menores (heurística simples)
  // Para 100 spins, chi critical é menor, mas manteremos o padrão para rigor
  const chiPassed = chi >= CONFIG.CHI_CRITICAL;

  /* ---- Local Bias ---- */
  const zData = zScores(spins);

  // Adaptação: Se a amostra for pequena (< 200), baixamos o threshold do Z para 1.5 para mostrar "tendências"
  const dynamicZThreshold = spins.length < 200 ? 1.5 : CONFIG.Z_THRESHOLD;

  const biasedNumbers = zData
    .filter(z => z.z >= dynamicZThreshold)
    .sort((a, b) => b.z - a.z);

  /* ---- EV Calculation ---- */
  const candidates = biasedNumbers.map(z => {
    const pReal = z.freq / spins.length;
    const ev = expectedValue(pReal);
    return {
      number: z.number,
      z: z.z,
      pReal,
      ev,
      freq: z.freq
    };
  }).filter(c => c.ev > 0); // Mostra apenas EV Positivo

  /* ---- Drift ---- */
  const drift = cusum(spins);
  const driftScore = drift[drift.length - 1] || 0;

  /* ---- Runs ---- */
  const runs = runsTest(spins);

  /* ---- Signal Generation ---- */
  let signal = null;

  if (candidates.length > 0) {
    const best = candidates[0];
    const kelly = kellyFraction(best.pReal);
    const stake = Math.max(0, bankroll * Math.max(0, kelly) * CONFIG.KELLY_FACTOR);

    signal = {
      action: "BET",
      numbers: [best.number],
      confidence: Math.min(99, best.z * 20),
      pReal: best.pReal,
      ev: best.ev,
      recommendedStake: stake.toFixed(2)
    };
  }

  return {
    status: (candidates.length > 0) ? "EDGE_DETECTED" : "NO_EDGE",
    spins: spins.length,
    statistics: {
      chiSquare: chi,
      chiPassed,
      runs,
      driftScore
    },
    biasedNumbers: biasedNumbers.slice(0, 5),
    candidates: candidates.slice(0, 5),
    signal
  };
}

export function updateSpins(history, newSpin) {
  return [...history, { number: newSpin }].slice(-20000);
}