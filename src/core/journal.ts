import { addDays, mondayOf } from './dates';

/** `name` replaces "Week n" in the picker: '' shows the dates alone. */
export interface JournalWeek { n: number; start: string; end: string; name?: string }

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

/**
 * A journal with no start date (a supervisor's): the last `count` weeks, or back to the earliest entry, newest
 * first and named by date, since "Week 1" means nothing without a start.
 */
export function recentWeeks(entryDates: string[], today: string, count = 12): JournalWeek[] {
  const thisWeek = mondayOf(today);
  const first = [addDays(thisWeek, -7 * (count - 1)), ...entryDates.map(mondayOf)].sort()[0];
  const out: JournalWeek[] = [];
  for (let m = thisWeek, n = 1; m >= first; m = addDays(m, -7), n++) {
    out.push({ n, start: m, end: addDays(m, 6), name: n === 1 ? 'This week' : n === 2 ? 'Last week' : '' });
  }
  return out;
}
