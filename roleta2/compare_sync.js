import { query } from './server/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

async function compareSignalWithGrid() {
  try {
    const source = 'brasileira';
    console.log(`Comparing signals with real spin sequence for ${source}...\n`);
    
    // 1. Pega os 3 sinais resolvidos mais recentes
    const { rows: signals } = await query(
      `SELECT id, suggested_numbers, spin_results, created_at 
       FROM motor_pending_signals 
       WHERE source = $1 AND resolved = TRUE 
       ORDER BY created_at DESC 
       LIMIT 3`,
      [source]
    );

    for (const sig of signals) {
      console.log(`SIGNAL ID: ${sig.id} | Created At: ${sig.created_at}`);
      console.log(`Suggested: [${sig.suggested_numbers.join(', ')}]`);
      console.log(`Recorded in Signal (spin_results): [${(sig.spin_results || []).join(', ')}]`);

      // 2. Busca os spins no histórico oficial que ocorreram logo APÓS o created_at deste sinal
      // Pegamos os próximos 5 spins para garantir que vemos o que o motor deveria ter capturado
      const { rows: realSpins } = await query(
        `SELECT signal, timestamp 
         FROM signals 
         WHERE source = $1 AND timestamp > $2 
         ORDER BY timestamp ASC 
         LIMIT 5`,
        [source, sig.created_at]
      );

      const realNumbers = realSpins.map(s => parseInt(s.signal, 10));
      console.log(`Real Sequence in Grid (after signal): [${realNumbers.join(', ')}]`);
      
      // Verifica se o primeiro resultado gravado bate com o primeiro resultado real
      if (sig.spin_results && sig.spin_results.length > 0 && realNumbers.length > 0) {
        if (sig.spin_results[0] === realNumbers[0]) {
          console.log('✅ Match: First spin matches.');
        } else {
          console.log('❌ MISMATCH: First spin does NOT match!');
        }
      }
      console.log('---');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

compareSignalWithGrid();
