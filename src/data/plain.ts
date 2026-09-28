import { toRaw } from 'vue';

/** Deep copy without Vue proxies (IndexedDB can't clone proxies). ArrayBuffers are kept as-is. */
export function plain<T>(v: T): T {
  const r = toRaw(v) as unknown;
  if (r === null || typeof r !== 'object' || r instanceof ArrayBuffer || ArrayBuffer.isView(r)) return r as T;
  if (Array.isArray(r)) return r.map(x => plain(x)) as T;
  const o: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(r as Record<string, unknown>)) if (val !== undefined) o[k] = plain(val);
  return o as T;
}
