import './lib/pdfjs-browser';
import './styles.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { repo, setRepository } from './data/repository';
import { ensureSeed } from './data/seed';
import { SERVER_MODE, currentUser } from './data/api';
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

  if (SERVER_MODE) {
    const me = await currentUser();
    if (me) {
      setRepository(new HttpRepository(me));
      session.signedIn(me);
      await session.loadStudents();
    }
    // Nobody signed in: the router sends every page to the sign-in form.
  } else {
    await ensureSeed(repo());
    await session.loadStudents();
    if (!session.isSupervisor && !session.students.some(s => s.id === session.role)) session.setRole(SUPERVISOR);
  }
  app.use(router);
  app.mount('#app');
}

start().catch(e => {
  document.body.textContent = `The app could not start: ${e instanceof Error ? e.message : String(e)}`;
});
