// tests/helpers/spinFactory.js — Gerador de dados de teste para spins
// Centraliza criação de spinHistory para todos os testes

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function getColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

/**
 * Gera um spin único.
 * @param {number} number - Número da roleta (0-36)
 * @param {number} [index] - Índice para gerar signalId único
 */
export function makeSpin(number, index = 0) {
  return {
    number,
    color: getColor(number),
    signal: String(number),
    signalId: `sig-${Date.now()}-${index}`,
    gameId: `game-${index}`,
    date: new Date(Date.now() - index * 30000).toISOString(),
  };
}

/**
 * Gera um array de spins aleatórios (newest-first, como o app usa).
 * @param {number} count - Quantos spins gerar
 * @param {object} [options]
 * @param {number[]} [options.bias] - Números com maior probabilidade (2x)
 * @param {number} [options.seed] - Seed para reprodutibilidade (simples)
 */
export function generateSpinHistory(count, options = {}) {
  const { bias = [], seed } = options;
  const spins = [];

  let rng = seed || 42;
  const random = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  const pool = [];
  for (let n = 0; n <= 36; n++) pool.push(n);
  if (bias.length > 0) bias.forEach(n => pool.push(n)); // duplica bias

  for (let i = 0; i < count; i++) {
    const num = pool[Math.floor(random() * pool.length)];
    spins.push(makeSpin(num, i));
  }

  return spins; // newest-first (index 0 = mais recente)
}

/**
 * Gera sequência determinística para testes de padrão.
 * @param {number[]} sequence - Números na ordem (mais antigo → mais recente)
 */
export function makeSequence(sequence) {
  return sequence.map((num, i) => makeSpin(num, sequence.length - 1 - i)).reverse();
}

/**
 * Gera DB row no formato que motorScoreEngine espera.
 */
export function makeDbRow(signal, index = 0) {
  return {
    signal: String(signal),
    signalId: `db-${index}`,
    gameId: `game-db-${index}`,
    timestamp: new Date(Date.now() - index * 30000).toISOString(),
  };
}
