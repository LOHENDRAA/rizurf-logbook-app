import { describe, expect, it } from 'vitest';
import type { Placeholder, ReviewAction } from '../../src/core/model';
import { approveFill, canChangeSetup, changedSince, emptyFill, emptyRequired, isLocked, latestAction, requestChangesFill, sentCopy, submitFill } from '../../src/core/workflow';

const now = new Date('2026-09-25T03:00:00Z');

describe('workflow', () => {
  it('a submit keeps a copy of the answers it sent', () => {
    const fill = { ...emptyFill('s1', 'k', 'tpl'), values: { a: 'Built it' } };
    const { action } = submitFill(fill, 'A', now);
    expect(action.values).toEqual({ a: 'Built it' });
    fill.values.a = 'changed later';
    expect(action.values).toEqual({ a: 'Built it' }); // a copy, not the same object
  });
  it('lists the boxes whose answers changed, ignoring cover fields, signatures and outer spaces', () => {
    const anchor = { kind: 'pdf' as const, page: 0, x: 0, y: 0, w: 1, h: 1 };
    const p = (id: string, extra: Partial<Placeholder> = {}): Placeholder => ({ id, label: id.toUpperCase(), binding: 'period', source: 'label', region: 'unit', anchor, ...extra });
    const phs = [p('a'), p('b'), p('c'), p('name', { binding: 'cover', region: 'cover' }), p('sig', { binding: 'signature' })];
    expect(changedSince({ a: 'x', b: 'same ', name: 'N' }, { a: 'y', b: 'same', c: 'new', name: 'M', sig: 'S' }, phs).map(x => x.id)).toEqual(['a', 'c']);
    expect(changedSince({ a: 'x' }, { a: 'x' }, phs)).toEqual([]);
  });
  it('treats a missing or empty copy as no copy', () => {
    const submit = (values?: Record<string, string>): ReviewAction => ({ id: 'x', studentId: 's', periodKey: 'k', action: 'submit', by: 'A', at: '', ...(values ? { values } : {}) });
    expect(sentCopy(undefined)).toBeNull();
    expect(sentCopy(submit())).toBeNull();
    expect(sentCopy(submit({}))).toBeNull();
    expect(sentCopy(submit({ a: 'x' }))).toEqual({ a: 'x' });
  });
  it('submits a draft and locks it', () => {
    const { fill, action } = submitFill(emptyFill('s1', 'w:2026-09-21', 'tpl'), 'Aina Rahman', now);
    expect(fill.status).toBe('submitted');
    expect(fill.submittedAt).toBe(now.toISOString());
    expect(action).toMatchObject({ action: 'submit', by: 'Aina Rahman', studentId: 's1', periodKey: 'w:2026-09-21' });
    expect(isLocked(fill)).toBe(true);
  });
  it('approves only submitted periods and needs a typed name', () => {
    const submitted = submitFill(emptyFill('s1', 'k', 'tpl'), 'A', now).fill;
    expect(() => approveFill(submitted, 'Supervisor', '   ', now)).toThrow('Type your full name');
    const { fill, action } = approveFill(submitted, 'Supervisor', 'Nur Aziz', now);
    expect(fill.status).toBe('approved');
    expect(action.signature).toBe('Nur Aziz');
    expect(() => approveFill(emptyFill('s1', 'k', 'tpl'), 'Supervisor', 'X', now)).toThrow("isn't waiting for review");
  });
  it('requests changes with a comment and allows resubmission', () => {
    const submitted = submitFill(emptyFill('s1', 'k', 'tpl'), 'A', now).fill;
    expect(() => requestChangesFill(submitted, 'Supervisor', '', now)).toThrow('Write what needs to change');
    const back = requestChangesFill(submitted, 'Supervisor', 'More detail', now).fill;
    expect(back.status).toBe('changes_requested');
    expect(isLocked(back)).toBe(false);
    expect(submitFill(back, 'A', now).fill.status).toBe('submitted');
  });
  it('refuses to resubmit an approved period', () => {
    const approved = approveFill(submitFill(emptyFill('s', 'k', 'tpl'), 'A', now).fill, 'S', 'N', now).fill;
    expect(() => submitFill(approved, 'A', now)).toThrow("Can't submit");
  });
  it('allows changing setup only while everything is draft', () => {
    expect(canChangeSetup([])).toBe(true);
    expect(canChangeSetup([emptyFill('s', 'a', 'tpl')])).toBe(true);
    expect(canChangeSetup([submitFill(emptyFill('s', 'a', 'tpl'), 'A', now).fill])).toBe(false);
  });
  it('picks the latest action of a kind', () => {
    const a = (at: string, action: ReviewAction['action']): ReviewAction => ({ id: at, studentId: 's', periodKey: 'k', action, by: 'x', at });
    const list = [a('2026-09-01T00:00:00Z', 'request_changes'), a('2026-09-03T00:00:00Z', 'request_changes'), a('2026-09-02T00:00:00Z', 'submit')];
    expect(latestAction(list, 's', 'k', 'request_changes')?.id).toBe('2026-09-03T00:00:00Z');
    expect(latestAction(list, 's', 'k')?.id).toBe('2026-09-03T00:00:00Z');
    expect(latestAction(list, 's', 'other')).toBeUndefined();
  });
  it('lists empty required placeholders (not free or signature)', () => {
    const anchor = { kind: 'docx-cell' as const, table: [0], row: 0, col: 0 };
    const p = (id: string, binding: Placeholder['binding']): Placeholder => ({ id, label: id, binding, source: 'label', region: 'unit', anchor });
    const phs = [p('a', 'daily'), p('b', 'free'), p('c', 'signature'), p('d', 'period'), p('e', 'cover')];
    expect(emptyRequired(phs, { d: 'answered', e: '  ' }).map(x => x.id)).toEqual(['a', 'e']);
  });
});
