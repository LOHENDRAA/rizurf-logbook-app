export type Format = 'docx' | 'pdf';
export type PeriodKind = 'daily' | 'weekly' | 'monthly';
export type Binding = 'cover' | 'daily' | 'period' | 'date' | 'free' | 'signature';
export type Source = 'marker' | 'label' | 'manual';
export type DateRole = 'day' | 'start' | 'end' | 'range' | 'number';
export type PageRole = 'cover' | 'unit' | 'ignore';
export type DayMode = 'weekday' | 'nth';

/** PDF points, origin bottom-left (same space as pdf.js text and pdf-lib drawing). */
export interface PdfAnchor { kind: 'pdf'; page: number; x: number; y: number; w: number; h: number; whiteout?: boolean }
/** table = path of indices: [3] is the 4th top-level table, [3, 0] its first nested table. */
export interface DocxCellAnchor { kind: 'docx-cell'; table: number[]; row: number; col: number }
/** paragraph = index among ALL w:p in document order; start/end = char offsets in its joined run text. */
export interface DocxTextAnchor { kind: 'docx-text'; paragraph: number; start: number; end: number }
export type DocxAnchor = DocxCellAnchor | DocxTextAnchor;
export type Anchor = PdfAnchor | DocxAnchor;

export interface Placeholder {
  id: string;
  label: string;
  binding: Binding;
  dayIndex?: number;
  dayMode?: DayMode;
  dateRole?: DateRole;
  source: Source;
  region: 'cover' | 'unit';
  anchor: Anchor;
}

export interface Template {
  id: string;
  university: string;
  format: Format;
  fileName: string;
  fileBytes: ArrayBuffer;
  period: PeriodKind;
  pageRoles?: PageRole[];
  unitStartBlock?: number;
  placeholders: Placeholder[];
  updatedAt: string;
}

export type InternMode = 'logbook' | 'journal';
export interface Supervisor { name: string; email: string }

export interface Student {
  id: string;
  name: string;
  templateId?: string;
  startDate?: string;
  endDate?: string;
  coverValues: Record<string, string>;
  /** Logbook or journal; unset before the intern chooses (older records: inferred, see useJournal().mode). */
  mode?: InternMode;
  position?: string;
  programme?: string;
  /** Server mode only, from the intern's own profile. */
  email?: string;
  company?: string;
  timeZone?: string;
  supervisors?: Supervisor[];
}

export interface NotepadEntry { studentId: string; date: string; text: string; updatedAt: string }
/** A person's private journal (supervisors, and interns whose university has no logbook). */
export interface JournalDetails { university?: string | null; programme?: string | null; position?: string | null }
export interface Journal extends JournalDetails { startDate: string | null; entries: { date: string; text: string }[] }

export type PeriodStatus = 'draft' | 'submitted' | 'changes_requested' | 'approved';

export interface PeriodFill {
  studentId: string;
  periodKey: string;
  templateId: string;
  values: Record<string, string>;
  autofilled: Record<string, string>;
  status: PeriodStatus;
  submittedAt?: string;
}

export interface ReviewAction {
  id: string;
  studentId: string;
  periodKey: string;
  action: 'submit' | 'approve' | 'request_changes';
  by: string;
  signature?: string;
  comment?: string;
  at: string;
}

/** One reviewable period, already trimmed to the internship dates. */
export interface Period {
  key: string;          // 'd:2026-09-24' | 'w:2026-09-21' (Monday) | 'm:2026-09'
  kind: PeriodKind;
  index: number;        // 1-based
  start: string;
  end: string;
  label: string;
  workdays: string[];   // Mon–Fri dates inside [start, end]
}
