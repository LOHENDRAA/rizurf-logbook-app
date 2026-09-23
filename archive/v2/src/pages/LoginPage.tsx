import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'

export function LoginPage() {
  const { login, quickLogin } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!login(email, password)) return setError('Email or password is incorrect.')
    navigate('/')
  }
  const quickAccounts = [
    { id: 'intern-1', initials: 'AR', title: 'Continue as intern', name: 'Aisha Rahman', to: '/dashboard' },
    { id: 'intern-2', initials: 'DL', title: 'Continue as intern', name: 'Daniel Lee', to: '/dashboard' },
    { id: 'intern-3', initials: 'MK', title: 'Continue as intern', name: 'Maya Kumar', to: '/dashboard' },
    { id: 'supervisor-1', initials: 'MT', title: 'Continue as supervisor', name: 'Marcus Tan', to: '/supervisor' },
  ] as const
  const quick = (id: string, to: string) => { quickLogin(id); navigate(to) }
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="ambient ambient-one" /><div className="ambient ambient-two" />
        <div className="login-brand"><span className="brand-mark">IF</span><strong>InternFlow</strong></div>
        <div className="story-content"><span className="hero-pill"><i /> Internship reporting, simplified</span><h1>One clear path from <span>first week</span> to final PDF.</h1><p>Keep every log, document, review, and approval together. Know what’s next and submit with confidence.</p><div className="story-points"><div><FileCheck2 /><span><strong>One guided workspace</strong><small>Every APU requirement in the correct order</small></span></div><div><ShieldCheck /><span><strong>Clear supervisor review</strong><small>Focused feedback with signed approvals</small></span></div><div><CheckCircle2 /><span><strong>Submission-ready output</strong><small>Generate correctly ordered Part 1 and Part 2 PDFs</small></span></div></div></div>
        <p className="prototype-warning">Prototype data is stored only in this browser.</p>
      </section>
      <section className="login-panel"><div className="login-card"><span className="eyebrow teal">WELCOME BACK</span><h2>Sign in to your workspace</h2><p>Use your university or company account.</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@mail.apu.edu.my" required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>{error && <div className="form-error">{error}</div>}<button className="button primary full" type="submit">Sign in <ArrowRight size={17} /></button></form><div className="divider"><span>Prototype access</span></div><div className="quick-grid">{quickAccounts.map((account) => (<button key={account.id} type="button" onClick={() => quick(account.id, account.to)}><span>{account.initials}</span><div><strong>{account.title}</strong><small>{account.name}</small></div></button>))}</div><div className="demo-credentials"><strong>Demo credentials</strong><code>intern: aisha.rahman@mail.apu.edu.my / intern123</code><code>supervisor: marcus@rizurf.com / supervisor123</code></div></div></section>
    </div>
  )
}
