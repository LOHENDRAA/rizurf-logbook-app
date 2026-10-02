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

const NOTES = '• Mon 28/09/2026: Set up the ERP gateway dev environment\n• Tue 29/09/2026: Fixed the login redirect bug.';
const ESSAY = 'This week I set up the ERP gateway dev environment. I then fixed the login redirect bug.';

describe('week essay', () => {
  it('turns the notepad lines into first-person sentences', async () => {
    const { plainEssay } = await load('');
    expect(plainEssay(NOTES)).toBe(ESSAY);
    expect(plainEssay('• Wed 30/09/2026: I joined sprint planning' + String.fromCharCode(10) + '• Fri 02/10/2026: Reviewed a PR'))
      .toBe('This week I joined sprint planning. I then reviewed a PR.');
  });

  it('ignores a chatty, formatted reply from the built-in AI and keeps the plain essay', async () => {
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async () => ({ summarize: async () => "Okay, here's a breakdown:\n\n**Tasks & Status:**\n* **Mon:** Set up", destroy() {} }),
    });
    const { summarizeFields } = await load('');
    expect(await summarizeFields([{ label: 'Tasks', text: NOTES }])).toEqual([ESSAY]);
  });

  it('without a server or built-in AI, writes the plain essay', async () => {
    const { summarizeFields } = await load('');
    expect(await summarizeFields([{ label: 'Tasks', text: NOTES }])).toEqual([ESSAY]);
  });

  it("falls back to the plain essay when the server has no AI key", async () => {
    server(json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: "AI summaries aren't set up on this server.", correlation_id: 'c', details: null } }));
    const { summarizeFields } = await load('https://api.test');
    expect(await summarizeFields([{ label: 'Tasks', text: NOTES }])).toEqual([ESSAY]);
  });
});
