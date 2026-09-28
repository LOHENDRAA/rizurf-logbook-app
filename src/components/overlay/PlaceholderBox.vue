<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  id: string; box: { left: number; top: number; width: number; height: number }; color: string; label: string;
  selected: boolean; dashed: boolean; pinned: boolean; draggable: boolean; resizable: boolean; warn?: boolean;
}>();
const emit = defineEmits<{ select: []; change: [d: { dx: number; dy: number; dw: number; dh: number }] }>();

const drag = ref<{ kind: 'move' | 'resize'; sx: number; sy: number; dx: number; dy: number } | null>(null);
const style = computed(() => {
  const d = drag.value;
  const mv = d?.kind === 'move';
  const rs = d?.kind === 'resize';
  return {
    left: `${props.box.left + (mv ? d!.dx : 0)}px`,
    top: `${props.box.top + (mv ? d!.dy : 0)}px`,
    width: `${Math.max(4, props.box.width + (rs ? d!.dx : 0))}px`,
    height: `${Math.max(4, props.box.height + (rs ? d!.dy : 0))}px`,
    borderColor: props.color,
    borderStyle: props.dashed ? 'dashed' : 'solid',
    background: `${props.color}${props.selected ? '33' : '14'}`,
  };
});

function start(kind: 'move' | 'resize', e: PointerEvent) {
  emit('select');
  if ((kind === 'move' && !props.draggable) || (kind === 'resize' && !props.resizable)) return;
  e.stopPropagation();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  drag.value = { kind, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
}
function move(e: PointerEvent) {
  if (!drag.value) return;
  drag.value = { ...drag.value, dx: e.clientX - drag.value.sx, dy: e.clientY - drag.value.sy };
}
function end() {
  const d = drag.value;
  drag.value = null;
  if (!d || (d.dx === 0 && d.dy === 0)) return;
  emit('change', d.kind === 'move' ? { dx: d.dx, dy: d.dy, dw: 0, dh: 0 } : { dx: 0, dy: 0, dw: d.dx, dh: d.dy });
}
</script>

<template>
  <div class="ph-box" :class="{ selected, warn }" :style="style" data-testid="ph-box" :data-id="id" :title="label"
       @pointerdown="start('move', $event)" @pointermove="move" @pointerup="end">
    <span class="ph-tag" :style="{ background: color }">{{ pinned ? '✎ ' : '' }}{{ label }}</span>
    <span v-if="resizable && selected" class="ph-resize" @pointerdown="start('resize', $event)" @pointermove="move" @pointerup="end" />
  </div>
</template>
