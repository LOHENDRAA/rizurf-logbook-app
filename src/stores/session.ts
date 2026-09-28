import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Student } from '../core/model';
import { repo } from '../data/repository';
import { resetDemoData } from '../data/seed';
import { loadDemoData } from '../data/demo';

export const SUPERVISOR = 'supervisor';
const KEY = 'il.role';
const read = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* storage blocked: the role lasts until reload */ } };

export const useSession = defineStore('session', () => {
  const role = ref<string>(read() ?? SUPERVISOR);
  const students = ref<Student[]>([]);
  const isSupervisor = computed(() => role.value === SUPERVISOR);
  function setRole(r: string) { role.value = r; write(r); }
  async function loadStudents() { students.value = await repo().listStudents(); }
  async function resetDemo() { await resetDemoData(repo()); setRole(SUPERVISOR); }
  async function loadDemo() { await loadDemoData(repo()); setRole(SUPERVISOR); }
  return { role, students, isSupervisor, setRole, loadStudents, resetDemo, loadDemo };
});
