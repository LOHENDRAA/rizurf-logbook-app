// Free first: Chrome's built-in on-device Summarizer (Chrome 138+ desktop) — no key, no cost, notes stay on the machine.
// Otherwise, in server mode: POST /api/v1/summaries, where the server's OpenAI key (gpt-4o-mini) does it, up to 20 a day per person.
// With neither, or when the AI answers with a chatty list instead of a paragraph, the notes are written up as plain sentences.
import { api, ApiError, SERVER_MODE } from '../data/api';
interface SummarizerInstance { summarize(text: string, opts?: { context?: string }): Promise<string>; destroy(): void }
interface SummarizerStatic {
  availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts: { type: 'tldr'; format: 'plain-text'; length: 'short' | 'medium' | 'long'; sharedContext?: string }): Promise<SummarizerInstance>;
}
type Item = { label: string; text: string };

/** The notepad's "• Mon 28/09/2026: Fixed X" lines as one first-person paragraph: "This week I fixed X. I then …. I also …". */
export function plainEssay(text: string): string {
  return text.split('\n').map(l => l.replace(/^•\s*\w{3}\s+\S+:\s*|^[-•*]\s*/, '').trim()).filter(Boolean).map((note, i) => {
    let body = note.replace(/^I\s+/, '');
    if (!/[.!?]$/.test(body)) body += '.';
    // "Fixed the bug" → "fixed the bug", but "ERP docs" keeps its capitals.
    if (/^[A-Z][a-z]/.test(body)) body = body[0].toLowerCase() + body.slice(1);
    return `${i === 0 ? 'This week I' : i === 1 ? 'I then' : 'I also'} ${body}`;
  }).join(' ');
}

/** A reply that's one or two plain paragraphs, not "Okay, here's a breakdown:" with bold headings and bullets. */
function isPlainParagraph(s: string): boolean {
  return !!s.trim() && !/\*\*|^\s*([-*•#]|\d+[.)])\s/m.test(s) && !/^\s*(okay|ok|sure|certainly|here('|’)s)\b/i.test(s) && s.trim().split(/\n\s*\n/).length <= 2;
}

async function onDevice(items: Item[], essays: string[]): Promise<string[] | null> {
  const S = (globalThis as unknown as { Summarizer?: SummarizerStatic }).Summarizer;
  if (!S || (await S.availability()) === 'unavailable') return null;
  // Modelled on a real APU logbook entry: "This week I began … I then … Technically, I improved … relevant to a future career in …".
  const s = await S.create({ type: 'tldr', format: 'plain-text', length: 'long', sharedContext: "What an intern did this week, for their university internship logbook. Rewrite it as one paragraph in the first person and past tense, starting \"This week I\", in the order things happened. If the section asks about skills or career, end with the technical and non-technical skills this work built and how it relates to their future career. Plain sentences only: no headings, lists, bold or commentary, and never invent tasks, tools or results." });
  try {
    const out: string[] = [];
    for (const [i, e] of essays.entries()) {
      const reply = e ? await s.summarize(e, { context: `The logbook section asks: "${items[i].label}"` }) : '';
      out.push(isPlainParagraph(reply) ? reply.trim() : e);
    }
    return out;
  } finally {
    s.destroy();
  }
}

async function viaServer(items: Item[], essays: string[]): Promise<string[]> {
  if (!SERVER_MODE) return essays;
  try {
    const { summaries } = (await api<{ summaries: string[] }>('summaries', { method: 'POST', body: { items } })).data;
    return summaries.map((s, i) => (isPlainParagraph(s) ? s.trim() : essays[i]));
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) return essays; // no AI key on this server, or OpenAI didn't answer
    throw e;
  }
}

export async function summarizeFields(items: Item[]): Promise<string[]> {
  const essays = items.map(it => plainEssay(it.text));
  return (await onDevice(items, essays)) ?? viaServer(items, essays);
}
