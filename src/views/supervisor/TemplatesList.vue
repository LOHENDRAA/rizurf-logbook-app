<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { Template } from '../../core/model';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';
import { ask } from '../../lib/ask';

const templates = useTemplates();
const toast = useToast();
const usage = ref<Record<string, number>>({});

onMounted(async () => {
  await templates.load();
  usage.value = await templates.usageAll();
});

async function remove(t: Template) {
  const n = usage.value[t.id] ?? 0;
  const q = n ? `${n} student(s) use this template. Delete it anyway? They'll be asked to pick another.` : `Delete the template for ${t.university}?`;
  if (!(await ask(q, 'Delete'))) return;
  try { await templates.remove(t.id); toast.show('Template deleted'); } catch (e) { toast.show(errorText(e), true); }
}
</script>

<template>
  <section class="card">
    <div class="row">
      <h1>University templates</h1>
      <span class="spacer" />
      <RouterLink to="/supervisor/templates/new"><button type="button" class="primary" data-testid="new-template">New template</button></RouterLink>
    </div>
    <p v-if="!templates.list.length" class="muted">No templates yet. Upload a university's logbook to get started.</p>
    <table v-else class="list">
      <thead><tr><th>University</th><th>Format</th><th>Period</th><th>Placeholders</th><th>Students</th><th /></tr></thead>
      <tbody>
        <tr v-for="t in templates.list" :key="t.id" data-testid="template-row">
          <td>{{ t.university }}</td>
          <td>{{ t.format.toUpperCase() }}</td>
          <td>{{ t.period }}</td>
          <td>{{ t.placeholders.length }}</td>
          <td>{{ usage[t.id] ?? 0 }}</td>
          <td class="row"><RouterLink :to="`/supervisor/templates/${t.id}`">Edit</RouterLink><button type="button" class="link" @click="remove(t)">Delete</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
