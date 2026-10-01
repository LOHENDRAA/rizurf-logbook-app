<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { addDays, eachDay, mondayOf, parseISO, todayISO } from '../core/dates';
import { journalWeeks } from '../core/journal';
import { debounce } from '../lib/debounce';
import { errorText } from '../lib/errors';
import { ask } from '../lib/ask';

const journal = useJournal();
const toast = useToast();
const today = todayISO();
const weeks = computed(() => journalWeeks(journal.startDate, Object.keys(journal.entries), today));
const week = ref(mondayOf(today));
const days = computed(() => eachDay(week.value, addDays(week.value, 6)));
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

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseISO(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const short = (d: string) => fmt(d, { day: 'numeric', month: 'short' });
const card = (d: string) => `${fmt(d, { weekday: 'short' })} ${Number(d.slice(8))}`;
const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
</script>

<template>
  <div class="journal">
    <section class="card weeks">
      <h1>Journal</h1>
      <p class="muted">Private: only you can read it.</p>
      <div class="scroll">
        <table class="list">
          <thead><tr><th>Week</th><th>Dates</th></tr></thead>
          <tbody>
            <tr v-for="w in weeks" :key="w.start" data-testid="journal-week" :class="{ selected: w.start === week }">
              <th scope="row"><button type="button" class="link" :aria-pressed="w.start === week" @click="pickWeek(w.start)">Week {{ w.n }}</button></th>
              <td class="mono">{{ short(w.start) }} – {{ short(w.end) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div class="journal-main">
      <section class="card">
        <h2>Daily entries</h2>
        <div class="day-cards">
          <button v-for="d in days" :key="d" type="button" class="day-card" data-testid="journal-day" :data-date="d"
            :aria-pressed="d === selected" :disabled="d > today" @click="pick(d)">
            <span class="mono">{{ card(d) }}</span>
            <span v-if="journal.entries[d]?.trim()" class="logged">Logged</span>
          </button>
        </div>
      </section>
      <section class="card note">
        <header>
          <h2>{{ fmt(selected, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h2>
          <span class="muted" data-testid="journal-status" aria-live="polite">{{ statusText }}</span>
        </header>
        <textarea data-testid="journal-text" :value="text" aria-label="Journal entry" placeholder="How did today go? Only you can read this; it saves automatically."
          @input="onInput" @blur="flush" />
      </section>
    </div>
  </div>
</template>
