import { countWords } from './journal'
import { weekdaysInWeek } from './daily'

export interface WeeklyReadiness {
  weekEnded: boolean
  requiredCount: number
  completedCount: number
  allDailyComplete: boolean
  missingDates: string[]
  words: number
  canSubmit: boolean
  reasons: string[]
}

/** Required workday dates: always the Monday–Friday dates inside the week range. */
export function requiredDailyDates(entry: { startDate: string; endDate: string; dailyEntries?: { date: string }[] }): string[] {
  void entry.dailyEntries
  return weekdaysInWeek(entry.startDate, entry.endDate)
}

/** Working weekly text: the draft, never the supervisor snapshot. */
export function workingWeeklyText(entry: { weeklyDraft?: string }): string {
  return entry.weeklyDraft ?? ''
}

/** Supervisor-visible snapshot of the submitted weekly report. */
export function submittedBodyOf(entry: { submittedBody?: string }): string {
  return entry.submittedBody ?? ''
}

/** A required daily counts as filled when its body has non-whitespace text. */
export function isDailyFilled(day: { body?: string }): boolean {
  return (day.body ?? '').trim().length > 0
}

/**
 * Submission readiness for a weekly report: any non-empty weekly draft only.
 * Daily logs are a separate optional record and never gate submission.
 * Interns may submit before the week ends; `weekEnded` is informational only
 * and never gates submission. Daily counts below are informational only.
 * `words` is informational only (supervisor displays).
 */
export function getWeeklyReadiness(
  entry: { startDate: string; endDate: string; weeklyDraft?: string; dailyEntries?: { date: string; body?: string }[] },
  programmeToday: string,
): WeeklyReadiness {
  const weekEnded = programmeToday > entry.endDate
  const required = requiredDailyDates(entry)
  const filledBy = new Map((entry.dailyEntries ?? []).map((day) => [day.date, isDailyFilled(day)]))
  const missingDates = required.filter((date) => filledBy.get(date) !== true)
  const words = countWords(entry.weeklyDraft ?? '')
  const allDailyComplete = missingDates.length === 0
  const reasons: string[] = []
  const hasWeeklyText = (entry.weeklyDraft ?? '').trim().length > 0
  if (!hasWeeklyText) reasons.push('Weekly report must not be empty.')
  return {
    weekEnded,
    requiredCount: required.length,
    completedCount: required.length - missingDates.length,
    allDailyComplete,
    missingDates,
    words,
    canSubmit: hasWeeklyText,
    reasons,
  }
}
