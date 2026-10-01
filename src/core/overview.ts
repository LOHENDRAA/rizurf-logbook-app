import type { Period, PeriodStatus } from './model';
import { mondayOf, parseISO } from './dates';

export interface Progress { state: 'before' | 'during' | 'after'; week: number; of: number; percent: number; daysToStart: number }

const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
const UNIT = { daily: 'Day', weekly: 'Week', monthly: 'Month' } as const;

/** Where today falls in the internship: week N of M (Monday-to-Sunday weeks from the start) and the share of days passed. */
export function internshipProgress(start: string, end: string, today: string): Progress {
  const of = daysBetween(mondayOf(start), mondayOf(end)) / 7 + 1;
  if (today < start) return { state: 'before', week: 0, of, percent: 0, daysToStart: daysBetween(today, start) };
  if (today > end) return { state: 'after', week: of, of, percent: 100, daysToStart: 0 };
  const percent = Math.round(((daysBetween(start, today) + 1) / (daysBetween(start, end) + 1)) * 100);
  return { state: 'during', week: daysBetween(mondayOf(start), mondayOf(today)) / 7 + 1, of, percent, daysToStart: 0 };
}

/** Periods the intern should act on: sent back by the supervisor, or ended and still a draft. */
export function needsAttention(periods: Period[], statusOf: (key: string) => PeriodStatus, today: string) {
  return periods.flatMap(p => {
    const s = statusOf(p.key);
    const name = `${UNIT[p.kind]} ${p.index}`;
    if (s === 'changes_requested') return [{ key: p.key, label: `${name} · supervisor requested changes` }];
    if (s === 'draft' && p.end < today) return [{ key: p.key, label: `${name} · overdue, not submitted` }];
    return [];
  });
}
