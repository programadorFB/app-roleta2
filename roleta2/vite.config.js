import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console:  mode === 'production',
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom'],
          'vendor-charts': ['recharts'],
          'vendor-icons':  ['lucide-react'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },

  server: {
    proxy: {
      '/login':      { target: 'http://localhost:3002', changeOrigin: true },
      '/start-game': { target: 'http://localhost:3002', changeOrigin: true },
      '/api':        { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
}));
