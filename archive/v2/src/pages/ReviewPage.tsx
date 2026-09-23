import { ArrowLeft, Check, ChevronRight, MessageSquareText, Send, Stamp } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { getDocuments } from '../data'
import { definitionFor, documentProgress, documentStatus, partProgress } from '../lib/workflow'
import { useApp } from '../state/AppContext'
import type { PartId } from '../types'
import { ASSESSMENT_CRITERIA } from '../lib/officialTemplates'


export function ReviewPage() {
  const { internId } = useParams()
  const { currentUser, data, approveSections, requestChanges, updateFields } = useApp()
  const [part, setPart] = useState<PartId>('part1')
  const [documentId, setDocumentId] = useState('p1-logbook')
  const [sectionIndex, setSectionIndex] = useState(0)
  const [comment, setComment] = useState('')
  if (currentUser?.role !== 'supervisor') return <Navigate to="/dashboard" replace />
  const record = data.records.find((item) => item.internId === internId && item.supervisorId === currentUser.id)
  if (!record) return <Navigate to="/supervisor" replace />
  const intern = data.users.find((user) => user.id === record.internId)!
  const definitions = getDocuments(part)
  const selectedDefinition = definitionFor(documentId)?.part === part ? definitionFor(documentId)! : definitions[0]
  const document = record.documents[selectedDefinition.id]
  const section = document.sections[Math.min(sectionIndex, document.sections.length - 1)]
  const submitted = (section.status === 'submitted_for_review' || (selectedDefinition.kind === 'assessment' && section.status === 'draft')) && !selectedDefinition.id.endsWith('cover')
  const documentHasRejected = document.sections.some((item) => item.status === 'changes_requested')
  const submittedInDocument = document.sections.filter((item) => item.status === 'submitted_for_review').map((item) => item.id)
  const phaseHasRejected = definitions.some((definition) => record.documents[definition.id].sections.some((item) => item.status === 'changes_requested'))
  const submittedInPart = definitions.flatMap((definition) => record.documents[definition.id].sections.filter((item) => item.status === 'submitted_for_review').map((item) => ({ definition, id: item.id })))

  const changePart = (next: PartId) => { setPart(next); setDocumentId(getDocuments(next)[0].id); setSectionIndex(0) }
  const chooseDocument = (id: string) => { setDocumentId(id); setSectionIndex(0); setComment('') }
  const approvePart = () => { if (phaseHasRejected) return; const grouped = new Map<string, string[]>(); submittedInPart.forEach(({ definition, id }) => grouped.set(definition.id, [...(grouped.get(definition.id) ?? []), id])); grouped.forEach((ids, id) => approveSections(record.internId, id, ids)) }

  return <>
    <Link className="back-link" to="/supervisor"><ArrowLeft size={16} />All interns</Link>
    <div className="review-person"><span>{intern.avatar}</span><div><span className="eyebrow teal">INTERN REVIEW</span><h1>{intern.name}</h1><p>{record.studentId} · {record.title} · {record.company}</p></div><div className="review-person-progress"><strong>{partProgress(record, part).percent}%</strong><small>{part === 'part1' ? 'Part 1' : 'Part 2'} ready</small></div></div>
    <div className="review-tabs"><button className={part === 'part1' ? 'active' : ''} onClick={() => changePart('part1')}>Part 1 <span>{partProgress(record, 'part1').percent}%</span></button><button className={part === 'part2' ? 'active' : ''} onClick={() => changePart('part2')}>Part 2 <span>{partProgress(record, 'part2').percent}%</span></button><button className="approve-part" disabled={phaseHasRejected || submittedInPart.length === 0} onClick={approvePart}><Stamp size={16} />Approve all submitted</button></div>
    {phaseHasRejected && <div className="inline-warning">Bulk approval is unavailable while this part contains requested changes.</div>}
    <div className="review-layout">
      <aside className="review-documents"><span className="eyebrow">DOCUMENTS</span>{definitions.map((definition) => { const item = record.documents[definition.id]; const pending = item.sections.filter((value) => value.status === 'submitted_for_review').length; return <button className={definition.id === selectedDefinition.id ? 'active' : ''} onClick={() => chooseDocument(definition.id)} key={definition.id}><span className="doc-order">{String(definition.order).padStart(2, '0')}</span><div><strong>{definition.shortTitle}</strong><small>{documentProgress(item)}% complete</small></div>{pending > 0 && <em>{pending}</em>}<ChevronRight size={16} /></button>})}</aside>
      <section className="review-content"><div className="review-content-head"><div><span className="eyebrow teal">{selectedDefinition.kind.toUpperCase()}</span><h2>{selectedDefinition.title}</h2></div><StatusBadge status={documentStatus(document)} /></div>{document.sections.length > 1 && <div className="section-pills">{document.sections.map((item, index) => <button className={index === sectionIndex ? 'active' : ''} onClick={() => { setSectionIndex(index); setComment('') }} key={item.id}>{item.label}{item.status === 'submitted_for_review' && <i />}</button>)}</div>}
        <div className="review-sheet"><div className="sheet-head"><div><span>APU INTERNSHIP LOGBOOK</span><strong>{section.label}</strong></div><StatusBadge status={section.status} /></div>{selectedDefinition.kind === 'assessment' ? <AssessmentEditor section={section} onChange={(fields) => updateFields(record.internId, selectedDefinition.id, section.id, fields)} /> : selectedDefinition.kind === 'upload' ? <div className="review-files">{document.files.length ? document.files.map((file, index) => <div key={file.id}><span>{index + 1}</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div></div>) : <p>No files uploaded.</p>}</div> : <div className="sheet-fields">{Object.entries(section.fields).length ? Object.entries(section.fields).map(([key, value]) => <div key={key}><small>{key.replace(/([A-Z])/g, ' $1')}</small><p>{value || '—'}</p></div>) : <p className="empty-copy">No information entered in this section.</p>}</div>}
          {section.approvedAt && <div className="signed-row"><Stamp /><span><strong>Digitally approved by {currentUser.name}</strong><small>Signature and company stamp applied · {new Date(section.approvedAt).toLocaleString('en-MY')}</small></span></div>}
        </div>
        <div className="review-actions"><div className="comment-field"><MessageSquareText /><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional feedback for this section…" /></div><div><button className="button danger" disabled={!submitted} onClick={() => { requestChanges(record.internId, selectedDefinition.id, section.id, comment); setComment('') }}>Request changes</button><button className="button primary" disabled={!submitted} onClick={() => approveSections(record.internId, selectedDefinition.id, [section.id])}><Check size={16} />Approve & sign</button></div></div>
        <div className="bulk-row"><span>{submittedInDocument.length} sections in this document awaiting review</span><button className="button secondary" disabled={documentHasRejected || submittedInDocument.length === 0} onClick={() => approveSections(record.internId, selectedDefinition.id, submittedInDocument)}><Send size={15} />Approve submitted sections</button></div>
      </section>
    </div>
  </>
}

function AssessmentEditor({ section, onChange }: { section: ReturnType<typeof useApp>['data']['records'][number]['documents'][string]['sections'][number]; onChange: (fields: Record<string, string>) => void }) {
  return <div className="assessment-editor"><p>Rate each criterion from A to U. The prototype records the score but does not enforce a pass threshold.</p>{ASSESSMENT_CRITERIA.map((criterion, index) => <div className="assessment-criterion" key={criterion}><label><span>{criterion}</span><select value={section.fields[`criterion-${index}`] ?? ''} onChange={(event) => onChange({ [`criterion-${index}`]: event.target.value })}><option value="">Select</option>{['A', 'B', 'C', 'D', 'U'].map((grade) => <option key={grade}>{grade}</option>)}</select></label><input aria-label={`${criterion} comments`} placeholder="Criterion comment (optional)" value={section.fields[`criterion-comment-${index}`] ?? ''} onChange={(event) => onChange({ [`criterion-comment-${index}`]: event.target.value })} /></div>)}<label><span>Overall score</span><select value={section.fields.score ?? ''} onChange={(event) => onChange({ score: event.target.value })}><option value="">Select</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label><label className="assessment-comments"><span>Overall comments</span><textarea value={section.fields.comments ?? ''} onChange={(event) => onChange({ comments: event.target.value })} /></label></div>
}
