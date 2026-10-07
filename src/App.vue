<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useSession } from './stores/session';
import { useStudent } from './stores/student';
import { useReview } from './stores/review';
import { useJournal } from './stores/journal';
import RoleSwitcher from './components/RoleSwitcher.vue';
import ToastHost from './components/ToastHost.vue';
import NavIcon from './components/NavIcon.vue';
import logoDark from './assets/logo-dark.webp';

const session = useSession();
const student = useStudent();
const journal = useJournal();
const route = useRoute();
// The Review link's count: weeks waiting for this supervisor (roadmap step 6), the same number as on the gateway's icon.
const review = useReview();
watch(() => session.isSupervisor, s => { if (s) review.load().catch(() => { /* the Review page shows the error */ }); }, { immediate: true });
const counts = computed((): Record<string, number> => (session.isSupervisor ? { '/supervisor/review': review.queue.length } : {}));
// Which role's data is actually loaded, not just selected: `session.role` flips the
// instant the dropdown changes, before the store has reloaded, so keying on it alone
// would remount with stale data. `student.loadedFor` only changes once a load finishes.
const dataKey = computed(() => (session.isSupervisor ? `supervisor:${journal.owner}` : `${student.loadedFor ?? 'loading'}:${journal.owner}`));
const links = computed(() => session.isSupervisor
  ? [
      { to: '/supervisor/templates', label: 'Templates', icon: 'templates' },
      { to: '/supervisor/review', label: 'Review', icon: 'review' },
      { to: '/today', label: 'Today', icon: 'notepad' },
      { to: '/journal', label: 'Journal', icon: 'journal' },
    ]
  : journal.journalOnly
    ? [
        { to: '/student/overview', label: 'Overview', icon: 'overview' },
        { to: '/today', label: 'Today', icon: 'notepad' },
        { to: '/journal', label: 'Journal', icon: 'journal' },
        { to: '/student/onboarding', label: 'My internship', icon: 'internship' },
      ]
    : [
        { to: '/student/overview', label: 'Overview', icon: 'overview' },
        { to: '/today', label: 'Today', icon: 'notepad' },
        { to: '/journal', label: 'Journal', icon: 'journal' },
        { to: '/student/builder', label: 'Logbook builder', icon: 'builder' },
        { to: '/student/export', label: 'Export', icon: 'export' },
        { to: '/student/onboarding', label: 'My internship', icon: 'internship' },
      ]);
const page = computed(() => links.value.find(l => route.path.startsWith(l.to))?.label ?? '');
</script>

<template>
  <div class="top-line" />
  <aside class="sidebar" aria-label="Main">
    <div class="sidebar-brand">
      <img class="brand-icon" src="https://web-omega-two-47.vercel.app/logo-icon.png" alt="Rizurf" />
      <img class="brand-full brand-light" src="https://web-omega-two-47.vercel.app/logo.png" alt="Rizurf Realty" />
      <img class="brand-full brand-dark" :src="logoDark" alt="Rizurf Realty" />
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
      <p class="breadcrumb">Intern Logbook / <strong>{{ page }}</strong></p>
      <span class="spacer" />
      <RoleSwitcher />
    </header>
    <main>
      <RouterView v-slot="{ Component, route: r }">
        <component :is="Component" :key="`${dataKey}:${r.fullPath}`" />
      </RouterView>
      <!-- The first page couldn't open because the journal didn't load: say so instead of showing nothing. -->
      <p v-if="journal.loadFailed && !route.matched.length" class="banner" data-testid="load-error">We couldn't load your journal. Reload the page to try again.</p>
    </main>
  </div>
  <ToastHost />
</template>
