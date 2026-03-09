// src/constants/roulette.js
// ════════════════════════════════════════════════
// Fonte única de verdade para configuração de roleta
// ════════════════════════════════════════════════

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';
export const SOCKET_URL = 'https://roleta-fuza.sortehub.online';
export const POLLING_INTERVAL_MS = 5000;

// Cores dos números da roleta europeia
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const getNumberColor = (num) => {
  if (num === 0) return 'green';
  return RED_NUMBERS.has(num) ? 'red' : 'black';
};

// Roletas disponíveis
export const ROULETTE_SOURCES = {
  aovivo:       '🇧🇷 Roleta Brasileira  - Evolution',
  immersive:    '🌟 Immersive Roulette - Evolution',
  viproulette:  '💎 Vip Roulette - Evolution',
  xxxtreme:     '⚡ XXXtreme Lightning - Evolution',
  speed:        '💨 Speed Roulette - Evolution',
  vipauto:      '🚘 Auto Roulette Vip - Evolution',
  vip:          '💎 Roleta Vip - Evolution',
  lightning:    '⚡ Lightning Roulette - Evolution',
  speedauto:    '💨 Speed Auto Roulette - Evolution',
  relampago:    '⚡ Roleta Relâmpago - Evolution',
  brasileira:   '🇧🇷 Roleta Brasileira - Pragmatic',
  malta:        '🇲🇹 Casino Malta Roulette - Evolution',
};

export const ROULETTE_GAME_IDS = {
  auto: 120, vipauto: 31, bacbo: 54, malta: 80, footballstudio: 53,
  immersive: 55, lightning: 33, reddoor: 35, aovivo: 34,
  brasileira: 101, brasilPlay: 102, relampago: 81, speedauto: 82,
  speed: 36, viproulette: 32, xxxtreme: 83,
};

export const FILTER_OPTIONS = [
  { value: 50,    label: 'Últimas 50 Rodadas' },
  { value: 100,   label: 'Últimas 100 Rodadas' },
  { value: 300,   label: 'Últimas 300 Rodadas' },
  { value: 500,   label: 'Últimas 500 Rodadas' },
  { value: 1000,  label: 'Últimas 1000 Rodadas' },
  { value: 'all', label: 'Histórico Completo' },
];

// Ordem do cilindro (roleta europeia)
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const DEFAULT_ROULETTE = Object.keys(ROULETTE_SOURCES)[0];