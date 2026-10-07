<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useStudent } from '../stores/student';
import { addDays, todayISO } from '../core/dates';
import { isMonday, reflectionWeeks, weekSummary } from '../core/reflection';
import { shortDate } from '../core/records';
import { plural } from '../core/progress';
import { ask } from '../lib/ask';

const journal = useJournal();
const st = useStudent();
const route = useRoute();
const router = useRouter();

// The page is remounted per address (App keys it by path), so the week is fixed for this instance.
const range = reflectionWeeks((journal.journalOnly ? journal.startDate : st.student?.startDate) ?? null, todayISO());
const asked = String(route.params.week ?? '');
const week = isMonday(asked) && asked >= range.first && asked <= range.last ? asked : range.last;
const prev = week > range.first ? addDays(week, -7) : null;
const next = week < range.last ? addDays(week, 7) : null;
const summary = weekSummary(week, journal.entries, journal.org, journal.projects);
const empty = !summary.days && !summary.activities && !summary.learning && !summary.projects.length;

const saved = ref(journal.reflections[week] ?? '');
const text = ref(saved.value);
const busy = ref(false);
const status = ref<'idle' | 'saved' | 'error'>('idle');
const dirty = computed(() => text.value.trim() !== saved.value);

async function save() {
  busy.value = true;
  status.value = 'idle';
  try {
    await journal.saveReflection(week, text.value);
    saved.value = text.value.trim();
    status.value = 'saved';
  } catch {
    status.value = 'error'; // the text stays in the box
  } finally {
    busy.value = false;
  }
}
const go = (w: string | null) => { if (w) void router.push(`/reflection/${w}`); };
const guard = async () => !dirty.value || ask('Leave without saving your reflection?', 'Leave');
onBeforeRouteLeave(guard);
onBeforeRouteUpdate(guard);
// Closing or reloading the tab with unsaved text: the browser asks.
const onUnload = (e: BeforeUnloadEvent) => { if (dirty.value) e.preventDefault(); };
onMounted(() => window.addEventListener('beforeunload', onUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload));
</script>

<template>
  <section class="card rf-head">
    <button type="button" data-testid="rf-prev" aria-label="Previous week" :disabled="!prev" @click="go(prev)">←</button>
    <div>
      <h1 data-testid="rf-title">Week of {{ shortDate(week) }}</h1>
      <p class="muted">{{ shortDate(week) }} – {{ shortDate(addDays(week, 4)) }}</p>
    </div>
    <button type="button" data-testid="rf-next" aria-label="Next week" :disabled="!next" @click="go(next)">→</button>
  </section>
  <div class="rf-body">
    <section class="card" data-testid="rf-summary">
      <h2>Your week</h2>
      <p v-if="empty" class="muted">Nothing recorded this week yet.</p>
      <template v-else>
        <p>{{ plural(summary.days, 'journal day') }} · {{ plural(summary.activities, 'activity', 'activities') }} · {{ plural(summary.learning, 'learning point') }}</p>
        <template v-if="summary.projects.length">
          <p class="caption">YOU WORKED ON</p>
          <ul><li v-for="p in summary.projects" :key="p">{{ p }}</li></ul>
        </template>
        <template v-if="summary.standOut.length">
          <p class="caption">WHAT STOOD OUT</p>
          <ul><li v-for="(s, i) in summary.standOut" :key="i">{{ s }}</li></ul>
        </template>
      </template>
    </section>
    <section class="card">
      <h2>Reflection</h2>
      <textarea v-model="text" data-testid="rf-text" maxlength="5000" rows="10" placeholder="What did you learn this week?" aria-label="What did you learn this week?" @input="status = 'idle'" />
      <div class="rf-actions">
        <button type="button" class="primary" data-testid="rf-save" :disabled="!dirty || busy" @click="save">Save reflection</button>
        <span v-if="status === 'saved'" class="muted" data-testid="rf-saved">Saved</span>
        <span v-if="status === 'error'" class="rf-error" role="alert" data-testid="rf-error">We couldn't save your reflection. Try again.</span>
      </div>
    </section>
  </div>
</template>
