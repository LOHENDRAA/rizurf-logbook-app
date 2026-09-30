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

  it('turns the error envelope into an ApiError with the most useful text', async () => {
    stub(c => (c.url.includes('invalid')
      ? json(422, { error: { code: 'VALIDATION_ERROR', message: 'Invalid', correlation_id: 'c1', details: { values: ['Fill in at least one field.'] } } })
      : c.url.includes('stale')
        ? json(412, { error: { code: 'STALE_VERSION', message: 'This item changed elsewhere. Compare and retry.', correlation_id: 'c2', details: null } })
        : json(403, { error: { code: 'FORBIDDEN', message: 'This intern is not in your company.', correlation_id: 'c3', details: null } })));
    const { api } = await load();

    await expect(api('invalid')).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR', message: 'Fill in at least one field.' });
    await expect(api('stale')).rejects.toMatchObject({
      status: 412,
      code: 'STALE_VERSION',
      message: 'This was changed in another tab or by someone else. Reload the page to see the latest; your text stays on screen until you do.',
    });
    await expect(api('other')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'This intern is not in your company.' });
  });

  it('a body that is not the envelope (a proxy error page) still gives a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })));
    const { api } = await load();

    await expect(api('me/logbook')).rejects.toMatchObject({ status: 502, code: 'HTTP_502', message: 'The server answered 502.' });
  });

  it('a network failure becomes a readable ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { api, ApiError } = await load();

    const e = await api('me/logbook').catch(err => err);

    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe("Can't reach the logbook server. Check your connection, then reload the page.");
  });

  it('currentUser is null when nobody is signed in', async () => {
    stub(() => json(401, { error: { code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.', correlation_id: 'c', details: null } }));
    const { currentUser } = await load();

    expect(await currentUser()).toBeNull();
  });
});
