import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Student } from '../core/model';
import { repo } from '../data/repository';
import { resetDemoData } from '../data/seed';
import { loadDemoData } from '../data/demo';
import { signIn as apiSignIn, signOut as apiSignOut, type Me } from '../data/api';

export const SUPERVISOR = 'supervisor';
const KEY = 'il.role';
const read = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* storage blocked: the role lasts until reload */ } };

export const useSession = defineStore('session', () => {
  const role = ref<string>(read() ?? SUPERVISOR);
  const students = ref<Student[]>([]);
  /** Server mode: the person the server says is signed in. */
  const me = ref<Me | null>(null);
  const isSupervisor = computed(() => role.value === SUPERVISOR);
  function setRole(r: string) { role.value = r; write(r); }
  /** Server mode: the signed-in person decides the screens, not the dropdown. */
  function signedIn(user: Me) { me.value = user; setRole(user.role === 'supervisor' ? SUPERVISOR : user.id); }
  async function signIn(email: string, password: string) { await apiSignIn(email, password); }
  async function signOut() { await apiSignOut(); }
  async function loadStudents() { students.value = await repo().listStudents(); }
  async function resetDemo() { await resetDemoData(repo()); setRole(SUPERVISOR); }
  async function loadDemo() { await loadDemoData(repo()); setRole(SUPERVISOR); }
  return { role, students, me, isSupervisor, setRole, signedIn, signIn, signOut, loadStudents, resetDemo, loadDemo };
});
