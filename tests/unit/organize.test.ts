import { describe, expect, it } from 'vitest';
import { MAX_ITEMS, mergeSuggestions, reviewItem, standIn } from '../../src/core/organize';
import type { Item, Suggestions } from '../../src/core/model';

const it_ = (kind: Item['kind'], text: string, status: Item['status'], id = `${kind}-${text}`): Item => ({ id, kind, text, status });
const none: Suggestions = { project: null, activities: [], learning: [], skills: [] };
const view = (items: Item[]) => items.map(i => `${i.status}:${i.kind}:${i.text}`);

describe('mergeSuggestions', () => {
  it('turns fresh suggestions into waiting items', () => {
    const out = mergeSuggestions([], { project: 'ERP gateway', activities: ['Built the login page'], learning: ['CSRF'], skills: ['Web security'] });
    expect(view(out)).toEqual(['suggested:project:ERP gateway', 'suggested:activity:Built the login page', 'suggested:learning:CSRF', 'suggested:skill:Web security']);
    expect(new Set(out.map(i => i.id)).size).toBe(4);
  });
  it('replaces waiting suggestions, keeps accepted ones, and never repeats accepted or rejected ones (ignoring case)', () => {
    const before = [it_('activity', 'Old waiting', 'suggested'), it_('activity', 'Built the login page', 'accepted'), it_('skill', 'Web security', 'rejected')];
    const out = mergeSuggestions(before, { ...none, activities: ['built the LOGIN page ', 'Tested it'], skills: ['web security', 'Testing'] });
    expect(view(out)).toEqual(['accepted:activity:Built the login page', 'rejected:skill:Web security', 'suggested:activity:Tested it', 'suggested:skill:Testing']);
  });
  it('the same text under another kind is not a repeat, and blanks are skipped', () => {
    const out = mergeSuggestions([it_('activity', 'Testing', 'accepted')], { ...none, activities: ['  '], skills: ['Testing'] });
    expect(view(out)).toEqual(['accepted:activity:Testing', 'suggested:skill:Testing']);
  });
  it('over the cap, the oldest rejected items make room first', () => {
    const rejected = Array.from({ length: MAX_ITEMS - 1 }, (_, i) => it_('skill', `R${i}`, 'rejected'));
    const out = mergeSuggestions([it_('activity', 'Kept', 'accepted'), ...rejected], { ...none, activities: ['New 1', 'New 2'] });
    expect(out).toHaveLength(MAX_ITEMS);
    expect(view(out)).toContain('accepted:activity:Kept');
    expect(view(out).slice(-2)).toEqual(['suggested:activity:New 1', 'suggested:activity:New 2']);
    expect(view(out)).not.toContain('rejected:skill:R0');
    expect(view(out)).not.toContain('rejected:skill:R1');
  });
});

describe('reviewItem', () => {
  const items = [it_('project', 'ERP gateway', 'accepted', 'p1'), it_('project', 'Invoices', 'suggested', 'p2'), it_('activity', 'Built it', 'suggested', 'a1')];
  it('accepts, with edited text when given; the original wording is kept as reviewed so it is not suggested again', () => {
    const edited = reviewItem(items, 'a1', 'accept', '  Built the login page ');
    expect(edited.find(i => i.id === 'a1')).toEqual(it_('activity', 'Built the login page', 'accepted', 'a1'));
    expect(view(edited).at(-1)).toBe('rejected:activity:Built it');
    expect(view(mergeSuggestions(edited, { ...none, activities: ['Built it'] }))).not.toContain('suggested:activity:Built it');
    expect(reviewItem(items, 'a1', 'accept', '   ')).toHaveLength(3);
    expect(reviewItem(items, 'a1', 'accept', '   ').find(i => i.id === 'a1')?.text).toBe('Built it');
  });
  it('editing at the cap still keeps the entry within it, dropping the oldest rejected item', () => {
    const full = [...Array.from({ length: MAX_ITEMS - 1 }, (_, i) => it_('skill', `R${i}`, 'rejected')), it_('activity', 'Built it', 'suggested', 'a1')];
    const out = reviewItem(full, 'a1', 'accept', 'Built the login page');
    expect(out).toHaveLength(MAX_ITEMS);
    expect(view(out)).toContain('accepted:activity:Built the login page');
    expect(view(out).at(-1)).toBe('rejected:activity:Built it');
    expect(view(out)).not.toContain('rejected:skill:R0');
  });
  it('rejects', () => {
    expect(reviewItem(items, 'a1', 'reject').find(i => i.id === 'a1')?.status).toBe('rejected');
  });
  it('accepting another project replaces the accepted one', () => {
    expect(view(reviewItem(items, 'p2', 'accept'))).toEqual(['accepted:project:Invoices', 'suggested:activity:Built it']);
  });
});

describe('standIn (the browser demo, no AI)', () => {
  const projects = [{ id: 'p1', name: 'ERP gateway', description: null }, { id: 'p2', name: 'Invoices', description: null }];
  it('makes each sentence an activity (at most 4) and picks the most recently used project', () => {
    const s = standIn('Built the login page. Fixed a bug!\nWrote tests? Met the team. Planned more.', projects, {
      '2026-09-18': { projectId: 'p1' }, '2026-09-21': { projectId: 'p2' }, '2026-09-22': { projectId: null },
    });
    expect(s).toEqual({ project: 'Invoices', activities: ['Built the login page', 'Fixed a bug', 'Wrote tests', 'Met the team'], learning: [], skills: [] });
  });
  it('falls back to the first project, or none', () => {
    expect(standIn('Did it.', projects, {}).project).toBe('ERP gateway');
    expect(standIn('Did it.', [], {}).project).toBeNull();
  });
});
