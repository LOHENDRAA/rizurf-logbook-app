import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { Period, PeriodFill, ReviewAction, Student, Template } from '../core/model';
import { buildPeriods } from '../core/periods';
import { canChangeSetup as canChange, emptyFill, isLocked, latestAction, submitFill } from '../core/workflow';
import { eachDay } from '../core/dates';
import { repo } from '../data/repository';
import { plain } from '../data/plain';

export const useStudent = defineStore('student', () => {
  const student = ref<Student | null>(null);
  const template = shallowRef<Template | null>(null);
  const templateMissing = ref(false);
  const notes = ref<Record<string, string>>({});
  const fills = ref<Record<string, PeriodFill>>({});
  const actions = ref<ReviewAction[]>([]);
  const loadedFor = ref<string | null>(null);

  const periods = computed<Period[]>(() => {
    const s = student.value;
    const t = template.value;
    if (!s?.startDate || !s.endDate || !t) return [];
    return buildPeriods(t.period, s.startDate, s.endDate);
  });
  const canChangeSetup = computed(() => canChange(Object.values(fills.value)));
  const lockedDates = computed(() => {
    const set = new Set<string>();
    for (const p of periods.value) if (isLocked(fills.value[p.key])) eachDay(p.start, p.end).forEach(d => set.add(d));
    return set;
  });

  function me(): Student {
    if (!student.value) throw new Error('No student loaded.');
    return student.value;
  }

  async function load(studentId: string) {
    const s = (await repo().listStudents()).find(x => x.id === studentId);
    if (!s) throw new Error(`Unknown student ${studentId}`);
    const t = s.templateId ? await repo().getTemplate(s.templateId) : undefined;
    student.value = s;
    template.value = t ?? null;
    templateMissing.value = !!s.templateId && !t;
    notes.value = Object.fromEntries((await repo().getNotes(s.id)).map(e => [e.date, e.text]));
    fills.value = Object.fromEntries((await repo().getFills(s.id)).map(f => [f.periodKey, f]));
    actions.value = await repo().listActions(s.id);
    loadedFor.value = studentId;
  }

  async function setup(templateId: string, startDate: string, endDate: string) {
    const s = me();
    if (!canChangeSetup.value) throw new Error('You can only change your university or dates before any period is submitted.');
    const t = await repo().getTemplate(templateId);
    if (!t) throw new Error('That university template no longer exists.');
    buildPeriods(t.period, startDate, endDate); // throws on bad dates
    const next: Student = { ...plain(s), templateId, startDate, endDate, coverValues: s.templateId === templateId ? plain(s.coverValues) : {} };
    await repo().putStudent(next);
    await load(next.id);
  }

  async function saveNote(date: string, text: string) {
    const s = me();
    await repo().putNote({ studentId: s.id, date, text, updatedAt: new Date().toISOString() });
    notes.value = { ...notes.value, [date]: text };
  }

  const fillFor = (key: string): PeriodFill => fills.value[key] ?? emptyFill(me().id, key);

  async function persist(f: PeriodFill) {
    const copy = plain(f);
    await repo().putFill(copy);
    fills.value = { ...fills.value, [f.periodKey]: copy };
  }
  async function saveFill(f: PeriodFill) {
    if (isLocked(fills.value[f.periodKey])) throw new Error('This period is locked while it is with your supervisor.');
    await persist(f);
  }
  async function saveCover(values: Record<string, string>) {
    const next: Student = { ...plain(me()), coverValues: { ...values } };
    await repo().putStudent(next);
    student.value = next;
  }
  async function submit(key: string) {
    const { fill, action } = submitFill(fillFor(key), me().name);
    await persist(fill);
    await repo().addAction(action);
    actions.value = [...actions.value, action];
  }

  const statusOf = (key: string) => fills.value[key]?.status ?? 'draft';
  const latest = (key: string, kind?: ReviewAction['action']) => latestAction(actions.value, me().id, key, kind);

  return {
    student, template, templateMissing, notes, fills, actions, loadedFor, periods, canChangeSetup, lockedDates,
    load, setup, saveNote, fillFor, saveFill, saveCover, submit, statusOf, latest,
  };
});
