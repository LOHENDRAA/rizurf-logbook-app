import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import type { DocumentDefinition, InternRecord, SectionRecord, SignatureProfile, User } from '../types'
import { embedSignatureImage } from './signatures'

export const ASSESSMENT_CRITERIA = ['Supervision attitude', 'Social integration', 'Motivation', 'Perseverance', 'Technical knowledge', 'Productivity', 'Teamwork', 'Problem solving', 'Written communication', 'Oral communication', 'Others (please specify)']

export type OfficialTemplateId = 'p1-cover' | 'p1-logbook' | 'p2-cover' | 'p2-clearance' | 'p2-logbook' | 'p2-attendance' | 'p2-assessment'

export interface OfficialRenderContext {
  record: InternRecord
  intern: User
  supervisor?: User
  signatures: Record<string, SignatureProfile>
}

export interface OfficialPageSelection {
  sourcePage: number
  sectionIndexes: number[]
  label: string
}

export interface TemplateFieldManifest { key: string; x: number; y: number; width: number; height: number; size?: number }
/** Checklist row geometry for cover auto-signing. Marks are drawn for every
 * row whenever a valid student signature embeds — unconditionally, i.e. with
 * no per-row dependency on other documents. */
export interface CoverChecklistManifest { key: string; label: string; x: number; y: number }

export const COVER_FIELDS: Record<'part1' | 'part2', TemplateFieldManifest[]> = {
  part1: ['studentName', 'studentId', 'intake', 'companyName', 'companyAddress', 'mentorName', 'startDate', 'endDate'].map((key, index) => ({ key, x: 207, y: 606 - index * 24, width: 330, height: 17 })),
  part2: ['studentName', 'studentId', 'intake', 'companyName', 'companyAddress', 'mentorName', 'startDate', 'endDate'].map((key, index) => ({ key, x: 207, y: 606 - index * 24, width: 330, height: 17 })),
}

export const COVER_CHECKLISTS: Record<'part1' | 'part2', CoverChecklistManifest[]> = {
  part1: [
    { key: 'logbook', label: '8 weekly log books', x: 285, y: 331 },
    { key: 'cover-letter-cv', label: 'Cover Letter & CV', x: 285, y: 281 },
    { key: 'project-log', label: 'Project Log Sheet', x: 285, y: 225 },
    { key: 'week-email', label: 'Week 1 Email', x: 285, y: 153 },
  ],
  part2: [
    { key: 'report', label: 'Industrial Placement Report', x: 355, y: 350 },
    { key: 'clearance', label: 'Report Clearance Form', x: 355, y: 317 },
    { key: 'logbook', label: 'At least 8 weekly log book', x: 355, y: 274 },
    { key: 'attendance', label: 'Attendance record', x: 355, y: 225 },
    { key: 'assessment', label: 'Company Supervisor Assessment Form', x: 355, y: 184 },
    { key: 'mentor-report', label: 'Mentor Visit Report', x: 355, y: 145 },
  ],
}

export const ATTENDANCE_COLUMNS = { workplace: 57, date: 272, timeIn: 342, timeOut: 410, timeServed: 480, width: 58 }
export function attendanceFieldKeys(day: string) { return { workplace: `${day}Workplace`, date: `${day}Date`, timeIn: `${day}TimeIn`, timeOut: `${day}TimeOut`, timeServed: `${day}Hours` } }

/**
 * Weekly logbook overlay geometry, measured from the official template vector
 * content (A4 595.304 x 841.89pt, bottom-left origin).
 *
 * Measured cell borders shared by p1-logbook.pdf and p2-logbook.pdf:
 * - identity value column x 136.1-544; rows Student Name y 665.739-680.739,
 *   Student ID y 650.739-665.739, Company Name y 621.239-650.739
 * - week row y 573.939-603.439; columns Week x 51.3-136.1 ("Week:" ends ~87),
 *   Start x 136.1-320.4 ("Start Date:" ends ~194), End x 320.4-544
 *   ("End Date:" ends ~374)
 * - activities box y 510.139-573.939 with its header baseline at 563.439
 * - reflection ("Content") box y 218.239-484.339
 * - no supervisor-comments region exists; the gap below the Content box runs
 *   straight into the signature/date line (baselines y 164.439/142.789)
 *
 * Each entry stores the first-text baseline `y` and the lowest `bottom` the
 * text may descend to. `drawValue` receives `y - bottom` as its height so its
 * line budget provably ends above `bottom`.
 */
export interface LogbookFieldManifest { key: 'studentName' | 'studentId' | 'companyName' | 'week' | 'startDate' | 'endDate' | 'activities' | 'reflection'; x: number; y: number; width: number; bottom: number; size: number }

export const LOGBOOK_FIELDS: LogbookFieldManifest[] = [
  { key: 'studentName', x: 141, y: 670, width: 398, bottom: 666, size: 9 },
  { key: 'studentId', x: 141, y: 655, width: 398, bottom: 651, size: 9 },
  { key: 'companyName', x: 141, y: 634, width: 398, bottom: 621.5, size: 9 },
  { key: 'week', x: 91, y: 593, width: 42, bottom: 574.5, size: 9 },
  { key: 'startDate', x: 199, y: 593, width: 116, bottom: 574.5, size: 9 },
  { key: 'endDate', x: 379, y: 593, width: 160, bottom: 574.5, size: 9 },
  { key: 'activities', x: 56, y: 553, width: 483, bottom: 512.5, size: 8 },
  { key: 'reflection', x: 56, y: 473, width: 483, bottom: 221, size: 8 },
]
export function logbookField(key: LogbookFieldManifest['key']) { return LOGBOOK_FIELDS.find((field) => field.key === key)! }
export function maxLinesFor(height: number, size: number) { return Math.max(1, Math.floor(height / (size * 1.25))) }
export const ASSESSMENT_PAGE_MANIFEST = { criteriaPage: 0, commentsPage: 1, ratingX: 234, commentsX: 270, scoreBoxes: [94, 143, 206, 226, 286, 306, 366, 386, 447, 497] }
export const SIGNATURE_MANIFEST = {
  'p1-cover': { page: 0, signature: { x: 380, y: 250, width: 90, height: 35 } },
  'p2-cover': { page: 0, signature: { x: 480, y: 255, width: 70, height: 35 } },
  logbook: { page: 0, signature: { x: 245, y: 145, width: 90, height: 30 }, stamp: { x: 345, y: 138, width: 55, height: 45 }, date: { x: 78, y: 145, width: 155, height: 15 } },
  // Clearance date baseline: drawValue draws text from its baseline
  // (pdf-lib bottom-left origin), so the 8pt date uses y=375 to center its
  // ~6pt digit block in the ruled Date cell (bottom gridline 348.64, header
  // line 412.44, center ~380.5) instead of hugging the bottom gridline at
  // y=350 like the image placements. x/width/height and all other manifests
  // are unchanged.
  clearance: { page: 0, signature: { x: 78, y: 350, width: 90, height: 35 }, stamp: { x: 242, y: 350, width: 55, height: 45 }, date: { x: 415, y: 375, width: 100, height: 15 } },
  attendance: { page: 0, signature: { x: 60, y: 150, width: 90, height: 30 }, stamp: { x: 165, y: 143, width: 55, height: 45 }, date: { x: 78, y: 117, width: 155, height: 15 } },
  assessment: { page: 1, signature: { x: 70, y: 450, width: 90, height: 35 }, stamp: { x: 405, y: 515, width: 55, height: 35 }, date: { x: 330, y: 492, width: 80, height: 15 } },
} as const

function reviewSignaturePlacement(definition: DocumentDefinition, sourcePage: number) {
  if (definition.kind === 'logbook') return sourcePage === SIGNATURE_MANIFEST.logbook.page ? SIGNATURE_MANIFEST.logbook : undefined
  if (definition.kind === 'attendance') return SIGNATURE_MANIFEST.attendance
  if (definition.id === 'p2-clearance') return SIGNATURE_MANIFEST.clearance
  if (definition.kind === 'assessment') return sourcePage === SIGNATURE_MANIFEST.assessment.page ? SIGNATURE_MANIFEST.assessment : undefined
  return undefined
}

const ASSETS: Record<OfficialTemplateId, string> = {
  'p1-cover': '/templates/p1-cover.pdf',
  'p1-logbook': '/templates/p1-logbook.pdf',
  'p2-cover': '/templates/p2-cover.pdf',
  'p2-clearance': '/templates/p2-clearance.pdf',
  'p2-logbook': '/templates/p2-logbook.pdf',
  'p2-attendance': '/templates/p2-attendance.pdf',
  'p2-assessment': '/templates/p2-assessment.pdf',
}

const INK = rgb(0.06, 0.1, 0.18)
const ACCENT = rgb(0.04, 0.45, 0.49)

export function officialTemplateFor(definition: DocumentDefinition): OfficialTemplateId | undefined {
  return ASSETS[definition.id as OfficialTemplateId] ? definition.id as OfficialTemplateId : undefined
}

export function attendancePageForSection(sectionIndex: number) { return Math.max(0, Math.floor(sectionIndex / 2)) }
export function attendanceSectionIndexesForPage(page: number) { return [page * 2, page * 2 + 1] }
export function logbookSectionForPage(page: number) { return page }

/** The source page(s) shown by the live preview for the selected section. */
export function previewPageSelection(definition: DocumentDefinition, sectionIndex: number): OfficialPageSelection[] {
  if (definition.kind === 'attendance') {
    const page = attendancePageForSection(sectionIndex)
    return [{ sourcePage: page, sectionIndexes: attendanceSectionIndexesForPage(page), label: `Weeks ${String(page * 2 + 1).padStart(2, '0')}–${String(page * 2 + 2).padStart(2, '0')}` }]
  }
  if (definition.kind === 'assessment') return [{ sourcePage: 0, sectionIndexes: [0], label: 'Assessment page 1' }, { sourcePage: 1, sectionIndexes: [0], label: 'Assessment page 2' }]
  return [{ sourcePage: 0, sectionIndexes: [sectionIndex], label: definition.kind === 'logbook' ? (definition.sections[sectionIndex] ?? `Week ${String(sectionIndex + 1).padStart(2, '0')}`) : definition.title }]
}

/** Selection used for the final combined pack. It never duplicates paired attendance pages. */
export function combinedPageSelection(definition: DocumentDefinition): OfficialPageSelection[] {
  if (definition.kind === 'logbook') return definition.sections.map((_, index) => ({ sourcePage: 0, sectionIndexes: [index], label: definition.sections[index] }))
  if (definition.kind === 'attendance') return Array.from({ length: 8 }, (_, page) => ({ sourcePage: page, sectionIndexes: attendanceSectionIndexesForPage(page), label: `Weeks ${String(page * 2 + 1).padStart(2, '0')}–${String(page * 2 + 2).padStart(2, '0')}` }))
  if (definition.kind === 'assessment') return previewPageSelection(definition, 0)
  return [{ sourcePage: 0, sectionIndexes: [0], label: definition.title }]
}

export class OfficialRenderError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = 'OfficialRenderError' }
}

function safeText(value: unknown) {
  return String(value ?? '').split('').filter((character) => character === '\t' || character === '\n' || character === '\r' || character.charCodeAt(0) >= 32).join('').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ')
}

export function linesFor(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, width: number, maxLines: number) {
  const words = safeText(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  const fragmentsFor = (word: string) => {
    if (font.widthOfTextAtSize(word, size) <= width) return [word]
    const parts: string[] = []
    let part = ''
    for (const character of word) {
      const candidate = part + character
      if (part && font.widthOfTextAtSize(candidate, size) > width) { parts.push(part); part = character } else part = candidate
    }
    if (part) parts.push(part)
    return parts.length ? parts : [word]
  }
  let current = ''
  words.forEach((word) => {
    fragmentsFor(word).forEach((piece, pieceIndex) => {
      const candidate = current + (current && pieceIndex === 0 ? ' ' : '') + piece
      if (current && font.widthOfTextAtSize(candidate, size) > width) { lines.push(current); current = piece } else current = candidate
    })
  })
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    lines.length = maxLines
    let last = lines[maxLines - 1]
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}...`
  }
  return lines
}

function drawValue(page: PDFPage, value: unknown, x: number, y: number, width: number, height: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size = 9, color = INK) {
  const lineHeight = size * 1.25
  const maxLines = Math.max(1, Math.floor(height / lineHeight))
  linesFor(String(value ?? ''), font, size, width, maxLines).forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, size, font, color, maxWidth: width }))
}

function valueFor(section: SectionRecord | undefined, key: string) { return section?.fields?.[key] ?? '' }
function sectionFor(context: OfficialRenderContext, definition: DocumentDefinition, index: number) { return context.record.documents[definition.id]?.sections[index] }

/**
 * Approval date text for an approved section. Returns undefined unless the
 * section carries a valid `approvedAt` timestamp, so rendering can never
 * invent a render-time date or print "Invalid Date".
 */
export function approvalDateLabel(section: SectionRecord | undefined) {
  if (!section?.approvedAt) return undefined
  const time = Date.parse(section.approvedAt)
  if (Number.isNaN(time)) return undefined
  return new Date(time).toLocaleDateString('en-MY')
}
function answerFromDocuments(context: OfficialRenderContext, documentIds: string[], key: string) {
  for (const id of documentIds) {
    const fields = context.record.documents[id]?.sections[0]?.fields
    if (fields && Object.prototype.hasOwnProperty.call(fields, key)) return fields[key] ?? ''
  }
  return ''
}

function drawCheck(page: PDFPage, checked: boolean, x: number, y: number) {
  if (!checked) return
  page.drawLine({ start: { x, y: y + 2 }, end: { x: x + 4, y: y - 2 }, thickness: 1.4, color: ACCENT })
  page.drawLine({ start: { x: x + 4, y: y - 2 }, end: { x: x + 11, y: y + 8 }, thickness: 1.4, color: ACCENT })
}

async function embedImage(pdf: PDFDocument, dataUrl?: string) {
  return embedSignatureImage(pdf, dataUrl)
}

function drawCover(page: PDFPage, definition: DocumentDefinition, section: SectionRecord, regular: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  COVER_FIELDS[definition.part].forEach((field) => drawValue(page, valueFor(section, field.key), field.x, field.y, field.width, field.height, regular, field.size ?? 9))
  // Checklist ticks and signature images are drawn in renderOfficialDocument
  // whenever the student signature embeds, independent of completion status
  // and other documents — never here, so marks cannot double-draw.
}

/**
 * Shared cover auto-signing decision for rendering and tests. Every
 * checklist row is ticked and signed whenever the student signature was
 * successfully embedded — independent of cover status (draft, completed, or
 * legacy approved) and independent of all other documents, so a saved
 * signature added before or after marking complete appears automatically.
 * Missing/corrupt signatures render without marks and never throw.
 */
export function isP1CoverApproved(record: InternRecord) {
  const sections = record.documents['p1-cover']?.sections ?? []
  return sections.length > 0 && sections.every((section) => section.status === 'approved' || section.status === 'completed')
}

/** Unified gate: marks draw iff a signature image embedded successfully. */
export function shouldDrawCoverMarks(signatureEmbedded: unknown) {
  return Boolean(signatureEmbedded)
}

/** Backwards-compat alias; the approval flag no longer gates rendering. */
export function shouldDrawP1CoverMarks(_coverApproved: boolean, signatureEmbedded: unknown) {
  return shouldDrawCoverMarks(signatureEmbedded)
}

/** Per-template signature-image geometry (tick coordinates live in COVER_CHECKLISTS). */
const COVER_MARK_IMAGES = {
  part1: { x: 385, width: 80, height: 25 },
  part2: { x: 420, width: 70, height: 25 },
} as const

/**
 * Concrete tick + signature placements for every checklist row, or [] when
 * no signature embedded. Pure; the single source the render path draws from.
 */
export function coverMarkPlacements(part: 'part1' | 'part2', signatureEmbedded: unknown) {
  if (!shouldDrawCoverMarks(signatureEmbedded)) return []
  const image = COVER_MARK_IMAGES[part]
  return COVER_CHECKLISTS[part].map((check) => ({
    key: check.key, x: check.x, y: check.y,
    imageX: image.x, imageY: check.y - 13, imageWidth: image.width, imageHeight: image.height,
  }))
}

function drawLogbook(page: PDFPage, section: SectionRecord, context: OfficialRenderContext, regular: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  const drawField = (key: LogbookFieldManifest['key'], value: unknown) => {
    const field = logbookField(key)
    drawValue(page, value, field.x, field.y, field.width, field.y - field.bottom, regular, field.size)
  }
  drawField('studentName', valueFor(section, 'studentName') || context.intern.name)
  drawField('studentId', valueFor(section, 'studentId') || context.record.studentId)
  drawField('companyName', valueFor(section, 'companyName') || context.record.company)
  drawField('week', section.label)
  drawField('startDate', valueFor(section, 'startDate'))
  drawField('endDate', valueFor(section, 'endDate'))
  drawField('activities', valueFor(section, 'activities'))
  drawField('reflection', valueFor(section, 'reflection'))
  // The official weekly template has no supervisor-comments region: the area
  // below the Content box runs into the signature/date line, so any stored
  // supervisorComments value is intentionally not rendered here.
}

function attendanceValue(section: SectionRecord | undefined, day: string, suffix?: string) {
  if (!section) return ''
  return suffix ? section.fields[attendanceFieldKeys(day)[suffix === 'Hours' ? 'timeServed' : suffix === 'Date' ? 'date' : suffix === 'TimeIn' ? 'timeIn' : 'timeOut']] ?? '' : section.fields[day] ?? ''
}

function drawAttendance(page: PDFPage, sections: SectionRecord[], context: OfficialRenderContext, regular: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  const first = sections[0]
  const rows = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  drawValue(page, valueFor(first, 'supervisorName') || context.supervisor?.name, 195, 731, 95, 15, regular, 8)
  drawValue(page, valueFor(first, 'studentName') || context.intern.name, 375, 731, 145, 15, regular, 8)
  drawValue(page, valueFor(first, 'companyName') || context.record.company, 140, 701, 145, 15, regular, 8)
  drawValue(page, valueFor(first, 'studentId') || context.record.studentId, 375, 701, 145, 15, regular, 8)
  drawValue(page, valueFor(first, 'companyAddress') || answerFromDocuments(context, ['p2-cover', 'p1-cover'], 'companyAddress'), 155, 672, 130, 15, regular, 8)
  drawValue(page, valueFor(first, 'identityNumber') || answerFromDocuments(context, ['p2-clearance'], 'identityNumber'), 375, 672, 145, 15, regular, 8)
  rows.forEach((day, index) => {
    const y = 560 - index * 20
    const section = sections[0]
    const keys = attendanceFieldKeys(day)
    const fallback = attendanceValue(section, day)
    drawValue(page, valueFor(section, keys.workplace), ATTENDANCE_COLUMNS.workplace + 4, y, 140, 17, regular, 7)
    const hasStructured = [keys.workplace, keys.date, keys.timeIn, keys.timeOut, keys.timeServed].some((key) => Boolean(valueFor(section, key).trim()))
    if (!hasStructured && fallback) drawValue(page, fallback, ATTENDANCE_COLUMNS.workplace + 4, y, 140, 17, regular, 6)
    drawValue(page, valueFor(section, keys.date), ATTENDANCE_COLUMNS.date + 4, y, 62, 17, regular, 6)
    drawValue(page, valueFor(section, keys.timeIn), ATTENDANCE_COLUMNS.timeIn + 4, y, 62, 17, regular, 6)
    drawValue(page, valueFor(section, keys.timeOut), ATTENDANCE_COLUMNS.timeOut + 4, y, 62, 17, regular, 6)
    drawValue(page, valueFor(section, keys.timeServed), ATTENDANCE_COLUMNS.timeServed + 4, y, 57, 17, regular, 6)
  })
  if (sections[1]) {
    rows.forEach((day, index) => {
      const y = 361 - index * 20
      const section = sections[1]
      const keys = attendanceFieldKeys(day)
      const fallback = attendanceValue(sections[1], day)
      drawValue(page, valueFor(section, keys.workplace), ATTENDANCE_COLUMNS.workplace + 4, y, 140, 17, regular, 7)
      const hasStructured = [keys.workplace, keys.date, keys.timeIn, keys.timeOut, keys.timeServed].some((key) => Boolean(valueFor(section, key).trim()))
      if (!hasStructured && fallback) drawValue(page, fallback, ATTENDANCE_COLUMNS.workplace + 4, y, 140, 17, regular, 6)
      drawValue(page, valueFor(section, keys.date), ATTENDANCE_COLUMNS.date + 4, y, 62, 17, regular, 6)
      drawValue(page, valueFor(section, keys.timeIn), ATTENDANCE_COLUMNS.timeIn + 4, y, 62, 17, regular, 6)
      drawValue(page, valueFor(section, keys.timeOut), ATTENDANCE_COLUMNS.timeOut + 4, y, 62, 17, regular, 6)
      drawValue(page, valueFor(section, keys.timeServed), ATTENDANCE_COLUMNS.timeServed + 4, y, 57, 17, regular, 6)
    })
  }
}

function drawClearance(page: PDFPage, section: SectionRecord, context: OfficialRenderContext, regular: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  const rows: Array<[string, number, number]> = [['studentName', 644, 14], ['department', 627, 14], ['studentId', 609, 14], ['intake', 592, 14], ['identityNumber', 574, 24], ['companyName', 516, 14], ['supervisorName', 500, 30], ['contactNumber', 471, 14]]
  // Stored canonical fields win; placement context stays as a defensive
  // fallback so an un-hydrated section still renders instead of crashing.
  const fallback: Record<string, unknown> = {
    studentName: context.intern.name,
    department: context.record.department,
    studentId: context.record.studentId,
    intake: context.record.intake,
    identityNumber: context.record.identityNumber,
    companyName: context.record.company,
    supervisorName: context.supervisor?.name,
    contactNumber: context.record.contactNumber,
  }
  rows.forEach(([key, y, height]) => drawValue(page, valueFor(section, key) || fallback[key] || '', 180, y, 340, height, regular, 9))
}

function drawAssessment(page: PDFPage, section: SectionRecord, context: OfficialRenderContext, sourcePage: number, regular: Awaited<ReturnType<PDFDocument['embedFont']>>, bold: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  if (sourcePage === ASSESSMENT_PAGE_MANIFEST.commentsPage) {
    drawValue(page, valueFor(section, 'comments'), 70, 735, 460, 130, regular, 9)
    return
  }
  drawValue(page, valueFor(section, 'studentName') || context.intern.name, 180, 635, 350, 15, regular, 8)
  drawValue(page, valueFor(section, 'awardTitle') || context.record.title, 180, 618, 350, 15, regular, 8)
  drawValue(page, valueFor(section, 'companyName') || context.record.company, 180, 600, 350, 30, regular, 8)
  drawValue(page, valueFor(section, 'supervisorName') || context.supervisor?.name, 180, 571, 350, 30, regular, 8)
  drawValue(page, valueFor(section, 'startDate') || context.record.startDate, 180, 541, 160, 15, regular, 8)
  drawValue(page, valueFor(section, 'endDate') || context.record.endDate, 370, 524, 160, 15, regular, 8)
  const criterionY = [407, 389, 372, 354, 337, 319, 302, 284, 267, 249, 232]
  ASSESSMENT_CRITERIA.forEach((_, index) => {
    const y = criterionY[index]
    drawValue(page, valueFor(section, `criterion-${index}`), ASSESSMENT_PAGE_MANIFEST.ratingX, y, 38, 14, bold, 8, ACCENT)
    drawValue(page, valueFor(section, `criterion-comment-${index}`), ASSESSMENT_PAGE_MANIFEST.commentsX, y, 260, 14, regular, 7)
  })
  const score = Number.parseInt(valueFor(section, 'score'), 10)
  if (score >= 1 && score <= ASSESSMENT_PAGE_MANIFEST.scoreBoxes.length) drawCheck(page, true, ASSESSMENT_PAGE_MANIFEST.scoreBoxes[score - 1], 136)
}

function overlayPage(page: PDFPage, definition: DocumentDefinition, context: OfficialRenderContext, sourcePage: number, sectionIndexes: number[], regular: Awaited<ReturnType<PDFDocument['embedFont']>>, bold: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  const section = sectionFor(context, definition, sectionIndexes[0])
  if (!section) return
  if (definition.kind === 'logbook') drawLogbook(page, section, context, regular)
  else if (definition.kind === 'attendance') drawAttendance(page, sectionIndexes.map((index) => sectionFor(context, definition, index)).filter(Boolean) as SectionRecord[], context, regular)
  else if (definition.kind === 'assessment') drawAssessment(page, section, context, sourcePage, regular, bold)
  else if (definition.id.endsWith('cover')) drawCover(page, definition, section, regular)
  else if (definition.id === 'p2-clearance') drawClearance(page, section, context, regular)
}

/** Render one or more real official pages. Both preview and combined PDF use this function. */
export async function renderOfficialDocument(definition: DocumentDefinition, context: OfficialRenderContext, selection: OfficialPageSelection[] = combinedPageSelection(definition)) {
  const templateId = officialTemplateFor(definition)
  if (!templateId) throw new OfficialRenderError(`No official template is registered for ${definition.title}.`)
  let response: Response
  try { response = await fetch(ASSETS[templateId]) } catch (error) { throw new OfficialRenderError(`The official template for ${definition.title} could not be loaded.`, error) }
  if (!response.ok) throw new OfficialRenderError(`The official template for ${definition.title} is unavailable (${response.status}).`)
  let template: PDFDocument
  try { template = await PDFDocument.load(await response.arrayBuffer()) } catch (error) { throw new OfficialRenderError(`The official template for ${definition.title} is corrupt.`, error) }
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const internSignature = await embedImage(pdf, context.signatures[context.intern.id]?.signature)
  const supervisorSignature = await embedImage(pdf, context.signatures[context.record.supervisorId]?.signature)
  const stamp = await embedImage(pdf, context.signatures[context.record.supervisorId]?.stamp)

  for (const item of selection) {
    if (item.sourcePage < 0 || item.sourcePage >= template.getPageCount()) throw new OfficialRenderError(`The official template for ${definition.title} has no page ${item.sourcePage + 1}.`)
    const [page] = await pdf.copyPages(template, [item.sourcePage])
    pdf.addPage(page)
    overlayPage(page, definition, context, item.sourcePage, item.sectionIndexes, regular, bold)
    const section = sectionFor(context, definition, item.sectionIndexes[0])
    const pageApproved = item.sectionIndexes.every((index) => sectionFor(context, definition, index)?.status === 'approved')
    // Student cover marks: every checklist row ticked + signed whenever the
    // saved signature embeds — unconditional on status and other documents.
    if (definition.id.endsWith('cover') && internSignature) {
      coverMarkPlacements(definition.part, internSignature).forEach((mark) => {
        drawCheck(page, true, mark.x, mark.y)
        page.drawImage(internSignature, { x: mark.imageX, y: mark.imageY, width: mark.imageWidth, height: mark.imageHeight })
      })
    }
    if (pageApproved && definition.reviewRequired) {
      const placement = reviewSignaturePlacement(definition, item.sourcePage)
      if (placement?.signature && supervisorSignature) page.drawImage(supervisorSignature, placement.signature)
      if (placement?.stamp && stamp) page.drawImage(stamp, placement.stamp)
      const approvalDate = approvalDateLabel(section)
      if (placement && 'date' in placement && approvalDate) drawValue(page, approvalDate, placement.date.x, placement.date.y, placement.date.width, placement.date.height, regular, 8, ACCENT)
    }
  }
  pdf.setTitle(`${context.intern.name} - ${definition.title}`)
  pdf.setAuthor('InternFlow')
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}

export function assetForTemplate(id: OfficialTemplateId) { return ASSETS[id] }
