<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useSession } from './stores/session';
import { useStudent } from './stores/student';
import { useReview } from './stores/review';
import RoleSwitcher from './components/RoleSwitcher.vue';
import ToastHost from './components/ToastHost.vue';
import NavIcon from './components/NavIcon.vue';

const session = useSession();
const student = useStudent();
const route = useRoute();
// The Review link's count: weeks waiting for this supervisor (roadmap step 6), the same number as on the gateway's icon.
const review = useReview();
watch(() => session.isSupervisor, s => { if (s) review.load().catch(() => { /* the Review page shows the error */ }); }, { immediate: true });
const counts = computed((): Record<string, number> => (session.isSupervisor ? { '/supervisor/review': review.queue.length } : {}));
// Which role's data is actually loaded, not just selected: `session.role` flips the
// instant the dropdown changes, before the store has reloaded, so keying on it alone
// would remount with stale data. `student.loadedFor` only changes once a load finishes.
const dataKey = computed(() => (session.isSupervisor ? 'supervisor' : (student.loadedFor ?? 'loading')));
const links = computed(() => session.isSupervisor
  ? [{ to: '/supervisor/templates', label: 'Templates', icon: 'templates' }, { to: '/supervisor/review', label: 'Review', icon: 'review' }]
  : [
      { to: '/student/notepad', label: 'Notepad', icon: 'notepad' },
      { to: '/student/builder', label: 'Logbook builder', icon: 'builder' },
      { to: '/student/export', label: 'Export', icon: 'export' },
      { to: '/student/onboarding', label: 'My internship', icon: 'internship' },
    ]);
const page = computed(() => links.value.find(l => route.path.startsWith(l.to))?.label ?? '');

const drawer = ref(false);
watch(() => route.fullPath, () => { drawer.value = false; });

const dark = ref(document.documentElement.dataset.theme === 'dark');
function toggleTheme() {
  dark.value = !dark.value;
  if (dark.value) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try {
    if (dark.value) localStorage.setItem('rizurf-theme', 'dark');
    else localStorage.removeItem('rizurf-theme');
  } catch { /* private window: theme just isn't remembered */ }
}
</script>

<template>
  <div class="top-line" />
  <div v-if="drawer" class="backdrop" @click="drawer = false" />
  <aside class="sidebar" :class="{ open: drawer }" aria-label="Main" @keydown.esc="drawer = false">
    <div class="sidebar-brand">
      <img class="brand-icon" src="https://web-omega-two-47.vercel.app/logo-icon.png" alt="Rizurf" />
      <img class="brand-full" src="https://web-omega-two-47.vercel.app/logo.png" alt="Rizurf Realty" />
    </div>
    <nav>
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="nav-item" :title="l.label">
        <NavIcon :name="l.icon" /><span class="nav-label">{{ l.label }}</span>
        <span v-if="counts[l.to]" class="nav-count" data-testid="nav-count" :aria-label="`${counts[l.to]} waiting`">{{ counts[l.to] > 99 ? '99+' : counts[l.to] }}</span>
      </RouterLink>
    </nav>
  </aside>
  <div class="main">
    <header class="topbar">
      <button type="button" class="menu-btn icon-btn" aria-label="Open menu" @click="drawer = true"><NavIcon name="menu" /></button>
      <p class="breadcrumb">Intern Logbook / <strong>{{ page }}</strong></p>
      <span class="spacer" />
      <RoleSwitcher />
      <button type="button" class="icon-btn" :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
        <NavIcon :name="dark ? 'sun' : 'moon'" />
      </button>
    </header>
    <main>
      <RouterView v-slot="{ Component, route: r }">
        <component :is="Component" :key="`${dataKey}:${r.fullPath}`" />
      </RouterView>
    </main>
  </div>
  <ToastHost />
</template>
