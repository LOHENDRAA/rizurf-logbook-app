import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules', 'dist', 'e2e'],
    // Some tests wait up to 5s for a single element; the 5s default cut them off on slow CI runners.
    testTimeout: 15_000,
  },
})
