<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { debounce } from '../lib/debounce';
import { errorText } from '../lib/errors';
import { ask } from '../lib/ask';

/** One day's private entry, saved as you type. A failed save keeps the text and retries on the next keystroke. */
const props = defineProps<{ date: string; placeholder?: string }>();
const journal = useJournal();
const toast = useToast();
const text = ref(journal.entries[props.date] ?? '');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref('');
let pending: { date: string; text: string } | null = null;

async function persist() {
  const p = pending;
  if (!p) return;
  pending = null;
  // Clearing a day deletes its accepted items too, so that's asked first; "Cancel" puts the saved text back.
  if (!p.text.trim() && journal.org[p.date]?.items.some(i => i.status === 'accepted')
    && !(await ask('This entry has accepted items. Clearing it removes them from your Projects, Learning and Skills. Clear it?', 'Clear'))) {
    if (props.date === p.date) text.value = journal.entries[p.date] ?? '';
    status.value = 'saved';
    return;
  }
  try {
    await journal.save(p.date, p.text);
    status.value = 'saved';
    savedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    pending = pending ?? p; // keep it (unless newer text arrived) and retry on the next edit
    status.value = 'error';
    toast.show(`Couldn't save your entry: ${errorText(e)} It's kept here and will retry when you type again.`, true);
  }
}
const saver = debounce(persist, 800);
const flush = () => saver.flush();
/** False while something typed still isn't saved. */
async function saved() {
  await flush();
  return !pending;
}
function set(value: string) {
  text.value = value;
  pending = { date: props.date, text: value };
  status.value = 'saving';
  saver.call();
}
const onInput = (e: Event) => set((e.target as HTMLTextAreaElement).value);
/** Adds a line (a prompt) at the end, on its own line. */
function append(line: string) {
  set(text.value.trim() ? `${text.value.replace(/\s+$/, '')}\n\n${line} ` : `${line} `);
}

// The entry page reuses this component when the date in the address changes.
watch(() => props.date, d => { text.value = journal.entries[d] ?? ''; status.value = 'idle'; });

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
const guard = async () => (await saved()) || ask("Your last change isn't saved yet. Leave anyway and lose it?", 'Leave');
onBeforeRouteLeave(guard);
onBeforeRouteUpdate(guard);

const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
defineExpose({ append, saved });
</script>

<template>
  <section class="card note">
    <header>
      <slot name="title" />
      <span class="muted" data-testid="entry-status" aria-live="polite">{{ statusText }}</span>
    </header>
    <textarea data-testid="entry-text" :value="text" aria-label="Entry" :placeholder="placeholder ?? 'Only you can read this; it saves automatically.'"
      @input="onInput" @blur="flush" />
  </section>
</template>
