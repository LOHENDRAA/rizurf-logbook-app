import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom does not implement scrolling; the shell calls it on navigation.
Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true })

// jsdom has no IndexedDB; provide an in-memory idb-keyval so the repository
// can load/save during tests without touching real storage.
vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>()
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value)
    },
    del: async (key: string) => {
      store.delete(key)
    },
  }
})
