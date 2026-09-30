<script setup lang="ts">
import { ref } from 'vue';
import { useSession } from '../stores/session';
import { errorText } from '../lib/errors';

const session = useSession();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await session.signIn(email.value.trim(), password.value);
    location.reload(); // start again as the signed-in person
  } catch (e) {
    error.value = errorText(e);
    busy.value = false;
  }
}
</script>

<template>
  <section class="card" style="max-width: 420px">
    <h1>Sign in</h1>
    <p class="muted">Temporary sign-in for testing against the server. The Rizurf gateway replaces it.</p>
    <form @submit.prevent="submit">
      <label>Email <input v-model="email" type="email" autocomplete="username" required data-testid="signin-email" /></label>
      <label>Password <input v-model="password" type="password" autocomplete="current-password" required data-testid="signin-password" /></label>
      <p v-if="error" class="banner" role="alert">{{ error }}</p>
      <button type="submit" class="primary" :disabled="busy" data-testid="signin-submit">Sign in</button>
    </form>
  </section>
</template>
