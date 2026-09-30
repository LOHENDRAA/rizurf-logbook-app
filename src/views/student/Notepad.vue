<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import { eachDay, isWeekend, parseISO, todayISO } from '../../core/dates';
import { debounce } from '../../lib/debounce';
import { errorText } from '../../lib/errors';

const st = useStudent();
const toast = useToast();
const today = todayISO();
const dates = computed(() => (st.student?.startDate && st.student.endDate ? eachDay(st.student.startDate, st.student.endDate) : []));

function initialDate() {
  const d = dates.value;
  if (!d.length) return today;
  if (today < d[0]) return d[0];
  if (today > d[d.length - 1]) return d[d.length - 1];
  return today;
}
const selected = ref(initialDate());
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

const locked = computed(() => st.lockedDates.has(selected.value));
const isFuture = (d: string) => d > today;

function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  pending = { date: selected.value, text: text.value, studentId: st.student!.id };
  status.value = 'saving';
  saver.call();
}
async function pick(d: string) {
  if (isFuture(d)) return;
  await flush();
  selected.value = d;
  text.value = st.notes[d] ?? '';
  status.value = 'idle';
}

const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
const onPageHide = () => { void flush(); };
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  void nextTick(() => document.querySelector(`[data-date="${selected.value}"]`)?.scrollIntoView({ block: 'center' }));
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  void flush();
});
onBeforeRouteLeave(async () => { await flush(); });

const dayLabel = (d: string) => parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
</script>

<template>
  <div class="notepad">
    <nav class="date-list" aria-label="Days of your internship">
      <button v-for="d in dates" :key="d" type="button" data-testid="note-date" :data-date="d"
        :class="{ weekend: isWeekend(d), today: d === today, has: !!st.notes[d]?.trim() }"
        :aria-pressed="d === selected" :disabled="isFuture(d)" @click="pick(d)">{{ dayLabel(d) }}</button>
    </nav>
    <section class="card note">
      <header>
        <h1>{{ dayLabel(selected) }}</h1>
        <span class="muted" data-testid="note-status" aria-live="polite">{{ statusText }}</span>
      </header>
      <p v-if="locked" class="banner">This day is in a period that's with your supervisor, so it's read-only.</p>
      <textarea data-testid="note-text" :value="text" :readonly="locked" placeholder="What did you work on today? Just jot it down; it saves automatically."
        @input="onInput" @blur="flush" />
    </section>
  </div>
</template>
