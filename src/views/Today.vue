<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useStudent } from '../stores/student';
import { useSession } from '../stores/session';
import { journalWeeks, writtenThisWeek } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';
import { STATUS_TEXT } from '../core/workflow';
import EntryEditor from '../components/EntryEditor.vue';
import Organize from '../components/Organize.vue';
import ReviewPanel from '../components/ReviewPanel.vue';

const journal = useJournal();
const st = useStudent();
const session = useSession();
const today = todayISO();
const PROMPTS = ['What did you work on?', 'What did you learn?', 'What surprised you?', 'What was difficult?'];
const editor = ref<InstanceType<typeof EntryEditor>>();
const prompts = ref(false);

const intern = computed(() => !session.isSupervisor);
const flush = () => editor.value?.saved() ?? Promise.resolve(true);
const logbook = computed(() => !session.isSupervisor && !journal.journalOnly && !!st.student?.templateId);
const period = computed(() => (logbook.value ? st.periods.find(p => today >= p.start && today <= p.end) : undefined));
const caption = computed(() => {
  if (session.isSupervisor) return '';
  if (journal.journalOnly) return `Week ${journalWeeks(journal.startDate, Object.keys(journal.entries), today).length} of your journal`;
  const uni = st.template?.university ?? '';
  return period.value ? `Week ${period.value.index} · ${uni}` : uni;
});
const range = computed(() => (logbook.value && st.student?.startDate && st.student.endDate ? { start: st.student.startDate, end: st.student.endDate } : undefined));
const week = computed(() => writtenThisWeek(journal.entries, today, range.value));
const title = parseISO(today).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
</script>

<template>
  <div class="today">
    <div>
      <header class="today-head">
        <h1 data-testid="today-date">{{ title }}</h1>
        <p v-if="caption" class="muted" data-testid="today-caption">{{ caption }}</p>
      </header>
      <EntryEditor ref="editor" :date="today" placeholder="What happened today? Only you can read this; it saves automatically.">
        <template #title><h2>What happened today?</h2></template>
      </EntryEditor>
      <p>
        <button type="button" class="link" data-testid="prompt-toggle" :aria-expanded="prompts" @click="prompts = !prompts">Need a prompt?</button>
      </p>
      <p v-if="prompts" class="prompts">
        <button v-for="p in PROMPTS" :key="p" type="button" class="link" data-testid="prompt" @click="editor?.append(p)">{{ p }}</button>
      </p>
      <Organize v-if="intern" :date="today" :flush="flush" />
    </div>
    <aside class="today-side">
      <ReviewPanel v-if="intern" :date="today" />
      <section class="card click-card">
        <h2><RouterLink to="/journal" class="stretch">This week</RouterLink></h2>
        <p data-testid="week-count">Written on {{ week.written }} of {{ week.of }} day{{ week.of === 1 ? '' : 's' }}</p>
      </section>
      <section v-if="logbook" class="card click-card" data-testid="today-logbook">
        <template v-if="period">
          <h2>Logbook · Week {{ period.index }}</h2>
          <p><span class="badge" :class="st.statusOf(period.key)">{{ STATUS_TEXT[st.statusOf(period.key)] }}</span></p>
          <RouterLink :to="{ name: 'builder', params: { periodKey: period.key } }" class="stretch" data-testid="today-open-logbook">Open logbook</RouterLink>
        </template>
        <p v-else class="muted">The placement isn't in an active week right now.</p>
      </section>
    </aside>
  </div>
</template>
