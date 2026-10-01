// Free first: Chrome's built-in on-device Summarizer (Chrome 138+ desktop) — no key, no cost, notes stay on the machine.
// Otherwise, in server mode: POST /api/v1/summaries, where the server's OpenAI key (gpt-4o-mini) does it, up to 20 a day per person.
import { api, SERVER_MODE } from '../data/api';
interface SummarizerInstance { summarize(text: string, opts?: { context?: string }): Promise<string>; destroy(): void }
interface SummarizerStatic {
  availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts: { type: 'tldr'; format: 'plain-text'; length: 'medium'; sharedContext?: string }): Promise<SummarizerInstance>;
}
type Item = { label: string; text: string };

async function onDevice(items: Item[]): Promise<string[] | null> {
  const S = (globalThis as unknown as { Summarizer?: SummarizerStatic }).Summarizer;
  if (!S || (await S.availability()) === 'unavailable') return null;
  // One flowing past-tense paragraph that walks through the week in order ("…, then …. Mid-week … Closed the week by …").
  const s = await S.create({ type: 'tldr', format: 'plain-text', length: 'medium', sharedContext: "An intern's daily work notes for one week. Summarize them as one flowing past-tense paragraph for a university internship logbook, walking through the week in order (start of the week, mid-week, end of the week). No bullet points, no headings, and don't invent anything that isn't in the notes." });
  try {
    const out: string[] = [];
    for (const it of items) out.push(it.text.trim() ? await s.summarize(it.text, { context: `Write it for the logbook section titled "${it.label}".` }) : '');
    return out;
  } finally {
    s.destroy();
  }
}

const NEEDS_CHROME = 'AI summaries need Chrome 138+ on a desktop (free, built in). Your notes are kept as bullet points.';

async function viaServer(items: Item[]): Promise<string[]> {
  if (!SERVER_MODE) throw new Error(NEEDS_CHROME);
  return (await api<{ summaries: string[] }>('summaries', { method: 'POST', body: { items } })).data.summaries;
}

export async function summarizeFields(items: Item[]): Promise<string[]> {
  return (await onDevice(items)) ?? viaServer(items);
}
