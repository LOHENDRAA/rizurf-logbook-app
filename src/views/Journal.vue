<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { searchEntries } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';

const journal = useJournal();
const router = useRouter();
const today = todayISO();
const query = ref('');
const found = computed(() => searchEntries(journal.entries, query.value));
const months = computed(() => {
  const out: { month: string; items: { date: string; text: string }[] }[] = [];
  for (const e of found.value) {
    const month = parseISO(e.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (out.at(-1)?.month !== month) out.push({ month, items: [] });
    out.at(-1)!.items.push(e);
  }
  return out;
});
const dayLabel = (d: string) => parseISO(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const open = (date: string) => router.push({ name: 'journal-entry', params: { date } });
// Opens on the button only: a date input reports half-typed dates (year 0002…) as complete ones.
const day = ref('');
const empty = computed(() => (Object.values(journal.entries).some(t => t.trim()) ? `Nothing matches “${query.value.trim()}”.` : 'Your journal will build here as you write.'));
</script>

<template>
  <section class="card">
    <h1>Journal</h1>
    <p class="muted">Private: only you can read it.</p>
    <div class="journal-tools">
      <input v-model="query" type="search" data-testid="journal-search" placeholder="Search your journal" aria-label="Search your journal" />
      <form class="inline-form" @submit.prevent="day && open(day)">
        <label class="inline">Write for another day
          <input v-model="day" type="date" data-testid="journal-date" :max="today" />
        </label>
        <button type="submit" data-testid="journal-open" :disabled="!day">Open</button>
      </form>
    </div>
  </section>
  <p v-if="!found.length" class="muted" data-testid="journal-empty">{{ empty }}</p>
  <template v-for="m in months" :key="m.month">
    <h2 class="journal-month">{{ m.month }}</h2>
    <button v-for="e in m.items" :key="e.date" type="button" class="card journal-card" data-testid="journal-card" :data-date="e.date" @click="open(e.date)">
      <strong>{{ dayLabel(e.date) }}</strong>
      <span class="journal-snippet">{{ e.text }}</span>
    </button>
  </template>
</template>
