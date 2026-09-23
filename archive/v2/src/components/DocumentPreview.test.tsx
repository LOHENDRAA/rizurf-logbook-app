import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentPreview } from './DocumentPreview'
import type { DocumentDefinition, DocumentRecord, InternRecord, User } from '../types'

vi.mock('../lib/officialTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/officialTemplates')>()
  return { ...actual, renderOfficialDocument: vi.fn(async () => new Blob(['pdf-bytes'], { type: 'application/pdf' })) }
})

function makeUser(): User {
  return { id: 'intern-1', name: 'Aisha Rahman', email: 'aisha@example.com', password: 'x', role: 'intern', avatar: 'AR' }
}

function makeRecord(): InternRecord {
  return {
    internId: 'intern-1', company: 'Rizurf', title: 'Intern', studentId: 'TP1', intake: 'APU',
    department: 'IT', identityNumber: '1', contactNumber: '1', supervisorId: 'sup-1',
    startDate: '2026-09-14', endDate: '2026-12-01', dueDates: { part1: '2026-10-01', part2: '2026-12-01' },
    documents: {}, pdfs: [],
  }
}

function makeOfficialDefinition(overrides: Partial<DocumentDefinition> = {}): DocumentDefinition {
  return {
    id: 'p2-assessment', part: 'part2', order: 1, title: 'Performance Assessment',
    shortTitle: 'Assessment', description: 'd', guideline: 'g', kind: 'assessment',
    reviewRequired: true, owner: 'intern', sections: ['Only'],
    ...overrides,
  }
}

function makeUploadDefinition(): DocumentDefinition {
  return {
    id: 'p1-cv', part: 'part1', order: 2, title: 'CV', shortTitle: 'CV',
    description: 'd', guideline: 'g', kind: 'upload',
    reviewRequired: false, owner: 'intern', sections: ['Upload'],
  }
}

function makeDocument(files: DocumentRecord['files'] = []): DocumentRecord {
  return { id: 'doc-1', sections: [], files }
}

function txtFile(id: string, name: string) {
  return { id, name, type: 'text/plain', size: 3, blob: new Blob(['hello'], { type: 'text/plain' }), uploadedAt: 'now' }
}

describe('DocumentPreview expanded preview', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:mock-${Math.random()}`),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    document.body.style.overflow = ''
  })

  it('renders an expand button and no decorative TV icon in the header', () => {
    const { container } = render(
      <DocumentPreview definition={makeOfficialDefinition()} record={makeRecord()} document={makeDocument()} intern={makeUser()} signatures={{}} sectionIndex={0} />,
    )
    const trigger = screen.getByRole('button', { name: 'Expand live preview' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('title', 'Expand live preview')
    expect(trigger.classList.contains('preview-expand-btn')).toBe(true)
    // The old decorative MonitorPlay svg (direct child of .preview-head) is gone.
    expect(container.querySelector('.preview-head > svg')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a dialog with the same official content and locks body scroll', async () => {
    render(
      <DocumentPreview definition={makeOfficialDefinition()} record={makeRecord()} document={makeDocument()} intern={makeUser()} signatures={{}} sectionIndex={0} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand live preview' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Performance Assessment expanded preview')
    expect(document.body.style.overflow).toBe('hidden')
    // Same rendered document in both inline and expanded views (pager syncs).
    await waitFor(() => expect(screen.getAllByTitle(/Performance Assessment, Assessment page/).length).toBe(2))
    expect(screen.getAllByText('Page 1 of 2').length).toBe(2)
  })

  it('keeps pager navigation in sync inside the expanded dialog', async () => {
    render(
      <DocumentPreview definition={makeOfficialDefinition()} record={makeRecord()} document={makeDocument()} intern={makeUser()} signatures={{}} sectionIndex={0} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand live preview' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(screen.getAllByText('Page 1 of 2').length).toBe(2))
    const nextButtons = screen.getAllByRole('button', { name: 'Next preview page' })
    expect(nextButtons).toHaveLength(2)
    fireEvent.click(nextButtons[1])
    await waitFor(() => expect(screen.getAllByText('Page 2 of 2').length).toBe(2))
    expect(dialog.textContent).toContain('Page 2 of 2')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(
      <DocumentPreview definition={makeOfficialDefinition()} record={makeRecord()} document={makeDocument()} intern={makeUser()} signatures={{}} sectionIndex={0} />,
    )
    const trigger = screen.getByRole('button', { name: 'Expand live preview' })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Close expanded preview' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
    expect(dialog).not.toBeInTheDocument()
  })

  it('closes on backdrop click and on the X button', async () => {
    render(
      <DocumentPreview definition={makeOfficialDefinition()} record={makeRecord()} document={makeDocument()} intern={makeUser()} signatures={{}} sectionIndex={0} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand live preview' }))
    await screen.findByRole('dialog')
    const backdrop = document.body.querySelector('.preview-dialog-backdrop')!
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Expand live preview' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Close expanded preview' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
  })

  it('shows upload file selection and error content inside the dialog', async () => {
    render(
      <DocumentPreview
        definition={makeUploadDefinition()} record={makeRecord()}
        document={makeDocument([txtFile('f1', 'one.txt'), txtFile('f2', 'two.txt')])}
        intern={makeUser()} signatures={{}} sectionIndex={0}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand live preview' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Uploaded document expanded preview')
    expect(dialog.querySelectorAll('select[aria-label="Select uploaded file to preview"]').length).toBe(1)
    await waitFor(() => expect(dialog.textContent).toMatch(/Cannot preview this file/))
    // File selection stays in sync: changing the dialog select updates inline too.
    const select = dialog.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'f2' } })
    await waitFor(() => {
      const inlineSelect = document.querySelector('.document-preview select') as HTMLSelectElement
      expect(inlineSelect.value).toBe('f2')
    })
  })

  it('shows the empty upload message inside the dialog', async () => {
    render(
      <DocumentPreview definition={makeUploadDefinition()} record={makeRecord()} document={makeDocument([])} intern={makeUser()} signatures={{}} sectionIndex={0} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand live preview' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/No document to preview/)
  })
})
