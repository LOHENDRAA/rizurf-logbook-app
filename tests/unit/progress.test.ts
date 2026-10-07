import { describe, expect, it } from 'vitest';
import type { Item, Period, PeriodStatus } from '../../src/core/model';
import { gridCells, logbookCounts, logbookLine, plural, recordCounts, workdaysSoFar, writtenOf } from '../../src/core/progress';

const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `${kind}-${text}`, kind, text, status });

describe('progress', () => {
  it('lists weekdays from the start up to today, stopping at the end date', () => {
    expect(workdaysSoFar('2026-09-16', '2026-09-24', '2026-09-28')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(workdaysSoFar('2026-09-16', null, '2026-09-19')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
    expect(workdaysSoFar('2026-09-16', null, '2026-09-15')).toEqual([]);
  });
  it('counts only listed days with real text as written', () => {
    const days = ['2026-09-17', '2026-09-18'];
    expect(writtenOf(days, { '2026-09-17': 'Did it', '2026-09-18': '   ', '2026-09-19': 'Saturday', '2026-09-10': 'Before the start' })).toBe(1);
  });
  it('pads the first week so each row of five starts on a Monday', () => {
    expect(gridCells(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21'])).toEqual([null, null, '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21']);
    expect(gridCells([])).toEqual([]);
  });
  it('counts started periods by status and names the most urgent other one', () => {
    const p = (key: string, start: string): Period => ({ key, kind: 'weekly', index: 1, start, end: start, label: key, workdays: [] });
    const status: Record<string, PeriodStatus> = { a: 'approved', b: 'approved', c: 'submitted', d: 'draft', e: 'changes_requested' };
    const c = logbookCounts([p('a', '2026-09-01'), p('b', '2026-09-07'), p('c', '2026-09-14'), p('d', '2026-09-21'), p('e', '2026-09-28')], k => status[k], '2026-09-21');
    expect(c).toEqual({ approved: 2, changes: 0, review: 1, draft: 1 });
    expect(logbookLine(c)).toBe('1 in review');
    expect(logbookLine({ approved: 0, changes: 2, review: 1, draft: 0 })).toBe('2 changes requested');
    expect(logbookLine({ approved: 3, changes: 0, review: 0, draft: 0 })).toBe('');
  });
  it('counts accepted records and merges skills ignoring case', () => {
    const org = {
      '2026-09-21': { projectId: 'p1', items: [item('activity', 'Built it'), item('learning', 'Queues'), item('skill', 'SQL'), item('activity', 'Nope', 'rejected')] },
      '2026-09-22': { projectId: 'p2', items: [item('activity', 'Tested it'), item('skill', 'sql')] },
    };
    expect(recordCounts(org)).toEqual({ activities: 2, learning: 1, skills: 1, skillProjects: 2 });
    expect(plural(1, 'learning point')).toBe('1 learning point');
    expect(plural(2, 'activity', 'activities')).toBe('2 activities');
  });
});
