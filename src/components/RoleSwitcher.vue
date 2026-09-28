<script setup lang="ts">
import { useRouter } from 'vue-router';
import { SUPERVISOR, useSession } from '../stores/session';
import { useStudent } from '../stores/student';

const session = useSession();
const student = useStudent();
const router = useRouter();

async function change(e: Event) {
  session.setRole((e.target as HTMLSelectElement).value);
  student.loadedFor = null; // force a fresh load: the other role may have changed data
  await router.push('/');
}
async function reset() {
  if (!confirm('Delete all templates, notes and reviews and start the demo again?')) return;
  await session.resetDemo();
  location.reload();
}
</script>

<template>
  <div class="role">
    <label class="inline">Viewing as
      <select data-testid="role-select" :value="session.role" @change="change">
        <option :value="SUPERVISOR">Supervisor</option>
        <option v-for="s in session.students" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </label>
    <button type="button" class="link" data-testid="reset-demo" @click="reset">Reset demo data</button>
  </div>
</template>
