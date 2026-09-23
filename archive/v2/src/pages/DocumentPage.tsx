import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleAlert, File, FileText, History, Info, Lock, Send, Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { DocumentPreview } from '../components/DocumentPreview'
import { ASSESSMENT_CRITERIA } from '../lib/officialTemplates'
import { definitionFor, documentStatus, isCoverDefinition, isSectionValid, shouldHideLockedFields } from '../lib/workflow'
import { useApp } from '../state/AppContext'
import type { SectionRecord } from '../types'

const attendanceFields = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

export function DocumentPage() {
  const { partId, documentId } = useParams()
  const { currentUser, data, updateFields, addFiles, removeFile, reorderFile, submitSections } = useApp()
  const [activeIndex, setActiveIndex] = useState(0)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const definition = definitionFor(documentId ?? '')
  if (!currentUser || !definition || definition.part !== partId) return <Navigate to="/" replace />
  if (currentUser.role !== 'intern') return <Navigate to="/supervisor" replace />
  const record = data.records.find((item) => item.internId === currentUser.id)!
  if (definition.part === 'part2' && !Object.values(record.documents).filter((doc) => doc.id.startsWith('p1-')).every((doc) => doc.sections.every((section) => section.status === 'approved' || section.status === 'completed'))) return <Navigate to="/parts/part2" replace />
  const document = record.documents[definition.id]
  const section = document.sections[activeIndex]
  const supervisor = data.users.find((user) => user.id === record.supervisorId)
  const readOnly = definition.owner === 'supervisor' || section.status === 'submitted_for_review'
  // Editor controls lock while a submit is in flight so normal UI edits cannot
  // race the submit; the central transition rechecks regardless.
  const editorLocked = readOnly || submitting
  const valid = isSectionValid(definition, section, document.files.length)
  const isCover = isCoverDefinition(definition)
  const statusText = isCover
    ? (section.status === 'completed'
      ? 'Marked complete — other details are auto-filled and hidden, and your saved signature applies automatically.'
      : (!valid
        ? 'Add your academic mentor to complete the cover — other details are auto-filled and hidden.'
        : 'Details ready — mark complete when ready. Your saved signature applies automatically.'))
    : (valid ? 'Required details complete' : 'Complete all required details before submitting')
  const savedLabel = document.updatedAt ? `Autosaved ${new Date(document.updatedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}` : 'Autosave ready'

  const submit = (all = false) => {
    if (submitting) return
    setSubmitting(true)
    void submitSections(record.internId, definition.id, all ? document.sections.map((item) => item.id) : [section.id])
      .then((result) => { setMessage(result.message); setMessageOk(result.ok) })
      .catch(() => { setMessage('Submission could not be completed. Please try again.'); setMessageOk(false) })
      .finally(() => setSubmitting(false))
  }
  const chooseFiles = (files: FileList | null) => { if (!files?.length) return; addFiles(record.internId, definition.id, Array.from(files)); setMessage(`${files.length} file${files.length > 1 ? 's' : ''} added and autosaved.`); setMessageOk(true) }

  return <>
    <Link className="back-link" to={`/parts/${definition.part}`}><ArrowLeft size={16} />{definition.part === 'part1' ? 'Part 1' : 'Part 2'}</Link>
    <div className="document-heading"><div><div className="heading-line"><span className="eyebrow teal">{definition.kind.toUpperCase()} · ITEM {String(definition.order).padStart(2, '0')}</span><StatusBadge status={documentStatus(document)} /></div><h1>{definition.title}</h1><p>{definition.description}</p></div><span className="save-state"><Check size={14} />{savedLabel}</span></div>
    <div className={`document-workspace ${document.sections.length === 1 ? 'single-section' : ''}${definition.kind === 'logbook' || definition.kind === 'attendance' ? ' weekly-workspace logbook-workspace' : ''}`}>
      {document.sections.length > 1 && <aside className="section-rail"><span className="eyebrow">SECTIONS</span>{document.sections.map((item, index) => <button className={index === activeIndex ? 'active' : ''} key={item.id} onClick={() => { setActiveIndex(index); setMessage('') }}><span>{index + 1}</span><div><strong>{item.label}</strong><small>{item.status.replaceAll('_', ' ')}</small></div>{(item.status === 'approved' || item.status === 'completed') && <Check size={15} />}</button>)}</aside>}
      <div className="document-content">
      <div className="preview-switch" role="tablist" aria-label="Document workspace view"><button id="document-edit-tab" role="tab" aria-selected={mobileView === 'edit'} aria-controls="document-editor-panel" className={mobileView === 'edit' ? 'active' : ''} onClick={() => setMobileView('edit')}>Edit</button><button id="document-preview-tab" role="tab" aria-selected={mobileView === 'preview'} aria-controls="document-preview-panel" className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>Preview</button></div>
      <div className="document-panels">
      <section id="document-editor-panel" role="tabpanel" aria-labelledby="document-edit-tab" className={`editor-card ${mobileView === 'preview' ? 'mobile-hidden' : ''}`}>
        <div className="guideline"><Info size={19} /><div><strong>Before you begin</strong><p>{definition.guideline}</p></div></div>
        <div className="editor-top"><div><span className="eyebrow">CURRENT SECTION</span><h2>{section.label}</h2></div><StatusBadge status={section.status} /></div>
        {definition.kind === 'upload' ? <UploadEditor files={document.files} onChoose={chooseFiles} onRemove={(id) => removeFile(record.internId, definition.id, id)} onMove={(id, direction) => reorderFile(record.internId, definition.id, id, direction)} inputRef={inputRef} readOnly={editorLocked} /> : definition.kind === 'logbook' ? <LogbookEditor section={section} readOnly={editorLocked} onChange={(fields) => updateFields(record.internId, definition.id, section.id, fields)} /> : definition.kind === 'attendance' ? <AttendanceEditor section={section} readOnly={editorLocked} onChange={(fields) => updateFields(record.internId, definition.id, section.id, fields)} /> : definition.kind === 'assessment' ? <AssessmentView section={section} /> : <GenericForm section={section} readOnly={editorLocked} fields={definition.fields ?? []} hideLocked={shouldHideLockedFields(definition)} onChange={(fields) => updateFields(record.internId, definition.id, section.id, fields)} />}
        {section.comment && <div className="change-note"><strong>Supervisor feedback</strong><p>{section.comment || 'Please review and update this section.'}</p></div>}
        {message && <div className={messageOk ? 'form-success' : 'form-error'}>{message}</div>}
        <div className="editor-actions"><span>{statusText}</span>{definition.owner === 'intern' && <div>{document.sections.length > 1 && <button className="button secondary" onClick={() => submit(true)} disabled={readOnly || submitting}>Submit all sections</button>}<button className="button primary" onClick={() => submit(false)} disabled={readOnly || submitting}><Send size={16} />{submitting ? 'Submitting…' : (definition.reviewRequired ? 'Submit for review' : 'Mark complete')}</button></div>}</div>
      </section>
      <div id="document-preview-panel" role="tabpanel" aria-labelledby="document-preview-tab" className={mobileView === 'edit' ? 'mobile-hidden' : ''}><DocumentPreview definition={definition} record={record} document={document} intern={currentUser} supervisor={supervisor} signatures={data.signatures} sectionIndex={activeIndex} /></div>
      </div>
      <aside className="history-card"><div className="card-head"><History size={18} /><h3>Section history</h3></div>{section.history.length ? [...section.history].reverse().map((entry) => <div className="history-item" key={entry.id}><i /><div><strong>{entry.action}</strong><p>{entry.actor}</p><small>{new Date(entry.date).toLocaleString('en-MY')}</small>{entry.comment && <blockquote>{entry.comment}</blockquote>}</div></div>) : <p className="empty-copy">Activity for this section will appear here.</p>}</aside>
      </div>
    </div>
  </>
}

function RequiredBadge() {
  return (
    <span className="field-badge is-required-badge" title="Required">
      <CircleAlert size={12} aria-hidden="true" />
      <span>Required</span>
    </span>
  )
}

function LockedBadge() {
  return (
    <span className="field-badge is-locked-badge" title="Auto-filled and cannot be changed">
      <Lock size={12} aria-hidden="true" />
      <span>Auto-filled · locked</span>
    </span>
  )
}

function GenericForm({ section, fields, readOnly, onChange, hideLocked = false }: { section: SectionRecord; fields: NonNullable<ReturnType<typeof definitionFor>>['fields']; readOnly: boolean; onChange: (fields: Record<string, string>) => void; hideLocked?: boolean }) {
  const visible = hideLocked ? (fields ?? []).filter((field) => !field.readOnly) : (fields ?? [])
  const hasLocked = !hideLocked && (fields ?? []).some((field) => field.readOnly)
  const allHidden = hideLocked && visible.length === 0 && (fields ?? []).some((field) => field.readOnly)
  return (
    <div>
      {allHidden && (
        <p className="locked-banner" role="note">
          <Lock size={15} aria-hidden="true" />
          <span><strong>Auto-filled · cannot be changed.</strong> All details are filled automatically and hidden here — they appear in the preview and official PDF.</span>
        </p>
      )}
      {hasLocked && (
        <p className="locked-banner" role="note">
          <Lock size={15} aria-hidden="true" />
          <span><strong>Auto-filled · cannot be changed.</strong> Locked details come from your profile and placement record — complete the fields marked Required below.</span>
        </p>
      )}
      <div className="form-grid">
        {visible?.map((field) => (
          <label className={`${field.type === 'textarea' ? 'span-2' : ''}${field.readOnly ? ' is-locked' : ' is-required'}`} key={field.key}>
            <span className="field-label-row"><span>{field.label}</span>{field.readOnly ? <LockedBadge /> : <RequiredBadge />}</span>
            {field.type === 'textarea'
              ? <textarea value={section.fields[field.key] ?? ''} disabled={readOnly || field.readOnly} aria-disabled={field.readOnly ? true : undefined} aria-required={field.readOnly ? undefined : true} title={field.readOnly ? 'Auto-filled and cannot be changed' : undefined} placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`} onChange={(event) => onChange({ [field.key]: event.target.value })} />
              : <input type={field.type ?? 'text'} value={section.fields[field.key] ?? ''} disabled={readOnly || field.readOnly} aria-disabled={field.readOnly ? true : undefined} aria-required={field.readOnly ? undefined : true} title={field.readOnly ? 'Auto-filled and cannot be changed' : undefined} placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`} onChange={(event) => onChange({ [field.key]: event.target.value })} />}
          </label>
        ))}
      </div>
    </div>
  )
}

function LogbookEditor({ section, readOnly, onChange }: { section: SectionRecord; readOnly: boolean; onChange: (fields: Record<string, string>) => void }) {
  return <div>
      <div className="form-grid"><label className="span-2 is-required"><span className="field-label-row"><span>Activity types and objectives</span><RequiredBadge /></span><textarea disabled={readOnly} aria-required={true} value={section.fields.activities ?? ''} placeholder="Describe your planned work and completed activities…" onChange={(event) => onChange({ activities: event.target.value })} /></label><label className="span-2 is-required"><span className="field-label-row"><span>Learning and career reflection</span><RequiredBadge /></span><textarea disabled={readOnly} aria-required={true} value={section.fields.reflection ?? ''} placeholder="What technical or non-technical knowledge did you gain?" onChange={(event) => onChange({ reflection: event.target.value })} /></label></div>
    </div>
}

function AttendanceEditor({ section, readOnly, onChange }: { section: SectionRecord; readOnly: boolean; onChange: (fields: Record<string, string>) => void }) {
  return <div><p className="attendance-hint" role="note"><CircleAlert size={15} aria-hidden="true" /><span><strong>At least one entry required.</strong> Fill in any day, time, or the notes field to complete this week — individual day rows are a group, not each required on their own. Dates are pre-filled for each week but remain editable.</span></p><div className="attendance-table"><div className="attendance-head"><span>Day</span><span>Workplace / date / time in / time out / hours</span></div>{attendanceFields.map((day) => <div className="attendance-row" key={day}><strong>{day[0].toUpperCase() + day.slice(1)}</strong><div className="attendance-inputs"><input aria-label={`${day} workplace`} disabled={readOnly} value={section.fields[`${day}Workplace`] ?? ''} placeholder="Office / WFH" onChange={(event) => onChange({ [`${day}Workplace`]: event.target.value })} /><input type="date" aria-label={`${day} date`} disabled={readOnly} value={section.fields[`${day}Date`] ?? ''} onChange={(event) => onChange({ [`${day}Date`]: event.target.value })} /><input type="time" aria-label={`${day} time in`} disabled={readOnly} value={section.fields[`${day}TimeIn`] ?? ''} onChange={(event) => onChange({ [`${day}TimeIn`]: event.target.value })} /><input type="time" aria-label={`${day} time out`} disabled={readOnly} value={section.fields[`${day}TimeOut`] ?? ''} onChange={(event) => onChange({ [`${day}TimeOut`]: event.target.value })} /><input aria-label={`${day} hours`} disabled={readOnly} value={section.fields[`${day}Hours`] ?? ''} placeholder="hours" onChange={(event) => onChange({ [`${day}Hours`]: event.target.value })} /></div><input className="attendance-legacy" aria-label={`${day} legacy combined entry, optional`} title="Legacy combined entry (optional)" disabled={readOnly} value={section.fields[day] ?? ''} placeholder="Legacy combined entry (optional)" onChange={(event) => onChange({ [day]: event.target.value })} /></div>)}<label><strong>Notes <span className="field-badge is-optional-badge">Optional</span></strong><input disabled={readOnly} value={section.fields.notes ?? ''} placeholder="Leave, WFH, or supporting details" onChange={(event) => onChange({ notes: event.target.value })} /></label></div></div>
}

function AssessmentView({ section }: { section: SectionRecord }) {
  return <div className="assessment-view"><p>This assessment is completed by your company supervisor. You can view all ratings and comments after they are saved.</p>{ASSESSMENT_CRITERIA.map((criterion, index) => <div key={criterion}><span>{criterion}</span><strong>{section.fields[`criterion-${index}`] || 'Not rated'}</strong>{section.fields[`criterion-comment-${index}`] && <small>{section.fields[`criterion-comment-${index}`]}</small>}</div>)}<div><span>Overall score</span><strong>{section.fields.score || 'Not rated'}</strong></div>{section.fields.comments && <blockquote>{section.fields.comments}</blockquote>}</div>
}

function UploadEditor({ files, onChoose, onRemove, onMove, inputRef, readOnly }: { files: ReturnType<typeof useApp>['data']['records'][number]['documents'][string]['files']; onChoose: (files: FileList | null) => void; onRemove: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; inputRef: React.RefObject<HTMLInputElement | null>; readOnly: boolean }) {
  const missing = files.length === 0
  return <div>{missing ? <p id="upload-required-note" className="upload-required-hint" role="note"><CircleAlert size={15} aria-hidden="true" /><span><strong>Required · </strong>Upload at least one file to complete this section.</span></p> : <p id="upload-required-note" className="upload-complete-hint"><Check size={15} aria-hidden="true" /><span>Upload complete — you can add, reorder, or remove files.</span></p>}<button className="upload-zone" disabled={readOnly} aria-describedby="upload-required-note" onClick={() => inputRef.current?.click()}><UploadCloud /><strong>Choose files to upload</strong>{missing && <span className="field-badge is-required-badge"><CircleAlert size={12} aria-hidden="true" /><span>Required</span></span>}<span>PDF, Word, PNG, or JPG · multiple files supported</span></button><input ref={inputRef} hidden type="file" multiple accept=".pdf,.doc,.docx,image/png,image/jpeg" onChange={(event) => onChoose(event.target.files)} />{files.length > 0 && <div className="file-list">{files.map((file, index) => <div key={file.id}><span className="file-icon">{file.type.includes('pdf') ? <FileText /> : <File />}</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Position {index + 1}</small></div><button disabled={index === 0 || readOnly} onClick={() => onMove(file.id, -1)} aria-label="Move up"><ArrowUp /></button><button disabled={index === files.length - 1 || readOnly} onClick={() => onMove(file.id, 1)} aria-label="Move down"><ArrowDown /></button><button disabled={readOnly} onClick={() => onRemove(file.id)} aria-label="Remove"><Trash2 /></button></div>)}</div>}</div>
}
