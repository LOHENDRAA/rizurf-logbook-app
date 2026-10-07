<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { shortDate, skillStats } from '../core/records';

const journal = useJournal();
const skills = computed(() => skillStats(journal.org));
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<template>
  <h1>Skills</h1>
  <p v-if="!skills.length" class="muted" data-testid="skills-empty">Skills appear only when your journal supports them.</p>
  <div class="card-grid">
    <RouterLink v-for="s in skills" :key="s.key" :to="`/skills/${encodeURIComponent(s.key)}`" class="card project-card" data-testid="skill-card">
      <h2>{{ s.name }}</h2>
      <p>Seen in {{ count(s.projectIds.length, 'project', 'projects') }} · {{ count(s.activities, 'activity', 'activities') }} · {{ count(s.learning, 'learning point', 'learning points') }}</p>
      <p class="muted">First seen {{ shortDate(s.first) }}</p>
    </RouterLink>
  </div>
</template>
