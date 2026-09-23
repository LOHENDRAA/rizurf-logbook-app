import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from './LoginPage'
import { AppProvider } from '../state/AppContext'
import { SessionProvider } from '../state/sessionContext'
import { testRepository } from '../test/testRepository'
import type { PortalData } from '../types'
import { __resetEnvCache } from '../config/env'
import { createTestServer } from '../mocks/server'

/**
 * F1: when the session is managed, LoginPage authenticates through the
 * server session (apiLogin) and navigates by the authoritative role — local
 * passwords are never compared. The legacy store here carries zero users,
 * so the legacy path could never succeed: any navigation proves the
 * managed path was used.
 */
const emptyData: PortalData = {
  version: 8,
  users: [],
  companies: [],
  supervisors: [],
  mentors: [],
  internships: [],
  journals: [],
}

function renderManagedLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <SessionProvider>
          <AppProvider repository={testRepository({ load: async () => emptyData })}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={<div>Overview landing</div>} />
              <Route path="/supervisor/dashboard" element={<div>Supervisor landing</div>} />
              <Route path="/mentor/dashboard" element={<div>Mentor landing</div>} />
            </Routes>
          </AppProvider>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage managed session', () => {
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

  it('signs in through the server without any local password', async () => {
    renderManagedLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'sarah.lim@nusantara.example.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'anything-at-all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    // Role comes from the server session: supervisor lands on the company board.
    expect(await screen.findByText('Supervisor landing', undefined, { timeout: 5000 })).toBeInTheDocument()
  })

  it('routes students to the overview from the server role', async () => {
    renderManagedLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'aisha.rahman@student.example.edu' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'not-a-real-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Overview landing', undefined, { timeout: 5000 })).toBeInTheDocument()
  })

  it('shows a generic error with a reference on unknown credentials', async () => {
    renderManagedLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'nobody@example.edu' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Email or password is incorrect\./, undefined, { timeout: 5000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled())
    expect(screen.queryByText('Overview landing')).toBeNull()
    expect(screen.queryByText('Supervisor landing')).toBeNull()
  })
})
