import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const { quickLoginMock, loginMock } = vi.hoisted(() => ({
  quickLoginMock: vi.fn(),
  loginMock: vi.fn(() => true),
}))

vi.mock('../state/AppContext', () => ({
  useApp: () => ({ login: loginMock, quickLogin: quickLoginMock }),
}))

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Intern dashboard landing</div>} />
        <Route path="/supervisor" element={<div>Supervisor landing</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const cases = [
  { name: 'Aisha Rahman', initials: 'AR', id: 'intern-1', landing: 'Intern dashboard landing' },
  { name: 'Daniel Lee', initials: 'DL', id: 'intern-2', landing: 'Intern dashboard landing' },
  { name: 'Maya Kumar', initials: 'MK', id: 'intern-3', landing: 'Intern dashboard landing' },
  { name: 'Marcus Tan', initials: 'MT', id: 'supervisor-1', landing: 'Supervisor landing' },
] as const

describe('LoginPage prototype access', () => {
  beforeEach(() => {
    quickLoginMock.mockClear()
    loginMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders four dedicated account buttons with correct names and initials', () => {
    renderLogin()
    for (const account of cases) {
      const button = screen.getByRole('button', { name: new RegExp(account.name, 'i') })
      expect(button).toHaveAttribute('type', 'button')
      expect(button.textContent).toContain(account.initials)
    }
  })

  it.each(cases)('$name authenticates $id and navigates to the correct landing page', (account) => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(account.name, 'i') }))
    expect(quickLoginMock).toHaveBeenCalledTimes(1)
    expect(quickLoginMock).toHaveBeenCalledWith(account.id)
    expect(screen.getByText(account.landing)).toBeInTheDocument()
  })
})
