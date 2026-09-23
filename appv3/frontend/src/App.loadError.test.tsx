import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './state/AppContext'
import { testRepository } from './test/testRepository'
import type { PortalRepository } from './services/portalRepository'

function renderAppWith(overrides: Partial<PortalRepository>) {
  sessionStorage.clear()
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppProvider repository={testRepository(overrides)}>
        <App />
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('App load failure recovery', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows the splash while loading and never leaves it stuck', async () => {
    sessionStorage.clear()
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppProvider repository={testRepository({ load: () => new Promise(() => {}) })}>
          <App />
        </AppProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/preparing your workspace/i)).toBeInTheDocument()
    cleanup()
  })

  it('shows a usable app with Retry and Reset demo actions when load fails', async () => {
    renderAppWith({ load: async () => { throw new Error('idb failure') } })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/fresh demo data/i)
    expect(alert).not.toHaveTextContent(/idb failure/)
    // Recovery actions are offered and the app itself is usable (login page).
    expect(alert.querySelector('button')).not.toBeNull()
    const buttons = Array.from(alert.querySelectorAll('button')).map((button) => button.textContent)
    expect(buttons).toContain('Retry')
    expect(buttons).toContain('Reset demo')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/preparing your workspace/i)).toBeNull()
  })

  it('dismisses the banner without losing the app', async () => {
    renderAppWith({ load: async () => { throw new Error('idb failure') } })
    const alert = await screen.findByRole('alert')
    fireEvent.click(alert.querySelector('button[aria-label="Dismiss workspace error"]')!)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
