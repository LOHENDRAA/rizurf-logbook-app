import { useEffect, useRef, useState } from 'react'
import { BookOpen, LayoutDashboard, LogOut, Menu, RotateCcw, Users, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { getEnv } from '../config/env'

export function AppShell() {
  const { currentUser, currentRole, logout, resetDemo } = useApp()
  const session = useOptionalSession()
  const managed = session?.managed ?? false
  // Managed sessions display the authoritative server identity; the legacy
  // store owns the UI only when unmanaged.
  const role = managed ? session?.user?.role : currentRole
  const isSupervisor = role === 'supervisor'
  const isMentor = role === 'university_mentor'
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const closeRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  // Escape closes the mobile drawer; focus lands on the close button when
  // opened and returns to the menu button when closed.
  useEffect(() => {
    if (!menuOpen) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const workspaceLabel = isSupervisor ? 'Supervisor workspace' : isMentor ? 'Mentor workspace' : 'Student workspace'
  const displayName = managed ? (session?.user?.name ?? '') : (currentUser?.name ?? '')
  const displayAvatar = managed ? (session?.user?.avatar ?? '') : (currentUser?.avatar ?? '')
  const roleLabel = isSupervisor ? 'Supervisor' : isMentor ? 'University Mentor' : 'Student'
  // Demo reset is a development affordance: production workspaces are
  // server-owned and must never be reseeded from the client.
  let showResetDemo = true
  try {
    showResetDemo = !getEnv().isProduction
  } catch {
    showResetDemo = true
  }

  // Managed sign-out destroys the server session first (cookie, query cache,
  // recovery drafts), then clears the legacy local marker — never one
  // without the other.
  const signOut = () => {
    if (managed && session) {
      void session.logout().finally(() => logout())
    } else {
      logout()
    }
  }

  return (
    <div className="app-frame">
      <button
        ref={menuButtonRef}
        className="mobile-menu button-icon"
        onClick={() => setMenuOpen(true)}
        aria-label="Open navigation"
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
      ><Menu /></button>
      {menuOpen && <button className="nav-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <aside id="app-sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Primary">
        <div className="sidebar-brand"><span className="brand-mark" aria-hidden="true">R</span><div><strong>Rizurf Logbook System</strong><small>{workspaceLabel}</small></div><button ref={closeRef} className="button-icon sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X /></button></div>
        <div className="workspace-label" aria-hidden="true">WORKSPACE</div>
        <nav aria-label="Workspace">
          {isSupervisor ? (
            <NavLink to="/supervisor/dashboard" className={({ isActive }) => isActive ? 'active' : ''}><Users size={19} aria-hidden="true" /><span>Interns</span></NavLink>
          ) : isMentor ? (
            <NavLink to="/mentor/dashboard" className={({ isActive }) => isActive ? 'active' : ''}><Users size={19} aria-hidden="true" /><span>Mentees</span></NavLink>
          ) : (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}><LayoutDashboard size={19} aria-hidden="true" /><span>Overview</span></NavLink>
              <NavLink to="/journal" className={({ isActive }) => isActive ? 'active' : ''}><BookOpen size={19} aria-hidden="true" /><span>Journal</span></NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-profile"><span aria-hidden="true">{displayAvatar}</span><div><strong>{displayName}</strong><small>{roleLabel}</small></div></div>
          {showResetDemo && <button onClick={() => void resetDemo()}><RotateCcw size={18} aria-hidden="true" />Reset demo</button>}
          <button onClick={signOut}><LogOut size={18} aria-hidden="true" />Sign out</button>
        </div>
      </aside>
      <div className="main-column">
        <main className="page"><Outlet /></main>
      </div>
    </div>
  )
}
