<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewAction } from '../core/model';

/** A week's submits and review decisions, oldest first. A second or later submit reads "Resubmitted". */
const props = defineProps<{ actions: ReviewAction[] }>();
const lines = computed(() => {
  let submits = 0;
  return [...props.actions].sort((a, b) => a.at.localeCompare(b.at)).map(a => {
    const what = a.action === 'submit' ? (submits++ ? 'Resubmitted' : 'Submitted') : a.action === 'approve' ? 'Approved' : 'Changes requested';
    return { a, what };
  });
});
</script>

<template>
  <div class="card" data-testid="history">
    <h2>History</h2>
    <p v-if="!lines.length" class="muted">Not submitted yet.</p>
    <ul v-else class="plain-list">
      <li v-for="{ a, what } in lines" :key="a.id">
        {{ what }} by {{ a.signature ?? a.by }} · {{ new Date(a.at).toLocaleString() }}
        <div v-if="a.comment" class="muted">“{{ a.comment }}”</div>
      </li>
    </ul>
  </div>
</template>
