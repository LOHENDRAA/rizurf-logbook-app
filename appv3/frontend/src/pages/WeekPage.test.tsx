import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import type { PortalData } from '../types'
import { WeekPage } from './WeekPage'

function renderWeek(weekNumber: string, session = 'student-1', data?: PortalData) {
  sessionStorage.setItem('portal-user', session)
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={[`/journal/weeks/${weekNumber}`]}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/journal" element={<div>Journal landing</div>} />
          <Route path="/journal/weeks/:weekNumber" element={<WeekPage />} />
          <Route path="/journal/days/:date" element={<div>Day editor</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

/** Reads the stored weekly draft so tests can observe the debounced autosave. */
function DraftProbe({ weekNumber }: { weekNumber: number }) {
  const { currentJournal } = useApp()
  const entry = currentJournal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
  return <div data-testid="draft-probe">{entry?.weeklyDraft ?? ''}</div>
}

function renderWeekWithProbe(weekNumber: string, session = 'student-1', data?: PortalData) {
  sessionStorage.setItem('portal-user', session)
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={[`/journal/weeks/${weekNumber}`]}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/journal" element={<div>Journal landing</div>} />
          <Route path="/journal/weeks/:weekNumber" element={<><WeekPage /><DraftProbe weekNumber={Number(weekNumber)} /></>} />
          <Route path="/journal/days/:date" element={<div>Day editor</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

/** Probe stays mounted across navigation so the unmount flush is observable. */
function renderWeekWithPersistentProbe(weekNumber: string) {
  sessionStorage.setItem('portal-user', 'student-1')
  render(
    <MemoryRouter initialEntries={[`/journal/weeks/${weekNumber}`]}>
      <AppProvider repository={testRepository()}>
        <DraftProbe weekNumber={Number(weekNumber)} />
        <Routes>
          <Route path="/journal" element={<div>Journal landing</div>} />
          <Route path="/journal/weeks/:weekNumber" element={<WeekPage />} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

const summaryBox = () => screen.getByRole('textbox', { name: 'Weekly Log' })
const submitButton = () => screen.getByRole('button', { name: /^(submit week|resubmit week|submitted)$/i })
/** A placement with a single unsubmitted daily week (blank logs). */
function unsubmittedData(): PortalData {
  return {
    version: 8,
    users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
    companies: [{ id: 'c1', name: 'Test Co' }],
    supervisors: [],
    mentors: [],
    internships: [{
      id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
      programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
      startDate: '2026-01-05', endDate: '2026-01-11',
    }],
    journals: [{
      internshipId: 'p1',
      entries: [
        {
          id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
          body: '', status: 'not_started',
          dailyEntries: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((date) => ({
            date, body: '',
          })),
          weeklyDraft: '',
        },
      ],
    }],
  }
}

/** A future week whose dailies are complete with a short draft: submittable before it ends. */
function futureReadyData(): PortalData {
  const data = unsubmittedData()
  const journal = data.journals[0]
  journal.entries = [{
    id: 'week-1', weekNumber: 1, startDate: '2099-01-05', endDate: '2099-01-11',
    body: '', status: 'not_started' as const,
    dailyEntries: ['2099-01-05', '2099-01-06', '2099-01-07', '2099-01-08', '2099-01-09'].map((date) => ({
      date, body: `Worked on ${date}.`,
    })),
    weeklyDraft: 'hello',
  }]
  data.internships[0].startDate = '2099-01-05'
  data.internships[0].endDate = '2099-01-11'
  return data
}

/** A placement week with no weekday dates inside its range. */
function zeroWeekdayData(): PortalData {
  const data = unsubmittedData()
  const journal = data.journals[0]
  journal.entries = [{
    id: 'week-1', weekNumber: 1, startDate: '2026-01-10', endDate: '2026-01-11',
    body: '', status: 'not_started',
    dailyEntries: [],
    weeklyDraft: '',
  }]
  return data
}

/** A week with sparse stored entries plus legacy invalid logs (weekend/out-of-range). */
function sparseWithLegacyData(): PortalData {
  const data = unsubmittedData()
  const journal = data.journals[0]
  journal.entries = [{
    id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
    body: '', status: 'not_started',
    dailyEntries: [
      { date: '2026-01-05', body: '' },
      // Legacy invalid: Saturday inside the range and a date outside it.
      { date: '2026-01-10', body: 'Weekend legacy.' },
      { date: '2026-02-04', body: 'Out-of-range legacy.' },
    ],
    weeklyDraft: '',
  }]
  return data
}

describe('WeekPage (daily logs + weekly summary)', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows daily logs with full cards and edit links', async () => {
    renderWeek('4')
    expect(await screen.findByRole('heading', { name: 'Optional Daily Logs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /weekly consolidation log/i })).toBeInTheDocument()
    const weekStarting = screen.getByLabelText('Week starting')
    expect(weekStarting.tagName.toLowerCase()).toBe('select')
    const dayCards = screen.getAllByRole('article')
    expect(dayCards.length).toBeGreaterThan(0)
    expect(dayCards[0]).toHaveAccessibleName(/daily log \d{4}-\d{2}-\d{2}/i)
    const editLinks = screen.getAllByRole('link', { name: /^open$/i })
    expect(editLinks.length).toBeGreaterThan(0)
    expect(editLinks[0]).toHaveAttribute('href', expect.stringMatching(/\/journal\/days\//))
  })

  it('merges daily logs and weekly summary into a single outer card with a divider', async () => {
    renderWeek('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const cards = document.querySelectorAll('.simple-sheet .simple-sheet-card')
    expect(cards).toHaveLength(1)
    const card = cards[0] as HTMLElement
    expect(within(card).getByRole('heading', { name: 'Optional Daily Logs' })).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Weekly Log' })).toBeInTheDocument()
    expect(within(card).getByRole('textbox', { name: 'Weekly Log' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /^(submit week|resubmit week|submitted)$/i })).toBeInTheDocument()
    const divider = card.querySelector('.simple-divider')
    expect(divider).not.toBeNull()
    // Divider sits between the Weekly Log and Daily logs sections.
    const dailyHeading = within(card).getByRole('heading', { name: 'Optional Daily Logs' })
    const summaryHeading = within(card).getByRole('heading', { name: 'Weekly Log' })
    expect(summaryHeading.compareDocumentPosition(divider as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dailyHeading.compareDocumentPosition(divider as Node) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // Each day remains a bordered inner item.
    expect(card.querySelectorAll('.daily-list .day-full-card').length).toBeGreaterThan(0)
  })

  it('uses the Empty copy and Open link text for blank daily entries', async () => {
    renderWeek('1', 's1', unsubmittedData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const empties = screen.getAllByText('Empty')
    expect(empties.length).toBeGreaterThan(0)
    empties.forEach((node) => expect(node).toHaveClass('muted'))
    expect(screen.queryByText(/no entry yet/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /open and edit day/i })).toBeNull()
    const openLinks = screen.getAllByRole('link', { name: /^open$/i })
    expect(openLinks.length).toBeGreaterThan(0)
  })

  it('shows weekday names in daily card headings while keeping ISO dates for routing and labels', async () => {
    // 2026-01-05 is a Monday … 2026-01-09 is a Friday.
    renderWeek('1', 's1', unsubmittedData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const card = document.querySelector('.simple-sheet-card') as HTMLElement
    const headings = Array.from(card.querySelectorAll('.day-full-card strong')).map((node) => node.textContent)
    expect(headings).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    expect(headings.some((text) => /\d{4}-\d{2}-\d{2}/.test(text ?? ''))).toBe(false)
    // ISO date stays in day routes and accessible labels for uniqueness.
    const openLinks = screen.getAllByRole('link', { name: /^open$/i })
    expect(openLinks[0]).toHaveAttribute('href', '/journal/days/2026-01-05')
    expect(screen.getByRole('article', { name: 'Daily log 2026-01-05' })).toBeInTheDocument()
  })

  it('omits the weekly summary helper copy', async () => {
    renderWeek('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.queryByText(/write a short summary of your week/i)).toBeNull()
  })

  it('has no prev/next week navigator but keeps the Back to journal link', async () => {
    renderWeek('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(document.querySelector('.week-nav')).toBeNull()
    expect(screen.queryByRole('link', { name: /week 3/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /week 5/i })).toBeNull()
    const back = screen.getByRole('link', { name: /back to journal/i })
    expect(back).toHaveAttribute('href', '/journal')
  })

  it('renders the Weekly Log section with a counter, autosave copy, and no manual save', async () => {
    renderWeek('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByRole('heading', { name: 'Weekly Log' })).toBeInTheDocument()
    const box = summaryBox()
    expect(box).toBeEnabled()
    expect(box).toHaveValue('')
    expect(screen.getByText('0 / 5000 characters')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save summary/i })).toBeNull()
  })

  it('autosaves typing with an Autosaved timestamp instead of a save button', async () => {
    renderWeekWithProbe('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByTestId('draft-probe')).toHaveTextContent('')
    fireEvent.change(summaryBox(), { target: { value: 'Autosaved thoughts.' } })
    // Debounced: typing alone does not persist immediately.
    expect(screen.getByTestId('draft-probe')).toHaveTextContent('')
    await waitFor(() => expect(screen.getByTestId('draft-probe')).toHaveTextContent('Autosaved thoughts.'), { timeout: 3000 })
    const saveState = document.querySelector('.save-state')
    expect(saveState).not.toBeNull()
    expect(saveState).toHaveTextContent(/autosaved/i)
    expect(screen.queryByRole('button', { name: /save summary/i })).toBeNull()
  })

  it('flushes a pending autosave when leaving the page', async () => {
    renderWeekWithPersistentProbe('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    fireEvent.change(summaryBox(), { target: { value: 'Last keystrokes.' } })
    expect(screen.getByTestId('draft-probe')).toHaveTextContent('')
    fireEvent.click(screen.getByRole('link', { name: /back to journal/i }))
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.getByTestId('draft-probe')).toHaveTextContent('Last keystrokes.')
  })

  it('clears the summary when emptied via autosave', async () => {
    renderWeekWithProbe('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    fireEvent.change(summaryBox(), { target: { value: 'Temporary.' } })
    await waitFor(() => expect(screen.getByTestId('draft-probe')).toHaveTextContent('Temporary.'), { timeout: 3000 })
    fireEvent.change(summaryBox(), { target: { value: '' } })
    await waitFor(() => expect(screen.getByTestId('draft-probe')).toHaveTextContent(''), { timeout: 3000 })
  })

  it('blocks over-limit text with an error, never persists it, and disables submit', async () => {
    renderWeekWithProbe('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    fireEvent.change(summaryBox(), { target: { value: 'x'.repeat(5001) } })
    expect(screen.getByText('5001 / 5000 characters')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/5000 characters or fewer/i)
    // Nothing was persisted, even after the debounce window.
    await waitFor(() => expect(screen.getByText('5001 / 5000 characters')).toBeInTheDocument())
    expect(screen.getByTestId('draft-probe')).toHaveTextContent('')
    expect(submitButton()).toBeDisabled()
    expect(screen.getByText(/5000 characters or fewer. You have 5001/i)).toBeInTheDocument()
    // Back at exactly the limit, autosave works again.
    fireEvent.change(summaryBox(), { target: { value: 'x'.repeat(5000) } })
    await waitFor(() => expect(screen.getByTestId('draft-probe')).toHaveTextContent('x'.repeat(5000)), { timeout: 3000 })
  })

  it('keeps an ended unsubmitted week editable with an overdue badge but no ended banner', async () => {
    renderWeek('3')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.queryByText(/this week has ended/i)).toBeNull()
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0)
    // Week 3 is a past week, but its summary (with the seeded draft) stays editable.
    const box = summaryBox()
    expect(box).toBeEnabled()
    expect(box).toHaveValue('Started looking into the reporting dashboard. Gathered requirements from the product notes, sketched a rough plan, and scheduled a follow-up with the design team.')
    expect(screen.queryByText(/past weeks are read-only/i)).toBeNull()
    // Daily logs stay open with edit links.
    expect(screen.getAllByRole('link', { name: /^open$/i }).length).toBeGreaterThan(0)
  })

  it('locks approved weeks read-only with a submitted button', async () => {
    renderWeek('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText(/^Approved$/)).toBeNull()
    expect(screen.queryByText(/submitted and read-only/i)).toBeNull()
    expect(screen.queryByText(/daily logs remain editable below/i)).toBeNull()
    expect(screen.getByText(/optional and separate/i)).toBeInTheDocument()
    expect(summaryBox()).toBeDisabled()
    // Submitted feedback card shows a visible Feedback heading and region name.
    expect(screen.getByRole('heading', { name: 'Feedback' })).toBeVisible()
    const feedbackRegion = screen.getByRole('region', { name: 'Feedback' })
    expect(feedbackRegion).toBeInTheDocument()
    expect(within(feedbackRegion).getByText(/company feedback:/i)).toBeInTheDocument()
    expect(within(feedbackRegion).getByText(/mentor feedback:/i)).toBeInTheDocument()
    // Daily logs stay editable with Open links even on approved weeks.
    expect(screen.getAllByRole('link', { name: /^open$/i }).length).toBeGreaterThan(0)
    const button = submitButton()
    expect(button).toHaveTextContent(/^submitted$/i)
    expect(button).toBeDisabled()
  })

  it('locks submitted weeks awaiting company review read-only', async () => {
    // student-3 week 1 is a submitted week awaiting company review.
    renderWeek('1', 'student-3')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getAllByText(/awaiting company review/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/submitted and read-only/i)).toBeNull()
    expect(screen.queryByText(/daily logs remain editable below/i)).toBeNull()
    expect(summaryBox()).toBeDisabled()
    // Feedback card still renders its heading alongside the no-feedback fallback.
    expect(screen.getByRole('heading', { name: 'Feedback' })).toBeVisible()
    const feedbackRegion = screen.getByRole('region', { name: 'Feedback' })
    expect(within(feedbackRegion).getByText(/no feedback yet/i)).toBeInTheDocument()
    // Daily logs stay editable with Open links while the weekly report is locked.
    expect(screen.getAllByRole('link', { name: /^open$/i }).length).toBeGreaterThan(0)
    const button = submitButton()
    expect(button).toHaveTextContent(/^submitted$/i)
    expect(button).toBeDisabled()
  })

  it('keeps a changes-requested week weekly-only editable with immediate resubmit and visible feedback', async () => {
    // student-4 week 2 is a submitted week with requested changes.
    renderWeekWithProbe('2', 'student-4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getAllByText(/changes requested/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/concrete examples from your HR shadowing/i).length).toBeGreaterThan(0)
    const box = summaryBox()
    expect(box).toBeEnabled()
    // Daily logs stay editable alongside the weekly revision path.
    expect(screen.getByText(/optional and separate/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^open$/i }).length).toBeGreaterThan(0)
    // Resubmit is available immediately, even before any new edit.
    const resubmit = submitButton()
    expect(resubmit).toHaveTextContent(/resubmit week/i)
    expect(resubmit).toBeEnabled()
    const before = (box as HTMLTextAreaElement).value
    fireEvent.change(box, { target: { value: `${before} Extra reflection added.` } })
    await waitFor(
      () => expect(screen.getByTestId('draft-probe')).toHaveTextContent('Extra reflection added.'),
      { timeout: 3000 },
    )
    expect(submitButton()).toHaveTextContent(/resubmit week/i)
    expect(submitButton()).toBeEnabled()
  })

  it('shows a single heading badge with feedback-only review stages and no dual badges', async () => {
    // student-4 week 2 is company changes-requested with stored feedback.
    renderWeek('2', 'student-4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByText('Revision required')).toBeInTheDocument()
    expect(document.querySelectorAll('.editor-badges .status')).toHaveLength(1)
    const stages = screen.getByRole('region', { name: 'Feedback' })
    expect(stages.querySelectorAll('.status')).toHaveLength(0)
    expect(stages).toHaveTextContent(/company feedback/i)
    expect(within(stages).getByRole('heading', { name: 'Feedback' })).toBeVisible()
  })

  it('labels the feedback region by an h2 Feedback heading', async () => {
    renderWeek('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const heading = screen.getByRole('heading', { name: 'Feedback' })
    expect(heading.tagName.toLowerCase()).toBe('h2')
    const region = screen.getByRole('region', { name: 'Feedback' })
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.id).toBeTruthy()
  })

  it('redirects a locked week for a future placement back to the journal', async () => {
    // student-2 has an upcoming placement starting in the future: every week is locked.
    renderWeek('1', 'student-2')
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Optional Daily Logs' })).toBeNull()
  })

  it('unlocks a week automatically on its start date', async () => {
    const { getProgrammeDate: programmeDate } = await import('../domain/dates')
    const { addDaysUtc: addDays } = await import('../domain/dates')
    const today = programmeDate(new Date(), 'UTC')
    const data = unsubmittedData()
    const journal = data.journals[0]
    journal.entries = [{
      id: 'week-1', weekNumber: 1, startDate: today, endDate: addDays(today, 6),
      body: '', status: 'not_started',
      dailyEntries: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((date) => ({
        date, body: '',
      })),
      weeklyDraft: '',
    }]
    renderWeek('1', 's1', data)
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.queryByText('Journal landing')).toBeNull()
    expect(summaryBox()).toBeEnabled()
  })

  it('redirects an out-of-range week number back to the journal', async () => {
    renderWeek('99')
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
  })

  it('redirects a non-numeric week number back to the journal', async () => {
    renderWeek('abc')
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
  })
})

describe('WeekPage submit control', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('disables Submit week without visible readiness reasons', async () => {
    renderWeek('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const button = submitButton()
    expect(button).toHaveTextContent(/submit week/i)
    expect(button).toBeDisabled()
    // Readiness gating stays, but the reasons list is not rendered: no
    // "N words" minimum copy and no empty-draft reason is shown either.
    expect(screen.queryByText(/daily logs still need completing/i)).toBeNull()
    expect(screen.queryByText(/\d+\s+words/i)).toBeNull()
    expect(screen.queryByText(/must not be empty/i)).toBeNull()
  })

  it('redirects a locked future week instead of allowing submission', async () => {
    renderWeekWithProbe('1', 's1', futureReadyData())
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Optional Daily Logs' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(submit week|resubmit week|submitted)$/i })).toBeNull()
  })

  it('keeps pending weeks locked: edits stay disabled and resubmit is rejected', async () => {
    // student-3 week 1 is submitted + pending: the weekly draft is read-only, but the
    // separate optional daily logs stay editable with Open links.
    renderWeekWithProbe('1', 'student-3')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(summaryBox()).toBeDisabled()
    expect(screen.getAllByRole('link', { name: /^open$/i }).length).toBeGreaterThan(0)
    const submitted = submitButton()
    expect(submitted).toHaveTextContent(/^submitted$/i)
    expect(submitted).toBeDisabled()
  })

  it('keeps approved weeks final: edits stay disabled and resubmit is rejected', async () => {
    renderWeekWithProbe('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(summaryBox()).toBeDisabled()
    expect(submitButton()).toHaveTextContent(/^submitted$/i)
    expect(submitButton()).toBeDisabled()
  })

  it('resubmits a changes-requested week immediately even when unchanged', async () => {
    // student-4 week 2 carries requested changes with the draft matching the snapshot.
    renderWeekWithProbe('2', 'student-4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const resubmit = submitButton()
    expect(resubmit).toHaveTextContent(/resubmit week/i)
    expect(resubmit).toBeEnabled()
    fireEvent.click(resubmit)
    expect(await screen.findByRole('status')).toHaveTextContent(/resubmitted/i)
    expect(submitButton()).toHaveTextContent(/^submitted$/i)
    expect(submitButton()).toBeDisabled()
    expect(screen.getAllByText(/awaiting company review/i).length).toBeGreaterThan(0)
  })

  it('clears submit feedback when switching weeks instead of leaking it', async () => {
    renderWeekWithProbe('2', 'student-4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    fireEvent.click(submitButton())
    expect(await screen.findByRole('status')).toHaveTextContent(/resubmitted/i)
    // Navigating to another available week clears the stale success copy.
    fireEvent.change(screen.getByLabelText('Week starting'), { target: { value: '3' } })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('navigates away without confirmation since summaries autosave', async () => {
    renderWeek('4')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    fireEvent.change(summaryBox(), { target: { value: 'Unsaved thoughts.' } })
    fireEvent.click(screen.getByRole('link', { name: /back to journal/i }))
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('WeekPage (unsubmitted daily week)', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('renders daily logs with a week starting selector', async () => {
    renderWeek('1', 's1', unsubmittedData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const weekStarting = screen.getByLabelText('Week starting')
    expect(weekStarting.tagName.toLowerCase()).toBe('select')
    expect(weekStarting).toHaveValue('1')
    const options = within(weekStarting as HTMLSelectElement).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Week 1 — Jan 5, 2026')
    expect(screen.queryByText('PRIVATE DAILY LOGS')).toBeNull()
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
    const dayLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/journal/days/'))
    expect(dayLinks.length).toBeGreaterThan(0)
  })

  it('keeps the weekly summary editable for a past unsubmitted week with a disabled submit', async () => {
    renderWeek('1', 's1', unsubmittedData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByRole('heading', { name: 'Weekly Log' })).toBeInTheDocument()
    expect(summaryBox()).toBeEnabled()
    expect(screen.queryByText(/past weeks are read-only/i)).toBeNull()
    const button = submitButton()
    expect(button).toHaveTextContent(/submit week/i)
    expect(button).toBeDisabled()
    expect(screen.queryByText(/daily logs still need completing/i)).toBeNull()
  })

  it('shows a simplified page heading without eyebrow or date paragraph', async () => {
    renderWeek('1', 's1', unsubmittedData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const heading = screen.getByRole('heading', { level: 1, name: /weekly consolidation log/i })
    expect(heading).toHaveTextContent('Weekly Consolidation Log')
    const pageHeading = heading.closest('.page-heading') as HTMLElement
    expect(pageHeading.querySelector('.eyebrow')).toBeNull()
    expect(within(pageHeading).queryByText('2026-01-05')).toBeNull()
    expect(pageHeading.querySelector('p')).toBeNull()
    expect(pageHeading.textContent).not.toContain('WEEK 1')
  })

  it('keeps the no-weekday-logs copy for weeks without weekday dates', async () => {
    renderWeek('1', 's1', zeroWeekdayData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByText(/no weekday logs are required/i)).toBeInTheDocument()
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('lists missing-but-valid weekdays as Empty with Open links', async () => {
    renderWeek('1', 's1', sparseWithLegacyData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    // Required weekdays Mon 2026-01-05 … Fri 2026-01-09 all render, even the
    // missing ones; missing days show Empty with an Open link.
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(5)
    expect(screen.getByRole('article', { name: 'Daily log 2026-01-06' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Daily log 2026-01-06' })).getByText('Empty')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Daily log 2026-01-06' })).getByRole('link', { name: /^open$/i }))
      .toHaveAttribute('href', '/journal/days/2026-01-06')
  })

  it('hides legacy invalid stored logs (weekends and out-of-range dates)', async () => {
    renderWeek('1', 's1', sparseWithLegacyData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.queryByRole('article', { name: 'Daily log 2026-01-10' })).toBeNull()
    expect(screen.queryByRole('article', { name: 'Daily log 2026-02-04' })).toBeNull()
    expect(screen.queryByText('Weekend legacy.')).toBeNull()
    expect(screen.queryByText('Out-of-range legacy.')).toBeNull()
    expect(document.querySelector('a[href="/journal/days/2026-01-10"]')).toBeNull()
    expect(document.querySelector('a[href="/journal/days/2026-02-04"]')).toBeNull()
  })

  it('renders future days as Locked with no Open link', async () => {
    const { getProgrammeDate: programmeDate, addDaysUtc: addDays } = await import('../domain/dates')
    const { weekdaysInWeek: weekdays } = await import('../domain/daily')
    const today = programmeDate(new Date(), 'UTC')
    const start = addDays(today, -6)
    const end = addDays(today, 6)
    const required = weekdays(start, end)
    const future = required.filter((date) => date > today)
    if (future.length === 0) return
    const data = unsubmittedData()
    data.internships[0].programmeTimeZone = 'UTC'
    data.internships[0].startDate = start
    data.internships[0].endDate = end
    data.journals[0].entries = [{
      id: 'week-1', weekNumber: 1, startDate: start, endDate: end,
      body: '', status: 'not_started',
      dailyEntries: [],
      weeklyDraft: '',
    }]
    renderWeek('1', 's1', data)
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const card = screen.getByRole('article', { name: `Daily log ${future[0]}` })
    expect(within(card).getByText('Locked')).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: /^open$/i })).toBeNull()
    expect(document.querySelector(`a[href="/journal/days/${future[0]}"]`)).toBeNull()
  })

  it('submits a zero-weekday week on non-empty text alone', async () => {
    renderWeekWithProbe('1', 's1', zeroWeekdayData())
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(submitButton()).toBeDisabled()
    fireEvent.change(summaryBox(), { target: { value: 'hello' } })
    await waitFor(() => expect(screen.getByTestId('draft-probe')).toHaveTextContent('hello'), { timeout: 3000 })
    const button = submitButton()
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(await screen.findByRole('status')).toHaveTextContent(/week submitted/i)
    expect(submitButton()).toHaveTextContent(/^submitted$/i)
  })
})

describe('WeekPage week switcher', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  /** Two available past weeks plus a locked future week. */
  function switcherData(): PortalData {
    const data = unsubmittedData()
    const journal = data.journals[0]
    journal.entries = [
      {
        id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
        body: '', status: 'not_started',
        dailyEntries: [{ date: '2026-01-05', body: '' }],
        weeklyDraft: '',
      },
      {
        id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18',
        body: '', status: 'not_started',
        dailyEntries: [{ date: '2026-01-12', body: '' }],
        weeklyDraft: '',
      },
      {
        id: 'week-3', weekNumber: 3, startDate: '2099-01-05', endDate: '2099-01-11',
        body: '', status: 'not_started',
        dailyEntries: [{ date: '2099-01-05', body: '' }],
        weeklyDraft: '',
      },
    ]
    return data
  }

  function renderSwitcher(startWeek = '1') {
    sessionStorage.setItem('portal-user', 's1')
    const repository = testRepository({ createDemoData: () => switcherData() })
    return render(
      <MemoryRouter initialEntries={[`/journal/weeks/${startWeek}`]}>
        <AppProvider repository={repository}>
          <DraftProbe weekNumber={1} />
          <Routes>
            <Route path="/journal" element={<div>Journal landing</div>} />
            <Route path="/journal/weeks/:weekNumber" element={<WeekPage />} />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    )
  }

  it('lists available weeks with readable start dates and marks the current week selected', async () => {
    renderSwitcher('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const select = screen.getByLabelText('Week starting')
    expect(select.tagName.toLowerCase()).toBe('select')
    expect(select).toHaveValue('1')
    // Label is associated with the control.
    expect(document.querySelector('label[for="week-starting"]')).toHaveTextContent('Week starting')
    // Wrapper is scoped for the compact left-aligned selector style.
    expect(select.closest('.simple-field')).toHaveClass('week-starting-field')
    const options = within(select as HTMLSelectElement).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Week 1 — Jan 5, 2026',
      'Week 2 — Jan 12, 2026',
    ])
  })

  it('hides locked future weeks instead of disabling them', async () => {
    renderSwitcher('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    const select = screen.getByLabelText('Week starting')
    const options = within(select as HTMLSelectElement).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(within(select as HTMLSelectElement).queryByRole('option', { name: /week 3/i })).toBeNull()
  })

  it('navigates immediately when another week is selected', async () => {
    renderSwitcher('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    expect(screen.getByRole('article', { name: 'Daily log 2026-01-05' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Week starting'), { target: { value: '2' } })
    expect(await screen.findByRole('article', { name: 'Daily log 2026-01-12' })).toBeInTheDocument()
    expect(screen.getByLabelText('Week starting')).toHaveValue('2')
  })

  it('autosaves a pending weekly summary edit when switching weeks', async () => {
    renderSwitcher('1')
    await screen.findByRole('heading', { name: 'Optional Daily Logs' })
    fireEvent.change(summaryBox(), { target: { value: 'Reflection before switching.' } })
    // Switch before the debounce fires: the unmount flush must persist the edit.
    fireEvent.change(screen.getByLabelText('Week starting'), { target: { value: '2' } })
    expect(await screen.findByRole('article', { name: 'Daily log 2026-01-12' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('draft-probe')).toHaveTextContent('Reflection before switching.'), { timeout: 3000 })
  })
})
