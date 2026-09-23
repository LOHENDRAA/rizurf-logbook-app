import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileText, Sparkles } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { getDocuments } from '../data'
import { documentStatus, partComplete, partProgress } from '../lib/workflow'
import { useApp } from '../state/AppContext'
import { PageHeading } from '../components/PageHeading'
import { ProgressBar, StatusBadge } from '../components/StatusBadge'
import type { PartId } from '../types'

export function InternDashboard() {
  const { currentUser, data } = useApp()
  if (currentUser?.role !== 'intern') return <Navigate to="/supervisor" replace />
  const record = data.records.find((item) => item.internId === currentUser.id)!
  const p1 = partProgress(record, 'part1')
  const p2 = partProgress(record, 'part2')
  const next = getDocuments(partComplete(record, 'part1') ? 'part2' : 'part1').find((definition) => documentStatus(record.documents[definition.id]) !== 'approved' && documentStatus(record.documents[definition.id]) !== 'completed')
  const activePart = partComplete(record, 'part1') ? 'part2' : 'part1'
  const days = Math.max(0, Math.ceil((new Date(record.dueDates[activePart]).getTime() - Date.now()) / 86_400_000))

  return <>
    <PageHeading eyebrow={`GOOD MORNING, ${currentUser.name.split(' ')[0].toUpperCase()}`} title="Your internship, on track." description="Everything you need for a complete APU internship submission."><Link className="button primary" to={`/parts/${next?.part ?? 'part1'}/documents/${next?.id ?? 'p1-cover'}`}>Continue where you left off <ArrowRight size={17} /></Link></PageHeading>
    <section className="hero-progress"><div className="ambient ambient-one" /><div className="hero-progress-top"><div><span className="hero-pill"><Sparkles size={14} /> CURRENT MILESTONE</span><h2>{partComplete(record, 'part1') ? 'Complete Part 2' : 'Complete Part 1'}</h2><p>{next ? `Next up: ${next.title}` : 'All document work is complete.'}</p></div><div className="big-progress"><strong>{partComplete(record, 'part1') ? p2.percent : p1.percent}%</strong><span>ready</span></div></div><ProgressBar value={partComplete(record, 'part1') ? p2.percent : p1.percent} /><div className="hero-meta"><span><CalendarDays size={16} /> Due {new Date(record.dueDates[partComplete(record, 'part1') ? 'part2' : 'part1']).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</span><span><Clock3 size={16} /> {days} days remaining</span><span><CheckCircle2 size={16} /> {p1.approved + p2.approved} sections complete</span></div></section>
    <div className="section-heading"><div><span className="eyebrow">YOUR SUBMISSION</span><h2>Two parts. One complete record.</h2></div></div>
    <div className="part-grid"><PartCard part="part1" record={record} /><PartCard part="part2" record={record} locked={!partComplete(record, 'part1')} /></div>
    <section className="dashboard-grid"><div className="card"><div className="card-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Latest updates</h3></div></div><div className="timeline">{Object.values(record.documents).flatMap((document) => document.sections.flatMap((section) => section.history.map((entry) => ({ ...entry, section: section.label })))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((entry) => <div key={entry.id}><i /><span><strong>{entry.action}</strong><p>{entry.section} · {entry.actor}</p><small>{new Date(entry.date).toLocaleDateString('en-MY')}</small></span></div>)}</div></div><div className="card support-card"><FileText /><h3>Report writing guide</h3><p>Your placement report should be approximately 3,000 words and connect company experience to employability skills.</p><Link to="/parts/part2/documents/p2-report">View report requirements <ArrowRight size={15} /></Link></div></section>
  </>
}

function PartCard({ part, record, locked = false }: { part: PartId; record: ReturnType<typeof useApp>['data']['records'][number]; locked?: boolean }) {
  const progress = partProgress(record, part)
  const docs = getDocuments(part)
  return <article className={`part-card ${locked ? 'locked' : ''}`}><div className="part-card-top"><span className="part-number">{part === 'part1' ? '01' : '02'}</span><div className="due-pill">Due {new Date(record.dueDates[part]).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}</div></div><h3>{part === 'part1' ? 'Part 1' : 'Part 2'}</h3><p>{part === 'part1' ? 'Placement essentials and your first eight weeks.' : 'Final report, attendance, assessment, and remaining logs.'}</p><div className="part-progress-line"><span>{progress.approved} of {progress.total} sections</span><strong>{progress.percent}%</strong></div><ProgressBar value={progress.percent} compact /><div className="mini-checklist">{docs.slice(0, 4).map((definition) => <div key={definition.id}><StatusBadge status={documentStatus(record.documents[definition.id])} /><span>{definition.shortTitle}</span></div>)}</div>{locked ? <div className="locked-note">Complete Part 1 to unlock</div> : <Link to={`/parts/${part}`}>Open {part === 'part1' ? 'Part 1' : 'Part 2'} <ArrowRight size={16} /></Link>}</article>
}
