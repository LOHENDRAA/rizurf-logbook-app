<script setup lang="ts">
import { computed, ref } from 'vue';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { errorText } from '../lib/errors';
import { SERVER_MODE } from '../data/api';
import { nameKey } from '../core/organize';
import type { Item } from '../core/model';

/** "Review what I found": one card per waiting suggestion, with Accept, Edit and Reject. */
const props = defineProps<{ date: string }>();
const journal = useJournal();
const toast = useToast();
const LABEL = { project: 'Project', activity: 'Activity', learning: 'Learning', skill: 'Skill' } as const;
const waiting = computed(() => (journal.org[props.date]?.items ?? []).filter(i => i.status === 'suggested'));
const isNew = (name: string) => !journal.projects.some(p => nameKey(p.name) === nameKey(name));
const editing = ref<string | null>(null);
const draft = ref('');
const busy = ref(false);

function edit(i: Item) { editing.value = i.id; draft.value = i.text; }
async function review(i: Item, action: 'accept' | 'reject', text?: string) {
  busy.value = true;
  try {
    await journal.review(props.date, i.id, action, text);
    editing.value = null;
  } catch (e) {
    toast.show(`Couldn't save that: ${errorText(e)}`, true);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="journal.reviewing === date" class="card review-panel" data-testid="review-panel" aria-live="polite">
    <header class="row">
      <h2>Review what I found</h2>
      <span class="spacer" />
      <button type="button" class="link" data-testid="review-close" @click="journal.reviewing = null">Close</button>
    </header>
    <p v-if="!SERVER_MODE" class="muted" data-testid="review-demo">Demo suggestions (no AI)</p>
    <p v-if="journal.organizeError" class="banner" data-testid="organize-error">{{ journal.organizeError }}</p>
    <p v-else-if="!waiting.length" class="muted">Nothing waiting. Everything found here has been reviewed.</p>
    <datalist id="project-names"><option v-for="p in journal.projects" :key="p.id" :value="p.name" /></datalist>
    <article v-for="i in waiting" :key="i.id" class="review-card" data-testid="review-card" :data-kind="i.kind">
      <p class="muted">{{ LABEL[i.kind] }}<template v-if="i.kind === 'project' && isNew(i.text)"> · new</template></p>
      <form v-if="editing === i.id" @submit.prevent="review(i, 'accept', draft)">
        <input v-model="draft" data-testid="review-edit-text" required :aria-label="`Edit ${LABEL[i.kind]}`"
          :list="i.kind === 'project' ? 'project-names' : undefined" :maxlength="i.kind === 'project' ? 120 : 300" />
        <div class="row">
          <button type="button" @click="editing = null">Cancel</button>
          <button class="primary" data-testid="review-save" :disabled="busy">Save</button>
        </div>
      </form>
      <template v-else>
        <p data-testid="review-text">{{ i.text }}</p>
        <div class="row">
          <button type="button" class="primary" data-testid="review-accept" :disabled="busy" @click="review(i, 'accept')">Accept</button>
          <button type="button" data-testid="review-edit" :disabled="busy" @click="edit(i)">Edit</button>
          <button type="button" data-testid="review-reject" :disabled="busy" @click="review(i, 'reject')">Reject</button>
        </div>
      </template>
    </article>
  </section>
</template>
