import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDaysUtc, diffDaysUtc, formatNumericDate, formatShortDate, formatWeekdayName, getCalendarWeekRange, getProgrammeDate, isValidDateString, parseDateUtc } from './dates'

describe('date parsing and validation', () => {
  it('accepts valid calendar dates and rejects impossible or malformed ones', () => {
    expect(isValidDateString('2026-09-14')).toBe(true)
    expect(isValidDateString('2024-02-29')).toBe(true)
    expect(isValidDateString('2026-02-29')).toBe(false)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('not-a-date')).toBe(false)
    expect(isValidDateString('')).toBe(false)
    expect(parseDateUtc('2026-09-14')).toBe(Date.UTC(2026, 8, 14))
    expect(parseDateUtc('2026-02-30')).toBeUndefined()
  })

  it('adds and diffs whole days with UTC-only arithmetic', () => {
    expect(addDaysUtc('2024-02-28', 2)).toBe('2024-03-01')
    expect(addDaysUtc('2026-09-14', 7)).toBe('2026-09-21')
    expect(diffDaysUtc('2026-09-14', '2026-09-21')).toBe(7)
    expect(diffDaysUtc('2026-09-14', '2026-09-14')).toBe(0)
  })

  it('is unaffected by DST transitions (date-only math)', () => {
    // UK DST starts 2026-03-29; UTC date math must still yield 24h blocks.
    expect(addDaysUtc('2026-03-28', 2)).toBe('2026-03-30')
    expect(diffDaysUtc('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('rejects invalid input to the arithmetic helpers', () => {
    expect(() => addDaysUtc('nope', 1)).toThrow()
    expect(() => diffDaysUtc('nope', '2026-09-14')).toThrow()
  })
})

describe('getProgrammeDate', () => {
  it('resolves the local calendar date around midnight', () => {
    // 23:30 UTC on 1 Jan: Kuala Lumpur (UTC+8) is already 2 Jan, London is still 1 Jan.
    const now = new Date(Date.UTC(2026, 0, 1, 23, 30))
    expect(getProgrammeDate(now, 'Asia/Kuala_Lumpur')).toBe('2026-01-02')
    expect(getProgrammeDate(now, 'Europe/London')).toBe('2026-01-01')
    expect(getProgrammeDate(now, 'UTC')).toBe('2026-01-01')
  })

  it('falls back to UTC with a warning for an invalid time zone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const now = new Date(Date.UTC(2026, 5, 10, 8, 0))
    expect(getProgrammeDate(now, 'Not/AZone')).toBe('2026-06-10')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})

describe('formatWeekdayName', () => {
  it('maps every ISO date to its English weekday name with UTC-safe math', () => {
    // Mon 2026-01-05 … Sun 2026-01-11.
    expect(formatWeekdayName('2026-01-05')).toBe('Monday')
    expect(formatWeekdayName('2026-01-06')).toBe('Tuesday')
    expect(formatWeekdayName('2026-01-07')).toBe('Wednesday')
    expect(formatWeekdayName('2026-01-08')).toBe('Thursday')
    expect(formatWeekdayName('2026-01-09')).toBe('Friday')
    expect(formatWeekdayName('2026-01-10')).toBe('Saturday')
    expect(formatWeekdayName('2026-01-11')).toBe('Sunday')
  })

  it('falls back to the raw value for invalid dates instead of crashing', () => {
    expect(formatWeekdayName('not-a-date')).toBe('not-a-date')
    expect(formatWeekdayName('')).toBe('')
    expect(formatWeekdayName('2026-02-30')).toBe('2026-02-30')
  })
})

describe('formatShortDate', () => {
  it('formats ISO dates as short readable dates with UTC-safe math', () => {
    expect(formatShortDate('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatShortDate('2026-09-14')).toBe('Sep 14, 2026')
    expect(formatShortDate('2026-12-31')).toBe('Dec 31, 2026')
  })

  it('falls back to the raw value for invalid dates instead of crashing', () => {
    expect(formatShortDate('not-a-date')).toBe('not-a-date')
    expect(formatShortDate('')).toBe('')
    expect(formatShortDate('2026-02-30')).toBe('2026-02-30')
  })
})

describe('formatNumericDate', () => {
  it('formats ISO dates as DD/MM/YYYY with UTC-safe math', () => {
    expect(formatNumericDate('2026-01-05')).toBe('05/01/2026')
    expect(formatNumericDate('2026-09-14')).toBe('14/09/2026')
    expect(formatNumericDate('2026-12-31')).toBe('31/12/2026')
  })

  it('falls back to the raw value for invalid dates instead of crashing', () => {
    expect(formatNumericDate('not-a-date')).toBe('not-a-date')
    expect(formatNumericDate('')).toBe('')
    expect(formatNumericDate('2026-02-30')).toBe('2026-02-30')
  })
})

describe('getCalendarWeekRange', () => {
  it('returns the Monday–Sunday week containing each weekday', () => {
    // Mon 2026-09-21 … Sun 2026-09-27.
    expect(getCalendarWeekRange('2026-09-21')).toEqual({ monday: '2026-09-21', sunday: '2026-09-27' })
    expect(getCalendarWeekRange('2026-09-24')).toEqual({ monday: '2026-09-21', sunday: '2026-09-27' })
    expect(getCalendarWeekRange('2026-09-27')).toEqual({ monday: '2026-09-21', sunday: '2026-09-27' })
    expect(getCalendarWeekRange('2026-09-20')).toEqual({ monday: '2026-09-14', sunday: '2026-09-20' })
    expect(getCalendarWeekRange('2026-09-28')).toEqual({ monday: '2026-09-28', sunday: '2026-10-04' })
  })

  it('handles month and year boundaries', () => {
    expect(getCalendarWeekRange('2026-01-01')).toEqual({ monday: '2025-12-29', sunday: '2026-01-04' })
    expect(getCalendarWeekRange('2026-03-01')).toEqual({ monday: '2026-02-23', sunday: '2026-03-01' })
  })

  it('rejects invalid dates', () => {
    expect(() => getCalendarWeekRange('nope')).toThrow()
    expect(() => getCalendarWeekRange('2026-02-30')).toThrow()
  })
})
