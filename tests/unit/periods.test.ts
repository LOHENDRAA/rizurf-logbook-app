import { describe, expect, it } from 'vitest';
import { buildPeriods, periodForDate, periodName } from '../../src/core/periods';

describe('buildPeriods', () => {
  it('weekly: Monday-keyed blocks trimmed to the internship, starting mid-week', () => {
    const p = buildPeriods('weekly', '2026-09-23', '2026-10-06');
    expect(p.map(x => x.key)).toEqual(['w:2026-09-21', 'w:2026-09-28', 'w:2026-10-05']);
    expect(p[0]).toMatchObject({ index: 1, start: '2026-09-23', end: '2026-09-27', workdays: ['2026-09-23', '2026-09-24', '2026-09-25'] });
    expect(p[1].workdays).toHaveLength(5);
    expect(p[2]).toMatchObject({ start: '2026-10-05', end: '2026-10-06' });
    expect(p[0].label).toBe('Week 1 · 23/09/2026 – 27/09/2026');
  });
  it('monthly: calendar months across a year boundary', () => {
    const p = buildPeriods('monthly', '2026-12-15', '2027-01-10');
    expect(p.map(x => x.key)).toEqual(['m:2026-12', 'm:2027-01']);
    expect(p[0].label).toBe('Month 1 · December 2026');
    expect(p[1]).toMatchObject({ start: '2027-01-01', end: '2027-01-10' });
  });
  it('daily: one period per weekday, skipping weekends', () => {
    const p = buildPeriods('daily', '2026-09-25', '2026-09-28');
    expect(p.map(x => x.key)).toEqual(['d:2026-09-25', 'd:2026-09-28']);
    expect(p[1]).toMatchObject({ index: 2, workdays: ['2026-09-28'] });
  });
  it('handles a single-day internship', () => {
    expect(buildPeriods('weekly', '2026-09-24', '2026-09-24')).toHaveLength(1);
  });
  it('rejects reversed or malformed dates', () => {
    expect(() => buildPeriods('weekly', '2026-10-01', '2026-09-01')).toThrow('End date must be on or after the start date');
    expect(() => buildPeriods('weekly', '01/09/2026', '2026-09-30')).toThrow('YYYY-MM-DD');
  });
  it('finds the period containing a date', () => {
    const p = buildPeriods('weekly', '2026-09-23', '2026-10-06');
    expect(periodForDate(p, '2026-09-30')?.key).toBe('w:2026-09-28');
    expect(periodForDate(p, '2026-11-01')).toBeUndefined();
  });
});

describe('periodName', () => {
  it('names a period by its kind and number', () => {
    expect(periodName(buildPeriods('weekly', '2026-09-21', '2026-10-09')[1])).toBe('Week 2');
    expect(periodName(buildPeriods('monthly', '2026-08-03', '2026-10-09')[1])).toBe('Month 2');
    expect(periodName(buildPeriods('daily', '2026-09-21', '2026-09-25')[2])).toBe('Day 3');
  });
});
