/**
 * Script one-shot: recalcula resolved_modes de todos sinais resolvidos
 * baseado nos spin_results CORRETOS (já recalculados via SQL).
 *
 * Uso: node recalcResolvedModes.js
 */
import pg from 'pg';
const { Pool } = pg;

const WHEEL = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,
  5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

function getCovered(nums, mode) {
  if (mode === 0) return nums;
  const s = new Set();
  nums.forEach(n => {
    s.add(n);
    const idx = WHEEL.indexOf(n);
    for (let i = 1; i <= mode; i++) {
      s.add(WHEEL[(idx + i) % 37]);
      s.add(WHEEL[(idx - i + 37) % 37]);
    }
  });
  return [...s];
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'fuzabalta_roulette',
    user: process.env.DB_USER || 'fuzabalta',
    password: process.env.DB_PASSWORD || '',
  });

  const { rows } = await pool.query(
    `SELECT id, suggested_numbers, spin_results
     FROM motor_pending_signals
     WHERE resolved = TRUE AND spin_results IS NOT NULL AND array_length(spin_results, 1) > 0`
  );

  console.log(`Recalculando resolved_modes para ${rows.length} sinais...`);

  let updated = 0;
  for (const row of rows) {
    const nums = row.suggested_numbers;
    const spins = row.spin_results;
    const modes = {};

    let spinIdx = 0;
    for (const spinNum of spins) {
      spinIdx++;
      for (const mode of [1, 2]) {
        const mk = String(mode);
        if (modes[mk]) continue; // já resolvido
        const covered = getCovered(nums, mode);
        if (covered.includes(spinNum)) {
          modes[mk] = 'win';
          modes[`${mk}_gale`] = spinIdx;
          modes[`${mk}_hit`] = spinNum;
        }
      }
    }

    // Marca loss para modos não resolvidos após todos os spins
    for (const mode of [1, 2]) {
      const mk = String(mode);
      if (!modes[mk]) modes[mk] = 'loss';
    }

    await pool.query(
      'UPDATE motor_pending_signals SET resolved_modes = $1, spins_after = $2 WHERE id = $3',
      [JSON.stringify(modes), spins.length, row.id]
    );
    updated++;
  }

  console.log(`✅ ${updated} sinais recalculados.`);

  // Recalcula motor_scores totais por source
  const { rows: sources } = await pool.query(
    `SELECT DISTINCT source FROM motor_pending_signals WHERE resolved = TRUE`
  );

  for (const { source } of sources) {
    const { rows: signals } = await pool.query(
      `SELECT resolved_modes FROM motor_pending_signals WHERE source = $1 AND resolved = TRUE`,
      [source]
    );

    const scores = { 1: { wins: 0, losses: 0 }, 2: { wins: 0, losses: 0 } };
    for (const sig of signals) {
      const m = sig.resolved_modes || {};
      for (const mode of [1, 2]) {
        const mk = String(mode);
        if (m[mk] === 'win') scores[mode].wins++;
        else if (m[mk] === 'loss') scores[mode].losses++;
      }
    }

    for (const mode of [1, 2]) {
      await pool.query(
        `INSERT INTO motor_scores (source, neighbor_mode, wins, losses)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source, neighbor_mode)
         DO UPDATE SET wins = $3, losses = $4`,
        [source, mode, scores[mode].wins, scores[mode].losses]
      );
    }
    console.log(`[${source}] mode1: ${scores[1].wins}W/${scores[1].losses}L | mode2: ${scores[2].wins}W/${scores[2].losses}L`);
  }

  console.log('✅ motor_scores recalculados.');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
