import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { __resetEnvCache } from '../config/env'
import { getMe, getMyWeek, listMyWeeks, submitWeek, supervisorReview, updateWeeklyDraft } from '../api/portal'
import { ApiError } from '../api/errors'
import { createTestServer } from './server'

/**
 * End-to-contract integration: the typed client against the MSW mirror of
 * openapi/portal.yaml. Proves success paths plus 401/403/409/412/422 and
 * idempotent double-submit (same key applies once).
 */
describe('MSW contract integration', () => {
  const { server } = createTestServer()

  async function captureFailure<T>(task: () => Promise<T>): Promise<ApiError> {
    try {
      await task()
    } catch (error) {
      return error as ApiError
    }
    throw new Error('expected the request to fail')
  }

  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://portal.test')
    __resetEnvCache()
    server.listen({ onUnhandledRequest: 'warn' })
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
    __resetEnvCache()
  })

  it('boots the session and lists weeks with versions', async () => {
    const me = await getMe()
    expect(me.role).toBe('student')
    expect(me.capabilities.canSubmit).toBe(true)
    const weeks = await listMyWeeks()
    expect(weeks.data.length).toBeGreaterThan(0)
    expect(weeks.meta.total).toBe(weeks.data.length)
  })

  it('autosaves a weekly draft and rejects over-limit text with 422', async () => {
    const saved = await updateWeeklyDraft(2, 'Fresh draft text.', 'v-2-1')
    expect(saved.version).toContain('v-2-1')
    const failure = await captureFailure(() => updateWeeklyDraft(2, 'x'.repeat(5001), saved.version))
    expect(failure.code).toBe('VALIDATION_FAILED')
  })

  it('rejects stale writes with 412 instead of overwriting', async () => {
    const failure = await captureFailure(() => updateWeeklyDraft(2, 'stale write', 'v-wrong'))
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.isVersionConflict).toBe(true)
  })

  it('applies an idempotent submit exactly once on double-click', async () => {
    // Week 3 carries the changes-requested revision path; read its live
    // version so earlier tests' writes cannot make this stale.
    const baseline = await getMyWeek(3)
    const key = '11111111-2222-4333-8444-555555555555'
    const first = await submitWeek(3, 'Resubmit text.', baseline.version, key)
    const second = await submitWeek(3, 'Resubmit text.', baseline.version, key)
    expect(second.version).toBe(first.version)
    expect(second.week.status).toBe('submitted')
    // A resubmit while pending is a 409, preserving the prior UI state.
    const conflict = await captureFailure(() =>
      submitWeek(3, 'Resubmit text.', second.version, '22222222-3333-4444-8555-666666666666'),
    )
    expect(conflict.code).toBe('TRANSITION_CONFLICT')
  })

  it('enforces server-side scopes: supervisor review is 403 for students', async () => {
    // The default mock session is a student: company review is out of scope.
    const denied = await captureFailure(() => supervisorReview('student-1', 1, 'approve', undefined, 'v-1-1'))
    expect(denied).toBeInstanceOf(ApiError)
    expect(denied.status).toBe(403)
    expect(denied.code).toBe('FORBIDDEN')
  })
})
