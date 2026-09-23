import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useApp } from './state/AppContext'
import { useOptionalSession } from './state/sessionContext'
import type { UserRole } from './types'
import { LoginPage } from './pages/LoginPage'

const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })))
const JournalDashboardPage = lazy(() =>
  import('./pages/JournalDashboardPage').then((module) => ({ default: module.JournalDashboardPage })),
)
const DayPage = lazy(() => import('./pages/DayPage').then((module) => ({ default: module.DayPage })))
const WeekPage = lazy(() => import('./pages/WeekPage').then((module) => ({ default: module.WeekPage })))
const SupervisorDashboardPage = lazy(() =>
  import('./pages/SupervisorDashboardPage').then((module) => ({ default: module.SupervisorDashboardPage })),
)
const SupervisorInternPage = lazy(() =>
  import('./pages/SupervisorInternPage').then((module) => ({ default: module.SupervisorInternPage })),
)
const SupervisorWeekReviewPage = lazy(() =>
  import('./pages/SupervisorWeekReviewPage').then((module) => ({ default: module.SupervisorWeekReviewPage })),
)
const MentorDashboardPage = lazy(() =>
  import('./pages/MentorDashboardPage').then((module) => ({ default: module.MentorDashboardPage })),
)
const MentorInternPage = lazy(() =>
  import('./pages/MentorInternPage').then((module) => ({ default: module.MentorInternPage })),
)
const MentorWeekReviewPage = lazy(() =>
  import('./pages/MentorWeekReviewPage').then((module) => ({ default: module.MentorWeekReviewPage })),
)

function Splash({ message }: { message: string }) {
  return <div className="splash"><span className="brand-mark">R</span><p>{message}</p></div>
}

interface GuardIdentity {
  managed: boolean
  booting: boolean
  signedIn: boolean
  role: UserRole | undefined
}

/**
 * Guard identity: when a SessionProvider manages the session, the server
 * (/me) is authoritative — guards wait for boot, then enforce the server
 * role. Otherwise the legacy local store owns the UI (dev/test, unchanged).
 */
function useGuardIdentity(): GuardIdentity {
  const session = useOptionalSession()
  const { currentUser, currentRole } = useApp()
  if (session?.managed) {
    return {
      managed: true,
      booting: session.status === 'booting',
      signedIn: session.user !== undefined,
      role: session.user?.role,
    }
  }
  return { managed: false, booting: false, signedIn: currentUser !== undefined, role: currentRole }
}

function roleHome(role: UserRole | undefined): string {
  if (role === 'supervisor') return '/supervisor/dashboard'
  if (role === 'university_mentor') return '/mentor/dashboard'
  return '/dashboard'
}

function HomeRoute() {
  const identity = useGuardIdentity()
  if (identity.booting) return <Splash message="Preparing your workspace…" />
  if (!identity.signedIn) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(identity.role)} replace />
}

function RequireStudent() {
  const identity = useGuardIdentity()
  if (identity.booting) return <Splash message="Preparing your workspace…" />
  if (!identity.signedIn) return <Navigate to="/login" replace />
  if (identity.role === 'supervisor') return <Navigate to="/supervisor/dashboard" replace />
  if (identity.role === 'university_mentor') return <Navigate to="/mentor/dashboard" replace />
  if (identity.role !== 'student') return <Navigate to="/dashboard" replace />
  return <AppShell />
}

function RequireSupervisor() {
  const identity = useGuardIdentity()
  if (identity.booting) return <Splash message="Preparing your workspace…" />
  if (!identity.signedIn) return <Navigate to="/login" replace />
  if (identity.role !== 'supervisor') return <Navigate to="/dashboard" replace />
  return <AppShell />
}

function RequireMentor() {
  const identity = useGuardIdentity()
  if (identity.booting) return <Splash message="Preparing your workspace…" />
  if (!identity.signedIn) return <Navigate to="/login" replace />
  if (identity.role !== 'university_mentor') return <Navigate to="/dashboard" replace />
  return <AppShell />
}

export default function App() {
  const { currentUser, ready, loadError, retryLoad, dismissLoadError, resetDemo } = useApp()
  const session = useOptionalSession()
  const managed = session?.managed ?? false
  // Managed boot owns the first paint: never flash the login form while the
  // server session is still resolving.
  if (managed && session?.status === 'booting') return <Splash message="Preparing your workspace…" />
  if (!ready) return <Splash message="Preparing your workspace…" />
  const signedIn = managed ? session?.user !== undefined : currentUser !== undefined
  return (
    <>
    {loadError ? (
      <div className="load-error-banner" role="alert">
        <p>{loadError}</p>
        <div className="load-error-actions">
          <button type="button" onClick={() => void retryLoad()}>Retry</button>
          <button type="button" onClick={() => void resetDemo()}>Reset demo</button>
          <button type="button" aria-label="Dismiss workspace error" onClick={dismissLoadError}>Dismiss</button>
        </div>
      </div>
    ) : null}
    <Suspense fallback={<Splash message="Loading…" />}>
    <Routes>
      <Route path="/login" element={signedIn ? <HomeRoute /> : <LoginPage />} />
      <Route element={<RequireStudent />}>
        <Route path="dashboard" element={<OverviewPage />} />
        <Route path="journal" element={<JournalDashboardPage />} />
        <Route path="journal/days/:date" element={<DayPage />} />
        <Route path="journal/weeks/:weekNumber" element={<WeekPage />} />
        <Route path="weeks/:weekId" element={<Navigate to="/journal" replace />} />
      </Route>
      <Route element={<RequireSupervisor />}>
        <Route path="supervisor/dashboard" element={<SupervisorDashboardPage />} />
        <Route path="supervisor/interns/:studentId" element={<SupervisorInternPage />} />
        <Route path="supervisor/interns/:studentId/weeks/:weekNumber" element={<SupervisorWeekReviewPage />} />
      </Route>
      <Route element={<RequireMentor />}>
        <Route path="mentor/dashboard" element={<MentorDashboardPage />} />
        <Route path="mentor/interns/:studentId" element={<MentorInternPage />} />
        <Route path="mentor/interns/:studentId/weeks/:weekNumber" element={<MentorWeekReviewPage />} />
      </Route>
      <Route index element={<HomeRoute />} />
      <Route path="*" element={<HomeRoute />} />
    </Routes>
    </Suspense>
    </>
  )
}
