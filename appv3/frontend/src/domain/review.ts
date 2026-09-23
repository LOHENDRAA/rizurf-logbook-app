import type { JournalEntry, JournalReview, ReviewStatus } from '../types'

export interface ReviewCounts {
  pending: number
  approved: number
  changes_requested: number
}

/**
 * Company (first-stage) review status. Only submitted entries are reviewable:
 * a missing review on a submitted entry is treated as pending.
 */
export function getReviewStatus(entry: Pick<JournalEntry, 'status' | 'review'>): ReviewStatus | undefined {
  if (entry.status !== 'submitted') return undefined
  return entry.review?.status ?? 'pending'
}

/** Backwards-compatible alias: company review status. */
export const getCompanyReviewStatus = getReviewStatus

/**
 * Mentor (second-stage) review status. Returns the stored mentor decision, or
 * undefined when the week is unsubmitted or has never reached the mentor.
 * A missing mentor review on a company-approved submitted week is treated as
 * pending by `isMentorPending`, not here, so first-pass weeks stay hidden.
 */
export function getMentorReviewStatus(entry: Pick<JournalEntry, 'status' | 'mentorReview'>): ReviewStatus | undefined {
  if (entry.status !== 'submitted') return undefined
  return entry.mentorReview?.status
}

/** Eligible for approval / request-changes: submitted and pending. */
export function isPendingReview(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  return getReviewStatus(entry) === 'pending'
}

export function isApproved(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  return getReviewStatus(entry) === 'approved'
}

/** Mentor can only see a week after the company has approved it. */
export function isMentorEligible(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  if (entry.status !== 'submitted') return false
  return getReviewStatus(entry) === 'approved'
}

/**
 * Mentor action gate: company approved + mentor pending. A missing
 * mentorReview on an eligible week counts as pending (first mentor review).
 */
export function isMentorPending(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  if (!isMentorEligible(entry)) return false
  return (entry.mentorReview?.status ?? 'pending') === 'pending'
}

/** Mentor-touched weeks stay visible read-only even while company re-reviews. */
export function isMentorVisible(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  if (entry.status !== 'submitted') return false
  if (isMentorEligible(entry)) return true
  return entry.mentorReview !== undefined
}

/** Completed iff submitted + company approved + mentor approved (derived, never stored). */
export function isCompleted(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  if (entry.status !== 'submitted') return false
  return getReviewStatus(entry) === 'approved' && entry.mentorReview?.status === 'approved'
}

/**
 * Overall review status for student display:
 * - changes_requested when either stage requested changes
 * - completed when both stages approved
 * - pending when submitted but not yet completed
 * - undefined when unsubmitted
 */
export type OverallReviewStatus = ReviewStatus | 'completed'

export function getOverallReviewStatus(
  entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>,
): OverallReviewStatus | undefined {
  if (entry.status !== 'submitted') return undefined
  const company = getReviewStatus(entry)
  const mentor = entry.mentorReview?.status
  if (company === 'changes_requested' || mentor === 'changes_requested') return 'changes_requested'
  if (company === 'approved' && mentor === 'approved') return 'completed'
  return 'pending'
}

/**
 * Company display status: immediately after the mentor requests changes the
 * company stage (still stored as approved) reads as needing re-review, so it
 * displays as pending until the intern resubmits and the company decides again.
 */
export function getCompanyDisplayStatus(
  entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>,
): ReviewStatus | undefined {
  const company = getReviewStatus(entry)
  if (company === undefined) return undefined
  if (company === 'approved' && entry.mentorReview?.status === 'changes_requested') return 'pending'
  return company
}

/**
 * Single lifecycle stage for weekly-log display (derived, never stored).
 * Exactly one badge per week:
 * - company changes_requested, or company approved + mentor changes_requested
 *   (pre-resubmit) => revision_required
 * - both approved => completed
 * - company approved + mentor pending/undefined => awaiting_mentor
 * - company pending otherwise (including post-resubmit where the company is
 *   pending even if the mentor previously requested changes) => awaiting_company
 * - unsubmitted => undefined (callers show draft/not_started/locked/overdue)
 */
export type LifecycleStage = 'awaiting_company' | 'revision_required' | 'awaiting_mentor' | 'completed'

export function getLifecycleStatus(
  entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>,
): LifecycleStage | undefined {
  if (entry.status !== 'submitted') return undefined
  const company = getReviewStatus(entry)
  const mentor = entry.mentorReview?.status
  if (company === 'changes_requested') return 'revision_required'
  if (company === 'approved' && mentor === 'changes_requested') return 'revision_required'
  if (company === 'approved' && mentor === 'approved') return 'completed'
  if (company === 'approved') return 'awaiting_mentor'
  return 'awaiting_company'
}

export interface LifecycleCounts {
  awaiting_company: number
  revision_required: number
  awaiting_mentor: number
  completed: number
}

function emptyLifecycleCounts(): LifecycleCounts {
  return { awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 0 }
}

/** Submitted-only counts grouped by lifecycle stage (all submitted weeks). */
export function countLifecycleStages(
  entries: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>[],
): LifecycleCounts {
  const counts = emptyLifecycleCounts()
  for (const entry of entries) {
    const stage = getLifecycleStatus(entry)
    if (stage) counts[stage] += 1
  }
  return counts
}

/** Submitted-only counts grouped by lifecycle stage (mentor-visible weeks only). */
export function countMentorLifecycleStages(
  entries: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>[],
): LifecycleCounts {
  const counts = emptyLifecycleCounts()
  for (const entry of entries) {
    if (!isMentorVisible(entry)) continue
    const stage = getLifecycleStatus(entry)
    if (stage) counts[stage] += 1
  }
  return counts
}

/** Weeks still needing attention (everything except completed). */
export function lifecycleAttentionCount(counts: LifecycleCounts): number {
  return counts.awaiting_company + counts.revision_required + counts.awaiting_mentor
}

/** Approved entries are final: the student can no longer edit them. */
export function isLockedForStudent(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  if (entry.status !== 'submitted') return false
  return getReviewStatus(entry) !== 'changes_requested'
}

/**
 * Review state machine for student editing (pure):
 * - draft / not_started: daily + weekly editable, weekly-only submit gating.
 * - submitted + pending: weekly read-only; daily logs stay editable (separate
 *   optional record, never part of the weekly snapshot).
 * - submitted + approved: weekly read-only and final; daily logs stay editable.
 * - submitted + changes_requested: weekly report editable, daily logs editable.
 */
export function canEditDaily(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  void entry
  return true
}

export function canEditWeekly(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  if (entry.status !== 'submitted') return true
  return getReviewStatus(entry) === 'changes_requested'
}

/**
 * Dual-stage student edit gate: editable while unsubmitted, on the company
 * revision path, or on the pre-resubmit mentor revision path (company still
 * approved + mentor changes requested). Post-resubmit weeks (company pending
 * + mentor changes requested) stay locked awaiting the company decision.
 */
export function canEditWeeklyDual(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  if (entry.status !== 'submitted') return true
  if (getReviewStatus(entry) === 'changes_requested') return true
  return getReviewStatus(entry) === 'approved' && entry.mentorReview?.status === 'changes_requested'
}

/** Only a changes-requested week can be resubmitted by the student. */
export function canResubmit(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  return entry.status === 'submitted' && getReviewStatus(entry) === 'changes_requested'
}

/** Dual-stage resubmit gate (pre-resubmit states only; see canEditWeeklyDual). */
export function canResubmitDual(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  return canEditWeeklyDual(entry) && entry.status === 'submitted'
}

/** Read-only for the student: submitted unless changes were requested. */
export function isReadOnlyForStudent(entry: Pick<JournalEntry, 'status' | 'review'>): boolean {
  return entry.status === 'submitted' && getReviewStatus(entry) !== 'changes_requested'
}

/** Dual-stage read-only gate for the student weekly editor. */
export function isReadOnlyForStudentDual(entry: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>): boolean {
  return !canEditWeeklyDual(entry) && entry.status === 'submitted'
}

/** Request-changes feedback must be non-empty after trimming. */
export function isValidFeedback(feedback: string): boolean {
  return feedback.trim().length > 0
}

export function countReviews(entries: Pick<JournalEntry, 'status' | 'review'>[]): ReviewCounts {
  const counts: ReviewCounts = { pending: 0, approved: 0, changes_requested: 0 }
  for (const entry of entries) {
    const status = getReviewStatus(entry)
    if (status) counts[status] += 1
  }
  return counts
}

/** Number of submitted weeks still awaiting a decision. */
export function pendingCount(entries: Pick<JournalEntry, 'status' | 'review'>[]): number {
  return countReviews(entries).pending
}

/** Mentor queue counts: only mentor-eligible or mentor-touched weeks. */
export function countMentorReviews(entries: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>[]): ReviewCounts {
  const counts: ReviewCounts = { pending: 0, approved: 0, changes_requested: 0 }
  for (const entry of entries) {
    if (!isMentorVisible(entry)) continue
    const status = entry.mentorReview?.status ?? 'pending'
    counts[status] += 1
  }
  return counts
}

/** Number of mentor-visible weeks still awaiting a mentor decision. */
export function mentorPendingCount(entries: Pick<JournalEntry, 'status' | 'review' | 'mentorReview'>[]): number {
  return countMentorReviews(entries).pending
}

export function buildApproval(reviewedBy: string, reviewedAt: string, feedback?: string): JournalReview {
  const trimmed = (feedback ?? '').trim()
  return {
    status: 'approved',
    feedback: trimmed ? trimmed : undefined,
    reviewedBy,
    reviewedAt,
  }
}

export function buildChangesRequest(feedback: string, reviewedBy: string, reviewedAt: string): JournalReview {
  return { status: 'changes_requested', feedback: feedback.trim(), reviewedBy, reviewedAt }
}
