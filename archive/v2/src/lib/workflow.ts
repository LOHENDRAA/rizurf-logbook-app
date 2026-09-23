import { DOCUMENTS, getDocuments } from '../data'
import type { DocumentDefinition, DocumentRecord, DocumentStatus, InternRecord, PartId, SectionRecord } from '../types'

export const definitionFor = (id: string) => DOCUMENTS.find((item) => item.id === id)

/** Covers use a visual-only Completed status (never supervisor-approved). */
export const isCoverDefinition = (definition: DocumentDefinition) => definition.id.endsWith('cover')
/** Forms whose auto-filled locked fields stay hidden in the editor (preview/PDF still render them). */
export const shouldHideLockedFields = (definition: DocumentDefinition) => isCoverDefinition(definition) || definition.id === 'p2-clearance'
export const isCompleteStatus = (status: DocumentStatus) => status === 'approved' || status === 'completed'

/** Supervisor assessment rating keys: criterion-0..criterion-10 (11 criteria). */
export const ASSESSMENT_RATING_KEYS = Array.from({ length: 11 }, (_, index) => `criterion-${index}`)
/** Allowed assessment ratings — exact match after trimming (case-sensitive). */
export const ASSESSMENT_GRADES = new Set(['A', 'B', 'C', 'D', 'U'])

export function documentStatus(record: DocumentRecord): DocumentStatus {
  const statuses = record.sections.map((section) => section.status)
  if (statuses.every((status) => status === 'approved')) return 'approved'
  if (statuses.every((status) => status === 'approved' || status === 'completed')) return 'completed'
  if (statuses.some((status) => status === 'changes_requested')) return 'changes_requested'
  if (statuses.some((status) => status === 'submitted_for_review')) return 'submitted_for_review'
  if (statuses.some((status) => status === 'draft' || status === 'approved' || status === 'completed')) return 'draft'
  return 'not_started'
}

export function partProgress(record: InternRecord, part: PartId) {
  const sections = getDocuments(part).flatMap((definition) => record.documents[definition.id].sections)
  const approved = sections.filter((section) => isCompleteStatus(section.status)).length
  return { approved, total: sections.length, percent: Math.round((approved / sections.length) * 100) }
}

export const partComplete = (record: InternRecord, part: PartId) => partProgress(record, part).percent === 100

export function documentProgress(record: DocumentRecord) {
  const approved = record.sections.filter((section) => isCompleteStatus(section.status)).length
  return Math.round((approved / record.sections.length) * 100)
}

export function isSectionValid(definition: DocumentDefinition, section: SectionRecord, files: number) {
  if (definition.kind === 'upload') return files > 0
  // Assessment is valid only with all 11 supervisor criterion ratings
  // (exact A/B/C/D/U after trimming — case-sensitive, matching the
  // supervisor select control) plus an overall score of 1–10. Explicit key
  // lists are used instead of the locked-key config so header changes can
  // never leak into validity; comments (criterion-comment-*, comments) and
  // locked headers never count.
  if (definition.kind === 'assessment') {
    const ratingsOk = ASSESSMENT_RATING_KEYS.every((key) => ASSESSMENT_GRADES.has((section.fields[key] ?? '').trim()))
    const scoreOk = /^(?:[1-9]|10)$/.test((section.fields.score ?? '').trim())
    return ratingsOk && scoreOk
  }
  // Attendance weekday dates are prefilled editable defaults, so they never
  // count as an entry: at least one genuinely manual value (legacy combined
  // entry, notes, or a workplace/time-in/time-out/hours cell) is required.
  if (definition.kind === 'attendance') return Boolean(section.fields.monday || section.fields.notes || Object.entries(section.fields).some(([key, value]) => /(?:Workplace|TimeIn|TimeOut|Hours)$/.test(key) && String(value ?? '').trim()))
  if (definition.kind === 'logbook') return Boolean(section.fields.activities?.trim() && section.fields.reflection?.trim())
  // Locked (readOnly) values are auto-filled and hidden/disabled in the
  // editor, so validity depends only on genuinely manual (editable) fields.
  // Fully-locked forms (e.g. clearance) have no manual fields: they validate
  // true once the stored canonical values are present, without crashing when
  // autofill has not populated them yet.
  const fields = definition.fields ?? []
  const manualFields = fields.filter((field) => !field.readOnly)
  if (manualFields.length === 0 && fields.length > 0) return fields.every((field) => section.fields[field.key]?.trim())
  return manualFields.every((field) => section.fields[field.key]?.trim())
}

/** Remove an upload without making a completed (approved/completed), now-invalid document look complete. */
export function removeStoredFile(document: DocumentRecord, fileId: string, updatedAt: string) {
  if (!document.files.some((file) => file.id === fileId)) return document
  return {
    ...document,
    files: document.files.filter((file) => file.id !== fileId),
    updatedAt,
    sections: document.sections.map((section) => ({ ...section, status: 'draft' as const, updatedAt })),
  }
}

/**
 * Legacy cover completion check, kept for compatibility. Covers are now
 * visual-only: completion requires only manual-field validity
 * (isSectionValid). Signature presence is never required and never blocks
 * marking complete. Non-cover documents always return undefined.
 */
export async function p1CoverCompletionError(definition: DocumentDefinition, section: SectionRecord, files: number, _signatureValue?: unknown): Promise<string | undefined> {
  void _signatureValue
  if (!isCoverDefinition(definition)) return undefined
  if (!isSectionValid(definition, section, files)) return `Complete the required information for ${section.label}.`
  return undefined
}
