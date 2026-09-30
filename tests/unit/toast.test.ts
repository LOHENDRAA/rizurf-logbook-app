import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useToast } from '../../src/stores/toast';

beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('toasts', () => {
  it('errors stay until dismissed, so a failed load is never mistaken for an empty page', () => {
    const toast = useToast();
    toast.show('Saved');
    toast.show("Can't reach the logbook server.", true);

    vi.advanceTimersByTime(60_000);

    expect(toast.items.map(t => t.text)).toEqual(["Can't reach the logbook server."]);
    toast.dismiss(toast.items[0].id);
    expect(toast.items).toEqual([]);
  });
});
