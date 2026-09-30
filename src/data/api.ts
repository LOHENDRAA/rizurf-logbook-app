/** Thin client for appv3's /api/v1: cookie session, CSRF handshake, ETags and the Rizurf error envelope. */

const raw = import.meta.env.VITE_API_URL as string | undefined;
/** On when the build names an API; '/' means the same origin (the dev proxy). */
export const SERVER_MODE = !!raw;
export const API_URL = (raw ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface Me { id: string; name: string; role: 'student' | 'supervisor' }

/** The Rizurf error envelope (RIZURF_API_TEMPLATE.md SS-5). */
interface Envelope { error?: { code?: string; message?: string; details?: Record<string, unknown> | null } }

const OFFLINE = "Can't reach the logbook server. Check your connection, then reload the page.";

export const quote = (version: string): string => `"${version}"`;

let csrf: Promise<void> | null = null;

function xsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'OFFLINE', OFFLINE);
  }
}

const STALE = 'This was changed in another tab or by someone else. Reload the page to see the latest; your text stays on screen until you do.';

function problemText(status: number, e: Envelope['error']): string {
  if (status === 412) return STALE;
  const first = e?.details ? Object.values(e.details).flat().find((x): x is string => typeof x === 'string') : undefined;
  return first ?? e?.message ?? `The server answered ${status}.`;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; ifMatch?: string; idempotencyKey?: string } = {},
): Promise<{ data: T; etag?: string }> {
  const method = init.method ?? 'GET';
  const form = init.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (method !== 'GET') {
    csrf ??= send(`${API_URL}/sanctum/csrf-cookie`, {}).then(() => undefined, e => { csrf = null; throw e; });
    await csrf;
    const token = xsrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;
  }
  if (init.body !== undefined && !form) headers['Content-Type'] = 'application/json';
  if (init.ifMatch) headers['If-Match'] = init.ifMatch;
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  const res = await send(`${API_URL}/api/v1/${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : form ? (init.body as FormData) : JSON.stringify(init.body),
  });
  const text = await res.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = undefined; }

  if (!res.ok) {
    const e = (payload as Envelope | undefined)?.error;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, problemText(res.status, e));
  }
  return { data: payload as T, etag: res.headers.get('ETag') ?? undefined };
}

export async function apiBytes(path: string): Promise<ArrayBuffer> {
  const res = await send(`${API_URL}/api/v1/${path}`, {});
  if (!res.ok) throw new ApiError(res.status, `HTTP_${res.status}`, `Couldn't download the template file (${res.status}).`);
  return res.arrayBuffer();
}

export async function currentUser(): Promise<Me | null> {
  try {
    return (await api<Me>('me')).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function signIn(email: string, password: string): Promise<Me> {
  return (await api<Me>('auth/login', { method: 'POST', body: { email, password } })).data;
}

export async function signOut(): Promise<void> {
  await api('auth/logout', { method: 'POST' });
}
