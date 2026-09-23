import { describe, expect, it } from 'vitest'
import { addDaysUtc } from './dates'
import { buildWeeks, formatWeekRange, weekLabel } from './weeks'

describe('buildWeeks', () => {
  it('creates 2 weeks for an 8-day range with a capped partial tail', () => {
    const result = buildWeeks('2026-09-14', '2026-09-21')
    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({ weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20', status: 'not_started' })
    expect(result.entries[1]).toMatchObject({ weekNumber: 2, startDate: '2026-09-21', endDate: '2026-09-21' })
  })

  it('creates a single week for a 1-day internship', () => {
    const result = buildWeeks('2026-09-14', '2026-09-14')
    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ startDate: '2026-09-14', endDate: '2026-09-14' })
  })

  it('rejects reversed dates', () => {
    const result = buildWeeks('2026-09-21', '2026-09-14')
    expect(result.ok).toBe(false)
    expect(result.entries).toHaveLength(0)
    expect(result.message).toMatch(/on or after/i)
  })

  it('rejects invalid or empty dates', () => {
    expect(buildWeeks('', '2026-09-14').ok).toBe(false)
    expect(buildWeeks('2026-09-14', '').ok).toBe(false)
    expect(buildWeeks('not-a-date', '2026-09-14').ok).toBe(false)
    expect(buildWeeks('2026-02-30', '2026-03-01').ok).toBe(false)
  })

  it('derives a dynamic week count from the range (never fixed at 16)', () => {
    const long = buildWeeks('2026-09-14', addDaysUtc('2026-09-14', 109)) // 110 days
    expect(long.ok).toBe(true)
    expect(long.entries).toHaveLength(16)
    expect(long.entries[15]).toMatchObject({ weekNumber: 16, startDate: addDaysUtc('2026-09-14', 105), endDate: addDaysUtc('2026-09-14', 109) })

    const short = buildWeeks('2026-09-14', addDaysUtc('2026-09-14', 20)) // 21 days
    expect(short.entries).toHaveLength(3)
  })

  it('crosses DST boundaries without losing days', () => {
    const result = buildWeeks('2026-03-23', '2026-04-05') // 14 days spanning UK DST
    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[1]).toMatchObject({ startDate: '2026-03-30', endDate: '2026-04-05' })
  })
})

describe('week labels', () => {
  it('formats labels and ranges, collapsing single-day weeks', () => {
    expect(weekLabel(3)).toBe('Week 3')
    expect(formatWeekRange('2026-09-14', '2026-09-20')).toBe('2026-09-14 – 2026-09-20')
    expect(formatWeekRange('2026-09-14', '2026-09-14')).toBe('2026-09-14')
  })
})
