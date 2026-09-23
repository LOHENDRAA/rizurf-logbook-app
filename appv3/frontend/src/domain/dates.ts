const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isoDateOnly(value: string): string {
  return (value ?? '').slice(0, 10)
}

/** Strict `YYYY-MM-DD` parsing to a UTC-midnight epoch. Returns undefined when invalid. */
export function parseDateUtc(value: string): number | undefined {
  const iso = isoDateOnly((value ?? '').trim())
  const match = DATE_RE.exec(iso)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined
  return time
}

export function isValidDateString(value: string): boolean {
  return parseDateUtc(value) !== undefined
}

export function addDaysUtc(value: string, days: number): string {
  const time = parseDateUtc(value)
  if (time === undefined) throw new Error(`Invalid date: ${value}`)
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10)
}

/** Whole-day difference `to - from` (both `YYYY-MM-DD`, UTC-midnight math). */
export function diffDaysUtc(from: string, to: string): number {
  const a = parseDateUtc(from)
  const b = parseDateUtc(to)
  if (a === undefined || b === undefined) throw new Error(`Invalid date range: ${from} → ${to}`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Monday–Sunday calendar week (`YYYY-MM-DD`) containing `value`.
 * Uses UTC-midnight math consistent with the other helpers.
 */
export function getCalendarWeekRange(value: string): { monday: string; sunday: string } {
  const time = parseDateUtc(value)
  if (time === undefined) throw new Error(`Invalid date: ${value}`)
  const weekday = new Date(time).getUTCDay() // 0 = Sunday … 6 = Saturday
  const offsetToMonday = (weekday + 6) % 7
  const iso = isoDateOnly(value.trim())
  const monday = addDaysUtc(iso, -offsetToMonday)
  const sunday = addDaysUtc(monday, 6)
  return { monday, sunday }
}

/**
 * Human-readable long date (`Tuesday, 15 September 2026`) for a `YYYY-MM-DD`
 * value. Uses UTC-midnight math so the output matches the ISO date
 * regardless of the viewer's time zone.
 */
export function formatLongDate(value: string): string {
  const time = parseDateUtc(value)
  if (time === undefined) throw new Error(`Invalid date: ${value}`)
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(time))
}

/**
 * Short human-readable date (`Jan 5, 2026`) for a `YYYY-MM-DD` value.
 * Uses UTC-midnight math so the output matches the ISO date regardless
 * of the viewer's time zone. Returns the raw input when invalid so the
 * UI never renders blank or crashes.
 */
export function formatShortDate(value: string): string {
  const time = parseDateUtc(value)
  if (time === undefined) return value
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(time))
}

/**
 * Numeric calendar date (`05/01/2026`, DD/MM/YYYY) for a `YYYY-MM-DD` value.
 * Uses UTC-midnight math so the output matches the ISO date regardless
 * of the viewer's time zone. Returns the raw input when invalid so the
 * UI never renders blank or crashes.
 */
export function formatNumericDate(value: string): string {
  const time = parseDateUtc(value)
  if (time === undefined) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(time))
}

/**
 * Full English weekday name (`Monday`) for a `YYYY-MM-DD` value.
 * Uses UTC-midnight math so the output matches the ISO date regardless
 * of the viewer's time zone. Returns the raw input when invalid so the
 * UI never renders blank or crashes.
 */
export function formatWeekdayName(value: string): string {
  const time = parseDateUtc(value)
  if (time === undefined) return value
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(time))
}

/**
 * The programme-local calendar date (`YYYY-MM-DD`) for `now` in `timeZone`.
 * Invalid/unknown time zones fall back to UTC with a console warning.
 */
export function getProgrammeDate(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    if (!lookup.year || !lookup.month || !lookup.day) throw new Error('Incomplete date parts')
    return `${lookup.year}-${lookup.month}-${lookup.day}`
  } catch (error) {
    if (typeof console !== 'undefined') console.warn(`Invalid time zone "${timeZone}"; falling back to UTC.`, error)
    return now.toISOString().slice(0, 10)
  }
}
