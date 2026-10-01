<script setup lang="ts">
import { computed, nextTick } from 'vue';
import type { JournalWeek } from '../core/journal';
import { addDays, eachDay, parseISO } from '../core/dates';

/** The week picker and that week's Mon–Sun day cards, shared by the Journal and the Notepad. The editor goes in the default slot. */
const props = defineProps<{
  title: string; note?: string; weeks: JournalWeek[]; week: string; selected: string;
  logged: (d: string) => boolean; disabled: (d: string) => boolean;
}>();
const emit = defineEmits<{ week: [start: string]; day: [date: string] }>();
const days = computed(() => eachDay(props.week, addDays(props.week, 6)));
// The parent may refuse the change (an unsaved note): show the week that's actually open until it moves.
function pickWeek(e: Event) {
  const el = e.target as HTMLSelectElement;
  emit('week', el.value);
  void nextTick(() => { el.value = props.week; });
}

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseISO(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const short = (d: string) => fmt(d, { day: 'numeric', month: 'short' });
const card = (d: string) => `${fmt(d, { weekday: 'short' })} ${Number(d.slice(8))}`;
</script>

<template>
  <div class="week-view">
    <section class="card weeks">
      <h1>{{ title }}</h1>
      <p v-if="note" class="muted">{{ note }}</p>
      <label>Week
        <select data-testid="week-select" :value="week" @change="pickWeek">
          <option v-for="w in weeks" :key="w.start" :value="w.start">{{ [w.name ?? `Week ${w.n}`, `${short(w.start)} – ${short(w.end)}`].filter(Boolean).join(' · ') }}</option>
        </select>
      </label>
    </section>
    <div class="week-view-main">
      <section class="card">
        <h2>Daily entries</h2>
        <slot name="banner" />
        <div class="day-cards">
          <button v-for="d in days" :key="d" type="button" class="day-card" data-testid="day-card" :data-date="d"
            :aria-pressed="d === selected" :disabled="disabled(d)" @click="emit('day', d)">
            <span class="mono">{{ card(d) }}</span>
            <span v-if="logged(d)" class="logged">Logged</span>
          </button>
        </div>
      </section>
      <slot />
    </div>
  </div>
</template>
