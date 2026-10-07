import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { openDB } from 'idb';
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
  it('upgrading moves old notes into the journal, joining a same-day entry', async () => {
    const name = `test-${Math.random()}`;
    const old = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('students', { keyPath: 'id' });
        db.createObjectStore('notes', { keyPath: ['studentId', 'date'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
      },
    });
    await old.put('notes', { studentId: 'a', date: '2026-09-21', text: 'Only a note.', updatedAt: '' });
    await old.put('notes', { studentId: 'a', date: '2026-09-22', text: 'Then the note.', updatedAt: '' });
    await old.put('notes', { studentId: 'a', date: '2026-09-23', text: '   ', updatedAt: '' });
    await old.put('journal', { owner: 'a', date: '2026-09-22', text: 'Journal first.' });
    old.close();

    const r = new IdbRepository(name);
    expect((await r.getJournal('a')).entries).toEqual([
      { date: '2026-09-21', text: 'Only a note.' },
      { date: '2026-09-22', text: 'Journal first.\n\nThen the note.' },
    ]);
  });
  it('stores fills and actions per student and filters by student', async () => {
    const r = fresh();
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
  it('keeps one private journal per owner, sorted, and a blank day deletes it', async () => {
    const r = fresh();
    expect(await r.getJournal('supervisor')).toEqual({ startDate: null, entries: [], projects: [] });
    await r.putJournalEntry('supervisor', '2026-09-21', 'Met the interns.');
    await r.putJournalEntry('supervisor', '2026-09-18', 'Planned.');
    await r.putJournalEntry('student-aina', '2026-09-21', 'Mine.');
    await r.setJournalStart('student-aina', '2026-08-03');
    expect(await r.getJournal('supervisor')).toEqual({ startDate: null, entries: [
      { date: '2026-09-18', text: 'Planned.' }, { date: '2026-09-21', text: 'Met the interns.' },
    ], projects: [] });
    expect(await r.getJournal('student-aina')).toEqual({ startDate: '2026-08-03', entries: [{ date: '2026-09-21', text: 'Mine.' }], projects: [] });
    await r.putJournalEntry('supervisor', '2026-09-21', '  ');
    expect((await r.getJournal('supervisor')).entries.map(e => e.date)).toEqual(['2026-09-18']);
    await r.reset();
    expect(await r.getJournal('student-aina')).toEqual({ startDate: null, entries: [], projects: [] });
  });
  it('keeps projects and reviewed suggestions per owner; typing keeps them; projects in use are not deleted', async () => {
    const r = fresh();
    await r.putJournalEntry('student-aina', '2026-09-21', 'Built the login page.');
    const erp = await r.createProject('student-aina', { name: 'ERP gateway', description: ' Auth ' });
    await expect(r.createProject('student-aina', { name: ' erp GATEWAY' })).rejects.toThrow('You already have a project called erp GATEWAY.');
    await r.createProject('student-daniel', { name: 'ERP gateway' }); // someone else may use the name

    const items = [{ id: 'i1', kind: 'activity' as const, text: 'Built the login page', status: 'accepted' as const }];
    const saved = await r.putOrganization('student-aina', '2026-09-21', { projectId: null, newProjectName: 'erp gateway', items });
    expect(saved).toEqual({ projectId: erp.id, items, projects: [{ id: erp.id, name: 'ERP gateway', description: 'Auth' }] });
    await expect(r.putOrganization('student-aina', '2026-09-18', { projectId: null, items: [] })).rejects.toThrow("There's no entry for that day yet.");
    await expect(r.putOrganization('student-aina', '2026-09-21', { projectId: 'nope', items: [] })).rejects.toThrow("That project isn't one of yours.");

    await r.putJournalEntry('student-aina', '2026-09-21', 'Built the login page, then tested it.');
    expect((await r.getJournal('student-aina')).entries).toEqual([{ date: '2026-09-21', text: 'Built the login page, then tested it.', projectId: erp.id, items }]);
    expect((await r.getJournal('student-daniel')).projects?.map(p => p.name)).toEqual(['ERP gateway']);
    expect((await r.getJournal('student-daniel')).projects?.[0].id).not.toBe(erp.id);

    await expect(r.deleteProject('student-aina', erp.id)).rejects.toThrow('Entries still use this project. Move them first.');
    expect(await r.updateProject('student-aina', erp.id, { name: 'ERP Gateway v2' })).toEqual({ id: erp.id, name: 'ERP Gateway v2', description: 'Auth' });
    await r.putJournalEntry('student-aina', '2026-09-21', ' ');
    await r.deleteProject('student-aina', erp.id);
    expect((await r.getJournal('student-aina')).projects).toEqual([]);
  });
  it('the demo organizer reads the saved entry and the projects', async () => {
    const r = fresh();
    await r.putJournalEntry('student-aina', '2026-09-21', 'Built it. Tested it.');
    await r.createProject('student-aina', { name: 'ERP gateway' });
    expect(await r.organize('student-aina', '2026-09-21')).toEqual({ project: 'ERP gateway', activities: ['Built it', 'Tested it'], learning: [], skills: [] });
    await expect(r.organize('student-aina', '2026-09-18')).rejects.toThrow("There's no entry for that day yet.");
  });
  it('upgrading from version 3 keeps the journal and adds projects', async () => {
    const name = `test-${Math.random()}`;
    const old = await openDB(name, 3, {
      upgrade(db) {
        for (const s of ['templates', 'students']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
      },
    });
    await old.put('journal', { owner: 'a', date: '2026-09-21', text: 'Kept.' });
    old.close();
    const r = new IdbRepository(name);
    expect(await r.getJournal('a')).toEqual({ startDate: null, entries: [{ date: '2026-09-21', text: 'Kept.' }], projects: [] });
    await r.createProject('a', { name: 'New' });
  });
  it('stores the mode on the student and journal details next to the start date', async () => {
    const r = fresh();
    await r.putStudent({ id: 's1', name: 'S', coverValues: {}, position: 'QA Intern', programme: 'BSc IT' });
    await r.setMode('s1', 'journal');
    expect((await r.listStudents())[0]).toMatchObject({ mode: 'journal', position: 'QA Intern', programme: 'BSc IT' });
    await r.setJournalStart('s1', '2026-08-03', { university: 'Sunway', programme: 'BSc IT', position: 'QA' });
    expect(await r.getJournal('s1')).toEqual({ startDate: '2026-08-03', university: 'Sunway', programme: 'BSc IT', position: 'QA', entries: [], projects: [] });
  });
});
