import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore backend cache, exports, env files, and python files so backend activity never causes Vite to reload the browser.
      watch: {
        ignored: [
          '**/sentiment_module/**',
          '**/sample_data/**',
          '**/cache/**',
          '**/exports/**',
          '**/.env*',
          '**/*.py',
          '**/*.json',
          '**/*.csv',
          '**/*.pdf',
          '**/.git/**',
        ],
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
