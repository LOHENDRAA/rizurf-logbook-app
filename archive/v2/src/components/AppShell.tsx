import { useEffect, useState } from 'react'
import { Bell, BookOpenCheck, ClipboardCheck, FileStack, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext'

export function AppShell() {
  const { currentUser, data, logout, markNotificationsRead } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const location = useLocation()
  const notices = data.notifications.filter((notice) => notice.userId === currentUser?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unread = notices.filter((notice) => !notice.read).length

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  const internNav = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/parts/part1', label: 'Part 1', icon: BookOpenCheck },
    { to: '/parts/part2', label: 'Part 2', icon: FileStack },
    { to: '/summary', label: 'Final overview', icon: ClipboardCheck },
  ]
  const supervisorNav = [
    { to: '/supervisor', label: 'Interns & reviews', icon: Users },
    { to: '/profile', label: 'Signature setup', icon: Settings },
  ]
  const nav = currentUser?.role === 'intern' ? internNav : supervisorNav

  return (
    <div className="app-frame">
      <button className="mobile-menu button-icon" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
      {menuOpen && <button className="nav-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand"><span className="brand-mark">IF</span><div><strong>InternFlow</strong><small>APU logbook</small></div><button className="button-icon sidebar-close" onClick={() => setMenuOpen(false)}><X /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
        <div className="sidebar-foot">
          <NavLink to="/profile"><Settings size={18} />Profile & settings</NavLink>
          <button onClick={logout}><LogOut size={18} />Sign out</button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-context"><span className="eyebrow">INTERNSHIP WORKSPACE</span><strong>{currentUser?.role === 'intern' ? 'My logbook' : 'Supervisor console'}</strong></div>
          <div className="topbar-actions">
            <div className="notice-wrap">
              <button className="button-icon" onClick={() => { setNoticesOpen((value) => !value); if (!noticesOpen) markNotificationsRead() }} aria-label="Notifications"><Bell size={19} />{unread > 0 && <span className="notice-count">{unread}</span>}</button>
              {noticesOpen && <div className="notice-panel"><div className="notice-head"><strong>Notifications</strong><span>{notices.length}</span></div>{notices.length ? notices.slice(0, 5).map((notice) => <div className="notice-item" key={notice.id}><i /><div><strong>{notice.title}</strong><p>{notice.body}</p><small>{new Date(notice.createdAt).toLocaleDateString('en-MY')}</small></div></div>) : <p className="empty-copy">You’re all caught up.</p>}</div>}
            </div>
            <div className="user-chip"><span>{currentUser?.avatar}</span><div><strong>{currentUser?.name}</strong><small>{currentUser?.role === 'intern' ? 'Intern' : 'Company supervisor'}</small></div></div>
          </div>
        </header>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  )
}
