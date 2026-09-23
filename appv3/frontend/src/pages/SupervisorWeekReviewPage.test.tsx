import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { PortalData } from '../types'
import { customData, renderWeek } from './supervisorInternTestHelpers'

type WeekEntry = PortalData['journals'][number]['entries'][number]

/** A submitted week with live optional daily logs (filled + blank + whitespace). */
function submittedWithDailies(): WeekEntry {
  return {
    id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
    body: '', status: 'submitted',
    dailyEntries: [
      { date: '2026-01-05', body: 'Monday deep work on the onboarding ticket.' },
      { date: '2026-01-06', body: '' },
      { date: '2026-01-07', body: '   ' },
      { date: '2026-01-08', body: 'Thursday pairing session with my mentor.' },
    ],
    weeklyDraft: 'A detailed weekly report with enough words for review purposes here.',
    weeklyDraftUpdatedAt: '2026-09-02T10:00:00.000Z',
    submittedBody: 'A detailed weekly report with enough words for review purposes here.',
    submittedAt: '2026-09-01T10:00:00.000Z',
    review: { status: 'pending' },
  }
}

describe('SupervisorWeekReviewPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows submitted content with metadata and approves a pending week', async () => {
    renderWeek('student-3', 1)
    // Seeded weeks carry blank optional daily logs, so the seeded phrases
    // match the weekly snapshot only.
    const bodies = await screen.findAllByText(/onboarding checklist|understanding the product|ownership of my day-to-day/i)
    expect(bodies.length).toBeGreaterThan(0)
    expect(screen.getByText(/awaiting company review/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(await screen.findByText(/review saved/i)).toBeInTheDocument()
  })

  it('blocks request-changes without feedback and accepts it with feedback', async () => {
    // student-4 week 4 is a submitted week awaiting company review.
    renderWeek('student-4', 4)
    await screen.findByText(/submitted weekly report/i)
    const requestChangesButton = screen.getByRole('button', { name: /^request changes$/i })
    // Empty feedback keeps the button disabled.
    expect(requestChangesButton).toBeDisabled()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeEnabled()
    fireEvent.change(screen.getByLabelText(/review feedback/i), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: /^request changes$/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/review feedback/i), { target: { value: 'Please add concrete client examples.' } })
    expect(screen.getByRole('button', { name: /^request changes$/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /^request changes$/i }))
    expect(await screen.findByText(/review saved/i)).toBeInTheDocument()
  })

  it('shows prefilled feedback with no reviewer byline', async () => {
    renderWeek('student-4', 2)
    const textarea = await screen.findByLabelText(/review feedback/i) as HTMLTextAreaElement
    expect(textarea).toHaveDisplayValue(/concrete examples from your HR shadowing/i)
    expect(screen.queryByText('By Sarah Lim')).toBeNull()
  })

  it('orders Approve before Request changes in the right-aligned review actions', async () => {
    renderWeek('student-4', 2)
    await screen.findByLabelText(/review feedback/i)
    const approveButton = screen.getByRole('button', { name: /^approve$/i })
    const requestChangesButton = screen.getByRole('button', { name: /^request changes$/i })
    expect(approveButton.compareDocumentPosition(requestChangesButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const actionRow = approveButton.closest('.editor-actions')
    expect(actionRow).not.toBeNull()
    expect(actionRow).toHaveClass('review-actions')
  })

  it('disables both decision buttons on approved weeks with finality copy', async () => {
    // student-4 week 1 is company-approved and awaiting the mentor.
    renderWeek('student-4', 1)
    const textarea = await screen.findByLabelText(/review feedback/i) as HTMLTextAreaElement
    expect(textarea).toHaveDisplayValue(/thorough handover notes, well done/i)
    // Company-approved weeks await the mentor: neither decision is available.
    const approveButton = screen.getByRole('button', { name: /^approve$/i })
    const requestChangesButton = screen.getByRole('button', { name: /^request changes$/i })
    expect(approveButton).toBeDisabled()
    expect(requestChangesButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save feedback/i })).toBeNull()
    expect(screen.getByText(/awaiting university mentor review/i)).toBeInTheDocument()
    expect(screen.getByText(/no further .*actions/i)).toBeInTheDocument()
    expect(screen.queryByText(/review saved/i)).toBeNull()
  })

  it('disables both decision buttons on changes-requested weeks with awaiting-resubmission copy', async () => {
    renderWeek('student-4', 2)
    const textarea = await screen.findByLabelText(/review feedback/i) as HTMLTextAreaElement
    expect(textarea).toHaveDisplayValue(/concrete examples from your HR shadowing/i)
    expect(screen.getByRole('button', { name: /^request changes$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
    expect(screen.getByText(/awaiting intern revision and resubmission/i)).toBeInTheDocument()
    // Clearing feedback keeps request-changes disabled; approve stays blocked.
    fireEvent.change(textarea, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: /^request changes$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
    expect(screen.getAllByText(/changes requested/i).length).toBeGreaterThan(0)
  })

  it('blocks approving a changes-requested week until the intern resubmits', async () => {
    const entry: PortalData['journals'][number]['entries'][number] = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted', dailyEntries: [], weeklyDraft: 'A detailed weekly report with enough words for review purposes here.',
      weeklyDraftUpdatedAt: '2026-09-02T10:00:00.000Z',
      submittedBody: 'A detailed weekly report with enough words for review purposes here.',
      submittedAt: '2026-09-01T10:00:00.000Z',
      review: { status: 'changes_requested', feedback: 'Please add more detail.', reviewedBy: 'Sarah Lim', reviewedAt: '2026-09-01T10:00:00.000Z' },
    }
    renderWeek('s9', 1, 'supervisor-1', customData([entry]))
    const textarea = await screen.findByLabelText(/review feedback/i) as HTMLTextAreaElement
    expect(screen.getByRole('button', { name: /^request changes$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
    expect(screen.getByText(/awaiting intern revision and resubmission/i)).toBeInTheDocument()
    fireEvent.change(textarea, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
    expect(screen.queryByText(/review saved/i)).toBeNull()
    expect(screen.getAllByText(/changes requested/i).length).toBeGreaterThan(0)
  })

  it('uses the simplified header and back link on submitted weeks', async () => {
    renderWeek('student-3', 1)
    await screen.findByText(/submitted weekly report/i)
    const backLink = screen.getByRole('link', { name: /back to interns/i })
    expect(backLink).toHaveAttribute('href', '/supervisor/interns/student-3')
    expect(screen.queryByRole('link', { name: /maya chen/i })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Weekly Review' })).toBeInTheDocument()
    expect(screen.getByText('MAYA CHEN')).toBeInTheDocument()
    // The header carries no week number or date range (week numbers only
    // appear inside the Week dropdown options).
    expect(screen.getByLabelText('Week')).toBeInTheDocument()
  })

  it('shows a single lifecycle status badge for submitted weeks', async () => {
    renderWeek('student-3', 1)
    await screen.findByText(/submitted weekly report/i)
    expect(screen.getByText(/awaiting company review/i)).toBeInTheDocument()
    expect(screen.queryByText(/^submitted$/i)).toBeNull()
    expect(document.querySelectorAll('.review-badges .status').length).toBe(1)
  })

  it('shows a single awaiting-mentor badge with no intermediate Approved badge', async () => {
    // student-4 week 1 is company-approved and awaiting the mentor.
    renderWeek('student-4', 1)
    await screen.findByText(/submitted weekly report/i)
    expect(screen.getByText(/awaiting mentor review/i)).toBeInTheDocument()
    expect(screen.queryByText(/^approved$/i)).toBeNull()
    expect(document.querySelectorAll('.review-badges .status').length).toBe(1)
  })

  it('shows a single revision badge for changes-requested weeks', async () => {
    renderWeek('student-4', 2)
    await screen.findByText(/submitted weekly report/i)
    expect(screen.getByText(/revision required/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.review-badges .status').length).toBe(1)
  })

  it('renders feedback last, after the submitted report and daily logs', async () => {
    renderWeek('s9', 1, 'supervisor-1', customData([submittedWithDailies()]))
    await screen.findByLabelText(/review feedback/i)
    const reportHeading = screen.getByText(/submitted weekly report/i)
    const dailyHeading = screen.getByText(/optional daily logs/i)
    const feedbackHeading = screen.getByText('FEEDBACK')
    expect(reportHeading.compareDocumentPosition(dailyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dailyHeading.compareDocumentPosition(feedbackHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(feedbackHeading.closest('section.card.review-body.simple-sheet-card')).not.toBeNull()
  })

  it('renders feedback after the latest saved revision when present', async () => {
    const submitted = 'Original submitted weekly report text for review purposes here.'
    const revised = 'Original submitted weekly report text for review purposes here, plus extra reflection after feedback.'
    const entry: PortalData['journals'][number]['entries'][number] = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted', dailyEntries: [], weeklyDraft: revised,
      weeklyDraftUpdatedAt: '2026-09-02T10:00:00.000Z',
      submittedBody: submitted,
      review: { status: 'changes_requested', feedback: 'Please add more detail.', reviewedBy: 'Sarah Lim', reviewedAt: '2026-09-01T10:00:00.000Z' },
    }
    renderWeek('s9', 1, 'supervisor-1', customData([entry]))
    await screen.findByLabelText(/review feedback/i)
    const revisionHeading = screen.getByText(/latest saved revision \(draft\)/i)
    const feedbackHeading = screen.getByText('FEEDBACK')
    expect(revisionHeading.compareDocumentPosition(feedbackHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the weekly report before daily logs with footers at the bottom', async () => {
    renderWeek('s9', 1, 'supervisor-1', customData([submittedWithDailies()]))
    const weeklyHeading = await screen.findByText(/submitted weekly report/i)
    const dailyHeading = screen.getByText(/optional daily logs/i)
    expect(weeklyHeading.compareDocumentPosition(dailyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Weekly footer carries words + submitted timestamp below the report.
    expect(screen.getByText(/words · submitted/i)).toBeInTheDocument()
    // Every daily card carries a words footer.
    const dayCards = await screen.findAllByRole('article')
    expect(dayCards.length).toBeGreaterThan(0)
    for (const card of dayCards) {
      expect(within(card).getByText(/\d+ words/i)).toBeInTheDocument()
    }
  })

  it('shows mentor-pending copy on company-approved weeks and awaiting-resubmission copy on changes-requested weeks', async () => {
    renderWeek('student-4', 1)
    await screen.findByLabelText(/review feedback/i)
    expect(screen.getByText(/awaiting university mentor review/i)).toBeInTheDocument()
    expect(screen.getByText(/no further .*actions/i)).toBeInTheDocument()
    cleanup()
    sessionStorage.clear()
    renderWeek('student-4', 2)
    await screen.findByLabelText(/review feedback/i)
    expect(screen.getByText(/awaiting intern revision and resubmission/i)).toBeInTheDocument()
  })

  it('shows submitted daily logs with weekday headings on the review detail', async () => {
    renderWeek('s9', 1, 'supervisor-1', customData([submittedWithDailies()]))
    expect(await screen.findByRole('heading', { level: 1, name: 'Weekly Review' })).toBeInTheDocument()
    expect(screen.getByLabelText('Week')).toBeInTheDocument()
    expect(screen.getByText(/optional daily logs/i)).toBeInTheDocument()
    // Only filled daily entries render as labelled cards with live text
    // under a "WEEKDAY DD/MM/YYYY" heading.
    const dayCards = await screen.findAllByRole('article')
    expect(dayCards).toHaveLength(2)
    expect(dayCards[0]).toHaveAccessibleName(/daily log (monday|tuesday|wednesday|thursday|friday|saturday|sunday) \d{2}\/\d{2}\/\d{4}/i)
    expect(screen.getByText('Monday deep work on the onboarding ticket.')).toBeInTheDocument()
    expect(screen.getByText('Thursday pairing session with my mentor.')).toBeInTheDocument()
    expect(screen.getByText(/submitted weekly report/i)).toBeInTheDocument()
  })

  it('shows only non-whitespace daily entries as live text', async () => {
    renderWeek('s9', 1, 'supervisor-1', customData([submittedWithDailies()]))
    await screen.findByText(/optional daily logs/i)
    // Blank and whitespace-only days are filtered out entirely.
    expect(screen.queryByRole('article', { name: /2026-01-06|06\/01\/2026/i })).toBeNull()
    expect(screen.queryByRole('article', { name: /2026-01-07|07\/01\/2026/i })).toBeNull()
    expect(await screen.findAllByRole('article')).toHaveLength(2)
  })

  it('hides the daily section entirely when every log is blank or whitespace', async () => {
    const entry: WeekEntry = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted',
      dailyEntries: [
        { date: '2026-01-05', body: '' },
        { date: '2026-01-06', body: '   ' },
      ],
      weeklyDraft: 'A detailed weekly report with enough words for review purposes here.',
      submittedBody: 'A detailed weekly report with enough words for review purposes here.',
      submittedAt: '2026-09-01T10:00:00.000Z',
      review: { status: 'pending' },
    }
    renderWeek('s9', 1, 'supervisor-1', customData([entry]))
    await screen.findByText(/submitted weekly report/i)
    expect(screen.queryByText(/optional daily logs/i)).toBeNull()
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('hides the daily section for seeded weeks with blank optional logs', async () => {
    // Demo seeds carry blank optional daily logs: approval concerns the
    // weekly report only.
    renderWeek('student-3', 1)
    await screen.findByText(/submitted weekly report/i)
    expect(screen.queryByText(/optional daily logs/i)).toBeNull()
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('shows a saved draft summary-only with no daily logs or review actions', async () => {
    renderWeek('student-1', 3)
    expect(await screen.findByText(/weekly summary \(draft\)/i)).toBeInTheDocument()
    expect(screen.getByText(/reporting dashboard/i)).toBeInTheDocument()
    expect(screen.getAllByText(/draft/i).length).toBeGreaterThan(0)
    // Summary-only: no daily logs, no submitted snapshot, no review actions.
    expect(screen.queryByText(/optional daily logs/i)).toBeNull()
    expect(screen.queryByText(/submitted weekly report/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^request changes$/i })).toBeNull()
    expect(screen.queryByLabelText(/review feedback/i)).toBeNull()
    // Simplified header + back link apply to the draft branch too.
    expect(screen.getByRole('link', { name: /back to interns/i })).toHaveAttribute('href', '/supervisor/interns/student-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Weekly Review' })).toBeInTheDocument()
    expect(screen.getByText('AISHA RAHMAN')).toBeInTheDocument()
  })

  it('keeps unsubmitted weeks without a saved summary unavailable', async () => {
    renderWeek('student-1', 4)
    expect(await screen.findByText(/not available for review/i)).toBeInTheDocument()
    expect(screen.queryByText(/weekly summary \(draft\)/i)).toBeNull()
    expect(screen.getByRole('link', { name: /back to interns/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Weekly Review' })).toBeInTheDocument()
  })

  it('shows both the snapshot and the latest revision for changes-requested weeks with edits', async () => {
    const submitted = 'Original submitted weekly report text for review purposes here.'
    const revised = 'Original submitted weekly report text for review purposes here, plus extra reflection after feedback.'
    const entry: PortalData['journals'][number]['entries'][number] = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted', dailyEntries: [], weeklyDraft: revised,
      weeklyDraftUpdatedAt: '2026-09-02T10:00:00.000Z',
      submittedBody: submitted,
      review: { status: 'changes_requested', feedback: 'Please add more detail.', reviewedBy: 'Sarah Lim', reviewedAt: '2026-09-01T10:00:00.000Z' },
    }
    renderWeek('s9', 1, 'supervisor-1', customData([entry]))
    expect(await screen.findByText('SUBMITTED WEEKLY REPORT')).toBeInTheDocument()
    expect(screen.getByText(submitted)).toBeInTheDocument()
    expect(screen.getByText(/latest saved revision \(draft\)/i)).toBeInTheDocument()
    expect(screen.getByText(revised)).toBeInTheDocument()
    // Every submitted review carries both decision buttons; no feedback-only save.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^request changes$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save feedback/i })).toBeNull()
  })

  it('omits the revision block when the draft matches the submitted snapshot', async () => {
    // student-4 week 2 has requested changes but no newer revision saved.
    renderWeek('student-4', 2)
    expect(await screen.findByText(/submitted weekly report/i)).toBeInTheDocument()
    expect(screen.queryByText(/latest saved revision/i)).toBeNull()
  })

  it('denies cross-company week access', async () => {
    renderWeek('student-5', 3)
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument()
  })

  it('renders the submitted footer date-only with no location', async () => {
    renderWeek('student-3', 1)
    await screen.findByText(/submitted weekly report/i)
    const footer = screen.getByText(/words · submitted/i)
    expect(footer.textContent).toMatch(/\d+ words · Submitted \d{2}\/\d{2}\/\d{4}/)
    // No time and no timezone name anywhere on the submitted page.
    expect(footer.textContent).not.toMatch(/\d{1,2}:\d{2}/)
    expect(screen.queryByText(/australia\/melbourne/i)).toBeNull()
    expect(screen.queryByText(/asia\/kuala_lumpur/i)).toBeNull()
    expect(screen.queryByText(/week starting/i)).toBeNull()
  })

  it('renders the draft footer with no location', async () => {
    renderWeek('student-1', 3)
    await screen.findByText(/weekly summary \(draft\)/i)
    expect(screen.getByText(/words · draft saved/i)).toBeInTheDocument()
    expect(screen.queryByText(/asia\/kuala_lumpur/i)).toBeNull()
  })

  it('uses a FEEDBACK eyebrow heading without the intern name', async () => {
    renderWeek('student-3', 1)
    await screen.findByLabelText(/review feedback/i)
    expect(screen.getByText('FEEDBACK')).toBeInTheDocument()
    expect(screen.queryByText(/feedback for/i)).toBeNull()
  })

  it('shows the Week dropdown with numeric options and navigates on change', async () => {
    renderWeek('student-4', 1)
    const select = await screen.findByLabelText('Week') as HTMLSelectElement
    const options = Array.from(select.options).map((option) => option.text)
    expect(options.length).toBeGreaterThan(1)
    for (const text of options) {
      expect(text).toMatch(/^Week \d+ — \d{2}\/\d{2}\/\d{4}$/)
    }
    expect(select.value).toBe('1')
    fireEvent.change(select, { target: { value: '4' } })
    // Week 4 of placement-d is awaiting company review.
    expect(await screen.findByText(/awaiting company review/i)).toBeInTheDocument()
  })

  it('shows the Week dropdown on draft and unavailable weeks', async () => {
    renderWeek('student-1', 3)
    expect(await screen.findByLabelText('Week')).toBeInTheDocument()
    cleanup()
    sessionStorage.clear()
    renderWeek('student-1', 4)
    expect(await screen.findByLabelText('Week')).toBeInTheDocument()
  })

  it('hides locked weeks but keeps a directly-accessed locked week selectable', async () => {
    const available: PortalData['journals'][number]['entries'][number] = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted', dailyEntries: [], weeklyDraft: 'A detailed weekly report with enough words for review purposes here.',
      weeklyDraftUpdatedAt: '2026-09-02T10:00:00.000Z',
      submittedBody: 'A detailed weekly report with enough words for review purposes here.',
      submittedAt: '2026-09-01T10:00:00.000Z',
      review: { status: 'pending' },
    }
    const locked: PortalData['journals'][number]['entries'][number] = {
      id: 'week-2', weekNumber: 2, startDate: '2099-01-05', endDate: '2099-01-11',
      body: '', status: 'draft', dailyEntries: [], weeklyDraft: 'Future week draft text that is not yet unlocked for review purposes.',
      weeklyDraftUpdatedAt: '2026-09-02T10:00:00.000Z',
    }
    renderWeek('s9', 1, 'supervisor-1', customData([available, locked]))
    const select = await screen.findByLabelText('Week') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['1'])
    cleanup()
    sessionStorage.clear()
    // Directly accessing the locked week still renders with a usable selector.
    renderWeek('s9', 2, 'supervisor-1', customData([available, locked]))
    const lockedSelect = await screen.findByLabelText('Week') as HTMLSelectElement
    expect(lockedSelect.value).toBe('2')
    expect(Array.from(lockedSelect.options).map((option) => option.value)).toEqual(['1', '2'])
    expect(screen.getByText(/weekly summary \(draft\)/i)).toBeInTheDocument()
  })

  it('resets typed feedback when switching weeks instead of leaking it', async () => {
    // student-4 week 4 is pending with empty feedback; week 1 carries approval feedback.
    renderWeek('student-4', 4)
    const textarea = await screen.findByLabelText(/review feedback/i) as HTMLTextAreaElement
    // Pending week starts empty; typed feedback must not leak to the next week.
    expect(textarea).toHaveDisplayValue('')
    fireEvent.change(textarea, { target: { value: 'Typed note that must not leak.' } })
    expect(textarea).toHaveDisplayValue('Typed note that must not leak.')
    fireEvent.change(screen.getByLabelText('Week'), { target: { value: '1' } })
    const next = await screen.findByLabelText(/review feedback/i) as HTMLTextAreaElement
    // Week 1 carries the stored approval feedback, not the typed note.
    expect(next).toHaveDisplayValue(/thorough handover notes, well done/i)
    expect(next).not.toHaveDisplayValue('Typed note that must not leak.')
  })
})
