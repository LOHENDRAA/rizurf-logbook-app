<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { addDays, eachDay, isWeekend, mondayOf, parseISO, todayISO } from '../../core/dates';
import { internshipProgress, needsAttention } from '../../core/overview';
import { journalWeeks } from '../../core/journal';

const st = useStudent();
const journal = useJournal();
const router = useRouter();
const today = todayISO();
const isJournal = computed(() => journal.mode === 'journal');
const s = computed(() => st.student);

const progress = computed(() => (!isJournal.value && s.value?.startDate && s.value.endDate ? internshipProgress(s.value.startDate, s.value.endDate, today) : null));
const caption = computed(() => {
  if (isJournal.value) return `WEEK ${journalWeeks(journal.startDate, Object.keys(journal.entries), today).length} OF YOUR JOURNAL`;
  const p = progress.value;
  if (!p) return '';
  return p.state === 'before' ? `STARTS IN ${p.daysToStart} DAY${p.daysToStart === 1 ? '' : 'S'}` : p.state === 'after' ? 'FINISHED' : `WEEK ${p.week} OF ${p.of}`;
});
const position = computed(() => (isJournal.value ? journal.position : s.value?.position) || '');
const university = computed(() => (isJournal.value ? journal.university : st.template?.university) || '');
const programme = computed(() => (isJournal.value ? journal.programme : s.value?.programme) || '');
const title = computed(() => position.value || (isJournal.value ? 'Intern' : university.value));
const long = (d: string) => parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// This week's writing.
const week = eachDay(mondayOf(today), addDays(mondayOf(today), 6));
const active = computed(() => !!progress.value && progress.value.state === 'during');
const countable = computed(() => week.filter(d => !isWeekend(d) && d <= today && d >= (s.value?.startDate ?? '') && d <= (s.value?.endDate ?? '')));
const logged = computed(() => countable.value.filter(d => st.notes[d]?.trim()).length);
const written = computed(() => week.filter(d => journal.entries[d]?.trim()).length);

const attention = computed(() => (isJournal.value ? [] : needsAttention(st.periods, st.statusOf, today)));
const supervisors = computed(() => s.value?.supervisors);
const open = () => router.push(isJournal.value ? '/journal' : '/student/notepad');
</script>

<template>
  <section class="card ov-head">
    <div class="ov-head-row">
      <div>
        <p class="caption" data-testid="ov-caption">{{ caption }}</p>
        <h1 data-testid="ov-title">{{ title }}</h1>
      </div>
      <p v-if="!isJournal && s?.startDate && s.endDate" class="mono">{{ long(s.startDate) }} → {{ long(s.endDate) }}</p>
    </div>
    <div v-if="progress" class="bar" data-testid="ov-progress" role="progressbar" :aria-valuenow="progress.percent" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${progress.percent}%` }" />
    </div>
  </section>

  <section class="card">
    <p class="caption">PLACEMENT</p>
    <div class="ov-boxes">
      <div class="ov-box" data-testid="ov-box"><p class="caption">UNIVERSITY</p><strong>{{ university || '—' }}</strong><span class="muted">{{ programme }}</span></div>
      <div class="ov-box" data-testid="ov-box"><p class="caption">COMPANY</p><strong>{{ s?.company || '—' }}</strong><span class="muted">{{ position }}</span></div>
      <div class="ov-box" data-testid="ov-box"><p class="caption">YOUR SUPERVISOR</p>
        <template v-if="supervisors && !supervisors.length"><span class="muted">No supervisor at your company yet.</span></template>
        <template v-for="(p, i) in supervisors ?? [{ name: 'Supervisor', email: '' }]" v-else :key="i"><strong>{{ p.name }}</strong><span class="muted">{{ p.email }}</span></template>
      </div>
    </div>
  </section>

  <div class="ov-bottom" :class="{ single: isJournal }">
    <section class="card">
      <h2>{{ isJournal ? 'Journal' : 'Notepad' }}</h2>
      <p v-if="isJournal">You've written on {{ written }} day{{ written === 1 ? '' : 's' }} this week.</p>
      <p v-else-if="active">You've logged {{ logged }} of {{ countable.length }} weekday{{ countable.length === 1 ? '' : 's' }} this week.</p>
      <p v-else>The placement isn't in an active week right now.</p>
      <button type="button" class="primary" data-testid="ov-open" @click="open">{{ isJournal ? "Open this week's journal" : "Open this week's notepad" }}</button>
    </section>
    <section v-if="!isJournal" class="card">
      <h2>Needs your attention</h2>
      <p v-if="!attention.length" class="muted">You're all caught up.</p>
      <RouterLink v-for="a in attention" :key="a.key" :to="{ name: 'builder', params: { periodKey: a.key } }" class="ov-attention" data-testid="ov-attention">{{ a.label }}</RouterLink>
    </section>
  </div>
</template>
