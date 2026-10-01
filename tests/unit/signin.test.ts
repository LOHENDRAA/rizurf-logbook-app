import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ME = { id: 'supervisor-1', name: 'Sarah Lim', role: 'supervisor' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const load = async () => { vi.resetModules(); return import('../../src/data/signin'); };

let posted: unknown[];
function server(opts: { signedIn: boolean; exchange?: Response; dropsCookie?: boolean }) {
  let signedIn = opts.signedIn;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/gateway')) {
      posted.push(JSON.parse(init.body as string));
      const res = opts.exchange ?? json(200, ME);
      if (res.ok && !opts.dropsCookie) signedIn = true;
      return res;
    }
    if (url.endsWith('/api/v1/me')) return signedIn ? json(200, ME) : json(401, { error: { code: 'UNAUTHORIZED', message: 'No session', correlation_id: 'c', details: null } });
    return json(404, {});
  }));
}

// Unit tests run in Node: stand-ins for the three browser globals sign-in touches.
const location = { pathname: '', search: '', hash: '' };
const history = {
  replaceState(_state: unknown, _title: string, url: string) {
    const u = new URL(url, 'https://logbook.test');
    Object.assign(location, { pathname: u.pathname, search: u.search, hash: u.hash });
  },
};

beforeEach(() => {
  posted = [];
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', history);
  history.replaceState(null, '', '/intern-logbook/#/student/notepad');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('signInThroughGateway', () => {
  it('finishes a sign-in the gateway sent back, and removes the code from the address first', async () => {
    history.replaceState(null, '', '/intern-logbook/?code=one-time#/student/notepad');
    server({ signedIn: false });
    const { signInThroughGateway } = await load();

    const me = await signInThroughGateway(() => { throw new Error('should not redirect'); });

    expect(me).toEqual(ME);
    expect(posted).toEqual([{ code: 'one-time' }]);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/student/notepad');
  });

  it('sends someone without a session to the gateway', async () => {
    server({ signedIn: false });
    const { signInThroughGateway } = await load();
    const go = vi.fn();

    expect(await signInThroughGateway(go)).toBeNull();
    expect(go).toHaveBeenCalledWith('/api/v1/auth/sign-in');
  });

  it('stops after one trip to the gateway instead of looping', async () => {
    server({ signedIn: false });
    const { signInThroughGateway } = await load();
    await signInThroughGateway(vi.fn());

    await expect(signInThroughGateway(vi.fn())).rejects.toThrow("Couldn't sign you in through the Rizurf gateway.");
  });

  it('stops when the browser blocks cookies, even though the loop guard cannot be stored', async () => {
    history.replaceState(null, '', '/intern-logbook/?code=one-time');
    server({ signedIn: false, dropsCookie: true });
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    const { signInThroughGateway } = await load();
    const go = vi.fn();

    await expect(signInThroughGateway(go)).rejects.toThrow("Couldn't sign you in through the Rizurf gateway.");
    expect(go).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the logbook refuses the sign-in", async () => {
    history.replaceState(null, '', '/intern-logbook/?code=one-time');
    server({ signedIn: false, exchange: json(403, { error: { code: 'FORBIDDEN', message: "stranger@example.com isn't set up in the logbook yet.", correlation_id: 'c', details: null } }) });
    const { signInThroughGateway } = await load();

    await expect(signInThroughGateway(vi.fn())).rejects.toThrow("stranger@example.com isn't set up in the logbook yet.");
    expect(location.search).toBe('');
  });

  it('an existing session needs no trip to the gateway', async () => {
    server({ signedIn: true });
    const { signInThroughGateway } = await load();
    const go = vi.fn();

    expect(await signInThroughGateway(go)).toEqual(ME);
    expect(go).not.toHaveBeenCalled();
  });
});
