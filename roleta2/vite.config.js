import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    // Injeta a chave HMAC no build (não usa VITE_* para não ficar exposta em import.meta.env)
    define: {
      __SIGNING_KEY__: JSON.stringify(env.API_SIGNING_SECRET || ''),
    },

    build: {
      target: 'es2020',
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console:  mode === 'production',
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: true,
        },
        format: {
          comments: false,
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
        '/login':      { target: 'http://localhost:3001', changeOrigin: true },
        '/start-game': { target: 'http://localhost:3001', changeOrigin: true },
        '/api':        { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  };
});
