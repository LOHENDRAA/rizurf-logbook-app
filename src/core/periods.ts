import type { Period, PeriodKind } from './model';
import { ISO_RE, eachDay, formatDMY, isWeekend, mondayOf, monthLabel } from './dates';

export function buildPeriods(kind: PeriodKind, start: string, end: string): Period[] {
  if (!ISO_RE.test(start) || !ISO_RE.test(end)) throw new Error('Dates must be in YYYY-MM-DD format.');
  if (end < start) throw new Error('End date must be on or after the start date.');
  const days = eachDay(start, end);

  if (kind === 'daily') {
    return days.filter(d => !isWeekend(d)).map((d, i) => ({
      key: `d:${d}`, kind, index: i + 1, start: d, end: d, label: `Day ${i + 1} · ${formatDMY(d)}`, workdays: [d],
    }));
  }

  // Map keeps insertion order, so groups come out chronologically.
  const groups = new Map<string, string[]>();
  for (const d of days) {
    const key = kind === 'weekly' ? `w:${mondayOf(d)}` : `m:${d.slice(0, 7)}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  let index = 0;
  return Array.from(groups, ([key, ds]) => {
    index += 1;
    const s = ds[0];
    const e = ds[ds.length - 1];
    const label = kind === 'weekly'
      ? `Week ${index} · ${formatDMY(s)} – ${formatDMY(e)}`
      : `Month ${index} · ${monthLabel(key.slice(2))}`;
    return { key, kind, index, start: s, end: e, label, workdays: ds.filter(d => !isWeekend(d)) };
  });
}

export function periodForDate(periods: Period[], date: string): Period | undefined {
  return periods.find(p => date >= p.start && date <= p.end);
}

/** "Week 2", "Month 2" or "Day 3": the period's name without its dates. */
export const periodName = (p: Period): string => `${p.kind === 'weekly' ? 'Week' : p.kind === 'monthly' ? 'Month' : 'Day'} ${p.index}`;
