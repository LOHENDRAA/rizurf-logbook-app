import { createRouter, createWebHashHistory } from 'vue-router';
import { useSession } from './stores/session';
import { useStudent } from './stores/student';
import { useJournal } from './stores/journal';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => (useSession().isSupervisor ? '/supervisor/templates' : '/student/notepad') },
    { path: '/supervisor/templates', component: () => import('./views/supervisor/TemplatesList.vue') },
    { path: '/supervisor/templates/new', component: () => import('./views/supervisor/TemplateEditor.vue') },
    { path: '/supervisor/templates/:id', component: () => import('./views/supervisor/TemplateEditor.vue') },
    { path: '/supervisor/review', component: () => import('./views/supervisor/ReviewQueue.vue') },
    { path: '/supervisor/review/:studentId/:periodKey', name: 'review-detail', component: () => import('./views/supervisor/ReviewDetail.vue') },
    { path: '/student/onboarding', name: 'onboarding', component: () => import('./views/student/Onboarding.vue') },
    { path: '/student/notepad', component: () => import('./views/student/Notepad.vue') },
    { path: '/student/builder/:periodKey?', name: 'builder', component: () => import('./views/student/Builder.vue') },
    { path: '/student/export', component: () => import('./views/student/Export.vue') },
    { path: '/journal', component: () => import('./views/Journal.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async to => {
  const session = useSession();
  if (to.path.startsWith('/supervisor') && !session.isSupervisor) return '/';
  const isJournal = to.path === '/journal';
  if (!isJournal && !to.path.startsWith('/student')) return true;
  if (session.isSupervisor && !isJournal) return '/';

  const journal = useJournal();
  const st = useStudent();
  if (!session.isSupervisor && st.loadedFor !== session.role) await st.load(session.role);
  // Only the journal screen and interns without a template need the journal, so a journal outage never locks the logbook.
  if (journal.owner !== session.role && (isJournal || !st.student?.templateId)) {
    try { await journal.load(session.role); } catch (e) { if (isJournal) throw e; }
  }
  if (session.isSupervisor) return true;
  // An intern without a logbook only has the journal (and Onboarding, to pick a university later).
  if (journal.journalOnly) return isJournal || to.name === 'onboarding' ? true : '/journal';
  if (isJournal) return '/';
  const needsSetup = !st.student?.templateId || st.templateMissing || !st.student.startDate;
  if (needsSetup && to.name !== 'onboarding') return { name: 'onboarding' };
  return true;
});
