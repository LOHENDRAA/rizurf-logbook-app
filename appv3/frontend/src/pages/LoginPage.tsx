import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ApiError, formatErrorForDisplay } from '../api/errors'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Map a failed server login to UI copy. Never surfaces internals. */
function loginErrorMessage(failure: unknown): string {
  if (failure instanceof ApiError && (failure.status === 401 || failure.status === 422)) {
    return failure.requestId ? `Email or password is incorrect. (ref ${failure.requestId})` : 'Email or password is incorrect.'
  }
  return formatErrorForDisplay(failure)
}

export function LoginPage() {
  useDocumentTitle('Sign in')
  const { data, login } = useApp()
  const session = useOptionalSession()
  // The server session owns authentication when a provider manages it;
  // otherwise the legacy local store owns the UI (dev/test without backend).
  const managed = session?.managed ?? false
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const navigateByRole = (role: string) => {
    if (role === 'supervisor') navigate('/supervisor/dashboard')
    else if (role === 'university_mentor') navigate('/mentor/dashboard')
    else navigate('/dashboard')
  }

  const submitLegacy = () => {
    const normalized = email.trim()
    const match = data.users.find((candidate) => candidate.email.toLowerCase() === normalized.toLowerCase() && candidate.password === password)
    if (!login(email, password)) return setError('Email or password is incorrect.')
    if (match?.role === 'supervisor') navigate('/supervisor/dashboard')
    else if (match?.role === 'university_mentor') navigate('/mentor/dashboard')
    else navigate('/dashboard')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (!managed || !session) {
      submitLegacy()
      return
    }
    // Managed path: credentials are verified server-side via the cookie
    // session. Local passwords are never compared; navigation follows the
    // authoritative role returned by the server.
    setPending(true)
    setError('')
    void session
      .login(email, password)
      .then((me) => {
        navigateByRole(me.role)
      })
      .catch((failure: unknown) => {
        setError(loginErrorMessage(failure))
      })
      .finally(() => {
        setPending(false)
      })
  }
  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-card">
          <div className="login-brand"><span className="brand-mark">R</span><strong>Rizurf Logbook System</strong></div>
          <h2>Sign in</h2>
          <form onSubmit={submit}>
            <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.edu" required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
            {error && <div className="form-error">{error}</div>}
            <button className="button primary full" type="submit" disabled={pending}>Sign in</button>
          </form>
        </div>
      </section>
    </div>
  )
}
