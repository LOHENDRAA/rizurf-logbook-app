import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import type { Template } from '../core/model';
import { repo } from '../data/repository';
import { plain } from '../data/plain';

export const useTemplates = defineStore('templates', () => {
  const list = shallowRef<Template[]>([]);
  async function load() { list.value = await repo().listTemplates(); }
  async function save(t: Template) { await repo().putTemplate(plain(t)); await load(); }
  async function remove(id: string) { await repo().deleteTemplate(id); await load(); }
  async function usage(id: string) { return (await repo().listStudents()).filter(s => s.templateId === id).length; }
  /** Students per template from one student list (the server version fetches every logbook per list). */
  async function usageAll() {
    const counts: Record<string, number> = {};
    for (const s of await repo().listStudents()) if (s.templateId) counts[s.templateId] = (counts[s.templateId] ?? 0) + 1;
    return counts;
  }
  /** How many students have typed something into any of these placeholders (warn before deleting them). */
  async function studentsWithValues(templateId: string, phIds: string[]) {
    const students = (await repo().listStudents()).filter(s => s.templateId === templateId);
    const fills = await repo().getFills();
    const has = (vals: Record<string, string>) => phIds.some(k => (vals[k] ?? '').trim());
    return students.filter(s => has(s.coverValues) || fills.some(f => f.studentId === s.id && has(f.values))).length;
  }
  return { list, load, save, remove, usage, usageAll, studentsWithValues };
});
