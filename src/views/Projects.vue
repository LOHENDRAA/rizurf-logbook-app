<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { errorText } from '../lib/errors';
import { projectStats } from '../core/records';

const journal = useJournal();
const toast = useToast();
const stats = computed(() => projectStats(journal.projects, journal.org));
const adding = ref(false);
const name = ref('');
const description = ref('');
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function add() {
  try {
    await journal.createProject({ name: name.value, description: description.value });
    adding.value = false;
    name.value = '';
    description.value = '';
  } catch (e) {
    toast.show(`Couldn't add the project: ${errorText(e)}`, true);
  }
}
</script>

<template>
  <header class="row">
    <h1>Projects</h1>
    <span class="spacer" />
    <button type="button" class="primary" data-testid="project-new" @click="adding = !adding">+ New project</button>
  </header>
  <form v-if="adding" class="card stack" @submit.prevent="add">
    <label>Name <input v-model="name" data-testid="project-name" required maxlength="120" /></label>
    <label>Description (optional) <textarea v-model="description" data-testid="project-description" maxlength="500" /></label>
    <div class="row">
      <button type="button" @click="adding = false">Cancel</button>
      <button class="primary" data-testid="project-save">Add project</button>
    </div>
  </form>
  <p v-if="!stats.length" class="muted" data-testid="projects-empty">Projects appear when you accept one from an entry, or add one here.</p>
  <div class="card-grid">
    <RouterLink v-for="s in stats" :key="s.project.id" :to="`/projects/${s.project.id}`" class="card project-card" data-testid="project-card">
      <h2>{{ s.project.name }}</h2>
      <p v-if="s.project.description" class="muted">{{ s.project.description }}</p>
      <p data-testid="project-counts">{{ count(s.activities, 'activity', 'activities') }} · {{ count(s.learning, 'learning point', 'learning points') }} · {{ count(s.skills, 'skill', 'skills') }}</p>
    </RouterLink>
  </div>
</template>
