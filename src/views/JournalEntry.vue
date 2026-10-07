<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { isWritableDay } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';
import { useJournal } from '../stores/journal';
import { useSession } from '../stores/session';
import EntryEditor from '../components/EntryEditor.vue';
import Organize from '../components/Organize.vue';
import ReviewPanel from '../components/ReviewPanel.vue';

const route = useRoute();
const journal = useJournal();
const session = useSession();
const editor = ref<InstanceType<typeof EntryEditor>>();
const flush = () => editor.value?.saved() ?? Promise.resolve(true);
const date = computed(() => String(route.params.date));
const ok = computed(() => isWritableDay(date.value, todayISO()));
const title = computed(() => parseISO(date.value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
const LABEL = { activity: 'Activity', learning: 'Learning', skill: 'Skill' } as const;
const organized = computed(() => journal.org[date.value]);
const project = computed(() => journal.projects.find(p => p.id === organized.value?.projectId));
const connected = computed(() => (organized.value?.items ?? []).filter(i => i.status === 'accepted' && i.kind !== 'project'));
</script>

<template>
  <p><RouterLink to="/journal" data-testid="entry-back">← Journal</RouterLink></p>
  <p v-if="!ok" class="banner" data-testid="entry-error">You can't write for a day that hasn't happened yet.</p>
  <div v-else class="today">
    <div>
      <EntryEditor ref="editor" :date="date">
        <template #title><h1>{{ title }}</h1></template>
      </EntryEditor>
      <Organize v-if="!session.isSupervisor" :date="date" :flush="flush" />
    </div>
    <aside v-if="!session.isSupervisor" class="today-side">
      <ReviewPanel :date="date" />
      <section class="card" data-testid="connected">
        <h2>Connected to</h2>
        <p v-if="project"><RouterLink :to="`/projects/${project.id}`" data-testid="connected-project">{{ project.name }}</RouterLink></p>
        <ul v-if="connected.length" class="record-list">
          <li v-for="i in connected" :key="i.id" data-testid="connected-item"><span class="muted">{{ LABEL[i.kind as keyof typeof LABEL] }}</span> {{ i.text }}</li>
        </ul>
        <p v-if="!project && !connected.length" class="muted">Nothing yet. Use ✦ Organize to connect this entry.</p>
      </section>
    </aside>
  </div>
</template>
