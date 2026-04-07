import { query } from './roleta2/server/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'roleta2', '.env') });

async function checkRecentSignals() {
  try {
    const source = 'brasileira';
    console.log(`Checking recent resolved signals for ${source}...`);
    
    const { rows } = await query(
      `SELECT id, suggested_numbers, resolved_modes, spins_after, created_at 
       FROM motor_pending_signals 
       WHERE source = $1 AND resolved = TRUE 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [source]
    );

    if (rows.length === 0) {
      console.log('No resolved signals found.');
      return;
    }

    rows.forEach(row => {
      console.log(`ID: ${row.id} | Created: ${row.created_at}`);
      console.log(`Suggested: [${row.suggested_numbers.join(', ')}]`);
      console.log(`Modes: ${JSON.stringify(row.resolved_modes)}`);
      console.log(`Spins After: ${row.spins_after}`);
      console.log('---');
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkRecentSignals();
