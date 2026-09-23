import { describe, expect, it } from 'vitest'
import {
  buildApproval,
  buildChangesRequest,
  canEditDaily,
  canEditWeekly,
  canEditWeeklyDual,
  canResubmit,
  canResubmitDual,
  countLifecycleStages,
  countMentorLifecycleStages,
  countReviews,
  getCompanyDisplayStatus,
  getLifecycleStatus,
  getMentorReviewStatus,
  getOverallReviewStatus,
  getReviewStatus,
  isApproved,
  isCompleted,
  isLockedForStudent,
  isMentorEligible,
  isMentorPending,
  isMentorVisible,
  isPendingReview,
  isValidFeedback,
  lifecycleAttentionCount,
  pendingCount,
} from './review'
import type { JournalEntry } from '../types'

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'week-1',
    weekNumber: 1,
    startDate: '2026-09-14',
    endDate: '2026-09-20',
    body: 'body',
    status: 'submitted',
    dailyEntries: [],
    weeklyDraft: '',
    ...overrides,
  } as JournalEntry
}

describe('getReviewStatus', () => {
  it('treats a missing review on a submitted entry as pending', () => {
    expect(getReviewStatus(entry({ review: undefined }))).toBe('pending')
  })

  it('returns undefined for drafts and not-started entries', () => {
    expect(getReviewStatus(entry({ status: 'draft', review: undefined }))).toBeUndefined()
    expect(getReviewStatus(entry({ status: 'not_started', review: undefined }))).toBeUndefined()
  })

  it('returns the stored review status for submitted entries', () => {
    expect(getReviewStatus(entry({ review: { status: 'approved' } }))).toBe('approved')
    expect(getReviewStatus(entry({ review: { status: 'changes_requested' } }))).toBe('changes_requested')
  })
})

describe('eligibility and locks', () => {
  it('marks only submitted pending weeks as eligible', () => {
    expect(isPendingReview(entry({ review: undefined }))).toBe(true)
    expect(isPendingReview(entry({ review: { status: 'pending' } }))).toBe(true)
    expect(isPendingReview(entry({ review: { status: 'approved' } }))).toBe(false)
    expect(isPendingReview(entry({ review: { status: 'changes_requested' } }))).toBe(false)
    expect(isPendingReview(entry({ status: 'draft' }))).toBe(false)
  })

  it('locks submitted weeks except the changes-requested revision path', () => {
    expect(isLockedForStudent(entry({ review: { status: 'approved' } }))).toBe(true)
    expect(isLockedForStudent(entry({ review: { status: 'pending' } }))).toBe(true)
    expect(isLockedForStudent(entry({ review: undefined }))).toBe(true)
    expect(isLockedForStudent(entry({ review: { status: 'changes_requested' } }))).toBe(false)
    expect(isLockedForStudent(entry({ status: 'draft' }))).toBe(false)
    expect(isApproved(entry({ review: { status: 'approved' } }))).toBe(true)
  })

  it('enforces the student edit matrix', () => {
    // Drafts: everything editable.
    expect(canEditDaily(entry({ status: 'draft' }))).toBe(true)
    expect(canEditWeekly(entry({ status: 'draft' }))).toBe(true)
    // Submitted weeks: weekly read-only except changes-requested; daily logs
    // stay editable as a separate optional record.
    expect(canEditDaily(entry({ review: { status: 'pending' } }))).toBe(true)
    expect(canEditWeekly(entry({ review: { status: 'pending' } }))).toBe(false)
    expect(canEditDaily(entry({ review: { status: 'approved' } }))).toBe(true)
    expect(canEditWeekly(entry({ review: { status: 'approved' } }))).toBe(false)
    // Submitted + changes requested: both editable.
    expect(canEditDaily(entry({ review: { status: 'changes_requested' } }))).toBe(true)
    expect(canEditWeekly(entry({ review: { status: 'changes_requested' } }))).toBe(true)
    expect(canResubmit(entry({ review: { status: 'changes_requested' } }))).toBe(true)
    expect(canResubmit(entry({ review: { status: 'pending' } }))).toBe(false)
    expect(canResubmit(entry({ review: { status: 'approved' } }))).toBe(false)
    expect(canResubmit(entry({ status: 'draft' }))).toBe(false)
  })
})

describe('feedback rule', () => {
  it('rejects empty and whitespace-only feedback', () => {
    expect(isValidFeedback('')).toBe(false)
    expect(isValidFeedback('   \n\t ')).toBe(false)
    expect(isValidFeedback('Please add examples.')).toBe(true)
  })

  it('trims feedback when building reviews', () => {
    expect(buildChangesRequest('  Add examples  ', 'Sarah', '2026-01-01').feedback).toBe('Add examples')
    expect(buildApproval('Sarah', '2026-01-01', '  ').feedback).toBeUndefined()
    expect(buildApproval('Sarah', '2026-01-01', ' Nice work ').feedback).toBe('Nice work')
  })
})

describe('countReviews', () => {
  it('counts submitted weeks by review status, treating missing as pending', () => {
    const entries = [
      entry({ review: undefined }),
      entry({ review: { status: 'approved' } }),
      entry({ review: { status: 'changes_requested' } }),
      entry({ status: 'draft' }),
      entry({ status: 'not_started' }),
    ]
    expect(countReviews(entries)).toEqual({ pending: 1, approved: 1, changes_requested: 1 })
    expect(pendingCount(entries)).toBe(1)
  })
})

describe('dual workflow (company -> mentor)', () => {
  it('gates mentor eligibility on company approval', () => {
    // First-pass company-pending weeks are never mentor-eligible.
    expect(isMentorEligible(entry({ review: undefined }))).toBe(false)
    expect(isMentorEligible(entry({ review: { status: 'pending' } }))).toBe(false)
    expect(isMentorEligible(entry({ review: { status: 'changes_requested' } }))).toBe(false)
    expect(isMentorEligible(entry({ review: { status: 'approved' } }))).toBe(true)
    expect(isMentorEligible(entry({ status: 'draft' }))).toBe(false)
  })

  it('treats a missing mentor review on an eligible week as pending', () => {
    expect(isMentorPending(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBe(true)
    expect(isMentorPending(entry({ review: { status: 'approved' }, mentorReview: { status: 'pending' } }))).toBe(true)
    expect(isMentorPending(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }))).toBe(false)
    expect(isMentorPending(entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }))).toBe(false)
    // Pre-approval weeks are never mentor-pending, even with a stored slot.
    expect(isMentorPending(entry({ review: { status: 'pending' }, mentorReview: { status: 'pending' } }))).toBe(false)
  })

  it('keeps mentor-touched weeks visible while hiding pre-approval weeks', () => {
    expect(isMentorVisible(entry({ review: { status: 'pending' }, mentorReview: undefined }))).toBe(false)
    expect(isMentorVisible(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBe(true)
    // Post-rejection re-review: company back to pending but mentor-touched.
    expect(isMentorVisible(entry({ review: { status: 'pending' }, mentorReview: { status: 'changes_requested' } }))).toBe(true)
    expect(isMentorVisible(entry({ status: 'draft' }))).toBe(false)
  })

  it('derives Completed only when both stages approve', () => {
    expect(isCompleted(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }))).toBe(true)
    expect(isCompleted(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBe(false)
    expect(isCompleted(entry({ review: { status: 'approved' }, mentorReview: { status: 'pending' } }))).toBe(false)
    expect(isCompleted(entry({ review: { status: 'pending' }, mentorReview: undefined }))).toBe(false)
    expect(isCompleted(entry({ review: { status: 'changes_requested' } }))).toBe(false)
  })

  it('derives the overall status with either rejection winning', () => {
    expect(getOverallReviewStatus(entry({ review: undefined }))).toBe('pending')
    expect(getOverallReviewStatus(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBe('pending')
    expect(getOverallReviewStatus(entry({ review: { status: 'changes_requested' } }))).toBe('changes_requested')
    expect(getOverallReviewStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }))).toBe(
      'changes_requested',
    )
    expect(getOverallReviewStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }))).toBe('completed')
    expect(getOverallReviewStatus(entry({ status: 'draft' }))).toBeUndefined()
  })

  it('reads the company stage as needing re-review right after a mentor rejection', () => {
    expect(getCompanyDisplayStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }))).toBe('pending')
    expect(getCompanyDisplayStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'pending' } }))).toBe('approved')
    expect(getCompanyDisplayStatus(entry({ review: { status: 'pending' } }))).toBe('pending')
    expect(getCompanyDisplayStatus(entry({ status: 'draft' }))).toBeUndefined()
  })

  it('returns the stored mentor decision without a pending default', () => {
    expect(getMentorReviewStatus(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBeUndefined()
    expect(getMentorReviewStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }))).toBe('approved')
    expect(getMentorReviewStatus(entry({ status: 'draft' }))).toBeUndefined()
  })

  it('reopens the weekly editor on either pre-resubmit revision path', () => {
    // Company revision path.
    expect(canEditWeeklyDual(entry({ review: { status: 'changes_requested' } }))).toBe(true)
    expect(canResubmitDual(entry({ review: { status: 'changes_requested' } }))).toBe(true)
    // Mentor revision path before the intern resubmits.
    expect(canEditWeeklyDual(entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }))).toBe(true)
    expect(canResubmitDual(entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }))).toBe(true)
    // Locked: awaiting company, awaiting mentor, or completed.
    expect(canEditWeeklyDual(entry({ review: { status: 'pending' } }))).toBe(false)
    expect(canEditWeeklyDual(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBe(false)
    expect(canEditWeeklyDual(entry({ review: { status: 'pending' }, mentorReview: { status: 'changes_requested' } }))).toBe(false)
    expect(canEditWeeklyDual(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }))).toBe(false)
    expect(canResubmitDual(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }))).toBe(false)
    // Unsubmitted weeks stay editable.
    expect(canEditWeeklyDual(entry({ status: 'draft' }))).toBe(true)
  })
})

describe('getLifecycleStatus', () => {
  it('returns undefined for unsubmitted weeks', () => {
    expect(getLifecycleStatus(entry({ status: 'draft' }))).toBeUndefined()
    expect(getLifecycleStatus(entry({ status: 'not_started' }))).toBeUndefined()
  })

  it('maps a missing company review on a submitted week to awaiting_company', () => {
    expect(getLifecycleStatus(entry({ review: undefined }))).toBe('awaiting_company')
    expect(getLifecycleStatus(entry({ review: { status: 'pending' } }))).toBe('awaiting_company')
  })

  it('maps company changes_requested to revision_required', () => {
    expect(getLifecycleStatus(entry({ review: { status: 'changes_requested' } }))).toBe('revision_required')
    expect(
      getLifecycleStatus(entry({ review: { status: 'changes_requested' }, mentorReview: { status: 'approved' } })),
    ).toBe('revision_required')
  })

  it('maps company approved + mentor changes_requested (pre-resubmit) to revision_required', () => {
    expect(
      getLifecycleStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } })),
    ).toBe('revision_required')
  })

  it('gives post-resubmit company-pending precedence over a stored mentor rejection', () => {
    // After the intern resubmits, the company decides again first: the week
    // awaits the company even though the mentor previously requested changes.
    expect(
      getLifecycleStatus(entry({ review: { status: 'pending' }, mentorReview: { status: 'changes_requested' } })),
    ).toBe('awaiting_company')
    expect(
      getLifecycleStatus(entry({ review: undefined, mentorReview: { status: 'changes_requested' } })),
    ).toBe('awaiting_company')
  })

  it('maps company approved + mentor pending/undefined to awaiting_mentor', () => {
    expect(getLifecycleStatus(entry({ review: { status: 'approved' }, mentorReview: undefined }))).toBe(
      'awaiting_mentor',
    )
    expect(
      getLifecycleStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'pending' } })),
    ).toBe('awaiting_mentor')
  })

  it('maps both approved to completed only', () => {
    expect(
      getLifecycleStatus(entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } })),
    ).toBe('completed')
    expect(
      getLifecycleStatus(entry({ review: { status: 'pending' }, mentorReview: { status: 'approved' } })),
    ).toBe('awaiting_company')
  })

  it('covers a full revision loop: pending -> revision -> resubmit -> mentor -> completed', () => {
    const week = entry({ review: { status: 'pending' } })
    expect(getLifecycleStatus(week)).toBe('awaiting_company')
    // Company requests changes: student must revise.
    expect(getLifecycleStatus(entry({ ...week, review: { status: 'changes_requested' } }))).toBe(
      'revision_required',
    )
    // Resubmit returns the week to the company queue.
    expect(getLifecycleStatus(entry({ ...week, review: { status: 'pending' } }))).toBe('awaiting_company')
    // Company approves: now the mentor decides.
    expect(getLifecycleStatus(entry({ ...week, review: { status: 'approved' } }))).toBe('awaiting_mentor')
    // Mentor requests changes (pre-resubmit): back to revision.
    expect(
      getLifecycleStatus(
        entry({ ...week, review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }),
      ),
    ).toBe('revision_required')
    // Resubmit after a mentor rejection: company decides again first.
    expect(
      getLifecycleStatus(
        entry({ ...week, review: { status: 'pending' }, mentorReview: { status: 'changes_requested' } }),
      ),
    ).toBe('awaiting_company')
    // Both approve: completed.
    expect(
      getLifecycleStatus(
        entry({ ...week, review: { status: 'approved' }, mentorReview: { status: 'approved' } }),
      ),
    ).toBe('completed')
  })
})

describe('countLifecycleStages', () => {
  it('counts submitted weeks by lifecycle stage and skips unsubmitted weeks', () => {
    const entries = [
      entry({ review: undefined }),
      entry({ review: { status: 'pending' } }),
      entry({ review: { status: 'changes_requested' } }),
      entry({ review: { status: 'approved' }, mentorReview: undefined }),
      entry({ review: { status: 'approved' }, mentorReview: { status: 'pending' } }),
      entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }),
      entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }),
      entry({ review: { status: 'pending' }, mentorReview: { status: 'changes_requested' } }),
      entry({ status: 'draft' }),
      entry({ status: 'not_started' }),
    ]
    expect(countLifecycleStages(entries)).toEqual({
      awaiting_company: 3,
      revision_required: 2,
      awaiting_mentor: 2,
      completed: 1,
    })
  })

  it('counts mentor-visible weeks only for the mentor queue', () => {
    const entries = [
      // First-pass company-pending: invisible to mentors, excluded.
      entry({ review: { status: 'pending' } }),
      entry({ review: { status: 'approved' }, mentorReview: undefined }),
      entry({ review: { status: 'approved' }, mentorReview: { status: 'approved' } }),
      entry({ review: { status: 'approved' }, mentorReview: { status: 'changes_requested' } }),
      // Post-resubmit re-review: mentor-touched, still visible.
      entry({ review: { status: 'pending' }, mentorReview: { status: 'changes_requested' } }),
      entry({ status: 'draft' }),
    ]
    expect(countMentorLifecycleStages(entries)).toEqual({
      awaiting_company: 1,
      revision_required: 1,
      awaiting_mentor: 1,
      completed: 1,
    })
  })

  it('sums every non-completed stage as needing attention', () => {
    expect(
      lifecycleAttentionCount({ awaiting_company: 2, revision_required: 1, awaiting_mentor: 1, completed: 3 }),
    ).toBe(4)
    expect(
      lifecycleAttentionCount({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 0 }),
    ).toBe(0)
  })
})

