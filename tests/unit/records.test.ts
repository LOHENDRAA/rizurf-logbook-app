import { describe, expect, it } from 'vitest';
import { acceptedRows, learningRows, projectStats, shortDate, skillStats, type Org } from '../../src/core/records';
import type { Item } from '../../src/core/model';

let n = 0;
const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `i${++n}`, kind, text, status });
const projects = [{ id: 'p1', name: 'ERP gateway', description: null }, { id: 'p2', name: 'Invoices', description: null }, { id: 'p3', name: 'Archive', description: null }];
const org: Org = {
  '2026-08-05': { projectId: 'p1', items: [item('project', 'ERP gateway'), item('activity', 'Set up the env'), item('skill', 'data modelling'), item('learning', 'Gateway tests')] },
  '2026-08-06': { projectId: 'p1', items: [item('activity', 'Fixed a bug'), item('activity', 'Waiting', 'suggested'), item('skill', 'Data Modelling ')] },
  '2026-08-07': { projectId: 'p2', items: [item('activity', 'Built export'), item('skill', 'Data modelling'), item('learning', 'Postman'), item('skill', 'Rejected', 'rejected')] },
  '2026-08-08': { projectId: null, items: [item('learning', 'Loose end')] },
};

describe('records', () => {
  it('lists accepted activities, learning and skills newest first, without project items or waiting ones', () => {
    expect(acceptedRows(org).map(r => `${r.date} ${r.kind} ${r.text}`)).toEqual([
      '2026-08-08 learning Loose end',
      '2026-08-07 activity Built export', '2026-08-07 skill Data modelling', '2026-08-07 learning Postman',
      '2026-08-06 activity Fixed a bug', '2026-08-06 skill Data Modelling ',
      '2026-08-05 activity Set up the env', '2026-08-05 skill data modelling', '2026-08-05 learning Gateway tests',
    ]);
  });
  it('counts each project and orders by newest activity, unused projects last by name', () => {
    expect(projectStats(projects, org).map(s => [s.project.name, s.activities, s.learning, s.skills, s.last])).toEqual([
      ['Invoices', 1, 1, 1, '2026-08-07'],
      ['ERP gateway', 2, 1, 1, '2026-08-06'],
      ['Archive', 0, 0, 0, null],
    ]);
  });
  it('merges skills ignoring case, newest spelling, counting the same entries\' accepted items', () => {
    expect(skillStats(org)).toEqual([{
      key: 'data modelling', name: 'Data modelling', projectIds: ['p2', 'p1'], activities: 3, learning: 2, first: '2026-08-05',
      dates: ['2026-08-07', '2026-08-06', '2026-08-05'],
    }]);
  });
  it('filters learning by project, including "No project"', () => {
    expect(learningRows(org, 'all').map(r => r.text)).toEqual(['Loose end', 'Postman', 'Gateway tests']);
    expect(learningRows(org, 'p1').map(r => r.text)).toEqual(['Gateway tests']);
    expect(learningRows(org, 'none').map(r => r.text)).toEqual(['Loose end']);
  });
  it('writes short dates', () => {
    expect(shortDate('2026-08-05')).toBe('5 Aug');
  });
});
