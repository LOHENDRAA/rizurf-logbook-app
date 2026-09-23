import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import type { PortalData } from '../types'
import { MentorInternPage } from './MentorInternPage'
import { MentorWeekReviewPage } from './MentorWeekReviewPage'

type WeekEntry = PortalData['journals'][number]['entries'][number]

function submitted(weekNumber: number, extra: Partial<WeekEntry> = {}): WeekEntry {
  return {
    id: `week-${weekNumber}`,
    weekNumber,
    startDate: '2026-01-05',
    endDate: '2026-01-11',
    body: '',
    status: 'submitted',
    dailyEntries: [],
    weeklyDraft: 'A detailed weekly report with enough words for review purposes here.',
    submittedBody: 'A detailed weekly report with enough words for review purposes here.',
    submittedAt: '2026-09-01T10:00:00.000Z',
    ...extra,
  }
}

/** Mentor world: company-approved, mentor-revision, post-resubmit, hidden, completed. */
function mentorData(): PortalData {
  return {
    version: 8,
    users: [
      { id: 's9', name: 'Test Intern', email: 's9@example.edu', password: 'pw', role: 'student', avatar: 'TI' },
      { id: 'mentor-1', name: 'Maya Mentor', email: 'm@example.edu', password: 'pw', role: 'university_mentor', avatar: 'MM' },
    ],
    companies: [{ id: 'company-nusantara', name: 'Nusantara Digital' }],
    supervisors: [],
    mentors: [{ userId: 'mentor-1', studentIds: ['s9'] }],
    internships: [{
      id: 'placement-x', studentId: 's9', companyId: 'company-nusantara', universityName: 'U', programmeName: 'P',
      programmeTimeZone: 'UTC', companyName: 'Nusantara Digital', position: 'Intern',
      startDate: '2026-01-05', endDate: '2026-03-30',
    }],
    journals: [{
      internshipId: 'placement-x',
      entries: [
        submitted(1, { review: { status: 'approved' }, mentorReview: { status: 'pending' } }),
        submitted(2, {
          review: { status: 'approved' },
          mentorReview: { status: 'changes_requested', feedback: 'Add mentor-requested detail.', reviewedBy: 'Maya Mentor' },
        }),
        submitted(3, {
          review: { status: 'pending' },
          mentorReview: { status: 'changes_requested', feedback: 'Add mentor-requested detail.', reviewedBy: 'Maya Mentor' },
        }),
        submitted(4, { review: { status: 'pending' } }),
        submitted(5, { review: { status: 'approved' }, mentorReview: { status: 'approved' } }),
      ],
    }],
  }
}

function renderMentor(path: string, data?: PortalData) {
  sessionStorage.clear()
  sessionStorage.setItem('portal-user', 'mentor-1')
  const repository = data ? testRepository({ createDemoData: () => data }) : testRepository()
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider repository={repository}>
        <Routes>
          <Route path="/mentor/dashboard" element={<div>Dashboard landing</div>} />
          <Route path="/mentor/interns/:studentId" element={<MentorInternPage />} />
          <Route path="/mentor/interns/:studentId/weeks/:weekNumber" element={<MentorWeekReviewPage />} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('MentorInternPage lifecycle badges', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows one lifecycle badge per visible week and hides pre-approval weeks', async () => {
    renderMentor('/mentor/interns/s9', mentorData())
    expect(await screen.findByText('Test Intern')).toBeInTheDocument()
    const rows = screen.getAllByRole('link', { name: /week \d/i })
    expect(rows).toHaveLength(4)
    const labels = ['Awaiting mentor review', 'Revision required', 'Awaiting company review', 'Completed']
    rows.forEach((row, index) => {
      expect(within(row).getByText(labels[index])).toBeInTheDocument()
      expect(row.querySelectorAll('.status')).toHaveLength(1)
    })
    // First-pass company-pending week without mentor history stays hidden.
    expect(screen.queryByRole('link', { name: /week 4/i })).toBeNull()
    expect(screen.queryByText(/^approved$/i)).toBeNull()
    expect(screen.queryByText(/^pending$/i)).toBeNull()
  })

  it('flags mentor-touched weeks waiting for company re-review without extra badges', async () => {
    renderMentor('/mentor/interns/s9', mentorData())
    await screen.findByText('Test Intern')
    const row = screen.getByRole('link', { name: /week 3/i })
    expect(within(row).getByText('Awaiting company review')).toBeInTheDocument()
    expect(within(row).getByText(/waiting for company re-review/i)).toBeInTheDocument()
    expect(row.querySelectorAll('.status')).toHaveLength(1)
  })
})

describe('MentorWeekReviewPage lifecycle badges', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows a single revision badge with attributed feedback on mentor changes-requested weeks', async () => {
    renderMentor('/mentor/interns/s9/weeks/2', mentorData())
    await screen.findByText(/submitted weekly report/i)
    expect(screen.getByText('Revision required')).toBeInTheDocument()
    expect(document.querySelectorAll('.review-badges .status')).toHaveLength(1)
    // Reviewer actions and attributed feedback stay visible; no stage badges leak.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByText('Add mentor-requested detail.')).toBeInTheDocument()
    expect(screen.queryByText(/^approved$/i)).toBeNull()
  })

  it('shows a single awaiting-company badge read-only on post-resubmit weeks', async () => {
    renderMentor('/mentor/interns/s9/weeks/3', mentorData())
    await screen.findByText(/submitted weekly report/i)
    expect(screen.getByText('Awaiting company review')).toBeInTheDocument()
    expect(document.querySelectorAll('.review-badges .status')).toHaveLength(1)
    expect(screen.getByText(/waiting for company re-review/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
  })

  it('keeps pre-approval weeks out of mentor review', async () => {
    renderMentor('/mentor/interns/s9/weeks/4', mentorData())
    expect(await screen.findByText(/not available for mentor review/i)).toBeInTheDocument()
    expect(screen.queryByText(/submitted weekly report/i)).toBeNull()
  })
})
