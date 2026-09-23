import { CheckCircle2, Download, FileCheck2, Printer } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { getDocuments } from '../data'
import { documentStatus, isCompleteStatus, partProgress } from '../lib/workflow'
import { useApp } from '../state/AppContext'
import { PageHeading } from '../components/PageHeading'
import type { PartId } from '../types'

export function SummaryPage() {
  const { currentUser, data } = useApp()
  if (currentUser?.role !== 'intern') return <Navigate to="/supervisor" replace />
  const record = data.records.find((item) => item.internId === currentUser.id)!
  const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url) }
  return <>
    <PageHeading eyebrow="FINAL OVERVIEW" title="Your complete internship record." description="A printable view of document completion, approvals, and generated PDF versions." className="no-print"><button className="button secondary" onClick={() => window.print()}><Printer size={17} />Print overview</button></PageHeading>
    <section className="print-header"><span className="brand-mark">IF</span><div><h1>Internship Logbook Summary</h1><p>Generated {new Date().toLocaleDateString('en-MY', { dateStyle: 'long' })}</p></div></section>
    <div className="summary-identity"><div><small>STUDENT</small><strong>{currentUser.name}</strong><span>{record.studentId}</span></div><div><small>PLACEMENT</small><strong>{record.title}</strong><span>{record.company}</span></div><div><small>INTERNSHIP PERIOD</small><strong>{new Date(record.startDate).toLocaleDateString('en-MY')} – {new Date(record.endDate).toLocaleDateString('en-MY')}</strong><span>{record.intake}</span></div></div>
    <div className="summary-parts">{(['part1', 'part2'] as PartId[]).map((part) => { const progress = partProgress(record, part); const versions = record.pdfs.filter((pdf) => pdf.part === part).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return <section className="summary-part" key={part}><div className="summary-title"><div><span>{part === 'part1' ? '01' : '02'}</span><div><small>INTERNSHIP</small><h2>{part === 'part1' ? 'Part 1' : 'Part 2'}</h2></div></div><div className={progress.percent === 100 ? 'complete-seal' : 'incomplete-seal'}><CheckCircle2 /><span><strong>{progress.percent}%</strong><small>{progress.percent === 100 ? 'Workflow complete' : 'In progress'}</small></span></div></div><div className="summary-docs">{getDocuments(part).map((definition) => { const document = record.documents[definition.id]; return <div key={definition.id}><span className={isCompleteStatus(documentStatus(document)) ? 'summary-check checked' : 'summary-check'}>{isCompleteStatus(documentStatus(document)) && <CheckCircle2 />}</span><div><strong>{definition.title}</strong><small>{document.sections.filter((section) => section.status === 'approved' || section.status === 'completed').length} of {document.sections.length} sections complete</small></div><em>{documentStatus(document).replaceAll('_', ' ')}</em></div>})}</div><div className="summary-pdfs"><h3><FileCheck2 />Generated PDFs</h3>{versions.length ? versions.map((version, index) => <button className="no-print" onClick={() => download(version.blob, version.filename)} key={version.id}><span><strong>Version {versions.length - index}</strong><small>{new Date(version.createdAt).toLocaleString('en-MY')}</small></span>{version.outdated && <em>Outdated</em>}<Download /></button>) : <p>No PDF generated for this part.</p>}</div></section> })}</div>
    <p className="summary-disclaimer">This summary confirms workflow activity inside InternFlow. It does not confirm submission to the university’s external portal.</p>
  </>
}
