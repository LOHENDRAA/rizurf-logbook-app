import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import type { PortalData } from '../types'
import { SupervisorInternPage } from './SupervisorInternPage'
import { SupervisorWeekReviewPage } from './SupervisorWeekReviewPage'

export function renderIntern(studentId: string, session = 'supervisor-1') {
  sessionStorage.clear()
  sessionStorage.setItem('portal-user', session)
  return render(
    <MemoryRouter initialEntries={[`/supervisor/interns/${studentId}`]}>
      <AppProvider repository={testRepository()}>
        <Routes>
          <Route path="/supervisor/dashboard" element={<div>Dashboard landing</div>} />
          <Route path="/supervisor/interns/:studentId" element={<SupervisorInternPage />} />
          <Route path="/supervisor/interns/:studentId/weeks/:weekNumber" element={<div>Week landing</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

export function renderWeek(studentId: string, weekNumber: number, session = 'supervisor-1', data?: PortalData) {
  sessionStorage.clear()
  sessionStorage.setItem('portal-user', session)
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={[`/supervisor/interns/${studentId}/weeks/${weekNumber}`]}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/supervisor/dashboard" element={<div>Dashboard landing</div>} />
          <Route path="/supervisor/interns/:studentId" element={<div>Intern landing</div>} />
          <Route path="/supervisor/interns/:studentId/weeks/:weekNumber" element={<SupervisorWeekReviewPage />} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

export function renderInternWithData(studentId: string, data: PortalData, session = 'supervisor-1') {
  sessionStorage.clear()
  sessionStorage.setItem('portal-user', session)
  return render(
    <MemoryRouter initialEntries={[`/supervisor/interns/${studentId}`]}>
      <AppProvider repository={testRepository({ createDemoData: () => data })}>
        <Routes>
          <Route path="/supervisor/dashboard" element={<div>Dashboard landing</div>} />
          <Route path="/supervisor/interns/:studentId" element={<SupervisorInternPage />} />
          <Route path="/supervisor/interns/:studentId/weeks/:weekNumber" element={<div>Week landing</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

/** Minimal same-company world with caller-supplied journal entries. */
export function customData(entries: PortalData['journals'][number]['entries']): PortalData {
  return {
    version: 8,
    users: [
      { id: 's9', name: 'Test Intern', email: 's9@example.edu', role: 'student', avatar: 'TI' },
      { id: 'supervisor-1', name: 'Sarah Lim', email: 'sarah.lim@nusantara.example.com', role: 'supervisor', avatar: 'SL' },
    ],
    companies: [{ id: 'company-nusantara', name: 'Nusantara Digital' }],
    supervisors: [{ userId: 'supervisor-1', companyId: 'company-nusantara' }],
    mentors: [],
    internships: [{
      id: 'placement-x', studentId: 's9', companyId: 'company-nusantara', universityName: 'U', programmeName: 'P',
      programmeTimeZone: 'UTC', companyName: 'Nusantara Digital', position: 'Intern',
      startDate: '2026-01-05', endDate: '2026-03-30',
    }],
    journals: [{ internshipId: 'placement-x', entries }],
  }
}

export function draftEntry(weekNumber: number, weeklyDraft: string): PortalData['journals'][number]['entries'][number] {
  return {
    id: `week-${weekNumber}`, weekNumber, startDate: '2026-01-05', endDate: '2026-01-11',
    body: '' as const, status: 'draft' as const, dailyEntries: [], weeklyDraft,
    weeklyDraftUpdatedAt: '2026-09-01T10:00:00.000Z',
  }
}
