import { describe, expect, it } from 'vitest';
import type { Item } from '../../src/core/model';
import { excerpt, searchAll, type SearchData } from '../../src/core/search';

const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `${kind}-${text}`, kind, text, status });
const data: SearchData = {
  entries: { '2026-09-21': 'Built the Invoice export.', '2026-09-22': 'Fixed (a) bug in <b>bold</b> text.', '2026-09-18': 'invoice planning' },
  org: {
    '2026-09-21': { projectId: 'p1', items: [item('learning', 'Invoice totals need rounding'), item('learning', 'Invoice rejected idea', 'rejected'), item('skill', 'Invoice design')] },
  },
  projects: [{ id: 'p1', name: 'Invoice export', description: 'Monthly PDFs' }, { id: 'p2', name: 'Gateway', description: 'Sign-in for INVOICE apps' }],
  reflections: { '2026-09-14': 'Learned invoices.', '2026-09-21': 'Nothing here.' },
};

describe('search', () => {
  it('finds every kind of record ignoring case, in a fixed group order, newest first', () => {
    const groups = searchAll('  INVOICE ', data, true);
    expect(groups.map(g => `${g.name}:${g.hits.length}`)).toEqual(['Journal:2', 'Projects:2', 'Learning:1', 'Skills:1', 'Reflections:1']);
    expect(groups[0].hits.map(h => h.to)).toEqual(['/journal/2026-09-21', '/journal/2026-09-18']);
    expect(groups[1].hits[0]).toEqual({ text: 'Invoice export — Monthly PDFs', meta: '', to: '/projects/p1' });
    expect(groups[2].hits[0]).toEqual({ text: 'Invoice totals need rounding', meta: `${groups[0].hits[0].meta} · Invoice export`, to: '/learning' });
    expect(groups[3].hits[0].to).toBe('/skills/invoice%20design');
    expect(groups[4].hits[0]).toMatchObject({ meta: 'Week of 14 Sept', to: '/reflection/2026-09-14' });
  });
  it('gives supervisors their journal only, drops empty groups, and needs a query', () => {
    expect(searchAll('invoice', data, false).map(g => g.name)).toEqual(['Journal']);
    expect(searchAll('monthly', data, true).map(g => g.name)).toEqual(['Projects']);
    expect(searchAll('   ', data, true)).toEqual([]);
    expect(searchAll('zzz', data, true)).toEqual([]);
  });
  it('treats regex and HTML characters as plain text', () => {
    expect(searchAll('(a)', data, true)[0].hits[0].to).toBe('/journal/2026-09-22');
    expect(searchAll('<b>', data, true)[0].hits).toHaveLength(1);
    expect(excerpt('Fixed (a) bug in <b>bold</b>', '<B>')).toEqual({ before: 'Fixed (a) bug in ', match: '<b>', after: 'bold</b>' });
  });
  it('cuts long text around the first match and marks the cuts', () => {
    expect(excerpt('Built the login page', 'LOGIN')).toEqual({ before: 'Built the ', match: 'login', after: ' page' });
    const long = `${'a '.repeat(100)}needle${' b'.repeat(100)}`;
    const e = excerpt(long, 'needle', 40);
    expect(e.match).toBe('needle');
    expect(e.before.startsWith('…')).toBe(true);
    expect(e.after.endsWith('…')).toBe(true);
    expect((e.before + e.match + e.after).length).toBeLessThanOrEqual(42);
    const start = excerpt(`needle ${'x'.repeat(200)}`, 'needle', 40);
    expect(start.before).toBe('');
    expect(start.after.endsWith('…')).toBe(true);
    expect(excerpt('no match here', 'zzz')).toEqual({ before: 'no match here', match: '', after: '' });
  });
});
