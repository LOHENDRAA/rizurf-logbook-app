import { describe, expect, it } from 'vitest';
import type { Item } from '../../src/core/model';
import { isMonday, reflectionWeeks, weekSummary } from '../../src/core/reflection';

const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `${kind}-${text}`, kind, text, status });

describe('reflection', () => {
  it('knows a real Monday and never throws on junk', () => {
    expect(isMonday('2026-09-21')).toBe(true);
    expect(isMonday('2026-09-22')).toBe(false);
    for (const bad of ['2026-02-30', 'abc', '', '2026-9-21', '2026-13-01']) expect(isMonday(bad)).toBe(false);
  });
  it('allows weeks from the start week up to this week', () => {
    expect(reflectionWeeks('2026-09-03', '2026-09-23')).toEqual({ first: '2026-08-31', last: '2026-09-21' });
    expect(reflectionWeeks(null, '2026-09-23')).toEqual({ first: '2026-09-21', last: '2026-09-21' });
    expect(reflectionWeeks('2026-10-05', '2026-09-23')).toEqual({ first: '2026-09-21', last: '2026-09-21' }); // starts later
  });
  it('sums up a week: days, accepted items, projects in first-use order, and up to three learning points', () => {
    const entries = { '2026-09-21': 'a', '2026-09-22': '  ', '2026-09-23': 'b', '2026-09-27': 'Sunday counts', '2026-09-28': 'next week' };
    const org = {
      '2026-09-21': { projectId: 'p2', items: [item('activity', 'A1'), item('learning', 'L1'), item('learning', 'L2')] },
      '2026-09-23': { projectId: 'p1', items: [item('activity', 'A2'), item('learning', 'L3'), item('learning', 'L4'), item('learning', 'X', 'rejected')] },
      '2026-09-28': { projectId: 'p3', items: [item('activity', 'next week')] },
    };
    const projects = [{ id: 'p1', name: 'ERP', description: null }, { id: 'p2', name: 'Invoices', description: null }, { id: 'p3', name: 'Later', description: null }];
    const s = weekSummary('2026-09-21', entries, org, projects);
    expect(s).toEqual({ days: 3, activities: 2, learning: 4, projects: ['Invoices', 'ERP'], standOut: ['L1', 'L2', 'L3'] });
    expect(weekSummary('2026-09-07', entries, org, projects)).toEqual({ days: 0, activities: 0, learning: 0, projects: [], standOut: [] });
  });
});
