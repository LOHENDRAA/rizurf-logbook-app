<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useReview } from '../../stores/review';
import { formatDMY } from '../../core/dates';
import StatusBadge from '../../components/StatusBadge.vue';

const rv = useReview();
const router = useRouter();
const tab = ref<'queue' | 'all'>('queue');
onMounted(() => rv.load());
const rows = computed(() => (tab.value === 'queue' ? rv.queue : rv.rows));
const open = (studentId: string, periodKey: string) => router.push({ name: 'review-detail', params: { studentId, periodKey } });
</script>

<template>
  <section class="card">
    <div class="row">
      <h1>Review</h1>
      <span class="spacer" />
      <div class="seg">
        <button type="button" :aria-pressed="tab === 'queue'" @click="tab = 'queue'">Waiting ({{ rv.queue.length }})</button>
        <button type="button" :aria-pressed="tab === 'all'" @click="tab = 'all'">All periods</button>
      </div>
    </div>
    <p v-if="!rows.length" class="muted">{{ tab === 'queue' ? 'Nothing is waiting for review.' : 'No students have set up their internship yet.' }}</p>
    <table v-else class="list">
      <thead><tr><th>Student</th><th>University</th><th>Period</th><th>Status</th><th>Submitted</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="`${r.student.id}|${r.period.key}`" class="click" data-testid="queue-row" @click="open(r.student.id, r.period.key)">
          <td>{{ r.student.name }}</td>
          <td>{{ r.template.university }}</td>
          <td>{{ r.period.label }}</td>
          <td><StatusBadge :status="r.status" /></td>
          <td>{{ r.fill?.submittedAt ? formatDMY(r.fill.submittedAt.slice(0, 10)) : '—' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
