import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from '../state/AppContext'
import { DocumentPage } from './DocumentPage'

vi.mock('../lib/storage', () => ({
  loadData: vi.fn(() => Promise.resolve(undefined)),
  saveData: vi.fn(() => Promise.resolve()),
  clearData: vi.fn(() => Promise.resolve()),
}))

type Captured = ReturnType<typeof useApp> | undefined

let captured: Captured

function Capture() {
  const context = useApp()
  useEffect(() => {
    captured = context
  }, [context])
  return null
}

function renderDocPage(path: string, userId: string) {
  captured = undefined
  sessionStorage.setItem('internflow-user', userId)
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="parts/:partId/documents/:documentId" element={<DocumentPage />} />
        </Routes>
      </MemoryRouter>
      <Capture />
    </AppProvider>,
  )
}

describe('DocumentPage cover mark-complete', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('marks p1-cover complete without any signature: completed status, no notification, hidden values kept', async () => {
    const { container } = renderDocPage('/parts/part1/documents/p1-cover', 'intern-1')
    const mentorInput = await screen.findByLabelText(/Academic mentor/) as HTMLInputElement
    expect(captured).toBeDefined()
    const sectionId = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0].id
    const notificationsBefore = captured!.data.notifications.length
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', sectionId, { mentorName: 'Dr. Mentor' })
    })
    expect(mentorInput).not.toBeDisabled()
    const historyBefore = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0].history.length

    // No signature saved anywhere, yet Mark complete must succeed.
    expect(captured!.data.signatures['intern-1']?.signature).toBeFalsy()
    fireEvent.click(screen.getByRole('button', { name: /mark complete/i }))
    await waitFor(() => expect(screen.getByText('Marked complete.')).toBeInTheDocument())
    const section = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0]
    expect(section.status).toBe('completed')
    expect(section.approvedAt).toBeUndefined()
    expect(section.history).toHaveLength(historyBefore + 1)
    expect(section.history[section.history.length - 1].action).toBe('Completed')
    expect(captured!.data.notifications).toHaveLength(notificationsBefore)
    // Auto-filled values stay stored even though no inputs render them.
    expect(section.fields.studentName).toBeTruthy()
    expect(section.fields.companyAddress).toBeTruthy()
    // Completed badge is visible; a second click adds no duplicate history.
    expect(container.querySelector('.status-completed')?.textContent).toMatch(/Completed/)
    fireEvent.click(screen.getByRole('button', { name: /mark complete/i }))
    await act(async () => {})
    expect(captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0].history).toHaveLength(historyBefore + 1)
  })
})

describe('DocumentPage section-rail layout', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders p1-logbook rail as a top bar above content with working week switching', async () => {
    const { container } = renderDocPage('/parts/part1/documents/p1-logbook', 'intern-1')
    const rail = container.querySelector('.section-rail')
    expect(rail).not.toBeNull()
    // All 8 week buttons are present.
    for (let week = 1; week <= 8; week += 1) {
      const label = `Week ${String(week).padStart(2, '0')}`
      expect(rail!.textContent).toContain(label)
    }
    expect(rail!.querySelectorAll('button')).toHaveLength(8)
    // Logbook workspace carries the top-bar hook.
    const workspace = container.querySelector('.document-workspace')
    expect(workspace).not.toBeNull()
    expect(workspace!.classList.contains('weekly-workspace')).toBe(true)
    expect(workspace!.classList.contains('logbook-workspace')).toBe(true)
    // Rail is the first grid child, i.e. above the editor/preview content.
    const content = container.querySelector('.document-content')
    expect(content).not.toBeNull()
    expect(workspace!.firstElementChild).toBe(rail)
    expect(rail!.compareDocumentPosition(content!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Week switching still works and preserves active styling.
    expect(await screen.findByRole('heading', { name: 'Week 01' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Week 02/i }))
    expect(await screen.findByRole('heading', { name: 'Week 02' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Week 02/i }).classList.contains('active')).toBe(true)
  })

  it('renders the attendance rail as a top bar above content with working week switching', async () => {
    // intern-3 has Part 1 complete, so the Part 2 guard lets the page render.
    const { container } = renderDocPage('/parts/part2/documents/p2-attendance', 'intern-3')
    const rail = container.querySelector('.section-rail')
    expect(rail).not.toBeNull()
    expect(rail!.querySelectorAll('button')).toHaveLength(16)
    // Attendance workspace carries the same top-bar hook as logbooks.
    const workspace = container.querySelector('.document-workspace')
    expect(workspace).not.toBeNull()
    expect(workspace!.classList.contains('weekly-workspace')).toBe(true)
    expect(workspace!.classList.contains('logbook-workspace')).toBe(true)
    // Rail is the first grid child, i.e. above the editor/preview content.
    const content = container.querySelector('.document-content')
    expect(content).not.toBeNull()
    expect(workspace!.firstElementChild).toBe(rail)
    expect(rail!.compareDocumentPosition(content!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Week switching still works and preserves active styling.
    expect(await screen.findByRole('heading', { name: 'Week 01' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Week 02/i }))
    expect(await screen.findByRole('heading', { name: 'Week 02' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Week 02/i }).classList.contains('active')).toBe(true)
  })
})

describe('DocumentPage locked vs required affordances', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('p1-cover shows only the mentor input with no locked banner or auto-filled inputs', async () => {
    const { container } = renderDocPage('/parts/part1/documents/p1-cover', 'intern-1')
    const mentorInput = await screen.findByLabelText(/Academic mentor/) as HTMLInputElement

    // No auto-filled input boxes are visible on covers.
    expect(screen.queryByLabelText(/Student name/)).toBeNull()
    expect(screen.queryByLabelText(/Student ID/)).toBeNull()
    expect(screen.queryByLabelText(/Intake/)).toBeNull()
    expect(screen.queryByLabelText(/Company name/)).toBeNull()
    expect(screen.queryByLabelText(/Company address/)).toBeNull()
    expect(screen.queryByLabelText(/Internship start/)).toBeNull()
    expect(screen.queryByLabelText(/Internship end/)).toBeNull()
    // The locked banner is suppressed when no locked fields are visible.
    expect(container.querySelector('.locked-banner')).toBeNull()
    expect(container.querySelector('.is-locked-badge')).toBeNull()

    // The single manual field stays enabled with a required marker.
    expect(mentorInput.disabled).toBe(false)
    expect(mentorInput.getAttribute('aria-required')).toBe('true')
    const mentorLabel = mentorInput.closest('label')!
    expect(mentorLabel.classList.contains('is-required')).toBe(true)
    expect(mentorLabel.querySelector('.is-required-badge')?.textContent).toMatch(/Required/)

    // Hidden values remain stored in state for preview/PDF.
    const section = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0]
    expect(section.fields.studentName).toBeTruthy()
    expect(section.fields.studentId).toBeTruthy()
    expect(section.fields.companyAddress).toBeTruthy()
  })

  it('p2-cover shows only mentorName with no locked banner', async () => {
    const { container } = renderDocPage('/parts/part2/documents/p2-cover', 'intern-3')
    const mentorInput = await screen.findByLabelText(/Academic mentor/) as HTMLInputElement

    expect(screen.queryByLabelText(/Student name/)).toBeNull()
    expect(screen.queryByLabelText(/Student ID/)).toBeNull()
    expect(screen.queryByLabelText(/Intake/)).toBeNull()
    expect(screen.queryByLabelText(/Company name/)).toBeNull()
    expect(screen.queryByLabelText(/Company address/)).toBeNull()
    expect(screen.queryByLabelText(/Internship start/)).toBeNull()
    expect(screen.queryByLabelText(/Internship end/)).toBeNull()
    expect(container.querySelector('.locked-banner')).toBeNull()

    expect(mentorInput.disabled).toBe(false)
    expect(mentorInput.getAttribute('aria-required')).toBe('true')
    // The locked company address stays stored for preview/PDF.
    const section = captured!.data.records.find((record) => record.internId === 'intern-3')!.documents['p2-cover'].sections[0]
    expect(section.fields.companyAddress).toBeTruthy()
  })

  it('clearance hides all locked inputs with stored values kept', async () => {
    // Clearance: every field is auto-filled + locked, so no editable inputs
    // render — only the autofilled-hidden notice. Values stay stored.
    const { container: clearanceContainer } = renderDocPage('/parts/part2/documents/p2-clearance', 'intern-3')
    await screen.findByText(/Auto-filled · cannot be changed\./)
    expect(screen.queryByLabelText(/Department/)).toBeNull()
    expect(screen.queryByLabelText(/Student name/)).toBeNull()
    expect(screen.queryByLabelText(/Contact number/)).toBeNull()
    expect(clearanceContainer.querySelectorAll('.form-grid label')).toHaveLength(0)
    const clearance = captured!.data.records.find((record) => record.internId === 'intern-3')!.documents['p2-clearance'].sections[0]
    expect(clearance.fields.studentName).toBeTruthy()
    expect(clearance.fields.department).toBeTruthy()
    expect(clearance.fields.supervisorName).toBeTruthy()
  })

  it('p1 and p2 logbooks hide locked week dates while narratives stay required', async () => {
    // Logbook: only activities + reflection render as required; locked week
    // dates are auto-filled and hidden from the editor (never validity-required).
    // Stored values still feed preview/PDF.
    const { container, unmount } = renderDocPage('/parts/part1/documents/p1-logbook', 'intern-1')
    const activities = await screen.findByLabelText(/Activity types/) as HTMLTextAreaElement
    const reflection = await screen.findByLabelText(/Learning and career reflection/) as HTMLTextAreaElement
    expect(activities.getAttribute('aria-required')).toBe('true')
    expect(reflection.getAttribute('aria-required')).toBe('true')
    expect(activities.closest('label')?.querySelector('.is-required-badge')).not.toBeNull()
    expect(reflection.closest('label')?.querySelector('.is-required-badge')).not.toBeNull()
    expect(screen.queryByLabelText(/Week start/)).toBeNull()
    expect(screen.queryByLabelText(/Week end/)).toBeNull()
    expect(container.querySelector('input[type="date"]')).toBeNull()
    expect(container.querySelector('.locked-banner')).toBeNull()
    expect(container.querySelector('.is-locked-badge')).toBeNull()
    const logbook = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-logbook'].sections[0]
    expect(logbook.fields.startDate).toBeTruthy()
    expect(logbook.fields.endDate).toBeTruthy()
    unmount()
    cleanup()

    // p2-logbook shares the same LogbookEditor branch — assert identical
    // hidden behavior on an editable week.
    const { container: p2Container } = renderDocPage('/parts/part2/documents/p2-logbook', 'intern-3')
    await screen.findByRole('heading', { name: 'Week 09' })
    fireEvent.click(screen.getByRole('button', { name: /Week 16/i }))
    await screen.findByRole('heading', { name: 'Week 16' })
    const p2Activities = await screen.findByLabelText(/Activity types/) as HTMLTextAreaElement
    const p2Reflection = await screen.findByLabelText(/Learning and career reflection/) as HTMLTextAreaElement
    expect(p2Activities.getAttribute('aria-required')).toBe('true')
    expect(p2Reflection.getAttribute('aria-required')).toBe('true')
    expect(screen.queryByLabelText(/Week start/)).toBeNull()
    expect(screen.queryByLabelText(/Week end/)).toBeNull()
    expect(p2Container.querySelector('input[type="date"]')).toBeNull()
    expect(p2Container.querySelector('.locked-banner')).toBeNull()
    expect(p2Container.querySelector('.is-locked-badge')).toBeNull()
    const p2Sections = captured!.data.records.find((record) => record.internId === 'intern-3')!.documents['p2-logbook'].sections
    const week16 = p2Sections.find((section) => section.label === 'Week 16')!
    expect(week16.fields.startDate).toBeTruthy()
    expect(week16.fields.endDate).toBeTruthy()
  })

  it('attendance group hint without per-input required; dates prefilled yet editable; legacy/notes stay optional', async () => {
    const { container } = renderDocPage('/parts/part2/documents/p2-attendance', 'intern-3')
    await screen.findByRole('heading', { name: 'Week 01' })
    // Section-level group hint carries the "!" cue.
    const hint = container.querySelector('.attendance-hint')
    expect(hint?.textContent).toMatch(/at least one entry required/i)
    expect(hint?.textContent).toMatch(/pre-filled.*editable/i)
    // Day time inputs are not individually marked required.
    const mondayIn = screen.getByLabelText('monday time in') as HTMLInputElement
    expect(mondayIn.getAttribute('aria-required')).toBeNull()
    expect(container.querySelectorAll('.attendance-row .is-required-badge')).toHaveLength(0)
    // Locked identity headers never render as editor inputs on attendance.
    expect(screen.queryByLabelText(/Supervisor name/)).toBeNull()
    expect(screen.queryByLabelText(/Student name/)).toBeNull()
    expect(screen.queryByLabelText(/Company name/)).toBeNull()
    expect(screen.queryByLabelText(/Student ID/)).toBeNull()
    // Weekday dates are prefilled as editable defaults (enabled, with values).
    // Week 01 is seeded submitted_for_review (inputs locked), so check an
    // unseeded editable week instead.
    fireEvent.click(screen.getByRole('button', { name: /Week 16/i }))
    await screen.findByRole('heading', { name: 'Week 16' })
    const mondayDate = screen.getByLabelText('monday date') as HTMLInputElement
    expect(mondayDate.disabled).toBe(false)
    expect(mondayDate.value).toBeTruthy()
    const fridayDate = screen.getByLabelText('friday date') as HTMLInputElement
    expect(fridayDate.disabled).toBe(false)
    expect(fridayDate.value).toBeTruthy()
    // Legacy combined entry is explicitly optional and never required.
    const legacy = screen.getByLabelText(/monday legacy combined entry, optional/i) as HTMLInputElement
    expect(legacy.placeholder).toMatch(/optional/i)
    // Notes is optional, not required.
    expect(container.querySelector('.attendance-table .is-optional-badge')?.textContent).toMatch(/Optional/)
  })

  it('upload shows a required hint until a file exists; assessment stays marker-free', async () => {
    const { container, unmount } = renderDocPage('/parts/part1/documents/p1-cover-letter', 'intern-1')
    await screen.findByRole('button', { name: /Choose files to upload/i })
    const requiredHint = container.querySelector('.upload-required-hint')
    expect(requiredHint?.textContent).toMatch(/Upload at least one file/)
    expect(screen.getByRole('button', { name: /Choose files to upload/i }).textContent).toMatch(/Required/)
    unmount()
    cleanup()

    renderDocPage('/parts/part2/documents/p2-assessment', 'intern-3')
    await screen.findByText(/completed by your company supervisor/i)
    expect(screen.queryByText('Required')).toBeNull()
  })
})
