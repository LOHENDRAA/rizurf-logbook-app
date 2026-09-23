/**
 * Versioned REST client for `/api/v1`.
 *
 * - Same-site HttpOnly Secure cookie auth via `credentials: 'include'`.
 * - No tokens or passwords are stored in JavaScript (memory or storage).
 * - Every request carries `X-Request-Id` (correlation) and
 *   `X-Idempotency-Key` for caller-supplied mutation keys.
 * - Bounded retries (max 2, GET/HEAD only, backoff). Mutations never
 *   auto-retry: callers reuse the idempotency key for explicit retries.
 * - 401 responses dispatch a global `portal:unauthorized` event so editors
 *   can preserve drafts and prompt re-auth instead of losing work.
 */

import { getEnv } from '../config/env'
import { ApiError, toApiError, toTransportError } from './errors'

export const API_PREFIX = '/api/v1'
const MAX_READ_RETRIES = 2
const RETRY_BASE_MS = 250

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Last-seen opaque version; sent as If-Match for optimistic concurrency. */
  ifMatch?: string
  /** UUID v4 for safe retries of mutations (submit/review). */
  idempotencyKey?: string
  /** Override the auto-generated correlation id (tests). */
  requestId?: string
  signal?: AbortSignal
}

export interface ApiResponse<T> {
  data: T
  etag?: string
  requestId: string
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function newIdempotencyKey(): string {
  return newRequestId()
}

function joinUrl(base: string, path: string): string {
  if (base === '') return path
  return `${base.replace(/\/+$/, '')}${path}`
}

function isIdempotentMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readXsrfToken(): string | undefined {
  try {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : undefined
  } catch {
    return undefined
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const env = getEnv()
  const method = (options.method ?? 'GET').toUpperCase()
  const requestId = options.requestId ?? newRequestId()
  const url = joinUrl(env.apiBaseUrl, path)
  const xsrf = method !== 'GET' && method !== 'HEAD' ? readXsrfToken() : undefined

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': requestId,
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.ifMatch) headers['If-Match'] = options.ifMatch
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf

  let attempt = 0
  for (;;) {
    try {
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      })
      const payload = await parseBody(response)
      const responseRequestId =
        response.headers.get('X-Request-Id') ?? (payload as { requestId?: string } | undefined)?.requestId ?? requestId
      if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('portal:unauthorized', { detail: { requestId: responseRequestId, path } }))
      }
      if (!response.ok) throw toApiError(response.status, payload, responseRequestId)
      return { data: payload as T, etag: response.headers.get('ETag') ?? undefined, requestId: responseRequestId }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      const transport = toTransportError(error, requestId)
      // Bounded read-only retries for transient transport failures.
      if (isIdempotentMethod(method) && attempt < MAX_READ_RETRIES && transport.retryable) {
        attempt += 1
        await sleep(RETRY_BASE_MS * attempt)
        continue
      }
      throw transport
    }
  }
}

/** Sanctum CSRF handshake: must precede the first POST in cookie sessions. */
export async function csrfCookie(): Promise<void> {
  const env = getEnv()
  await fetch(joinUrl(env.apiBaseUrl, '/sanctum/csrf-cookie'), { method: 'GET', credentials: 'include' }).catch(() => {
    // Best effort: the login POST still carries through when the handshake
    // endpoint is unreachable in dev/test fixtures.
  })
}
