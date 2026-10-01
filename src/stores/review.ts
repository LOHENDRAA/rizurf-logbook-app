import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { Period, PeriodFill, PeriodStatus, ReviewAction, Student, Template } from '../core/model';
import { buildPeriods } from '../core/periods';
import { approveFill, requestChangesFill } from '../core/workflow';
import { repo } from '../data/repository';
import { plain } from '../data/plain';

export const SUPERVISOR_NAME = 'Supervisor';
export interface ReviewRow { student: Student; template: Template; period: Period; fill: PeriodFill | undefined; status: PeriodStatus }

export const useReview = defineStore('review', () => {
  const students = ref<Student[]>([]);
  const templates = shallowRef<Template[]>([]);
  const fills = ref<PeriodFill[]>([]);
  const actions = ref<ReviewAction[]>([]);

  // One load at a time: the nav count and the Review page both ask on start-up, and in server mode each load costs a request per intern.
  let loading: Promise<void> | null = null;
  function load(): Promise<void> {
    loading ??= (async () => {
      const [s, t, f, a] = await Promise.all([repo().listStudents(), repo().listTemplates(), repo().getFills(), repo().listActions()]);
      students.value = s; templates.value = t; fills.value = f; actions.value = a;
    })().finally(() => { loading = null; });
    return loading;
  }

  const rows = computed<ReviewRow[]>(() => students.value.flatMap(s => {
    const t = templates.value.find(x => x.id === s.templateId);
    if (!t || !s.startDate || !s.endDate) return [];
    return buildPeriods(t.period, s.startDate, s.endDate).map(p => {
      const f = fills.value.find(x => x.studentId === s.id && x.periodKey === p.key && x.templateId === t.id);
      return { student: s, template: t, period: p, fill: f, status: f?.status ?? 'draft' };
    });
  }));
  const queue = computed(() => rows.value
    .filter(r => r.status === 'submitted')
    .sort((a, b) => (a.fill?.submittedAt ?? '').localeCompare(b.fill?.submittedAt ?? '')));

  const row = (studentId: string, key: string) => rows.value.find(r => r.student.id === studentId && r.period.key === key);
  async function notesFor(studentId: string) {
    return Object.fromEntries((await repo().getNotes(studentId)).map(n => [n.date, n.text])) as Record<string, string>;
  }

  async function decide(studentId: string, key: string, fn: (f: PeriodFill) => { fill: PeriodFill; action: ReviewAction }) {
    const r = row(studentId, key);
    if (!r?.fill) throw new Error('Nothing has been submitted for this period.');
    const { fill, action } = fn(plain(r.fill));
    await repo().putFill(fill);
    await repo().addAction(action);
    await load();
  }
  const approve = (studentId: string, key: string, signature: string) => decide(studentId, key, f => approveFill(f, SUPERVISOR_NAME, signature));
  const requestChanges = (studentId: string, key: string, comment: string) => decide(studentId, key, f => requestChangesFill(f, SUPERVISOR_NAME, comment));

  return { students, templates, fills, actions, rows, queue, load, row, notesFor, approve, requestChanges };
});
