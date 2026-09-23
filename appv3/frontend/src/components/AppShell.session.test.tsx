import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'
import { AppProvider } from '../state/AppContext'
import { SessionProvider } from '../state/sessionContext'
import { testRepository } from '../test/testRepository'
import { getMe, login as apiLogin } from '../api/portal'
import { ApiError } from '../api/errors'
import { __resetEnvCache } from '../config/env'
import { clearAllRecoveryDrafts, loadRecoveryDraft, saveRecoveryDraft } from '../recovery/draftStore'
import { createTestServer } from '../mocks/server'

/**
 * Managed sign-out: the shell displays the server identity and Sign out
 * destroys the server session (cookie), clears the query cache and the
 * user-scoped recovery drafts, then clears the legacy local marker.
 */
function renderManagedShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/supervisor/dashboard']}>
        <SessionProvider>
          <AppProvider repository={testRepository()}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/supervisor/dashboard" element={<div>Board page</div>} />
              </Route>
            </Routes>
          </AppProvider>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell managed session', () => {
  const { server } = createTestServer()

  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_API_BASE_URL', 'http://portal.test')
    __resetEnvCache()
    clearAllRecoveryDrafts('supervisor-1')
  })

  afterEach(() => {
    cleanup()
    server.resetHandlers()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    __resetEnvCache()
    clearAllRecoveryDrafts('supervisor-1')
  })

  afterAll(() => server.close())

  it('shows the server identity and destroys the server session on sign out', async () => {
    await apiLogin('sarah.lim@nusantara.example.com', 'any-password')
    sessionStorage.setItem('portal-user', 'supervisor-1')
    saveRecoveryDraft({ userId: 'supervisor-1', fieldKey: 'weekly:1', body: 'unsynced', version: 'v', updatedAt: 't' })
    renderManagedShell()

    // Server identity drives the shell, not the legacy marker.
    expect(await screen.findByText('Sarah Lim', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Supervisor workspace')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    // The cookie session is destroyed server-side: /me now rejects.
    await waitFor(
      async () => {
        const failure = await getMe().then(
          () => null,
          (error: unknown) => error as ApiError,
        )
        expect(failure).toBeInstanceOf(ApiError)
        expect(failure?.status).toBe(401)
      },
      { timeout: 5000 },
    )
    // Recovery drafts and the legacy marker are wiped with it.
    expect(loadRecoveryDraft('supervisor-1', 'weekly:1')).toBeUndefined()
    expect(sessionStorage.getItem('portal-user')).toBeNull()
  })
})
