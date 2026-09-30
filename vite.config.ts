/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// The built app is served by XAMPP's Apache at http://localhost/intern-logbook/.
// For `npm run dev` against a real server, put in .env.development.local:
//   VITE_API_URL=/                              (talk to this dev server…)
//   API_PROXY=https://api.company.com           (…which forwards /api and /sanctum here)
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').API_PROXY;
  // Cookies come back for localhost, so the session works without cross-site cookie rules.
  const proxy = target ? { target, changeOrigin: true, cookieDomainRewrite: '' } : undefined;
  return {
    base: '/intern-logbook/',
    plugins: [vue()],
    build: { outDir: 'C:/xampp/htdocs/intern-logbook', emptyOutDir: true },
    server: proxy ? { proxy: { '/api': proxy, '/sanctum': proxy } } : undefined,
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
      testTimeout: 20000,
    },
  };
});
