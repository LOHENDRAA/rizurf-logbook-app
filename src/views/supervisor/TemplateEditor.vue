<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import type { Anchor, PageRole, Placeholder, Template } from '../../core/model';
import { cloneTemplate, detectFromFile, findByUniversity, validateTemplate } from '../../core/template';
import { blockIndexOfTable, docxContext, readDocxXml, regionOfDocxAnchor, type DocxContext } from '../../core/detect/docx';
import { newId } from '../../core/ids';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import PlaceholderInspector from '../../components/PlaceholderInspector.vue';
import { BINDING_META } from '../../components/overlay/bindingColors';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';

const route = useRoute();
const router = useRouter();
const templates = useTemplates();
const toast = useToast();

const draft = ref<Template | null>(null);
const original = shallowRef<Template | null>(null);
const ctx = shallowRef<DocxContext | null>(null);
const selectedId = ref<string | null>(null);
const tool = ref<'select' | 'add' | 'unit'>('select');
const unresolved = ref<string[]>([]);
const warnings = ref<string[]>([]);
const dirty = ref(false);
const busy = ref(false);
const upload = ref<{ file: File | null; university: string }>({ file: null, university: '' });

onMounted(async () => {
  await templates.load();
  const id = route.params.id as string | undefined;
  if (!id) return;
  const t = templates.list.find(x => x.id === id);
  if (!t) { toast.show('That template no longer exists.', true); await router.replace('/supervisor/templates'); return; }
  original.value = t;
  draft.value = cloneTemplate(t);
  if (t.format === 'docx') ctx.value = docxContext(await readDocxXml(t.fileBytes));
});

async function runDetect() {
  const f = upload.value.file;
  if (!f) { toast.show('Choose a .docx or .pdf file first.', true); return; }
  busy.value = true;
  try {
    const r = await detectFromFile(f);
    draft.value = {
      id: newId('tpl'), university: upload.value.university.trim(), format: r.format, fileName: f.name, fileBytes: r.bytes,
      period: 'weekly', pageRoles: r.pageRoles, unitStartBlock: r.unitStartBlock, placeholders: r.placeholders, updatedAt: '',
    };
    ctx.value = r.docx ?? null;
    warnings.value = r.warnings;
    dirty.value = true;
    toast.show(`Found ${r.placeholders.length} placeholders. Check them and fix anything that's wrong.`);
  } catch (e) {
    toast.show(errorText(e), true);
  } finally {
    busy.value = false;
  }
}

function regionFor(anchor: Anchor): 'cover' | 'unit' {
  const t = draft.value!;
  if (anchor.kind === 'pdf') return t.pageRoles?.[anchor.page] === 'cover' ? 'cover' : 'unit';
  return ctx.value ? regionOfDocxAnchor(ctx.value, anchor, t.unitStartBlock ?? 0) : 'unit';
}
function recomputeRegions() {
  const t = draft.value!;
  t.placeholders = t.placeholders.map(p => ({ ...p, region: regionFor(p.anchor) }));
}
function updatePh(ph: Placeholder) {
  const t = draft.value!;
  t.placeholders = t.placeholders.map(p => (p.id === ph.id ? { ...ph, region: regionFor(ph.anchor) } : p));
  dirty.value = true;
}
function addPh(anchor: Anchor) {
  const ph: Placeholder = { id: newId('ph'), label: 'New field', binding: 'free', source: 'manual', region: regionFor(anchor), anchor };
  draft.value!.placeholders = [...draft.value!.placeholders, ph];
  selectedId.value = ph.id;
  tool.value = 'select';
  dirty.value = true;
}
function removePh(id: string) {
  draft.value!.placeholders = draft.value!.placeholders.filter(p => p.id !== id);
  selectedId.value = null;
  dirty.value = true;
}
function setPageRole(page: number, role: PageRole) {
  const t = draft.value!;
  const roles = [...(t.pageRoles ?? [])];
  roles[page] = role;
  t.pageRoles = roles;
  recomputeRegions();
  dirty.value = true;
}
function pickTable(ti: number) {
  if (!ctx.value) return;
  const bi = blockIndexOfTable(ctx.value, ti);
  if (bi == null) { toast.show("That table isn't at the top level of the document.", true); return; }
  draft.value!.unitStartBlock = bi;
  recomputeRegions();
  tool.value = 'select';
  dirty.value = true;
}
function wholeDocRepeats() {
  draft.value!.unitStartBlock = 0;
  recomputeRegions();
  dirty.value = true;
}

const selected = computed(() => draft.value?.placeholders.find(p => p.id === selectedId.value) ?? null);
const groups = computed(() => {
  const list = draft.value?.placeholders ?? [];
  return [
    { title: 'Cover (filled once)', items: list.filter(p => p.region === 'cover') },
    { title: 'Repeats every period', items: list.filter(p => p.region === 'unit') },
  ].filter(g => g.items.length);
});
const hint = computed(() => {
  if (tool.value === 'add') return draft.value?.format === 'pdf' ? 'Drag on the page to draw a new placeholder.' : 'Click a table cell, or select some text, to add a placeholder.';
  if (tool.value === 'unit') return 'Click the table where the repeating part (one period) starts.';
  return 'Click a highlight or a list item to edit it. Dashed boxes are guesses from labels: check them.';
});

async function save() {
  const t = draft.value!;
  t.university = t.university.trim();
  const errors = validateTemplate(t);
  if (errors.length) { toast.show(errors.join(' '), true); return; }
  const clash = findByUniversity(templates.list, t.university, t.id);
  if (clash && !confirm(`A template for "${clash.university}" already exists. Replace it?`)) return;
  const previous = clash ?? original.value;
  if (previous) {
    const keep = new Set(t.placeholders.map(p => p.id));
    const removed = previous.placeholders.filter(p => !keep.has(p.id)).map(p => p.id);
    const affected = removed.length ? await templates.studentsWithValues(previous.id, removed) : 0;
    if (affected && !confirm(`${affected} student(s) typed into fields you removed. Their text for those fields will be lost. Save anyway?`)) return;
  }
  try {
    if (clash) {
      if (original.value && original.value.id !== clash.id) await templates.remove(original.value.id);
      t.id = clash.id; // students linked to the old template keep their link
    }
    t.updatedAt = new Date().toISOString();
    await templates.save(t);
    dirty.value = false;
    toast.show('Template saved');
    await router.push('/supervisor/templates');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}

onBeforeRouteLeave(() => !dirty.value || confirm('Discard your unsaved changes to this template?'));
</script>

<template>
  <section v-if="!draft" class="card" style="max-width: 560px">
    <h1>New university template</h1>
    <label>University name <input v-model="upload.university" data-testid="university-input" placeholder="e.g. Taylor's University" /></label>
    <label>Template file (.docx or .pdf)
      <input data-testid="upload-input" type="file" accept=".docx,.pdf" @change="upload.file = ($event.target as HTMLInputElement).files?.[0] ?? null" />
    </label>
    <button type="button" class="primary" data-testid="detect-btn" :disabled="busy" @click="runDetect">{{ busy ? 'Detecting…' : 'Detect placeholders' }}</button>
  </section>

  <section v-else>
    <div class="toolbar card">
      <label>University <input v-model="draft.university" data-testid="university-input" @input="dirty = true" /></label>
      <label>Period
        <select v-model="draft.period" data-testid="period-select" @change="dirty = true">
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
      </label>
      <div class="seg">
        <button type="button" data-testid="mode-select-btn" :aria-pressed="tool === 'select'" @click="tool = 'select'">Select</button>
        <button type="button" data-testid="mode-add-btn" :aria-pressed="tool === 'add'" @click="tool = 'add'">Add placeholder</button>
        <template v-if="draft.format === 'docx'">
          <button type="button" data-testid="mode-unit-btn" :aria-pressed="tool === 'unit'" @click="tool = 'unit'">Set repeating start</button>
          <button type="button" @click="wholeDocRepeats">Whole document repeats</button>
        </template>
      </div>
      <span class="spacer" />
      <button type="button" class="primary" data-testid="save-template" @click="save">Save template</button>
    </div>
    <p class="muted">{{ hint }}</p>
    <p v-for="w in warnings" :key="w" class="banner">{{ w }}</p>
    <div class="editor-grid">
      <div class="doc-pane">
        <TemplateOverlay :template="draft" mode="edit" :selected-id="selectedId" :adding="tool === 'add'" :picking-unit="tool === 'unit'"
          @select="selectedId = $event" @update="updatePh" @add="addPh" @resolved="unresolved = $event" @pick-table="pickTable" @page-role="setPageRole" />
      </div>
      <aside class="side">
        <div class="card legend">
          <span v-for="(m, b) in BINDING_META" :key="b"><i class="dot" :style="{ background: m.color }" />{{ m.label }}</span>
        </div>
        <PlaceholderInspector v-if="selected" :ph="selected" :unresolved="unresolved.includes(selected.id)" @update="updatePh" @remove="removePh(selected.id)" />
        <div class="card">
          <h2>{{ draft.placeholders.length }} placeholders</h2>
          <div v-for="g in groups" :key="g.title">
            <p class="muted">{{ g.title }}</p>
            <div class="ph-list">
              <button v-for="ph in g.items" :key="ph.id" type="button" class="ph-item" data-testid="ph-item" :aria-pressed="ph.id === selectedId" @click="selectedId = ph.id">
                <i class="dot" :style="{ background: BINDING_META[ph.binding].color }" />
                <span class="ph-name">{{ ph.label }}</span>
                <small>{{ BINDING_META[ph.binding].label }}</small>
                <span v-if="unresolved.includes(ph.id)" title="Can't show this on the page">⚠</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
