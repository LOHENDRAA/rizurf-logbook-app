<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { isWritableDay } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';
import EntryEditor from '../components/EntryEditor.vue';

const route = useRoute();
const date = computed(() => String(route.params.date));
const ok = computed(() => isWritableDay(date.value, todayISO()));
const title = computed(() => parseISO(date.value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
</script>

<template>
  <p><RouterLink to="/journal" data-testid="entry-back">← Journal</RouterLink></p>
  <p v-if="!ok" class="banner" data-testid="entry-error">You can't write for a day that hasn't happened yet.</p>
  <EntryEditor v-else :date="date">
    <template #title><h1>{{ title }}</h1></template>
  </EntryEditor>
</template>
