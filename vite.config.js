import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Redireciona qualquer requisição que comece com /api
      // para o seu servidor backend na porta 3000
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    }
  }
})