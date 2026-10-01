import { describe, expect, it } from 'vitest';
import { journalWeeks } from '../../src/core/journal';

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
