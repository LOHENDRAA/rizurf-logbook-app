import { createRouter, createWebHashHistory } from 'vue-router';
import { useSession } from './stores/session';
import { useStudent } from './stores/student';
import { useJournal } from './stores/journal';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => (useSession().isSupervisor ? '/supervisor/templates' : '/student/overview') },
    { path: '/student/overview', name: 'overview', component: () => import('./views/student/Overview.vue') },
    { path: '/supervisor/templates', component: () => import('./views/supervisor/TemplatesList.vue') },
    { path: '/supervisor/templates/new', component: () => import('./views/supervisor/TemplateEditor.vue') },
    { path: '/supervisor/templates/:id', component: () => import('./views/supervisor/TemplateEditor.vue') },
    { path: '/supervisor/review', component: () => import('./views/supervisor/ReviewQueue.vue') },
    { path: '/supervisor/review/:studentId/:periodKey', name: 'review-detail', component: () => import('./views/supervisor/ReviewDetail.vue') },
    { path: '/student/onboarding', name: 'onboarding', component: () => import('./views/student/Onboarding.vue') },
    { path: '/student/notepad', redirect: '/today' },
    { path: '/student/builder/:periodKey?', name: 'builder', component: () => import('./views/student/Builder.vue') },
    { path: '/student/export', component: () => import('./views/student/Export.vue') },
    { path: '/today', name: 'today', component: () => import('./views/Today.vue') },
    { path: '/journal', name: 'journal', component: () => import('./views/Journal.vue') },
    { path: '/journal/:date', name: 'journal-entry', component: () => import('./views/JournalEntry.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async to => {
  const session = useSession();
  if (to.path.startsWith('/supervisor') && !session.isSupervisor) return '/';
  const writing = to.path === '/today' || to.path.startsWith('/journal');
  if (!writing && !to.path.startsWith('/student')) return true;
  if (session.isSupervisor && !writing) return '/';

  const journal = useJournal();
  const st = useStudent();
  if (!session.isSupervisor && st.loadedFor !== session.role) await st.load(session.role);
  const needsSetup = !session.isSupervisor && (!st.student?.templateId || st.templateMissing || !st.student.startDate);
  // Entries feed Today, Journal, the Overview count and the logbook: a failed load stops those pages
  // (the logbook's autofill would otherwise clear day boxes). My internship and Export work without them,
  // and an intern who isn't set up yet is sent to My internship rather than stopped.
  if (journal.owner !== session.role) {
    try {
      await journal.load(session.role);
    } catch (e) {
      if (to.name === 'onboarding' || to.path === '/student/export') { /* works without the journal */ }
      else if (needsSetup && !writing && st.student?.mode !== 'journal') return { name: 'onboarding' };
      else throw e;
    }
  }
  if (session.isSupervisor) return true;
  // An intern without a logbook has Today, Journal, Overview and My internship.
  if (journal.journalOnly) return writing || to.name === 'onboarding' || to.name === 'overview' ? true : '/student/overview';
  if (needsSetup && !writing && to.name !== 'onboarding') return { name: 'onboarding' };
  return true;
});
