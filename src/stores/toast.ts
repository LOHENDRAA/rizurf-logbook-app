import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToast = defineStore('toast', () => {
  const items = ref<{ id: number; text: string; error: boolean }[]>([]);
  let n = 0;
  function dismiss(id: number) { items.value = items.value.filter(i => i.id !== id); }
  function show(text: string, error = false) {
    const id = ++n;
    items.value.push({ id, text, error });
    // Errors stay until clicked away, so a failed load is never mistaken for an empty page.
    if (!error) setTimeout(() => dismiss(id), 3000);
  }
  return { items, show, dismiss };
});
