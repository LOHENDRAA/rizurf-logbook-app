import { ArrowRight, CheckCircle2, Clock3, FileWarning, Users } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { ProgressBar } from '../components/StatusBadge'
import { partProgress } from '../lib/workflow'
import { useApp } from '../state/AppContext'

export function SupervisorDashboard() {
  const { currentUser, data } = useApp()
  if (currentUser?.role !== 'supervisor') return <Navigate to="/dashboard" replace />
  const records = data.records.filter((record) => record.supervisorId === currentUser.id)
  const pending = records.reduce((sum, record) => sum + Object.values(record.documents).flatMap((document) => document.sections).filter((section) => section.status === 'submitted_for_review').length, 0)
  const changes = records.reduce((sum, record) => sum + Object.values(record.documents).flatMap((document) => document.sections).filter((section) => section.status === 'changes_requested').length, 0)
  return <>
    <PageHeading eyebrow="SUPERVISOR WORKSPACE" title="Keep every intern moving." description="Review submitted work, follow deadlines, and approve records with your company signature."><Link className="button secondary" to="/profile">Manage signature & stamp</Link></PageHeading>
    <div className="metric-grid"><div className="metric"><span><Users /></span><div><small>ASSIGNED INTERNS</small><strong>{records.length}</strong><p>Across your company placements</p></div></div><div className="metric accent"><span><Clock3 /></span><div><small>WAITING FOR REVIEW</small><strong>{pending}</strong><p>Sections need your attention</p></div></div><div className="metric"><span><CheckCircle2 /></span><div><small>APPROVED</small><strong>{records.reduce((sum, record) => sum + Object.values(record.documents).flatMap((document) => document.sections).filter((section) => section.status === 'approved' || section.status === 'completed').length, 0)}</strong><p>Requirements completed</p></div></div><div className="metric warning"><span><FileWarning /></span><div><small>CHANGES REQUESTED</small><strong>{changes}</strong><p>Sections returned to interns</p></div></div></div>
    <div className="section-heading"><div><span className="eyebrow">ASSIGNED INTERNS</span><h2>Progress and review queue</h2></div></div>
    <div className="intern-table"><div className="intern-table-head"><span>Intern</span><span>Current milestone</span><span>Progress</span><span>Awaiting review</span><span /></div>{records.map((record) => { const intern = data.users.find((user) => user.id === record.internId)!; const p1 = partProgress(record, 'part1'); const p2 = partProgress(record, 'part2'); const active = p1.percent === 100 ? p2 : p1; const count = Object.values(record.documents).flatMap((document) => document.sections).filter((section) => section.status === 'submitted_for_review').length; return <Link key={record.internId} to={`/supervisor/interns/${record.internId}`}><span className="table-person"><i>{intern.avatar}</i><span><strong>{intern.name}</strong><small>{record.studentId} · {record.title}</small></span></span><span><strong>{p1.percent === 100 ? 'Part 2' : 'Part 1'}</strong><small>Due {new Date(record.dueDates[p1.percent === 100 ? 'part2' : 'part1']).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}</small></span><span className="table-progress"><span><ProgressBar value={active.percent} compact /></span><strong>{active.percent}%</strong></span><span>{count ? <em className="review-count">{count} pending</em> : <em className="quiet-count">Up to date</em>}</span><ArrowRight size={17} /></Link>})}</div>
    <div className="supervisor-guidance"><div><span className="eyebrow teal">REVIEW PRINCIPLE</span><h3>Approve the work, not just the checklist.</h3><p>Open each submitted section, check its details, and add focused feedback when changes are needed.</p></div><CheckCircle2 /></div>
  </>
}
