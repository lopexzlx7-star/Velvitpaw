import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/.local/**', '**/node_modules/**', '**/dist/**'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          proxyTimeout: TEN_MINUTES_MS,
          timeout: TEN_MINUTES_MS,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.error('[vite-proxy] Erro:', err.message);
            });
          },
        },
      },
    },
  };
});
