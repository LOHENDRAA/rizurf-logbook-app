<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import { addDays, mondayOf, parseISO, todayISO } from '../../core/dates';
import { journalWeeks } from '../../core/journal';
import { debounce } from '../../lib/debounce';
import { errorText } from '../../lib/errors';
import { ask } from '../../lib/ask';
import WeekDays from '../../components/WeekDays.vue';

const st = useStudent();
const toast = useToast();
const today = todayISO();
const start = st.student?.startDate ?? today;
const end = st.student?.endDate ?? today;
// Every week of the internship, Week 1 to the last; days outside it, and future days, can't be picked.
const weeks = computed(() => journalWeeks(start, [], end));
const selected = ref(today < start ? start : today > end ? end : today);
const week = ref(mondayOf(selected.value));
const text = ref(st.notes[selected.value] ?? '');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref('');
let pending: { date: string; text: string; studentId: string } | null = null;

async function persist() {
  const p = pending;
  if (!p) return;
  pending = null;
  try {
    await st.saveNote(p.date, p.text, p.studentId);
    status.value = 'saved';
    savedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    pending = pending ?? p; // keep it (unless newer text arrived) and retry on the next edit
    status.value = 'error';
    toast.show(`Couldn't save your note: ${errorText(e)} It's kept here and will retry when you type again.`, true);
  }
}
const saver = debounce(persist, 800);
const flush = () => saver.flush();
/** Saves what's typed; false if it still isn't saved, so the caller keeps the text on screen. */
async function saved() {
  await flush();
  return !pending;
}

const locked = computed(() => st.lockedDates.has(selected.value));
const banner = computed(() => {
  if (!locked.value) return '';
  const p = st.periods.find(x => selected.value >= x.start && selected.value <= x.end);
  return p && st.statusOf(p.key) === 'approved' ? 'Approved — locked.' : "Submitted and awaiting review — locked until it's reviewed.";
});
const disabled = (d: string) => d > today || d < start || d > end;

function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  pending = { date: selected.value, text: text.value, studentId: st.student!.id };
  status.value = 'saving';
  saver.call();
}
async function pick(d: string) {
  if (disabled(d) || !(await saved())) return;
  selected.value = d;
  text.value = st.notes[d] ?? '';
  status.value = 'idle';
}
async function pickWeek(w: string) {
  if (!(await saved())) return;
  week.value = w;
  const last = [addDays(w, 6), today, end].sort()[0];
  await pick(last < start ? start : last);
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
onBeforeRouteLeave(async () => (await saved()) || ask("Your last note isn't saved yet. Leave anyway and lose it?", 'Leave'));

const dayLabel = (d: string) => parseISO(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
</script>

<template>
  <WeekDays title="Notepad" :weeks="weeks" :week="week" :selected="selected"
    :logged="d => !!st.notes[d]?.trim()" :disabled="disabled" @week="pickWeek" @day="pick">
    <template #banner><p v-if="banner" class="banner" data-testid="week-banner">{{ banner }}</p></template>
    <section class="card note">
      <header>
        <h2>{{ dayLabel(selected) }}</h2>
        <span class="muted" data-testid="note-status" aria-live="polite">{{ statusText }}</span>
      </header>
      <textarea data-testid="note-text" :value="text" :readonly="locked" aria-label="Note for this day"
        placeholder="What did you work on today? Just jot it down; it saves automatically." @input="onInput" @blur="flush" />
    </section>
  </WeekDays>
</template>
