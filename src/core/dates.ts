export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar dates are handled in UTC so day arithmetic never trips over DST. */
export const parseISO = (s: string): Date => new Date(`${s}T00:00:00Z`);
export const toISO = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export const weekday = (s: string): number => parseISO(s).getUTCDay();
export const isWeekend = (s: string): boolean => { const w = weekday(s); return w === 0 || w === 6; };
export const mondayOf = (s: string): string => addDays(s, -((weekday(s) + 6) % 7));

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const formatDMY = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The user's local calendar date. toISOString() would give the UTC date, which is yesterday in Malaysia before 08:00. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
