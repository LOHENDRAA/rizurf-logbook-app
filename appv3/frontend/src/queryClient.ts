import { QueryClient } from '@tanstack/react-query'

/** Shared defaults: bounded retries for reads, none for mutations. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        retryDelay: (attempt) => Math.min(250 * 2 ** attempt, 2000),
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}
