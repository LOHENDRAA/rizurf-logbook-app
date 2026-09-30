import { createRouter, createWebHashHistory } from 'vue-router';
import { useSession } from './stores/session';
import { useStudent } from './stores/student';
import { SERVER_MODE } from './data/api';

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
    { path: '/sign-in', name: 'sign-in', component: () => import('./views/SignIn.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async to => {
  const session = useSession();
  if (SERVER_MODE && !session.me) return to.name === 'sign-in' ? true : { name: 'sign-in' };
  if (to.name === 'sign-in') return '/';
  if (to.path.startsWith('/supervisor') && !session.isSupervisor) return '/';
  if (to.path.startsWith('/student')) {
    if (session.isSupervisor) return '/';
    const st = useStudent();
    if (st.loadedFor !== session.role) await st.load(session.role);
    const needsSetup = !st.student?.templateId || st.templateMissing || !st.student.startDate;
    if (needsSetup && to.name !== 'onboarding') return { name: 'onboarding' };
  }
  return true;
});
