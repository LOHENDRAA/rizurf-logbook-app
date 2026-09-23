import type { JournalEntry } from '../types'
import { diffDaysUtc, getCalendarWeekRange } from './dates'

export type InternshipPhase = 'before' | 'active' | 'after'

export interface InternshipLifecycle {
  phase: InternshipPhase
  headline: string
  weeksLabel: string
  weekNumber?: number
  totalWeeks: number
  percent: number
}

/**
 * Internship TIME progress (not journal completion).
 * - before start: "Starts in X days", "0 of N weeks", 0%
 * - during:       "Week X of N", percent = current week / total weeks
 * - after end:    "Internship period completed", "N of N weeks", 100%
 * All date inputs and `programmeToday` are `YYYY-MM-DD`.
 */
export function getInternshipLifecycle(
  startDate: string,
  endDate: string,
  programmeToday: string,
  totalWeeks: number,
): InternshipLifecycle {
  const total = Math.max(0, totalWeeks)
  const startsIn = diffDaysUtc(programmeToday, startDate)
  if (startsIn > 0) {
    return {
      phase: 'before',
      headline: `Starts in ${startsIn} ${startsIn === 1 ? 'day' : 'days'}`,
      weeksLabel: `0 of ${total} weeks`,
      totalWeeks: total,
      percent: 0,
    }
  }
  const endsIn = diffDaysUtc(programmeToday, endDate)
  if (endsIn < 0) {
    return {
      phase: 'after',
      headline: 'Internship period completed',
      weeksLabel: `${total} of ${total} weeks`,
      weekNumber: total > 0 ? total : undefined,
      totalWeeks: total,
      percent: total > 0 ? 100 : 0,
    }
  }
  const elapsed = diffDaysUtc(startDate, programmeToday)
  const weekNumber = total === 0 ? 0 : Math.min(total, Math.floor(elapsed / 7) + 1)
  const percent = total === 0 ? 0 : Math.round((weekNumber / total) * 100)
  return {
    phase: 'active',
    headline: `Week ${weekNumber} of ${total}`,
    weeksLabel: `Week ${weekNumber} of ${total}`,
    weekNumber,
    totalWeeks: total,
    percent,
  }
}

export type WeekAvailability = 'locked' | 'available' | 'overdue'

/**
 * Date-only availability. A week is locked until its start date, and a week
 * that has ended without a submission is derived as overdue (never stored).
 */
export function getWeekAvailability(
  week: Pick<JournalEntry, 'startDate' | 'endDate' | 'status'>,
  programmeToday: string,
): WeekAvailability {
  if (week.startDate > programmeToday) return 'locked'
  if (week.endDate < programmeToday && week.status !== 'submitted') return 'overdue'
  return 'available'
}

export interface JournalWeekGroups {
  /** Unlocked, not-yet-submitted weeks overlapping the current Mon–Sun week, oldest first. */
  currentWeek: JournalEntry[]
  /** Unlocked, not-yet-submitted weeks ending before this week's Monday, oldest first. */
  overdue: JournalEntry[]
  /** Submitted weeks, oldest first. */
  past: JournalEntry[]
  /** Future locked weeks, oldest first. */
  upcoming: JournalEntry[]
}

/**
 * Group entries into current-week, overdue, past, and upcoming buckets, each
 * ordered oldest first by weekNumber:
 * 1. startDate > today → upcoming (future locked, even within this calendar week)
 * 2. otherwise submitted → past
 * 3. otherwise endDate < Monday → overdue
 * 4. otherwise entry overlaps Mon–Sun → current week
 * 5. otherwise (unlocked incomplete starting after Sunday) → upcoming
 */
export function groupJournalWeeks(entries: JournalEntry[], programmeToday: string): JournalWeekGroups {
  const { monday, sunday } = getCalendarWeekRange(programmeToday)
  const currentWeek: JournalEntry[] = []
  const overdue: JournalEntry[] = []
  const past: JournalEntry[] = []
  const upcoming: JournalEntry[] = []
  for (const entry of [...entries].sort((a, b) => a.weekNumber - b.weekNumber)) {
    if (entry.startDate > programmeToday) upcoming.push(entry)
    else if (entry.status === 'submitted') past.push(entry)
    else if (entry.endDate < monday) overdue.push(entry)
    else if (entry.startDate <= sunday && entry.endDate >= monday) currentWeek.push(entry)
    else upcoming.push(entry)
  }
  return { currentWeek, overdue, past, upcoming }
}
