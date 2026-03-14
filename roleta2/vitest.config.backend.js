// vitest.config.backend.js
// Config separada do Vite frontend — roda apenas testes backend
// Uso: npx vitest --config vitest.config.backend.js

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 15000,
    hookTimeout: 10000,

    // Carrega .env.test automaticamente
    envFile: '.env.test',

    // Cada suíte em processo isolado
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },

    reporters: ['verbose'],
  },
});
