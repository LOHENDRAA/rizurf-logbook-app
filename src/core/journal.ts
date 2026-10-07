import { addDays, eachDay, isWeekend, mondayOf } from './dates';

export interface JournalWeek { n: number; start: string; end: string }

/**
 * The journal's weeks, Week 1 first, up to the week containing today. Week 1 starts on the Monday of the
 * earliest of: the start date, any entry, and today, so a future start date still shows this week and an
 * entry written before the start date is never hidden.
 */
export function journalWeeks(startDate: string | null, entryDates: string[], today: string): JournalWeek[] {
  const first = [startDate ?? today, ...entryDates, today].sort()[0];
  const out: JournalWeek[] = [];
  for (let m = mondayOf(first), n = 1; m <= mondayOf(today); m = addDays(m, 7), n++) out.push({ n, start: m, end: addDays(m, 6) });
  return out;
}

/** Written days matching `query` (any case), newest first; a blank query lists them all. */
export function searchEntries(entries: Record<string, string>, query: string): { date: string; text: string }[] {
  const q = query.trim().toLowerCase();
  return Object.entries(entries)
    .filter(([, text]) => text.trim() && (!q || text.toLowerCase().includes(q)))
    .map(([date, text]) => ({ date, text }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** "Written on N of M days": this week's weekdays up to today (inside `range` when given), and how many have an entry. */
export function writtenThisWeek(entries: Record<string, string>, today: string, range?: { start: string; end: string }) {
  const days = eachDay(mondayOf(today), today).filter(d => !isWeekend(d) && (!range || (d >= range.start && d <= range.end)));
  return { written: days.filter(d => entries[d]?.trim()).length, of: days.length };
}

/** A real calendar day, written YYYY-MM-DD, no later than today. */
export function isWritableDay(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date && date <= today;
}
