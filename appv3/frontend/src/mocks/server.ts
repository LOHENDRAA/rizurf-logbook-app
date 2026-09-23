/** Node mock entry for vitest integration tests (msw/node). */
import { setupServer } from 'msw/node'
import { createFixtureStore } from './fixtures'
import { createHandlers } from './handlers'

export function createTestServer() {
  const store = createFixtureStore()
  const server = setupServer(...createHandlers(store))
  return { server, store }
}
