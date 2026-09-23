import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, Maximize2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderAsync } from 'docx-preview'
import { PDFDocument } from 'pdf-lib'
import { previewPageSelection, renderOfficialDocument } from '../lib/officialTemplates'
import type { DocumentDefinition, DocumentRecord, InternRecord, SignatureProfile, User } from '../types'

type PreviewProps = {
  definition: DocumentDefinition
  record: InternRecord
  document: DocumentRecord
  intern: User
  supervisor?: User
  signatures: Record<string, SignatureProfile>
  sectionIndex: number
}

type State = { status: 'loading' | 'ready' | 'empty' | 'error'; url?: string; message?: string }

function isPdf(file: DocumentRecord['files'][number]) { return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') }
function isImage(file: DocumentRecord['files'][number]) { return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name) }
function isDocx(file: DocumentRecord['files'][number]) { return file.type.includes('wordprocessingml') || file.name.toLowerCase().endsWith('.docx') }

export function DocumentPreview(props: PreviewProps) {
  const { definition } = props
  const [fileId, setFileId] = useState(props.document.files[0]?.id)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const selections = useMemo(() => definition.kind === 'upload' ? [] : previewPageSelection(definition, props.sectionIndex), [definition, props.sectionIndex])

  useEffect(() => {
    if (!props.document.files.some((file) => file.id === fileId)) setFileId(props.document.files[0]?.id)
  }, [props.document.files, fileId])
  useEffect(() => setPage(0), [props.sectionIndex, definition.id, fileId])

  useEffect(() => {
    if (!expanded) return
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [expanded])

  const selectedFile = props.document.files.find((file) => file.id === fileId) ?? props.document.files[0]
  const isOfficial = definition.kind !== 'upload'
  const title = isOfficial ? definition.title : 'Uploaded document'
  const dialogLabel = `${title} expanded preview`
  const status = isOfficial ? `Official template · ${selections[page]?.label ?? 'current page'}` : selectedFile ? `${props.document.files.length} file${props.document.files.length === 1 ? '' : 's'} · selected in current order` : 'No upload selected'
  const previewBody = isOfficial
    ? <OfficialPreview {...props} selections={selections} page={page} onPage={setPage} />
    : <UploadPreview files={props.document.files} selectedFile={selectedFile} onSelect={setFileId} />
  return <aside className="document-preview" aria-label={`${definition.title} preview`}>
    <div className="preview-head">
      <div><span className="eyebrow teal">LIVE PREVIEW</span><h2>{title}</h2></div>
      <button type="button" ref={triggerRef} className="button-icon preview-expand-btn" aria-label="Expand live preview" aria-haspopup="dialog" title="Expand live preview" onClick={() => setExpanded(true)}><Maximize2 size={18} aria-hidden="true" /></button>
    </div>
    <p className="preview-status">{status}</p>
    {previewBody}
    {expanded && createPortal(
      <div className="preview-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setExpanded(false) }}>
        <div className="preview-dialog" role="dialog" aria-modal="true" aria-label={dialogLabel}>
          <div className="preview-dialog-head">
            <div><span className="eyebrow teal">LIVE PREVIEW</span><h2>{title}</h2></div>
            <button type="button" ref={closeRef} className="button-icon preview-dialog-close" aria-label="Close expanded preview" title="Close expanded preview" onClick={() => setExpanded(false)}><X size={18} aria-hidden="true" /></button>
          </div>
          <p className="preview-status">{status}</p>
          {previewBody}
        </div>
      </div>,
      document.body,
    )}
  </aside>
}

function OfficialPreview({ selections, page, onPage, ...props }: PreviewProps & { selections: ReturnType<typeof previewPageSelection>; page: number; onPage: (page: number) => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    let url: string | undefined
    setState({ status: 'loading' })
    const timeout = setTimeout(() => {
      renderOfficialDocument(props.definition, { record: props.record, intern: props.intern, supervisor: props.supervisor, signatures: props.signatures }, [selections[page]])
        .then((blob) => {
          if (cancelled) return
          url = URL.createObjectURL(blob)
          setState({ status: 'ready', url })
        })
        .catch((error: unknown) => { if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'The official page could not be rendered.' }) })
    }, 80)
    return () => { cancelled = true; clearTimeout(timeout); if (url) URL.revokeObjectURL(url) }
  }, [props.definition, props.record, props.intern, props.supervisor, props.signatures, selections, page])

  return <div className="preview-body">
    <PreviewState state={state} />
    {state.status === 'ready' && state.url && <iframe className="pdf-frame" src={`${state.url}#toolbar=0&view=FitH`} title={`${props.definition.title}, ${selections[page]?.label}`} />}
    {selections.length > 1 && <div className="preview-pager"><button className="button-icon" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous preview page"><ChevronLeft size={16} /></button><span>Page {page + 1} of {selections.length}</span><button className="button-icon" disabled={page === selections.length - 1} onClick={() => onPage(page + 1)} aria-label="Next preview page"><ChevronRight size={16} /></button></div>}
  </div>
}

function PreviewState({ state }: { state: State }) {
  if (state.status === 'loading') return <div className="preview-message" role="status"><LoaderCircle className="spin" size={22} /><strong>Preparing preview…</strong><span>Updating the official page with your latest answers.</span></div>
  if (state.status === 'error') return <div className="preview-message preview-error" role="alert"><AlertTriangle size={22} /><strong>Preview unavailable</strong><span>{state.message}</span></div>
  return null
}

function UploadPreview({ files, selectedFile, onSelect }: { files: DocumentRecord['files']; selectedFile?: DocumentRecord['files'][number]; onSelect: (id: string) => void }) {
  if (!files.length) return <div className="preview-message"><FileText size={22} /><strong>No document to preview</strong><span>Upload a PDF, image, or Word document to see it here.</span></div>
  return <div className="upload-preview">
    <label className="preview-file-select">Preview file<select value={selectedFile?.id ?? ''} onChange={(event) => onSelect(event.target.value)} aria-label="Select uploaded file to preview">{files.map((file, index) => <option key={file.id} value={file.id}>{index + 1}. {file.name}</option>)}</select></label>
    <UploadedFileView key={selectedFile!.id} file={selectedFile!} />
  </div>
}

function UploadedFileView({ file }: { file: DocumentRecord['files'][number] }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const docxRef = useRef<HTMLDivElement>(null)
  const urlRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(file.blob)
    urlRef.current = url
    setState({ status: 'loading', url })
    const finishError = (message: string) => { if (!cancelled) setState({ status: 'error', message, url }) }
    if (isPdf(file)) {
      file.blob.arrayBuffer().then((bytes) => PDFDocument.load(bytes)).then(() => { if (!cancelled) setState({ status: 'ready', url }) }).catch(() => finishError('This PDF is malformed or cannot be opened in this browser.'))
    } else if (isImage(file)) {
      const image = new Image()
      image.onload = () => { if (!cancelled) setState({ status: 'ready', url }) }
      image.onerror = () => finishError('This image is corrupt or uses an unsupported encoding.')
      image.src = url
    } else if (isDocx(file)) {
      if (!docxRef.current) return () => { cancelled = true; URL.revokeObjectURL(url) }
      renderAsync(file.blob, docxRef.current, undefined, { inWrapper: true, breakPages: true, useBase64URL: true, renderAltChunks: false, renderComments: false, renderChanges: false })
        .then(() => {
          docxRef.current?.querySelectorAll('script,iframe,object,embed,link').forEach((element) => element.remove())
          docxRef.current?.querySelectorAll('a').forEach((anchor) => anchor.removeAttribute('href'))
          if (!cancelled) setState({ status: 'ready', url })
        }).catch(() => finishError('This Word document is malformed or could not be read.'))
    } else finishError('This file type is not supported for inline preview.')
    return () => { cancelled = true; URL.revokeObjectURL(url); if (urlRef.current === url) urlRef.current = undefined }
  }, [file])

  const openLink = <a className="preview-open" href={state.url ?? urlRef.current} download={file.name}><Download size={14} />Open / download original</a>
  if (isDocx(file)) return <div className="docx-preview"><div className="docx-copy"><FileText size={22} /><strong>Approximate Word preview</strong><span>Browser rendering may differ from Microsoft Word; the original remains available.</span>{state.status === 'error' && <span className="preview-inline-error">{state.message}</span>}{openLink}</div><div ref={docxRef} className="docx-render" aria-label={`${file.name} approximate preview`} />{state.status === 'loading' && <span className="preview-loading-label">Loading Word preview…</span>}</div>
  if (state.status === 'loading') return <div className="preview-message" role="status"><LoaderCircle className="spin" size={22} /><strong>Loading {file.name}</strong><span>Reading this local file.</span></div>
  if (state.status === 'error') return <div className="preview-message preview-error" role="alert"><AlertTriangle size={22} /><strong>Cannot preview this file</strong><span>{state.message}</span>{openLink}</div>
  if (isImage(file)) return <div className="image-preview"><img src={state.url} alt={`Preview of ${file.name}`} />{openLink}</div>
  return <div className="pdf-preview"><iframe className="pdf-frame" src={`${state.url}#toolbar=0&view=FitH`} title={`Preview of ${file.name}`} />{openLink}</div>
}
