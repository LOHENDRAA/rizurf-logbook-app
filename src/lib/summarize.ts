// Free first: Chrome's built-in on-device Summarizer (Chrome 138+ desktop) — no key, no cost, notes stay on the machine.
// Fallback for other browsers: OpenAI (gpt-4o-mini) via public/api/summarize.php — only if a key is configured on the server (billed per use).
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

async function viaServer(items: Item[]): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api/summarize.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
  } catch {
    throw new Error('AI summaries need Chrome 138+ on a desktop (free, built in). Your notes are kept as bullet points.');
  }
  const body = await res.json().catch(() => null) as { summaries?: string[]; error?: string } | null;
  if (!res.ok || !body?.summaries) throw new Error(body?.error ?? 'AI summaries need Chrome 138+ on a desktop (free, built in). Your notes are kept as bullet points.');
  return body.summaries;
}

export async function summarizeFields(items: Item[]): Promise<string[]> {
  return (await onDevice(items)) ?? viaServer(items);
}
