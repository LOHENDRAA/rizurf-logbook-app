/**
 * Browser mock entry. Dev/test only: main.tsx dynamically imports this
 * module when `VITE_ENABLE_MSW` is true (which production builds reject).
 */
import { setupWorker } from 'msw/browser'
import { createHandlers } from './handlers'

export const worker = setupWorker(...createHandlers())

export async function startMockWorker(): Promise<void> {
  await worker.start({ onUnhandledRequest: 'bypass' })
}
