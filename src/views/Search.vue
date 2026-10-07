<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useSession } from '../stores/session';
import { excerpt, searchAll } from '../core/search';

const journal = useJournal();
const route = useRoute();
const router = useRouter();
const intern = !useSession().isSupervisor; // the page remounts when the role's data changes
const LIMIT = 20;

const q = ref(String(route.query.q ?? ''));
// The top bar can search again while this page is open; typing here replaces ?q= without adding history.
watch(() => route.query.q, v => { q.value = String(v ?? ''); });
watch(q, v => { if (v !== String(route.query.q ?? '')) void router.replace({ query: v ? { q: v } : {} }); });

const groups = computed(() => searchAll(q.value, { entries: journal.entries, org: journal.org, projects: journal.projects, reflections: journal.reflections }, intern));
const all = reactive<Record<string, boolean>>({});
</script>

<template>
  <section class="card">
    <h1>Search your experience</h1>
    <input v-model="q" type="search" class="search-big" data-testid="search-input" placeholder="Search your experience" aria-label="Search your experience" autofocus />
  </section>
  <p v-if="!q.trim()" class="muted">{{ intern ? 'Search your journal, projects, learning, skills and reflections.' : 'Search your journal.' }}</p>
  <p v-else-if="!groups.length" class="muted" data-testid="search-empty">Nothing found for “{{ q.trim() }}”.</p>
  <section v-for="g in groups" :key="g.name" class="card" data-testid="search-group">
    <h2>{{ g.name }} · {{ g.hits.length }}</h2>
    <RouterLink v-for="(h, i) in all[g.name] ? g.hits : g.hits.slice(0, LIMIT)" :key="i" :to="h.to" class="search-hit" data-testid="search-result">
      <span v-if="h.meta" class="caption">{{ h.meta }}</span>
      <span v-for="e in [excerpt(h.text, q)]" :key="0">{{ e.before }}<mark v-if="e.match">{{ e.match }}</mark>{{ e.after }}</span>
    </RouterLink>
    <button v-if="g.hits.length > LIMIT && !all[g.name]" type="button" data-testid="search-more" @click="all[g.name] = true">Show all {{ g.hits.length }}</button>
  </section>
</template>
