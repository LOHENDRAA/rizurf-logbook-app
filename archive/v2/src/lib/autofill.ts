import { DOCUMENTS } from '../data'
import {
  GLOBAL_COMPANY_ADDRESS,
  LOCKED_KEYS as CENTRAL_LOCKED_KEYS,
  addDaysUtc,
  assessmentLockedFields,
  attendanceDateDefaults,
  attendanceLockedFields,
  canonicalClearanceFields,
  canonicalP1CoverFields,
  canonicalP2CoverFields,
  logbookLockedFields,
  placementExtrasFor,
  weeklyDateDefaults,
} from '../data'
import type { AppData, DocumentDefinition, DocumentRecord, InternRecord, SectionRecord, SignatureProfile, User } from '../types'

/**
 * Application logic for auto-filled values. All sources, canonical builders,
 * date math, and locked/editable-default metadata live in `../data.ts`; this
 * module only applies them (locked overwrite vs fill-missing), migrates
 * records, and hydrates saved state.
 */

// Re-export central config so existing import sites keep working while the
// single source of truth stays in `../data.ts`.
export { GLOBAL_COMPANY_ADDRESS as CANONICAL_COMPANY_ADDRESS }
export { GLOBAL_COMPANY_ADDRESS }
export { addDaysUtc, assessmentLockedFields, attendanceDateDefaults, attendanceLockedFields }
export { canonicalClearanceFields, canonicalP1CoverFields, canonicalP2CoverFields }
export { logbookLockedFields, placementExtrasFor, weeklyDateDefaults }
export const LOCKED_KEYS = CENTRAL_LOCKED_KEYS
export const P1_COVER_LOCKED_KEYS = CENTRAL_LOCKED_KEYS['p1-cover']
export const P2_COVER_LOCKED_KEYS = CENTRAL_LOCKED_KEYS['p2-cover']
export const COVER_LOCKED_KEYS: Record<string, readonly string[]> = {
  'p1-cover': CENTRAL_LOCKED_KEYS['p1-cover'],
  'p2-cover': CENTRAL_LOCKED_KEYS['p2-cover'],
}

/**
 * Merge defaults without treating an empty string as a missing answer.  This is
 * deliberately small and pure because it is also used when migrating records
 * from older versions of the prototype.
 */
export function fillMissingFields(existing: Record<string, string | undefined>, defaults: Record<string, string | undefined>) {
  const result = { ...existing }
  Object.entries(defaults).forEach(([key, value]) => {
    if (result[key] === undefined && value !== undefined) result[key] = value
  })
  return result as Record<string, string>
}

function withoutUndefined(values: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Record<string, string>
}

/** Apply only safe, centrally-known defaults to a document record. */
export function autofillDocument(record: InternRecord, definition: DocumentDefinition, document: DocumentRecord, user: User, supervisor?: User): DocumentRecord {
  if (definition.id === 'p1-cover') {
    // Locked p1 cover fields are canonical and no longer editable, so stale or
    // manually changed saved values are replaced. mentorName and any other
    // manual state are preserved because the canonical map omits them.
    const canonical = canonicalP1CoverFields(record, user)
    return {
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        fields: { ...(section.fields ?? {}), ...canonical },
      })),
    }
  }
  if (definition.id === 'p2-cover') {
    // All p2 cover placement values are canonical like p1 (hidden, locked in
    // the editor); mentorName is the only manual field and is preserved.
    const canonical = canonicalP2CoverFields(record, user)
    return {
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        fields: { ...(section.fields ?? {}), ...canonical },
      })),
    }
  }
  if (definition.id === 'p2-clearance') {
    // All 8 clearance fields are locked canonical values (hidden in the
    // editor, preview/PDF only) with no manual companion, so the section
    // stores exactly those keys — never invisible startDate/endDate. An
    // unknown supervisor leaves supervisorName out instead of writing
    // undefined.
    const canonical = withoutUndefined(canonicalClearanceFields(record, user, supervisor))
    return {
      ...document,
      sections: document.sections.map((section) => {
        const existing = section.fields ?? {}
        // When the supervisor cannot be resolved there is no canonical name
        // to refresh with, so keep the stored one instead of dropping it.
        const keepSupervisor: Record<string, string> =
          supervisor?.name === undefined && existing.supervisorName ? { supervisorName: existing.supervisorName } : {}
        return { ...section, fields: { ...keepSupervisor, ...canonical } }
      }),
    }
  }
  if (definition.kind === 'logbook') {
    // Per-section identity + calculated week dates are locked: stale saved
    // values are replaced while activities/reflection stay manual.
    return {
      ...document,
      sections: document.sections.map((section, index) => ({
        ...section,
        fields: { ...(section.fields ?? {}), ...logbookLockedFields(definition, index, record, user) },
      })),
    }
  }
  if (definition.id === 'p2-attendance') {
    // Header identity fields are locked canonical values (stored, not edited);
    // Monday–Friday dates are editable defaults filled only when missing, so
    // user corrections (including an explicit empty string) are preserved.
    const locked = withoutUndefined(attendanceLockedFields(record, user, supervisor))
    return {
      ...document,
      sections: document.sections.map((section, index) => ({
        ...section,
        fields: fillMissingFields({ ...(section.fields ?? {}), ...locked }, attendanceDateDefaults(index, record)),
      })),
    }
  }
  if (definition.id === 'p2-assessment') {
    // Header fields are locked canonical values; ratings, comments, and the
    // score stay supervisor-manual and are preserved.
    const canonical = withoutUndefined(assessmentLockedFields(record, user, supervisor))
    return {
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        fields: { ...(section.fields ?? {}), ...canonical },
      })),
    }
  }
  return document
}

/**
 * Reconcile the shared academic mentor value between the two covers.
 * Pure helper: if one side is blank/whitespace-only (or missing) and the
 * other is non-empty after trimming, the empty side is filled with the
 * non-empty side verbatim. Both-empty is a no-op; both-non-empty (even when
 * different) preserves both verbatim so hydration never destroys data —
 * the next user edit re-syncs them.
 */
export function reconcileCoverMentor(p1: string | undefined, p2: string | undefined): [string | undefined, string | undefined] {
  const p1Trimmed = (p1 ?? '').trim()
  const p2Trimmed = (p2 ?? '').trim()
  if (!p1Trimmed && p2Trimmed) return [p2, p2]
  if (!p2Trimmed && p1Trimmed) return [p1, p1]
  return [p1, p2]
}

function applyCoverMentorReconciliation(record: InternRecord) {
  const p1Doc = record.documents['p1-cover']
  const p2Doc = record.documents['p2-cover']
  const p1Section = p1Doc?.sections?.[0]
  const p2Section = p2Doc?.sections?.[0]
  if (!p1Section || !p2Section) return
  const [nextP1, nextP2] = reconcileCoverMentor(p1Section.fields.mentorName, p2Section.fields.mentorName)
  if (nextP1 !== undefined) p1Section.fields.mentorName = nextP1
  if (nextP2 !== undefined) p2Section.fields.mentorName = nextP2
}

function sectionFor(definition: DocumentDefinition, index: number, source?: SectionRecord): SectionRecord {
  return source ?? {
    id: `${definition.id}-section-${index + 1}`,
    label: definition.sections[index],
    status: 'not_started',
    fields: {},
    history: [],
  }
}

export function isValidTimestamp(value: unknown) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

/**
 * Backfill a missing/invalid `approvedAt` on an already-approved section from
 * existing historical evidence: the latest approval/completion history entry,
 * then `updatedAt`. Never uses the current time and never touches unapproved
 * sections.
 */
export function migrateSectionApproval(section: SectionRecord): SectionRecord {
  if (section.status !== 'approved' || isValidTimestamp(section.approvedAt)) return section
  const fromHistory = [...section.history].reverse().find((entry) => /approv|complet/i.test(entry.action) && isValidTimestamp(entry.date))?.date
  const candidate = fromHistory ?? (isValidTimestamp(section.updatedAt) ? section.updatedAt : undefined)
  return candidate ? { ...section, approvedAt: candidate } : section
}

/**
 * Per-profile signature merge. Seeded defaults (such as the demo supervisor
 * sample signature) fill in missing/empty fields, while saved values —
 * including user uploads — always take precedence. Unknown saved profiles
 * and extra saved fields are preserved.
 */
export function mergeSignatureProfiles(seed: Record<string, SignatureProfile>, saved?: Record<string, SignatureProfile>) {
  const merged: Record<string, SignatureProfile> = { ...(saved ?? {}) }
  Object.entries(seed).forEach(([userId, seedProfile]) => {
    const savedProfile = saved?.[userId]
    if (!savedProfile) { merged[userId] = { ...seedProfile }; return }
    merged[userId] = {
      ...savedProfile,
      signature: savedProfile.signature || seedProfile.signature,
      stamp: savedProfile.stamp || seedProfile.stamp,
    }
  })
  return merged
}

/**
 * Hydrate IndexedDB data without replacing user values, statuses, history, or
 * files. Old records may not contain documents/sections introduced later.
 * Exceptions: locked fields are canonical (see autofillDocument) and are
 * refreshed to current user/record values, and old records missing the newer
 * placement strings (department/identityNumber/contactNumber) fall back to
 * the seeded demo values for that intern.
 */
export function hydrateAppData(saved: AppData, seed: AppData): AppData {
  const users = saved.users?.length ? saved.users : seed.users
  const records = (saved.records ?? []).map((savedRecord) => {
    const seedRecord = seed.records.find((item) => item.internId === savedRecord.internId)
    const user = users.find((item) => item.id === savedRecord.internId) ?? seed.users.find((item) => item.id === savedRecord.internId)
    const supervisor = users.find((item) => item.id === savedRecord.supervisorId)
    if (!user) return savedRecord
    const fallbackExtras = placementExtrasFor(savedRecord.internId)
    const base = { ...seedRecord, ...savedRecord, documents: { ...(seedRecord?.documents ?? {}), ...(savedRecord.documents ?? {}) } } as InternRecord
    base.department = savedRecord.department ?? seedRecord?.department ?? fallbackExtras.department
    base.identityNumber = savedRecord.identityNumber ?? seedRecord?.identityNumber ?? fallbackExtras.identityNumber
    base.contactNumber = savedRecord.contactNumber ?? seedRecord?.contactNumber ?? fallbackExtras.contactNumber

    DOCUMENTS.forEach((definition) => {
      const oldDocument = base.documents[definition.id]
      const seedDocument = seedRecord?.documents[definition.id]
      const sourceSections = oldDocument?.sections ?? []
      const sections = definition.sections.map((label, index) => {
        const source = sourceSections[index] ?? sourceSections.find((item) => item.label === label)
        const base = { ...sectionFor(definition, index, source), label, fields: { ...(source?.fields ?? {}) }, history: source?.history ?? [] }
        return migrateSectionApproval(base)
      })
      const document = {
        ...(seedDocument ?? { id: definition.id, files: [], sections: [] }),
        ...(oldDocument ?? {}),
        id: oldDocument?.id ?? definition.id,
        files: oldDocument?.files ?? [],
        sections,
      }
      base.documents[definition.id] = autofillDocument(base, definition, document, user, supervisor)
    })
    // The two covers share one academic mentor value: fill a blank side from
    // the non-empty side for legacy one-sided records. Statuses, history,
    // and locked fields are untouched.
    applyCoverMentorReconciliation(base)
    return base
  })
  return {
    ...seed,
    ...saved,
    users,
    records,
    notifications: saved.notifications ?? seed.notifications,
    signatures: mergeSignatureProfiles(seed.signatures, saved.signatures),
  }
}
