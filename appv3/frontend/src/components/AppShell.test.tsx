import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

vi.mock('../state/AppContext', () => ({
  useApp: () => ({
    currentUser: { id: 'student-1', name: 'Aisha Rahman', avatar: 'AR' },
    currentRole: 'student',
    logout: vi.fn(),
    resetDemo: vi.fn(),
  }),
}))

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<div>Dashboard landing</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell drawer', () => {
  afterEach(() => cleanup())

  it('exposes expand state and controls on the menu button', () => {
    renderShell()
    const menu = screen.getByRole('button', { name: 'Open navigation' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveAttribute('aria-controls', 'app-sidebar')
    expect(document.getElementById('app-sidebar')).not.toBeNull()
  })

  it('opens the drawer, labels the close button, and closes on Escape', () => {
    renderShell()
    const menu = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    const sidebar = document.getElementById('app-sidebar')
    expect(sidebar?.className).toMatch(/open/)
    const closers = screen.getAllByRole('button', { name: 'Close navigation' })
    expect(closers).toHaveLength(2)
    expect(closers.some((button) => button.classList.contains('sidebar-close'))).toBe(true)
    expect(closers.some((button) => button.classList.contains('nav-scrim'))).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar?.className).not.toMatch(/open/)
  })

  it('closes the drawer via the scrim', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    const scrim = document.querySelector('.nav-scrim')
    expect(scrim).not.toBeNull()
    fireEvent.click(scrim!)
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
  })
})
