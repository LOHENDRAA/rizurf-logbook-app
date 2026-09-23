import { useState, type FormEvent } from 'react'
import { useSession } from '../state/sessionContext'

/**
 * Re-auth resume modal: a 401 during editing preserves the unsynced draft
 * (recovery store + in-memory editor) and resumes after login succeeds.
 */
export function ReauthDialog() {
  const { reauthNeeded, login, resumeAfterReauth, dismissReauth, managed } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!reauthNeeded || !managed) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    void login(email, password)
      .then(() => resumeAfterReauth())
      .catch(() => {
        setError('Email or password is incorrect.')
        setPending(false)
      })
  }

  return (
    <div className="reauth-scrim" role="alertdialog" aria-modal="true" aria-labelledby="reauth-heading">
      <form className="reauth-card" onSubmit={submit}>
        <h2 id="reauth-heading">Session expired</h2>
        <p>Your edits are safe and kept locally. Sign in again to resume saving.</p>
        <label>
          Email address
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="editor-actions">
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in and resume'}
          </button>
          <button className="button" type="button" onClick={dismissReauth}>
            Later
          </button>
        </div>
      </form>
    </div>
  )
}
