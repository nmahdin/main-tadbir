import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = (process.env.VITE_API_URL || env.VITE_API_URL || (command === 'build'
    ? 'https://api-tadbir.morvarid-daron.ir/api/v1'
    : '/api/v1')).replace(/\/$/, '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'tadbir-initial-favicon',
        transformIndexHtml(html: string) {
          // Browser discovers the real favicon from HTML, before React runs.
          let output = html.replace('__TADBIR_FAVICON_URL__', `${apiBase}/public/favicon`);
          /*
           * پیش‌اتصال به میزبان API: اولین درخواست سامانه (نشست/تنظیمات) بدون
           * دست‌دادن دوبارهٔ TLS انجام می‌شود. این کار فقط یک «راهنمای» مرورگر
           * است و هیچ درخواستی نمی‌فرستد؛ اگر میزبان API همان میزبان برنامه
           * باشد (حالت توسعهٔ پروکسی‌شده) تگ اضافه نمی‌شود.
           */
          let apiOrigin = '';
          try {
            apiOrigin = new URL(apiBase).origin;
          } catch {
            apiOrigin = '';
          }
          const sameOrigin = !apiOrigin || apiOrigin === 'http://localhost' || apiOrigin === 'http://127.0.0.1';
          const hints = sameOrigin || apiOrigin.includes('localhost') || apiOrigin.includes('127.0.0.1')
            ? ''
            : `<link rel="preconnect" href="${apiOrigin}" crossorigin />\n    <link rel="dns-prefetch" href="${apiOrigin}" />`;
          return output.replace('__TADBIR_API_HINTS__', hints);
        },
      },
    ],
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
        // تصاویر پروفایل و لوگوی سامانه از دیسک عمومی بک‌اند سرو می‌شوند؛
        // بدون این پروکسی، آدرس /storage در حالت توسعه به خود Vite می‌خورد.
        '/storage': {
          target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
