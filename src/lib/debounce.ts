/** Debounced async call. Runs are chained, so saves never overlap. flush() runs a pending call now. */
export function debounce(fn: () => Promise<void> | void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  const run = () => {
    timer = null;
    running = running.then(() => fn()).catch(() => undefined);
    return running;
  };
  return {
    call() { if (timer) clearTimeout(timer); timer = setTimeout(run, ms); },
    flush(): Promise<void> { if (timer) { clearTimeout(timer); return run(); } return running; },
    cancel() { if (timer) clearTimeout(timer); timer = null; },
  };
}
