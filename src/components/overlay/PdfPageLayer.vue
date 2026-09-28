<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { PdfAnchor, Placeholder } from '../../core/model';
import type { Layout } from '../../core/fill/pdfLayout';
import PlaceholderBox from './PlaceholderBox.vue';
import { BINDING_META } from './bindingColors';

const props = defineProps<{
  pdf: { getPage(n: number): Promise<any> }; pageIndex: number; scale: number; placeholders: Placeholder[];
  mode: 'edit' | 'fill'; selectedId: string | null; adding: boolean; layouts: Record<string, Layout>;
}>();
const emit = defineEmits<{ select: [id: string]; update: [ph: Placeholder]; add: [a: PdfAnchor] }>();

const canvas = ref<HTMLCanvasElement>();
const view = ref<number[]>([0, 0, 612, 792]);
let task: { cancel(): void; promise: Promise<void> } | null = null;

async function render() {
  const page = await props.pdf.getPage(props.pageIndex + 1);
  view.value = page.view;
  const vp = page.getViewport({ scale: props.scale });
  const c = canvas.value;
  if (!c) return;
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  task?.cancel();
  task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
  try { await task!.promise; } catch { /* superseded by a newer render */ }
}
onMounted(render);
watch(() => [props.pdf, props.scale], render);

const size = computed(() => ({ width: `${(view.value[2] - view.value[0]) * props.scale}px`, height: `${(view.value[3] - view.value[1]) * props.scale}px` }));
const css = (a: PdfAnchor) => {
  const s = props.scale;
  const v = view.value;
  return { left: (a.x - v[0]) * s, top: (v[3] - a.y - a.h) * s, width: a.w * s, height: a.h * s };
};

function onChange(ph: Placeholder, d: { dx: number; dy: number; dw: number; dh: number }) {
  const a = ph.anchor as PdfAnchor;
  const s = props.scale;
  const h = Math.max(4, a.h + d.dh / s);
  // Origin is bottom-left: moving down or growing downward lowers y.
  emit('update', { ...ph, anchor: { ...a, x: a.x + d.dx / s, y: a.y - d.dy / s - (h - a.h), w: Math.max(4, a.w + d.dw / s), h } });
}

const draft = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
const pos = (e: PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function down(e: PointerEvent) {
  if (props.mode !== 'edit' || !props.adding) return;
  const p = pos(e);
  draft.value = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!draft.value) return;
  const p = pos(e);
  draft.value = { ...draft.value, x1: p.x, y1: p.y };
}
function up() {
  const d = draft.value;
  draft.value = null;
  if (!d) return;
  const l = Math.min(d.x0, d.x1);
  const t = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0);
  const h = Math.abs(d.y1 - d.y0);
  if (w < 6 || h < 6) return;
  const s = props.scale;
  const v = view.value;
  emit('add', { kind: 'pdf', page: props.pageIndex, x: v[0] + l / s, y: v[3] - (t + h) / s, w: w / s, h: h / s });
}
const draftStyle = computed(() => {
  const d = draft.value;
  return d && { left: `${Math.min(d.x0, d.x1)}px`, top: `${Math.min(d.y0, d.y1)}px`, width: `${Math.abs(d.x1 - d.x0)}px`, height: `${Math.abs(d.y1 - d.y0)}px` };
});
function fillStyle(ph: Placeholder) {
  const b = css(ph.anchor as PdfAnchor);
  const l = props.layouts[ph.id];
  const s = props.scale;
  return { left: `${b.left + s}px`, top: `${b.top}px`, width: `${b.width - s}px`, height: `${b.height}px`, fontSize: `${l.size * s}px`, lineHeight: `${l.lineHeight * s}px` };
}
</script>

<template>
  <div class="pdf-page" data-testid="pdf-page" :data-index="pageIndex" :style="size" @pointerdown="down" @pointermove="move" @pointerup="up">
    <canvas ref="canvas" class="pdf-canvas" :style="size" />
    <template v-if="mode === 'edit'">
      <PlaceholderBox v-for="ph in placeholders" :id="ph.id" :key="ph.id" :box="css(ph.anchor as PdfAnchor)" :color="BINDING_META[ph.binding].color"
        :label="ph.label" :selected="ph.id === selectedId" :dashed="ph.source === 'label'" :pinned="ph.source === 'manual'"
        :draggable="!adding" :resizable="!adding" @select="emit('select', ph.id)" @change="onChange(ph, $event)" />
      <div v-if="draftStyle" class="draw-box" :style="draftStyle" />
    </template>
    <template v-else>
      <div v-for="ph in placeholders.filter(p => layouts[p.id])" :key="ph.id" class="fill-box" data-testid="fill-box"
        :class="{ overflow: layouts[ph.id].truncated, whiteout: (ph.anchor as PdfAnchor).whiteout }" :style="fillStyle(ph)">
        <div v-for="(line, k) in layouts[ph.id].lines" :key="k" class="fill-line">{{ line }}</div>
      </div>
    </template>
  </div>
</template>
