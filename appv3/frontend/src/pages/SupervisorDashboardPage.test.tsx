import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import type { PortalRepository } from '../services/portalRepository'
import type { PortalData } from '../types'
import { SupervisorDashboardPage } from './SupervisorDashboardPage'

function renderDashboard(session = 'supervisor-1', repository?: PortalRepository) {
  sessionStorage.clear()
  sessionStorage.setItem('portal-user', session)
  return render(
    <MemoryRouter initialEntries={['/supervisor/dashboard']}>
      <AppProvider repository={repository ?? testRepository()}>
        <Routes>
          <Route path="/supervisor/dashboard" element={<SupervisorDashboardPage />} />
          <Route path="/supervisor/interns/:studentId" element={<div>Intern detail</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('SupervisorDashboardPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows only own-company interns with stacked review summaries', async () => {
    renderDashboard()
    expect(await screen.findByText('Aisha Rahman')).toBeInTheDocument()
    expect(screen.getByText('Maya Chen')).toBeInTheDocument()
    expect(screen.getByText('Amara Okafor')).toBeInTheDocument()
    expect(screen.queryByText('Jonas Weber')).toBeNull()
    expect(screen.queryByText('Lily Wang')).toBeNull()
    expect(screen.queryByText('Daniel Lee')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Company interns' })).toBeInTheDocument()
    // Amara lifecycle: 2 awaiting company, 2 revision required, 1 awaiting mentor.
    expect(screen.getByText('2 Awaiting company review')).toBeInTheDocument()
    expect(screen.getByText('2 Revision required')).toBeInTheDocument()
    // Only Amara has a week awaiting mentor review; Aisha's weeks are completed.
    expect(screen.getAllByText('1 Awaiting mentor review')).toHaveLength(1)
    expect(screen.getByText('2 Completed')).toBeInTheDocument()
  })

  it('orders pending-first and links each row to individual review', async () => {
    renderDashboard()
    await screen.findByText('Aisha Rahman')
    const rows = screen.getAllByRole('row').slice(1)
    // Amara has the most attention (2 pending + 2 revision + 1 mentor), then Maya, then Aisha.
    expect(within(rows[0]).getByText('Amara Okafor')).toBeInTheDocument()
    for (const row of rows) {
      expect(within(row).getByRole('link', { name: /review/i })).toBeInTheDocument()
    }
    const reviewLinks = screen.getAllByRole('link', { name: /review/i })
    expect(reviewLinks[0].getAttribute('href')).toMatch(/\/supervisor\/interns\//)
  })

  it('shows a simplified heading without eyebrow or pending summary', async () => {
    renderDashboard()
    await screen.findByText('Aisha Rahman')
    expect(screen.getByRole('heading', { name: 'Company interns' })).toBeInTheDocument()
    expect(screen.queryByText(/nusantara digital/i)).toBeNull()
    expect(screen.queryByText(/supervisor/i)).toBeNull()
    expect(screen.queryByText(/interns ·/i)).toBeNull()
    expect(screen.queryByText(/pending review/i)).toBeNull()
    expect(screen.queryByText(/waiting for review/i)).toBeNull()
  })

  it('renders a single Reviews column instead of Pending/Approved/Changes', async () => {
    renderDashboard()
    await screen.findByText('Aisha Rahman')
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toContain('Reviews')
    expect(headers).not.toContain('Pending')
    expect(headers).not.toContain('Approved')
    expect(headers).not.toContain('Changes')
  })

  it('hides zero-count statuses in each Reviews cell', async () => {
    renderDashboard()
    await screen.findByText('Aisha Rahman')
    const rows = screen.getAllByRole('row').slice(1)
    const aishaRow = rows.find((row) => within(row).queryByText('Aisha Rahman'))
    const mayaRow = rows.find((row) => within(row).queryByText('Maya Chen'))
    const amaraRow = rows.find((row) => within(row).queryByText('Amara Okafor'))
    expect(aishaRow).toBeDefined()
    expect(mayaRow).toBeDefined()
    expect(amaraRow).toBeDefined()
    // Aisha lifecycle: 2 completed, nothing else.
    expect(within(aishaRow!).getByText('2 Completed')).toBeInTheDocument()
    expect(within(aishaRow!).queryByText(/awaiting company review/i)).toBeNull()
    expect(within(aishaRow!).queryByText(/awaiting mentor review/i)).toBeNull()
    expect(within(aishaRow!).queryByText(/revision required/i)).toBeNull()
    // Maya lifecycle: only 1 awaiting company.
    expect(within(mayaRow!).getByText('1 Awaiting company review')).toBeInTheDocument()
    expect(within(mayaRow!).queryByText(/awaiting mentor review/i)).toBeNull()
    expect(within(mayaRow!).queryByText(/revision required/i)).toBeNull()
    expect(within(mayaRow!).queryByText(/completed/i)).toBeNull()
    // Amara lifecycle: awaiting company + revision + awaiting mentor, no completed.
    expect(within(amaraRow!).getByText('2 Awaiting company review')).toBeInTheDocument()
    expect(within(amaraRow!).getByText('2 Revision required')).toBeInTheDocument()
    expect(within(amaraRow!).getByText('1 Awaiting mentor review')).toBeInTheDocument()
    expect(within(amaraRow!).queryByText(/completed/i)).toBeNull()
  })

  it('shows an empty fallback when an intern has no reviews yet', async () => {
    const noReviewData: PortalData = {
      version: 8,
      users: [
        { id: 'supervisor-9', name: 'Sam Supervisor', email: 'sam@example.com', password: 'pw', role: 'supervisor', avatar: 'SS' },
        { id: 'student-9', name: 'No Review Intern', email: 'noreview@example.com', password: 'pw', role: 'student', avatar: 'NR' },
      ],
      companies: [{ id: 'company-empty', name: 'Empty Co' }],
      supervisors: [{ userId: 'supervisor-9', companyId: 'company-empty' }],
      mentors: [],
      internships: [
        {
          id: 'placement-9',
          studentId: 'student-9',
          companyId: 'company-empty',
          universityName: 'Test University',
          programmeName: 'BSc Testing',
          programmeTimeZone: 'UTC',
          companyName: 'Empty Co',
          position: 'Test Intern',
          startDate: '2026-01-05',
          endDate: '2026-03-30',
        },
      ],
      journals: [
        {
          internshipId: 'placement-9',
          entries: [
            {
              id: 'entry-9-1',
              weekNumber: 1,
              startDate: '2026-01-05',
              endDate: '2026-01-11',
              body: '',
              status: 'draft',
              dailyEntries: [],
              weeklyDraft: 'work in progress',
            },
          ],
        },
      ],
    }
    renderDashboard('supervisor-9', testRepository({ createDemoData: () => noReviewData }))
    expect(await screen.findByText('No Review Intern')).toBeInTheDocument()
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
    expect(screen.queryByText(/need review/i)).toBeNull()
    expect(screen.queryByText(/awaiting revision/i)).toBeNull()
  })

  it('renders a plain table with no search, filters, or bulk controls', async () => {
    renderDashboard()
    await screen.findByText('Aisha Rahman')
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/search interns by name/i)).toBeNull()
    expect(screen.queryByLabelText(/has pending only/i)).toBeNull()
    expect(screen.queryByLabelText(/select all/i)).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /approve pending/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /confirm approval/i })).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a neutral empty state when no interns are placed', async () => {
    const emptyData: PortalData = {
      version: 8,
      users: [
        { id: 'supervisor-9', name: 'Sam Supervisor', email: 'sam@example.com', password: 'pw', role: 'supervisor', avatar: 'SS' },
      ],
      companies: [{ id: 'company-empty', name: 'Empty Co' }],
      supervisors: [{ userId: 'supervisor-9', companyId: 'company-empty' }],
      mentors: [],
      internships: [],
      journals: [],
    }
    renderDashboard('supervisor-9', testRepository({ createDemoData: () => emptyData }))
    expect(await screen.findByRole('heading', { name: /no interns yet/i })).toBeInTheDocument()
    expect(screen.getByText('No interns are placed at your company yet.')).toBeInTheDocument()
  })
})
