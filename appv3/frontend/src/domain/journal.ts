import type { JournalEntry, JournalStatus } from '../types'

/** Word count: trim, split on whitespace (including newlines), drop empties. Kept for supervisor informational displays. */
export function countWords(body: string): number {
  return (body ?? '').trim().split(/\s+/).filter(Boolean).length
}

export function canSubmit(body: string): { ok: boolean; words: number } {
  const words = countWords(body)
  return { ok: (body ?? '').trim().length > 0, words }
}

/**
 * Stored status after an edit.
 * - Non-submitted: any content → draft, empty → not_started.
 * - Submitted: stays submitted while non-empty, otherwise falls back to draft.
 */
export function nextStoredStatus(current: JournalStatus, words: number): JournalStatus {
  if (current === 'submitted') return words > 0 ? 'submitted' : 'draft'
  return words > 0 ? 'draft' : 'not_started'
}

export function markSubmitted(submittedAt: string): Pick<JournalEntry, 'status' | 'updatedAt' | 'submittedAt'> {
  return { status: 'submitted', updatedAt: submittedAt, submittedAt }
}

/**
 * Whether a submission happened after its week ended. The MVP never renders a
 * late label, but the rule is kept explicit.
 */
export function isLateSubmission(weekEndDate: string, submittedAt: string): boolean {
  return submittedAt.slice(0, 10) > weekEndDate
}

export function journalStats(entries: JournalEntry[]): { submitted: number; total: number; percent: number } {
  const total = entries.length
  const submitted = entries.filter((entry) => entry.status === 'submitted').length
  return { submitted, total, percent: total === 0 ? 0 : Math.round((submitted / total) * 100) }
}
