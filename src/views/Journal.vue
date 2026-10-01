<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { addDays, mondayOf, parseISO, todayISO } from '../core/dates';
import { journalWeeks, recentWeeks } from '../core/journal';
import { debounce } from '../lib/debounce';
import { errorText } from '../lib/errors';
import { ask } from '../lib/ask';
import WeekDays from '../components/WeekDays.vue';

const journal = useJournal();
const toast = useToast();
const today = todayISO();
// Interns number weeks from their start date; a supervisor's journal has none, so it lists recent weeks by date.
const weeks = computed(() => (journal.startDate
  ? journalWeeks(journal.startDate, Object.keys(journal.entries), today)
  : recentWeeks(Object.keys(journal.entries), today)));
const week = ref(mondayOf(today));
const selected = ref(today);
const text = ref(journal.entries[today] ?? '');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref('');
let pending: { date: string; text: string } | null = null;

async function persist() {
  const p = pending;
  if (!p) return;
  pending = null;
  try {
    await journal.save(p.date, p.text);
    status.value = 'saved';
    savedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    pending = pending ?? p; // keep it (unless newer text arrived) and retry on the next edit
    status.value = 'error';
    toast.show(`Couldn't save your journal: ${errorText(e)} It's kept here and will retry when you type again.`, true);
  }
}
const saver = debounce(persist, 800);
const flush = () => saver.flush();

function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  pending = { date: selected.value, text: text.value };
  status.value = 'saving';
  saver.call();
}
/** Saves what's typed; false if it still isn't saved, so the caller keeps the text on screen (it retries on the next keystroke). */
async function saved() {
  await flush();
  return !pending;
}
async function pick(d: string) {
  if (d > today || !(await saved())) return;
  selected.value = d;
  text.value = journal.entries[d] ?? '';
  status.value = 'idle';
}
async function pickWeek(start: string) {
  if (!(await saved())) return;
  week.value = start;
  const end = addDays(start, 6);
  await pick(end < today ? end : today);
}

const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
const onPageHide = () => { void flush(); };
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  void flush();
});
onBeforeRouteLeave(async () => (await saved()) || ask("Your last journal change isn't saved yet. Leave anyway and lose it?", 'Leave'));

const dayLabel = (d: string) => parseISO(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
</script>

<template>
  <WeekDays title="Journal" note="Private: only you can read it." :weeks="weeks" :week="week" :selected="selected"
    :logged="d => !!journal.entries[d]?.trim()" :disabled="d => d > today" @week="pickWeek" @day="pick">
    <section class="card note">
      <header>
        <h2>{{ dayLabel(selected) }}</h2>
        <span class="muted" data-testid="journal-status" aria-live="polite">{{ statusText }}</span>
      </header>
      <textarea data-testid="journal-text" :value="text" aria-label="Journal entry" placeholder="How did today go? Only you can read this; it saves automatically."
        @input="onInput" @blur="flush" />
    </section>
  </WeekDays>
</template>
