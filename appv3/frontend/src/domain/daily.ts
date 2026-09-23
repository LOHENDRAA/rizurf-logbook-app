import { addDaysUtc, diffDaysUtc, isValidDateString, parseDateUtc } from './dates'
import { getWeekAvailability } from './internship'
import type { JournalEntry } from '../types'

/** Weekend check via UTC-midnight math (0 = Sunday … 6 = Saturday). */
export function isWeekday(date: string): boolean {
  const time = parseDateUtc(date)
  if (time === undefined) throw new Error(`Invalid date: ${date}`)
  const day = new Date(time).getUTCDay()
  return day >= 1 && day <= 5
}

/**
 * Required workdays: Monday–Friday dates inside `[startDate, endDate]`.
 * Periods with zero weekdays require nothing (returns []).
 */
export function weekdaysInWeek(startDate: string, endDate: string): string[] {
  const start = parseDateUtc(startDate)
  const end = parseDateUtc(endDate)
  if (start === undefined || end === undefined) throw new Error(`Invalid date range: ${startDate} → ${endDate}`)
  if (end < start) return []
  const total = diffDaysUtc(startDate, endDate) + 1
  const days: string[] = []
  for (let offset = 0; offset < total; offset += 1) {
    const date = addDaysUtc(startDate, offset)
    if (isWeekday(date)) days.push(date)
  }
  return days
}

/**
 * Owning week for a calendar date: the entry whose inclusive
 * `[startDate, endDate]` range contains `date` (ISO lexicographic compare).
 * Returns undefined when no week covers the date (outside schedule).
 */
export function findOwningEntry<T extends Pick<JournalEntry, 'startDate' | 'endDate'>>(
  entries: T[],
  date: string,
): T | undefined {
  return entries.find((entry) => date >= entry.startDate && date <= entry.endDate)
}

/**
 * A date is openable when it is a valid `YYYY-MM-DD` weekday inside the
 * owning week's range, not in the future (`date <= programmeToday`), and the
 * owning week itself is not locked. Missing records that satisfy these rules
 * are valid (rendered as an empty editor, created on first edit).
 */
export function isDateAvailable(
  date: string,
  entry: Pick<JournalEntry, 'startDate' | 'endDate' | 'status'>,
  programmeToday: string,
): boolean {
  if (!isValidDateString(date)) return false
  try {
    if (!isWeekday(date)) return false
  } catch {
    return false
  }
  if (date < entry.startDate || date > entry.endDate) return false
  if (date > programmeToday) return false
  return getWeekAvailability(entry, programmeToday) !== 'locked'
}

/**
 * Overall available window for the native date input (`min`/`max`): the
 * earliest and latest openable weekday across non-locked weeks
 * (`date <= programmeToday`). Returns undefined when nothing is available.
 */
export function getAvailableDateRange(
  entries: Pick<JournalEntry, 'startDate' | 'endDate' | 'status'>[],
  programmeToday: string,
): { min: string; max: string } | undefined {
  const available: string[] = []
  for (const entry of entries) {
    if (getWeekAvailability(entry, programmeToday) === 'locked') continue
    for (const date of weekdaysInWeek(entry.startDate, entry.endDate)) {
      if (date <= programmeToday) available.push(date)
    }
  }
  if (available.length === 0) return undefined
  available.sort()
  return { min: available[0], max: available[available.length - 1] }
}

export type DailyAvailability = 'locked' | 'available' | 'readonly'

/**
 * Daily availability (programme-local `YYYY-MM-DD` comparison):
 * daily logs are a separate optional record and stay editable regardless of
 * weekly submission state. Parameters beyond availability are kept for
 * call-site compatibility only.
 */
export function getDailyAvailability(dailyDate: string, programmeToday: string, weekSubmitted: boolean): DailyAvailability {
  void dailyDate
  void programmeToday
  void weekSubmitted
  return 'available'
}
