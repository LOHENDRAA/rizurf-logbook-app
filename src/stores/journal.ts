import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { repo } from '../data/repository';
import type { InternMode, JournalDetails } from '../core/model';
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
    const j = await repo().getJournal(o);
    startDate.value = j.startDate;
    university.value = j.university ?? null;
    programme.value = j.programme ?? null;
    position.value = j.position ?? null;
    entries.value = Object.fromEntries(j.entries.map(e => [e.date, e.text]));
    owner.value = o;
  }
  async function save(date: string, text: string) {
    if (!owner.value) throw new Error('No journal loaded.');
    await repo().putJournalEntry(owner.value, date, text);
    const next = { ...entries.value };
    if (text.trim()) next[date] = text; else delete next[date];
    entries.value = next;
  }
  async function start(o: string, date: string, details?: JournalDetails) {
    await repo().setJournalStart(o, date, details);
    await load(o);
  }

  return { owner, startDate, entries, university, programme, position, mode, journalOnly, load, save, start };
});
