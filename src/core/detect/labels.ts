import type { Binding } from '../model';

// Ported from v14 index.html:1416-1477 (TMPL_* constants).
export const COVER_KEYS: [RegExp, string][] = [
  [/student\s*id|matric|registration\s*no|student\s*no/i, 'studentId'],
  [/student['’]?s?\s*name|intern['’]?s?\s*name|^name$|full\s*name/i, 'studentName'],
  [/company\s*name|organi[sz]ation|employer|internship\s*site|training\s*site|host\s*company|^company$/i, 'companyName'],
  [/university|institution/i, 'university'],
  [/programme|program|course/i, 'programme'],
  [/duration|period|internship\s*period|placement\s*period/i, 'duration'],
  [/supervisor/i, 'supervisor'],
  [/position|job\s*title|\brole\b/i, 'position'],
];
export const matchCoverKey = (label: string): string | null => COVER_KEYS.find(([re]) => re.test(label))?.[1] ?? null;

/** v14's TMPL_WEEK_RE plus month rows, so monthly templates find their repeating unit too. */
export const WEEK_RE = /^week\b|week\s*no|week\s*number|^month\b|month\s*no/i;
export const WEEK_START_RE = /week\s*(beginning|starting|commencing|of\b)/i;
export const START_RE = /start\s*date|date\s*from|from\s*date|commenc/i;
export const END_RE = /end\s*date|date\s*to|to\s*date|complet/i;
export const OBJ_RE = /object|activit|task|duties|assignment/i;
export const CONTENT_RE = /content|description|reflect|learn|knowledge|experience|summary/i;
export const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday)\b/i;
export const DAYN_RE = /^day\s*(\d{1,2})\s*[:.]?\s*$/i;
export const QNUM_RE = /^(q\s*)?\d{1,2}\s*[.)]?$/i;
export const TASK_RE = /task|operation|activit|work\s*done|duties/i;
export const TOOLS_RE = /tool|equipment|platform|resource/i;
export const LESSON_RE = /lesson|learn(ed)?|takeaway|reflect/i;
export const BRACKET_ONLY_RE = /^<[^<>]{1,80}>$/;
export const SUPERVISOR_ONLY_RE = /remark|comment|signature|stamp|official\s*use|endorse/i;
export const SIGNATURE_RE = /signature|signed\s*by/i;
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export function isPlaceholderOrBlank(s: string | undefined): boolean {
  const t = (s ?? '').trim();
  return t === '' || BRACKET_ONLY_RE.test(t) || /^\[[^\]]*\]$/.test(t) || /^_{3,}$/.test(t) || /^\.{5,}$/.test(t) || /^…{2,}$/.test(t);
}

export function defaultMarkerBinding(label: string): Binding {
  if (SIGNATURE_RE.test(label)) return 'signature';
  if (/date/i.test(label)) return 'date';
  return 'free';
}
