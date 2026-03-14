/**
 * hooks/index.js
 * 🔧 FIX: Exporta LAUNCH_FAILURE do useGameLauncher
 */

export { useAuth } from './useAuth.js';
export { useInactivityTimeout } from './useInactivityTimeout.js';
export { useRouletteSocket } from './useRouletteSocket.js';
export { useSpinHistory } from './useSpinHistory.js';
export { useGameLauncher, LAUNCH_FAILURE } from './useGameLauncher.js';