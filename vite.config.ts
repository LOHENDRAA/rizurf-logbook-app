/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import type { Plugin } from 'vite';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `vite build --mode single`: one index.html with everything inside, to open from disk (file://) and share.
// It runs after the files are written, so Vite has finished with them.
function singleFile(): Plugin {
  let outDir = '';
  return {
    name: 'single-file',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const html = resolve(outDir, 'index.html');
      const read = (src: string) => readFileSync(resolve(outDir, src), 'utf8');
      const page = readFileSync(html, 'utf8')
        // The gateway button (sign-in and theme) has no gateway to talk to from a file, so the theme follows the computer instead.
        .replace(/<script[^>]*gateway-button[^>]*><\/script>/, () => `<script>(function () {
          var m = matchMedia("(prefers-color-scheme: dark)");
          var set = function () { document.documentElement.setAttribute("data-theme", m.matches ? "dark" : "light"); };
          set(); m.addEventListener("change", set);
        })();</script>`)
        .replace(/<script[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, src) => `<script type="module">${read(src).replace(/<\/script/gi, '<\\/script')}</script>`)
        .replace(/<link[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, src) => `<style>${read(src)}</style>`)
        .replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');
      writeFileSync(html, page);
      rmSync(resolve(outDir, 'assets'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').API_PROXY;
  // Cookies come back for localhost, so the session works without cross-site cookie rules.
  const proxy = target ? { target, changeOrigin: true, cookieDomainRewrite: '' } : undefined;
  const single = mode === 'single';
  return {
    base: single ? './' : '/intern-logbook/',
    plugins: single ? [vue(), singleFile()] : [vue()],
    assetsInclude: ['**/*.docx'], // the single-file preview inlines the demo templates
    build: single
      ? { outDir: 'dist-preview', emptyOutDir: true, copyPublicDir: false, assetsInlineLimit: () => true, cssCodeSplit: false, rolldownOptions: { output: { codeSplitting: false } } }
      : { outDir: 'C:/xampp/htdocs/intern-logbook', emptyOutDir: true },
    server: proxy ? { proxy: { '/api': proxy, '/sanctum': proxy } } : undefined,
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
      testTimeout: 20000,
    },
  };
});
