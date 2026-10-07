import type { Period, Placeholder, ReviewAction } from './model';
import { addDays, formatDMY, parseISO, todayISO } from './dates';
import type { Org } from './records';
import { nameKey } from './organize';

/** Cover fields are filled once per student (Student.coverValues), not per period. */
export const isCoverField = (ph: Placeholder): boolean => ph.region === 'cover' || ph.binding === 'cover';

/** The calendar day a per-day placeholder stands for in this period, or null if none. */
export function dayDate(ph: Placeholder, period: Period): string | null {
  const n = ph.dayIndex ?? 0;
  if (ph.dayMode === 'weekday' && period.kind === 'weekly') {
    const d = addDays(period.key.slice(2), n); // key is 'w:<Monday>'
    return d >= period.start && d <= period.end ? d : null;
  }
  return period.workdays[n] ?? null;
}

/** A weekly answer box asks about learning when its label says so; every other weekly box gets activities. */
export const boxKind = (ph: Placeholder): 'activity' | 'learning' => (/learn|knowledge|skill|lesson/i.test(ph.label) ? 'learning' : 'activity');

/** The week's accepted items on its workdays, in date order; skills once each (ignoring case, first spelling kept). */
function weekItems(period: Period, org: Org) {
  const accepted = period.workdays.flatMap(d => (org[d]?.items ?? []).filter(i => i.status === 'accepted'));
  const texts = (kind: string) => accepted.filter(i => i.kind === kind).map(i => i.text.trim()).filter(Boolean);
  const skills: string[] = [];
  for (const s of texts('skill')) if (!skills.some(x => nameKey(x) === nameKey(s))) skills.push(s);
  return { activities: texts('activity'), learning: texts('learning'), skills };
}

/** The weekly box's text from accepted items, or null when the week has none of the kind it needs. */
function fromItems(ph: Placeholder, period: Period, org: Org): string | null {
  const w = weekItems(period, org);
  if (boxKind(ph) === 'activity') return w.activities.length ? w.activities.map(t => `• ${t}`).join('\n') : null;
  if (!w.learning.length && !w.skills.length) return null;
  return [...w.learning.map(t => `• ${t}`), ...(w.skills.length ? [`Skills: ${w.skills.join(', ')}`] : [])].join('\n');
}

export type BoxSource = { from: 'activity' | 'learning' | 'journal'; count: number };

/** Where a day or weekly box's autofilled text comes from (for its tag); null for boxes that aren't filled from records. */
export function boxSource(ph: Placeholder, period: Period, org: Org): BoxSource | null {
  if (isCoverField(ph)) return null;
  if (ph.binding === 'daily') return { from: 'journal', count: 0 };
  if (ph.binding !== 'period') return null;
  if (fromItems(ph, period, org) == null) return { from: 'journal', count: 0 };
  const w = weekItems(period, org);
  return boxKind(ph) === 'activity' ? { from: 'activity', count: w.activities.length } : { from: 'learning', count: w.learning.length };
}

/** The Logbook list's sources for one week. */
export function weekSources(period: Period, notes: Record<string, string>, org: Org): { days: number; activities: number; learning: number } {
  const w = weekItems(period, org);
  return { days: period.workdays.filter(d => notes[d]?.trim()).length, activities: w.activities.length, learning: w.learning.length };
}

/** What autofill would put in this placeholder, or null if it's never auto-filled. With `org`, weekly boxes prefer accepted items. */
export function sourceValue(ph: Placeholder, period: Period, notes: Record<string, string>, org?: Org): string | null {
  if (isCoverField(ph) || ph.binding === 'signature') return null;
  if (ph.binding === 'daily') {
    const d = dayDate(ph, period);
    return d ? (notes[d] ?? '') : '';
  }
  if (ph.binding === 'date') {
    const role = ph.dateRole ?? (ph.dayIndex != null ? 'day' : 'range');
    if (role === 'day') { const d = dayDate(ph, period); return d ? formatDMY(d) : ''; }
    if (role === 'start') return formatDMY(period.start);
    if (role === 'end') return formatDMY(period.end);
    if (role === 'number') return String(period.index);
    return `${formatDMY(period.start)} – ${formatDMY(period.end)}`;
  }
  if (ph.binding === 'period') {
    const items = org ? fromItems(ph, period, org) : null;
    if (items != null) return items;
    // Weekly answer boxes (e.g. APU's): the whole period's notes as bullet points, one per day.
    return period.workdays
      .filter(d => notes[d]?.trim())
      .map(d => `• ${parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${formatDMY(d)}: ${notes[d].trim()}`)
      .join('\n');
  }
  return null;
}

/**
 * Fills a placeholder only when it's empty or still holds exactly what the
 * last autofill put there, so the student's own edits always survive.
 */
export function autofill(
  placeholders: Placeholder[],
  period: Period,
  notes: Record<string, string>,
  values: Record<string, string>,
  autofilled: Record<string, string>,
  org?: Org,
): { values: Record<string, string>; autofilled: Record<string, string> } {
  const v = { ...values };
  const a = { ...autofilled };
  for (const ph of placeholders) {
    const src = sourceValue(ph, period, notes, org);
    if (src == null) continue;
    const cur = v[ph.id] ?? '';
    if (cur !== '' && cur !== (a[ph.id] ?? '')) continue;
    if (src === '' && cur === '') continue;
    v[ph.id] = src;
    a[ph.id] = src;
  }
  return { values: v, autofilled: a };
}

/** The supervisor's signed name is written in a script font (dates stay in the template's font). */
export const SIGNATURE_FONT = 'Vladimir Script';
export const usesSignatureFont = (ph: Placeholder): boolean => ph.binding === 'signature' && !/date|name/i.test(ph.label);

export function signatureValue(ph: Placeholder, approval?: ReviewAction): string {
  if (!approval) return '';
  return /date/i.test(ph.label) ? formatDMY(todayISO(new Date(approval.at))) : (approval.signature ?? '');
}

export function resolveValues(
  placeholders: Placeholder[],
  coverValues: Record<string, string>,
  fillValues: Record<string, string>,
  approval?: ReviewAction,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ph of placeholders) {
    if (ph.binding === 'signature') out[ph.id] = signatureValue(ph, approval);
    else if (isCoverField(ph)) out[ph.id] = coverValues[ph.id] ?? '';
    else out[ph.id] = fillValues[ph.id] ?? '';
  }
  return out;
}

/**
 * The tag for a day or weekly box that still holds what autofill put there: the records it came from, "From journal",
 * or "Filled earlier" when today's records would fill it differently. Null once the intern has changed it.
 */
export function sourceTag(
  ph: Placeholder, period: Period, notes: Record<string, string>, org: Org,
  values: Record<string, string>, autofilled: Record<string, string>,
): string | null {
  const filled = autofilled[ph.id];
  if (isCoverField(ph) || (ph.binding !== 'daily' && ph.binding !== 'period') || !filled || (values[ph.id] ?? '') !== filled) return null;
  if (filled === sourceValue(ph, period, notes, org)) {
    const s = boxSource(ph, period, org);
    if (s?.from === 'activity') return `From ${s.count} accepted activit${s.count === 1 ? 'y' : 'ies'}`;
    if (s?.from === 'learning') return s.count ? `From ${s.count} learning point${s.count === 1 ? '' : 's'}` : 'From accepted skills';
    return 'From journal';
  }
  return filled === sourceValue(ph, period, notes) ? 'From journal' : 'Filled earlier';
}
