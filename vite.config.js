// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Redireciona para o SEU BACKEND LOCAL
      '/login': {
        target: 'http://localhost:3000', // <-- CORREÇÃO
        changeOrigin: true,
      },
      // Redireciona para o SEU BACKEND LOCAL
      '/start-game': {
        target: 'http://localhost:3000', // <-- CORREÇÃO
        changeOrigin: true,
      },
      // Redireciona para o SEU BACKEND LOCAL
      '/api': {
        target: 'http://localhost:3000', // <-- CORREÇÃO
        changeOrigin: true,
      }
    }
  }
})