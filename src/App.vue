<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useSession } from './stores/session';
import RoleSwitcher from './components/RoleSwitcher.vue';
import ToastHost from './components/ToastHost.vue';

const session = useSession();
const links = computed(() => session.isSupervisor
  ? [{ to: '/supervisor/templates', label: 'Templates' }, { to: '/supervisor/review', label: 'Review' }]
  : [{ to: '/student/notepad', label: 'Notepad' }, { to: '/student/builder', label: 'Logbook builder' }, { to: '/student/export', label: 'Export' }, { to: '/student/onboarding', label: 'My internship' }]);
</script>

<template>
  <header class="topbar">
    <strong class="brand">Intern Logbook</strong>
    <nav><RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink></nav>
    <RoleSwitcher />
  </header>
  <main>
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.fullPath" />
    </RouterView>
  </main>
  <ToastHost />
</template>
