<script setup lang="ts">
import { useToast } from '../stores/toast';
const toast = useToast();
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toast.items" :key="t.id" class="toast" :class="{ error: t.error }" @click="toast.dismiss(t.id)">{{ t.text }}</div>
  </div>
</template>
