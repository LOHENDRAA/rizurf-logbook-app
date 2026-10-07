import type { Organized, Project } from './model';
import { nameKey } from './organize';
import { parseISO } from './dates';

/** Each day's reviewed suggestions, by date. */
export type Org = Record<string, Organized>;
export interface Row { date: string; kind: 'activity' | 'learning' | 'skill'; text: string; projectId: string | null }

const newestFirst = (org: Org) => Object.entries(org).sort(([a], [b]) => b.localeCompare(a));

/** Every accepted activity, learning point and skill, newest day first. */
export function acceptedRows(org: Org): Row[] {
  return newestFirst(org).flatMap(([date, o]) => o.items
    .filter(i => i.status === 'accepted' && i.kind !== 'project')
    .map(i => ({ date, kind: i.kind as Row['kind'], text: i.text, projectId: o.projectId })));
}

export interface ProjectStats { project: Project; activities: number; learning: number; skills: number; last: string | null }

/** Newest accepted activity first; projects without one go last, by name. */
export function projectStats(projects: Project[], org: Org): ProjectStats[] {
  const rows = acceptedRows(org);
  return projects.map(project => {
    const mine = rows.filter(r => r.projectId === project.id);
    const activities = mine.filter(r => r.kind === 'activity');
    return {
      project,
      activities: activities.length,
      learning: mine.filter(r => r.kind === 'learning').length,
      skills: new Set(mine.filter(r => r.kind === 'skill').map(r => nameKey(r.text))).size,
      last: activities[0]?.date ?? null,
    };
  }).sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '') || a.project.name.localeCompare(b.project.name));
}

export interface SkillStats { key: string; name: string; projectIds: string[]; activities: number; learning: number; first: string; dates: string[] }

/** Skills merged by name ignoring case (newest spelling shown); counts come from the accepted items of the same entries. */
export function skillStats(org: Org): SkillStats[] {
  const map = new Map<string, SkillStats>();
  for (const [date, o] of newestFirst(org)) {
    const accepted = o.items.filter(i => i.status === 'accepted');
    const skills = new Map(accepted.filter(i => i.kind === 'skill').map(i => [nameKey(i.text), i.text.trim()]));
    for (const [key, name] of skills) {
      const s = map.get(key) ?? { key, name, projectIds: [], activities: 0, learning: 0, first: date, dates: [] };
      if (o.projectId && !s.projectIds.includes(o.projectId)) s.projectIds.push(o.projectId);
      s.activities += accepted.filter(i => i.kind === 'activity').length;
      s.learning += accepted.filter(i => i.kind === 'learning').length;
      s.first = date; // walking newest to oldest, so the last day seen is the first
      s.dates.push(date);
      map.set(key, s);
    }
  }
  return [...map.values()].sort((a, b) => b.dates.length - a.dates.length || a.name.localeCompare(b.name));
}

/** Accepted learning points; `filter` is 'all', 'none' (no project) or a project id. */
export function learningRows(org: Org, filter: string): Row[] {
  return acceptedRows(org).filter(r => r.kind === 'learning'
    && (filter === 'all' || (filter === 'none' ? !r.projectId : r.projectId === filter)));
}

export const shortDate = (iso: string): string =>
  parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
