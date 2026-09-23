import { describe, expect, it } from 'vitest'
import { ApiError, formatErrorForDisplay, toApiError, toTransportError } from './errors'

describe('API error normalization', () => {
  it('maps problem+json to codes with requestId and generic messages', () => {
    const error = toApiError(409, { code: 'TRANSITION_CONFLICT', requestId: 'req-1', detail: 'secret internals here' })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('TRANSITION_CONFLICT')
    expect(error.requestId).toBe('req-1')
    // Internals never leak to the UI.
    expect(error.message).not.toContain('secret')
    expect(error.isVersionConflict).toBe(true)
  })

  it('marks 401 for re-auth and 412 for compare-then-retry', () => {
    expect(toApiError(401, {}, 'r').isUnauthorized).toBe(true)
    const stale = toApiError(412, { code: 'STALE_VERSION' }, 'r')
    expect(stale.isVersionConflict).toBe(true)
    expect(stale.code).toBe('STALE_VERSION')
  })

  it('uses safe fallbacks for 5xx without payloads', () => {
    const error = toApiError(500, undefined, 'r-5')
    expect(error.code).toBe('INTERNAL')
    expect(error.retryable).toBe(true)
    expect(formatErrorForDisplay(error)).toContain('ref r-5')
  })

  it('maps offline transport failures without exposing error internals', () => {
    const error = toTransportError(new TypeError('Failed to fetch'), 'r-off')
    expect(error.code).toBe('INTERNAL')
    expect(error.message).not.toContain('Failed to fetch')
    expect(formatErrorForDisplay(new Error('boom'))).toBe('The request could not be completed. Please try again.')
  })
})
