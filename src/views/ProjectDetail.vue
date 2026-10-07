<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { errorText } from '../lib/errors';
import { ask } from '../lib/ask';
import { acceptedRows, projectStats, shortDate, skillStats } from '../core/records';

const route = useRoute();
const router = useRouter();
const journal = useJournal();
const toast = useToast();
const id = computed(() => String(route.params.id));
const stats = computed(() => projectStats(journal.projects, journal.org).find(s => s.project.id === id.value));
const rows = computed(() => acceptedRows(journal.org).filter(r => r.projectId === id.value));
const skills = computed(() => skillStats(Object.fromEntries(Object.entries(journal.org).filter(([, o]) => o.projectId === id.value))));
const TABS = ['Overview', 'Timeline', 'Learning', 'Skills'] as const;
const tab = ref<(typeof TABS)[number]>('Overview');
const listed = computed(() => rows.value.filter(r => r.kind === (tab.value === 'Timeline' ? 'activity' : 'learning')));
const editing = ref<'name' | 'description' | null>(null);
const draft = ref('');

function edit(what: 'name' | 'description') {
  editing.value = what;
  draft.value = (what === 'name' ? stats.value?.project.name : stats.value?.project.description) ?? '';
}
async function saveEdit() {
  const p = stats.value!.project;
  try {
    await journal.updateProject(p.id, editing.value === 'name' ? { name: draft.value, description: p.description } : { name: p.name, description: draft.value });
    editing.value = null;
  } catch (e) {
    toast.show(`Couldn't save: ${errorText(e)}`, true);
  }
}
async function remove() {
  const p = stats.value!.project;
  if (!(await ask(`Delete the project "${p.name}"?`, 'Delete'))) return;
  try {
    await journal.deleteProject(p.id);
    await router.push('/projects');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
</script>

<template>
  <p><RouterLink to="/projects">← Projects</RouterLink></p>
  <p v-if="!stats" class="banner" data-testid="project-missing">That project doesn't exist.</p>
  <template v-else>
    <h1 data-testid="project-title">{{ stats.project.name }}</h1>
    <p v-if="stats.project.description" class="muted">{{ stats.project.description }}</p>
    <div class="row" role="tablist">
      <button v-for="t in TABS" :key="t" type="button" role="tab" :aria-selected="tab === t" :aria-pressed="tab === t" data-testid="project-tab" @click="tab = t">{{ t }}</button>
    </div>
    <section v-if="tab === 'Overview'">
      <div class="tiles">
        <div class="card" data-testid="project-tile"><strong>{{ stats.activities }}</strong> <span class="muted">Activities</span></div>
        <div class="card" data-testid="project-tile"><strong>{{ stats.learning }}</strong> <span class="muted">Learning points</span></div>
        <div class="card" data-testid="project-tile"><strong>{{ stats.skills }}</strong> <span class="muted">Skills</span></div>
      </div>
      <form v-if="editing" class="card stack" @submit.prevent="saveEdit">
        <label v-if="editing === 'name'">Name <input v-model="draft" data-testid="project-edit-text" required maxlength="120" /></label>
        <label v-else>Description <textarea v-model="draft" data-testid="project-edit-text" maxlength="500" /></label>
        <div class="row">
          <button type="button" @click="editing = null">Cancel</button>
          <button class="primary" data-testid="project-edit-save">Save</button>
        </div>
      </form>
      <div class="row">
        <button type="button" data-testid="project-rename" @click="edit('name')">Rename</button>
        <button type="button" data-testid="project-describe" @click="edit('description')">Edit description</button>
        <button type="button" class="danger" data-testid="project-delete" @click="remove">Delete</button>
      </div>
    </section>
    <ul v-else-if="tab !== 'Skills'" class="record-list" data-testid="project-rows">
      <li v-for="(r, i) in listed" :key="i"><RouterLink :to="`/journal/${r.date}`"><span class="muted">{{ shortDate(r.date) }}</span> {{ r.text }}</RouterLink></li>
      <li v-if="!listed.length" class="muted">Nothing here yet.</li>
    </ul>
    <ul v-else class="record-list" data-testid="project-rows">
      <li v-for="s in skills" :key="s.key">
        <RouterLink :to="`/skills/${encodeURIComponent(s.key)}`">{{ s.name }}</RouterLink>
        <span class="muted"> · {{ s.dates.length }} entr{{ s.dates.length === 1 ? 'y' : 'ies' }}</span>
      </li>
      <li v-if="!skills.length" class="muted">Nothing here yet.</li>
    </ul>
  </template>
</template>
