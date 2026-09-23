/**
 * Telemetry adapter. Never sends journal text, feedback, emails, or error
 * internals — only coarse event names, status codes, and request ids.
 */

export type TelemetryEvent =
  | 'autosave_succeeded'
  | 'autosave_failed'
  | 'autosave_conflict'
  | 'submit_succeeded'
  | 'submit_failed'
  | 'review_succeeded'
  | 'review_failed'
  | 'reauth_shown'
  | 'reauth_completed'
  | 'offline_detected'
  | 'conflict_resolved'

export interface TelemetryPayload {
  event: TelemetryEvent
  status?: number
  code?: string
  requestId?: string
}

export type TelemetrySink = (payload: TelemetryPayload) => void

let sink: TelemetrySink | undefined

/** Swap the sink (tests, future backend beacon). Default is a no-op. */
export function setTelemetrySink(next: TelemetrySink | undefined): void {
  sink = next
}

const seen: string[] = []

export function reportTelemetry(payload: TelemetryPayload): void {
  try {
    sink?.(payload)
    // Bounded in-memory ring for diagnostics; no PII by construction.
    seen.push(`${payload.event}:${payload.code ?? payload.status ?? 'ok'}`)
    if (seen.length > 50) seen.splice(0, seen.length - 50)
  } catch {
    // Telemetry must never break the app.
  }
}

/** Test-only inspection of recent coarse events. */
export function __recentTelemetry(): string[] {
  return [...seen]
}

/** Test-only reset. */
export function __clearTelemetry(): void {
  seen.length = 0
}
