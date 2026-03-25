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

    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'server/**/*.js',
        'src/analysis/**/*.js',
        'src/lib/**/*.js',
        'src/constants/**/*.js',
      ],
      exclude: [
        'server/server.js',        // entrypoint com side effects
        'server/emailService.js',   // SMTP, não testável sem server
      ],
    },
  },
});
