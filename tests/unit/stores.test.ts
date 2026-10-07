import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { IdbRepository } from '../../src/data/idb';
import { repo, setRepository } from '../../src/data/repository';
import { DEMO_STUDENTS, ensureSeed } from '../../src/data/seed';
import { useStudent } from '../../src/stores/student';
import { useReview } from '../../src/stores/review';
import { useTemplates } from '../../src/stores/templates';
import { useSession } from '../../src/stores/session';
import { useJournal } from '../../src/stores/journal';
import type { Template } from '../../src/core/model';

const anchor = { kind: 'pdf' as const, page: 0, x: 0, y: 0, w: 10, h: 10 };
const TEMPLATE: Template = {
  id: 'tpl', university: 'PMU', format: 'pdf', fileName: 'p.pdf', fileBytes: new ArrayBuffer(8), period: 'weekly', pageRoles: ['unit'], updatedAt: '',
  placeholders: [
    { id: 'day0', label: 'Day 1', binding: 'daily', dayIndex: 0, source: 'label', region: 'unit', anchor },
    { id: 'q1', label: 'Question', binding: 'period', source: 'label', region: 'unit', anchor },
    { id: 'name', label: 'Name', binding: 'cover', source: 'label', region: 'unit', anchor },
  ],
};

beforeEach(async () => {
  setActivePinia(createPinia());
  const r = new IdbRepository(`stores-${Math.random()}`);
  setRepository(r);
  await ensureSeed(r);
  await r.putTemplate(TEMPLATE);
});

describe('student store', () => {
  it('sets up an internship and builds periods', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    expect(st.periods.map(p => p.key)).toEqual(['w:2026-09-21', 'w:2026-09-28', 'w:2026-10-05']);
    expect(st.student?.templateId).toBe('tpl');
  });
  it('persists journal entries', async () => {
    const j = useJournal();
    await j.load('student-aina');
    await j.save('2026-09-23', 'Hello');
    setActivePinia(createPinia());
    const again = useJournal();
    await again.load('student-aina');
    expect(again.entries['2026-09-23']).toBe('Hello');
  });
  it('locks a submitted period and its dates, and blocks setup changes', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await st.saveFill({ ...st.fillFor('w:2026-09-21'), values: { day0: 'x' } });
    await st.submit('w:2026-09-21');
    expect(st.statusOf('w:2026-09-21')).toBe('submitted');
    expect(st.lockedDates.has('2026-09-24')).toBe(true);
    await expect(st.saveFill(st.fillFor('w:2026-09-21'))).rejects.toThrow('locked');
    await expect(st.setup('tpl', '2026-09-01', '2026-10-06')).rejects.toThrow('before any period is submitted');
  });
  it('flags a missing template', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await useTemplates().remove('tpl');
    await st.load('student-aina');
    expect(st.templateMissing).toBe(true);
    expect(st.periods).toEqual([]);
  });
  it('lets a student re-pick a university after their template is removed, even with a submitted period', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await st.saveFill({ ...st.fillFor('w:2026-09-21'), values: { day0: 'x' } });
    await st.submit('w:2026-09-21');
    await useTemplates().remove('tpl');
    await st.load('student-aina');
    expect(st.templateMissing).toBe(true);
    await repo().putTemplate({ ...TEMPLATE, id: 'tpl2', university: 'Other Uni' });
    await st.setup('tpl2', '2026-09-23', '2026-10-06');
    expect(st.student?.templateId).toBe('tpl2');
    expect(st.templateMissing).toBe(false);
  });
  it('hides an old template\'s approved fill after the student re-picks a same-dates template', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await st.saveFill({ ...st.fillFor('w:2026-09-21'), values: { day0: 'x' } });
    await st.submit('w:2026-09-21');
    const rv = useReview();
    await rv.load();
    await rv.approve('student-aina', 'w:2026-09-21', 'Nur Aziz');
    await useTemplates().remove('tpl');
    await repo().putTemplate({ ...TEMPLATE, id: 'tpl2', university: 'Other Uni' });
    await st.load('student-aina');
    await st.setup('tpl2', '2026-09-23', '2026-10-06'); // same dates -> same period key w:2026-09-21

    expect(st.statusOf('w:2026-09-21')).toBe('draft');
    expect(st.canChangeSetup).toBe(true);

    await rv.load();
    expect(rv.queue.find(r => r.student.id === 'student-aina' && r.period.key === 'w:2026-09-21')).toBeUndefined();
    const row = rv.rows.find(r => r.student.id === 'student-aina' && r.period.key === 'w:2026-09-21');
    expect(row?.status).toBe('draft');
    expect(row?.fill).toBeUndefined();
  });
});

describe('review store', () => {
  async function submitted() {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await st.submit('w:2026-09-21');
    const rv = useReview();
    await rv.load();
    return { st, rv };
  }
  it('queues submitted periods and approves them', async () => {
    const { st, rv } = await submitted();
    expect(rv.queue.map(r => r.period.key)).toEqual(['w:2026-09-21']);
    await expect(rv.approve('student-aina', 'w:2026-09-21', '')).rejects.toThrow('Type your full name');
    await rv.approve('student-aina', 'w:2026-09-21', 'Nur Aziz');
    expect(rv.queue).toEqual([]);
    await st.load('student-aina');
    expect(st.statusOf('w:2026-09-21')).toBe('approved');
    expect(st.latest('w:2026-09-21', 'approve')?.signature).toBe('Nur Aziz');
  });
  it('sends a period back and lets the student resubmit', async () => {
    const { st, rv } = await submitted();
    await rv.requestChanges('student-aina', 'w:2026-09-21', 'More detail');
    await st.load('student-aina');
    expect(st.statusOf('w:2026-09-21')).toBe('changes_requested');
    await st.saveFill({ ...st.fillFor('w:2026-09-21'), values: { q1: 'better' } });
    await st.submit('w:2026-09-21');
    await rv.load();
    expect(rv.queue).toHaveLength(1);
  });
  it('shares a load already in flight, so the nav count and the Review page fetch once', async () => {
    const rv = useReview();
    const listStudents = vi.spyOn(repo(), 'listStudents');
    await Promise.all([rv.load(), rv.load()]);
    expect(listStudents).toHaveBeenCalledTimes(1);
    await rv.load(); // a later load still refreshes
    expect(listStudents).toHaveBeenCalledTimes(2);
  });
  it('counts students who filled removed placeholders', async () => {
    const { st } = await submitted();
    await st.saveCover({ name: 'Aina' });
    expect(await useTemplates().studentsWithValues('tpl', ['name'])).toBe(1);
    expect(await useTemplates().studentsWithValues('tpl', ['q1'])).toBe(0);
  });
});

describe('session store', () => {
  it('a signed-in server user sets the role the screens use', () => {
    const session = useSession();

    session.signedIn({ id: 'student-1', name: 'Aisha Rahman', role: 'student' });
    expect(session.role).toBe('student-1');
    expect(session.isSupervisor).toBe(false);

    session.signedIn({ id: 'supervisor-1', name: 'Sarah Lim', role: 'supervisor' });
    expect(session.isSupervisor).toBe(true);
    expect(session.me?.name).toBe('Sarah Lim');
  });
});

describe('review findings', () => {
  it('a failed submit leaves the week editable', async () => {
    class FailingSubmit extends IdbRepository {
      async addAction(): Promise<void> { throw new Error('offline'); }
    }
    const r = new FailingSubmit(`stores-${Math.random()}`);
    setRepository(r);
    await ensureSeed(r);
    await r.putTemplate(TEMPLATE);
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');

    await expect(st.submit('w:2026-09-21')).rejects.toThrow('offline');

    expect(st.statusOf('w:2026-09-21')).toBe('draft');
  });

  it('template usage counts come from one student list', async () => {
    await useStudent().load('student-aina');
    await useStudent().setup('tpl', '2026-09-23', '2026-10-06');
    const spy = vi.spyOn(repo(), 'listStudents');

    expect(await useTemplates().usageAll()).toEqual({ tpl: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('mode and details', () => {
  it('legacy journal intern stays journal-only; logbook interns are logbook; setMode switches without losing notes', async () => {
    const session = useSession();
    const st = useStudent();
    const journal = useJournal();
    const id = DEMO_STUDENTS[0].id;
    session.setRole(id);
    await st.load(id);
    await journal.load(id);
    expect(journal.mode).toBeNull();

    await journal.start(id, '2026-08-03'); // the previous release's "no logbook" choice: no mode stored
    expect(journal.mode).toBe('journal');
    expect(journal.journalOnly).toBe(true);

    await st.setup(TEMPLATE.id, '2026-09-21', '2026-10-04', { position: 'Data Intern' });
    await st.setMode('logbook');
    await journal.save('2026-09-21', 'kept');
    expect(journal.mode).toBe('logbook');
    expect(st.student?.position).toBe('Data Intern');

    await st.setMode('journal');
    expect(journal.journalOnly).toBe(true);
    await st.setMode('logbook');
    expect(journal.entries['2026-09-21']).toBe('kept');
  });
  it('position saves after a period is submitted; dates still lock', async () => {
    const st = useStudent();
    const id = DEMO_STUDENTS[0].id;
    await st.load(id);
    await st.setup(TEMPLATE.id, '2026-09-21', '2026-10-04');
    await st.submit(st.periods[0].key);
    await st.setup(TEMPLATE.id, '2026-09-21', '2026-10-04', { position: 'Platform Intern' });
    expect(st.student?.position).toBe('Platform Intern');
    await expect(st.setup(TEMPLATE.id, '2026-09-21', '2026-10-11')).rejects.toThrow('before any period is submitted');
  });
});

describe('journal store organizing', () => {
  it('organizes with the demo stand-in, accepts a new project and an activity, and a cleared day drops them', async () => {
    const j = useJournal();
    await j.load('student-aina');
    await j.save('2026-09-21', 'Built the login page. Tested it.');
    await j.organizeEntry('2026-09-21');
    expect(j.org['2026-09-21'].items.map(i => `${i.status}:${i.kind}:${i.text}`)).toEqual(['suggested:activity:Built the login page', 'suggested:activity:Tested it']);

    const [first] = j.org['2026-09-21'].items;
    await j.review('2026-09-21', first.id, 'accept');
    await j.organizeEntry('2026-09-21'); // again: the accepted one stays, no duplicate
    expect(j.org['2026-09-21'].items.map(i => `${i.status}:${i.text}`)).toEqual(['accepted:Built the login page', 'suggested:Tested it']);

    // A project suggestion, accepted in another case than an existing project, reuses it.
    const erp = await j.createProject({ name: 'ERP gateway' });
    await j.saveOrganization('2026-09-21', { projectId: null, items: [...j.org['2026-09-21'].items, { id: 'p', kind: 'project', text: 'erp GATEWAY', status: 'suggested' }] });
    await j.review('2026-09-21', 'p', 'accept');
    expect(j.org['2026-09-21'].projectId).toBe(erp.id);
    expect(j.projects).toHaveLength(1);

    // An edited name that matches nothing creates the project.
    await j.saveOrganization('2026-09-21', { ...j.org['2026-09-21'], items: [...j.org['2026-09-21'].items, { id: 'q', kind: 'project', text: 'x', status: 'suggested' }] });
    await j.review('2026-09-21', 'q', 'accept', 'Mobile app');
    expect(j.projects.map(p => p.name)).toEqual(['ERP gateway', 'Mobile app']);
    expect(j.org['2026-09-21'].items.filter(i => i.kind === 'project').map(i => `${i.status}:${i.text}`)).toEqual(['accepted:Mobile app', 'rejected:x']);

    await j.save('2026-09-21', '');
    expect(j.org['2026-09-21']).toBeUndefined();
    await j.load('student-aina');
    expect(j.org).toEqual({});
  });
  it('project changes update the list', async () => {
    const j = useJournal();
    await j.load('student-aina');
    const p = await j.createProject({ name: 'B' });
    await j.createProject({ name: 'A' });
    expect(j.projects.map(x => x.name)).toEqual(['A', 'B']);
    await j.updateProject(p.id, { name: 'C' });
    expect(j.projects.map(x => x.name)).toEqual(['A', 'C']);
    await j.deleteProject(p.id);
    expect(j.projects.map(x => x.name)).toEqual(['A']);
  });
});

describe('journal store reflections', () => {
  it('saves trimmed, reloads, clears, and keeps the map when a save fails', async () => {
    const j = useJournal();
    await j.load('student-aina');
    expect(j.reflections).toEqual({});
    await j.saveReflection('2026-09-14', '  Queues are useful.  ');
    expect(j.reflections).toEqual({ '2026-09-14': 'Queues are useful.' });
    await j.load('student-aina');
    expect(j.reflections).toEqual({ '2026-09-14': 'Queues are useful.' });

    const spy = vi.spyOn(repo(), 'putReflection').mockRejectedValueOnce(new Error('offline'));
    await expect(j.saveReflection('2026-09-14', 'Changed')).rejects.toThrow('offline');
    expect(j.reflections).toEqual({ '2026-09-14': 'Queues are useful.' });
    spy.mockRestore();

    await j.saveReflection('2026-09-14', '  ');
    expect(j.reflections).toEqual({});
  });
});
