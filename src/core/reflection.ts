import type { Project } from './model';
import { acceptedRows, type Org } from './records';
import { addDays, ISO_RE, mondayOf, parseISO } from './dates';

/** A real calendar date that falls on a Monday; anything else (including junk) is false, never an error. */
export function isMonday(d: string): boolean {
  if (!ISO_RE.test(d)) return false;
  const t = parseISO(d);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d && t.getUTCDay() === 1;
}

/** The Mondays a reflection may be written for: the start week up to this week. */
export function reflectionWeeks(start: string | null, today: string): { first: string; last: string } {
  const last = mondayOf(today);
  const first = start ? mondayOf(start) : last;
  return { first: first < last ? first : last, last };
}

export interface WeekSummary { days: number; activities: number; learning: number; projects: string[]; standOut: string[] }

/** What the intern recorded in the week starting `week` (Monday to Sunday). */
export function weekSummary(week: string, entries: Record<string, string>, org: Org, projects: Project[]): WeekSummary {
  const end = addDays(week, 6);
  const inWeek = (d: string) => d >= week && d <= end;
  const dates = Object.keys(org).filter(inWeek).sort();
  const rows = dates.flatMap(d => acceptedRows({ [d]: org[d] }));
  const learning = rows.filter(r => r.kind === 'learning');
  const ids = [...new Set(dates.map(d => org[d].projectId).filter((id): id is string => !!id))];
  return {
    days: Object.keys(entries).filter(d => inWeek(d) && entries[d].trim()).length,
    activities: rows.filter(r => r.kind === 'activity').length,
    learning: learning.length,
    projects: ids.map(id => projects.find(p => p.id === id)?.name).filter((n): n is string => !!n),
    standOut: learning.slice(0, 3).map(r => r.text),
  };
}
