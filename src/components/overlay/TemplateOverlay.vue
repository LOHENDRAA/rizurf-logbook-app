<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import type { Anchor, Format, PageRole, Placeholder } from '../../core/model';
import { openPdf } from '../../lib/pdfjs-browser';
import { getHelvetica } from '../../core/fill/pdf';
import { boxLayout, toWinAnsi, type Layout } from '../../core/fill/pdfLayout';
import PdfPageLayer from './PdfPageLayer.vue';

export interface OverlayTemplate { format: Format; fileBytes: ArrayBuffer; placeholders: Placeholder[]; pageRoles?: PageRole[]; unitStartBlock?: number }

const props = withDefaults(defineProps<{
  template: OverlayTemplate; mode: 'edit' | 'fill'; selectedId?: string | null; adding?: boolean; pickingUnit?: boolean; values?: Record<string, string>;
}>(), { selectedId: null, adding: false, pickingUnit: false, values: () => ({}) });
const emit = defineEmits<{
  select: [id: string]; update: [ph: Placeholder]; add: [a: Anchor]; resolved: [ids: string[]]; 'pick-table': [ti: number]; 'page-role': [page: number, role: PageRole];
}>();

const SCALE = 1.3;
const root = ref<HTMLElement>();
const pdf = shallowRef<Awaited<ReturnType<typeof openPdf>> | null>(null);
const pageCount = ref(0);
const layouts = shallowRef<Record<string, Layout>>({});
const loadError = ref('');

watch(() => props.template.fileBytes, async bytes => {
  pdf.value = null;
  loadError.value = '';
  if (props.template.format !== 'pdf') return;
  try {
    const d = await openPdf(bytes);
    pdf.value = d;
    pageCount.value = d.numPages;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}, { immediate: true });

watch(() => [props.values, props.template.placeholders, props.mode] as const, async () => {
  if (props.template.format !== 'pdf' || props.mode !== 'fill') { layouts.value = {}; return; }
  const font = await getHelvetica();
  const out: Record<string, Layout> = {};
  for (const ph of props.template.placeholders) {
    const v = props.values[ph.id];
    if (v?.trim() && ph.anchor.kind === 'pdf') out[ph.id] = boxLayout(toWinAnsi(v), font, ph.anchor);
  }
  layouts.value = out;
}, { immediate: true, deep: true });

const byPage = computed(() => {
  const m = new Map<number, Placeholder[]>();
  for (const ph of props.template.placeholders) if (ph.anchor.kind === 'pdf') m.set(ph.anchor.page, [...(m.get(ph.anchor.page) ?? []), ph]);
  return m;
});
const pages = computed(() => Array.from({ length: pageCount.value }, (_, i) => i)
  .filter(i => props.mode === 'edit' || (props.template.pageRoles?.[i] ?? 'unit') !== 'ignore'));

watch(() => props.selectedId, async id => {
  if (!id) return;
  await nextTick();
  // 'nearest' (not 'center') so selecting a box already on screen — e.g. by clicking to start a
  // drag — doesn't smooth-scroll it out from under the pointer.
  root.value?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
</script>

<template>
  <div ref="root" class="overlay" :class="{ adding }">
    <p v-if="loadError" class="banner error">Couldn't show this file: {{ loadError }}</p>
    <template v-if="template.format === 'pdf' && pdf">
      <div v-for="i in pages" :key="i" class="page-wrap">
        <div v-if="mode === 'edit'" class="page-head">
          <span>Page {{ i + 1 }}</span>
          <select :data-testid="`page-role-${i}`" :value="template.pageRoles?.[i] ?? 'unit'"
            @change="emit('page-role', i, ($event.target as HTMLSelectElement).value as PageRole)">
            <option value="cover">Cover (filled once)</option>
            <option value="unit">Repeats every period</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
        <PdfPageLayer :pdf="pdf" :page-index="i" :scale="SCALE" :placeholders="byPage.get(i) ?? []" :mode="mode"
          :selected-id="selectedId" :adding="adding" :layouts="layouts"
          @select="emit('select', $event)" @update="emit('update', $event)" @add="emit('add', $event)" />
      </div>
    </template>
    <p v-else-if="template.format === 'docx'" class="muted">Word preview is added in the next task.</p>
    <p v-else-if="!loadError" class="muted">Loading document…</p>
  </div>
</template>
