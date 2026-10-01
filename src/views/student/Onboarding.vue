<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';
import { parseISO } from '../../core/dates';
import type { InternMode } from '../../core/model';

const st = useStudent();
const journal = useJournal();
const templates = useTemplates();
const toast = useToast();
const router = useRouter();
onMounted(() => templates.load());

const s = computed(() => st.student);
const current = computed(() => journal.mode);
const logbookReady = computed(() => !!s.value?.templateId && !st.templateMissing && !!s.value.startDate);
// A new intern starts on Logbook; the choice can be changed before saving and switched any time after.
const choice = ref<InternMode>(current.value ?? 'logbook');
const editing = ref(!current.value || (current.value === 'logbook' && !logbookReady.value));
const busy = ref(false);
const form = ref({
  templateId: st.templateMissing ? '' : (s.value?.templateId ?? ''),
  start: s.value?.startDate ?? '',
  end: s.value?.endDate ?? '',
  position: (current.value === 'journal' ? journal.position : s.value?.position) ?? '',
  programme: (current.value === 'journal' ? journal.programme : s.value?.programme) ?? '',
  university: journal.university ?? '',
});

async function switchTo(m: InternMode) {
  if (m === current.value) { editing.value = false; return; }
  const ready = m === 'logbook' ? logbookReady.value : !!journal.startDate;
  if (!ready) {
    // First time in this mode: ask for what it needs, pre-filled from the other one.
    if (m === 'journal') form.value = { ...form.value, start: journal.startDate ?? s.value?.startDate ?? '', university: journal.university ?? st.template?.university ?? '' };
    editing.value = true;
    return;
  }
  busy.value = true;
  try {
    await st.setMode(m);
    toast.show(m === 'journal' ? 'Switched to your journal' : 'Switched to your logbook');
    await router.push('/student/overview');
  } catch (e) {
    toast.show(errorText(e), true);
    choice.value = current.value ?? 'logbook';
  } finally { busy.value = false; }
}
watch(choice, m => { if (current.value) void switchTo(m); });

async function save() {
  const f = form.value;
  try {
    if (choice.value === 'journal') {
      if (!f.start) { toast.show('Pick the day your internship started.', true); return; }
      await journal.start(s.value!.id, f.start, { university: f.university, programme: f.programme, position: f.position });
      if (current.value !== 'journal') await st.setMode('journal');
      toast.show('Saved');
      editing.value = false;
      await router.push('/journal');
      return;
    }
    if (!f.templateId || !f.start || !f.end) { toast.show('Pick your university and both dates.', true); return; }
    const first = !logbookReady.value;
    await st.setup(f.templateId, f.start, f.end, { position: f.position, programme: f.programme });
    if (current.value !== 'logbook') await st.setMode('logbook');
    toast.show('Saved');
    editing.value = false;
    if (first) await router.push('/student/notepad');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}

const long = (d?: string | null) => (d ? parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const dash = (v?: string | null) => v || '—';
const tz = computed(() => s.value?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
const supervisors = computed(() => s.value?.supervisors);
const lockedSetup = computed(() => !st.canChangeSetup && !st.templateMissing);
</script>

<template>
  <section class="card mode-switch" aria-label="Logbook or journal">
    <h1>My internship</h1>
    <div class="segmented" role="radiogroup">
      <label><input v-model="choice" type="radio" value="logbook" data-testid="mode-logbook" :disabled="busy" />
        <span><strong>Logbook</strong> Fill in my university's logbook</span></label>
      <label><input v-model="choice" type="radio" value="journal" data-testid="mode-journal" :disabled="busy" />
        <span><strong>Journal</strong> Private notes, no logbook</span></label>
    </div>
    <p v-if="current" class="muted">You can switch any time; nothing you've written is deleted.</p>
  </section>

  <section v-if="editing" class="card" style="max-width: 560px">
    <p v-if="st.templateMissing && choice === 'logbook'" class="banner">Your university's template was removed. Pick another one to carry on.</p>
    <template v-if="choice === 'logbook'">
      <p v-if="!templates.list.length" class="banner">No university templates yet. Ask your supervisor to add one.</p>
      <label>University
        <select v-model="form.templateId" data-testid="onb-university" :disabled="lockedSetup">
          <option value="" disabled>Choose…</option>
          <option v-for="t in templates.list" :key="t.id" :value="t.id">{{ t.university }}</option>
        </select>
      </label>
      <label>Start date <input v-model="form.start" data-testid="onb-start" type="date" :disabled="lockedSetup" /></label>
      <label>End date <input v-model="form.end" data-testid="onb-end" type="date" :disabled="lockedSetup" /></label>
      <p v-if="lockedSetup" class="muted">University and dates can't be changed after you've submitted a period.</p>
    </template>
    <template v-else>
      <label>University <input v-model="form.university" data-testid="onb-uni-text" maxlength="120" /></label>
      <label>Internship started on <input v-model="form.start" data-testid="onb-start" type="date" /></label>
    </template>
    <label>Programme <input v-model="form.programme" data-testid="onb-programme" maxlength="120" placeholder="e.g. BSc Computer Science" /></label>
    <label>Position <input v-model="form.position" data-testid="onb-position" maxlength="120" placeholder="e.g. Backend Intern" /></label>
    <div class="row">
      <button type="button" class="primary" data-testid="onb-save" @click="save">Save</button>
      <button v-if="current" type="button" @click="editing = false; choice = current">Cancel</button>
    </div>
  </section>

  <div v-else class="info-grid">
    <section class="card" data-testid="info-card">
      <h2>Placement</h2>
      <dl class="facts">
        <dt>Company</dt><dd>{{ dash(s?.company) }}</dd>
        <dt>Position</dt><dd>{{ dash(current === 'journal' ? journal.position : s?.position) }}</dd>
        <dt>Period</dt><dd>{{ current === 'journal' ? `Started ${long(journal.startDate)}` : `${long(s?.startDate)} – ${long(s?.endDate)}` }}</dd>
        <dt>Time zone</dt><dd>{{ tz }}</dd>
      </dl>
      <h2>University</h2>
      <dl class="facts">
        <dt>University</dt><dd>{{ dash(current === 'journal' ? journal.university : st.template?.university) }}</dd>
        <dt>Programme</dt><dd>{{ dash(current === 'journal' ? journal.programme : s?.programme) }}</dd>
      </dl>
      <button type="button" data-testid="internship-edit" @click="editing = true">Edit</button>
    </section>
    <div class="info-side">
      <section class="card" data-testid="info-card">
        <h2>Student</h2>
        <dl class="facts"><dt>Name</dt><dd>{{ s?.name }}</dd><dt>Email</dt><dd>{{ dash(s?.email) }}</dd></dl>
      </section>
      <section class="card" data-testid="info-card">
        <h2>Your supervisor</h2>
        <p v-if="supervisors && !supervisors.length" class="muted">No supervisor at your company yet.</p>
        <dl v-for="(p, i) in supervisors ?? [{ name: 'Supervisor', email: '' }]" :key="i" class="facts">
          <dt>Name</dt><dd>{{ p.name }}</dd>
          <dt>Email</dt><dd>{{ dash(p.email) }}</dd>
          <dt>Company</dt><dd>{{ dash(s?.company) }}</dd>
        </dl>
      </section>
    </div>
  </div>
</template>
