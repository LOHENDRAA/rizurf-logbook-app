import { describe, expect, it } from 'vitest';
import { addDays, eachDay, formatDMY, isWeekend, mondayOf, monthLabel, todayISO, weekday } from '../../src/core/dates';
import { newId } from '../../src/core/ids';

describe('dates', () => {
  it('knows weekdays (2026-09-25 is a Friday)', () => {
    expect(weekday('2026-09-25')).toBe(5);
    expect(isWeekend('2026-09-26')).toBe(true);
    expect(isWeekend('2026-09-25')).toBe(false);
  });
  it('finds the Monday of a week, across month ends', () => {
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(mondayOf('2026-10-01')).toBe('2026-09-28');
  });
  it('adds days and lists ranges inclusively', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(eachDay('2026-09-29', '2026-09-28')).toEqual([]);
  });
  it('formats for display', () => {
    expect(formatDMY('2026-09-05')).toBe('05/09/2026');
    expect(monthLabel('2026-12')).toBe('December 2026');
  });
  // Review Focus #3: "today" is the user's LOCAL date, not the UTC date.
  it('uses the local date for today, even just after local midnight', () => {
    expect(todayISO(new Date(2026, 8, 25, 0, 30))).toBe('2026-09-25');
    expect(todayISO(new Date(2026, 8, 25, 23, 59))).toBe('2026-09-25');
  });
  it('makes distinct ids', () => {
    expect(newId('ph')).toMatch(/^ph_/);
    expect(newId()).not.toBe(newId());
  });
});
