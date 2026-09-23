import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getWeekAvailability } from '../domain/internship'
import { isWeekday } from '../domain/daily'
import { countWords } from '../domain/journal'
import { getWeeklyReadiness } from '../domain/weeklyReadiness'
import { getProgrammeDate, isValidDateString } from '../domain/dates'
import { buildApproval, buildChangesRequest, canEditWeeklyDual, canResubmitDual, getReviewStatus, isValidFeedback } from '../domain/review'
import { mockPortalRepository } from '../services/mockPortalRepository'
import { clearAllRecoveryDrafts } from '../recovery/draftStore'
import type { PortalRepository } from '../services/portalRepository'
import type { Company, InternshipPlacement, Journal, MentorProfile, PortalData, User, UserRole } from '../types'

export interface SubmitJournalResult {
  ok: boolean
  message: string
  words: number
}

export interface ReviewActionResult {
  ok: boolean
  message: string
}

/** Autosave limit for the student weekly summary (debounced, no manual save). */
export const WEEKLY_SUMMARY_MAX_LENGTH = 5000

interface AppContextValue {
  data: PortalData
  currentUser?: User
  currentRole?: UserRole
  currentStudent?: User
  currentSupervisor?: User
  supervisorCompany?: Company
  currentMentor?: User
  mentorProfile?: MentorProfile
  assignedStudents: User[]
  currentInternship?: InternshipPlacement
  currentJournal?: Journal
  ready: boolean
  loadError: string | null
  retryLoad: () => Promise<void>
  dismissLoadError: () => void
  login: (email: string, password: string) => boolean
  switchUser: (userId: string) => void
  logout: () => void
  resetDemo: () => Promise<void>
  updateJournalBody: (internshipId: string, weekNumber: number, body: string) => void
  submitJournal: (internshipId: string, weekNumber: number, explicitDraft?: string) => Promise<SubmitJournalResult>
  updateDailyBody: (internshipId: string, weekNumber: number, date: string, body: string) => void
  saveDailyNow: () => void
  updateWeeklyDraft: (internshipId: string, weekNumber: number, draft: string) => void
  submitWeekly: (internshipId: string, weekNumber: number, explicitDraft?: string) => Promise<SubmitJournalResult>
  approveWeek: (studentId: string, weekNumber: number, feedback?: string) => Promise<ReviewActionResult>
  requestChanges: (studentId: string, weekNumber: number, feedback: string) => Promise<ReviewActionResult>
  isInSupervisorCompany: (studentId: string) => boolean
  isAssignedMentor: (studentId: string) => boolean
}

const AppContext = createContext<AppContextValue | null>(null)
export const SESSION_KEY = 'portal-user'
const LEGACY_SESSION_KEY = 'portal-student'
const SAVE_DEBOUNCE_MS = 400
// Generic on purpose: storage failures may carry sensitive or confusing
// internals, so the UI never surfaces the original error.
const SAVE_ERROR_MESSAGE = 'We couldn\u2019t save your changes. Please try again.'
const LOAD_ERROR_MESSAGE =
  'We couldn\u2019t load your saved workspace, so we started you with fresh demo data. You can retry loading or reset the demo.'

function readSession(): string | undefined {
  return sessionStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(LEGACY_SESSION_KEY) ?? undefined
}

function isWeekLocked(
  internships: PortalData['internships'],
  journals: PortalData['journals'],
  internshipId: string,
  weekNumber: number,
): boolean {
  const placement = internships.find((item) => item.id === internshipId)
  const journal = journals.find((candidate) => candidate.internshipId === internshipId)
  const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
  if (!journal || !entry) return false
  const today = placement ? getProgrammeDate(new Date(), placement.programmeTimeZone) : entry.endDate
  return getWeekAvailability(entry, today) === 'locked'
}

function deriveWeekStatus(entry: { dailyEntries?: { body: string }[]; weeklyDraft?: string }): 'not_started' | 'draft' {
  void entry.dailyEntries
  const hasWeekly = (entry.weeklyDraft ?? '').trim().length > 0
  return hasWeekly ? 'draft' : 'not_started'
}

export function AppProvider({ children, repository = mockPortalRepository }: { children: ReactNode; repository?: PortalRepository }) {
  const [data, setData] = useState<PortalData>(() => repository.createDemoData(new Date()))
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(() => readSession())
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Serializes durable workflow writes so concurrent transitions (e.g. rapid
  // double-click) cannot interleave saves out of order.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const userIdRef = useRef(currentUserId)
  userIdRef.current = currentUserId

  const cancelPendingSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  /**
   * Durable transition helper: persists `next` before committing it to state.
   * Cancels the debounced autosave first so a stale timer cannot overwrite the
   * transition afterwards. Returns false (without touching state) on failure.
   */
  const persistTransition = useCallback(
    async (next: PortalData): Promise<boolean> => {
      cancelPendingSave()
      const task = saveChainRef.current.then(() => repository.save(next))
      saveChainRef.current = task.then(
        () => undefined,
        () => undefined,
      )
      try {
        await task
      } catch {
        return false
      }
      dataRef.current = next
      setData(next)
      return true
    },
    [cancelPendingSave, repository],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const saved = await repository.load()
        if (cancelled) return
        setData(saved ?? repository.createDemoData(new Date()))
        setLoadError(null)
      } catch {
        if (cancelled) return
        // Never leave the splash stuck: fall back to demo data and let the
        // app surface a non-blocking recovery banner instead.
        setData(repository.createDemoData(new Date()))
        setLoadError(LOAD_ERROR_MESSAGE)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [repository])

  // Non-blocking retry: ready stays true so the app remains usable while the
  // reload settles. Failures keep demo data plus the recovery banner.
  const retryLoad = useCallback(async () => {
    try {
      const saved = await repository.load()
      setData(saved ?? repository.createDemoData(new Date()))
      setLoadError(null)
    } catch {
      setData(repository.createDemoData(new Date()))
      setLoadError(LOAD_ERROR_MESSAGE)
    }
  }, [repository])

  const dismissLoadError = useCallback(() => {
    setLoadError(null)
  }, [])

  // Keystrokes update state immediately; persistence is debounced so typing
  // does not write to IndexedDB on every character. Save failures (e.g. quota)
  // are swallowed so they can never hang the UI; edits stay in memory.
  useEffect(() => {
    if (!ready) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void repository.save(dataRef.current).catch(() => {})
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data, ready, repository])

  // Flush the latest state on unmount so the debounce never loses the last edit.
  useEffect(
    () => () => {
      if (ready) void repository.save(dataRef.current).catch(() => {})
    },
    [ready, repository],
  )

  const currentUser = data.users.find((user) => user.id === currentUserId)
  const currentRole = currentUser?.role
  const currentStudent = currentRole === 'student' ? currentUser : undefined
  const currentSupervisor = currentRole === 'supervisor' ? currentUser : undefined
  const supervisorProfile = currentSupervisor ? data.supervisors.find((profile) => profile.userId === currentSupervisor.id) : undefined
  const supervisorCompany = supervisorProfile ? data.companies.find((company) => company.id === supervisorProfile.companyId) : undefined
  const currentMentor = currentRole === 'university_mentor' ? currentUser : undefined
  const mentorProfile = currentMentor ? data.mentors?.find((profile) => profile.userId === currentMentor.id) : undefined
  const assignedStudents = mentorProfile
    ? mentorProfile.studentIds
        .map((studentId) => data.users.find((user) => user.id === studentId && user.role === 'student'))
        .filter((user): user is User => !!user)
    : []
  const currentInternship = currentStudent ? data.internships.find((internship) => internship.studentId === currentStudent.id) : undefined
  const currentJournal = currentInternship ? data.journals.find((journal) => journal.internshipId === currentInternship.id) : undefined

  const isInSupervisorCompany = (studentId: string): boolean => {
    if (!supervisorProfile) return false
    const placement = dataRef.current.internships.find((internship) => internship.studentId === studentId)
    return placement?.companyId === supervisorProfile.companyId
  }

  const isAssignedMentor = (studentId: string): boolean => {
    if (!mentorProfile) return false
    return mentorProfile.studentIds.includes(studentId)
  }

  const selectUser = (id: string) => {
    sessionStorage.setItem(SESSION_KEY, id)
    sessionStorage.removeItem(LEGACY_SESSION_KEY)
    setCurrentUserId(id)
  }

  const login = (email: string, _password: string) => {
    // Prototype compatibility: the password is verified server-side via the
    // cookie session in production, so the local store matches identity by
    // email only and never compares secrets. The argument is retained so
    // existing call sites keep working.
    void _password
    const user = data.users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase())
    if (!user) return false
    selectUser(user.id)
    return true
  }

  /**
   * Dev/test-only session switcher with no UI entry point in production.
   * There are no one-click sign-in buttons or routes; production sessions
   * come from the server (/me) via the cookie session.
   */
  const switchUser = (userId: string) => {
    const user = data.users.find((candidate) => candidate.id === userId)
    if (user) selectUser(user.id)
  }

  const logout = () => {
    // Recovery drafts are user-scoped: wipe them so the next session cannot
    // read another user's unsynced text.
    try {
      if (currentUserId) clearAllRecoveryDrafts(currentUserId)
    } catch {
      // Best effort.
    }
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(LEGACY_SESSION_KEY)
    setCurrentUserId(undefined)
  }

  const resetDemo = async () => {
    try {
      await repository.clear()
    } catch {
      // Storage may be unavailable; still reset the in-memory workspace.
    }
    setData(repository.createDemoData(new Date()))
    setLoadError(null)
  }

  const updateDailyBody = (internshipId: string, weekNumber: number, date: string, body: string) => {
    const journal = dataRef.current.journals.find((candidate) => candidate.internshipId === internshipId)
    const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
    if (!journal || !entry) return
    // Daily logs are a separate optional record: no status-based lock.
    // Availability gate (mirrors DayPage): only valid scheduled weekdays can
    // be written. Stored legacy logs outside these rules are never touched.
    if (!isValidDateString(date)) return
    try {
      if (!isWeekday(date)) return
    } catch {
      return
    }
    if (date < entry.startDate || date > entry.endDate) return
    const placement = dataRef.current.internships.find((item) => item.id === internshipId)
    const today = placement ? getProgrammeDate(new Date(), placement.programmeTimeZone) : entry.endDate
    if (date > today) return
    if (getWeekAvailability(entry, today) === 'locked') return
    const timestamp = new Date().toISOString()
    setData((previous) => ({
      ...previous,
      journals: previous.journals.map((j) => {
        if (j.internshipId !== internshipId) return j
        return {
          ...j,
          entries: j.entries.map((e) => {
            if (e.weekNumber !== weekNumber) return e
            const existing = e.dailyEntries ?? []
            const next = existing.some((day) => day.date === date)
              ? existing.map((day) => (day.date !== date ? day : { ...day, body, updatedAt: timestamp }))
              : [...existing, { date, body, updatedAt: timestamp }].sort((a, b) =>
                  a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
                )
            // Submitted weeks keep their status: working edits never change
            // the supervisor snapshot until an explicit (re)submit.
            if (e.status === 'submitted') {
              return { ...e, dailyEntries: next, updatedAt: timestamp }
            }
            return { ...e, dailyEntries: next, status: deriveWeekStatus({ dailyEntries: next, weeklyDraft: e.weeklyDraft }), updatedAt: timestamp }
          }),
        }
      }),
    }))
  }

  // Immediate persistence for the Save button: flush the latest in-memory
  // state to storage without any UI message. Failures are swallowed so they
  // can never hang the UI; edits stay in memory.
  const saveDailyNow = useCallback(() => {
    void repository.save(dataRef.current).catch(() => {})
  }, [repository])

  const updateWeeklyDraft = (internshipId: string, weekNumber: number, draft: string) => {
    // Over-limit text is never persisted; the editor keeps it locally and
    // blocks submission until it is shortened.
    if (draft.length > WEEKLY_SUMMARY_MAX_LENGTH) return
    const journal = dataRef.current.journals.find((candidate) => candidate.internshipId === internshipId)
    const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
    if (!journal || !entry) return
    if (isWeekLocked(dataRef.current.internships, dataRef.current.journals, internshipId, weekNumber)) return
    // Submitted weeks are read-only except the revision paths (company or
    // pre-resubmit mentor changes requested).
    if (!canEditWeeklyDual(entry)) return
    const timestamp = new Date().toISOString()
    setData((previous) => ({
      ...previous,
      journals: previous.journals.map((j) => {
        if (j.internshipId !== internshipId) return j
        return {
          ...j,
          entries: j.entries.map((e) => {
            if (e.weekNumber !== weekNumber) return e
            if (e.status === 'submitted') {
              return { ...e, weeklyDraft: draft, weeklyDraftUpdatedAt: timestamp, updatedAt: timestamp }
            }
            return {
              ...e,
              weeklyDraft: draft,
              weeklyDraftUpdatedAt: timestamp,
              status: deriveWeekStatus({ dailyEntries: e.dailyEntries, weeklyDraft: draft }),
              updatedAt: timestamp,
            }
          }),
        }
      }),
    }))
  }

  const updateJournalBody = (internshipId: string, weekNumber: number, body: string) => {
    // Single daily-plus-weekly workflow: the weekly editor always writes the
    // weekly draft (kept for older call sites).
    updateWeeklyDraft(internshipId, weekNumber, body)
  }

  const submitWeekly = useCallback(
    async (internshipId: string, weekNumber: number, explicitDraft?: string): Promise<SubmitJournalResult> => {
      const snapshot = dataRef.current
      const journal = snapshot.journals.find((candidate) => candidate.internshipId === internshipId)
      const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
      if (!journal || !entry) return { ok: false, message: 'Journal week could not be found.', words: 0 }
      // Explicit draft wins so the submit path can use the latest textarea
      // value even when the debounced autosave has not flushed yet.
      const draft = explicitDraft ?? entry.weeklyDraft ?? ''
      if (draft.length > WEEKLY_SUMMARY_MAX_LENGTH) {
        return { ok: false, message: `Weekly log must be ${WEEKLY_SUMMARY_MAX_LENGTH} characters or fewer. You have ${draft.length}.`, words: countWords(draft) }
      }
      const placement = snapshot.internships.find((item) => item.id === internshipId)
      const today = placement ? getProgrammeDate(new Date(), placement.programmeTimeZone) : entry.endDate
      if (getWeekAvailability(entry, today) === 'locked') {
        return { ok: false, message: `This week has not started yet. It unlocks on ${entry.startDate}.`, words: 0 }
      }
      // State machine: first submit from draft/not_started, resubmit only from
      // a revision path (company changes requested, or company approved +
      // mentor changes requested before the intern resubmits). Pending weeks
      // are already awaiting review and completed/approved-pending weeks are
      // final for the intern.
      if (entry.status === 'submitted') {
        if (!canResubmitDual(entry)) {
          const companyStatus = getReviewStatus(entry)
          if (companyStatus === 'pending') {
            return { ok: false, message: 'This week is already submitted and awaiting review.', words: countWords(draft) }
          }
          return { ok: false, message: 'This week is approved and final.', words: countWords(draft) }
        }
      }
      // Submission needs any non-empty weekly draft. Daily logs are
      // optional and never gate submission.
      const readiness = getWeeklyReadiness({ ...entry, weeklyDraft: draft }, today)
      if (!readiness.canSubmit) {
        return { ok: false, message: readiness.reasons[0] ?? 'This week is not ready to submit yet.', words: readiness.words }
      }
      const isResubmit = entry.status === 'submitted'
      const timestamp = new Date().toISOString()
      const next: PortalData = {
        ...snapshot,
        journals: snapshot.journals.map((candidate) => {
          if (candidate.internshipId !== internshipId) return candidate
          return {
            ...candidate,
            entries: candidate.entries.map((item) => {
              if (item.weekNumber !== weekNumber) return item
              const previousReview = item.review
              const review =
                previousReview && previousReview.status !== 'pending'
                  ? { ...previousReview, status: 'pending' as const }
                  : (previousReview ?? { status: 'pending' as const })
              return {
                ...item,
                status: 'submitted',
                updatedAt: timestamp,
                submittedAt: timestamp,
                // Submitted snapshot and working draft converge on resubmit so
                // an unchanged-text resubmit still refreshes the snapshot.
                weeklyDraft: draft,
                weeklyDraftUpdatedAt: timestamp,
                submittedBody: draft,
                // Company returns to pending (feedback preserved); the mentor
                // slot is preserved untouched (undefined stays undefined,
                // changes_requested stays until the company re-approves).
                review,
                mentorReview: item.mentorReview,
              }
            }),
          }
        }),
      }
      const saved = await persistTransition(next)
      if (!saved) return { ok: false, message: SAVE_ERROR_MESSAGE, words: readiness.words }
      return { ok: true, message: isResubmit ? 'Week resubmitted.' : 'Week submitted.', words: readiness.words }
    },
    [persistTransition],
  )

  const submitJournal = useCallback(
    (internshipId: string, weekNumber: number, explicitDraft?: string): Promise<SubmitJournalResult> => {
      // Single daily-plus-weekly workflow (kept for older call sites).
      return submitWeekly(internshipId, weekNumber, explicitDraft)
    },
    [submitWeekly],
  )

  const reviewerName = () => {
    const snap = dataRef.current
    const user = snap.users.find((candidate) => candidate.id === userIdRef.current)
    if (user?.name) return user.name
    return user?.role === 'university_mentor' ? 'University Mentor' : 'Supervisor'
  }

  const reviewEntry = useCallback(
    async (
      studentId: string,
      weekNumber: number,
      apply: (reviewedBy: string, reviewedAt: string) => { review: NonNullable<Journal['entries'][number]['review']> } | { error: string },
    ): Promise<ReviewActionResult> => {
      // Fresh snapshot: transitions must never act on a stale render closure.
      const snapshot = dataRef.current
      const currentUser = snapshot.users.find((candidate) => candidate.id === userIdRef.current)
      const reviewedAt = new Date().toISOString()

      // University mentor path: mentor slot + assignment scope +
      // company-approved gate. Supervisors can never touch the mentor slot.
      if (currentUser?.role === 'university_mentor') {
        const profile = snapshot.mentors?.find((item) => item.userId === currentUser.id)
        if (!profile) return { ok: false, message: 'Only university mentors can review journals.' }
        if (!profile.studentIds.includes(studentId)) return { ok: false, message: 'Access denied: this intern is not assigned to you.' }
        const placement = snapshot.internships.find((internship) => internship.studentId === studentId)
        if (!placement) return { ok: false, message: 'Access denied: this intern is not assigned to you.' }
        const journal = snapshot.journals.find((candidate) => candidate.internshipId === placement.id)
        const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
        if (!journal || !entry) return { ok: false, message: 'Journal week could not be found.' }
        if (entry.status !== 'submitted') return { ok: false, message: 'Only submitted entries can be reviewed.' }
        if (getReviewStatus(entry) !== 'approved') return { ok: false, message: 'This week is awaiting company review.' }
        if ((entry.mentorReview?.status ?? 'pending') !== 'pending') return { ok: false, message: 'Only weeks pending review can be reviewed.' }
        const outcome = apply(reviewerName(), reviewedAt)
        if ('error' in outcome) return { ok: false, message: outcome.error }
        const nextReview = outcome.review
        const next: PortalData = {
          ...snapshot,
          journals: snapshot.journals.map((candidate) => {
            if (candidate.internshipId !== placement.id) return candidate
            return {
              ...candidate,
              entries: candidate.entries.map((item) => (item.weekNumber !== weekNumber ? item : { ...item, mentorReview: nextReview })),
            }
          }),
        }
        const saved = await persistTransition(next)
        if (!saved) return { ok: false, message: SAVE_ERROR_MESSAGE }
        return { ok: true, message: 'Review saved.' }
      }

      const supervisorProfile = currentUser?.role === 'supervisor'
        ? snapshot.supervisors.find((profile) => profile.userId === currentUser.id)
        : undefined
      if (currentUser?.role !== 'supervisor' || !supervisorProfile) return { ok: false, message: 'Only supervisors can review journals.' }
      const placement = snapshot.internships.find((internship) => internship.studentId === studentId)
      if (!placement || placement.companyId !== supervisorProfile.companyId) return { ok: false, message: 'Access denied: this intern is not in your company.' }
      const journal = snapshot.journals.find((candidate) => candidate.internshipId === placement.id)
      const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)
      if (!journal || !entry) return { ok: false, message: 'Journal week could not be found.' }
      if (entry.status !== 'submitted') return { ok: false, message: 'Only submitted entries can be reviewed.' }
      if (getReviewStatus(entry) !== 'pending') return { ok: false, message: 'Only weeks pending review can be reviewed.' }
      const outcome = apply(reviewerName(), reviewedAt)
      if ('error' in outcome) return { ok: false, message: outcome.error }
      const nextReview = outcome.review
      // Company approval opens the mentor queue: a first approval creates a
      // pending mentor slot, and re-approval after a mentor rejection returns
      // the mentor to pending while preserving its feedback.
      let nextMentor = entry.mentorReview
      if (nextReview.status === 'approved') {
        if (!nextMentor) nextMentor = { status: 'pending' as const }
        else if (nextMentor.status === 'changes_requested') nextMentor = { ...nextMentor, status: 'pending' as const }
      }
      const next: PortalData = {
        ...snapshot,
        journals: snapshot.journals.map((candidate) => {
          if (candidate.internshipId !== placement.id) return candidate
          return {
            ...candidate,
            entries: candidate.entries.map((item) =>
              item.weekNumber !== weekNumber ? item : { ...item, review: nextReview, mentorReview: nextMentor },
            ),
          }
        }),
      }
      const saved = await persistTransition(next)
      if (!saved) return { ok: false, message: SAVE_ERROR_MESSAGE }
      return { ok: true, message: 'Review saved.' }
    },
    [persistTransition],
  )

  const approveWeek = useCallback(
    (studentId: string, weekNumber: number, feedback?: string): Promise<ReviewActionResult> =>
      reviewEntry(studentId, weekNumber, (reviewedBy, reviewedAt) => ({
        review: buildApproval(reviewedBy, reviewedAt, feedback),
      })),
    [reviewEntry],
  )

  const requestChanges = useCallback(
    (studentId: string, weekNumber: number, feedback: string): Promise<ReviewActionResult> => {
      if (!isValidFeedback(feedback)) return Promise.resolve({ ok: false, message: 'Feedback is required to request changes.' })
      return reviewEntry(studentId, weekNumber, (reviewedBy, reviewedAt) => ({
        review: buildChangesRequest(feedback, reviewedBy, reviewedAt),
      }))
    },
    [reviewEntry],
  )

  return (
    <AppContext.Provider
      value={{
        data,
        currentUser,
        currentRole,
        currentStudent,
        currentSupervisor,
        supervisorCompany,
        currentMentor,
        mentorProfile,
        assignedStudents,
        currentInternship,
        currentJournal,
        ready,
        loadError,
        retryLoad,
        dismissLoadError,
        login,
        switchUser,
        logout,
        resetDemo,
        updateJournalBody,
        submitJournal,
        updateDailyBody,
        saveDailyNow,
        updateWeeklyDraft,
        submitWeekly,
        approveWeek,
        requestChanges,
        isInSupervisorCompany,
        isAssignedMentor,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
