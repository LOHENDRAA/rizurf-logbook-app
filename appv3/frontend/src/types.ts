export type UserRole = 'student' | 'supervisor' | 'university_mentor'

export interface User {
  id: string
  name: string
  email: string
  /**
   * Legacy prototype field. Never populated from the API (responses carry no
   * passwords), never persisted, and never used for authentication decisions:
   * the server verifies credentials opaquely via the cookie session.
   * Retained as optional so older cached payloads still parse.
   */
  password?: string
  role: UserRole
  avatar: string
}

/** Backwards-compatible alias: a student is a user with role 'student'. */
export type Student = User

export interface Company {
  id: string
  name: string
}

export interface SupervisorProfile {
  userId: string
  companyId: string
}

export interface MentorProfile {
  userId: string
  studentIds: string[]
}

export interface InternshipPlacement {
  id: string
  studentId: string
  companyId: string
  universityName: string
  programmeName: string
  programmeTimeZone: string
  companyName: string
  position: string
  startDate: string
  endDate: string
}

export type JournalStatus = 'not_started' | 'draft' | 'submitted'

export type ReviewStatus = 'pending' | 'approved' | 'changes_requested'

export interface JournalReview {
  status: ReviewStatus
  feedback?: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface DailyEntry {
  /** Programme-local calendar date `YYYY-MM-DD`. */
  date: string
  body: string
  updatedAt?: string
}

export interface JournalEntry {
  id: string
  weekNumber: number
  startDate: string
  endDate: string
  /**
   * Deprecated working text from the pre-v5 weekly-only workflow. Always ''
   * for v5 entries: unsubmitted drafts live in `weeklyDraft`, submitted weeks
   * snapshot into `submittedBody`. Kept (empty) so old payloads still parse.
   */
  body: string
  status: JournalStatus
  updatedAt?: string
  submittedAt?: string
  review?: JournalReview
  /** Second-stage university review. Undefined until the company approves. */
  mentorReview?: JournalReview
  /** Every week carries Mon–Fri logs plus a separate weekly draft. */
  dailyEntries: DailyEntry[]
  weeklyDraft: string
  weeklyDraftUpdatedAt?: string
  /** Immutable snapshot reviewed by supervisors; working drafts never leak. */
  submittedBody?: string
}

export interface Journal {
  internshipId: string
  entries: JournalEntry[]
}

export interface PortalData {
  version: 8
  users: User[]
  companies: Company[]
  supervisors: SupervisorProfile[]
  mentors: MentorProfile[]
  internships: InternshipPlacement[]
  journals: Journal[]
}
