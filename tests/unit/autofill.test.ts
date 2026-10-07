import { describe, expect, it } from 'vitest';
import type { Placeholder, ReviewAction } from '../../src/core/model';
import { buildPeriods } from '../../src/core/periods';
import { autofill, boxKind, boxSource, dayDate, resolveValues, signatureValue, sourceTag, sourceValue, weekSources } from '../../src/core/autofill';
import type { Item } from '../../src/core/model';
import type { Org } from '../../src/core/records';

const cell = { kind: 'docx-cell' as const, table: [0], row: 0, col: 0 };
const ph = (id: string, extra: Partial<Placeholder>): Placeholder =>
  ({ id, label: id, binding: 'free', source: 'label', region: 'unit', anchor: cell, ...extra });

// Week 1 is trimmed: the internship starts Wednesday 2026-09-23.
const week1 = buildPeriods('weekly', '2026-09-23', '2026-10-06')[0];
const notes = { '2026-09-23': 'Wed notes', '2026-09-24': 'Thu notes' };

describe('dayDate', () => {
  it('nth mode counts working days inside the trimmed period', () => {
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 0 }), week1)).toBe('2026-09-23');
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 4 }), week1)).toBeNull();
  });
  it('weekday mode counts from Monday and returns null outside the internship', () => {
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 0, dayMode: 'weekday' }), week1)).toBeNull();
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 2, dayMode: 'weekday' }), week1)).toBe('2026-09-23');
  });
});

describe('sourceValue', () => {
  it('fills dates by role', () => {
    expect(sourceValue(ph('d', { binding: 'date', dayIndex: 1 }), week1, notes)).toBe('24/09/2026');
    expect(sourceValue(ph('d', { binding: 'date', dateRole: 'start' }), week1, notes)).toBe('23/09/2026');
    expect(sourceValue(ph('d', { binding: 'date', dateRole: 'end' }), week1, notes)).toBe('27/09/2026');
    expect(sourceValue(ph('d', { binding: 'date', dateRole: 'number' }), week1, notes)).toBe('1');
    expect(sourceValue(ph('d', { binding: 'date' }), week1, notes)).toBe('23/09/2026 – 27/09/2026');
  });
  it('does not autofill cover, free or signature placeholders', () => {
    for (const binding of ['free', 'signature'] as const) expect(sourceValue(ph('x', { binding }), week1, notes)).toBeNull();
    expect(sourceValue(ph('x', { binding: 'daily', region: 'cover', dayIndex: 0 }), week1, notes)).toBeNull();
  });
  it('fills a period answer with the whole week of notes as bullet points, skipping empty days', () => {
    expect(sourceValue(ph('x', { binding: 'period' }), week1, notes)).toBe('• Wed 23/09/2026: Wed notes\n• Thu 24/09/2026: Thu notes');
  });
});

describe('autofill', () => {
  const phs = [ph('mon', { binding: 'daily', dayIndex: 0 }), ph('tue', { binding: 'daily', dayIndex: 1 }), ph('q', { binding: 'period' })];
  it('fills empty fields and records what it used', () => {
    const r = autofill(phs, week1, notes, {}, {});
    const week = '• Wed 23/09/2026: Wed notes\n• Thu 24/09/2026: Thu notes';
    expect(r.values).toEqual({ mon: 'Wed notes', tue: 'Thu notes', q: week });
    expect(r.autofilled).toEqual({ mon: 'Wed notes', tue: 'Thu notes', q: week });
  });
  it('never overwrites a field the student edited', () => {
    const r = autofill(phs, week1, { ...notes, '2026-09-23': 'New' }, { mon: 'My own words' }, { mon: 'Wed notes' });
    expect(r.values.mon).toBe('My own words');
  });
  it('refreshes a field that still holds the previous autofill', () => {
    const r = autofill(phs, week1, { ...notes, '2026-09-23': 'New' }, { mon: 'Wed notes' }, { mon: 'Wed notes' });
    expect(r.values.mon).toBe('New');
    expect(r.autofilled.mon).toBe('New');
  });
});

describe('resolveValues', () => {
  const approval: ReviewAction = { id: 'r', studentId: 's', periodKey: 'w:x', action: 'approve', by: 'Supervisor', signature: 'Nur Aziz', at: new Date(2026, 8, 30, 10).toISOString() };
  it('takes cover, period and signature values from the right source', () => {
    const phs = [
      ph('name', { binding: 'cover', region: 'cover' }),
      ph('task', { binding: 'daily', dayIndex: 0 }),
      ph('sig', { binding: 'signature', label: 'Supervisor signature' }),
      ph('sigdate', { binding: 'signature', label: 'Date' }),
    ];
    expect(resolveValues(phs, { name: 'Aina' }, { task: 'Did things', name: 'ignored' }, approval))
      .toEqual({ name: 'Aina', task: 'Did things', sig: 'Nur Aziz', sigdate: '30/09/2026' });
  });
  it('leaves signatures blank before approval', () => {
    expect(signatureValue(ph('sig', { binding: 'signature' }))).toBe('');
  });
});

describe('filling from accepted items', () => {
  let n = 0;
  const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `i${++n}`, kind, text, status });
  const typeBox = ph('t', { binding: 'period', label: 'Type (s) & Objective(s) of the Activities' });
  const contentBox = ph('c', { binding: 'period', label: 'Content: describe the technical and non-technical knowledge, skills, and experiences developed' });
  const org = {
    '2026-09-23': { projectId: null, items: [item('activity', 'Built the login page'), item('skill', 'Unit testing'), item('learning', 'CSRF tokens'), item('activity', 'Waiting', 'suggested')] },
    '2026-09-24': { projectId: null, items: [item('activity', 'Fixed a redirect bug'), item('skill', 'unit TESTING'), item('skill', 'API design'), item('learning', 'Rejected', 'rejected')] },
    '2026-10-01': { projectId: null, items: [item('activity', 'Next week')] },
  };

  it('tells learning boxes from activity boxes by their label', () => {
    expect(boxKind(typeBox)).toBe('activity');
    expect(boxKind(contentBox)).toBe('learning');
    expect(boxKind(ph('x', { binding: 'period', label: 'Lessons this week' }))).toBe('learning');
  });
  it('fills activity boxes with the week\'s accepted activities, in date order', () => {
    expect(sourceValue(typeBox, week1, notes, org)).toBe('• Built the login page\n• Fixed a redirect bug');
  });
  it('fills learning boxes with learning points, then the skills once each', () => {
    expect(sourceValue(contentBox, week1, notes, org)).toBe('• CSRF tokens\nSkills: Unit testing, API design');
  });
  it('a learning box with only skills shows just the Skills line', () => {
    const skillsOnly = { '2026-09-23': { projectId: null, items: [item('skill', 'Data modelling')] } };
    expect(sourceValue(contentBox, week1, notes, skillsOnly)).toBe('Skills: Data modelling');
    expect(boxSource(contentBox, week1, skillsOnly)).toEqual({ from: 'learning', count: 0 });
  });
  it('falls back to the journal when the week has none of that kind, and without org behaves as before', () => {
    const journalOnly = sourceValue(typeBox, week1, notes);
    expect(sourceValue(typeBox, week1, notes, {})).toBe(journalOnly);
    expect(journalOnly).toContain('Wed notes');
    expect(boxSource(typeBox, week1, {})).toEqual({ from: 'journal', count: 0 });
  });
  it('tags each box with where its text came from', () => {
    expect(boxSource(typeBox, week1, org)).toEqual({ from: 'activity', count: 2 });
    expect(boxSource(contentBox, week1, org)).toEqual({ from: 'learning', count: 1 });
    expect(boxSource(ph('d', { binding: 'daily', dayIndex: 0 }), week1, org)).toEqual({ from: 'journal', count: 0 });
    expect(boxSource(ph('x', { binding: 'date', dateRole: 'start' }), week1, org)).toBeNull();
  });
  it('autofill uses accepted items and still keeps the intern\'s edits', () => {
    const first = autofill([typeBox], week1, notes, {}, {}, org);
    expect(first.values.t).toBe('• Built the login page\n• Fixed a redirect bug');
    const edited = { ...first.values, t: 'My own words' };
    expect(autofill([typeBox], week1, notes, edited, first.autofilled, {}).values.t).toBe('My own words');
  });
  it('counts the week\'s sources: days written, accepted activities and learning', () => {
    expect(weekSources(week1, notes, org)).toEqual({ days: 2, activities: 2, learning: 1 });
    expect(weekSources(week1, {}, {})).toEqual({ days: 0, activities: 0, learning: 0 });
  });
});

describe('sourceTag', () => {
  const typeBox = ph('t', { binding: 'period', label: 'Type & Objective of the Activities' });
  const contentBox = ph('c', { binding: 'period', label: 'Knowledge and skills' });
  const acc = (kind: 'activity' | 'learning' | 'skill', text: string) => ({ id: `${kind}-${text}`, kind, text, status: 'accepted' as const });
  const org = { '2026-09-23': { projectId: null, items: [acc('activity', 'Built it'), acc('activity', 'Tested it'), acc('skill', 'Testing')] } };
  const filled = (box: Placeholder, o: Org = org) => { const v = sourceValue(box, week1, notes, o)!; return { values: { [box.id]: v }, autofilled: { [box.id]: v } }; };

  it('names the records the box was filled from', () => {
    const f = filled(typeBox);
    expect(sourceTag(typeBox, week1, notes, org, f.values, f.autofilled)).toBe('From 2 accepted activities');
    const c = filled(contentBox);
    expect(sourceTag(contentBox, week1, notes, org, c.values, c.autofilled)).toBe('From accepted skills');
  });
  it('says From journal for journal text, even after items were accepted later', () => {
    const f = filled(typeBox, {});
    expect(sourceTag(typeBox, week1, notes, org, f.values, f.autofilled)).toBe('From journal');
  });
  it('says Filled earlier when the records have changed since', () => {
    const f = filled(typeBox);
    const fewer = { '2026-09-23': { projectId: null, items: [acc('activity', 'Built it')] } };
    expect(sourceTag(typeBox, week1, notes, fewer, f.values, f.autofilled)).toBe('Filled earlier');
  });
  it('has no tag once the intern changed the box, or for boxes never filled', () => {
    const f = filled(typeBox);
    expect(sourceTag(typeBox, week1, notes, org, { t: 'Mine' }, f.autofilled)).toBeNull();
    expect(sourceTag(typeBox, week1, notes, org, {}, {})).toBeNull();
  });
});
