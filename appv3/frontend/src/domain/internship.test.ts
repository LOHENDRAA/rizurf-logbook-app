import { describe, expect, it } from 'vitest'
import { getInternshipLifecycle, getWeekAvailability, groupJournalWeeks } from './internship'
import type { JournalEntry } from '../types'

function entry(weekNumber: number, startDate: string, endDate: string, status: JournalEntry['status'] = 'not_started'): JournalEntry {
  return { id: `week-${weekNumber}`, weekNumber, startDate, endDate, body: '', status, dailyEntries: [], weeklyDraft: '' }
}

describe('getInternshipLifecycle', () => {
  const start = '2026-09-14'
  const end = '2026-12-06' // 12 weeks

  it('reports the before phase with 0 percent', () => {
    const lifecycle = getInternshipLifecycle(start, end, '2026-09-10', 12)
    expect(lifecycle.phase).toBe('before')
    expect(lifecycle.headline).toBe('Starts in 4 days')
    expect(lifecycle.weeksLabel).toBe('0 of 12 weeks')
    expect(lifecycle.percent).toBe(0)
  })

  it('uses the singular day label', () => {
    expect(getInternshipLifecycle(start, end, '2026-09-13', 12).headline).toBe('Starts in 1 day')
  })

  it('reports Week X of N with percent = current week / total weeks', () => {
    const lifecycle = getInternshipLifecycle(start, end, '2026-09-24', 12) // day 10 → week 2
    expect(lifecycle.phase).toBe('active')
    expect(lifecycle.headline).toBe('Week 2 of 12')
    expect(lifecycle.weeksLabel).toBe('Week 2 of 12')
    expect(lifecycle.weekNumber).toBe(2)
    expect(lifecycle.percent).toBe(17)
  })

  it('reports the final week as 100 percent', () => {
    const lifecycle = getInternshipLifecycle(start, end, end, 12)
    expect(lifecycle.phase).toBe('active')
    expect(lifecycle.weekNumber).toBe(12)
    expect(lifecycle.percent).toBe(100)
  })

  it('reports the after phase as completed', () => {
    const lifecycle = getInternshipLifecycle(start, end, '2026-12-07', 12)
    expect(lifecycle.phase).toBe('after')
    expect(lifecycle.headline).toBe('Internship period completed')
    expect(lifecycle.weeksLabel).toBe('12 of 12 weeks')
    expect(lifecycle.percent).toBe(100)
  })

  it('handles a total of zero weeks without dividing by zero', () => {
    const lifecycle = getInternshipLifecycle(start, end, '2026-09-24', 0)
    expect(lifecycle.percent).toBe(0)
    expect(lifecycle.totalWeeks).toBe(0)
  })
})

describe('getWeekAvailability', () => {
  it('derives locked, available, and overdue from dates only', () => {
    const week = entry(1, '2026-09-14', '2026-09-20')
    expect(getWeekAvailability(week, '2026-09-13')).toBe('locked')
    expect(getWeekAvailability(week, '2026-09-14')).toBe('available')
    expect(getWeekAvailability(week, '2026-09-20')).toBe('available')
    expect(getWeekAvailability(week, '2026-09-21')).toBe('overdue')
  })

  it('does not mark a submitted past week as overdue', () => {
    const submitted = entry(2, '2026-09-14', '2026-09-20', 'submitted')
    expect(getWeekAvailability(submitted, '2026-09-25')).toBe('available')
  })
})

describe('groupJournalWeeks', () => {
  it('splits unlocked incomplete entries into current-week overlap and before-Monday overdue', () => {
    // Thursday 2026-09-24 → Mon 2026-09-21 … Sun 2026-09-27.
    const entries = [
      entry(4, '2026-09-28', '2026-10-04', 'not_started'), // upcoming
      entry(3, '2026-09-21', '2026-09-27', 'draft'), // overlaps Mon–Sun → current week
      entry(1, '2026-09-07', '2026-09-13', 'draft'), // ends before Monday → overdue
      entry(2, '2026-09-14', '2026-09-20', 'not_started'), // ends day before Monday → overdue
    ]
    const groups = groupJournalWeeks(entries, '2026-09-24')
    expect(groups.overdue.map((item) => item.weekNumber)).toEqual([1, 2])
    expect(groups.currentWeek.map((item) => item.weekNumber)).toEqual([3])
    expect(groups.upcoming.map((item) => item.weekNumber)).toEqual([4])
    expect(groups.past).toEqual([])
  })

  it('keeps an entry ending earlier in the current week in current week, not overdue', () => {
    const entries = [entry(1, '2026-09-21', '2026-09-22', 'draft')] // ended Tue, today Thu
    const groups = groupJournalWeeks(entries, '2026-09-24')
    expect(groups.currentWeek.map((item) => item.weekNumber)).toEqual([1])
    expect(groups.overdue).toEqual([])
  })

  it('treats a week spanning the Monday boundary as current week', () => {
    const entries = [entry(1, '2026-09-14', '2026-09-21', 'not_started')] // ends Monday
    const groups = groupJournalWeeks(entries, '2026-09-21')
    expect(groups.currentWeek.map((item) => item.weekNumber)).toEqual([1])
    expect(groups.overdue).toEqual([])
  })

  it('keeps locked entries starting later the same calendar week in upcoming', () => {
    // Monday 2026-09-21; entry starts Thu 2026-09-24 (same Mon–Sun week) but locked.
    const entries = [entry(2, '2026-09-24', '2026-09-30', 'not_started')]
    const groups = groupJournalWeeks(entries, '2026-09-21')
    expect(groups.upcoming.map((item) => item.weekNumber)).toEqual([2])
    expect(groups.currentWeek).toEqual([])
    expect(groups.overdue).toEqual([])
  })

  it('puts submitted unlocked entries in past, including the current week', () => {
    const entries = [
      entry(1, '2026-09-14', '2026-09-20', 'submitted'),
      entry(2, '2026-09-21', '2026-09-27', 'submitted'), // current, submitted
    ]
    const groups = groupJournalWeeks(entries, '2026-09-24')
    expect(groups.past.map((item) => item.weekNumber)).toEqual([1, 2])
    expect(groups.currentWeek).toEqual([])
    expect(groups.overdue).toEqual([])
  })

  it('keeps future entries in upcoming regardless of status', () => {
    const entries = [
      entry(1, '2026-09-28', '2026-10-04', 'submitted'),
      entry(2, '2026-10-05', '2026-10-11', 'not_started'),
    ]
    const groups = groupJournalWeeks(entries, '2026-09-24')
    expect(groups.upcoming.map((item) => item.weekNumber)).toEqual([1, 2])
    expect(groups.currentWeek).toEqual([])
    expect(groups.overdue).toEqual([])
    expect(groups.past).toEqual([])
  })

  it('leaves current week and overdue empty when all unlocked entries are submitted', () => {
    const entries = [
      entry(1, '2026-09-07', '2026-09-13', 'submitted'),
      entry(2, '2026-09-14', '2026-09-20', 'submitted'),
      entry(3, '2026-09-28', '2026-10-04', 'not_started'), // future
    ]
    const groups = groupJournalWeeks(entries, '2026-09-24')
    expect(groups.currentWeek).toEqual([])
    expect(groups.overdue).toEqual([])
  })

  it('handles Monday-today and Sunday-today boundaries', () => {
    const beforeMonday = entry(1, '2026-09-14', '2026-09-20', 'not_started')
    const mondayEntry = entry(2, '2026-09-21', '2026-09-27', 'not_started')
    // Monday today: week ending Sunday is overdue, week starting Monday is current.
    const monday = groupJournalWeeks([beforeMonday, mondayEntry], '2026-09-21')
    expect(monday.overdue.map((item) => item.weekNumber)).toEqual([1])
    expect(monday.currentWeek.map((item) => item.weekNumber)).toEqual([2])
    // Sunday today: same buckets.
    const sunday = groupJournalWeeks([beforeMonday, mondayEntry], '2026-09-27')
    expect(sunday.overdue.map((item) => item.weekNumber)).toEqual([1])
    expect(sunday.currentWeek.map((item) => item.weekNumber)).toEqual([2])
  })
})
