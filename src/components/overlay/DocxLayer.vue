<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderAsync } from 'docx-preview';
import type { DocxAnchor, Placeholder } from '../../core/model';
import { SIGNATURE_FONT, usesSignatureFont } from '../../core/autofill';
import PlaceholderBox from './PlaceholderBox.vue';
import { BINDING_META } from './bindingColors';
import { anchorAtParagraphEnd, anchorFromCell, anchorFromSelection, indexDocxDom, resolveAnchor, topTableIndexOf, type DocxDomIndex } from './docxAnchors';

const props = defineProps<{
  bytes: ArrayBuffer; paraTexts: string[]; placeholders: Placeholder[]; mode: 'edit' | 'fill'; selectedId: string | null;
  adding: boolean; pickingUnit: boolean; unitTableIndex: number | null; values: Record<string, string>;
}>();
const emit = defineEmits<{ select: [id: string]; add: [a: DocxAnchor]; resolved: [ids: string[]]; 'pick-table': [ti: number] }>();

const host = ref<HTMLDivElement>();
const doc = ref<HTMLDivElement>();
const boxes = ref<{ ph: Placeholder; box: { left: number; top: number; width: number; height: number } }[]>([]);
const unitLineTop = ref<number | null>(null);
let index: DocxDomIndex | null = null;
const touched = new Set<HTMLElement>();
let observer: ResizeObserver | null = null;

async function render() {
  if (!doc.value) return;
  index = null;
  touched.clear();
  doc.value.innerHTML = '';
  await renderAsync(new Blob([props.bytes]), doc.value, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true });
  index = indexDocxDom(doc.value, props.paraTexts);
  refresh();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The preview fills values by hiding the original children and appending a
// marked node, never by replacing innerHTML. That keeps the element
// references in `index` valid across keystrokes.
function clearFill() {
  for (const el of touched) {
    el.classList.remove('il-hide');
    el.querySelectorAll(':scope > .il-filled').forEach(n => n.remove());
  }
  touched.clear();
}
function applyFill() {
  if (!index) return;
  const perEl = new Map<HTMLElement, { cell?: string; ranges: { start: number; end: number; v: string }[] }>();
  // Values are pre-rendered HTML; the supervisor's signed name gets the signature font.
  const html = (ph: Placeholder, v: string) => {
    const t = escapeHtml(v).replace(/\n/g, '<br>');
    return usesSignatureFont(ph) ? `<span style="font-family: '${SIGNATURE_FONT}', cursive; font-size: 1.4em">${t}</span>` : t;
  };
  for (const ph of props.placeholders) {
    const v = props.values[ph.id];
    if (!v?.trim()) continue;
    const a = ph.anchor as DocxAnchor;
    const r = resolveAnchor(index, a);
    if (!r) continue;
    const entry = perEl.get(r.el) ?? { ranges: [] };
    perEl.set(r.el, entry);
    if (a.kind === 'docx-cell') entry.cell = html(ph, v);
    else entry.ranges.push({ start: a.start, end: a.end, v: html(ph, v) });
  }
  for (const [el, e] of perEl) {
    let out: string;
    if (e.cell != null) out = e.cell;
    else {
      const text = el.textContent ?? '';
      const plain = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');
      let pos = 0;
      out = '';
      for (const r of e.ranges.sort((a, b) => a.start - b.start)) {
        const pre = text.slice(pos, r.start);
        out += plain(pre) + (r.start === r.end && text.slice(0, r.start) && !/\s$/.test(text.slice(0, r.start)) ? ' ' : '') + r.v;
        pos = Math.max(pos, r.end);
      }
      out += plain(text.slice(pos));
    }
    const node = document.createElement(e.cell != null ? 'p' : 'span');
    node.className = 'il-filled';
    node.innerHTML = out;
    el.classList.add('il-hide');
    el.appendChild(node);
    touched.add(el);
  }
}

function refresh() {
  if (!index || !host.value || !doc.value) return;
  clearFill();
  if (props.mode === 'fill') { applyFill(); boxes.value = []; return; }
  const origin = host.value.getBoundingClientRect();
  const out: typeof boxes.value = [];
  const missing: string[] = [];
  for (const ph of props.placeholders) {
    const r = resolveAnchor(index, ph.anchor as DocxAnchor);
    if (!r) { missing.push(ph.id); continue; }
    const rect = r.rect();
    out.push({ ph, box: { left: rect.left - origin.left, top: rect.top - origin.top, width: Math.max(rect.width, 10), height: Math.max(rect.height, 14) } });
  }
  boxes.value = out;
  emit('resolved', missing);
  const t = props.unitTableIndex != null ? index.tables[props.unitTableIndex] : null;
  const first = doc.value.querySelector('section.docx article');
  unitLineTop.value = t ? t.getBoundingClientRect().top - origin.top - 4 : first ? first.getBoundingClientRect().top - origin.top : null;
}

function onClick(e: MouseEvent) {
  if (props.mode !== 'edit' || !index) return;
  const target = e.target as HTMLElement;
  if (props.pickingUnit) {
    const ti = topTableIndexOf(index, target);
    if (ti != null) emit('pick-table', ti);
    return;
  }
  if (!props.adding) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    const a = anchorFromSelection(index, sel);
    sel.removeAllRanges();
    if (a) { emit('add', a); return; }
  }
  const td = target.closest('td');
  if (td) { const a = anchorFromCell(index, td as HTMLTableCellElement); if (a) emit('add', a); return; }
  const p = target.closest('p');
  if (p) { const a = anchorAtParagraphEnd(index, p as HTMLElement); if (a) emit('add', a); }
}

onMounted(() => {
  void render();
  observer = new ResizeObserver(() => refresh());
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.bytes, () => void render());
watch(() => [props.placeholders, props.values, props.mode, props.unitTableIndex], () => nextTick(refresh), { deep: true });
</script>

<template>
  <div ref="host" class="docx-host" :class="{ picking: pickingUnit, adding }" @click="onClick">
    <div ref="doc" />
    <template v-if="mode === 'edit'">
      <div v-if="unitLineTop != null" class="unit-line" :style="{ top: `${unitLineTop}px` }"><span>Repeats every period &#8595;</span></div>
      <PlaceholderBox v-for="b in boxes" :id="b.ph.id" :key="b.ph.id" :box="b.box" :color="BINDING_META[b.ph.binding].color" :label="b.ph.label"
        :selected="b.ph.id === selectedId" :dashed="b.ph.source === 'label'" :pinned="b.ph.source === 'manual'"
        :draggable="false" :resizable="false" @select="emit('select', b.ph.id)" />
    </template>
  </div>
</template>
