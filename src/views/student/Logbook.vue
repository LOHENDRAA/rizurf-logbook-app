<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { weekSources } from '../../core/autofill';
import { shortDate } from '../../core/records';
import { periodName } from '../../core/periods';
import { todayISO } from '../../core/dates';
import type { PeriodStatus } from '../../core/model';
import StatusBadge from '../../components/StatusBadge.vue';

/** Every week of the internship, newest first, with what it's built from and what to do next. */
const st = useStudent();
const journal = useJournal();
const today = todayISO();
const NEXT: Record<PeriodStatus, string> = { draft: 'Continue', changes_requested: 'Revise', submitted: 'View', approved: 'View' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rows = computed(() => [...st.periods].reverse().map(p => {
  const s = weekSources(p, journal.entries, journal.org);
  return {
    p,
    dates: p.start === p.end ? shortDate(p.start) : `${shortDate(p.start)} – ${shortDate(p.end)}`,
    sources: `${plural(s.days, 'day', 'days')} · ${plural(s.activities, 'activity', 'activities')} · ${s.learning} learning`,
    status: st.statusOf(p.key),
    upcoming: p.start > today,
  };
}));
</script>

<template>
  <h1>Logbook</h1>
  <p v-if="st.template" class="muted">{{ st.template.university }}</p>
  <div class="card table-card">
    <table class="logbook-table">
      <thead><tr><th>Week</th><th>Sources</th><th>Status</th><th /></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.p.key" :class="{ 'click-row': !r.upcoming }" data-testid="week-row">
          <td><strong>{{ periodName(r.p) }}</strong> <span class="muted">{{ r.dates }}</span></td>
          <td data-testid="week-sources">{{ r.sources }}</td>
          <td><StatusBadge :status="r.status" /></td>
          <td>
            <span v-if="r.upcoming" class="muted" data-testid="week-upcoming">Starts {{ shortDate(r.p.start) }}</span>
            <RouterLink v-else :to="{ name: 'builder', params: { periodKey: r.p.key } }" class="stretch" data-testid="week-open">{{ NEXT[r.status] }}</RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
