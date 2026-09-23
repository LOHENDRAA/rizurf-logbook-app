import type { JournalEntry } from '../types'
import { addDaysUtc, diffDaysUtc, isValidDateString, isoDateOnly } from './dates'
import { weekdaysInWeek } from './daily'

export interface BuildWeeksResult {
  ok: boolean
  entries: JournalEntry[]
  message: string
}

/**
 * Generate internship-relative weekly entries from an inclusive date range.
 * Each week is 7 days; the final week is capped at `endDate` (may be shorter).
 * Invalid, empty, or reversed ranges are rejected without producing entries.
 */
export function buildWeeks(startDate: string, endDate: string): BuildWeeksResult {
  const start = isoDateOnly((startDate ?? '').trim())
  const end = isoDateOnly((endDate ?? '').trim())
  if (!start || !end) return { ok: false, entries: [], message: 'Enter both a start and an end date.' }
  if (!isValidDateString(start) || !isValidDateString(end)) {
    return { ok: false, entries: [], message: 'Enter valid dates in YYYY-MM-DD format.' }
  }
  if (end < start) return { ok: false, entries: [], message: 'End date must be on or after the start date.' }
  const totalDays = diffDaysUtc(start, end) + 1
  const count = Math.ceil(totalDays / 7)
  const entries: JournalEntry[] = Array.from({ length: count }, (_, index) => {
    const weekStart = addDaysUtc(start, index * 7)
    const rawEnd = addDaysUtc(weekStart, 6)
    const weekEnd = rawEnd > end ? end : rawEnd
    return {
      id: `week-${index + 1}`,
      weekNumber: index + 1,
      startDate: weekStart,
      endDate: weekEnd,
      body: '',
      status: 'not_started',
      dailyEntries: weekdaysInWeek(weekStart, weekEnd).map((date) => ({ date, body: '' })),
      weeklyDraft: '',
    }
  })
  return { ok: true, entries, message: '' }
}

export function weekLabel(weekNumber: number): string {
  return `Week ${weekNumber}`
}

export function formatWeekRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} – ${endDate}`
}
