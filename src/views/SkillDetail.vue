<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useJournal } from '../stores/journal';
import { shortDate, skillStats } from '../core/records';

const route = useRoute();
const journal = useJournal();
const skill = computed(() => skillStats(journal.org).find(s => s.key === String(route.params.name)));
const projectNames = computed(() => (skill.value?.projectIds ?? []).map(id => journal.projects.find(p => p.id === id)?.name ?? '').filter(Boolean).join(', '));
const activities = (date: string) => (journal.org[date]?.items ?? []).filter(i => i.status === 'accepted' && i.kind === 'activity');
</script>

<template>
  <p><RouterLink to="/skills">← Skills</RouterLink></p>
  <p v-if="!skill" class="banner" data-testid="skill-missing">You haven't been seen using that skill yet.</p>
  <template v-else>
    <h1>{{ skill.name }}</h1>
    <section class="card">
      <h2>Why this skill appears</h2>
      <p data-testid="skill-why">Accepted from {{ skill.dates.length }} entr{{ skill.dates.length === 1 ? 'y' : 'ies' }}<template v-if="projectNames"> in: {{ projectNames }}</template>.</p>
    </section>
    <ul class="record-list">
      <li v-for="d in skill.dates" :key="d" class="card" data-testid="skill-day">
        <RouterLink :to="`/journal/${d}`">{{ shortDate(d) }}</RouterLink>
        <ul><li v-for="a in activities(d)" :key="a.id">{{ a.text }}</li></ul>
      </li>
    </ul>
  </template>
</template>
