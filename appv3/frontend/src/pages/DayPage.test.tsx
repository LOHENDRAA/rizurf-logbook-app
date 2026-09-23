import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import { createDemoData } from '../services/mockPortalRepository'
import { formatWeekdayName, getProgrammeDate } from '../domain/dates'
import type { PortalData } from '../types'
import { DayPage, DAILY_LOCKED_MESSAGE, INVALID_DAILY_DATE_MESSAGE, NO_DAILY_FOR_DATE_MESSAGE, WEEKDAY_ONLY_MESSAGE } from './DayPage'

function renderDay(date: string, session = 'student-1', data?: PortalData) {
  sessionStorage.setItem('portal-user', session)
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={[`/journal/days/${date}`]}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/journal" element={<div>Journal landing</div>} />
          <Route path="/journal/days/:date" element={<DayPage />} />
          <Route path="/journal/weeks/:weekNumber" element={<div>Week editor</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

/** Test-only browser-Back button (drives the same router history). */
function BackProbe() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Test browser back</button>
}

/** Records every visited pathname so push (vs replace) navigation is observable. */
function LocationProbe({ onLocation }: { onLocation: (path: string) => void }) {
  const location = useLocation()
  useEffect(() => {
    onLocation(location.pathname)
  }, [location.pathname, onLocation])
  return null
}

/** MemoryRouter-backed render tracking the location trail for navigation assertions. */
function renderDayWithRouter(startDate: string, data: PortalData, session = 'student-1') {
  sessionStorage.setItem('portal-user', session)
  const repository = testRepository({ createDemoData: () => data })
  const locations: string[] = []
  render(
    <MemoryRouter initialEntries={[`/journal/days/${startDate}`]}>
      <AppProvider repository={repository}>
        <LocationProbe onLocation={(path) => { locations.push(path) }} />
        <Routes>
          <Route path="/journal" element={<div>Journal landing</div>} />
          <Route path="/journal/days/:date" element={<><DayPage /><BackProbe /></>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
  return { locations }
}

/** Stub native validation (jsdom may lack reportValidity) and observe calls. */
function stubValidity(input: HTMLInputElement) {
  const setCustomValidity = vi.spyOn(input, 'setCustomValidity')
  const reportValidity = vi.fn(() => true)
  Object.defineProperty(input, 'reportValidity', { value: reportValidity, configurable: true })
  return { setCustomValidity, reportValidity }
}

/** Ended daily dates from an unsubmitted daily week (placement-a week 3 is fully past). */
function endedDate(): string {
  const data = createDemoData(new Date())
  const placement = data.internships.find((item) => item.id === 'placement-a')!
  const today = getProgrammeDate(new Date(), placement.programmeTimeZone)
  const journal = data.journals.find((item) => item.internshipId === 'placement-a')!
  const date = journal.entries
    .filter((entry) => entry.status !== 'submitted')
    .flatMap((entry) => entry.dailyEntries ?? [])
    .map((day) => day.date)
    .find((d) => d < today)!
  return date
}

/** Ended daily dates from an unsubmitted daily week in the given data snapshot. */
function endedDates(data: PortalData): string[] {
  const placement = data.internships.find((item) => item.id === 'placement-a')!
  const today = getProgrammeDate(new Date(), placement.programmeTimeZone)
  const journal = data.journals.find((item) => item.internshipId === 'placement-a')!
  return journal.entries
    .filter((entry) => entry.status !== 'submitted')
    .flatMap((entry) => entry.dailyEntries ?? [])
    .map((day) => day.date)
    .filter((d) => d < today)
}

function futureDate(): string {
  const data = createDemoData(new Date())
  const placement = data.internships.find((item) => item.id === 'placement-a')!
  const today = getProgrammeDate(new Date(), placement.programmeTimeZone)
  const journal = data.journals.find((item) => item.internshipId === 'placement-a')!
  return journal.entries
    .flatMap((entry) => entry.dailyEntries ?? [])
    .map((day) => day.date)
    .find((d) => d > today)!
}

function baseWeek(overrides: Record<string, unknown> = {}) {
  return {
    id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18',
    body: '', status: 'submitted',
    dailyEntries: [
      { date: '2026-01-12', body: 'Logged work.' },
      { date: '2026-01-13', body: '' },
    ],
    weeklyDraft: 'Weekly summary text.',
    submittedBody: 'Submitted weekly text.',
    submittedAt: '2026-01-19T10:00:00.000Z',
    review: { status: 'pending' },
    ...overrides,
  }
}

function journalData(entry: Record<string, unknown>): PortalData {
  return {
    version: 8,
    users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
    companies: [{ id: 'c1', name: 'Test Co' }],
    supervisors: [],
    mentors: [],
    internships: [{
      id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
      programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
      startDate: '2026-01-12', endDate: '2026-01-18',
    }],
    journals: [{
      internshipId: 'p1',
      entries: [entry as unknown as PortalData['journals'][number]['entries'][number]],
    }],
  } as unknown as PortalData
}

/** A submitted daily week: daily logs must render read-only. */
function submittedData(): PortalData {
  return journalData(baseWeek())
}

function approvedData(): PortalData {
  return journalData(baseWeek({ review: { status: 'approved', reviewedBy: 'Sup', reviewedAt: '2026-01-20T10:00:00.000Z' } }))
}

describe('DayPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders heading with only "Daily Log" and a stacked Date field above the editor', async () => {
    // AC: heading shows "Daily Log" title with the weekday subtitle, no ISO text.
    const date = endedDate()
    const expectedWeekday = formatWeekdayName(date)
    const { container } = renderDay(date)
    const textarea = await screen.findByLabelText(`Daily log for ${date}`)
    expect(screen.getByRole('heading', { level: 1, name: 'Daily Log' })).toBeInTheDocument()
    // Weekday subtitle renders directly below the H1 via the PageHeading description slot.
    expect(screen.getByText(expectedWeekday)).toBeInTheDocument()
    expect(container.querySelector('.page-heading p')).toHaveTextContent(expectedWeekday)
    // No eyebrow element rendered.
    expect(container.querySelector('.eyebrow')).toBeNull()
    expect(screen.queryByText('DAILY LOG')).toBeNull()
    // No ISO date visible anywhere (aria-labels and input values are not visible text).
    const visibleText = (container.textContent ?? '').replace(/\s+/g, ' ')
    expect(visibleText).not.toContain(date)
    // AC: stacked Date label + native date input directly above the textarea.
    const dateInput = screen.getByLabelText('Date')
    expect(dateInput).toHaveAttribute('type', 'date')
    expect(dateInput).toHaveValue(date)
    expect(dateInput.closest('label')).toHaveClass('simple-field', 'day-date-field')
    expect(dateInput.closest('label')?.textContent).toMatch(/Date:/)
    expect(dateInput.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dateInput.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeFalsy()
    // "Back" (to the owning week) is the sole navigation link.
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', expect.stringMatching(/^\/journal\/weeks\/\d+$/))
  })

  it('links Back to the owning journal week', async () => {
    // Fixture week: weekNumber 2 covers 2026-01-12 … 2026-01-18.
    renderDay('2026-01-12', 's1', submittedData())
    const textarea = await screen.findByLabelText('Daily log for 2026-01-12')
    expect(textarea).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/journal/weeks/2')
  })

  it('maps different days to their correct owning week href', async () => {
    // Two-week fixture: week 2 (2026-01-12 … 2026-01-18) and week 3
    // (2026-01-19 … 2026-01-25). Each day links back to its own week.
    const twoWeeks: PortalData = {
      version: 8,
      users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: '2026-01-12', endDate: '2026-01-25',
      }],
      journals: [{
        internshipId: 'p1',
        entries: [
          { ...baseWeek(), id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18' },
          {
            id: 'week-3', weekNumber: 3, startDate: '2026-01-19', endDate: '2026-01-25',
            body: '', status: 'not_started',
            dailyEntries: [{ date: '2026-01-19', body: '' }],
            weeklyDraft: '',
          },
        ],
      }],
    } as unknown as PortalData
    renderDay('2026-01-19', 's1', twoWeeks)
    expect(await screen.findByLabelText('Daily log for 2026-01-19')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/journal/weeks/3')
    cleanup()
    renderDay('2026-01-13', 's1', twoWeeks)
    expect(await screen.findByLabelText('Daily log for 2026-01-13')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/journal/weeks/2')
  })

  it('renders no daily badge with only the Save action', async () => {
    const date = endedDate()
    const { container } = renderDay(date)
    const textarea = await screen.findByLabelText(`Daily log for ${date}`)
    expect(textarea).toBeEnabled()
    expect(textarea).toHaveValue('')
    expect(textarea).not.toHaveAttribute('placeholder')
    // No daily Draft/Complete badge anywhere.
    expect(document.querySelectorAll('.status')).toHaveLength(0)
    expect(screen.queryByText('Draft')).toBeNull()
    expect(screen.queryByText('Complete')).toBeNull()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    // Actions are right-aligned via the DayPage-scoped class.
    expect(container.querySelector('.editor-actions.day-actions')).not.toBeNull()
    // Removed helper copy is gone.
    expect(screen.queryByText(/informational/i)).toBeNull()
    expect(screen.queryByText(/last saved|not saved yet/i)).toBeNull()
    expect(screen.queryByText(/weekly report/i)).toBeNull()
  })

  it('autosaves typing and forces an immediate save with no message, including empty text', async () => {
    const date = endedDate()
    renderDay(date)
    const textarea = await screen.findByLabelText(`Daily log for ${date}`)
    fireEvent.change(textarea, { target: { value: 'Short note.' } })
    expect(textarea).toHaveValue('Short note.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // No badge, no popup, no success/error message.
    expect(document.querySelectorAll('.status')).toHaveLength(0)
    expect(screen.queryByText(/marked complete/i)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(textarea).toHaveValue('Short note.')
    // Clearing the text also saves with no message.
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(textarea).toHaveValue('')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('locks future days: direct URLs redirect back to the journal', async () => {
    const date = futureDate()
    renderDay(date)
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps daily logs editable after the weekly report is submitted', async () => {
    renderDay('2026-01-12', 's1', submittedData())
    const textarea = await screen.findByLabelText('Daily log for 2026-01-12')
    expect(textarea).toBeEnabled()
    expect(textarea).toHaveValue('Logged work.')
    expect(screen.queryByText(/read-only after submission/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('keeps daily logs editable for approved weeks', async () => {
    renderDay('2026-01-12', 's1', approvedData())
    const textarea = await screen.findByLabelText('Daily log for 2026-01-12')
    expect(textarea).toBeEnabled()
    expect(textarea).toHaveValue('Logged work.')
    expect(screen.queryByText(/read-only after submission/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('navigates immediately to an existing daily log on valid date selection', async () => {
    // AC: selecting a valid existing daily entry date navigates to /journal/days/:date.
    const data = createDemoData(new Date())
    const [from, to] = endedDates(data)
    const { locations } = renderDayWithRouter(from, data)
    await screen.findByLabelText(`Daily log for ${from}`)
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    expect(dateInput).toHaveValue(from)
    fireEvent.change(dateInput, { target: { value: to } })
    const nextTextarea = await screen.findByLabelText(`Daily log for ${to}`)
    expect(nextTextarea).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue(to)
    expect(locations.at(-1)).toBe(`/journal/days/${to}`)
  })

  it('navigates to a valid date whose body is empty', async () => {
    // AC/edge: empty-body valid dates navigate OK (validity is entry existence).
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-01-13' } })
    const nextTextarea = await screen.findByLabelText('Daily log for 2026-01-13')
    expect(nextTextarea).toHaveValue('')
    expect(locations.at(-1)).toBe('/journal/days/2026-01-13')
  })

  it('pushes history so Back returns through prior logs', async () => {
    // AC: valid navigation uses history push (Back button returns through prior logs).
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-01-13' } })
    await screen.findByLabelText('Daily log for 2026-01-13')
    expect(locations.at(-1)).toBe('/journal/days/2026-01-13')
    // Browser Back returns through the pushed entry to the prior log.
    fireEvent.click(screen.getByRole('button', { name: 'Test browser back' }))
    const backTextarea = await screen.findByLabelText('Daily log for 2026-01-12')
    expect(backTextarea).toHaveValue('Logged work.')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
    // Push (not replace): the trail keeps both entries, ending back at the start.
    expect(locations).toEqual([
      '/journal/days/2026-01-12',
      '/journal/days/2026-01-13',
      '/journal/days/2026-01-12',
    ])
  })

  it('rejects a weekend date with the Monday–Friday message, staying put and restoring', async () => {
    // AC/edge: weekend date -> native popup, no navigation, value restored.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // 2026-01-11 is a Sunday with no daily entry.
    fireEvent.change(dateInput, { target: { value: '2026-01-11' } })
    expect(setCustomValidity).toHaveBeenCalledWith(WEEKDAY_ONLY_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    // Custom validity stays set (clears on next input, not synchronously).
    expect(setCustomValidity).not.toHaveBeenCalledWith('')
    // Inline alert makes the reason visible even if the native popup is missed.
    expect(screen.getByRole('alert')).toHaveTextContent(WEEKDAY_ONLY_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(dateInput).toHaveValue('2026-01-12')
    expect(await screen.findByLabelText('Daily log for 2026-01-12')).toBeInTheDocument()
    expect(screen.queryByLabelText('Daily log for 2026-01-11')).toBeNull()
  })

  it('rejects a future in-schedule date with the locked message and no navigation', async () => {
    // Week starting Monday 2026-01-12, ending Sunday 2026-01-18: from the
    // real programme today (2026) every in-range weekday is past, so build a
    // fixture around the real today with a future weekday in range.
    const { getProgrammeDate, addDaysUtc } = await import('../domain/dates')
    const { weekdaysInWeek } = await import('../domain/daily')
    const today = getProgrammeDate(new Date(), 'UTC')
    const start = addDaysUtc(today, -6)
    const end = addDaysUtc(today, 6)
    const required = weekdaysInWeek(start, end)
    const past = required.filter((d) => d <= today)
    const future = required.filter((d) => d > today)
    if (past.length === 0 || future.length === 0) return
    const data: PortalData = {
      version: 8,
      users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: start, endDate: end,
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-1', weekNumber: 1, startDate: start, endDate: end,
          body: '', status: 'not_started',
          dailyEntries: past.map((d) => ({ date: d, body: '' })),
          weeklyDraft: '',
        }],
      }],
    }
    const { locations } = renderDayWithRouter(past[0], data, 's1')
    await screen.findByLabelText(`Daily log for ${past[0]}`)
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    fireEvent.change(dateInput, { target: { value: future[0] } })
    expect(setCustomValidity).toHaveBeenCalledWith(DAILY_LOCKED_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(DAILY_LOCKED_MESSAGE)
    expect(locations).toEqual([`/journal/days/${past[0]}`])
    expect(dateInput).toHaveValue(past[0])
  })

  it('rejects an out-of-schedule date with the outside-schedule message', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // 2026-02-04 is a Wednesday outside the single-week fixture range.
    fireEvent.change(dateInput, { target: { value: '2026-02-04' } })
    expect(setCustomValidity).toHaveBeenCalledWith(NO_DAILY_FOR_DATE_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(NO_DAILY_FOR_DATE_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(dateInput).toHaveValue('2026-01-12')
  })

  it('treats a malformed date string as incomplete on change, invalid on blur', async () => {
    // Native date inputs sanitize unparseable text to an empty string, so a
    // malformed pick arrives as empty: silent on change, INVALID on blur.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    fireEvent.change(dateInput, { target: { value: 'not-a-date' } })
    // Sanitized to empty by the native control: silent, no popup, no alert.
    expect(reportValidity).not.toHaveBeenCalled()
    expect(setCustomValidity).not.toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    fireEvent.blur(dateInput, { target: { value: '' } })
    expect(setCustomValidity).toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_DAILY_DATE_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    // Rejection remounts the field, declaratively restoring the route date.
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
  })

  it('stays silent while typing an incomplete date, then errors on blur', async () => {
    // AC: native date inputs expose partial input as an empty string, so an
    // empty onChange must not validate, alert, restore, or navigate.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(setCustomValidity).not.toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    // The draft holds the in-progress empty text so typing is not clobbered
    // by the controlled route value; typing can continue silently.
    expect(dateInput).toHaveValue('')
    // Leaving the field empty surfaces the invalid-date message + restores.
    fireEvent.blur(dateInput, { target: { value: '' } })
    expect(setCustomValidity).toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_DAILY_DATE_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    // Rejection remounts the field, declaratively restoring the route date.
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
    expect(await screen.findByLabelText('Daily log for 2026-01-12')).toBeInTheDocument()
  })

  it('does not error on blur when the field holds a complete date', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { reportValidity } = stubValidity(dateInput)
    fireEvent.blur(dateInput)
    expect(reportValidity).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(dateInput).toHaveValue('2026-01-12')
  })

  it('clears the inline alert after a subsequent valid selection', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    stubValidity(dateInput)
    // Reject first: the alert appears and navigation stays put.
    fireEvent.change(dateInput, { target: { value: '2026-01-11' } })
    expect(screen.getByRole('alert')).toHaveTextContent(WEEKDAY_ONLY_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    // A valid pick navigates and clears the alert.
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-01-13' } })
    expect(await screen.findByLabelText('Daily log for 2026-01-13')).toBeInTheDocument()
    expect(locations.at(-1)).toBe('/journal/days/2026-01-13')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sets min/max to the overall available window', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    void locations
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    // Single-week fixture Mon 2026-01-12 … Fri 2026-01-16, all <= today.
    expect(dateInput).toHaveAttribute('min', '2026-01-12')
    expect(dateInput).toHaveAttribute('max', '2026-01-16')
  })

  it('opens a valid missing weekday as an empty editor and creates it on first edit', async () => {
    // Sparse stored entries: 2026-01-13 is a valid in-range weekday with no
    // record yet. Direct URL renders an empty editor; typing creates it.
    const sparse: PortalData = {
      version: 8,
      users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: '2026-01-12', endDate: '2026-01-18',
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18',
          body: '', status: 'not_started',
          dailyEntries: [{ date: '2026-01-12', body: 'Logged work.' }],
          weeklyDraft: '',
        }],
      }],
    }
    const { locations } = renderDayWithRouter('2026-01-13', sparse, 's1')
    const textarea = await screen.findByLabelText('Daily log for 2026-01-13')
    expect(textarea).toHaveValue('')
    expect(locations).toEqual(['/journal/days/2026-01-13'])
    // Picker navigation to the missing date also works (fresh mount: the
    // first render stays mounted in this jsdom test).
    cleanup()
    const { locations: trail } = renderDayWithRouter('2026-01-12', sparse, 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-01-13' } })
    const next = await screen.findByLabelText('Daily log for 2026-01-13')
    expect(next).toHaveValue('')
    expect(trail.at(-1)).toBe('/journal/days/2026-01-13')
    // First edit creates the entry with sorted persistence.
    fireEvent.change(next, { target: { value: 'First words.' } })
    expect(next).toHaveValue('First words.')
  })

  it('redirects invalid direct URLs (future/outside) back to the journal', async () => {
    renderDay('2099-01-05', 's1', submittedData())
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders no prev/next day navigation', async () => {
    const date = endedDate()
    const { container } = renderDay(date)
    await screen.findByLabelText(`Daily log for ${date}`)
    expect(screen.queryByRole('link', { name: 'Previous day' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Next day' })).toBeNull()
    expect(container.querySelector('.day-nav')).toBeNull()
    expect(container.querySelector('.week-nav')).toBeNull()
  })

  it('keeps DayPage-scoped right-alignment rules across mobile breakpoints', () => {
    // Static CSS assertion: jsdom cannot measure layout, so verify the scoped
    // mobile overrides exist and plain WeekPage rules are untouched.
    const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')
    expect(css).toContain('.editor-actions.day-actions { justify-content: flex-end; }')
    expect(css).toContain('.editor-actions.day-actions { align-items: flex-end; }')
    expect(css).toContain('.editor-actions.day-actions > div { display: flex; justify-content: flex-end; }')
    expect(css).toContain('.simple-sheet .editor-actions.day-actions > div { display: flex; justify-content: flex-end; }')
  })

  it('keeps the Date field stacked with a compact left-aligned input', () => {
    // Static CSS assertion for the stacked Date label above the textarea.
    // jsdom cannot measure layout: verify stacking plus the compact override
    // that beats the global full-width input rule.
    const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')
    expect(css).toContain('.simple-field { display: grid; gap: 6px; }')
    expect(css).toContain('.day-date-field { text-align: start; }')
    expect(css).toContain(".day-date-field input[type='date'] { width: auto; max-width: 100%; justify-self: start; }")
  })

  it('redirects a day whose owning week is locked back to the journal', async () => {
    // Locked week starting tomorrow: its days exist but are not yet reachable.
    const { getProgrammeDate, addDaysUtc } = await import('../domain/dates')
    const today = getProgrammeDate(new Date(), 'UTC')
    const start = addDaysUtc(today, 1)
    const data: PortalData = {
      version: 8,
      users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: start, endDate: addDaysUtc(start, 6),
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-9', weekNumber: 9, startDate: start, endDate: addDaysUtc(start, 6),
          body: '', status: 'not_started',
          dailyEntries: [{ date: addDaysUtc(start, 1), body: '' }],
          weeklyDraft: '',
        }],
      }],
    }
    renderDay(addDaysUtc(start, 1), 's1', data)
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps a day accessible on its week start date boundary', async () => {
    const { getProgrammeDate } = await import('../domain/dates')
    const today = getProgrammeDate(new Date(), 'UTC')
    const data: PortalData = {
      version: 8,
      users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: today, endDate: today,
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-1', weekNumber: 1, startDate: today, endDate: today,
          body: '', status: 'not_started',
          dailyEntries: [{ date: today, body: '' }],
          weeklyDraft: '',
        }],
      }],
    }
    renderDay(today, 's1', data)
    expect(await screen.findByLabelText(`Daily log for ${today}`)).toBeInTheDocument()
  })

  it('redirects invalid or non-required dates back to the journal', async () => {
    renderDay('not-a-date')
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('redirects weekend dates with no required log back to the journal', async () => {
    // 2026-09-12 is a Saturday: never a required workday.
    renderDay('2026-09-12')
    expect(await screen.findByText('Journal landing')).toBeInTheDocument()
  })

  it('defers keyboard segment edits: complete-looking ISO never validates mid-typing (req: no mid-edit validation/nav)', async () => {
    // AC: typing day then month without Enter/blur causes zero validation UI,
    // zero navigation, editable field retained — even when the browser exposes
    // a technically complete ISO date after changing only one segment.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // First segment keystroke: day 12 -> 13 (complete ISO, valid weekday).
    fireEvent.keyDown(dateInput, { key: 'ArrowUp' })
    fireEvent.change(dateInput, { target: { value: '2026-01-13' } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(setCustomValidity).not.toHaveBeenCalledWith(WEEKDAY_ONLY_MESSAGE)
    expect(setCustomValidity).not.toHaveBeenCalledWith(DAILY_LOCKED_MESSAGE)
    expect(setCustomValidity).not.toHaveBeenCalledWith(NO_DAILY_FOR_DATE_MESSAGE)
    expect(setCustomValidity).not.toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    // Draft retained: the field shows the typed date, not the route date.
    expect(dateInput).toHaveValue('2026-01-13')
    expect(await screen.findByLabelText('Daily log for 2026-01-12')).toBeInTheDocument()
    expect(screen.queryByLabelText('Daily log for 2026-01-13')).toBeNull()
    // Second segment keystroke: month change across multiple keystrokes still
    // defers — a single commit happens only at Enter/blur.
    fireEvent.keyDown(dateInput, { key: 'ArrowDown' })
    fireEvent.change(dateInput, { target: { value: '2026-01-14' } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(dateInput).toHaveValue('2026-01-14')
  })

  it('commits a valid typed date on Enter and navigates (req: Enter commits valid)', async () => {
    // AC: Enter after full valid typing navigates to the next log and clears.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    stubValidity(dateInput)
    fireEvent.keyDown(dateInput, { key: '1' })
    fireEvent.change(dateInput, { target: { value: '2026-01-13' } })
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    fireEvent.keyDown(dateInput, { key: 'Enter' })
    const nextTextarea = await screen.findByLabelText('Daily log for 2026-01-13')
    expect(nextTextarea).toBeInTheDocument()
    expect(locations.at(-1)).toBe('/journal/days/2026-01-13')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('commits a valid typed date on blur and navigates (req: blur commits valid)', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    stubValidity(dateInput)
    fireEvent.keyDown(dateInput, { key: 'ArrowUp' })
    fireEvent.change(dateInput, { target: { value: '2026-01-13' } })
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    fireEvent.blur(dateInput)
    const nextTextarea = await screen.findByLabelText('Daily log for 2026-01-13')
    expect(nextTextarea).toBeInTheDocument()
    expect(locations.at(-1)).toBe('/journal/days/2026-01-13')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects Enter on an empty typed draft with INVALID + restore + no nav (req: Enter on incomplete)', async () => {
    // AC: Enter on incomplete restores the current date with invalid-date error.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    fireEvent.keyDown(dateInput, { key: 'Backspace' })
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.keyDown(dateInput, { key: 'Enter' })
    expect(setCustomValidity).toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_DAILY_DATE_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
  })

  it('rejects Enter on a malformed typed draft with INVALID + restore + no nav (req: Enter on malformed)', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // Native control sanitizes unparseable text to '': silent mid-typing.
    fireEvent.keyDown(dateInput, { key: 'x' })
    fireEvent.change(dateInput, { target: { value: 'not-a-date' } })
    expect(reportValidity).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByLabelText('Date'), { key: 'Enter' })
    expect(setCustomValidity).toHaveBeenCalledWith(INVALID_DAILY_DATE_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_DAILY_DATE_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
  })

  it('preserves the weekend message when a typed weekend date commits on Enter (req: specific errors)', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // 2026-01-11 is a Sunday: complete but disallowed — silent until commit.
    fireEvent.keyDown(dateInput, { key: '1' })
    fireEvent.change(dateInput, { target: { value: '2026-01-11' } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    fireEvent.keyDown(dateInput, { key: 'Enter' })
    expect(setCustomValidity).toHaveBeenCalledWith(WEEKDAY_ONLY_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(WEEKDAY_ONLY_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
  })

  it('preserves the outside-schedule message when a typed out-of-range date commits on blur (req: specific errors)', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // 2026-02-04 is a Wednesday outside the single-week fixture range.
    fireEvent.keyDown(dateInput, { key: '2' })
    fireEvent.change(dateInput, { target: { value: '2026-02-04' } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.blur(dateInput)
    expect(setCustomValidity).toHaveBeenCalledWith(NO_DAILY_FOR_DATE_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(NO_DAILY_FOR_DATE_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-12')
  })

  it('preserves the locked message when a typed future date commits on Enter (req: specific errors)', async () => {
    // Fixture around the real programme today with a future in-range weekday.
    const { getProgrammeDate, addDaysUtc } = await import('../domain/dates')
    const { weekdaysInWeek } = await import('../domain/daily')
    const today = getProgrammeDate(new Date(), 'UTC')
    const start = addDaysUtc(today, -6)
    const end = addDaysUtc(today, 6)
    const required = weekdaysInWeek(start, end)
    const past = required.filter((d) => d <= today)
    const future = required.filter((d) => d > today)
    if (past.length === 0 || future.length === 0) return
    const data: PortalData = {
      version: 8,
      users: [{ id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' }],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: start, endDate: end,
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-1', weekNumber: 1, startDate: start, endDate: end,
          body: '', status: 'not_started',
          dailyEntries: past.map((d) => ({ date: d, body: '' })),
          weeklyDraft: '',
        }],
      }],
    }
    const { locations } = renderDayWithRouter(past[0], data, 's1')
    await screen.findByLabelText(`Daily log for ${past[0]}`)
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    fireEvent.keyDown(dateInput, { key: 'ArrowUp' })
    fireEvent.change(dateInput, { target: { value: future[0] } })
    expect(reportValidity).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.keyDown(dateInput, { key: 'Enter' })
    expect(setCustomValidity).toHaveBeenCalledWith(DAILY_LOCKED_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(DAILY_LOCKED_MESSAGE)
    expect(locations).toEqual([`/journal/days/${past[0]}`])
    expect(dateInput).toHaveValue(past[0])
  })

  it('applies a calendar-picker selection immediately without Enter/blur (req: picker immediacy)', async () => {
    // AC: picker valid selection navigates immediately. A picker pick fires
    // change with no preceding keydown, so the keyboard flag stays clear and
    // the change commits at once.
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    stubValidity(dateInput)
    fireEvent.change(dateInput, { target: { value: '2026-01-13' } })
    const nextTextarea = await screen.findByLabelText('Daily log for 2026-01-13')
    expect(nextTextarea).toBeInTheDocument()
    expect(locations.at(-1)).toBe('/journal/days/2026-01-13')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects a picker weekend selection immediately without Enter/blur (req: picker immediacy)', async () => {
    const { locations } = renderDayWithRouter('2026-01-12', submittedData(), 's1')
    await screen.findByLabelText('Daily log for 2026-01-12')
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    const { setCustomValidity, reportValidity } = stubValidity(dateInput)
    // No keydown: this is the picker path, so rejection is immediate.
    fireEvent.change(dateInput, { target: { value: '2026-01-11' } })
    expect(setCustomValidity).toHaveBeenCalledWith(WEEKDAY_ONLY_MESSAGE)
    expect(reportValidity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(WEEKDAY_ONLY_MESSAGE)
    expect(locations).toEqual(['/journal/days/2026-01-12'])
    expect(dateInput).toHaveValue('2026-01-12')
  })
})
