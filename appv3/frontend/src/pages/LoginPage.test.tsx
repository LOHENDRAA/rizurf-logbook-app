import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const { loginMock, dataMock } = vi.hoisted(() => {
  const users = [
    { id: 'student-1', name: 'Aisha Rahman', email: 'aisha.rahman@student.example.edu', password: 'intern123', role: 'student', avatar: 'AR' },
    { id: 'student-2', name: 'Daniel Lee', email: 'daniel.lee@student.example.ac.uk', password: 'intern123', role: 'student', avatar: 'DL' },
    { id: 'supervisor-1', name: 'Sarah Lim', email: 'sarah.lim@nusantara.example.com', password: 'supervisor123', role: 'supervisor', avatar: 'SL' },
    { id: 'mentor-1', name: 'Dr. Maya Chen', email: 'maya.chen@university.example.edu', password: 'mentor123', role: 'university_mentor', avatar: 'DM' },
  ]
  return {
    loginMock: vi.fn(() => true),
    dataMock: {
      users,
      companies: [
        { id: 'company-nusantara', name: 'Nusantara Digital' },
      ],
      supervisors: [{ userId: 'supervisor-1', companyId: 'company-nusantara' }],
      internships: [],
      journals: [],
    },
  }
})

vi.mock('../state/AppContext', () => ({
  useApp: () => ({ data: dataMock, login: loginMock }),
}))

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Overview landing</div>} />
        <Route path="/supervisor/dashboard" element={<div>Supervisor landing</div>} />
        <Route path="/mentor/dashboard" element={<div>Mentor landing</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockClear()
    loginMock.mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a single centered card with brand and a concise heading', () => {
    renderLogin()
    expect(document.querySelector('.login-story')).toBeNull()
    expect(document.querySelector('.login-card')).toBeInTheDocument()
    expect(document.querySelector('.login-brand .brand-mark')).toHaveTextContent('R')
    expect(screen.getByText('Rizurf Logbook System', { selector: '.login-brand strong' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders the email/password form with autocomplete attributes', () => {
    renderLogin()
    const email = screen.getByLabelText(/email address/i)
    const password = screen.getByLabelText(/password/i)
    expect(email).toHaveAttribute('autocomplete', 'username')
    expect(email).toHaveAttribute('type', 'email')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders a text-only submit button without decoration', () => {
    renderLogin()
    const submit = screen.getByRole('button', { name: 'Sign in' })
    expect(submit).toHaveTextContent('Sign in')
    expect(submit.querySelector('svg')).toBeNull()
  })

  it('does not render quick login, demo credentials, or introductory copy', () => {
    renderLogin()
    expect(screen.queryByText('WELCOME BACK')).toBeNull()
    expect(screen.queryByText('Sign in to Rizurf Logbook System')).toBeNull()
    expect(screen.queryByText(/live in your browser only/i)).toBeNull()
    expect(screen.queryByText(/quick login/i)).toBeNull()
    expect(screen.queryByText(/demo credentials/i)).toBeNull()
    expect(document.querySelector('.quick-grid')).toBeNull()
    expect(document.querySelector('details.demo-credentials')).toBeNull()
    expect(document.querySelector('.divider')).toBeNull()
  })

  it('renders the form even when no users exist', () => {
    const users = dataMock.users
    dataMock.users = []
    try {
      renderLogin()
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    } finally {
      dataMock.users = users
    }
  })

  it('signs in a student with the form and navigates to the overview', () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'aisha.rahman@student.example.edu' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'intern123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(loginMock).toHaveBeenCalledWith('aisha.rahman@student.example.edu', 'intern123')
    expect(screen.getByText('Overview landing')).toBeInTheDocument()
  })

  it('navigates supervisors to the company dashboard', () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'sarah.lim@nusantara.example.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'supervisor123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(loginMock).toHaveBeenCalledWith('sarah.lim@nusantara.example.com', 'supervisor123')
    expect(screen.getByText('Supervisor landing')).toBeInTheDocument()
  })

  it('navigates mentors to the mentor dashboard', () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'maya.chen@university.example.edu' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'mentor123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(loginMock).toHaveBeenCalledWith('maya.chen@university.example.edu', 'mentor123')
    expect(screen.getByText('Mentor landing')).toBeInTheDocument()
  })

  it('matches trimmed, case-insensitive email for navigation', () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: '  SARAH.LIM@NUSANTARA.EXAMPLE.COM  ' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'supervisor123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    // Note: jsdom trims email-input whitespace per the HTML value-sanitization
    // rules, so login receives the trimmed (still uppercase) address while the
    // component's own lookup trims + lowercases for navigation.
    expect(loginMock).toHaveBeenCalledWith('SARAH.LIM@NUSANTARA.EXAMPLE.COM', 'supervisor123')
    expect(screen.getByText('Supervisor landing')).toBeInTheDocument()
  })

  it('shows an error on failed login without navigating', () => {
    loginMock.mockReturnValueOnce(false)
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'aisha.rahman@student.example.edu' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Email or password is incorrect.')).toBeInTheDocument()
    expect(screen.queryByText('Overview landing')).toBeNull()
  })

  it('brands the product as Rizurf Logbook System', () => {
    renderLogin()
    expect(screen.getAllByText(/rizurf logbook system/i).length).toBeGreaterThan(0)
  })
})
