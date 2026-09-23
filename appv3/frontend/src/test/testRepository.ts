import type { PortalRepository } from '../services/portalRepository'
import { createDemoData } from '../services/mockPortalRepository'

/** A repository stub for component/state tests: no persistence, deterministic seed. */
export function testRepository(overrides: Partial<PortalRepository> = {}): PortalRepository {
  return {
    load: async () => undefined,
    save: async () => {},
    clear: async () => {},
    createDemoData,
    ...overrides,
  }
}
