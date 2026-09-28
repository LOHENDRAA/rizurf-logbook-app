<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import { resolveValues } from '../../core/autofill';
import { fillDocx } from '../../core/fill/docx';
import { fillPdf } from '../../core/fill/pdf';
import { downloadBytes, safeFileName } from '../../lib/download';
import { errorText } from '../../lib/errors';
import StatusBadge from '../../components/StatusBadge.vue';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const st = useStudent();
const toast = useToast();
const selected = ref<string[]>([]);
const busy = ref(false);

const approved = computed(() => st.periods.filter(p => st.statusOf(p.key) === 'approved'));
const chosen = computed(() => approved.value.filter(p => selected.value.includes(p.key)));
const toggle = (key: string) => {
  selected.value = selected.value.includes(key) ? selected.value.filter(k => k !== key) : [...selected.value, key];
};
const selectAll = () => { selected.value = approved.value.map(p => p.key); };

async function doExport() {
  const t = st.template;
  const s = st.student;
  if (!t || !s || !chosen.value.length) return;
  busy.value = true;
  try {
    const periods = chosen.value.map(p => ({
      label: p.label,
      values: resolveValues(t.placeholders, s.coverValues, st.fillFor(p.key).values, st.latest(p.key, 'approve')),
    }));
    // The cover is filled once. Its signature comes from the latest selected approval.
    const cover = resolveValues(t.placeholders, s.coverValues, {}, st.latest(chosen.value[chosen.value.length - 1].key, 'approve'));
    const name = `${safeFileName(t.university, s.name)}_logbook.${t.format}`;
    if (t.format === 'docx') downloadBytes(name, await fillDocx(t.fileBytes, t, cover, periods.map(p => p.values)), DOCX_MIME);
    else downloadBytes(name, await fillPdf({ templateBytes: new Uint8Array(t.fileBytes), template: t, cover, periods }), 'application/pdf');
    toast.show('Logbook downloaded');
  } catch (e) {
    toast.show(errorText(e), true);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="card" style="max-width: 760px">
    <h1>Export logbook</h1>
    <p class="muted" data-testid="approved-note">{{ approved.length }} of {{ st.periods.length }} periods approved. Only approved periods can be exported.</p>
    <ul class="plain-list">
      <li v-for="p in st.periods" :key="p.key">
        <label class="check">
          <input type="checkbox" data-testid="export-period" :disabled="st.statusOf(p.key) !== 'approved'" :checked="selected.includes(p.key)" @change="toggle(p.key)" />
          {{ p.label }} <StatusBadge :status="st.statusOf(p.key)" />
        </label>
      </li>
    </ul>
    <div class="row" style="margin-top: 12px">
      <button type="button" class="link" :disabled="!approved.length" @click="selectAll">Select all approved</button>
      <span class="spacer" />
      <button type="button" class="primary" data-testid="export-btn" :disabled="busy || !chosen.length" @click="doExport">
        {{ busy ? 'Building file…' : `Download .${st.template?.format ?? ''}` }}
      </button>
    </div>
  </section>
</template>
