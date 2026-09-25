/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The built app is served by XAMPP's Apache at http://localhost/intern-logbook/.
export default defineConfig({
  base: '/intern-logbook/',
  plugins: [vue()],
  build: { outDir: 'C:/xampp/htdocs/intern-logbook', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 20000,
  },
});
