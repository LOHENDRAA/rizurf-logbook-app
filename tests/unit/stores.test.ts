import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { IdbRepository } from '../../src/data/idb';
import { setRepository } from '../../src/data/repository';
import { ensureSeed } from '../../src/data/seed';
import { useStudent } from '../../src/stores/student';
import { useReview } from '../../src/stores/review';
import { useTemplates } from '../../src/stores/templates';
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
  it('persists notes', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.saveNote('2026-09-23', 'Hello');
    setActivePinia(createPinia());
    const again = useStudent();
    await again.load('student-aina');
    expect(again.notes['2026-09-23']).toBe('Hello');
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
  it('counts students who filled removed placeholders', async () => {
    const { st } = await submitted();
    await st.saveCover({ name: 'Aina' });
    expect(await useTemplates().studentsWithValues('tpl', ['name'])).toBe(1);
    expect(await useTemplates().studentsWithValues('tpl', ['q1'])).toBe(0);
  });
});
