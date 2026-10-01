import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { repo } from '../data/repository';
import { useSession } from './session';
import { useStudent } from './student';

/** The signed-in person's private journal. Loaded per owner (the session role), so switching role never shows someone else's. */
export const useJournal = defineStore('journal', () => {
  const owner = ref<string | null>(null);
  const startDate = ref<string | null>(null);
  const entries = ref<Record<string, string>>({});

  /** An intern with no logbook template who chose the journal in Onboarding. */
  const journalOnly = computed(() => {
    const session = useSession();
    return !session.isSupervisor && owner.value === session.role && !!startDate.value && !useStudent().student?.templateId;
  });

  async function load(o: string) {
    const j = await repo().getJournal(o);
    startDate.value = j.startDate;
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
  async function start(o: string, date: string) {
    await repo().setJournalStart(o, date);
    await load(o);
  }

  return { owner, startDate, entries, journalOnly, load, save, start };
});
