import { defineConfig, devices } from '@playwright/test'

/**
 * Critical journeys against the MSW contract mock (dev only, never prod):
 * student edit/submit, supervisor approve/request-changes,
 * mentor approve/reject-restart. Run with VITE_ENABLE_MSW=true vite dev.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'VITE_ENABLE_MSW=true npm run dev -- --port 5173',
    url: 'http://localhost:5173/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
