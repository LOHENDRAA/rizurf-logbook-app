/**
 * Normalized API error model (RFC 9457 problem+json + transport failures).
 * Journal/feedback text is never attached to errors or logs.
 */

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'STALE_VERSION'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'TRANSITION_CONFLICT'
  | 'OFFLINE'
  | 'INTERNAL'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly requestId?: string
  readonly retryable: boolean

  constructor(init: { code: ApiErrorCode; status: number; message: string; requestId?: string; retryable?: boolean }) {
    // Generic message only: never include bodies, stacks, or secrets.
    super(init.message)
    this.name = 'ApiError'
    this.code = init.code
    this.status = init.status
    this.requestId = init.requestId
    this.retryable = init.retryable ?? false
  }

  /** 401: caller must preserve drafts and prompt re-auth. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** 409/412: caller must preserve local text and offer compare-then-retry. */
  get isVersionConflict(): boolean {
    return this.status === 409 || this.status === 412
  }
}

interface ProblemPayload {
  title?: unknown
  detail?: unknown
  code?: unknown
  requestId?: unknown
  request_id?: unknown
}

const STATUS_CODE: Record<number, ApiErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  412: 'STALE_VERSION',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
}

const GENERIC_MESSAGE: Record<number, string> = {
  400: 'The request could not be completed. Please try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have access to this resource.',
  404: 'The requested resource could not be found.',
  409: 'This item changed elsewhere. Compare and retry.',
  412: 'This item changed elsewhere. Compare and retry.',
  422: 'Some details need attention before saving.',
  429: 'Too many requests. Please wait a moment and try again.',
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Normalize a problem+json (or empty) failure into an ApiError. */
export function toApiError(status: number, payload: unknown, requestId?: string): ApiError {
  const problem = (payload ?? {}) as ProblemPayload
  const code = asString(problem.code)?.toUpperCase() as ApiErrorCode | undefined
  const resolved: ApiErrorCode = code ?? STATUS_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'INTERNAL')
  const message =
    status >= 500
      ? 'Something went wrong on our side. Please try again.'
      : (GENERIC_MESSAGE[status] ?? 'The request could not be completed. Please try again.')
  return new ApiError({
    code: resolved,
    status,
    message,
    requestId: asString(problem.requestId) ?? asString(problem.request_id) ?? requestId,
    retryable: status === 429 || status >= 500,
  })
}

/** Network/DOM failures (offline, DNS, CORS) become OFFLINE/INTERNAL errors. */
export function toTransportError(error: unknown, requestId?: string): ApiError {
  if (error instanceof ApiError) return error
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return new ApiError({
    code: offline ? 'OFFLINE' : 'INTERNAL',
    status: 0,
    message: offline ? 'You appear to be offline. Your edits are kept locally.' : 'The request could not be completed. Please try again.',
    requestId,
    retryable: true,
  })
}

/** Render an error for the UI: generic message plus requestId for support. */
export function formatErrorForDisplay(error: unknown): string {
  if (error instanceof ApiError) {
    return error.requestId ? `${error.message} (ref ${error.requestId})` : error.message
  }
  return 'The request could not be completed. Please try again.'
}
