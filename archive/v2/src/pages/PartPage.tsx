import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileCheck2, FileClock, FilePlus2, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getDocuments } from '../data'
import { documentProgress, documentStatus, partComplete, partProgress } from '../lib/workflow'
import { useApp } from '../state/AppContext'
import { ProgressBar, StatusBadge } from '../components/StatusBadge'
import type { PartId } from '../types'

export function PartPage() {
  const { partId } = useParams()
  const part = partId as PartId
  const { currentUser, data, generatePdf } = useApp()
  const [generating, setGenerating] = useState(false)
  if (currentUser?.role !== 'intern') return <Navigate to="/supervisor" replace />
  if (!['part1', 'part2'].includes(part)) return <Navigate to="/dashboard" replace />
  const record = data.records.find((item) => item.internId === currentUser.id)!
  const locked = part === 'part2' && !partComplete(record, 'part1')
  const progress = partProgress(record, part)
  const definitions = getDocuments(part)
  const versions = record.pdfs.filter((pdf) => pdf.part === part).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const generate = async () => { setGenerating(true); try { await generatePdf(record.internId, part) } finally { setGenerating(false) } }
  const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url) }

  if (locked) return <div className="locked-page"><LockKeyhole /><span className="eyebrow teal">PART 2 IS LOCKED</span><h1>Finish Part 1 first.</h1><p>Every Part 1 requirement must be completed and all requested supervisor approvals received.</p><Link className="button primary" to="/parts/part1">Return to Part 1</Link></div>

  return <>
    <Link className="back-link" to="/dashboard"><ArrowLeft size={16} />Dashboard</Link>
    <div className="part-hero"><div><span className="eyebrow teal">INTERNSHIP {part === 'part1' ? 'PART 1' : 'PART 2'}</span><h1>{part === 'part1' ? 'Build your placement record.' : 'Complete your internship story.'}</h1><p>{part === 'part1' ? 'Prepare your placement documents and record Weeks 01–08.' : 'Bring together your final report, records, assessment, and Weeks 09–16.'}</p><div className="hero-meta"><span><CheckCircle2 size={16} /> {progress.approved} of {progress.total} sections complete</span><span><FileClock size={16} /> Due {new Date(record.dueDates[part]).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div><div className="progress-orbit"><strong>{progress.percent}%</strong><span>complete</span></div></div>
    <div className="content-two-col">
      <section><div className="section-heading"><div><span className="eyebrow">REQUIRED DOCUMENTS</span><h2>Complete in this order</h2></div><span className="section-count">{definitions.length} items</span></div><div className="document-list">{definitions.map((definition, index) => { const document = record.documents[definition.id]; const status = documentStatus(document); const percent = documentProgress(document); return <Link to={`/parts/${part}/documents/${definition.id}`} className="document-row" key={definition.id}><span className="document-index">{String(index + 1).padStart(2, '0')}</span><div className="document-main"><div><h3>{definition.title}</h3><StatusBadge status={status} /></div><p>{definition.description}</p><div className="document-progress"><ProgressBar value={percent} compact /><span>{percent}%</span></div></div><div className={`kind-icon kind-${definition.kind}`}>{definition.kind === 'upload' ? <FilePlus2 /> : <FileCheck2 />}</div><ArrowRight className="row-arrow" size={18} /></Link> })}</div></section>
      <aside className="sticky-stack"><div className="card generate-card"><span className="eyebrow teal">COMBINED PDF</span><h3>{part === 'part1' ? 'Part 1' : 'Part 2'} submission pack</h3><p>Generate one PDF containing every completed document in the official order.</p><div className="readiness"><span>Readiness</span><strong>{progress.percent}%</strong></div><ProgressBar value={progress.percent} /><button className="button primary full" onClick={generate} disabled={!partComplete(record, part) || generating}>{generating ? 'Generating…' : 'Generate combined PDF'}</button>{!partComplete(record, part) && <small>Complete all requirements to enable generation.</small>}</div><div className="card"><div className="card-head"><div><span className="eyebrow">RECENT VERSIONS</span><h3>PDF history</h3></div></div>{versions.length ? <div className="version-list">{versions.map((version, index) => <button key={version.id} onClick={() => download(version.blob, version.filename)}><span><strong>Version {versions.length - index}</strong><small>{new Date(version.createdAt).toLocaleString('en-MY')}</small></span>{version.outdated && <em>Outdated</em>}<Download size={17} /></button>)}</div> : <p className="empty-copy">Generated PDFs will appear here.</p>}</div></aside>
    </div>
  </>
}
