import { describe, expect, it } from 'vitest';
import type { Placeholder, ReviewAction } from '../../src/core/model';
import { buildPeriods } from '../../src/core/periods';
import { autofill, dayDate, resolveValues, signatureValue, sourceValue } from '../../src/core/autofill';

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
