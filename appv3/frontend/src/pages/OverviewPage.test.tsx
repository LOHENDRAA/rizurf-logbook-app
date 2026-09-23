import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import { addDaysUtc, getProgrammeDate } from '../domain/dates'
import { OverviewPage } from './OverviewPage'
import type { PortalData } from '../types'

function renderOverview(session = 'student-1', data?: PortalData) {
  if (session) sessionStorage.setItem('portal-user', session)
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/dashboard" element={<OverviewPage />} />
          <Route path="/journal" element={<div>Journal landing</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

function buildDailyLogData(dailyDates: string[]): PortalData {
  return {
    version: 8,
    users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
    companies: [],
    supervisors: [],
    mentors: [],
    internships: [{
      id: 'placement-1',
      studentId: 'student-1',
      companyId: 'company-1',
      universityName: 'Test University',
      programmeName: 'BSc Test',
      programmeTimeZone: 'UTC',
      companyName: 'Test Co',
      position: 'Intern',
      startDate: addDaysUtc(getProgrammeDate(new Date(), 'UTC'), -30),
      endDate: addDaysUtc(getProgrammeDate(new Date(), 'UTC'), 30),
    }],
    journals: [{
      internshipId: 'placement-1',
      entries: [{
        id: 'week-1',
        weekNumber: 1,
        startDate: addDaysUtc(getProgrammeDate(new Date(), 'UTC'), -30),
        endDate: addDaysUtc(getProgrammeDate(new Date(), 'UTC'), 30),
        body: '',
        status: 'not_started',
        dailyEntries: dailyDates.map((date) => ({ date, body: '' })),
        weeklyDraft: '',
      }],
    }],
  }
}

const noInternship: PortalData = {
  version: 8,
  users: [{ id: 'student-1', name: 'Aisha Rahman', email: 'aisha@example.edu', password: 'intern123', role: 'student', avatar: 'AR' }],
  companies: [],
  supervisors: [],
  mentors: [],
  internships: [],
  journals: [],
}

describe('OverviewPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows placement details and internship time progress', async () => {
    renderOverview()
    expect(await screen.findByText('Universiti Teknologi Malaysia')).toBeInTheDocument()
    expect(screen.getByText('Nusantara Digital')).toBeInTheDocument()
    expect(screen.getByText('Software Engineering Intern')).toBeInTheDocument()
    expect(screen.getByText(/week \d+ of 12/i)).toBeInTheDocument()
    expect(screen.getByText(/time elapsed/i)).toBeInTheDocument()
    expect(screen.getByText(/12 weeks total/i)).toBeInTheDocument()
  })

  it('does not show journal completion stats on Overview', async () => {
    renderOverview()
    await screen.findByText('Universiti Teknologi Malaysia')
    expect(screen.queryByText(/journals submitted/i)).toBeNull()
    expect(screen.queryByText(/journal progress/i)).toBeNull()
  })

  it('links to today’s dated daily log when one is due', async () => {
    const today = getProgrammeDate(new Date(), 'UTC')
    renderOverview('student-1', buildDailyLogData([today]))
    expect(await screen.findByText('Daily Log')).toBeInTheDocument()
    const link = await screen.findByRole('link', { name: /open today's log/i })
    expect(link).toHaveAttribute('href', `/journal/days/${today}`)
  })

  it('shows a disabled CTA when today is outside the schedule', async () => {
    // Today is valid only inside an owning week: schedule tomorrow onward so
    // today has no owning week, even though a stored log exists for tomorrow.
    const today = getProgrammeDate(new Date(), 'UTC')
    const tomorrow = addDaysUtc(today, 1)
    const data = buildDailyLogData([tomorrow])
    data.internships[0].startDate = tomorrow
    data.internships[0].endDate = addDaysUtc(tomorrow, 30)
    data.journals[0].entries[0].startDate = tomorrow
    data.journals[0].entries[0].endDate = addDaysUtc(tomorrow, 6)
    renderOverview('student-1', data)
    expect(await screen.findByText('Daily Log')).toBeInTheDocument()
    const button = await screen.findByRole('button', { name: /no log due today/i })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('link', { name: /open today's log/i })).toBeNull()
    expect(document.querySelector('a[href^="/journal/days/"]')).toBeNull()
  })

  it('links to today when it is a valid scheduled weekday even with no stored entry', async () => {
    const today = getProgrammeDate(new Date(), 'UTC')
    renderOverview('student-1', buildDailyLogData([]))
    // Empty stored entries but today in range: link is enabled unless today
    // itself is a weekend.
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
    if (weekday >= 1 && weekday <= 5) {
      const link = await screen.findByRole('link', { name: /open today's log/i })
      expect(link).toHaveAttribute('href', `/journal/days/${today}`)
    } else {
      expect(await screen.findByRole('button', { name: /no log due today/i })).toBeDisabled()
    }
  })

  it('shows a disabled CTA when there are no journal weeks covering today', async () => {
    const data = buildDailyLogData([])
    data.journals[0].entries = []
    renderOverview('student-1', data)
    const button = await screen.findByRole('button', { name: /no log due today/i })
    expect(button).toBeDisabled()
    expect(document.querySelector('a[href^="/journal/days/"]')).toBeNull()
  })

  it('shows a no-active-internship empty state instead of crashing', async () => {
    renderOverview('student-1', noInternship)
    expect(await screen.findByText(/no active internship/i)).toBeInTheDocument()
  })
})
