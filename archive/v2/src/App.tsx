import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useApp } from './state/AppContext'
import { LoginPage } from './pages/LoginPage'
import { InternDashboard } from './pages/InternDashboard'
import { PartPage } from './pages/PartPage'
import { DocumentPage } from './pages/DocumentPage'
import { SupervisorDashboard } from './pages/SupervisorDashboard'
import { ReviewPage } from './pages/ReviewPage'
import { SummaryPage } from './pages/SummaryPage'
import { ProfilePage } from './pages/ProfilePage'

function HomeRoute() {
  const { currentUser } = useApp()
  return <Navigate to={currentUser?.role === 'supervisor' ? '/supervisor' : '/dashboard'} replace />
}

function ProtectedApp() {
  const { currentUser } = useApp()
  if (!currentUser) return <Navigate to="/login" replace />
  return <AppShell />
}

export default function App() {
  const { currentUser, ready } = useApp()
  if (!ready) return <div className="splash"><span className="brand-mark">IF</span><p>Preparing your workspace…</p></div>
  return (
    <Routes>
      <Route path="/login" element={currentUser ? <HomeRoute /> : <LoginPage />} />
      <Route element={<ProtectedApp />}>
        <Route index element={<HomeRoute />} />
        <Route path="dashboard" element={<InternDashboard />} />
        <Route path="parts/:partId" element={<PartPage />} />
        <Route path="parts/:partId/documents/:documentId" element={<DocumentPage />} />
        <Route path="summary" element={<SummaryPage />} />
        <Route path="supervisor" element={<SupervisorDashboard />} />
        <Route path="supervisor/interns/:internId" element={<ReviewPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
