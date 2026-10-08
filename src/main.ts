import './lib/pdfjs-browser';
import './styles.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { repo, setRepository } from './data/repository';
import { ensureSeed } from './data/seed';
import { loadDemoData } from './data/demo';
import { SERVER_MODE } from './data/api';
import { signInThroughGateway } from './data/signin';
import { HttpRepository } from './data/http';
import { SUPERVISOR, useSession } from './stores/session';
import { useToast } from './stores/toast';
import { errorText } from './lib/errors';

async function start() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  const session = useSession(pinia);
  const toast = useToast(pinia);

  // Any error nobody caught (a failed load included) is shown, so a failure never looks like an empty page.
  app.config.errorHandler = e => toast.show(errorText(e), true);
  window.addEventListener('unhandledrejection', e => toast.show(errorText(e.reason), true));
  // Loads in route guards (an intern's logbook) fail inside the router, which only logs them.
  router.onError(e => toast.show(errorText(e), true));

  if (SERVER_MODE) {
    const me = await signInThroughGateway();
    if (!me) return; // on the way to the gateway
    setRepository(new HttpRepository(me));
    session.signedIn(me);
    await session.loadStudents();
  } else {
    await ensureSeed(repo());
    // The shared single-file preview opens with demo data instead of an empty logbook.
    if (import.meta.env.MODE === 'single' && !(await repo().listTemplates()).length) await loadDemoData(repo());
    await session.loadStudents();
    // The preview opens as the demo intern with the most to see, unless this tab already picked someone.
    if (import.meta.env.MODE === 'single' && !sessionStorage.getItem('il.role') && session.students.some(s => s.id === 'student-daniel')) session.setRole('student-daniel');
    if (!session.isSupervisor && !session.students.some(s => s.id === session.role)) session.setRole(SUPERVISOR);
  }
  app.use(router);
  app.mount('#app');
}

start().catch(e => {
  document.body.textContent = `The app could not start: ${e instanceof Error ? e.message : String(e)}`;
});
