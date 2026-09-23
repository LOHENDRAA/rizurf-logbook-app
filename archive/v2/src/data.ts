import type { AppData, DocumentDefinition, DocumentRecord, InternRecord, PartId, User } from './types'
import { SAMPLE_SUPERVISOR_SIGNATURE, SAMPLE_SUPERVISOR_STAMP, SAMPLE_SUPERVISOR_USER_ID } from './lib/sampleSignature'

/**
 * Central autofill configuration.
 *
 * This module is the single source of truth for every auto-filled value:
 * where each field comes from (`source`) and how it behaves (`mode`).
 *
 * - `locked`: canonical value, overwritten by autofill/hydrate, stripped in
 *   `updateFields`, rendered `readOnly` (hidden or disabled in the editor).
 * - `editable-default`: prefilled once via fill-missing only; user corrections
 *   (including an explicit empty string) are never overwritten. Used only for
 *   the p2-attendance Monday–Friday date cells.
 *
 * This module is deliberately pure: it imports only types (erased at compile
 * time) plus the static demo signature asset. It must NEVER import from
 * `lib/autofill.ts` (or any `lib/*` application logic) so no import cycle
 * can form — `lib/autofill.ts` imports its config from here, not vice versa.
 */

export const GLOBAL_COMPANY_ADDRESS =
  'First Floor, 28-1, Jln 1/116B, Sri Desa Entrepreneur Park, 58200 Kuala Lumpur, Federal Territory of Kuala Lumpur'

export type AutofillMode = 'locked' | 'editable-default'

export type AutofillSource =
  | 'user.name'
  | 'record.studentId'
  | 'record.intake'
  | 'record.company'
  | 'record.title'
  | 'record.department'
  | 'record.identityNumber'
  | 'record.contactNumber'
  | 'record.startDate'
  | 'record.endDate'
  | 'supervisor.name'
  | 'global.companyAddress'
  | 'calculated.logbookStartDate'
  | 'calculated.logbookEndDate'
  | 'calculated.attendanceDate'

export interface AutofillFieldSpec {
  source: AutofillSource
  mode: AutofillMode
}

/**
 * Field-level source + mode map. Manual-only keys (mentorName, activities,
 * reflection, workplace/time rows, ratings, uploads, signatures, …) are
 * intentionally absent: autofill never touches them.
 */
export const AUTOFILL_FIELDS: Record<string, Record<string, AutofillFieldSpec>> = {
  'p1-cover': {
    studentName: { source: 'user.name', mode: 'locked' },
    studentId: { source: 'record.studentId', mode: 'locked' },
    intake: { source: 'record.intake', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    companyAddress: { source: 'global.companyAddress', mode: 'locked' },
    startDate: { source: 'record.startDate', mode: 'locked' },
    endDate: { source: 'record.endDate', mode: 'locked' },
  },
  'p2-cover': {
    studentName: { source: 'user.name', mode: 'locked' },
    studentId: { source: 'record.studentId', mode: 'locked' },
    intake: { source: 'record.intake', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    companyAddress: { source: 'global.companyAddress', mode: 'locked' },
    startDate: { source: 'record.startDate', mode: 'locked' },
    endDate: { source: 'record.endDate', mode: 'locked' },
  },
  'p2-clearance': {
    studentName: { source: 'user.name', mode: 'locked' },
    department: { source: 'record.department', mode: 'locked' },
    studentId: { source: 'record.studentId', mode: 'locked' },
    intake: { source: 'record.intake', mode: 'locked' },
    identityNumber: { source: 'record.identityNumber', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    supervisorName: { source: 'supervisor.name', mode: 'locked' },
    contactNumber: { source: 'record.contactNumber', mode: 'locked' },
  },
  'p1-logbook': {
    studentName: { source: 'user.name', mode: 'locked' },
    studentId: { source: 'record.studentId', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    startDate: { source: 'calculated.logbookStartDate', mode: 'locked' },
    endDate: { source: 'calculated.logbookEndDate', mode: 'locked' },
  },
  'p2-logbook': {
    studentName: { source: 'user.name', mode: 'locked' },
    studentId: { source: 'record.studentId', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    startDate: { source: 'calculated.logbookStartDate', mode: 'locked' },
    endDate: { source: 'calculated.logbookEndDate', mode: 'locked' },
  },
  'p2-attendance': {
    supervisorName: { source: 'supervisor.name', mode: 'locked' },
    studentName: { source: 'user.name', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    studentId: { source: 'record.studentId', mode: 'locked' },
    companyAddress: { source: 'global.companyAddress', mode: 'locked' },
    identityNumber: { source: 'record.identityNumber', mode: 'locked' },
    mondayDate: { source: 'calculated.attendanceDate', mode: 'editable-default' },
    tuesdayDate: { source: 'calculated.attendanceDate', mode: 'editable-default' },
    wednesdayDate: { source: 'calculated.attendanceDate', mode: 'editable-default' },
    thursdayDate: { source: 'calculated.attendanceDate', mode: 'editable-default' },
    fridayDate: { source: 'calculated.attendanceDate', mode: 'editable-default' },
  },
  'p2-assessment': {
    studentName: { source: 'user.name', mode: 'locked' },
    awardTitle: { source: 'record.title', mode: 'locked' },
    companyName: { source: 'record.company', mode: 'locked' },
    supervisorName: { source: 'supervisor.name', mode: 'locked' },
    startDate: { source: 'record.startDate', mode: 'locked' },
    endDate: { source: 'record.endDate', mode: 'locked' },
  },
}

/** Locked keys per document, derived from AUTOFILL_FIELDS (mode === 'locked'). */
export const LOCKED_KEYS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(AUTOFILL_FIELDS).map(([documentId, fields]) => [
    documentId,
    Object.entries(fields)
      .filter(([, spec]) => spec.mode === 'locked')
      .map(([key]) => key),
  ]),
)

/** Editable-default keys per document (mode === 'editable-default'). */
export const EDITABLE_DEFAULT_KEYS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(AUTOFILL_FIELDS).map(([documentId, fields]) => [
    documentId,
    Object.entries(fields)
      .filter(([, spec]) => spec.mode === 'editable-default')
      .map(([key]) => key),
  ]),
)

/** Backwards-compatible aliases for the cover locked-key lists. */
export const P1_COVER_LOCKED_KEYS = LOCKED_KEYS['p1-cover']
export const P2_COVER_LOCKED_KEYS = LOCKED_KEYS['p2-cover']

/** p2-attendance weekday date cells: prefilled defaults the user may correct. */
export const ATTENDANCE_DATE_KEYS = EDITABLE_DEFAULT_KEYS['p2-attendance'] as readonly string[]

/* ------------------------------------------------------------------ */
/* Pure date helpers (UTC, timezone-safe)                              */
/* ------------------------------------------------------------------ */

function isoDateOnly(value: string) {
  return value.slice(0, 10)
}

export function addDaysUtc(value: string, days: number) {
  const [year, month, day] = isoDateOnly(value).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function capAtEndDate(value: string, endDate: string) {
  const iso = isoDateOnly(value)
  const cap = isoDateOnly(endDate)
  return cap && iso > cap ? cap : iso
}

/** Calculated logbook week dates for a section (part 2 starts at week 09). */
export function weeklyDateDefaults(definition: DocumentDefinition, sectionIndex: number, record: InternRecord): Record<string, string> {
  if (definition.kind !== 'logbook') return {}
  const offset = (definition.part === 'part2' ? 8 * 7 : 0) + sectionIndex * 7
  const startDate = addDaysUtc(record.startDate, offset)
  const endDate = capAtEndDate(addDaysUtc(startDate, 6), record.endDate)
  return { startDate, endDate }
}

/**
 * Prefilled Monday–Friday dates for one attendance week section.
 * Week `sectionIndex` spans 7 days from the placement start; each cell past
 * the placement end date caps at the end date.
 */
export function attendanceDateDefaults(sectionIndex: number, record: InternRecord): Record<string, string> {
  const days: Array<[string, number]> = [
    ['mondayDate', 0],
    ['tuesdayDate', 1],
    ['wednesdayDate', 2],
    ['thursdayDate', 3],
    ['fridayDate', 4],
  ]
  return Object.fromEntries(
    days.map(([key, dayOffset]) => [key, capAtEndDate(addDaysUtc(record.startDate, sectionIndex * 7 + dayOffset), record.endDate)]),
  )
}

/* ------------------------------------------------------------------ */
/* Canonical field builders                                            */
/* ------------------------------------------------------------------ */

export function canonicalP1CoverFields(record: InternRecord, user: User) {
  return {
    studentName: user.name,
    studentId: record.studentId,
    intake: record.intake,
    companyName: record.company,
    companyAddress: GLOBAL_COMPANY_ADDRESS,
    startDate: record.startDate,
    endDate: record.endDate,
  }
}

export function canonicalP2CoverFields(record: InternRecord, user: User) {
  return {
    studentName: user.name,
    studentId: record.studentId,
    intake: record.intake,
    companyName: record.company,
    companyAddress: GLOBAL_COMPANY_ADDRESS,
    startDate: record.startDate,
    endDate: record.endDate,
  }
}

export function canonicalClearanceFields(record: InternRecord, user: User, supervisor?: User) {
  return {
    studentName: user.name,
    department: record.department,
    studentId: record.studentId,
    intake: record.intake,
    identityNumber: record.identityNumber,
    companyName: record.company,
    supervisorName: supervisor?.name,
    contactNumber: record.contactNumber,
  }
}

export function logbookLockedFields(definition: DocumentDefinition, sectionIndex: number, record: InternRecord, user: User) {
  return {
    studentName: user.name,
    studentId: record.studentId,
    companyName: record.company,
    ...weeklyDateDefaults(definition, sectionIndex, record),
  }
}

export function attendanceLockedFields(record: InternRecord, user: User, supervisor?: User) {
  return {
    supervisorName: supervisor?.name,
    studentName: user.name,
    companyName: record.company,
    studentId: record.studentId,
    companyAddress: GLOBAL_COMPANY_ADDRESS,
    identityNumber: record.identityNumber,
  }
}

export function assessmentLockedFields(record: InternRecord, user: User, supervisor?: User) {
  return {
    studentName: user.name,
    awardTitle: record.title,
    companyName: record.company,
    supervisorName: supervisor?.name,
    startDate: record.startDate,
    endDate: record.endDate,
  }
}

/* ------------------------------------------------------------------ */
/* Per-intern placement extras (fictional demo values)                 */
/* ------------------------------------------------------------------ */

export interface PlacementExtras {
  department: string
  identityNumber: string
  contactNumber: string
}

/** Clearly fictional Malaysian-style demo values — never real personal data. */
export const PLACEMENT_EXTRAS: Record<string, PlacementExtras> = {
  'intern-1': { department: 'Software Engineering', identityNumber: '030514-14-4821', contactNumber: '+60 12-345 6789' },
  'intern-2': { department: 'Interactive Media', identityNumber: '020811-10-5734', contactNumber: '+60 17-289 4315' },
  'intern-3': { department: 'Cloud Engineering', identityNumber: '040902-08-9176', contactNumber: '+60 19-774 2058' },
}

const FALLBACK_EXTRAS: PlacementExtras = { department: 'Software Engineering', identityNumber: '010101-10-0001', contactNumber: '+60 10-000 0000' }

export function placementExtrasFor(internId: string): PlacementExtras {
  return PLACEMENT_EXTRAS[internId] ?? FALLBACK_EXTRAS
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const DOCUMENTS: DocumentDefinition[] = [
  {
    id: 'p1-cover', part: 'part1', order: 1, title: 'Part 1 Cover', shortTitle: 'Cover', kind: 'form', owner: 'intern', reviewRequired: false,
    description: 'Student and placement details for your Part 1 submission.',
    guideline: 'Placement details are filled automatically and hidden here — they appear in the preview and official PDF. Enter your academic mentor (saves automatically). Your saved student signature is applied to the official cover automatically whenever available.',
    sections: ['Cover details'],
    fields: [
      { key: 'studentName', label: 'Student name', readOnly: true }, { key: 'studentId', label: 'Student ID', readOnly: true },
      { key: 'intake', label: 'Intake', readOnly: true }, { key: 'companyName', label: 'Company name', readOnly: true },
      { key: 'companyAddress', label: 'Company address', type: 'textarea', readOnly: true }, { key: 'mentorName', label: 'Academic mentor' },
      { key: 'startDate', label: 'Internship start', type: 'date', readOnly: true }, { key: 'endDate', label: 'Internship end', type: 'date', readOnly: true },
    ],
  },
  {
    id: 'p1-logbook', part: 'part1', order: 2, title: 'Logbook Week 01–08', shortTitle: 'Weekly logbook', kind: 'logbook', owner: 'intern', reviewRequired: true,
    description: 'Eight weekly records of objectives, activities, learning, and career reflection.',
    guideline: 'Describe technical and non-technical work, skills gained, and how each week relates to your career. Your identity and week dates are filled automatically and locked.',
    sections: Array.from({ length: 8 }, (_, i) => `Week ${String(i + 1).padStart(2, '0')}`),
  },
  {
    id: 'p1-cover-letter', part: 'part1', order: 3, title: 'Cover Letter', shortTitle: 'Cover letter', kind: 'upload', owner: 'intern', reviewRequired: false,
    description: 'The cover letter previously submitted to the university.', guideline: 'Upload your completed cover letter as PDF, Word, or image files.', sections: ['Cover letter'],
  },
  {
    id: 'p1-cv', part: 'part1', order: 4, title: 'Curriculum Vitae', shortTitle: 'CV', kind: 'upload', owner: 'intern', reviewRequired: false,
    description: 'Your previously submitted curriculum vitae.', guideline: 'Upload the final CV used for your internship application.', sections: ['CV'],
  },
  {
    id: 'p1-project-log', part: 'part1', order: 5, title: 'Project Log Sheet', shortTitle: 'Project log', kind: 'upload', owner: 'intern', reviewRequired: false,
    description: 'Academic supervisory meeting record completed with your mentor.', guideline: 'Upload the completed mentor log. The prototype does not verify the mentor signature.', sections: ['Project log sheet'],
  },
  {
    id: 'p1-week-email', part: 'part1', order: 6, title: 'Week 1 Email', shortTitle: 'Week 1 email', kind: 'upload', owner: 'intern', reviewRequired: false,
    description: 'Evidence of your first-week email to the academic mentor.', guideline: 'Upload an exported PDF, image, or Word copy of the sent email.', sections: ['Week 1 email'],
  },
  {
    id: 'p2-cover', part: 'part2', order: 1, title: 'Part 2 Cover', shortTitle: 'Cover', kind: 'form', owner: 'intern', reviewRequired: false,
    description: 'Student and placement details for your Part 2 submission.', guideline: 'Placement details are filled automatically and hidden here — they appear in the preview and official PDF. Enter your academic mentor (saves automatically). Your saved student signature is applied to the official cover automatically whenever available.', sections: ['Cover details'],
    fields: [
      { key: 'studentName', label: 'Student name', readOnly: true }, { key: 'studentId', label: 'Student ID', readOnly: true },
      { key: 'intake', label: 'Intake', readOnly: true }, { key: 'companyName', label: 'Company name', readOnly: true },
      { key: 'companyAddress', label: 'Company address', type: 'textarea', readOnly: true }, { key: 'mentorName', label: 'Academic mentor' },
      { key: 'startDate', label: 'Internship start', type: 'date', readOnly: true }, { key: 'endDate', label: 'Internship end', type: 'date', readOnly: true },
    ],
  },
  {
    id: 'p2-report', part: 'part2', order: 2, title: 'Industrial Placement Report', shortTitle: 'Placement report', kind: 'upload', owner: 'intern', reviewRequired: false,
    description: 'Approximately 3,000 words reflecting on the company and your employability development.', guideline: 'Include the official cover, acknowledgements, contents, company analysis, future plans, conclusions, and references.', sections: ['Industrial Placement Report'],
  },
  {
    id: 'p2-clearance', part: 'part2', order: 3, title: 'Report Clearance Form', shortTitle: 'Report clearance', kind: 'form', owner: 'intern', reviewRequired: true,
    description: 'Company clearance confirming the placement report may be submitted.', guideline: 'Clearance details are filled automatically and hidden here — they appear in the preview and official PDF. Supervisor approval applies the stored signature and stamp.', sections: ['Clearance details'],
    fields: [
      { key: 'studentName', label: 'Student name', readOnly: true }, { key: 'department', label: 'Department', readOnly: true },
      { key: 'studentId', label: 'Student ID', readOnly: true }, { key: 'intake', label: 'Intake', readOnly: true },
      { key: 'identityNumber', label: 'Passport / IC number', readOnly: true }, { key: 'companyName', label: 'Company name', readOnly: true },
      { key: 'supervisorName', label: 'Industrial supervisor', readOnly: true }, { key: 'contactNumber', label: 'Contact number', readOnly: true },
    ],
  },
  {
    id: 'p2-logbook', part: 'part2', order: 4, title: 'Logbook Week 09–16', shortTitle: 'Weekly logbook', kind: 'logbook', owner: 'intern', reviewRequired: true,
    description: 'Eight weekly records completing the sixteen-week internship log.', guideline: 'Complete and submit each week for supervisor review. Your identity and week dates are filled automatically and locked.',
    sections: Array.from({ length: 8 }, (_, i) => `Week ${String(i + 9).padStart(2, '0')}`),
  },
  {
    id: 'p2-attendance', part: 'part2', order: 5, title: 'Attendance Record — 16 Weeks', shortTitle: 'Attendance', kind: 'attendance', owner: 'intern', reviewRequired: true,
    description: 'Daily workplace, date, time-in, time-out, and hours for the full internship.', guideline: 'Complete all sixteen weeks. Week dates are pre-filled and can be corrected. Approval applies signatures and stamps to each required official page.',
    sections: Array.from({ length: 16 }, (_, i) => `Week ${String(i + 1).padStart(2, '0')}`),
  },
  {
    id: 'p2-assessment', part: 'part2', order: 6, title: 'Company Supervisor Assessment Form', shortTitle: 'Supervisor assessment', kind: 'assessment', owner: 'supervisor', reviewRequired: true,
    description: 'Supervisor assessment across professional, technical, and communication criteria.', guideline: 'Only the assigned supervisor can complete or revise this assessment. The intern can view it. Header details are filled automatically from the placement record.', sections: ['Supervisor assessment'],
  },
  {
    id: 'p2-mentor-report', part: 'part2', order: 7, title: 'Mentor Visit / Feedback Report', shortTitle: 'Mentor report', kind: 'upload', owner: 'intern', reviewRequired: false,
    description: 'The academic mentor’s completed internship visit and feedback record.', guideline: 'Upload the completed report. The prototype does not verify the mentor signature.', sections: ['Mentor Visit / Feedback Report'],
  },
]

export const getDocuments = (part: PartId) => DOCUMENTS.filter((item) => item.part === part).sort((a, b) => a.order - b.order)

const users: User[] = [
  { id: 'intern-1', name: 'Aisha Rahman', email: 'aisha.rahman@mail.apu.edu.my', password: 'intern123', role: 'intern', avatar: 'AR' },
  { id: 'intern-2', name: 'Daniel Lee', email: 'daniel.lee@mail.apu.edu.my', password: 'intern123', role: 'intern', avatar: 'DL' },
  { id: 'intern-3', name: 'Maya Kumar', email: 'maya.kumar@mail.apu.edu.my', password: 'intern123', role: 'intern', avatar: 'MK' },
  { id: 'supervisor-1', name: 'Marcus Tan', email: 'marcus@rizurf.com', password: 'supervisor123', role: 'supervisor', avatar: 'MT' },
]

const newDocumentRecord = (definition: DocumentDefinition): DocumentRecord => ({
  id: definition.id,
  files: [],
  sections: definition.sections.map((label, index) => ({
    id: `${definition.id}-section-${index + 1}`,
    label,
    status: 'not_started',
    fields: {},
    history: [],
  })),
})

/** Local fill-missing (empty string counts as a user value, never replaced). */
function fillMissingLocal(existing: Record<string, string>, defaults: Record<string, string | undefined>) {
  const result = { ...existing }
  Object.entries(defaults).forEach(([key, value]) => {
    if (result[key] === undefined && value !== undefined) result[key] = value
  })
  return result
}

function withoutUndefined(values: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Record<string, string>
}

/**
 * Local canonical application for seeding. Mirrors lib/autofill.ts semantics
 * (locked overwrite, attendance dates fill-missing) without importing it,
 * keeping this module cycle-free.
 */
function applyCanonicalToDocument(record: InternRecord, definition: DocumentDefinition, document: DocumentRecord, user: User, supervisor?: User): DocumentRecord {
  if (definition.id === 'p1-cover') {
    const canonical = canonicalP1CoverFields(record, user)
    return { ...document, sections: document.sections.map((section) => ({ ...section, fields: { ...section.fields, ...canonical } })) }
  }
  if (definition.id === 'p2-cover') {
    const canonical = canonicalP2CoverFields(record, user)
    return { ...document, sections: document.sections.map((section) => ({ ...section, fields: { ...section.fields, ...canonical } })) }
  }
  if (definition.id === 'p2-clearance') {
    // All 8 clearance fields are locked canonical values with no manual
    // companion: the section stores exactly those keys, never invisible
    // startDate/endDate or seeded narrative junk. An unresolvable supervisor
    // keeps the stored name instead of dropping it.
    const canonical = withoutUndefined(canonicalClearanceFields(record, user, supervisor))
    return {
      ...document,
      sections: document.sections.map((section) => {
        const keepSupervisor: Record<string, string> =
          supervisor?.name === undefined && section.fields.supervisorName ? { supervisorName: section.fields.supervisorName } : {}
        return { ...section, fields: { ...keepSupervisor, ...canonical } }
      }),
    }
  }
  if (definition.kind === 'logbook') {
    return {
      ...document,
      sections: document.sections.map((section, index) => ({
        ...section,
        fields: { ...section.fields, ...logbookLockedFields(definition, index, record, user) },
      })),
    }
  }
  if (definition.id === 'p2-attendance') {
    const locked = withoutUndefined(attendanceLockedFields(record, user, supervisor))
    return {
      ...document,
      sections: document.sections.map((section, index) => ({
        ...section,
        fields: fillMissingLocal({ ...section.fields, ...locked }, attendanceDateDefaults(index, record)),
      })),
    }
  }
  if (definition.id === 'p2-assessment') {
    const canonical = withoutUndefined(assessmentLockedFields(record, user, supervisor))
    return { ...document, sections: document.sections.map((section) => ({ ...section, fields: { ...section.fields, ...canonical } })) }
  }
  return document
}

const makeRecord = (internId: string, company: string, title: string, studentId: string, seedProgress = 0): InternRecord => {
  const documents = Object.fromEntries(DOCUMENTS.map((definition) => [definition.id, newDocumentRecord(definition)]))
  const actor = users.find((user) => user.id === internId)?.name ?? 'Intern'
  const flatSections = DOCUMENTS.flatMap((definition) => documents[definition.id].sections.map((section) => ({ section, definition })))
  flatSections.slice(0, seedProgress).forEach(({ section, definition }, index) => {
    const keepPartOneComplete = seedProgress > 13 && definition.part === 'part1'
    section.status = definition.reviewRequired && index % 5 === 4 && !keepPartOneComplete ? 'submitted_for_review' : 'approved'
    section.updatedAt = new Date(Date.now() - (seedProgress - index) * 86_400_000).toISOString()
    // Approved seeded sections carry the seeded completion timestamp as their
    // approval timestamp, so approval-date rendering never falls back to now.
    if (section.status === 'approved') section.approvedAt = section.updatedAt
    section.fields = { activities: 'Completed seeded internship activities and project work.', reflection: 'Learned how to communicate progress and apply technical skills.' }
    if (definition.kind === 'attendance') {
      // Seeded attendance weeks carry approved/submitted statuses, so they
      // need a genuine manual entry to read valid under the attendance rule
      // (prefilled dates never count). Dates themselves stay autofilled
      // editable defaults applied below; this entry is never overwritten.
      section.fields = {
        ...section.fields,
        mondayWorkplace: 'Office', mondayTimeIn: '09:00', mondayTimeOut: '18:00', mondayHours: '8',
      }
    }
    section.history = [{ id: `seed-${internId}-${index}`, action: section.status === 'approved' ? 'Completed' : 'Submitted for review', actor, date: section.updatedAt }]
    if (definition.kind === 'upload' && documents[definition.id].files.length === 0) {
      documents[definition.id].files.push({
        id: `seed-file-${internId}-${definition.id}`,
        name: `${definition.shortTitle.replaceAll(' ', '-')}-sample.docx`,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 36,
        blob: new Blob(['Prototype document used for the seeded workflow.'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        uploadedAt: section.updatedAt,
      })
    }
  })
  const record: InternRecord = {
    internId, company, title, studentId, intake: 'APU2F2409CS(SE)', supervisorId: 'supervisor-1',
    ...placementExtrasFor(internId),
    startDate: '2026-09-14', endDate: '2027-01-01', dueDates: { part1: '2026-11-27', part2: '2027-01-22' }, documents, pdfs: [],
  }
  const user = users.find((item) => item.id === internId)!
  const supervisor = users.find((item) => item.id === record.supervisorId)
  DOCUMENTS.forEach((definition) => { record.documents[definition.id] = applyCanonicalToDocument(record, definition, record.documents[definition.id], user, supervisor) })
  return record
}

export const createSeedData = (): AppData => ({
  users,
  records: [
    makeRecord('intern-1', 'Rizurf Technology', 'Software Engineering Intern', 'TP078421', 3),
    makeRecord('intern-2', 'Rizurf Technology', 'Frontend Engineering Intern', 'TP076185', 11),
    makeRecord('intern-3', 'Rizurf Technology', 'Cloud Operations Intern', 'TP079013', 31),
  ],
  notifications: [
    { id: 'n1', userId: 'intern-1', title: 'Part 1 is ready', body: 'Start with your placement cover and Week 01 logbook.', createdAt: new Date().toISOString(), read: false },
    { id: 'n2', userId: 'supervisor-1', title: 'Reviews waiting', body: 'Two interns have submitted sections for review.', createdAt: new Date().toISOString(), read: false },
  ],
  signatures: {
    'intern-1': {}, 'intern-2': {}, 'intern-3': {},
    // Seeded demo sample signature + stamp for Marcus Tan only. A
    // supervisor-uploaded signature/stamp always overrides these during
    // hydration; they are never fallbacks for other supervisors.
    [SAMPLE_SUPERVISOR_USER_ID]: { signature: SAMPLE_SUPERVISOR_SIGNATURE, stamp: SAMPLE_SUPERVISOR_STAMP },
  },
})
