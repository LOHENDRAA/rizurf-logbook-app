import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../state/AppContext'
import { testRepository } from '../test/testRepository'
import { MentorDashboardPage } from './MentorDashboardPage'

function renderDashboard(session = 'mentor-1') {
  sessionStorage.clear()
  sessionStorage.setItem('portal-user', session)
  return render(
    <MemoryRouter initialEntries={['/mentor/dashboard']}>
      <AppProvider repository={testRepository()}>
        <Routes>
          <Route path="/mentor/dashboard" element={<MentorDashboardPage />} />
          <Route path="/mentor/interns/:studentId" element={<div>Intern detail</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('MentorDashboardPage', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('shows all six mentees with mentor-visible review summaries', async () => {
    renderDashboard()
    for (const name of ['Aisha Rahman', 'Daniel Lee', 'Maya Chen', 'Amara Okafor', 'Jonas Weber', 'Lily Wang']) {
      expect(await screen.findByText(name)).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: 'Assigned mentees' })).toBeInTheDocument()
  })

  it('shows the Jonas halfway profile and the Lily completed profile', async () => {
    renderDashboard()
    await screen.findByText('Jonas Weber')
    const rows = screen.getAllByRole('row').slice(1)
    const rowOf = (name: string) => rows.find((row) => within(row).queryByText(name))
    const jonasRow = rowOf('Jonas Weber')!
    const lilyRow = rowOf('Lily Wang')!
    const aishaRow = rowOf('Aisha Rahman')!
    expect(jonasRow).toBeDefined()
    expect(lilyRow).toBeDefined()
    expect(aishaRow).toBeDefined()
    // Jonas: all 10 submitted weeks awaiting mentor review.
    expect(within(jonasRow).getByText('10 Awaiting mentor review')).toBeInTheDocument()
    expect(within(jonasRow).queryByText(/completed/i)).toBeNull()
    // Lily: all 10 weeks completed.
    expect(within(lilyRow).getByText('10 Completed')).toBeInTheDocument()
    expect(within(lilyRow).queryByText(/awaiting mentor review/i)).toBeNull()
    // Aisha: both weeks completed.
    expect(within(aishaRow).getByText('2 Completed')).toBeInTheDocument()
  })

  it('shows Amara mentor-visible weeks and hides pre-approval weeks', async () => {
    renderDashboard()
    await screen.findByText('Amara Okafor')
    const rows = screen.getAllByRole('row').slice(1)
    const rowOf = (name: string) => rows.find((row) => within(row).queryByText(name))
    // Amara is mentor-visible on the two company-approved weeks only.
    const amaraRow = rowOf('Amara Okafor')!
    expect(within(amaraRow).getByText('1 Awaiting mentor review')).toBeInTheDocument()
    expect(within(amaraRow).getByText('1 Revision required')).toBeInTheDocument()
    expect(within(amaraRow).queryByText(/awaiting company review/i)).toBeNull()
    // Maya's company-pending week and Daniel's upcoming placement stay empty.
    expect(within(rowOf('Maya Chen')!).getByText('No reviews yet')).toBeInTheDocument()
    expect(within(rowOf('Daniel Lee')!).getByText('No reviews yet')).toBeInTheDocument()
  })

  it('orders the busiest mentee first and links each row to individual review', async () => {
    renderDashboard()
    await screen.findByText('Jonas Weber')
    const rows = screen.getAllByRole('row').slice(1)
    // Jonas has 10 weeks awaiting mentor review, the most attention.
    expect(within(rows[0]).getByText('Jonas Weber')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Amara Okafor')).toBeInTheDocument()
    for (const row of rows) {
      expect(within(row).getByRole('link', { name: /review/i })).toBeInTheDocument()
    }
    const reviewLinks = screen.getAllByRole('link', { name: /review/i })
    expect(reviewLinks[0].getAttribute('href')).toMatch(/\/mentor\/interns\//)
  })
})
