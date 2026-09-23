import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { apiRequest } from './client'

function jsonResponse(status: number, payload: unknown, headers: Record<string, string> = {}) {
  return new Response(payload === undefined ? '' : JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('api client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends cookie credentials, correlation id, XSRF, If-Match, and idempotency headers', async () => {
    Object.defineProperty(document, 'cookie', { value: 'XSRF-TOKEN=abc', configurable: true })
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }, { ETag: 'v-3' }))
    const response = await apiRequest<{ ok: boolean }>('/api/v1/me/journal/weeks/2/weekly-draft', {
      method: 'PUT',
      body: { draft: 'hi' },
      ifMatch: 'v-2',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    })
    expect(response.etag).toBe('v-3')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('include')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Request-Id']).toBe('req-1')
    expect(headers['X-XSRF-TOKEN']).toBe('abc')
    expect(headers['If-Match']).toBe('v-2')
    expect(headers['Idempotency-Key']).toBe('key-1')
  })

  it('dispatches portal:unauthorized on 401 so editors can preserve drafts', async () => {
    const seen: string[] = []
    const listener = () => seen.push('unauthorized')
    window.addEventListener('portal:unauthorized', listener)
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHENTICATED', requestId: 'r1' }))
      await expect(apiRequest('/api/v1/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
      expect(seen).toEqual(['unauthorized'])
    } finally {
      window.removeEventListener('portal:unauthorized', listener)
    }
  })

  it('never auto-retries mutations, and bounds read retries', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('down'))
    await expect(apiRequest('/api/v1/me/journal/weeks/1/submit', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockRejectedValue(new TypeError('down'))
    await expect(apiRequest('/api/v1/me')).rejects.toBeInstanceOf(ApiError)
    // Initial attempt + 2 bounded retries.
    expect(fetchMock).toHaveBeenCalledTimes(1 + 3)
  })

  it('surfaces 412 with requestId for compare-then-retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(412, { code: 'STALE_VERSION', requestId: 'r412' }))
    let failure: ApiError | undefined
    try {
      await apiRequest('/api/v1/me/journal/weeks/1/weekly-draft', { method: 'PUT', body: {} })
    } catch (error) {
      failure = error as ApiError
    }
    expect(failure?.isVersionConflict).toBe(true)
    expect(failure?.requestId).toBe('r412')
  })
})
