import type { Project } from './model';
import { acceptedRows, shortDate, skillStats, type Org } from './records';
import { searchEntries } from './journal';

export interface Hit { text: string; meta: string; to: string }
export interface Group { name: 'Journal' | 'Projects' | 'Learning' | 'Skills' | 'Reflections'; hits: Hit[] }
export interface SearchData { entries: Record<string, string>; org: Org; projects: Project[]; reflections: Record<string, string> }

/** Plain substring search, ignoring case; interns search all their records, supervisors only their journal. */
export function searchAll(query: string, data: SearchData, intern: boolean): Group[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  const names = new Map(data.projects.map(p => [p.id, p.name]));
  const groups: Group[] = [
    { name: 'Journal', hits: searchEntries(data.entries, q).map(e => ({ text: e.text, meta: shortDate(e.date), to: `/journal/${e.date}` })) },
  ];
  if (intern) {
    groups.push(
      { name: 'Projects', hits: data.projects.filter(p => has(p.name) || has(p.description))
        .map(p => ({ text: p.description ? `${p.name} — ${p.description}` : p.name, meta: '', to: `/projects/${p.id}` })) },
      { name: 'Learning', hits: acceptedRows(data.org).filter(r => r.kind === 'learning' && has(r.text))
        .map(r => ({ text: r.text, meta: [shortDate(r.date), r.projectId ? names.get(r.projectId) : ''].filter(Boolean).join(' · '), to: '/learning' })) },
      { name: 'Skills', hits: skillStats(data.org).filter(s => has(s.name))
        .map(s => ({ text: s.name, meta: '', to: `/skills/${encodeURIComponent(s.key)}` })) },
      { name: 'Reflections', hits: Object.entries(data.reflections).filter(([, t]) => has(t)).sort(([a], [b]) => b.localeCompare(a))
        .map(([w, t]) => ({ text: t, meta: `Week of ${shortDate(w)}`, to: `/reflection/${w}` })) },
    );
  }
  return groups.filter(g => g.hits.length);
}

/** About `width` characters around the first match, with "…" where the text is cut. */
export function excerpt(text: string, query: string, width = 120): { before: string; match: string; after: string } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const q = query.trim();
  const i = q ? flat.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return { before: flat.length > width ? `${flat.slice(0, width)}…` : flat, match: '', after: '' };
  const room = Math.max(0, width - q.length);
  const to = Math.min(flat.length, Math.max(0, i - Math.floor(room / 2)) + q.length + room);
  const from = Math.max(0, to - q.length - room);
  return {
    before: `${from > 0 ? '…' : ''}${flat.slice(from, i)}`,
    match: flat.slice(i, i + q.length),
    after: `${flat.slice(i + q.length, to)}${to < flat.length ? '…' : ''}`,
  };
}
