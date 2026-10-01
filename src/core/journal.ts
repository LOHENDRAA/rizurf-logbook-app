import { addDays, mondayOf } from './dates';

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
