import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { ManagedInternWeeks, ManagedReviewQueue, ManagedWeekReview } from './managedReview'
import { clearAllRecoveryDrafts } from '../../recovery/draftStore'
import { __resetEnvCache } from '../../config/env'
import { login as apiLogin } from '../../api/portal'
import { createTestServer } from '../../mocks/server'

const SUPERVISOR_EMAIL = 'sarah.lim@nusantara.example.com'
const MENTOR_EMAIL = 'maya.chen@university.example.edu'

/**
 * Managed reviewer flows against the MSW contract mirror: server-scoped
 * queues, versioned atomic reviews with idempotency, capability gating,
 * dirty-input preservation, background reconciliation, and 403 scoping.
 * The fixture store is reset per test via explicit preconditions
 * (order-independent). Assertions wait on stable visible state or MSW
 * store snapshots — no arbitrary sleeps.
 */
describe('managed reviewer flows', () => {
  const { server, store } = createTestServer()

  // Review flows chain several sequential API roundtrips (queue + weeks +
  // detail + mutation + reconcile); allow headroom under parallel workers.
  vi.setConfig({ testTimeout: 20_000 })

  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_API_BASE_URL', 'http://portal.test')
    __resetEnvCache()
    clearAllRecoveryDrafts('supervisor-1')
    clearAllRecoveryDrafts('mentor-1')
  })

  afterEach(() => {
    cleanup()
    server.resetHandlers()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    __resetEnvCache()
  })

  afterAll(() => server.close())

  function resetWeek1Pending() {
    const week = store.weeks.get(1)!
    week.status = 'submitted'
    week.review = { status: 'pending' }
    delete week.mentorReview
    week.version = 'v-1-1'
  }

  function resetWeek1CompanyApproved() {
    const week = store.weeks.get(1)!
    week.status = 'submitted'
    week.review = { status: 'approved' }
    delete week.mentorReview
    week.version = 'v-1-1'
  }

  function renderReview(mode: 'supervisor' | 'mentor', studentId: string, weekNumber: number) {
    render(
      <MemoryRouter>
        <ManagedWeekReview mode={mode} studentId={studentId} weekNumber={weekNumber} />
      </MemoryRouter>,
    )
  }

  it('lists the server-scoped company queue for supervisors', async () => {
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    render(
      <MemoryRouter>
        <ManagedReviewQueue mode="supervisor" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Company interns', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText('Aisha Rahman', undefined, { timeout: 5000 })).toBeInTheDocument()
  })

  it('lists the assigned mentees for mentors', async () => {
    await apiLogin(MENTOR_EMAIL, 'any-password')
    render(
      <MemoryRouter>
        <ManagedReviewQueue mode="mentor" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Assigned mentees', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText('Aisha Rahman', undefined, { timeout: 5000 })).toBeInTheDocument()
  })

  it('shows submitted intern weeks with review links', async () => {
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    render(
      <MemoryRouter>
        <ManagedInternWeeks mode="supervisor" studentId="student-1" />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: /Week 1/ }, { timeout: 5000 })).toHaveAttribute(
      'href',
      '/supervisor/interns/student-1/weeks/1',
    )
    expect(screen.queryByRole('link', { name: /Week 2/ })).toBeNull()
  })

  it('approves a pending week with one atomic transition on double-click', async () => {
    resetWeek1Pending()
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    renderReview('supervisor', 'student-1', 1)
    expect(await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })).toBeInTheDocument()
    const approve = await screen.findByRole('button', { name: 'Approve' }, { timeout: 5000 })
    expect(approve).toBeEnabled()
    fireEvent.click(approve)
    fireEvent.click(approve)
    // Success renders from the mutation response and the review stays
    // mounted through background reconciliation (never a loading splash).
    expect(await screen.findByText('Review saved.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Loading review…')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled(), { timeout: 5000 })
    // Exactly one transition applied despite the double click.
    expect(store.weeks.get(1)!.review?.status).toBe('approved')
    expect(store.weeks.get(1)!.version).toBe('v-1-1+r')
  })

  it('requires feedback to request changes and preserves it on success', async () => {
    resetWeek1Pending()
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    renderReview('supervisor', 'student-1', 1)
    await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Review feedback'), { target: { value: 'Add concrete examples.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    expect(await screen.findByText('Review saved.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(store.weeks.get(1)!.review).toMatchObject({ status: 'changes_requested', feedback: 'Add concrete examples.' })
    // The applied server echo keeps the typed feedback in the box.
    expect((screen.getByLabelText('Review feedback') as HTMLTextAreaElement).value).toBe('Add concrete examples.')
  })

  it('never overwrites immediately-typed feedback with the server seed', async () => {
    resetWeek1Pending()
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    renderReview('supervisor', 'student-1', 1)
    // Type at the first paint of the form, before awaiting anything else.
    const box = await screen.findByLabelText('Review feedback', undefined, { timeout: 5000 })
    fireEvent.change(box, { target: { value: 'Quick note' } })
    // Settle the load (snapshot + enabled actions flush every pending effect
    // and refresh); the typed text must survive them all.
    expect(await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled(), { timeout: 5000 })
    expect((screen.getByLabelText('Review feedback') as HTMLTextAreaElement).value).toBe('Quick note')
  })

  it('preserves typed feedback across a stale-version conflict and retries cleanly', async () => {
    resetWeek1Pending()
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    renderReview('supervisor', 'student-1', 1)
    await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })
    // External change after load: the next save is rejected (412), never
    // silently overwritten.
    store.weeks.get(1)!.version = 'v-external-1'
    fireEvent.change(screen.getByLabelText('Review feedback'), { target: { value: 'Keep this note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/changed elsewhere/, undefined, { timeout: 5000 })).toBeInTheDocument()
    // Prior state is preserved: typed feedback stays, actions re-enable.
    expect((screen.getByLabelText('Review feedback') as HTMLTextAreaElement).value).toBe('Keep this note')
    expect(store.weeks.get(1)!.review?.status).toBe('pending')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled(), { timeout: 5000 })
    // The conflict refreshed the version in the background; retry with the
    // same buttons until the fresh version lands (per-click idempotency
    // keys make repeated attempts safe; in-flight clicks are ignored).
    await waitFor(
      async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
        expect(await screen.findByText('Review saved.', undefined, { timeout: 3000 })).toBeInTheDocument()
      },
      { timeout: 12_000 },
    )
    expect(store.weeks.get(1)!.review?.status).toBe('approved')
  })

  it('keeps success and offers refresh retry when reconciliation fails', async () => {
    resetWeek1Pending()
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    renderReview('supervisor', 'student-1', 1)
    await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })
    // Break the detail read so the post-success background reconcile fails;
    // the review mutation itself is unaffected.
    server.use(
      http.get('*/api/v1/supervisor/interns/:studentId/weeks/:weekNumber', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Server error', status: 500, code: 'INTERNAL', requestId: 'req-boom' },
          { status: 500 },
        ),
      ),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }, { timeout: 5000 }))
    // Saved state is kept with a non-blocking warning (refresh-only retry);
    // the review never unmounts into a loading splash.
    expect(await screen.findByText('Review saved.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText(/could not be refreshed/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Loading review…')).toBeNull()
    expect(store.weeks.get(1)!.review?.status).toBe('approved')
    // Restoring the backend lets the refresh-only retry clear the warning.
    server.resetHandlers()
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
    await waitFor(() => expect(screen.queryByText(/could not be refreshed/)).toBeNull(), { timeout: 5000 })
    expect(screen.getByText('Review saved.')).toBeInTheDocument()
  })

  it('approves as mentor after company approval', async () => {
    resetWeek1CompanyApproved()
    await apiLogin(MENTOR_EMAIL, 'any-password')
    renderReview('mentor', 'student-1', 1)
    expect(await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }, { timeout: 5000 }))
    expect(await screen.findByText('Review saved.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(store.weeks.get(1)!.mentorReview?.status).toBe('approved')
  })

  it('mentor rejection restarts company review', async () => {
    resetWeek1CompanyApproved()
    await apiLogin(MENTOR_EMAIL, 'any-password')
    renderReview('mentor', 'student-1', 1)
    await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })
    fireEvent.change(screen.getByLabelText('Mentor feedback'), { target: { value: 'Connect to learning outcomes.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    expect(await screen.findByText('Review saved.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(store.weeks.get(1)!.mentorReview?.status).toBe('changes_requested')
    expect(store.weeks.get(1)!.review?.status).toBe('pending')
  })

  it('denies out-of-scope interns and disables decided weeks', async () => {
    await apiLogin(SUPERVISOR_EMAIL, 'any-password')
    renderReview('supervisor', 'student-9', 1)
    // AccessDenied renders the scope copy twice (heading + card); the
    // heading is the unique assertion target.
    expect(await screen.findByRole('heading', { name: 'Access denied' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByText('This intern is not in your company.')).not.toHaveLength(0)
    cleanup()

    // An approved week is no longer actionable: buttons disable via domain
    // state and server capabilities.
    const week = store.weeks.get(1)!
    week.status = 'submitted'
    week.review = { status: 'approved' }
    week.version = 'v-1-1'
    renderReview('supervisor', 'student-1', 1)
    await screen.findByText('Seeded weekly report.', undefined, { timeout: 5000 })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled(), { timeout: 5000 })
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled()
  })
})
