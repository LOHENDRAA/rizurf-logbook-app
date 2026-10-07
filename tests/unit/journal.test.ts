import { describe, expect, it } from 'vitest';
import { isWritableDay, journalWeeks, searchEntries, writtenThisWeek } from '../../src/core/journal';

const TODAY = '2026-10-01'; // a Thursday; its week starts Monday 2026-09-28

describe('journalWeeks', () => {
  it('numbers weeks from the Monday of the start date up to this week', () => {
    const w = journalWeeks('2026-08-05', [], TODAY);
    expect(w[0]).toEqual({ n: 1, start: '2026-08-03', end: '2026-08-09' });
    expect(w.at(-1)).toEqual({ n: 9, start: '2026-09-28', end: '2026-10-04' });
    expect(w).toHaveLength(9);
  });
  it('without a start date, starts at the week of the earliest entry', () => {
    const w = journalWeeks(null, ['2026-09-16', '2026-09-10'], TODAY);
    expect(w.map(x => x.start)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });
  it('with nothing at all, is just this week', () => {
    expect(journalWeeks(null, [], TODAY)).toEqual([{ n: 1, start: '2026-09-28', end: '2026-10-04' }]);
  });
  it('a start date in the future gives just this week', () => {
    expect(journalWeeks('2026-11-02', [], TODAY)).toEqual([{ n: 1, start: '2026-09-28', end: '2026-10-04' }]);
  });
  it('never hides an entry written before the start date', () => {
    expect(journalWeeks('2026-09-21', ['2026-09-10'], TODAY)[0]).toEqual({ n: 1, start: '2026-09-07', end: '2026-09-13' });
  });
});

describe('searchEntries', () => {
  const entries = { '2026-10-05': 'Reviewed SUPPLIER sheets', '2026-10-07': 'Sprint planning', '2026-10-06': '  ', '2026-09-30': 'supplier call' };
  it('matches any case, newest first, skipping blank days', () => {
    expect(searchEntries(entries, 'supplier').map(e => e.date)).toEqual(['2026-10-05', '2026-09-30']);
  });
  it('a blank query lists every written day, newest first', () => {
    expect(searchEntries(entries, '  ').map(e => e.date)).toEqual(['2026-10-07', '2026-10-05', '2026-09-30']);
  });
});

describe('writtenThisWeek', () => {
  const entries = { '2026-10-05': 'a', '2026-10-07': 'b', '2026-10-04': 'weekend' };
  it("counts this week's weekdays up to today", () => {
    expect(writtenThisWeek(entries, '2026-10-07')).toEqual({ written: 2, of: 3 });
  });
  it('stays within the internship dates when given', () => {
    expect(writtenThisWeek(entries, '2026-10-07', { start: '2026-10-06', end: '2026-12-01' })).toEqual({ written: 1, of: 2 });
    expect(writtenThisWeek(entries, '2026-10-07', { start: '2026-10-01', end: '2026-10-05' })).toEqual({ written: 1, of: 1 });
  });
});

describe('isWritableDay', () => {
  it('takes real days up to today only', () => {
    expect(isWritableDay('2026-10-07', '2026-10-07')).toBe(true);
    expect(isWritableDay('2026-02-28', '2026-10-07')).toBe(true);
    expect(isWritableDay('2026-10-08', '2026-10-07')).toBe(false);
    expect(isWritableDay('2026-02-30', '2026-10-07')).toBe(false);
    expect(isWritableDay('2026-13-40', '2026-10-07')).toBe(false);
    expect(isWritableDay('yesterday', '2026-10-07')).toBe(false);
  });
});
