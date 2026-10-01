import { afterEach, describe, expect, it, vi } from 'vitest';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ITEMS = [{ label: 'Tasks done', text: '- fixed the login bug' }];

/** A fresh module per test: SERVER_MODE is read from VITE_API_URL when api.ts loads. */
async function load(apiUrl: string) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiUrl);
  return import('../../src/lib/summarize');
}

let posted: { url: string; body: unknown }[];
function server(reply: Response) {
  posted = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    posted.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined });
    return reply;
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('summarizeFields', () => {
  it('asks the logbook server when the browser has no built-in AI', async () => {
    server(json(200, { summaries: ['Fixed the login bug.'] }));
    const { summarizeFields } = await load('https://api.test');

    expect(await summarizeFields(ITEMS)).toEqual(['Fixed the login bug.']);
    expect(posted).toEqual([{ url: 'https://api.test/api/v1/summaries', body: { items: ITEMS } }]);
  });

  it("shows the server's message when today's limit is used up", async () => {
    server(json(429, { error: { code: 'RATE_LIMITED', message: "You've used today's AI summaries. Try again tomorrow, or write this week's answers yourself.", correlation_id: 'c', details: null } }));
    const { summarizeFields } = await load('https://api.test');

    await expect(summarizeFields(ITEMS)).rejects.toThrow("You've used today's AI summaries.");
  });

  it('without a server or built-in AI, says what is needed and calls nothing', async () => {
    server(json(500, {}));
    const { summarizeFields } = await load('');

    await expect(summarizeFields(ITEMS)).rejects.toThrow('AI summaries need Chrome 138+ on a desktop');
    expect(posted).toEqual([]);
  });

  it("uses the browser's free built-in AI first", async () => {
    server(json(500, {}));
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async () => ({ summarize: async () => 'On-device summary.', destroy() {} }),
    });
    const { summarizeFields } = await load('https://api.test');

    expect(await summarizeFields(ITEMS)).toEqual(['On-device summary.']);
    expect(posted).toEqual([]);
  });
});
