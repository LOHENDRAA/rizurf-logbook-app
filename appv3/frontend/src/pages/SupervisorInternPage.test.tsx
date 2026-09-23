import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { customData, draftEntry, renderIntern, renderInternWithData } from './supervisorInternTestHelpers'

describe('SupervisorInternPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('lists submitted weeks plus saved drafts, hiding everything else', async () => {
    const { container } = renderIntern('student-4')
    expect(await screen.findByText('Amara Okafor')).toBeInTheDocument()
    // Submitted weeks link to the review route; drafts render without bodies.
    expect(screen.getByRole('link', { name: /week 1/i })).toHaveAttribute('href', '/supervisor/interns/student-4/weeks/1')
    expect(screen.getByRole('link', { name: /week 5/i })).toHaveAttribute('href', '/supervisor/interns/student-4/weeks/5')
    // The unsubmitted week 6 has a saved weekly summary, so it appears with
    // a Draft badge (but no timestamp) — and no draft bodies, no daily
    // logs, and no selection checkbox.
    const draftLink = screen.getByRole('link', { name: /week 6/i })
    expect(draftLink).toHaveAttribute('href', '/supervisor/interns/student-4/weeks/6')
    expect(draftLink).toHaveTextContent(/draft/i)
    // Week rows show badges and start dates only — no saved/submitted timestamps.
    expect(draftLink).not.toHaveTextContent(/draft saved/i)
    expect(screen.queryByText(/Submitted /)).toBeNull()
    expect(screen.queryByText(/Draft saved /)).toBeNull()
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(screen.queryByText(/reporting dashboard/i)).toBeNull()
    expect(screen.queryByText(/not submitted yet/i)).toBeNull()
  })

  it('hides unsubmitted weeks without a saved summary', async () => {
    // Week 1 below is submitted; week 2 is an unsubmitted week whose draft
    // was cleared, so only the submitted week is listed.
    const submitted = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted' as const, dailyEntries: [], weeklyDraft: 'Submitted text.',
      submittedBody: 'Submitted text.', review: { status: 'pending' as const },
    }
    renderInternWithData('s9', customData([submitted, draftEntry(2, '   ')]))
    expect(await screen.findByText('Test Intern')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /week 1/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /week 2/i })).toBeNull()
  })

  it('mentions drafts in the empty state when nothing is submitted or saved', async () => {
    renderInternWithData('s9', customData([draftEntry(1, '')]))
    expect(await screen.findByText(/no submitted weeks or saved drafts yet/i)).toBeInTheDocument()
    expect(screen.getByText(/saved weekly summaries will appear here/i)).toBeInTheDocument()
  })

  it('denies cross-company intern access', async () => {
    renderIntern('student-5')
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument()
    expect(screen.getAllByText(/not in your company/i).length).toBeGreaterThan(0)
  })

  it('shows no eyebrow, no header card or timestamps, and start-date week rows', async () => {
    const pending = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted' as const, dailyEntries: [], weeklyDraft: 'Submitted text.',
      submittedBody: 'Submitted text.', submittedAt: '2026-01-12T10:00:00.000Z',
      review: { status: 'pending' as const },
    }
    const { container } = renderInternWithData('s9', customData([pending, draftEntry(2, 'Draft summary.')]))
    expect(await screen.findByText('Test Intern')).toBeInTheDocument()
    // No duplicated eyebrow.
    expect(screen.queryByText(/· REVIEW/i)).toBeNull()
    // No date/timezone header card between the heading and the week list.
    expect(container.querySelector('.intern-header')).toBeNull()
    expect(screen.queryByText(/2026-01-05 · UTC/)).toBeNull()
    expect(screen.queryByText(/→/)).toBeNull()
    expect(screen.queryByText(/weeks submitted/i)).toBeNull()
    // Week rows show the start date only, not the formatted range.
    expect(screen.getAllByText('2026-01-05').length).toBeGreaterThanOrEqual(1)
    expect(container.textContent).not.toContain('2026-01-05 – 2026-01-11')
    // No Submitted badge and no submitted/draft timestamp lines.
    expect(container.querySelector('.status-submitted')).toBeNull()
    expect(screen.queryByText(/Submitted /)).toBeNull()
    expect(screen.queryByText(/Draft saved /)).toBeNull()
    // No bulk UI of any kind.
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('.bulk-bar, .bulk-result, .confirm-card, .week-select')).toBeNull()
    // Every visible week is a plain link to its detail route.
    expect(screen.getByRole('link', { name: /week 1/i })).toHaveAttribute('href', '/supervisor/interns/s9/weeks/1')
    expect(screen.getByRole('link', { name: /week 2/i })).toHaveAttribute('href', '/supervisor/interns/s9/weeks/2')
  })

  it('keeps draft and lifecycle badges with no dual badges and no submitted badge', async () => {
    const approved = {
      id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
      body: '', status: 'submitted' as const, dailyEntries: [], weeklyDraft: 'Submitted text.',
      submittedBody: 'Submitted text.', submittedAt: '2026-01-12T10:00:00.000Z',
      review: { status: 'approved' as const },
    }
    const { container } = renderInternWithData('s9', customData([approved, draftEntry(2, 'Draft summary.')]))
    expect(await screen.findByText('Test Intern')).toBeInTheDocument()
    expect(container.querySelector('.status-submitted')).toBeNull()
    // Company-approved with no mentor decision yet: one awaiting-mentor badge.
    const weekLink = screen.getByRole('link', { name: /week 1/i })
    expect(weekLink).toHaveTextContent(/awaiting mentor review/i)
    expect(weekLink.querySelectorAll('.status')).toHaveLength(1)
    expect(weekLink).not.toHaveTextContent(/^Approved$/)
    const draftLink = screen.getByRole('link', { name: /week 2/i })
    expect(draftLink).toHaveTextContent(/draft/i)
    // Badges remain but timestamp lines are gone.
    expect(screen.queryByText(/Submitted /)).toBeNull()
    expect(screen.queryByText(/Draft saved /)).toBeNull()
  })
})
