<script setup lang="ts">
import { computed, ref } from 'vue';
import { useJournal } from '../stores/journal';
import { ApiError } from '../data/api';

/** ✦ Organize under an entry, and the line saying what's been reviewed. The cards are in ReviewPanel. */
const props = defineProps<{ date: string; flush: () => Promise<boolean> }>();
const journal = useJournal();
const running = ref(false);
const items = computed(() => journal.org[props.date]?.items ?? []);
const accepted = computed(() => items.value.filter(i => i.status === 'accepted').length);
const waiting = computed(() => items.value.filter(i => i.status === 'suggested').length);
const FAILED = "Your entry is saved. I couldn't organize it right now. Try again";

async function run() {
  if (!(await props.flush())) return; // unsaved text: EntryEditor already said why
  running.value = true;
  journal.organizeError = '';
  try {
    await journal.organizeEntry(props.date);
  } catch (e) {
    journal.organizeError = e instanceof ApiError && e.status === 429 ? e.message : FAILED;
  } finally {
    running.value = false;
    journal.reviewing = props.date;
  }
}
</script>

<template>
  <p class="organize">
    <button type="button" data-testid="organize" :disabled="running || !journal.entries[date]?.trim()" @click="run">
      {{ running ? '✦ Organizing your entry…' : '✦ Organize' }}
    </button>
    <span v-if="items.length" class="muted" data-testid="organize-summary">
      {{ accepted }} accepted · {{ waiting }} waiting ·
      <button type="button" class="link" data-testid="organize-review" @click="journal.reviewing = date">Review</button>
    </span>
  </p>
</template>
