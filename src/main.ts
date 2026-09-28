import './lib/pdfjs-browser';
import './styles.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { repo } from './data/repository';
import { ensureSeed } from './data/seed';
import { SUPERVISOR, useSession } from './stores/session';

async function start() {
  await ensureSeed(repo());
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  const session = useSession(pinia);
  await session.loadStudents();
  if (!session.isSupervisor && !session.students.some(s => s.id === session.role)) session.setRole(SUPERVISOR);
  app.use(router);
  app.mount('#app');
}

start().catch(e => {
  document.body.textContent = `The app could not start: ${e instanceof Error ? e.message : String(e)}`;
});
