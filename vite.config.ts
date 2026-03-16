import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    base: './',
    define: {
      'process.env.CLOUDINARY_CLOUD_NAME': JSON.stringify(process.env.CLOUDINARY_CLOUD_NAME || ''),
      'process.env.CLOUDINARY_UPLOAD_PRESET': JSON.stringify(process.env.CLOUDINARY_UPLOAD_PRESET || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/.local/**', '**/node_modules/**', '**/dist/**'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
