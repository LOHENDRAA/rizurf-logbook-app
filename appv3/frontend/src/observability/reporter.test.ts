import { describe, expect, it } from 'vitest'
import { __clearTelemetry, __recentTelemetry, reportTelemetry, setTelemetrySink } from './reporter'

describe('telemetry adapter', () => {
  it('records only coarse events and never throws', () => {
    __clearTelemetry()
    setTelemetrySink(undefined)
    reportTelemetry({ event: 'autosave_failed', status: 500, code: 'INTERNAL', requestId: 'r1' })
    expect(__recentTelemetry()).toEqual(['autosave_failed:INTERNAL'])
    // Journal text has no field to travel through by construction.
    reportTelemetry({ event: 'submit_succeeded' })
    expect(__recentTelemetry()).toHaveLength(2)
    __clearTelemetry()
  })

  it('forwards to a sink without journal content', () => {
    const seen: unknown[] = []
    setTelemetrySink((payload) => seen.push(payload))
    try {
      reportTelemetry({ event: 'review_succeeded', requestId: 'r2' })
      expect(seen).toEqual([{ event: 'review_succeeded', requestId: 'r2' }])
    } finally {
      setTelemetrySink(undefined)
    }
  })
})
