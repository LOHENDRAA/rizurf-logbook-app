<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useReview } from '../../stores/review';
import { useToast } from '../../stores/toast';
import { latestAction } from '../../core/workflow';
import { resolveValues } from '../../core/autofill';
import { errorText } from '../../lib/errors';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import StatusBadge from '../../components/StatusBadge.vue';

const route = useRoute();
const rv = useReview();
const toast = useToast();
const sid = route.params.studentId as string;
const key = route.params.periodKey as string;
const signature = ref('');
const comment = ref('');

onMounted(() => rv.load());

const row = computed(() => rv.row(sid, key));
const history = computed(() => rv.actions.filter(a => a.studentId === sid && a.periodKey === key).sort((a, b) => a.at.localeCompare(b.at)));
const approval = computed(() => latestAction(rv.actions, sid, key, 'approve'));
const values = computed(() => (row.value ? resolveValues(row.value.template.placeholders, row.value.student.coverValues, row.value.fill?.values ?? {}, approval.value) : {}));
const ACTION_TEXT = { submit: 'Submitted', approve: 'Approved', request_changes: 'Changes requested' } as const;

async function approve() {
  try { await rv.approve(sid, key, signature.value); toast.show('Approved and signed'); } catch (e) { toast.show(errorText(e), true); }
}
async function requestChanges() {
  try { await rv.requestChanges(sid, key, comment.value); comment.value = ''; toast.show('Sent back to the student'); } catch (e) { toast.show(errorText(e), true); }
}
</script>

<template>
  <section v-if="!row" class="card"><p class="muted">Loading…</p></section>
  <section v-else>
    <div class="row card">
      <RouterLink to="/supervisor/review">← Review</RouterLink>
      <h1 style="margin: 0">{{ row.student.name }} · {{ row.period.label }}</h1>
      <StatusBadge :status="row.status" />
    </div>
    <div class="review-grid">
      <div class="preview" data-testid="preview">
        <TemplateOverlay :template="row.template" mode="fill" :values="values" />
      </div>
      <aside class="side">
        <div v-if="row.status === 'submitted'" class="card">
          <h2>Approve</h2>
          <label>Type your full name to sign <input v-model="signature" data-testid="approve-name" /></label>
          <button type="button" class="primary" data-testid="approve-btn" @click="approve">Approve</button>
          <h2 style="margin-top: 16px">Request changes</h2>
          <label>What needs to change? <textarea v-model="comment" data-testid="changes-comment" rows="3" /></label>
          <button type="button" data-testid="changes-btn" @click="requestChanges">Send back</button>
        </div>
        <div class="card" data-testid="history">
          <h2>History</h2>
          <ul class="plain-list">
            <li v-for="a in history" :key="a.id">
              {{ ACTION_TEXT[a.action] }} by {{ a.signature ?? a.by }} · {{ new Date(a.at).toLocaleString() }}
              <div v-if="a.comment" class="muted">“{{ a.comment }}”</div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>
