import type { Period, Placeholder, ReviewAction } from './model';
import { addDays, formatDMY, parseISO, todayISO } from './dates';

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

/** What autofill would put in this placeholder, or null if it's never auto-filled. */
export function sourceValue(ph: Placeholder, period: Period, notes: Record<string, string>): string | null {
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
): { values: Record<string, string>; autofilled: Record<string, string> } {
  const v = { ...values };
  const a = { ...autofilled };
  for (const ph of placeholders) {
    const src = sourceValue(ph, period, notes);
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
