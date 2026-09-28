<script setup lang="ts">
import type { Binding, DateRole, DayMode, Placeholder } from '../core/model';
import { BINDING_META } from './overlay/bindingColors';

const props = defineProps<{ ph: Placeholder; unresolved: boolean }>();
const emit = defineEmits<{ update: [ph: Placeholder]; remove: [] }>();

const DATE_ROLES: [DateRole, string][] = [['day', 'That day'], ['start', 'Period start'], ['end', 'Period end'], ['range', 'Start – end'], ['number', 'Period number']];
const SOURCE_TEXT = { marker: 'a marker in the file', label: 'a label in the file', manual: 'you' } as const;

const set = (patch: Partial<Placeholder>) => emit('update', { ...props.ph, ...patch });
function onBinding(b: Binding) {
  const patch: Partial<Placeholder> = { binding: b };
  if (b === 'date' && !props.ph.dateRole) patch.dateRole = props.ph.dayIndex != null ? 'day' : 'range';
  set(patch);
}
const onDay = (v: string) => set({ dayIndex: v === '' ? undefined : Math.max(0, Number(v) - 1) });
</script>

<template>
  <div class="card inspector">
    <h2>Placeholder</h2>
    <p v-if="unresolved" class="banner">Can't show this one on the page. Delete it and add it again manually.</p>
    <label>Label <input data-testid="insp-label" :value="ph.label" @input="set({ label: ($event.target as HTMLInputElement).value })" /></label>
    <label>Filled with
      <select data-testid="insp-binding" :value="ph.binding" @change="onBinding(($event.target as HTMLSelectElement).value as Binding)">
        <option v-for="(m, b) in BINDING_META" :key="b" :value="b">{{ m.label }}</option>
      </select>
    </label>
    <label v-if="ph.binding === 'date'">Shows
      <select data-testid="insp-daterole" :value="ph.dateRole ?? (ph.dayIndex != null ? 'day' : 'range')" @change="set({ dateRole: ($event.target as HTMLSelectElement).value as DateRole })">
        <option v-for="[r, t] in DATE_ROLES" :key="r" :value="r">{{ t }}</option>
      </select>
    </label>
    <template v-if="ph.binding === 'daily' || (ph.binding === 'date' && (ph.dateRole ?? 'day') === 'day')">
      <label>Day number <input data-testid="insp-dayindex" type="number" min="1" :value="ph.dayIndex != null ? ph.dayIndex + 1 : ''" @input="onDay(($event.target as HTMLInputElement).value)" /></label>
      <label>Counting
        <select :value="ph.dayMode ?? 'nth'" @change="set({ dayMode: ($event.target as HTMLSelectElement).value as DayMode })">
          <option value="nth">Nth working day of the period</option>
          <option value="weekday">Weekday (1 = Monday)</option>
        </select>
      </label>
    </template>
    <p class="muted">Part: {{ ph.region === 'cover' ? 'Cover (filled once)' : 'Repeats every period' }} · Found by {{ SOURCE_TEXT[ph.source] }}</p>
    <button type="button" class="danger" data-testid="insp-delete" @click="emit('remove')">Delete placeholder</button>
  </div>
</template>
