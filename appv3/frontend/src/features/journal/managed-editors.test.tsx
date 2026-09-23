import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ManagedDailyEditor } from './managedEditors'
import { ManagedWeekView } from '../../pages/WeekPage'
import { clearAllRecoveryDrafts } from '../../recovery/draftStore'
import { __resetEnvCache } from '../../config/env'
import { createTestServer } from '../../mocks/server'

/**
 * F2: managed editors persist through the versioned REST API — debounced
 * autosave with visible states, explicit Save flush, 412 compare-then-retry
 * preserving local text, and submit hitting the API. Runs against the MSW
 * contract mirror.
 */
describe('managed editors', () => {
  const { server, store } = createTestServer()

  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_API_BASE_URL', 'http://portal.test')
    __resetEnvCache()
    clearAllRecoveryDrafts('student-1')
  })

  afterEach(() => {
    cleanup()
    server.resetHandlers()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    __resetEnvCache()
  })

  afterAll(() => server.close())

  it('autosaves a daily log through the API with visible states', async () => {
    render(<ManagedDailyEditor weekNumber={2} date="2026-08-05" userId="student-1" debounceMs={10} />)
    const field = await screen.findByLabelText('Daily log for 2026-08-05', undefined, { timeout: 5000 })
    expect(field).toHaveValue('')
    fireEvent.change(field, { target: { value: 'My daily words' } })
    // Explicit Save flushes the pending write immediately.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved', undefined, { timeout: 5000 })).toBeInTheDocument()
    const stored = store.weeks.get(2)?.dailyEntries.find((day) => day.date === '2026-08-05')
    expect(stored?.body).toBe('My daily words')
    expect(store.weeks.get(2)?.version).toContain('+d')
  })

  it('preserves local text on version conflict and retries with the server copy', async () => {
    render(<ManagedDailyEditor weekNumber={2} date="2026-08-05" userId="student-1" debounceMs={10_000} />)
    await waitFor(() => expect(screen.queryByText('Loading daily log…')).toBeNull())
    // External change after load: the next save must be rejected (412).
    store.weeks.get(2)!.version = 'v-external-9'
    const field = screen.getByLabelText('Daily log for 2026-08-05')
    fireEvent.change(field, { target: { value: `${field instanceof HTMLTextAreaElement ? field.value : ''} conflicting edit` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alertdialog', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('This item changed elsewhere')).toBeInTheDocument()
    // Local text is intact in the editor.
    const unsynced = screen.getByLabelText('Your unsynced text') as HTMLTextAreaElement
    expect(unsynced.value).toContain('conflicting edit')
    fireEvent.click(screen.getByRole('button', { name: 'Retry with latest version' }))
    // Retry succeeds against the fresh version: the dialog closes, the
    // status confirms, and the reconciled text reaches the server.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(await screen.findByText('Saved', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(store.weeks.get(2)?.dailyEntries.find((day) => day.date === '2026-08-05')?.body).toContain('conflicting edit')
  })

  it('submits a managed week through the API after autosave', async () => {
    render(
      <MemoryRouter initialEntries={['/journal/weeks/3']}>
        <ManagedWeekView weekNumber={3} userId="student-1" />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: /weekly consolidation log/i }, { timeout: 5000 })).toBeInTheDocument()
    // Fixture week 3 sits on the changes-requested revision path.
    const resubmit = await screen.findByRole('button', { name: 'Resubmit week' }, { timeout: 5000 })
    expect(resubmit).toBeEnabled()
    fireEvent.click(resubmit)
    expect(await screen.findByText('Week resubmitted.', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(store.weeks.get(3)?.status).toBe('submitted')
    expect(store.weeks.get(3)?.review?.status).toBe('pending')
  })
})
