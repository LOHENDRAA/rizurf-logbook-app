<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import type { PeriodFill, Placeholder } from '../../core/model';
import { autofill, dayDate, isCoverField, resolveValues, sourceValue } from '../../core/autofill';
import { emptyRequired, isLocked, STATUS_TEXT } from '../../core/workflow';
import { livePlaceholders } from '../../core/template';
import { formatDMY, todayISO } from '../../core/dates';
import { plain } from '../../data/plain';
import { debounce } from '../../lib/debounce';
import { errorText } from '../../lib/errors';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import StatusBadge from '../../components/StatusBadge.vue';

const st = useStudent();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const today = todayISO();

const periodKey = computed(() => {
  const k = route.params.periodKey as string | undefined;
  if (k && st.periods.some(p => p.key === k)) return k;
  return (st.periods.find(p => today >= p.start && today <= p.end) ?? st.periods.find(p => st.statusOf(p.key) !== 'approved') ?? st.periods[0])?.key;
});
const period = computed(() => st.periods.find(p => p.key === periodKey.value));
const phs = computed(() => (st.template ? livePlaceholders(st.template) : []));
const fill = ref<PeriodFill | null>(null);
const cover = ref<Record<string, string>>({});
const locked = computed(() => isLocked(fill.value ?? undefined));

const fillSaver = debounce(async () => {
  if (!fill.value || locked.value) return;
  try { await st.saveFill(plain(fill.value)); } catch (e) { toast.show(errorText(e), true); }
}, 500);
const coverSaver = debounce(async () => {
  try { await st.saveCover({ ...cover.value }); } catch (e) { toast.show(errorText(e), true); }
}, 500);
const flushAll = () => Promise.all([fillSaver.flush(), coverSaver.flush()]);

async function open() {
  const p = period.value;
  if (!p || !st.template || !st.student) { fill.value = null; return; }
  let f = plain(st.fillFor(p.key));
  if (f.status === 'draft') {
    const r = autofill(phs.value, p, st.notes, f.values, f.autofilled);
    if (JSON.stringify(r) !== JSON.stringify({ values: f.values, autofilled: f.autofilled })) {
      f = { ...f, ...r };
      try { await st.saveFill(f); } catch (e) { toast.show(errorText(e), true); }
    }
  }
  fill.value = f;
  cover.value = { ...st.student.coverValues };
}
watch(periodKey, async (_k, old) => { if (old) await flushAll(); await open(); }, { immediate: true });
onBeforeRouteLeave(async () => { await flushAll(); });
onBeforeUnmount(() => { void flushAll(); });

const approval = computed(() => (periodKey.value ? st.latest(periodKey.value, 'approve') : undefined));
const changesComment = computed(() => (fill.value?.status === 'changes_requested' && periodKey.value ? st.latest(periodKey.value, 'request_changes')?.comment : undefined));
const previewValues = computed(() => (fill.value ? resolveValues(phs.value, cover.value, fill.value.values, approval.value) : {}));

const groups = computed(() => {
  const own = (p: Placeholder) => !isCoverField(p);
  return [
    { title: 'Cover (shared by every period)', items: phs.value.filter(p => isCoverField(p) && p.binding !== 'signature') },
    { title: 'Days', items: phs.value.filter(p => own(p) && (p.binding === 'daily' || p.binding === 'date')).sort((a, b) => (a.dayIndex ?? -1) - (b.dayIndex ?? -1)) },
    { title: 'Period answers', items: phs.value.filter(p => own(p) && p.binding === 'period') },
    { title: 'Other', items: phs.value.filter(p => own(p) && p.binding === 'free') },
    { title: 'Filled by your supervisor', items: phs.value.filter(p => p.binding === 'signature') },
  ].filter(g => g.items.length);
});

const valueOf = (ph: Placeholder) => previewValues.value[ph.id] ?? '';
const editable = (ph: Placeholder) => ph.binding !== 'signature' && (isCoverField(ph) || !locked.value);
const multiline = (ph: Placeholder) => ph.binding === 'daily' || ph.binding === 'period' || ph.binding === 'free';
function labelFor(ph: Placeholder) {
  const p = period.value;
  if (!p || ph.dayIndex == null || isCoverField(ph)) return ph.label;
  const d = dayDate(ph, p);
  return d ? `${ph.label} (${formatDMY(d)})` : `${ph.label} (no day in this period)`;
}
function setValue(ph: Placeholder, v: string) {
  if (isCoverField(ph)) { cover.value = { ...cover.value, [ph.id]: v }; coverSaver.call(); }
  else if (fill.value) { fill.value.values[ph.id] = v; fillSaver.call(); }
}
function fromNotepad(ph: Placeholder) {
  const f = fill.value;
  return !!f && ph.binding === 'daily' && !!f.autofilled[ph.id] && (f.values[ph.id] ?? '') === f.autofilled[ph.id];
}
function drift(ph: Placeholder) {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || locked.value || ph.binding !== 'daily' || isCoverField(ph)) return false;
  const s = sourceValue(ph, p, st.notes);
  return s != null && s !== (f.autofilled[ph.id] ?? '');
}
function pullAgain(ph: Placeholder) {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || !confirm('Replace this field with the latest notepad text?')) return;
  const s = sourceValue(ph, p, st.notes) ?? '';
  f.values[ph.id] = s;
  f.autofilled[ph.id] = s;
  fillSaver.call();
}
async function submit() {
  const p = period.value;
  if (!p || !fill.value) return;
  await flushAll();
  const missing = emptyRequired(phs.value, previewValues.value);
  const msg = missing.length
    ? `${missing.length} field(s) are still empty:\n${missing.slice(0, 8).map(m => `• ${m.label}`).join('\n')}${missing.length > 8 ? '\n…' : ''}\n\nSubmit anyway?`
    : 'Send this period to your supervisor for review?';
  if (!confirm(msg)) return;
  try {
    await st.submit(p.key);
    fill.value = plain(st.fillFor(p.key));
    toast.show('Submitted for review');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
async function goTo(key: string) {
  await flushAll(); // the new instance reads st.student.coverValues on mount, before it could otherwise finish saving
  await router.push({ name: 'builder', params: { periodKey: key } });
}
</script>

<template>
  <section v-if="!period" class="card"><p>No periods yet. Check your internship dates under "My internship".</p></section>
  <section v-else>
    <div class="row card">
      <label class="inline">Period
        <select data-testid="builder-period" :value="periodKey" @change="goTo(($event.target as HTMLSelectElement).value)">
          <option v-for="p in st.periods" :key="p.key" :value="p.key">{{ p.label }} — {{ STATUS_TEXT[st.statusOf(p.key)] }}</option>
        </select>
      </label>
      <StatusBadge :status="fill?.status ?? 'draft'" />
      <span class="spacer" />
      <button type="button" class="primary" data-testid="submit-period" :disabled="locked" @click="submit">Submit for review</button>
    </div>
    <p v-if="changesComment" class="banner" data-testid="changes-banner">Your supervisor asked for changes: {{ changesComment }}</p>
    <p v-if="locked && fill" class="banner">This period is {{ STATUS_TEXT[fill.status].toLowerCase() }}, so it can't be edited.</p>
    <div class="builder-grid">
      <form class="card" @submit.prevent>
        <fieldset v-for="g in groups" :key="g.title">
          <legend>{{ g.title }}</legend>
          <div v-for="ph in g.items" :key="ph.id" class="field" data-testid="field" :data-label="ph.label">
            <label :for="`f-${ph.id}`">{{ labelFor(ph) }} <span v-if="fromNotepad(ph)" class="tag" data-testid="from-notepad">from notepad</span></label>
            <textarea v-if="multiline(ph)" :id="`f-${ph.id}`" rows="3" :value="valueOf(ph)" :disabled="!editable(ph)"
              @input="setValue(ph, ($event.target as HTMLTextAreaElement).value)" />
            <input v-else :id="`f-${ph.id}`" :value="valueOf(ph)" :disabled="!editable(ph)" @input="setValue(ph, ($event.target as HTMLInputElement).value)" />
            <button v-if="drift(ph)" type="button" class="link" data-testid="pull-again" @click="pullAgain(ph)">Notepad changed — pull again</button>
          </div>
        </fieldset>
      </form>
      <div class="preview" data-testid="preview">
        <TemplateOverlay v-if="st.template" :template="st.template" mode="fill" :values="previewValues" />
      </div>
    </div>
  </section>
</template>
