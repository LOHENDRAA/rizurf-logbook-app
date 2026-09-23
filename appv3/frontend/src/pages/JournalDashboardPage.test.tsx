import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import { JournalDashboardPage } from './JournalDashboardPage'
import { addDaysUtc, getCalendarWeekRange, getProgrammeDate } from '../domain/dates'
import { buildWeeks } from '../domain/weeks'
import type { JournalEntry, PortalData } from '../types'

function renderJournal(session = 'student-1', data?: PortalData) {
  if (session) sessionStorage.setItem('portal-user', session)
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={['/journal']}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/journal" element={<JournalDashboardPage />} />
          <Route path="/journal/weeks/:weekNumber" element={<div>Week editor</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

/** Unlocked weeks all submitted, with future weeks still locked. */
function caughtUpData(): PortalData {
  const today = getProgrammeDate(new Date(), 'UTC')
  const start = addDaysUtc(today, -10)
  const end = addDaysUtc(today, 25)
  const built = buildWeeks(start, end)
  const entries = built.entries.map((entry, index) => (index < 2 ? { ...entry, status: 'submitted' as const, weeklyDraft: 'done', submittedBody: 'done' } : entry))
  return {
    version: 8,
    users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
    companies: [{ id: 'company-a', name: 'Nusantara Digital' }],
    supervisors: [],
    mentors: [],
    internships: [
      {
        id: 'placement-a',
        studentId: 'student-1',
        companyId: 'company-a',
        universityName: 'Universiti Teknologi Malaysia',
        programmeName: 'BSc Computer Science',
        programmeTimeZone: 'UTC',
        companyName: 'Nusantara Digital',
        position: 'Software Engineering Intern',
        startDate: start,
        endDate: end,
      },
    ],
    journals: [{ internshipId: 'placement-a', entries }],
  }
}

function fixedEntry(weekNumber: number, startDate: string, endDate: string, status: JournalEntry['status'] = 'not_started'): JournalEntry {
  return { id: `week-${weekNumber}`, weekNumber, startDate, endDate, body: '', status, dailyEntries: [], weeklyDraft: '' }
}

/**
 * Deterministic split data built relative to the real programme-local today:
 * weeks 1–2 end before this week's Monday (overdue), weeks 3–4 overlap
 * Mon–Sun (current week, including one ending earlier this week), week 5 is
 * submitted (past), week 6 starts after Sunday (upcoming locked).
 */
function splitData(): PortalData {
  const today = getProgrammeDate(new Date(), 'UTC')
  const { monday, sunday } = getCalendarWeekRange(today)
  const entries: JournalEntry[] = [
    { ...fixedEntry(1, addDaysUtc(monday, -14), addDaysUtc(monday, -8), 'draft'), weeklyDraft: 'overdue one' },
    fixedEntry(2, addDaysUtc(monday, -7), addDaysUtc(monday, -1), 'not_started'),
    { ...fixedEntry(3, addDaysUtc(monday, -3), monday, 'draft'), weeklyDraft: 'ended Monday' },
    fixedEntry(4, monday, sunday, 'not_started'),
    { ...fixedEntry(5, addDaysUtc(monday, -21), addDaysUtc(monday, -15), 'submitted'), weeklyDraft: 'done' },
    fixedEntry(6, addDaysUtc(monday, 7), addDaysUtc(monday, 13), 'not_started'),
  ]
  return {
    version: 8,
    users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
    companies: [{ id: 'company-a', name: 'Nusantara Digital' }],
    supervisors: [],
    mentors: [],
    internships: [
      {
        id: 'placement-a',
        studentId: 'student-1',
        companyId: 'company-a',
        universityName: 'Universiti Teknologi Malaysia',
        programmeName: 'BSc Computer Science',
        programmeTimeZone: 'UTC',
        companyName: 'Nusantara Digital',
        position: 'Software Engineering Intern',
        startDate: addDaysUtc(monday, -21),
        endDate: addDaysUtc(monday, 13),
      },
    ],
    journals: [{ internshipId: 'placement-a', entries }],
  }
}

function renderSplit() {
  renderJournal('student-1', splitData())
}

function weekNumbersInList(): number[] {
  const rows = Array.from(document.querySelectorAll('.week-list .week-row'))
  return rows.map((row) => Number((row.textContent ?? '').match(/week (\d+)/i)?.[1]))
}

function linkNumbersInList(): number[] {
  const links = screen.getAllByRole('link', { name: /week \d/i })
  return links.map((link) => Number((link.textContent ?? '').match(/week (\d+)/i)?.[1]))
}

describe('JournalDashboardPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows journal heading without a progress panel or eyebrow', async () => {
    renderJournal()
    expect(await screen.findByRole('heading', { name: 'Daily + weekly journals' })).toBeInTheDocument()
    expect(screen.queryByText(/journals submitted/i)).toBeNull()
    expect(screen.queryByText(/JOURNAL PROGRESS/i)).toBeNull()
    expect(document.querySelector('.page-heading .eyebrow')).toBeNull()
  })

  it('renders every week in one ascending list with no group headings', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 1/i })
    expect(weekNumbersInList()).toEqual([1, 2, 3, 4, 5, 6])
    for (const title of ['Current week', 'Overdue', 'Past', 'Upcoming']) {
      expect(screen.queryByRole('heading', { name: title })).toBeNull()
    }
    expect(screen.queryByRole('heading', { name: 'Weeks' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByText('To do')).toBeNull()
  })

  it('renders a single week-list container', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 1/i })
    expect(document.querySelectorAll('.week-list')).toHaveLength(1)
    expect(document.querySelectorAll('.week-group')).toHaveLength(0)
    const list = document.querySelector('.week-list') as HTMLElement
    expect(list.querySelectorAll('.week-row')).toHaveLength(6)
    expect(within(list).getAllByRole('link')).toHaveLength(5)
    expect(list.querySelectorAll('.week-row.locked')).toHaveLength(1)
  })

  it('shows the overdue badge for overdue weeks and stored status for available weeks', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 1/i })
    const list = document.querySelector('.week-list') as HTMLElement
    const week1 = within(list).getByRole('link', { name: /week 1/i })
    const week2 = within(list).getByRole('link', { name: /week 2/i })
    expect(week1.querySelector('.status-overdue')).not.toBeNull()
    expect(week2.querySelector('.status-overdue')).not.toBeNull()
    // Week 4 overlaps the current Mon–Sun week and stays unlocked, so it keeps its stored status.
    const week4 = within(list).getByRole('link', { name: /week 4/i })
    expect(week4.querySelector('.status-overdue')).toBeNull()
    expect(week4.querySelector('.status-not_started')).not.toBeNull()
    expect(week4).toHaveAttribute('href', '/journal/weeks/4')
  })

  it('shows start date only with no day counters in rows', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 1/i })
    const rows = screen.getAllByRole('link', { name: /week \d/i })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/\d+\/\d+ days/)
    }
    const list = document.querySelector('.week-list') as HTMLElement
    expect(list.textContent).not.toMatch(/ – /)
  })

  it('shows a single lifecycle badge for submitted weeks', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 5/i })
    const list = document.querySelector('.week-list') as HTMLElement
    const link = within(list).getByRole('link', { name: /week 5/i })
    expect(within(link).getByText('Awaiting company review')).toBeInTheDocument()
    expect(within(link).queryByText('Submitted')).toBeNull()
    expect(link.querySelectorAll('.status')).toHaveLength(1)
  })

  it('hides the intermediate company approval behind a single awaiting-mentor badge', async () => {
    const data = splitData()
    data.journals[0].entries = data.journals[0].entries.map((entry) =>
      entry.weekNumber === 5
        ? { ...entry, review: { status: 'approved' as const }, mentorReview: { status: 'pending' as const } }
        : entry,
    )
    renderJournal('student-1', data)
    await screen.findByRole('link', { name: /week 5/i })
    const list = document.querySelector('.week-list') as HTMLElement
    const link = within(list).getByRole('link', { name: /week 5/i })
    expect(within(link).getByText('Awaiting mentor review')).toBeInTheDocument()
    expect(within(link).queryByText('Approved')).toBeNull()
    expect(link.querySelectorAll('.status')).toHaveLength(1)
  })

  it('hides weekly draft and feedback previews on unlocked week cards', async () => {
    const data = splitData()
    const journal = data.journals[0]
    journal.entries = journal.entries.map((entry) => {
      if (entry.weekNumber === 1) return { ...entry, weeklyDraft: 'DRAFT-SHOULD-NOT-SHOW-XYZ' }
      if (entry.weekNumber === 5) {
        return { ...entry, weeklyDraft: 'DRAFT-SHOULD-NOT-SHOW-XYZ', review: { status: 'approved' as const, feedback: 'FEEDBACK-SHOULD-NOT-SHOW-XYZ' }, mentorReview: { status: 'approved' as const } }
      }
      return entry
    })
    renderJournal('student-1', data)
    await screen.findByRole('link', { name: /week 1/i })
    expect(screen.queryByText(/DRAFT-SHOULD-NOT-SHOW-XYZ/i)).toBeNull()
    expect(screen.queryByText(/FEEDBACK-SHOULD-NOT-SHOW-XYZ/i)).toBeNull()
    expect(screen.queryByText(/Feedback:/)).toBeNull()
    expect(document.querySelector('.week-preview')).toBeNull()
    expect(document.querySelector('.review-preview')).toBeNull()
    const list = document.querySelector('.week-list') as HTMLElement
    expect(within(list).getByRole('link', { name: /week 1/i })).toHaveAttribute('href', '/journal/weeks/1')
    const link = within(list).getByRole('link', { name: /week 5/i })
    expect(link).toHaveAttribute('href', '/journal/weeks/5')
    expect(within(link).getByText('Completed')).toBeInTheDocument()
  })

  it('renders future weeks as locked disabled rows with no link or navigation', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 1/i })
    const list = document.querySelector('.week-list') as HTMLElement
    const locked = list.querySelector('.week-row.locked') as HTMLElement
    expect(locked).not.toBeNull()
    expect(locked.textContent).toMatch(/week 6/i)
    expect(locked.tagName).not.toBe('A')
    expect(locked.getAttribute('href')).toBeNull()
    expect(locked).toHaveAttribute('aria-disabled', 'true')
    expect(within(locked).getByText('Locked')).toBeInTheDocument()
    expect(locked.querySelector('.status-locked')).not.toBeNull()
    // Start date stays visible on the locked row.
    expect(locked.textContent).toMatch(/\d{4}-\d{2}-\d{2}/)
    // No link ever points at the locked week.
    expect(list.querySelector('a[href="/journal/weeks/6"]')).toBeNull()
    expect(linkNumbersInList()).toEqual([1, 2, 3, 4, 5])
    expect(weekNumbersInList()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('unlocks a week automatically on its start date', async () => {
    const today = getProgrammeDate(new Date(), 'UTC')
    const data = splitData()
    const week6 = data.journals[0].entries.find((entry) => entry.weekNumber === 6)!
    week6.startDate = today
    renderJournal('student-1', data)
    await screen.findByRole('link', { name: /week 6/i })
    const list = document.querySelector('.week-list') as HTMLElement
    expect(list.querySelector('.week-row.locked')).toBeNull()
    expect(within(list).getByRole('link', { name: /week 6/i })).toHaveAttribute('href', '/journal/weeks/6')
  })

  it('sorts non-consecutive weeks numerically ascending without mutating order assumptions', async () => {
    const today = getProgrammeDate(new Date(), 'UTC')
    const { monday } = getCalendarWeekRange(today)
    const entries: JournalEntry[] = [
      fixedEntry(7, addDaysUtc(monday, 14), addDaysUtc(monday, 20), 'not_started'),
      fixedEntry(1, addDaysUtc(monday, -28), addDaysUtc(monday, -22), 'draft'),
      fixedEntry(3, addDaysUtc(monday, -14), addDaysUtc(monday, -8), 'not_started'),
    ]
    const data = splitData()
    data.journals[0].entries = entries
    renderJournal('student-1', data)
    await screen.findByRole('link', { name: /week 1/i })
    expect(weekNumbersInList()).toEqual([1, 3, 7])
    expect(linkNumbersInList()).toEqual([1, 3])
    const list = document.querySelector('.week-list') as HTMLElement
    expect(list.querySelectorAll('.week-row.locked')).toHaveLength(1)
  })

  it('shows the full list with no caught-up card when every unlocked week is submitted', async () => {
    const data = caughtUpData()
    renderJournal('student-1', data)
    await screen.findAllByRole('link', { name: /week \d/i })
    expect(screen.queryByText(/you're all caught up/i)).toBeNull()
    expect(screen.queryByText(/no journals due this week/i)).toBeNull()
    for (const title of ['Current week', 'Overdue', 'Past', 'Upcoming']) {
      expect(screen.queryByRole('heading', { name: title })).toBeNull()
    }
    const expected = [...data.journals[0].entries].sort((a, b) => a.weekNumber - b.weekNumber).map((entry) => entry.weekNumber)
    // Locked future weeks render as disabled rows, so links are a subset of all rows.
    expect(weekNumbersInList()).toEqual(expected)
    expect(linkNumbersInList().length).toBeLessThanOrEqual(expected.length)
    expect(document.querySelectorAll('.week-list')).toHaveLength(1)
    expect(document.querySelector('.section-count')).toBeNull()
  })

  it('shows only the no-weeks card when the journal has no entries', async () => {
    const today = getProgrammeDate(new Date(), 'UTC')
    renderJournal('student-1', {
      version: 8,
      users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
      companies: [{ id: 'company-a', name: 'Nusantara Digital' }],
      supervisors: [],
      mentors: [],
      internships: [
        {
          id: 'placement-a',
          studentId: 'student-1',
          companyId: 'company-a',
          universityName: 'Universiti Teknologi Malaysia',
          programmeName: 'BSc Computer Science',
          programmeTimeZone: 'UTC',
          companyName: 'Nusantara Digital',
          position: 'Software Engineering Intern',
          startDate: today,
          endDate: today,
        },
      ],
      journals: [{ internshipId: 'placement-a', entries: [] }],
    })
    expect(await screen.findByText(/no journal weeks yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/you're all caught up/i)).toBeNull()
    expect(document.querySelector('.week-list')).toBeNull()
  })

  it('keeps available weeks as editable links', async () => {
    renderSplit()
    await screen.findByRole('link', { name: /week 4/i })
    const list = document.querySelector('.week-list') as HTMLElement
    expect(within(list).getByRole('link', { name: /week 4/i })).toHaveAttribute('href', '/journal/weeks/4')
  })
})

describe('JournalDashboardPage today-first journal', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  /** A single daily week spanning a past weekday through programme-local today. */
  function todayFirstData(): { data: PortalData; today: string; overdue: string } {
    const today = getProgrammeDate(new Date(), 'UTC')
    let overdue = addDaysUtc(today, -1)
    while ([0, 6].includes(new Date(`${overdue}T00:00:00Z`).getUTCDay())) {
      overdue = addDaysUtc(overdue, -1)
    }
    const data: PortalData = {
      version: 8,
      users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
      companies: [{ id: 'company-a', name: 'Nusantara Digital' }],
      supervisors: [],
      mentors: [],
      internships: [
        {
          id: 'placement-a',
          studentId: 'student-1',
          companyId: 'company-a',
          universityName: 'Universiti Teknologi Malaysia',
          programmeName: 'BSc Computer Science',
          programmeTimeZone: 'UTC',
          companyName: 'Nusantara Digital',
          position: 'Software Engineering Intern',
          startDate: overdue,
          endDate: addDaysUtc(today, 30),
        },
      ],
      journals: [{
        internshipId: 'placement-a',
        entries: [{
          id: 'week-1',
          weekNumber: 1,
          startDate: overdue,
          endDate: addDaysUtc(today, 6),
          body: '',
          status: 'not_started',
          dailyEntries: [
            { date: overdue, body: '' },
            { date: today, body: '' },
          ],
          weeklyDraft: '',
        }],
      }],
    }
    return { data, today, overdue }
  }

  it('shows a compact today log link with a single daily action', async () => {
    const { data, today } = todayFirstData()
    renderJournal('student-1', data)
    const card = await screen.findByLabelText("Today's daily log")
    expect(within(card).getByText(/today's log/i)).toBeInTheDocument()
    const links = within(card).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', `/journal/days/${today}`)
    expect(within(card).getByRole('link', { name: /today.s log/i })).toHaveAttribute('href', `/journal/days/${today}`)
    expect(within(card).queryByText(new RegExp(`TODAY · ${today}`, 'i'))).toBeNull()
    expect(within(card).queryByText(/a workday is due today/i)).toBeNull()
    expect(within(card).queryByRole('link', { name: /open week/i })).toBeNull()
    expect(screen.queryByText(/JOURNAL PROGRESS/i)).toBeNull()
  })

  it('renders the today card above the unified week list', async () => {
    const { data } = todayFirstData()
    renderJournal('student-1', data)
    const card = await screen.findByLabelText("Today's daily log")
    const list = screen.getByLabelText('Journal weeks')
    expect(list.querySelectorAll('.week-row')).toHaveLength(1)
    expect(card.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not render missing daily logs alert when days are overdue', async () => {
    const { data } = todayFirstData()
    renderJournal('student-1', data)
    await screen.findByLabelText("Today's daily log")
    expect(screen.queryByRole('alert', { name: /missing daily logs/i })).toBeNull()
  })

  it('shows Write today’s log when today is valid but has no stored entry', async () => {
    const { data, today } = todayFirstData()
    // Drop the stored today entry: today is still a valid scheduled weekday.
    data.journals[0].entries[0].dailyEntries =
      data.journals[0].entries[0].dailyEntries.filter((day) => day.date !== today)
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
    if (weekday < 1 || weekday > 5) return
    renderJournal('student-1', data)
    const card = await screen.findByLabelText("Today's daily log")
    expect(within(card).getByRole('link', { name: /write today.s log/i }))
      .toHaveAttribute('href', `/journal/days/${today}`)
  })

  it('shows Continue today’s log when today already has text', async () => {
    const { data, today } = todayFirstData()
    data.journals[0].entries[0].dailyEntries =
      data.journals[0].entries[0].dailyEntries.map((day) =>
        day.date === today ? { ...day, body: 'Started strong.' } : day,
      )
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
    if (weekday < 1 || weekday > 5) return
    renderJournal('student-1', data)
    const card = await screen.findByLabelText("Today's daily log")
    expect(within(card).getByRole('link', { name: /continue today.s log/i }))
      .toHaveAttribute('href', `/journal/days/${today}`)
  })

  it('renders nothing for today when no daily log is due', async () => {
    // A zero-weekday week requires no daily logs, so today renders nothing.
    const today = getProgrammeDate(new Date(), 'UTC')
    const saturday = addDaysUtc(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 1) % 7 || 7))
    const data: PortalData = {
      version: 8,
      users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
      companies: [{ id: 'company-a', name: 'Nusantara Digital' }],
      supervisors: [],
      mentors: [],
      internships: [
        {
          id: 'placement-a',
          studentId: 'student-1',
          companyId: 'company-a',
          universityName: 'Universiti Teknologi Malaysia',
          programmeName: 'BSc Computer Science',
          programmeTimeZone: 'UTC',
          companyName: 'Nusantara Digital',
          position: 'Software Engineering Intern',
          startDate: addDaysUtc(today, -30),
          endDate: addDaysUtc(today, 30),
        },
      ],
      journals: [{
        internshipId: 'placement-a',
        entries: [{
          id: 'week-1',
          weekNumber: 1,
          startDate: saturday,
          endDate: saturday,
          body: '',
          status: 'not_started',
          dailyEntries: [],
          weeklyDraft: '',
        }],
      }],
    }
    renderJournal('student-1', data)
    await screen.findByRole('heading', { name: 'Daily + weekly journals' })
    expect(screen.queryByLabelText("Today's daily log")).toBeNull()
    expect(screen.queryByLabelText('Today status')).toBeNull()
    expect(screen.queryByText(/no daily log due today/i)).toBeNull()
    // The unified list still renders even without a today card.
    expect(screen.getByLabelText('Journal weeks')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /week 1/i })).toHaveAttribute('href', '/journal/weeks/1')
  })
})
