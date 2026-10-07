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

/** A person's private journal (supervisors, and interns whose university has no logbook). */
export interface JournalDetails { university?: string | null; programme?: string | null; position?: string | null }
/** One day; interns' days can carry their project and the AI suggestions they reviewed. */
export interface JournalEntry { date: string; text: string; projectId?: string | null; items?: Item[] }
export interface Journal extends JournalDetails { startDate: string | null; entries: JournalEntry[]; projects?: Project[] }

export type ItemKind = 'project' | 'activity' | 'learning' | 'skill';
export type ItemStatus = 'suggested' | 'accepted' | 'rejected';
export interface Item { id: string; kind: ItemKind; text: string; status: ItemStatus }
export interface Project { id: string; name: string; description: string | null }
export interface ProjectInput { name: string; description?: string | null }
/** What the AI (or the demo stand-in) found in one entry, before the intern reviews it. */
export interface Suggestions { project: string | null; activities: string[]; learning: string[]; skills: string[] }
export interface Organized { projectId: string | null; items: Item[] }
/** `newProjectName` creates the project, or reuses one with the same name ignoring case. */
export interface OrganizationInput extends Organized { newProjectName?: string }
export interface Organization extends Organized { projects: Project[] }

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
  /** Submit actions only: a copy of the answers sent (cover fields live on the student). */
  values?: Record<string, string>;
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
