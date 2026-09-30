# Step 3: The Screens Talk to the Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a build has `VITE_API_URL`, the prototype's screens read and write through appv3's `/api/v1` instead of the browser's IndexedDB. Without it, everything works exactly as today.

**Architecture:**
- `src/data/api.ts` is a thin fetch client. It handles the cookie session, the CSRF handshake, ETag / If-Match and problem+json errors.
- `src/data/http.ts` has `HttpRepository`, which implements the existing 13-method `Repository` interface on top of step 2's endpoints.
  - It reads whole logbooks once per load (`GET /me/logbook`, or `GET /supervisor/interns/{id}/logbook` per intern).
  - It maps them onto the prototype's `Student`, `NotepadEntry`, `PeriodFill` and `ReviewAction`.
  - It writes through the per-week endpoints.
- `main.ts` picks the repository at start-up. In server mode it asks the server who is signed in (`GET /me`).
- Until the gateway arrives in step 4, a temporary sign-in form uses appv3's existing `POST /auth/login`.
- No other screen changes.

**Tech Stack:** Vue 3, Vite 8, Pinia, Vitest 5, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` §3 "Step 3". Server contract: `rizurf-logbook-app/docs/superpowers/plans/2026-09-30-step-2-logbook-on-the-server.md` (the Interfaces blocks and the logbook JSON shape).

## Hosting, as decided on 2026-09-30

| Part | Where |
|---|---|
| Screens (this Vite build) | Hostinger, e.g. `https://logbook.company.com` |
| Laravel API (`appv3/backend`) | The company VPS, e.g. `https://api.company.com`, set up by the VPS admin with `appv3/DEPLOY.md` |
| MySQL | The same VPS |

The two addresses share the company domain, so appv3's cookie session works across them (`SESSION_DOMAIN=.company.com`).

For local testing there's no Laravel on the PC. The Vite dev server proxies `/api` and `/sanctum` to the VPS's test server, so the browser only ever talks to `localhost` and the cookies just work.

## Deviations from the spec

- **`repo()` stays IndexedDB by default.** `main.ts` calls the existing `setRepository(new HttpRepository(me))` once it knows who is signed in. `repository.ts` is unchanged.
- **The sign-in form in step 3.**
  - The spec leaves sign-in to step 4, but a server-backed screen can't do anything without a session.
  - A temporary email + password form (`views/SignIn.vue`) uses appv3's existing `POST /auth/login` with the seeded test-server accounts.
  - In server mode, "Viewing as" becomes "Signed in as … · Sign out", and the demo-data buttons are hidden.
  - Step 4 replaces the form with the gateway redirect.
- **"Failed loads are never silent" is done with one global handler.** Any unhandled error (including a failed load) shows as an error toast whose text comes from the server or says the server can't be reached. The views themselves don't change.
- **The step-3 "done when" item "a supervisor and an intern in two browsers see each other's work" is a manual check.** It runs once the VPS test server exists (Task 5, Step 3). The mapping is covered by unit tests against the step-2 JSON shapes.
- **Template files download once per version.** Supervisors load every template's file when the list loads. `ponytail:` fine for a handful of universities.

## Global Constraints

- **Browser-only mode must not change.** All 99 unit tests and every existing Playwright spec pass untouched, and `npm run build` (which runs `vue-tsc`) passes.
- **No new dependencies.** Use `fetch`, `FormData` and `Blob`.
- **Server mode is on** exactly when `import.meta.env.VITE_API_URL` is a non-empty string.
  - `VITE_API_URL=/` means "same origin", used with the dev proxy.
  - Any other value is the API's origin, e.g. `https://api.company.com`.
- **Every request** uses `credentials: 'include'` and `Accept: application/json`.
- **Every non-GET request** first does the Sanctum handshake (`GET /sanctum/csrf-cookie`, once per page load) and sends the `XSRF-TOKEN` cookie back as `X-XSRF-TOKEN`.
- **If-Match** carries the quoted version (`"v1-3"`) the client last saw. Weeks and the internship need it, and a 412 must surface as the server's "changed elsewhere" message, never be retried silently. **Idempotency-Key** goes on submit and review (a fresh `newId('idem')` each time; `crypto.randomUUID` is missing on plain-http LAN addresses).
- **Error text shown to people:**
  - the first validation message if there is one; otherwise the problem+json `detail`, then its `title`;
  - on a network failure: "Can't reach the logbook server. Check your connection, then reload the page."
- **Approval signatures are set by the server.** The client never sends a signature.
- **Secrets:** no passwords or tokens are stored in JS memory beyond the sign-in form's submit call, and none in storage.

## Review Focus

1. **Two tabs editing the same week.** The second save must show the server's "changed elsewhere" message and keep the text on screen. It must never overwrite or retry silently. → Task 3, `putFill surfaces a stale-version 412 as a readable error`.
2. **A dropped connection during a load.** The page must show "Can't reach the logbook server…", not an empty list. → Task 1, `a network failure becomes a readable ApiError` and Task 4, `unhandled load errors reach the toast`.
3. **A note on a day outside every week** (dates changed in another tab). It must fail with a readable message, not a crash. → Task 3, `putNote refuses a date outside the internship`.
4. **Status changes arrive through `putFill`.** The stores call `putFill` with `status: 'submitted' | 'approved'` before `addAction`. It must not send values for a locked week, which would be a 409. → Task 3, `putFill leaves status changes to addAction`.
5. **A supervisor with no interns, or an intern with no placement yet.** It must render the empty or setup screens, not throw. → Task 2, `an intern without a placement lists as a student with no dates`.

---

### Task 1: API client

**Files:**
- Create: `src/data/api.ts`
- Test: `tests/unit/api.test.ts`

**Interfaces:**
- Produces:
  - `SERVER_MODE: boolean` and `API_URL: string` (no trailing slash; `''` means same origin);
  - `class ApiError extends Error { status: number; code: string }`;
  - `api<T>(path: string, init?: { method?: string; body?: unknown; ifMatch?: string; idempotencyKey?: string }): Promise<{ data: T; etag?: string }>`. The `path` is relative to `/api/v1/`, and `body` may be `FormData`;
  - `apiBytes(path: string): Promise<ArrayBuffer>`;
  - `quote(version: string): string` returns `"version"`;
  - `interface Me { id: string; name: string; role: 'student' | 'supervisor' }`;
  - `currentUser(): Promise<Me | null>` (null on 401), `signIn(email, password): Promise<Me>`, `signOut(): Promise<void>`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fresh module per test: the CSRF handshake is remembered once per page load.
const load = async () => { vi.resetModules(); return import('../../src/data/api'); };

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function stub(reply: (c: Call) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    calls.push(c);
    return reply(c);
  }));
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('api', () => {
  it('sends cookies, JSON, If-Match and Idempotency-Key, and returns the ETag', async () => {
    stub(c => (c.url.endsWith('/sanctum/csrf-cookie') ? new Response(null, { status: 204 }) : json(200, { ok: true }, { ETag: '"v2"' })));

    const { api, quote } = await load();
    const res = await api<{ ok: boolean }>('me/journal/weeks/2/values', { method: 'PUT', body: { a: 1 }, ifMatch: quote('v1'), idempotencyKey: 'k1' });

    expect(res).toEqual({ data: { ok: true }, etag: '"v2"' });
    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.url).toBe('/api/v1/me/journal/weeks/2/values');
    expect(put.headers).toMatchObject({ Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': '"v1"', 'Idempotency-Key': 'k1' });
    expect(put.body).toBe('{"a":1}');
  });

  it('does the CSRF handshake once, before the first write only', async () => {
    stub(() => json(200, {}));
    const { api } = await load();

    await api('me/logbook');
    await api('a', { method: 'POST', body: {} });
    await api('b', { method: 'POST', body: {} });

    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/me/logbook', 'GET /sanctum/csrf-cookie', 'POST /api/v1/a', 'POST /api/v1/b',
    ]);
  });

  it('turns problem+json into an ApiError with the most useful text', async () => {
    stub(c => (c.url.includes('invalid')
      ? json(422, { code: 'VALIDATION_FAILED', title: 'Invalid', errors: { values: ['Fill in at least one field.'] } })
      : json(412, { code: 'STALE_VERSION', title: 'This item changed elsewhere. Compare and retry.' })));
    const { api } = await load();

    await expect(api('invalid')).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', message: 'Fill in at least one field.' });
    await expect(api('stale')).rejects.toMatchObject({ status: 412, code: 'STALE_VERSION', message: 'This item changed elsewhere. Compare and retry.' });
  });

  it('a network failure becomes a readable ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { api, ApiError } = await load();

    const e = await api('me/logbook').catch(err => err);

    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe("Can't reach the logbook server. Check your connection, then reload the page.");
  });

  it('currentUser is null when nobody is signed in', async () => {
    stub(() => json(401, { code: 'UNAUTHENTICATED', title: 'Your session has expired. Please sign in again.' }));
    const { currentUser } = await load();

    expect(await currentUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `npx vitest run tests/unit/api.test.ts`
Expected: FAIL, because `../../src/data/api` doesn't exist.

- [ ] **Step 3: Write `src/data/api.ts`:**

```ts
/** Thin client for appv3's /api/v1: cookie session, CSRF handshake, ETags and problem+json errors. */

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

interface Problem { code?: string; title?: string; detail?: string; errors?: Record<string, string[]> }

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

function problemText(status: number, p: Problem | undefined): string {
  const first = p?.errors ? Object.values(p.errors).flat()[0] : undefined;
  return first ?? p?.detail ?? p?.title ?? `The server answered ${status}.`;
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
    const p = payload as Problem | undefined;
    throw new ApiError(res.status, p?.code ?? `HTTP_${res.status}`, problemText(res.status, p));
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
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run tests/unit/api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/data/api.ts tests/unit/api.test.ts
git commit -m "feat(data): API client for appv3 (cookie session, CSRF, ETags, readable errors)"
```

---

### Task 2: HttpRepository reads

**Files:**
- Create: `src/data/http.ts`
- Test: `tests/unit/http.test.ts`

**Interfaces:**
- Consumes: Task 1's `api`, `apiBytes`, `quote`, `ApiError`, `Me`.
- Produces:
  - `class HttpRepository implements Repository`, constructed as `new HttpRepository(me: Me)`;
  - the JSON types `ApiLogbook`, `ApiWeek` and `ApiTemplate`, exported for tests.
  - Reads (this task):
    - `listStudents()` refreshes the logbook cache;
    - `getNotes`, `getFills` and `listActions` read the cache, loading it first if empty;
    - `listTemplates` and `getTemplate`.
  - Writes are stubs that throw `Error('not yet')` until Task 3.

- [ ] **Step 1: Write the failing tests** in `tests/unit/http.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpRepository, type ApiLogbook, type ApiWeek } from '../../src/data/http';

type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: Record<string, (c: Call) => Response>;
const json = (status: number, body: unknown, etag?: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}) } });

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? 'GET', path: url.replace(/^.*\/api\/v1\//, ''), headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    if (url.endsWith('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    calls.push(c);
    const hit = routes[`${c.method} ${c.path}`];
    if (!hit) throw new Error(`unexpected ${c.method} ${c.path}`);
    return hit(c);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const week = (n: number, over: Partial<ApiWeek> = {}): ApiWeek => ({
  weekNumber: n,
  periodKey: `w:2026-09-${String(14 + 7 * (n - 1)).padStart(2, '0')}`,
  startDate: `2026-09-${String(14 + 7 * (n - 1)).padStart(2, '0')}`,
  endDate: `2026-09-${String(20 + 7 * (n - 1)).padStart(2, '0')}`,
  status: 'not_started', fillStatus: 'draft', templateId: null, values: {}, autofilled: {},
  version: `v${n}-1`, capabilities: { canEdit: true, canSubmit: true, canReview: false },
  dailyEntries: [], history: [],
  ...over,
});

const book = (over: Partial<ApiLogbook['student']> = {}, weeks: ApiWeek[] = [week(1), week(2)]): ApiLogbook => ({
  student: { id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha' }, version: 'p-1', canChangeSetup: true, ...over },
  weeks,
});

const intern = () => new HttpRepository({ id: 'student-1', name: 'Aisha Rahman', role: 'student' });
const supervisor = () => new HttpRepository({ id: 'supervisor-1', name: 'Sarah Lim', role: 'supervisor' });

describe('HttpRepository reads', () => {
  it('maps an intern logbook onto Student, notes, fills and actions', async () => {
    routes['GET me/logbook'] = () => json(200, book({}, [
      week(1, {
        templateId: 't1', fillStatus: 'changes_requested', values: { a: 'x' }, autofilled: { a: 'x' }, submittedAt: '2026-09-19T02:00:00.000000Z',
        dailyEntries: [{ date: '2026-09-15', body: 'Set up laptop', updatedAt: '2026-09-15T01:00:00.000000Z' }],
        history: [
          { id: 's1', action: 'submit', by: 'Aisha Rahman', at: '2026-09-19T02:00:00.000000Z' },
          { id: 'r1', action: 'request_changes', by: 'Sarah Lim', comment: 'More detail', at: '2026-09-20T02:00:00.000000Z' },
        ],
      }),
      week(2),
    ]));
    const r = intern();

    expect(await r.listStudents()).toEqual([
      { id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha' } },
    ]);
    expect(await r.getNotes('student-1')).toEqual([
      { studentId: 'student-1', date: '2026-09-15', text: 'Set up laptop', updatedAt: '2026-09-15T01:00:00.000000Z' },
    ]);
    // Weeks never saved (templateId null) aren't fills; the screens treat a missing fill as a fresh draft.
    expect(await r.getFills('student-1')).toEqual([
      { studentId: 'student-1', periodKey: 'w:2026-09-14', templateId: 't1', values: { a: 'x' }, autofilled: { a: 'x' }, status: 'changes_requested', submittedAt: '2026-09-19T02:00:00.000000Z' },
    ]);
    expect(await r.listActions('student-1')).toEqual([
      { id: 's1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'submit', by: 'Aisha Rahman', at: '2026-09-19T02:00:00.000000Z' },
      { id: 'r1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'request_changes', by: 'Sarah Lim', comment: 'More detail', at: '2026-09-20T02:00:00.000000Z' },
    ]);
    expect(calls.filter(c => c.path === 'me/logbook')).toHaveLength(1);
  });

  it('an intern without a placement lists as a student with no dates', async () => {
    routes['GET me/logbook'] = () => json(200, book({ templateId: null, startDate: null, endDate: null, coverValues: {}, version: null }, []));

    expect(await intern().listStudents()).toEqual([{ id: 'student-1', name: 'Aisha Rahman', coverValues: {} }]);
  });

  it('a supervisor loads each intern logbook in the company', async () => {
    routes['GET supervisor/interns?per_page=100'] = () => json(200, { data: [{ studentId: 'student-1' }, { studentId: 'student-3' }], meta: {} });
    routes['GET supervisor/interns/student-1/logbook'] = () => json(200, book());
    routes['GET supervisor/interns/student-3/logbook'] = () => json(200, book({ id: 'student-3', name: 'Maya Chen' }));
    const r = supervisor();

    const [students, fills] = await Promise.all([r.listStudents(), r.getFills()]);

    expect(students.map(s => s.name)).toEqual(['Aisha Rahman', 'Maya Chen']);
    expect(fills).toEqual([]);
    expect(calls).toHaveLength(3); // the parallel getFills reused the same load
  });

  it('a supervisor gets full templates with their files, downloaded once per version', async () => {
    const detail = { id: 't1', universityName: 'UTM', format: 'docx', fileName: 'utm.docx', placeholders: [{ id: 'p1' }], pageRoles: null, unitStartBlock: 2, version: 'v-1', updatedAt: '2026-09-30T00:00:00+00:00' };
    routes['GET templates'] = () => json(200, { data: [{ id: 't1', universityName: 'UTM', format: 'docx', version: 'v-1' }] });
    routes['GET templates/t1'] = () => json(200, detail, '"v-1"');
    routes['GET templates/t1/file'] = () => new Response(new Uint8Array([1, 2, 3]));
    const r = supervisor();

    const [t] = await r.listTemplates();
    await r.listTemplates();

    expect(t).toMatchObject({ id: 't1', university: 'UTM', format: 'docx', fileName: 'utm.docx', period: 'weekly', unitStartBlock: 2, placeholders: [{ id: 'p1' }] });
    expect(t.pageRoles).toBeUndefined();
    expect(new Uint8Array(t.fileBytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls.filter(c => c.path === 'templates/t1/file')).toHaveLength(1);
  });

  it('an intern sees every university but only their own template in full', async () => {
    routes['GET templates'] = () => json(200, { data: [{ id: 't1', universityName: 'UTM' }, { id: 't2', universityName: 'Taylor’s' }] });
    routes['GET me/template'] = () => json(200, { id: 't1', universityName: 'UTM', format: 'pdf', fileName: 'utm.pdf', placeholders: [], pageRoles: ['unit'], unitStartBlock: null, version: 'v-1', updatedAt: null }, '"v-1"');
    routes['GET templates/t1/file'] = () => new Response(new Uint8Array([9]));
    const r = intern();

    const list = await r.listTemplates();
    const other = await r.getTemplate('t2');

    expect(list.map(t => [t.id, t.university, t.fileBytes.byteLength])).toEqual([['t1', 'UTM', 1], ['t2', 'Taylor’s', 0]]);
    expect(other).toMatchObject({ id: 't2', university: 'Taylor’s', placeholders: [] });
  });

  it('an intern with no template yet still gets the list', async () => {
    routes['GET templates'] = () => json(200, { data: [{ id: 't1', universityName: 'UTM' }] });
    routes['GET me/template'] = () => json(404, { code: 'NOT_FOUND', title: 'Not found' });

    expect((await intern().listTemplates()).map(t => t.id)).toEqual(['t1']);
  });
});
```

- [ ] **Step 2: Run and watch them fail.**

Run: `npx vitest run tests/unit/http.test.ts`
Expected: FAIL, because `../../src/data/http` doesn't exist.

- [ ] **Step 3: Write `src/data/http.ts` (reads, plus write stubs):**

```ts
import type { NotepadEntry, PeriodFill, PeriodStatus, Placeholder, ReviewAction, Student, Template } from '../core/model';
import type { Repository } from './repository';
import { api, apiBytes, ApiError, quote, type Me } from './api';

/** Shapes from appv3's step-2 API (see its plan's Interfaces blocks). */
export interface ApiWeek {
  weekNumber: number; periodKey: string; startDate: string; endDate: string;
  status: string; fillStatus: PeriodStatus; templateId: string | null;
  values: Record<string, string>; autofilled: Record<string, string>;
  version: string; submittedAt?: string;
  capabilities: { canEdit: boolean; canSubmit: boolean; canReview: boolean };
  dailyEntries: { date: string; body: string; updatedAt?: string }[];
  history: { id: string; action: ReviewAction['action']; by: string; signature?: string; comment?: string; at: string }[];
}
export interface ApiLogbook {
  student: {
    id: string; name: string; templateId: string | null; startDate: string | null; endDate: string | null;
    coverValues: Record<string, string>; version: string | null; canChangeSetup: boolean;
  };
  weeks: ApiWeek[];
}
export interface ApiTemplate {
  id: string; universityName: string; format?: 'docx' | 'pdf'; fileName?: string; placeholders?: Placeholder[];
  pageRoles?: Template['pageRoles'] | null; unitStartBlock?: number | null; version?: string; updatedAt?: string | null;
}

const toTemplate = (d: ApiTemplate, fileBytes: ArrayBuffer): Template => ({
  id: d.id,
  university: d.universityName,
  format: d.format ?? 'docx',
  fileName: d.fileName ?? '',
  fileBytes,
  period: 'weekly',
  pageRoles: d.pageRoles ?? undefined,
  unitStartBlock: d.unitStartBlock ?? undefined,
  placeholders: d.placeholders ?? [],
  updatedAt: d.updatedAt ?? '',
});

/** The screens' Repository on top of appv3's /api/v1. */
export class HttpRepository implements Repository {
  private books = new Map<string, ApiLogbook>();
  private loading: Promise<void> | null = null;
  private files = new Map<string, { version: string; template: Template }>();

  constructor(private readonly me: Me) {}

  private get supervisor(): boolean { return this.me.role === 'supervisor'; }

  /** One fetch of every logbook this person can see; readers in the same screen load share it. */
  private refresh(): Promise<void> {
    this.loading = (async () => {
      // ponytail: one request per intern; add a supervisor-wide endpoint if a company has more than a few dozen interns.
      const paths = this.supervisor
        ? (await api<{ data: { studentId: string }[] }>('supervisor/interns?per_page=100')).data.data.map(i => `supervisor/interns/${i.studentId}/logbook`)
        : ['me/logbook'];
      const books = await Promise.all(paths.map(p => api<ApiLogbook>(p)));
      this.books = new Map(books.map(({ data }) => [data.student.id, data]));
    })();
    return this.loading;
  }

  protected async all(studentId?: string): Promise<ApiLogbook[]> {
    await (this.loading ?? this.refresh());
    return [...this.books.values()].filter(b => !studentId || b.student.id === studentId);
  }

  async listStudents(): Promise<Student[]> {
    await this.refresh();
    return [...this.books.values()].map(({ student: s }) => ({
      id: s.id,
      name: s.name,
      ...(s.templateId ? { templateId: s.templateId } : {}),
      ...(s.startDate ? { startDate: s.startDate } : {}),
      ...(s.endDate ? { endDate: s.endDate } : {}),
      coverValues: s.coverValues,
    }));
  }

  async getNotes(studentId: string): Promise<NotepadEntry[]> {
    return (await this.all(studentId)).flatMap(b => b.weeks.flatMap(w =>
      w.dailyEntries.map(d => ({ studentId: b.student.id, date: d.date, text: d.body, updatedAt: d.updatedAt ?? '' }))));
  }

  async getFills(studentId?: string): Promise<PeriodFill[]> {
    return (await this.all(studentId)).flatMap(b => b.weeks.filter(w => w.templateId).map(w => ({
      studentId: b.student.id,
      periodKey: w.periodKey,
      templateId: w.templateId!,
      values: w.values,
      autofilled: w.autofilled,
      status: w.fillStatus,
      ...(w.submittedAt ? { submittedAt: w.submittedAt } : {}),
    })));
  }

  async listActions(studentId?: string): Promise<ReviewAction[]> {
    return (await this.all(studentId)).flatMap(b => b.weeks.flatMap(w => w.history.map(h => ({
      id: h.id,
      studentId: b.student.id,
      periodKey: w.periodKey,
      action: h.action,
      by: h.by,
      ...(h.signature ? { signature: h.signature } : {}),
      ...(h.comment ? { comment: h.comment } : {}),
      at: h.at,
    }))));
  }

  /** A full template with its file, downloaded again only when its version changes. */
  private async full(detailPath: string): Promise<Template | undefined> {
    try {
      const { data, etag } = await api<ApiTemplate>(detailPath);
      const version = data.version ?? etag ?? '';
      const cached = this.files.get(data.id);
      if (cached?.version === version) return cached.template;
      const template = toTemplate(data, await apiBytes(`templates/${data.id}/file`));
      this.files.set(data.id, { version, template });
      return template;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  // ponytail: supervisors download every template file on each list; fine for a handful of universities.
  async listTemplates(): Promise<Template[]> {
    const list = (await api<{ data: ApiTemplate[] }>('templates')).data.data;
    if (this.supervisor) {
      return (await Promise.all(list.map(t => this.full(`templates/${t.id}`)))).filter((t): t is Template => !!t);
    }
    // Interns only need the names (to pick their university) plus their own template in full.
    const own = await this.full('me/template');
    return list.map(t => (t.id === own?.id ? own : toTemplate(t, new ArrayBuffer(0))));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    if (this.supervisor) return this.full(`templates/${id}`);
    return (await this.listTemplates()).find(t => t.id === id);
  }

  async putTemplate(_t: Template): Promise<void> { throw new Error('not yet'); }
  async deleteTemplate(_id: string): Promise<void> { throw new Error('not yet'); }
  async putStudent(_s: Student): Promise<void> { throw new Error('not yet'); }
  async putNote(_e: NotepadEntry): Promise<void> { throw new Error('not yet'); }
  async putFill(_f: PeriodFill): Promise<void> { throw new Error('not yet'); }
  async addAction(_a: ReviewAction): Promise<void> { throw new Error('not yet'); }
  async reset(): Promise<void> { throw new Error('not yet'); }
}
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run tests/unit/http.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/data/http.ts tests/unit/http.test.ts
git commit -m "feat(data): HttpRepository reads logbooks and templates from the server"
```

---

### Task 3: HttpRepository writes

**Files:**
- Modify: `src/data/http.ts` (replace the seven stubs)
- Test: `tests/unit/http.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: Task 2's cache (`books` and `files`) and `api` / `quote`; `newId` from `src/core/ids.ts`.
- Produces the `Repository` write semantics that `stores/*.ts` already rely on:
  - `putStudent` → `PUT me/internship`. It sends If-Match with the placement version once one exists, and replaces the cached logbook.
  - `putNote` → `PUT me/journal/weeks/{n}/daily` on the week containing the date, with If-Match. It updates that week's version and entry.
  - `putFill` → `PUT me/journal/weeks/{n}/values` with If-Match. It's a **no-op** when `status` is `submitted` or `approved`; those changes arrive through `addAction`.
  - `addAction`: `submit` → `POST me/journal/weeks/{n}/submit {version}`; `approve` and `request_changes` → `POST supervisor/interns/{id}/weeks/{n}/review {decision, feedback}`. Both send If-Match and Idempotency-Key, and never a signature.
  - `putTemplate`: `PUT templates/{id}` (JSON, If-Match) when the id came from the server, otherwise `POST templates` (multipart). `deleteTemplate` → `DELETE templates/{id}` with If-Match.
  - `reset` throws `Error('Demo data only exists in the browser version.')`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/unit/http.test.ts`:

```ts
import type { PeriodFill, Template } from '../../src/core/model';

const fill = (over: Partial<PeriodFill> = {}): PeriodFill =>
  ({ studentId: 'student-1', periodKey: 'w:2026-09-14', templateId: 't1', values: { a: 'x' }, autofilled: {}, status: 'draft', ...over });

async function loadedIntern(weeks = [week(1), week(2)]) {
  routes['GET me/logbook'] = () => json(200, book({}, weeks));
  const r = intern();
  await r.listStudents();
  return r;
}

describe('HttpRepository writes', () => {
  it('putNote writes to the week holding the date and keeps its new version', async () => {
    const r = await loadedIntern();
    let n = 1;
    routes['PUT me/journal/weeks/2/daily'] = () => json(200, { date: '2026-09-22', body: 'x', updatedAt: 't', version: `v2-${++n}` });

    await r.putNote({ studentId: 'student-1', date: '2026-09-22', text: 'first', updatedAt: '' });
    await r.putNote({ studentId: 'student-1', date: '2026-09-22', text: 'second', updatedAt: '' });

    const puts = calls.filter(c => c.method === 'PUT');
    expect(puts.map(c => c.headers['If-Match'])).toEqual(['"v2-1"', '"v2-2"']);
    expect(JSON.parse(puts[1].body as string)).toEqual({ date: '2026-09-22', body: 'second' });
    expect((await r.getNotes('student-1')).map(e => e.text)).toEqual(['second']);
  });

  it('putNote refuses a date outside the internship', async () => {
    const r = await loadedIntern();

    await expect(r.putNote({ studentId: 'student-1', date: '2026-12-01', text: 'x', updatedAt: '' }))
      .rejects.toThrow("That day isn't part of your internship. Reload the page.");
  });

  it('putFill saves answers with If-Match and caches the returned week', async () => {
    const r = await loadedIntern();
    routes['PUT me/journal/weeks/1/values'] = () => json(200, week(1, { templateId: 't1', values: { a: 'x' }, version: 'v1-2' }));

    await r.putFill(fill());

    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.headers['If-Match']).toBe('"v1-1"');
    expect(JSON.parse(put.body as string)).toEqual({ templateId: 't1', values: { a: 'x' }, autofilled: {} });
    expect(await r.getFills('student-1')).toMatchObject([{ periodKey: 'w:2026-09-14', values: { a: 'x' } }]);
  });

  it('putFill leaves status changes to addAction', async () => {
    const r = await loadedIntern();

    await r.putFill(fill({ status: 'submitted' }));
    await r.putFill(fill({ status: 'approved' }));

    expect(calls.filter(c => c.method !== 'GET')).toEqual([]);
  });

  it('putFill surfaces a stale-version 412 as a readable error', async () => {
    const r = await loadedIntern();
    routes['PUT me/journal/weeks/1/values'] = () => json(412, { code: 'STALE_VERSION', title: 'This item changed elsewhere. Compare and retry.' });

    await expect(r.putFill(fill())).rejects.toThrow('This item changed elsewhere. Compare and retry.');
    expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1); // never retried
  });

  it('submit sends the week version with an idempotency key', async () => {
    const r = await loadedIntern();
    routes['POST me/journal/weeks/1/submit'] = () => json(200, week(1, { fillStatus: 'submitted', version: 'v1-2' }));

    await r.addAction({ id: 'a1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'submit', by: 'Aisha', at: '' });

    const post = calls.find(c => c.method === 'POST')!;
    expect(JSON.parse(post.body as string)).toEqual({ version: 'v1-1' });
    expect(post.headers['Idempotency-Key']).toMatch(/^idem_/);
  });

  it('a supervisor approves without sending a signature', async () => {
    routes['GET supervisor/interns?per_page=100'] = () => json(200, { data: [{ studentId: 'student-1' }] });
    routes['GET supervisor/interns/student-1/logbook'] = () => json(200, book());
    routes['POST supervisor/interns/student-1/weeks/1/review'] = () => json(200, week(1, { fillStatus: 'approved' }));
    const r = supervisor();
    await r.listStudents();

    await r.addAction({ id: 'a2', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'approve', by: 'Supervisor', signature: 'Forged', at: '' });

    const post = calls.find(c => c.method === 'POST')!;
    expect(JSON.parse(post.body as string)).toEqual({ decision: 'approve' });
    expect(post.headers['If-Match']).toBe('"v1-1"');
  });

  it('request_changes sends the comment as feedback', async () => {
    routes['GET supervisor/interns?per_page=100'] = () => json(200, { data: [{ studentId: 'student-1' }] });
    routes['GET supervisor/interns/student-1/logbook'] = () => json(200, book());
    routes['POST supervisor/interns/student-1/weeks/2/review'] = () => json(200, week(2, { fillStatus: 'changes_requested' }));
    const r = supervisor();
    await r.listStudents();

    await r.addAction({ id: 'a3', studentId: 'student-1', periodKey: 'w:2026-09-21', action: 'request_changes', by: 'Supervisor', comment: 'More detail', at: '' });

    expect(JSON.parse(calls.find(c => c.method === 'POST')!.body as string)).toEqual({ decision: 'request_changes', feedback: 'More detail' });
  });

  it('putStudent creates the placement without If-Match, then updates with it', async () => {
    routes['GET me/logbook'] = () => json(200, book({ templateId: null, startDate: null, endDate: null, version: null }, []));
    routes['PUT me/internship'] = () => json(200, book({ version: 'p-2' }));
    const r = intern();
    await r.listStudents();
    const s = { id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha' } };

    await r.putStudent(s);
    await r.putStudent({ ...s, coverValues: { name: 'Aisha R.' } });

    const puts = calls.filter(c => c.method === 'PUT');
    expect(puts.map(c => c.headers['If-Match'])).toEqual([undefined, '"p-2"']);
    expect(JSON.parse(puts[1].body as string)).toEqual({ templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha R.' } });
  });

  it('putTemplate uploads a new template as multipart and edits a known one as JSON', async () => {
    const r = supervisor();
    const t: Template = { id: 'tpl_local', university: 'UTM', format: 'docx', fileName: 'utm.docx', fileBytes: new Uint8Array([1]).buffer, period: 'weekly', unitStartBlock: 0, placeholders: [], updatedAt: '' };
    routes['POST templates'] = () => json(201, { id: 'srv-1' });

    await r.putTemplate(t);

    const form = calls[0].body as FormData;
    expect(form.get('universityName')).toBe('UTM');
    expect(form.get('unitStartBlock')).toBe('0');
    expect(form.get('placeholders')).toBe('[]');
    expect((form.get('file') as File).name).toBe('utm.docx');

    routes['GET templates'] = () => json(200, { data: [{ id: 'srv-1', universityName: 'UTM' }] });
    routes['GET templates/srv-1'] = () => json(200, { ...t, id: 'srv-1', universityName: 'UTM', version: 'v-1' });
    routes['GET templates/srv-1/file'] = () => new Response(new Uint8Array([1]));
    routes['PUT templates/srv-1'] = () => json(200, { id: 'srv-1', version: 'v-2' });
    routes['DELETE templates/srv-1'] = () => new Response(null, { status: 204 });
    const [known] = await r.listTemplates();

    await r.putTemplate({ ...known, university: 'UTM Johor' });
    await r.deleteTemplate('srv-1');

    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.headers['If-Match']).toBe('"v-1"');
    expect(JSON.parse(put.body as string)).toEqual({ universityName: 'UTM Johor', placeholders: [], pageRoles: null, unitStartBlock: 0 });
    expect(calls.find(c => c.method === 'DELETE')!.headers['If-Match']).toBe('"v-2"');
  });

  it('reset is only for the browser version', async () => {
    await expect(intern().reset()).rejects.toThrow('Demo data only exists in the browser version.');
  });
});
```

The `DELETE` expects `"v-2"` because a successful PUT stores the returned version in the cache.

- [ ] **Step 2: Run and watch them fail.**

Run: `npx vitest run tests/unit/http.test.ts`
Expected: the 11 new tests FAIL with "not yet". The 6 read tests still PASS.

- [ ] **Step 3: Replace the seven stubs** in `src/data/http.ts`. Add `import { newId } from '../core/ids';`, then:

```ts
  private weekOf(b: ApiLogbook, pick: (w: ApiWeek) => boolean): ApiWeek {
    const w = b.weeks.find(pick);
    if (!w) throw new Error("That day isn't part of your internship. Reload the page.");
    return w;
  }

  private async bookOf(studentId: string): Promise<ApiLogbook> {
    const [b] = await this.all(studentId);
    if (!b) throw new Error('That intern is no longer in your list. Reload the page.');
    return b;
  }

  async putStudent(s: Student): Promise<void> {
    const version = this.books.get(s.id)?.student.version;
    const { data } = await api<ApiLogbook>('me/internship', {
      method: 'PUT',
      body: { templateId: s.templateId, startDate: s.startDate, endDate: s.endDate, coverValues: s.coverValues },
      ifMatch: version ? quote(version) : undefined,
    });
    this.books.set(data.student.id, data);
  }

  async putNote(e: NotepadEntry): Promise<void> {
    const w = this.weekOf(await this.bookOf(e.studentId), x => e.date >= x.startDate && e.date <= x.endDate);
    const { data } = await api<{ date: string; body: string; updatedAt?: string; version: string }>(
      `me/journal/weeks/${w.weekNumber}/daily`,
      { method: 'PUT', body: { date: e.date, body: e.text }, ifMatch: quote(w.version) },
    );
    w.version = data.version;
    w.dailyEntries = [...w.dailyEntries.filter(d => d.date !== data.date), { date: data.date, body: data.body, updatedAt: data.updatedAt }];
  }

  async putFill(f: PeriodFill): Promise<void> {
    // The stores persist a fill with its new status just before addAction; the server changes status itself.
    if (f.status === 'submitted' || f.status === 'approved') return;
    const w = this.weekOf(await this.bookOf(f.studentId), x => x.periodKey === f.periodKey);
    const { data } = await api<ApiWeek>(`me/journal/weeks/${w.weekNumber}/values`, {
      method: 'PUT',
      body: { templateId: f.templateId, values: f.values, autofilled: f.autofilled },
      ifMatch: quote(w.version),
    });
    Object.assign(w, data);
  }

  async addAction(a: ReviewAction): Promise<void> {
    const w = this.weekOf(await this.bookOf(a.studentId), x => x.periodKey === a.periodKey);
    const { data } = a.action === 'submit'
      ? await api<ApiWeek>(`me/journal/weeks/${w.weekNumber}/submit`, {
          method: 'POST', body: { version: w.version }, ifMatch: quote(w.version), idempotencyKey: newId('idem'),
        })
      : await api<ApiWeek>(`supervisor/interns/${a.studentId}/weeks/${w.weekNumber}/review`, {
          method: 'POST',
          // The server signs approvals with the signed-in supervisor's name; a signature from here would be ignored.
          body: a.action === 'approve' ? { decision: 'approve' } : { decision: 'request_changes', feedback: a.comment },
          ifMatch: quote(w.version),
          idempotencyKey: newId('idem'),
        });
    Object.assign(w, data);
  }

  async putTemplate(t: Template): Promise<void> {
    const known = this.files.get(t.id);
    if (known) {
      const { data } = await api<{ version: string }>(`templates/${t.id}`, {
        method: 'PUT',
        body: { universityName: t.university, placeholders: t.placeholders, pageRoles: t.pageRoles ?? null, unitStartBlock: t.unitStartBlock ?? null },
        ifMatch: quote(known.version),
      });
      this.files.set(t.id, { version: data.version, template: t });
      return;
    }
    // A template made in the editor has a local id; the server assigns its own and the list reloads after saving.
    const form = new FormData();
    form.append('file', new Blob([t.fileBytes]), t.fileName);
    form.append('universityName', t.university);
    form.append('placeholders', JSON.stringify(t.placeholders));
    if (t.pageRoles) form.append('pageRoles', JSON.stringify(t.pageRoles));
    if (t.unitStartBlock !== undefined) form.append('unitStartBlock', String(t.unitStartBlock));
    await api('templates', { method: 'POST', body: form });
  }

  async deleteTemplate(id: string): Promise<void> {
    const known = this.files.get(id);
    await api(`templates/${id}`, { method: 'DELETE', ifMatch: known ? quote(known.version) : undefined });
    this.files.delete(id);
  }

  async reset(): Promise<void> {
    throw new Error('Demo data only exists in the browser version.');
  }
```

Remove the now-unused `_`-prefixed stub methods. If TypeScript complains that a `private` member is unused, the tests exercise it through the public methods.

- [ ] **Step 4: Run the whole unit suite.**

Run: `npx vitest run`
Expected: PASS. That's 99 existing tests + 5 (api) + 17 (http) = 121.

- [ ] **Step 5: Commit.**

```bash
git add src/data/http.ts tests/unit/http.test.ts
git commit -m "feat(data): HttpRepository writes notes, answers, reviews, setup and templates"
```

---

### Task 4: Wiring — start-up, sign-in, visible errors, dev proxy

**Files:**
- Create: `src/views/SignIn.vue`
- Modify:
  - `src/main.ts`
  - `src/router.ts`
  - `src/stores/session.ts`
  - `src/components/RoleSwitcher.vue`
  - `vite.config.ts`
  - `src/env.d.ts`
  - `.gitignore` (add `.env.*.local` if missing)
- Test: `tests/unit/stores.test.ts` (one new case), plus the existing Playwright suite

**Interfaces:**
- Consumes: `SERVER_MODE`, `currentUser`, `signIn`, `signOut` and `Me` from Task 1; `HttpRepository` from Task 2; `setRepository` from `src/data/repository.ts`.
- Produces:
  - `useSession().me: Me | null`;
  - `useSession().signedIn(me: Me)`, which sets `me` and `role` (`SUPERVISOR` for supervisors, otherwise the user id);
  - the route `name: 'sign-in'`, path `/sign-in`.

- [ ] **Step 1: Write the failing store test.** Add to `tests/unit/stores.test.ts`, inside its top-level `describe`:

```ts
  it('a signed-in server user sets the role the screens use', () => {
    const session = useSession();

    session.signedIn({ id: 'student-1', name: 'Aisha Rahman', role: 'student' });
    expect(session.role).toBe('student-1');
    expect(session.isSupervisor).toBe(false);

    session.signedIn({ id: 'supervisor-1', name: 'Sarah Lim', role: 'supervisor' });
    expect(session.isSupervisor).toBe(true);
    expect(session.me?.name).toBe('Sarah Lim');
  });
```

(`useSession` is already imported there. If it isn't, add `import { useSession } from '../../src/stores/session';`.)

Run: `npx vitest run tests/unit/stores.test.ts`
Expected: FAIL, because `session.signedIn is not a function`.

- [ ] **Step 2: Extend the session store** (`src/stores/session.ts`):

```ts
import type { Me } from '../data/api';
```

Inside the store:

```ts
  const me = ref<Me | null>(null);
  /** Server mode: the person the server says is signed in decides the screens, not the dropdown. */
  function signedIn(user: Me) { me.value = user; setRole(user.role === 'supervisor' ? SUPERVISOR : user.id); }
```

Then add `me, signedIn` to the returned object.

Run: `npx vitest run tests/unit/stores.test.ts`
Expected: PASS.

- [ ] **Step 3: Start up in server mode** (`src/main.ts`). Replace `start()`:

```ts
import { setRepository, repo } from './data/repository';
import { SERVER_MODE, currentUser } from './data/api';
import { HttpRepository } from './data/http';
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
```

Keep the existing `start().catch(...)` fallback.

- [ ] **Step 4: Add the sign-in route and guard** (`src/router.ts`). Add `import { SERVER_MODE } from './data/api';`, then add this to `routes` before the catch-all:

```ts
    { path: '/sign-in', name: 'sign-in', component: () => import('./views/SignIn.vue') },
```

As the first lines of `router.beforeEach`:

```ts
  const session = useSession();
  if (SERVER_MODE && !session.me) return to.name === 'sign-in' ? true : { name: 'sign-in' };
  if (to.name === 'sign-in') return '/';
```

Remove the now-duplicate `const session = useSession();` that followed.

- [ ] **Step 5: Write `src/views/SignIn.vue`:**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { signIn } from '../data/api';
import { errorText } from '../lib/errors';

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await signIn(email.value.trim(), password.value);
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
```

- [ ] **Step 6: Replace "Viewing as" with "Signed in as" in server mode** (`src/components/RoleSwitcher.vue`). Add `import { SERVER_MODE, signOut } from '../data/api';` and:

```ts
async function leave() {
  try { await signOut(); } finally { location.reload(); }
}
```

Wrap the template:

```vue
  <div v-if="SERVER_MODE" class="role">
    <span v-if="session.me" class="muted">Signed in as <strong>{{ session.me.name }}</strong></span>
    <button v-if="session.me" type="button" class="link" data-testid="sign-out" @click="leave">Sign out</button>
  </div>
  <div v-else class="role">
    …the existing label/select and demo buttons, unchanged…
  </div>
```

- [ ] **Step 7: Dev proxy and types.** Replace `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// The built app is served by XAMPP's Apache at http://localhost/intern-logbook/.
// For `npm run dev` against a real server, put in .env.development.local:
//   VITE_API_URL=/                              (talk to this dev server…)
//   API_PROXY=https://api.company.com           (…which forwards /api and /sanctum here)
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').API_PROXY;
  // Cookies come back for localhost, so the session works without cross-site cookie rules.
  const proxy = target ? { target, changeOrigin: true, cookieDomainRewrite: '' } : undefined;
  return {
    base: '/intern-logbook/',
    plugins: [vue()],
    build: { outDir: 'C:/xampp/htdocs/intern-logbook', emptyOutDir: true },
    server: proxy ? { proxy: { '/api': proxy, '/sanctum': proxy } } : undefined,
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
      testTimeout: 20000,
    },
  };
});
```

Add to `src/env.d.ts`:

```ts
interface ImportMetaEnv { readonly VITE_API_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
```

Make sure `.gitignore` ignores `.env.*.local`. Add the line `.env.*.local` if it's missing.

- [ ] **Step 8: Check browser-only mode is unchanged.**

Run: `npx vitest run` → Expected: all unit tests PASS.
Run: `npm run build` → Expected: `vue-tsc` and the build succeed.
Run: `npx playwright test` → Expected: every existing spec PASSES, because no `VITE_API_URL` means browser mode.

- [ ] **Step 9: Check server mode shows the sign-in form.**

Run:

```bash
VITE_API_URL=https://api.invalid npx vite build --outDir dist-server
```

Then run `npx vite preview --outDir dist-server --port 4174`. Open `http://localhost:4174/intern-logbook/`.

Expected: the page says "The app could not start: Can't reach the logbook server. Check your connection, then reload the page." It isn't an empty list or a blank page. Delete `dist-server` afterwards.

- [ ] **Step 10: Commit.**

```bash
git add src/main.ts src/router.ts src/stores/session.ts src/components/RoleSwitcher.vue src/views/SignIn.vue vite.config.ts src/env.d.ts .gitignore tests/unit/stores.test.ts
git commit -m "feat: server mode — start-up via GET /me, temporary sign-in, visible load errors, dev proxy"
```

---

### Task 5: Docs, and the check against the real server

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` (hosting), `README.md` (server mode)

- [ ] **Step 1: Update the roadmap's hosting.** In §2 "Decisions":
  - Change the **Hosting** row to: "Screens: Hostinger (static build, e.g. `logbook.company.com`). Laravel API and MySQL: the company VPS (e.g. `api.company.com`), set up by the VPS admin with `appv3/DEPLOY.md`."
  - Under **Step 0**, replace the VPS bullet with: "VPS: the admin follows `appv3/DEPLOY.md` (PHP 8.4, the app, MySQL, HTTPS)."
  - Under **Step 6**: "Upload the screens' build to Hostinger. The VPS admin updates the API with DEPLOY.md's 'Updating' steps. Backups are DEPLOY.md's 'Backups' section."

- [ ] **Step 2: README.** Add a "Server mode" section:
  - browser-only by default;
  - how to test against the VPS test server with `.env.development.local` (`VITE_API_URL=/` and `API_PROXY=https://api.company.com`) and `npm run dev`;
  - for the Hostinger build, `VITE_API_URL=https://api.company.com npm run build`;
  - the test-server accounts are the seeded ones (`aisha.rahman@student.example.edu` is an intern and `sarah.lim@nusantara.example.com` a supervisor), and their password is the VPS's `DEMO_PASSWORD`, which the admin gives out.

Commit:

```bash
git add README.md docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md
git commit -m "docs: hosting on Hostinger + VPS; how to run against the server"
```

- [ ] **Step 3: Manual check once the VPS test server exists.** This isn't blocking for merging, and is recorded in the PR description.
  1. With the proxy set up, run `npm run dev`. Sign in as the supervisor in one browser and upload a template for Universiti Teknologi Malaysia.
  2. In a second browser (or a private window), sign in as Aisha. Do the setup (pick UTM and the dates), write a note, fill the week, and submit.
  3. As the supervisor, the week appears in **Review**. Request changes. As Aisha, see the comment, fix the week, and resubmit. As the supervisor, approve.
  4. As Aisha, **Export** downloads the page signed with the supervisor's name.
  5. Edit the same week in two tabs. The second save shows "This item changed elsewhere…".
