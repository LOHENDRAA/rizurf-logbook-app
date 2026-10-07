import type { Period, PeriodStatus } from './model';
import { acceptedRows, skillStats, type Org } from './records';
import { eachDay, isWeekend, weekday } from './dates';

/** Monday–Friday from `start` up to today, stopping at `end`. Empty before the start. */
export function workdaysSoFar(start: string, end: string | null, today: string): string[] {
  const last = end && end < today ? end : today;
  return last < start ? [] : eachDay(start, last).filter(d => !isWeekend(d));
}

/** How many of `days` have real text. */
export const writtenOf = (days: string[], entries: Record<string, string>): number => days.filter(d => entries[d]?.trim()).length;

/** Consecutive workdays, padded so each row of five starts on a Monday. */
export const gridCells = (days: string[]): (string | null)[] => (days.length ? [...Array<null>(weekday(days[0]) - 1).fill(null), ...days] : []);

export interface LogbookCounts { approved: number; changes: number; review: number; draft: number }

/** Periods that have started, by status. */
export function logbookCounts(periods: Period[], statusOf: (key: string) => PeriodStatus, today: string): LogbookCounts {
  const c: LogbookCounts = { approved: 0, changes: 0, review: 0, draft: 0 };
  for (const p of periods) {
    if (p.start > today) continue;
    const s = statusOf(p.key);
    c[s === 'approved' ? 'approved' : s === 'changes_requested' ? 'changes' : s === 'submitted' ? 'review' : 'draft']++;
  }
  return c;
}

/** The line under "N approved": the first non-zero of changes, review, draft. */
export function logbookLine(c: LogbookCounts): string {
  if (c.changes) return `${c.changes} changes requested`;
  if (c.review) return `${c.review} in review`;
  return c.draft ? `${c.draft} draft` : '';
}

export function recordCounts(org: Org) {
  const rows = acceptedRows(org);
  const skills = skillStats(org);
  return {
    activities: rows.filter(r => r.kind === 'activity').length,
    learning: rows.filter(r => r.kind === 'learning').length,
    skills: skills.length,
    skillProjects: new Set(skills.flatMap(s => s.projectIds)).size,
  };
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
