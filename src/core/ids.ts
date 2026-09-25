let counter = 0;

/** Unique enough for a single-browser prototype. It avoids crypto.randomUUID, which is missing on plain-http LAN addresses. */
export function newId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
