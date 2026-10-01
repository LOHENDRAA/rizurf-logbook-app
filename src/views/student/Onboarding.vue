<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useTemplates } from '../../stores/templates';
import { useJournal } from '../../stores/journal';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';
import { formatDMY } from '../../core/dates';

const st = useStudent();
const templates = useTemplates();
const journal = useJournal();
const toast = useToast();
const router = useRouter();
const form = ref({
  templateId: st.templateMissing ? '' : (st.student?.templateId ?? ''),
  start: st.student?.startDate ?? '',
  end: st.student?.endDate ?? '',
});
onMounted(() => templates.load());

const NONE = 'none';
async function save() {
  try {
    if (form.value.templateId === NONE) {
      if (!form.value.start) { toast.show('Pick the day your internship started.', true); return; }
      await journal.start(st.student!.id, form.value.start);
      toast.show('Saved');
      await router.push('/journal');
      return;
    }
    if (!form.value.templateId || !form.value.start || !form.value.end) { toast.show('Pick your university and both dates.', true); return; }
    await st.setup(form.value.templateId, form.value.start, form.value.end);
    toast.show('Saved');
    await router.push('/student/notepad');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
</script>

<template>
  <section class="card" style="max-width: 560px">
    <h1>My internship</h1>
    <p v-if="st.templateMissing" class="banner">Your university's template was removed. Pick another one to carry on.</p>
    <template v-if="st.canChangeSetup || st.templateMissing">
      <p v-if="!templates.list.length" class="banner">No university templates yet. Ask your supervisor to add one (switch to "Supervisor" at the top).</p>
      <label>University
        <select v-model="form.templateId" data-testid="onb-university">
          <option value="" disabled>Choose…</option>
          <option v-for="t in templates.list" :key="t.id" :value="t.id">{{ t.university }}</option>
          <option :value="NONE">My university has no logbook (keep a private journal)</option>
        </select>
      </label>
      <label>{{ form.templateId === NONE ? 'Internship started on' : 'Start date' }} <input v-model="form.start" data-testid="onb-start" type="date" /></label>
      <label v-if="form.templateId !== NONE">End date <input v-model="form.end" data-testid="onb-end" type="date" /></label>
      <button type="button" class="primary" data-testid="onb-save" @click="save">Save</button>
    </template>
    <template v-else>
      <p>{{ st.template?.university }}: {{ formatDMY(st.student!.startDate!) }} to {{ formatDMY(st.student!.endDate!) }}</p>
      <p class="muted">These can't be changed after you've submitted a period.</p>
    </template>
  </section>
</template>
