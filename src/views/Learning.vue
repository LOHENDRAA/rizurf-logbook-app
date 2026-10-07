<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { learningRows, shortDate } from '../core/records';

const journal = useJournal();
const filter = ref('all');
const any = computed(() => learningRows(journal.org, 'all').length > 0);
const rows = computed(() => learningRows(journal.org, filter.value));
const projectName = (id: string | null) => journal.projects.find(p => p.id === id)?.name ?? 'No project';
</script>

<template>
  <h1>Learning</h1>
  <p v-if="!any" class="muted" data-testid="learning-empty">Learning points appear here when you accept them from your entries.</p>
  <template v-else>
    <label class="inline">Project
      <select v-model="filter" data-testid="learning-filter">
        <option value="all">All projects</option>
        <option v-for="p in journal.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        <option value="none">No project</option>
      </select>
    </label>
    <ul class="record-list">
      <li v-for="(r, i) in rows" :key="i" class="card" data-testid="learning-row">
        <RouterLink :to="`/journal/${r.date}`">{{ r.text }}</RouterLink>
        <p class="muted">{{ projectName(r.projectId) }} · {{ shortDate(r.date) }}</p>
      </li>
    </ul>
    <p v-if="!rows.length" class="muted">No learning points for that project yet.</p>
  </template>
</template>
