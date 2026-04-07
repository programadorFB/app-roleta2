import { query } from './server/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

async function checkOverallScores() {
  try {
    const source = 'brasileira';
    console.log(`Checking overall motor scores for ${source}...`);
    
    const { rows } = await query(
      `SELECT neighbor_mode, wins, losses 
       FROM motor_scores 
       WHERE source = $1 
       ORDER BY neighbor_mode ASC`,
      [source]
    );

    rows.forEach(row => {
      const total = row.wins + row.losses;
      const assertiveness = total > 0 ? ((row.wins / total) * 100).toFixed(1) : 0;
      console.log(`Mode: ${row.neighbor_mode} | Wins: ${row.wins} | Losses: ${row.losses} | Assertiveness: ${assertiveness}%`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkOverallScores();
