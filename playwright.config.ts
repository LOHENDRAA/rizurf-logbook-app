import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:4173', acceptDownloads: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite build --outDir dist && npx vite preview --outDir dist --port 4173 --strictPort',
    url: 'http://localhost:4173/intern-logbook/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } }],
});
