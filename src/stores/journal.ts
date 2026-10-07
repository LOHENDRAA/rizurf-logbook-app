import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { repo } from '../data/repository';
import type { InternMode, JournalDetails, OrganizationInput, Organized, Project, ProjectInput } from '../core/model';
import { mergeSuggestions, nameKey, reviewItem } from '../core/organize';
import { plain } from '../data/plain';
import { useSession } from './session';
import { useStudent } from './student';

/** The signed-in person's private journal. Loaded per owner (the session role), so switching role never shows someone else's. */
export const useJournal = defineStore('journal', () => {
  const owner = ref<string | null>(null);
  const startDate = ref<string | null>(null);
  const entries = ref<Record<string, string>>({});
  const university = ref<string | null>(null);
  const programme = ref<string | null>(null);
  const position = ref<string | null>(null);
  /** The last load failed: the app shows a message instead of an empty page. */
  const loadFailed = ref(false);
  /** Each day's project and reviewed suggestions (interns only). */
  const org = ref<Record<string, Organized>>({});
  const projects = ref<Project[]>([]);
  /** The day whose "Review what I found" panel is open, and why organizing it last failed. */
  const reviewing = ref<string | null>(null);
  const organizeError = ref('');

  /** The intern's chosen mode; for records from before the choice existed: a template means logbook, a journal start means journal. */
  const mode = computed<InternMode | null>(() => {
    const st = useStudent();
    const s = st.student;
    if (useSession().isSupervisor || !s || st.loadedFor !== useSession().role) return null;
    return s.mode ?? (s.templateId ? 'logbook' : owner.value === s.id && startDate.value ? 'journal' : null);
  });
  /** An intern who keeps the journal instead of the logbook. */
  const journalOnly = computed(() => mode.value === 'journal');

  async function load(o: string) {
    let j;
    try { j = await repo().getJournal(o); } catch (e) { loadFailed.value = true; throw e; }
    loadFailed.value = false;
    startDate.value = j.startDate;
    university.value = j.university ?? null;
    programme.value = j.programme ?? null;
    position.value = j.position ?? null;
    entries.value = Object.fromEntries(j.entries.map(e => [e.date, e.text]));
    org.value = Object.fromEntries(j.entries.filter(e => e.items).map(e => [e.date, { projectId: e.projectId ?? null, items: e.items ?? [] }]));
    projects.value = j.projects ?? [];
    owner.value = o;
  }
  async function save(date: string, text: string) {
    if (!owner.value) throw new Error('No journal loaded.');
    await repo().putJournalEntry(owner.value, date, text);
    const next = { ...entries.value };
    if (text.trim()) next[date] = text; else delete next[date];
    entries.value = next;
    if (!text.trim() && org.value[date]) { const o = { ...org.value }; delete o[date]; org.value = o; }
  }
  async function start(o: string, date: string, details?: JournalDetails) {
    await repo().setJournalStart(o, date, details);
    await load(o);
  }

  const byName = (list: Project[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  function who(): string {
    if (!owner.value) throw new Error('No journal loaded.');
    return owner.value;
  }
  async function saveOrganization(date: string, input: OrganizationInput) {
    const o = await repo().putOrganization(who(), date, plain(input));
    org.value = { ...org.value, [date]: { projectId: o.projectId, items: o.items } };
    projects.value = o.projects;
  }
  /** Asks for suggestions and merges them with what's already been reviewed. */
  async function organizeEntry(date: string) {
    const fresh = await repo().organize(who(), date);
    const cur = org.value[date] ?? { projectId: null, items: [] };
    await saveOrganization(date, { projectId: cur.projectId, items: mergeSuggestions(cur.items, fresh) });
  }
  /** Accepting a project assigns the day to it: an existing one by name (ignoring case), or a new one. */
  async function review(date: string, id: string, action: 'accept' | 'reject', text?: string) {
    const cur = org.value[date];
    if (!cur) return;
    const items = reviewItem(cur.items, id, action, text);
    const item = items.find(i => i.id === id);
    let input: OrganizationInput = { projectId: cur.projectId, items };
    if (action === 'accept' && item?.kind === 'project') {
      const match = projects.value.find(p => nameKey(p.name) === nameKey(item.text));
      input = match ? { projectId: match.id, items } : { projectId: null, newProjectName: item.text, items };
    }
    await saveOrganization(date, input);
  }
  async function createProject(p: ProjectInput) {
    const made = await repo().createProject(who(), p);
    projects.value = byName([...projects.value, made]);
    return made;
  }
  async function updateProject(id: string, p: ProjectInput) {
    const made = await repo().updateProject(who(), id, p);
    projects.value = byName(projects.value.map(x => (x.id === id ? made : x)));
  }
  async function deleteProject(id: string) {
    await repo().deleteProject(who(), id);
    projects.value = projects.value.filter(x => x.id !== id);
  }

  return {
    owner, startDate, entries, university, programme, position, loadFailed, mode, journalOnly, load, save, start,
    org, projects, reviewing, organizeError, organizeEntry, review, saveOrganization, createProject, updateProject, deleteProject,
  };
});
