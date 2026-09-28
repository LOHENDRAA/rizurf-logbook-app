import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { IdbRepository } from '../../src/data/idb';
import { plain } from '../../src/data/plain';
import { DEMO_STUDENTS, ensureSeed, resetDemoData } from '../../src/data/seed';
import type { Template } from '../../src/core/model';

const fresh = () => new IdbRepository(`test-${Math.random()}`);
const tpl: Template = { id: 't1', university: 'U', format: 'pdf', fileName: 'u.pdf', fileBytes: new Uint8Array([1, 2, 3]).buffer, period: 'weekly', pageRoles: ['unit'], placeholders: [], updatedAt: 'now' };

describe('IdbRepository', () => {
  it('round-trips templates including file bytes', async () => {
    const r = fresh();
    await r.putTemplate(tpl);
    const back = await r.getTemplate('t1');
    expect(new Uint8Array(back!.fileBytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await r.listTemplates()).toHaveLength(1);
    await r.deleteTemplate('t1');
    expect(await r.getTemplate('t1')).toBeUndefined();
  });
  it('stores notes and fills per student and filters by student', async () => {
    const r = fresh();
    await r.putNote({ studentId: 'a', date: '2026-09-24', text: 'x', updatedAt: '' });
    await r.putNote({ studentId: 'a', date: '2026-09-24', text: 'y', updatedAt: '' }); // same key overwrites
    await r.putNote({ studentId: 'b', date: '2026-09-24', text: 'z', updatedAt: '' });
    expect((await r.getNotes('a')).map(n => n.text)).toEqual(['y']);
    await r.putFill({ studentId: 'a', periodKey: 'w:1', templateId: 'tpl', values: {}, autofilled: {}, status: 'draft' });
    await r.putFill({ studentId: 'b', periodKey: 'w:1', templateId: 'tpl', values: {}, autofilled: {}, status: 'draft' });
    expect(await r.getFills('a')).toHaveLength(1);
    expect(await r.getFills()).toHaveLength(2);
    await r.addAction({ id: '1', studentId: 'a', periodKey: 'w:1', action: 'submit', by: 'A', at: '' });
    expect(await r.listActions('a')).toHaveLength(1);
    expect(await r.listActions('b')).toHaveLength(0);
  });
  it('stores reactive objects by stripping Vue proxies', async () => {
    const r = fresh();
    const s = reactive({ id: 's', name: 'N', coverValues: { a: '1' } });
    await r.putStudent(plain(s));
    expect((await r.listStudents())[0].coverValues).toEqual({ a: '1' });
  });
  it('seeds the demo students once and resets everything', async () => {
    const r = fresh();
    await ensureSeed(r);
    await ensureSeed(r);
    expect((await r.listStudents()).map(s => s.name).sort()).toEqual(DEMO_STUDENTS.map(s => s.name).sort());
    await r.putTemplate(tpl);
    await resetDemoData(r);
    expect(await r.listTemplates()).toEqual([]);
    expect(await r.listStudents()).toHaveLength(2);
  });
});
