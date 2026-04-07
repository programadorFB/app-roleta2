import { query } from './server/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

async function checkSignalSequence() {
  try {
    const source = 'brasileira';
    console.log(`Checking signal sequence for ${source}...\n`);
    
    const { rows } = await query(
      `SELECT id, suggested_numbers, resolved, spins_after, created_at 
       FROM motor_pending_signals 
       WHERE source = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [source]
    );

    if (rows.length === 0) {
      console.log('No signals found.');
      return;
    }

    rows.forEach((row, i) => {
      const prev = rows[i+1];
      let timeDiff = '';
      if (prev) {
        const diff = (new Date(row.created_at) - new Date(prev.created_at)) / 1000;
        timeDiff = `(+${diff.toFixed(0)}s since prev)`;
      }

      console.log(`[ID: ${row.id}] ${row.resolved ? 'RESOLVED' : 'PENDING '} | Spins: ${row.spins_after}/3 | Created: ${new Date(row.created_at).toLocaleTimeString()} ${timeDiff}`);
      console.log(`   Suggested: [${row.suggested_numbers.join(', ')}]`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkSignalSequence();
