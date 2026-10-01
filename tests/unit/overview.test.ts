import { describe, expect, it } from 'vitest';
import { internshipProgress, needsAttention } from '../../src/core/overview';
import { buildPeriods } from '../../src/core/periods';
import type { PeriodStatus } from '../../src/core/model';

describe('internshipProgress', () => {
  const S = '2026-08-03', E = '2026-09-27'; // 8 weeks, 56 days
  it('during: week N of M and the share of days passed', () => {
    expect(internshipProgress(S, E, '2026-09-25')).toEqual({ state: 'during', week: 8, of: 8, percent: 96, daysToStart: 0 });
    expect(internshipProgress(S, E, S)).toEqual({ state: 'during', week: 1, of: 8, percent: 2, daysToStart: 0 });
    expect(internshipProgress(S, E, '2026-08-10').week).toBe(2); // a Monday starts the next week
  });
  it('before the start: days to go', () => {
    expect(internshipProgress(S, E, '2026-08-01')).toEqual({ state: 'before', week: 0, of: 8, percent: 0, daysToStart: 2 });
  });
  it('after the end: finished', () => {
    expect(internshipProgress(S, E, '2026-10-01')).toEqual({ state: 'after', week: 8, of: 8, percent: 100, daysToStart: 0 });
  });
});

describe('needsAttention', () => {
  const periods = buildPeriods('weekly', '2026-08-03', '2026-09-27');
  const status = (m: Record<string, PeriodStatus>) => (key: string): PeriodStatus => m[key] ?? 'draft';
  it('lists sent-back weeks and overdue drafts, oldest first', () => {
    const [w1, w2, w3, w4] = periods;
    const items = needsAttention(periods, status({ [w1.key]: 'approved', [w2.key]: 'changes_requested', [w3.key]: 'submitted' }), '2026-08-31');
    expect(items).toEqual([
      { key: w2.key, label: 'Week 2 · supervisor requested changes' },
      { key: w4.key, label: 'Week 4 · overdue, not submitted' },
    ]);
  });
  it('a week still running, or in the future, is not overdue', () => {
    expect(needsAttention(periods, status({}), '2026-08-05')).toEqual([]);
  });
});
