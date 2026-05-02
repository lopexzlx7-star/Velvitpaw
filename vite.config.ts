import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

const PROXY_TIMEOUT_MS = 30 * 60 * 1000;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cloudflare()],
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2015',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'vendor-motion': ['framer-motion'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: {
      port: 5000,
      strictPort: true,
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
          proxyTimeout: PROXY_TIMEOUT_MS,
          timeout: PROXY_TIMEOUT_MS,
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