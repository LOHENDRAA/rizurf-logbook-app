import type { Item, ItemKind, Project, Suggestions } from './model';
import { newId } from './ids';

/** The most items one entry keeps (the server refuses more). */
export const MAX_ITEMS = 40;

/** Names and texts compare trimmed and ignoring case. */
export const nameKey = (s: string): string => s.trim().toLowerCase();

/** Organizing again: waiting suggestions are replaced, accepted ones stay, and nothing accepted or rejected comes back. */
export function mergeSuggestions(items: Item[], fresh: Suggestions): Item[] {
  const out = items.filter(i => i.status !== 'suggested');
  const seen = new Set(out.map(i => `${i.kind}|${nameKey(i.text)}`));
  const add = (kind: ItemKind, text: string) => {
    const k = `${kind}|${nameKey(text)}`;
    if (!text.trim() || seen.has(k)) return;
    seen.add(k);
    out.push({ id: newId('item'), kind, text: text.trim(), status: 'suggested' });
  };
  if (fresh.project) add('project', fresh.project);
  for (const t of fresh.activities) add('activity', t);
  for (const t of fresh.learning) add('learning', t);
  for (const t of fresh.skills) add('skill', t);
  return cap(out);
}

/** Keeps an entry within MAX_ITEMS. Rejected items only exist to stop repeats, so the oldest make room first. */
function cap(items: Item[]): Item[] {
  const out = [...items];
  while (out.length > MAX_ITEMS) {
    const i = out.findIndex(x => x.status === 'rejected');
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out.slice(0, MAX_ITEMS);
}

/** Accept (with edited text, if any) or reject one suggestion. Only one project is accepted at a time. */
export function reviewItem(items: Item[], id: string, action: 'accept' | 'reject', text?: string): Item[] {
  const target = items.find(i => i.id === id);
  if (!target) return items;
  const accept = action === 'accept';
  const edited = accept && text?.trim() && text.trim() !== target.text ? text.trim() : null;
  const out = items
    .filter(i => !(accept && target.kind === 'project' && i.kind === 'project' && i.status === 'accepted' && i.id !== id))
    .map(i => (i.id !== id ? i : { ...i, status: accept ? 'accepted' as const : 'rejected' as const, text: edited ?? i.text }));
  // The original wording counts as reviewed too, so organizing again doesn't suggest it a second time.
  return edited ? cap([...out, { id: newId('item'), kind: target.kind, text: target.text, status: 'rejected' }]) : out;
}

/** The browser demo's organizer, no AI: each sentence becomes an activity; the project is the one used most recently. */
export function standIn(text: string, projects: Project[], org: Record<string, { projectId: string | null }>): Suggestions {
  const activities = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim().replace(/[.!?]+$/, '')).filter(Boolean).slice(0, 4);
  const recent = Object.entries(org).filter(([, o]) => o.projectId).sort(([a], [b]) => b.localeCompare(a))[0]?.[1].projectId;
  const project = projects.find(p => p.id === recent) ?? projects[0];
  return { project: project?.name ?? null, activities, learning: [], skills: [] };
}
