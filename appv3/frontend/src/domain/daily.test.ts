import { describe, expect, it } from 'vitest'
import { findOwningEntry, getAvailableDateRange, getDailyAvailability, isDateAvailable, isWeekday, weekdaysInWeek } from './daily'

describe('isWeekday', () => {
  it('treats Monday–Friday as workdays and weekends as non-workdays', () => {
    // Mon 2026-09-14 … Fri 2026-09-18.
    expect(isWeekday('2026-09-14')).toBe(true)
    expect(isWeekday('2026-09-16')).toBe(true)
    expect(isWeekday('2026-09-18')).toBe(true)
    // Sat 2026-09-19, Sun 2026-09-20.
    expect(isWeekday('2026-09-19')).toBe(false)
    expect(isWeekday('2026-09-20')).toBe(false)
  })

  it('rejects invalid dates', () => {
    expect(() => isWeekday('nope')).toThrow()
  })
})

describe('weekdaysInWeek', () => {
  it('returns Monday–Friday dates inside a full week', () => {
    expect(weekdaysInWeek('2026-09-14', '2026-09-20')).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
    ])
  })

  it('caps partial weeks to their end date', () => {
    expect(weekdaysInWeek('2026-09-21', '2026-09-21')).toEqual(['2026-09-21'])
    expect(weekdaysInWeek('2026-09-19', '2026-09-20')).toEqual([])
  })

  it('requires nothing for zero-weekday periods', () => {
    expect(weekdaysInWeek('2026-09-12', '2026-09-13')).toEqual([])
  })

  it('rejects invalid ranges', () => {
    expect(() => weekdaysInWeek('nope', '2026-09-20')).toThrow()
  })
})

describe('findOwningEntry', () => {
  const entries = [
    { startDate: '2026-09-14', endDate: '2026-09-20', status: 'not_started' as const },
    { startDate: '2026-09-21', endDate: '2026-09-27', status: 'not_started' as const },
  ]

  it('finds the week whose inclusive range contains the date', () => {
    expect(findOwningEntry(entries, '2026-09-14')?.startDate).toBe('2026-09-14')
    expect(findOwningEntry(entries, '2026-09-20')?.startDate).toBe('2026-09-14')
    expect(findOwningEntry(entries, '2026-09-21')?.startDate).toBe('2026-09-21')
  })

  it('returns undefined outside every week range', () => {
    expect(findOwningEntry(entries, '2026-09-13')).toBeUndefined()
    expect(findOwningEntry(entries, '2026-09-28')).toBeUndefined()
  })
})

describe('isDateAvailable', () => {
  const week = { startDate: '2026-09-14', endDate: '2026-09-20', status: 'not_started' as const }

  it('opens in-range weekdays on or before today in unlocked weeks', () => {
    expect(isDateAvailable('2026-09-14', week, '2026-09-17')).toBe(true)
    expect(isDateAvailable('2026-09-17', week, '2026-09-17')).toBe(true)
  })

  it('locks per-day future dates even in available weeks', () => {
    expect(isDateAvailable('2026-09-18', week, '2026-09-17')).toBe(false)
  })

  it('rejects weekends, out-of-range, malformed, and locked-week dates', () => {
    expect(isDateAvailable('2026-09-19', week, '2026-09-21')).toBe(false)
    expect(isDateAvailable('2026-09-13', week, '2026-09-21')).toBe(false)
    expect(isDateAvailable('not-a-date', week, '2026-09-21')).toBe(false)
    expect(isDateAvailable('2026-09-14', { ...week, startDate: '2026-09-20' }, '2026-09-17')).toBe(false)
  })
})

describe('getAvailableDateRange', () => {
  it('spans the earliest to latest openable weekday across unlocked weeks', () => {
    const range = getAvailableDateRange([
      { startDate: '2026-09-14', endDate: '2026-09-20', status: 'not_started' },
      { startDate: '2026-09-21', endDate: '2026-09-27', status: 'not_started' },
    ], '2026-09-22')
    expect(range).toEqual({ min: '2026-09-14', max: '2026-09-22' })
  })

  it('skips locked weeks and future days', () => {
    const range = getAvailableDateRange([
      { startDate: '2026-09-14', endDate: '2026-09-20', status: 'not_started' },
      { startDate: '2099-01-05', endDate: '2099-01-11', status: 'not_started' },
    ], '2026-09-17')
    expect(range).toEqual({ min: '2026-09-14', max: '2026-09-17' })
  })

  it('returns undefined when nothing is available', () => {
    expect(getAvailableDateRange([], '2026-09-17')).toBeUndefined()
    expect(
      getAvailableDateRange(
        [{ startDate: '2099-01-05', endDate: '2099-01-11', status: 'not_started' }],
        '2026-09-17',
      ),
    ).toBeUndefined()
  })
})

describe('getDailyAvailability', () => {
  it('keeps future days editable before their programme-local date arrives', () => {
    expect(getDailyAvailability('2026-09-18', '2026-09-17', false)).toBe('available')
    expect(getDailyAvailability('2026-09-17', '2026-09-17', false)).toBe('available')
  })

  it('keeps today and overdue days editable regardless of submission', () => {
    expect(getDailyAvailability('2026-09-17', '2026-09-17', false)).toBe('available')
    expect(getDailyAvailability('2026-09-14', '2026-09-17', false)).toBe('available')
  })

  it('keeps daily logs editable regardless of weekly submission state', () => {
    expect(getDailyAvailability('2026-09-14', '2026-09-17', true)).toBe('available')
    expect(getDailyAvailability('2026-09-17', '2026-09-17', true)).toBe('available')
  })
})
