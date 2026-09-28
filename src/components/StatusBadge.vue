<script setup lang="ts">
import type { PeriodStatus } from '../core/model';
import { STATUS_TEXT } from '../core/workflow';
defineProps<{ status: PeriodStatus }>();
</script>

<template>
  <span class="badge" :class="status" data-testid="status-badge">{{ STATUS_TEXT[status] }}</span>
</template>
