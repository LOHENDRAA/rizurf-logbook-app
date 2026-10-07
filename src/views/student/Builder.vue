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
import { ask } from '../../lib/ask';
import { summarizeFields } from '../../lib/summarize';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { useSession } from '../../stores/session';
import { useToast } from '../../stores/toast';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import StatusBadge from '../../components/StatusBadge.vue';

const st = useStudent();
const journal = useJournal();
const session = useSession();
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
  // Only a draft fills itself. A sent-back week keeps what was submitted: journal changes since (private, maybe
  // personal) come in only through "Journal changed — pull again". Never from a journal that didn't load.
  if (f.status === 'draft' && journal.owner === session.role) {
    const r = autofill(phs.value, p, journal.entries, f.values, f.autofilled);
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
function fromJournal(ph: Placeholder) {
  const f = fill.value;
  return !!f && fromNotes(ph) && !!f.autofilled[ph.id] && (f.values[ph.id] ?? '') === f.autofilled[ph.id];
}
const fromNotes = (ph: Placeholder) => ph.binding === 'daily' || ph.binding === 'period';
function drift(ph: Placeholder) {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || locked.value || !fromNotes(ph) || isCoverField(ph)) return false;
  const s = sourceValue(ph, p, journal.entries);
  return s != null && s !== (f.autofilled[ph.id] ?? '');
}
async function pullAgain(ph: Placeholder) {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || !(await ask('Replace this field with the latest journal text?', 'Replace'))) return;
  const s = sourceValue(ph, p, journal.entries) ?? '';
  f.values[ph.id] = s;
  f.autofilled[ph.id] = s;
  fillSaver.call();
}
async function pullAll() {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || !(await ask('Refill every day and date field from your journal? Your edits to those fields will be replaced.', 'Refill'))) return;
  for (const ph of phs.value) {
    const s = sourceValue(ph, p, journal.entries);
    if (s == null) continue;
    f.values[ph.id] = s;
    f.autofilled[ph.id] = s;
  }
  fillSaver.call();
}
const summarizing = ref(false);
const periodFields = computed(() => phs.value.filter(ph => ph.binding === 'period' && !isCoverField(ph)));
async function summarizeWeek() {
  const f = fill.value;
  const p = period.value;
  if (!f || !p) return;
  if (!(await ask("Replace the weekly answers with an AI summary of this week's notes? You can edit it afterwards.", 'Summarize'))) return;
  summarizing.value = true;
  try {
    const fields = periodFields.value;
    const bullets = fields.map(ph => sourceValue(ph, p, journal.entries) ?? '');
    const summaries = await summarizeFields(fields.map((ph, i) => ({ label: ph.label, text: bullets[i] })));
    fields.forEach((ph, i) => {
      if (!summaries[i]) return;
      f.values[ph.id] = summaries[i];
      f.autofilled[ph.id] = bullets[i]; // counts as the intern's own text: autofill won't overwrite it
    });
    fillSaver.call();
    toast.show('Summary added. Edit it however you like.');
  } catch (e) {
    toast.show(errorText(e), true);
  } finally {
    summarizing.value = false;
  }
}
// Submitting opens a full-size preview first; the intern confirms from there.
const reviewDialog = ref<HTMLDialogElement>();
const missing = ref<Placeholder[]>([]);
async function openPreview() {
  if (!period.value || !fill.value) return;
  await flushAll();
  missing.value = emptyRequired(phs.value, previewValues.value);
  reviewDialog.value?.showModal();
}
async function submit() {
  const p = period.value;
  if (!p || !fill.value) return;
  try {
    await st.submit(p.key);
    fill.value = plain(st.fillFor(p.key));
    reviewDialog.value?.close();
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
      <button type="button" data-testid="pull-all" :disabled="locked" @click="pullAll">Pull from journal</button>
      <button v-if="periodFields.length" type="button" data-testid="summarize-week" :disabled="locked || summarizing" @click="summarizeWeek">{{ summarizing ? 'Summarizing…' : '✨ Summarize week' }}</button>
      <button type="button" class="primary" data-testid="submit-period" :disabled="locked" @click="openPreview">Preview &amp; submit</button>
    </div>
    <p v-if="changesComment" class="banner" data-testid="changes-banner">Your supervisor asked for changes: {{ changesComment }}</p>
    <p v-if="locked && fill" class="banner">This period is {{ STATUS_TEXT[fill.status].toLowerCase() }}, so it can't be edited.</p>
    <div class="builder-grid">
      <form class="card" @submit.prevent>
        <fieldset v-for="g in groups" :key="g.title">
          <legend>{{ g.title }}</legend>
          <div v-for="ph in g.items" :key="ph.id" class="field" data-testid="field" :data-label="ph.label">
            <label :for="`f-${ph.id}`">{{ labelFor(ph) }} <span v-if="fromJournal(ph)" class="tag" data-testid="from-notepad">from journal</span></label>
            <textarea v-if="multiline(ph)" :id="`f-${ph.id}`" rows="3" :value="valueOf(ph)" :disabled="!editable(ph)"
              @input="setValue(ph, ($event.target as HTMLTextAreaElement).value)" />
            <input v-else :id="`f-${ph.id}`" :value="valueOf(ph)" :disabled="!editable(ph)" @input="setValue(ph, ($event.target as HTMLInputElement).value)" />
            <button v-if="drift(ph)" type="button" class="link" data-testid="pull-again" @click="pullAgain(ph)">Journal changed — pull again</button>
          </div>
        </fieldset>
      </form>
      <div class="preview" data-testid="preview">
        <TemplateOverlay v-if="st.template" :template="st.template" mode="fill" :values="previewValues" />
      </div>
    </div>
    <dialog ref="reviewDialog" class="review-dialog" data-testid="submit-preview">
      <header class="row">
        <h2 style="margin: 0">Preview · {{ period.label }}</h2>
        <span class="spacer" />
        <button type="button" data-testid="preview-back" @click="reviewDialog?.close()">Back to editing</button>
        <button type="button" class="primary" data-testid="confirm-submit" @click="submit">Submit to supervisor</button>
      </header>
      <p v-if="missing.length" class="banner">{{ missing.length }} field(s) are still empty: {{ missing.slice(0, 8).map(m => m.label).join(', ') }}{{ missing.length > 8 ? '…' : '' }}</p>
      <div class="preview">
        <TemplateOverlay v-if="st.template" :template="st.template" mode="fill" :values="previewValues" />
      </div>
    </dialog>
  </section>
</template>
