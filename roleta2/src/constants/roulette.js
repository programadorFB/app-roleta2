

export const API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
export const SOCKET_URL = "https://roleta-fuza.sortehub.online";

export const ROULETTE_SOURCES = {
  immersivevip:   '🌟 Immersive Vip - Evolution',
  brasilPlay:     '🎲 Roleta Brasileira - Playtech',
  aovivo:         '🔴 Roleta ao Vivo - Evolution',
  immersive:      '🌟 Immersive Roulette - Evolution',
  brasileira:     '🇧🇷 Roleta Brasileira - Pragmatic',
  speed:          '💨 Speed Roulette - Evolution',
  xxxtreme:       '⚡ XXXtreme Lightning - Evolution',
  vipauto:        '🚘 Auto Roulette Vip - Evolution',
  vip:            '💎 Roleta Vip - Evolution',
  lightning:      '⚡ Lightning Roulette - Evolution',
  speedauto:      '💨 Speed Auto Roulette - Evolution',
  viproulette:    '💎 Vip Roulette - Evolution',
  relampago:      '⚡ Roleta Relâmpago - Evolution',
  malta:          '🇲🇹 Casino Malta Roulette - Evolution',
};

// 🔧 FIX #6: ROULETTE_GAME_IDS unificado (era divergente App.jsx vs constants)
export const ROULETTE_GAME_IDS = {
  auto: 120,
  vipauto: 31,
  bacbo: 54,
  malta: 80,
  footballstudio: 53,
  immersive: 55,
  immersivevip: 103,       // 🔧 FIX: estava ausente em constants
  lightning: 33,
  reddoor: 35,
  aovivo: 34,
  brasilPlay: 102,
  brasileira: 101,
  relampago: 81,
  speedauto: 82,
  speed: 36,
  viproulette: 32,
  xxxtreme: 83,
};

// 🔧 FIX #11: FILTER_OPTIONS unificado (App.jsx tinha 50, constants não)
export const FILTER_OPTIONS = [
  { value: 50,   label: 'Últimas 50 Rodadas' },
  { value: 100,  label: 'Últimas 100 Rodadas' },
  { value: 300,  label: 'Últimas 300 Rodadas' },
  { value: 500,  label: 'Últimas 500 Rodadas' },
  { value: 1000, label: 'Últimas 1000 Rodadas' },
  { value: 'all', label: 'Histórico Completo' },
];

// 🔧 FIX #14: RED_NUMBERS — definição única (era inline em 7+ arquivos)
export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

// 🔧 FIX #13: PHYSICAL_WHEEL — definição única (era em CroupieDetection, DeepAnalysis, etc.)
// Ordem dos números no cilindro europeu (0 = posição 0)
export const PHYSICAL_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

// Cor do número na roleta (usado em múltiplos componentes)
export function getRouletteColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

// Threshold de tentativas para gatilhos (G1/G2/G3)
export const LOSS_THRESHOLD = 3;

// Setores do cilindro europeu
export const SECTORS = {
  tiers:     [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
  orphelins: [1, 20, 14, 31, 9, 6, 34, 17],
  voisins:   [19, 4, 21, 2, 25, 22, 18, 29, 7, 28],
  zero:      [12, 35, 3, 26, 0, 32, 15],
};