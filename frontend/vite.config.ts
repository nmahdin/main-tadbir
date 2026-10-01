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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return undefined;
            if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor';
            if (id.includes('/node_modules/@tanstack/')) return 'query-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      // Allow the sandbox preview host as well as local development origins.
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/sanctum': {
          target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
