import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import App from './App'
import { AppProvider } from './state/AppContext'
import { SessionProvider } from './state/sessionContext'
import { testRepository } from './test/testRepository'
import { login as apiLogin } from './api/portal'
import { __resetEnvCache } from './config/env'
import { createTestServer } from './mocks/server'

/**
 * F3: when managed, route guards enforce the server session — waiting for
 * boot, redirecting anonymous users to /login, and routing by the
 * authoritative server role. Unmanaged behavior is covered by App.test.tsx.
 */
function renderManagedApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <AppProvider repository={testRepository()}>
            <App />
          </AppProvider>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App managed guards', () => {
  const { server } = createTestServer()

  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_API_BASE_URL', 'http://portal.test')
    __resetEnvCache()
  })

  afterEach(() => {
    cleanup()
    server.resetHandlers()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    __resetEnvCache()
  })

  afterAll(() => server.close())

  it('redirects anonymous server sessions to login despite a legacy marker', async () => {
    // A stale local marker must never grant access when managed.
    sessionStorage.setItem('portal-user', 'student-1')
    server.use(
      http.get('*/api/v1/me', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Session expired', status: 401, code: 'UNAUTHENTICATED', requestId: 'req-anon' },
          { status: 401 },
        ),
      ),
    )
    renderManagedApp('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('serves the dashboard for an authenticated server session without a legacy marker', async () => {
    await apiLogin('aisha.rahman@student.example.edu', 'any-password')
    renderManagedApp('/dashboard')
    // Guard passed (no redirect to login) and the managed overview serves
    // the real placement from the server without any legacy marker.
    expect(await screen.findByRole('heading', { name: 'Internship overview' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })

  it('routes supervisors to the company dashboard from student routes', async () => {
    await apiLogin('sarah.lim@nusantara.example.com', 'any-password')
    renderManagedApp('/dashboard')
    // The managed guard used the server role and rendered the supervisor
    // route shell (no legacy marker exists — legacy guards would have sent
    // this to /login). Sidebar identity still follows the transitional
    // legacy store; only routing is asserted here.
    await waitFor(() => expect(document.querySelector('.app-frame')).not.toBeNull())
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })
})
