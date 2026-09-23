import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './state/AppContext'
import { testRepository } from './test/testRepository'

function renderApp(path: string, session?: string) {
  sessionStorage.clear()
  if (session) sessionStorage.setItem('portal-user', session)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider repository={testRepository()}>
        <App />
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('App routes', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('redirects protected routes to login when signed out', async () => {
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('redirects unknown routes to the overview when signed in', async () => {
    renderApp('/nonsense', 'student-1')
    expect(await screen.findByText('Internship overview')).toBeInTheDocument()
  })

  it('redirects a supervisor to the company dashboard', async () => {
    renderApp('/nonsense', 'supervisor-1')
    expect(await screen.findByText(/company interns/i)).toBeInTheDocument()
  })

  it('blocks student routes for supervisors', async () => {
    renderApp('/dashboard', 'supervisor-1')
    expect(await screen.findByText(/company interns/i)).toBeInTheDocument()
  })

  it('blocks supervisor routes for students', async () => {
    renderApp('/supervisor/dashboard', 'student-1')
    expect(await screen.findByText('Internship overview')).toBeInTheDocument()
  })

  it('redirects the legacy /weeks/:id route to the journal', async () => {
    renderApp('/weeks/3', 'student-1')
    expect(await screen.findByRole('heading', { name: 'Daily + weekly journals' })).toBeInTheDocument()
  })

  it('redirects a locked /journal/weeks/:weekNumber back to the journal', async () => {
    renderApp('/journal/weeks/1', 'student-2')
    expect(await screen.findByRole('heading', { name: 'Daily + weekly journals' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: /weekly consolidation log/i })).toBeNull()
  })

  it('renders the daily-logs week view for an available week', async () => {
    renderApp('/journal/weeks/1', 'student-1')
    expect(await screen.findByRole('heading', { level: 1, name: /weekly consolidation log/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Optional Daily Logs' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/weekly report/i)).toBeNull()
  })
})

describe('AppShell identity', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('student view has no topbar and shows identity in the sidebar footer', async () => {
    renderApp('/dashboard', 'student-1')
    await screen.findByText('Internship overview')
    expect(document.querySelector('header.topbar')).toBeNull()
    const foot = document.querySelector('.sidebar-foot')
    expect(foot).not.toBeNull()
    expect(foot!.querySelector('.sidebar-profile')).not.toBeNull()
    expect(foot!.querySelector('.sidebar-profile')!.textContent).toMatch(/Aisha Rahman/)
    expect(foot!.querySelector('.sidebar-profile')!.textContent).toMatch(/Student/)
    const order = foot!.textContent ?? ''
    expect(order.indexOf('Aisha Rahman')).toBeLessThan(order.indexOf('Reset demo'))
    expect(order.indexOf('Reset demo')).toBeLessThan(order.indexOf('Sign out'))
    expect(screen.getByText('Rizurf Logbook System')).toBeInTheDocument()
  })

  it('supervisor view has no topbar and shows identity in the sidebar footer', async () => {
    renderApp('/supervisor/dashboard', 'supervisor-1')
    await screen.findByText(/company interns/i)
    expect(document.querySelector('header.topbar')).toBeNull()
    const foot = document.querySelector('.sidebar-foot')
    expect(foot).not.toBeNull()
    expect(foot!.querySelector('.sidebar-profile')!.textContent).toMatch(/Sarah Lim/)
    expect(foot!.querySelector('.sidebar-profile')!.textContent).toMatch(/Supervisor/)
    const order = foot!.textContent ?? ''
    expect(order.indexOf('Sarah Lim')).toBeLessThan(order.indexOf('Reset demo'))
    expect(order.indexOf('Reset demo')).toBeLessThan(order.indexOf('Sign out'))
  })
})
