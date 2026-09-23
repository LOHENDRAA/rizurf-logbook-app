/**
 * Managed (server-backed) views for reviewer queues, intern weeks, review
 * detail, and student read pages (overview/journal).
 *
 * Rendered only when the SessionProvider manages the session. Reads and
 * review transitions go through `src/api/portal` with versions/ETag +
 * If-Match and per-click idempotency keys; UI enablement additionally
 * honors server `capabilities`. Mutations disable while pending and preserve
 * prior UI on failure. Unmanaged mode keeps the legacy AppContext paths.
 *
 * Plain `useEffect` fetching is used (no react-query provider requirement)
 * so existing page tests render unchanged when unmanaged.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Users } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError, formatErrorForDisplay } from '../../api/errors'
import { newIdempotencyKey } from '../../api/client'
import {
  getMenteeWeek,
  getSupervisorWeek,
  listMenteeWeeks,
  listMentees,
  listSupervisorInterns,
  listSupervisorInternWeeks,
  mentorReview,
  supervisorReview,
  type ApiInternSummary,
  type ApiWeekDetail,
  type ApiWeekSummary,
} from '../../api/portal'
import { formatNumericDate, formatWeekdayName, getProgrammeDate, isValidDateString } from '../../domain/dates'
import { getWeekAvailability } from '../../domain/internship'
import { countWords } from '../../domain/journal'
import {
  countLifecycleStages,
  countMentorLifecycleStages,
  getLifecycleStatus,
  getMentorReviewStatus,
  getReviewStatus,
  isMentorPending,
  isMentorVisible,
  isValidFeedback,
  lifecycleAttentionCount,
  type LifecycleCounts,
} from '../../domain/review'
import { submittedBodyOf } from '../../domain/weeklyReadiness'
import { weekLabel } from '../../domain/weeks'
import { formatSupervisorDateOnly, formatSupervisorTimestamp } from '../../pages/supervisorInternHelpers'
import { reportTelemetry } from '../../observability/reporter'
import type { JournalEntry } from '../../types'
import { PageHeading } from '../../components/PageHeading'
import { StatusBadge } from '../../components/StatusBadge'
import { AccessDenied } from '../../components/AccessDenied'
import { apiSummaryToEntry, apiWeekToEntry } from '../journal/managedEditors'

export type ReviewMode = 'supervisor' | 'mentor'

const isSupervisorMode = (mode: ReviewMode): boolean => mode === 'supervisor'

export interface ManagedLoad<T> {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data?: T
  error?: string
  forbidden: boolean
  notFound: boolean
  /** Background refresh in flight; existing data stays visible. */
  refreshing: boolean
  /** Background refresh failed; existing data and prior UI are kept. */
  refreshError?: string
  reload: () => void
  /** Apply a mutation response immediately without a loading flash. */
  updateData: (fn: (prev: T | undefined) => T) => void
}

/**
 * Manual fetch with loading/error/forbidden/notFound states + reload.
 *
 * Initial loads (no data yet) render a loading state. Once data exists,
 * reloads reconcile in the background: the current view, form state, and
 * messages stay mounted; only a refresh failure surfaces (non-blocking
 * warning, retryable via reload()). A new key drops previous data and
 * loads fresh.
 */
export function useManagedLoad<T>(key: string | null, loader: () => Promise<T>): ManagedLoad<T> {
  const [nonce, setNonce] = useState(0)
  const [load, setLoad] = useState<Omit<ManagedLoad<T>, 'reload' | 'updateData' | 'refreshing' | 'refreshError'>>({
    status: 'idle',
    forbidden: false,
    notFound: false,
  })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | undefined>(undefined)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const dataRef = useRef<T | undefined>(undefined)
  const keyRef = useRef<string | null>(null)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  const updateData = useCallback((fn: (prev: T | undefined) => T) => {
    const next = fn(dataRef.current)
    dataRef.current = next
    setRefreshing(false)
    setRefreshError(undefined)
    setLoad({ status: 'ready', data: next, forbidden: false, notFound: false })
  }, [])

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    // A new resource identity drops previous data and loads fresh with a
    // loading state; otherwise reconcile in the background.
    if (keyRef.current !== key) {
      keyRef.current = key
      dataRef.current = undefined
    }
    const background = dataRef.current !== undefined
    if (!background) {
      setLoad({ status: 'loading', forbidden: false, notFound: false })
    } else {
      setRefreshing(true)
      setRefreshError(undefined)
    }
    void loaderRef
      .current()
      .then((data) => {
        if (cancelled) return
        dataRef.current = data
        setLoad({ status: 'ready', data, forbidden: false, notFound: false })
        setRefreshing(false)
        setRefreshError(undefined)
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        setRefreshing(false)
        if (dataRef.current !== undefined) {
          // Background reconciliation failed: keep existing data and prior
          // UI, surface a non-blocking warning with retry.
          setRefreshError(formatErrorForDisplay(failure))
          return
        }
        const forbidden = failure instanceof ApiError && failure.status === 403
        const notFound = failure instanceof ApiError && failure.status === 404
        setLoad({ status: 'error', forbidden, notFound, error: formatErrorForDisplay(failure) })
      })
    return () => {
      cancelled = true
    }
  }, [key, nonce])

  return { ...load, refreshing, refreshError, reload, updateData }
}

/** Week summary enriched for domain review helpers. */
export function summaryToReviewEntry(summary: ApiWeekSummary): JournalEntry {
  const entry = apiSummaryToEntry(summary)
  const companyStatus = summary.companyStatus
  entry.review =
    companyStatus === 'pending' || companyStatus === 'approved' || companyStatus === 'changes_requested'
      ? { status: companyStatus }
      : undefined
  const mentorStatus = summary.mentorStatus
  entry.mentorReview =
    mentorStatus === 'pending' || mentorStatus === 'approved' || mentorStatus === 'changes_requested'
      ? { status: mentorStatus }
      : undefined
  return entry
}

function ReviewSummary({ counts }: { counts: LifecycleCounts }) {
  if (counts.awaiting_company === 0 && counts.revision_required === 0 && counts.awaiting_mentor === 0 && counts.completed === 0) {
    return <span className="cell-muted">No reviews yet</span>
  }
  return (
    <span className="review-summary">
      {counts.awaiting_company > 0 ? (
        <span className="review-line"><span aria-hidden="true" className="review-dot review-dot--pending" />{counts.awaiting_company} Awaiting company review</span>
      ) : null}
      {counts.revision_required > 0 ? (
        <span className="review-line"><span aria-hidden="true" className="review-dot review-dot--changes" />{counts.revision_required} Revision required</span>
      ) : null}
      {counts.awaiting_mentor > 0 ? (
        <span className="review-line"><span aria-hidden="true" className="review-dot review-dot--pending" />{counts.awaiting_mentor} Awaiting mentor review</span>
      ) : null}
      {counts.completed > 0 ? (
        <span className="review-line"><span aria-hidden="true" className="review-dot review-dot--approved" />{counts.completed} Completed</span>
      ) : null}
    </span>
  )
}

interface QueueRow {
  intern: ApiInternSummary
  counts: LifecycleCounts
  submitted: number
  total: number
}

/** Managed reviewer dashboard: server-scoped queue with per-intern counts. */
export function ManagedReviewQueue({ mode }: { mode: ReviewMode }) {
  const supervisor = isSupervisorMode(mode)
  const load = useManagedLoad<QueueRow[]>(`${mode}-queue`, async () => {
    const list = supervisor ? await listSupervisorInterns() : await listMentees()
    const rows = await Promise.all(
      list.data.map(async (intern) => {
        const weeks = supervisor ? await listSupervisorInternWeeks(intern.studentId) : await listMenteeWeeks(intern.studentId)
        const entries = weeks.data.map(summaryToReviewEntry)
        const counts = supervisor ? countLifecycleStages(entries) : countMentorLifecycleStages(entries)
        const submitted = entries.filter((entry) => entry.status === 'submitted').length
        return { intern, counts, submitted, total: entries.length }
      }),
    )
    rows.sort((a, b) => {
      if (lifecycleAttentionCount(b.counts) !== lifecycleAttentionCount(a.counts)) {
        return lifecycleAttentionCount(b.counts) - lifecycleAttentionCount(a.counts)
      }
      return a.intern.name.localeCompare(b.intern.name)
    })
    return rows
  })

  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="splash"><span className="brand-mark">R</span><p>{supervisor ? 'Loading company interns…' : 'Loading mentees…'}</p></div>
  }
  if (load.status === 'error' || !load.data) {
    if (load.forbidden) {
      return supervisor ? (
        <>
          <PageHeading eyebrow="SUPERVISOR" title="Access denied" description="Your account is not linked to a company." />
          <section className="card"><h3>No company assigned</h3><p className="empty-copy">Contact your administrator if you expected supervisor access.</p></section>
        </>
      ) : (
        <>
          <PageHeading eyebrow="UNIVERSITY MENTOR" title="Access denied" description="Your account is not linked to any mentees." />
          <section className="card"><h3>No mentees assigned</h3><p className="empty-copy">Contact your administrator if you expected mentor access.</p></section>
        </>
      )
    }
    return (
      <div className="simple-sheet">
        <div className="form-error" role="alert">{load.error ?? 'The request could not be completed. Please try again.'}</div>
        <div className="editor-actions day-actions">
          <div>
            <button className="button primary" type="button" onClick={() => load.reload()}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  const rows = load.data
  const base = supervisor ? 'supervisor' : 'mentor'
  return (
    <>
      <PageHeading title={supervisor ? 'Company interns' : 'Assigned mentees'} />

      {rows.length === 0 ? (
        <section className="card">
          <h3><Users size={16} /> {supervisor ? 'No interns yet' : 'No mentees yet'}</h3>
          <p className="empty-copy">{supervisor ? 'No interns are placed at your company yet.' : 'No interns are assigned to you yet.'}</p>
        </section>
      ) : (
        <div className="intern-table-wrap">
          <table className="intern-table">
            <thead>
              <tr>
                <th>Intern</th>
                <th>Placement</th>
                <th>Reviews</th>
                <th aria-label="Review"><span className="visually-hidden">Review</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.intern.studentId}>
                  <td><strong>{row.intern.name}</strong><small className="cell-sub">{row.submitted} of {row.total} submitted</small></td>
                  <td><small className="cell-sub">{row.intern.companyName || '—'}</small></td>
                  <td><ReviewSummary counts={row.counts} /></td>
                  <td><Link className="button secondary small" to={`/${base}/interns/${row.intern.studentId}`}>Review <ArrowRight size={15} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

interface InternWeeksData {
  intern: ApiInternSummary
  weeks: ApiWeekSummary[]
}

/** Managed intern/mentee weeks list with the same visibility rules. */
export function ManagedInternWeeks({ mode, studentId }: { mode: ReviewMode; studentId: string }) {
  const supervisor = isSupervisorMode(mode)
  const load = useManagedLoad<InternWeeksData>(`intern-weeks-${mode}-${studentId}`, async () => {
    const [queue, weeks] = await Promise.all([
      supervisor ? listSupervisorInterns() : listMentees(),
      supervisor ? listSupervisorInternWeeks(studentId) : listMenteeWeeks(studentId),
    ])
    const intern = queue.data.find((candidate) => candidate.studentId === studentId)
    if (!intern) {
      throw new ApiError({
        code: 'FORBIDDEN',
        status: 403,
        message: supervisor ? 'This intern is not in your company.' : 'This intern is not assigned to you.',
      })
    }
    return { intern, weeks: weeks.data }
  })

  const accessDenied = (copy: string) =>
    supervisor ? (
      <AccessDenied copy={copy} />
    ) : (
      <AccessDenied copy={copy} backTo="/mentor/dashboard" backLabel="Back to mentees" eyebrow="UNIVERSITY MENTOR" />
    )

  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="splash"><span className="brand-mark">R</span><p>Loading weeks…</p></div>
  }
  if (load.status === 'error' || !load.data) {
    if (load.forbidden) return accessDenied(supervisor ? 'This intern is not in your company.' : 'This intern is not assigned to you.')
    if (load.notFound) {
      return supervisor ? (
        <AccessDenied copy="No journal found for this intern." />
      ) : (
        <AccessDenied copy="No journal found for this intern." backTo="/mentor/dashboard" backLabel="Back to mentees" eyebrow="UNIVERSITY MENTOR" />
      )
    }
    return (
      <div className="simple-sheet">
        <div className="form-error" role="alert">{load.error ?? 'The request could not be completed. Please try again.'}</div>
        <div className="editor-actions day-actions">
          <div>
            <button className="button primary" type="button" onClick={() => load.reload()}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  const { intern, weeks } = load.data
  // Supervisors see submitted weeks (submitted snapshot only); mentors see
  // weeks after company approval plus mentor-touched weeks awaiting re-review.
  const visibleEntries = weeks
    .map(summaryToReviewEntry)
    .filter((entry) => (supervisor ? entry.status === 'submitted' : entry.status === 'submitted' && isMentorVisible(entry)))
    .sort((a, b) => a.weekNumber - b.weekNumber)
  const base = supervisor ? 'supervisor' : 'mentor'

  return (
    <>
      <Link className="back-link" to={`/${base}/dashboard`}>
        <ArrowLeft size={15} /> {supervisor ? 'Back to interns' : 'Back to mentees'}
      </Link>
      <PageHeading title={intern.name} description={intern.companyName || intern.email} />
      <div className="week-list">
        {visibleEntries.length === 0 && (
          supervisor ? (
            <section className="card"><h3>No submitted weeks or saved drafts yet</h3><p className="empty-copy">Submitted weekly reports and saved weekly summaries will appear here for review. Submitted daily logs appear on the review detail; weeks without a submission or a saved summary are never shown.</p></section>
          ) : (
            <section className="card"><h3>No weeks ready for mentor review yet</h3><p className="empty-copy">Weeks appear here after the company supervisor approves them. Submitted daily logs appear on the review detail.</p></section>
          )
        )}
        {visibleEntries.map((entry) => {
          const waiting =
            !supervisor &&
            entry.status === 'submitted' &&
            entry.mentorReview !== undefined &&
            !(entry.review?.status === 'approved' && (entry.mentorReview?.status ?? 'pending') === 'pending')
          return (
            <Link key={entry.id} className="week-row" to={`/${base}/interns/${intern.studentId}/weeks/${entry.weekNumber}`}>
              <span className="document-index">{String(entry.weekNumber).padStart(2, '0')}</span>
              <span className="week-main">
                <span className="week-title-row">
                  <strong>{weekLabel(entry.weekNumber)}</strong>
                  {entry.status !== 'submitted'
                    ? <StatusBadge status={entry.status} />
                    : <StatusBadge status={getLifecycleStatus(entry) ?? 'submitted'} />}
                </span>
                <small><CalendarDays size={13} /> {entry.startDate}</small>
                {waiting ? <small className="cell-sub">Waiting for company re-review</small> : null}
              </span>
              <ArrowRight size={16} className="row-arrow" aria-hidden="true" />
            </Link>
          )
        })}
      </div>
    </>
  )
}

interface ReviewWeekData {
  intern: ApiInternSummary
  detail: ApiWeekDetail
  version: string
  weeks: ApiWeekSummary[]
}

/** Non-blocking background-refresh state: never unmounts the review. */
function RefreshNotice({ load, saved }: { load: ManagedLoad<ReviewWeekData>; saved: boolean }) {
  if (load.refreshError) {
    return (
      <div className="form-error" role="alert">
        {saved ? 'Review saved but latest data could not be refreshed' : 'Latest data could not be refreshed'} ({load.refreshError}).{' '}
        <button className="button secondary small" type="button" onClick={() => load.reload()}>
          Retry refresh
        </button>
      </div>
    )
  }
  if (load.refreshing) {
    return (
      <p className="cell-sub" role="status" style={{ margin: 0 }}>
        Refreshing…
      </p>
    )
  }
  return null
}

/**
 * Managed review detail for both stages. Layout and copy mirror the legacy
 * stage pages; persistence uses atomic versioned transitions with
 * idempotency, disabled-while-pending, and preserve-on-failure.
 */
export function ManagedWeekReview({ mode, studentId, weekNumber }: { mode: ReviewMode; studentId: string; weekNumber: number }) {
  const supervisor = isSupervisorMode(mode)
  const navigate = useNavigate()
  const load = useManagedLoad<ReviewWeekData>(`review-${mode}-${studentId}-${weekNumber}`, async () => {
    const [queue, weeks, fetched] = await Promise.all([
      supervisor ? listSupervisorInterns() : listMentees(),
      supervisor ? listSupervisorInternWeeks(studentId) : listMenteeWeeks(studentId),
      supervisor ? getSupervisorWeek(studentId, weekNumber) : getMenteeWeek(studentId, weekNumber),
    ])
    const intern = queue.data.find((candidate) => candidate.studentId === studentId)
    if (!intern) {
      throw new ApiError({
        code: 'FORBIDDEN',
        status: 403,
        message: supervisor ? 'This intern is not in your company.' : 'This intern is not assigned to you.',
      })
    }
    return { intern, detail: fetched.week, version: fetched.version, weeks: weeks.data }
  })

  const [feedback, setFeedback] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const submittedRef = useRef(false)
  const seededRef = useRef<string | null>(null)
  // Week id the current box text was typed for (null when untouched): makes
  // seeding safe regardless of effect timing — see below.
  const dirtyRef = useRef<string | null>(null)
  // Seed the feedback box from the server decision when the week is first
  // shown or the week identity changes. Text typed for the displayed week
  // is never overwritten (nor is a message from a completed action
  // cleared), no matter when this effect first runs.
  // Page parents additionally remount per student+week via key.
  useEffect(() => {
    if (load.status !== 'ready' || !load.data) return
    const id = `${studentId}:${weekNumber}`
    if (seededRef.current === id) return
    seededRef.current = id
    if (dirtyRef.current === id) return
    dirtyRef.current = null
    setFeedback(supervisor ? (load.data.detail.review?.feedback ?? '') : (load.data.detail.mentorReview?.feedback ?? ''))
    setMessage(null)
  }, [load, supervisor, studentId, weekNumber])

  const markFeedback = (value: string) => {
    dirtyRef.current = `${studentId}:${weekNumber}`
    setFeedback(value)
  }

  const base = supervisor ? 'supervisor' : 'mentor'
  const accessDenied = (copy: string) =>
    supervisor ? (
      <AccessDenied copy={copy} />
    ) : (
      <AccessDenied copy={copy} backTo="/mentor/dashboard" backLabel="Back to mentees" eyebrow="UNIVERSITY MENTOR" />
    )

  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="splash"><span className="brand-mark">R</span><p>Loading review…</p></div>
  }
  if (load.status === 'error' || !load.data) {
    if (load.forbidden) {
      return accessDenied(supervisor ? 'This intern is not in your company.' : 'This intern is not assigned to you.')
    }
    if (load.notFound) return <Navigate to={`/${base}/interns/${studentId}`} replace />
    return (
      <div className="simple-sheet">
        <div className="form-error" role="alert">{load.error ?? 'The request could not be completed. Please try again.'}</div>
        <div className="editor-actions day-actions">
          <div>
            <button className="button primary" type="button" onClick={() => load.reload()}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  const { intern, detail, version } = load.data
  const entry = apiWeekToEntry(detail)
  // Reviewers have no programme timezone from the server; UTC keeps the
  // locked-week selector rule date-stable for submitted (past) weeks.
  const programmeToday = getProgrammeDate(new Date(), 'UTC')
  const allEntries = load.data.weeks.map(summaryToReviewEntry).sort((a, b) => a.weekNumber - b.weekNumber)
  const unlockedEntries = allEntries.filter((candidate) => getWeekAvailability(candidate, programmeToday) !== 'locked')
  const weekOptions =
    !unlockedEntries.some((candidate) => candidate.weekNumber === entry.weekNumber)
      ? [...unlockedEntries, entry].sort((a, b) => a.weekNumber - b.weekNumber)
      : unlockedEntries

  const onSelectWeek = (value: string) => {
    const next = Number(value)
    if (Number.isInteger(next)) navigate(`/${base}/interns/${studentId}/weeks/${next}`)
  }
  const weekSelector = (
    <div className="simple-field week-starting-field">
      <label htmlFor="week-select">Week</label>
      <select id="week-select" aria-label="Week" value={entry.weekNumber} onChange={(event) => onSelectWeek(event.target.value)}>
        {weekOptions.map((candidate) => (
          <option key={candidate.weekNumber} value={candidate.weekNumber}>
            {`Week ${candidate.weekNumber} — ${formatNumericDate(candidate.startDate)}`}
          </option>
        ))}
      </select>
    </div>
  )

  const backTo = `/${base}/interns/${studentId}`
  const backLabel = supervisor ? 'Back to Interns' : 'Back to Mentees'
  const canReview = detail.capabilities.canReview

  const doReview = (decision: 'approve' | 'request_changes') => {
    if (saving || submittedRef.current) return
    const actionable = supervisor ? getReviewStatus(entry) === 'pending' : isMentorPending(entry)
    if (!actionable) {
      if (supervisor) {
        setMessage({ text: 'Only weeks pending review can be reviewed.', ok: false })
      } else {
        const waitingForCompany = entry.review?.status !== 'approved'
        setMessage({ text: waitingForCompany ? 'This week is awaiting company review.' : 'Only weeks pending review can be reviewed.', ok: false })
      }
      return
    }
    if (!canReview) {
      setMessage({ text: 'This week cannot be reviewed right now.', ok: false })
      return
    }
    if (decision === 'request_changes' && !isValidFeedback(feedback)) {
      setMessage({ text: 'Feedback is required to request changes.', ok: false })
      return
    }
    submittedRef.current = true
    setSaving(true)
    void (async () => {
      try {
        // One idempotency key per click; duplicate clicks share the guard
        // above and never reach the network twice.
        const result = supervisor
          ? await supervisorReview(studentId, entry.weekNumber, decision, feedback || undefined, version, newIdempotencyKey())
          : await mentorReview(studentId, entry.weekNumber, decision, feedback || undefined, version, newIdempotencyKey())
        reportTelemetry({ event: 'review_succeeded' })
        // Render the mutation response immediately (week + version, which
        // re-derives actionability from returned capabilities/status), show
        // success, then reconcile with the server in the background without
        // unmounting the review.
        const current = load.data
        if (current) load.updateData(() => ({ ...current, detail: result.week, version: result.version }))
        setMessage({ text: 'Review saved.', ok: true })
        load.reload()
      } catch (failure) {
        reportTelemetry({
          event: 'review_failed',
          status: failure instanceof ApiError ? failure.status : undefined,
          code: failure instanceof ApiError ? failure.code : undefined,
          requestId: failure instanceof ApiError ? failure.requestId : undefined,
        })
        // Prior UI is preserved: no local state is mutated on failure
        // (feedback text stays dirty and intact). A stale version refreshes
        // in the background for a clean retry with the same buttons.
        setMessage({ text: formatErrorForDisplay(failure), ok: false })
        if (failure instanceof ApiError && failure.status === 412) load.reload()
      } finally {
        submittedRef.current = false
        setSaving(false)
      }
    })()
  }

  // Reviewers never see working drafts: unsubmitted (or pre-company, for
  // mentors) weeks render the same unavailable card as the legacy pages.
  const mentorGateVisible = !supervisor && (entry.status !== 'submitted' || !isMentorVisible(entry))
  if ((!supervisor && mentorGateVisible) || (supervisor && entry.status !== 'submitted')) {
    return (
      <>
        <Link className="back-link" to={backTo}><ArrowLeft size={15} /> {backLabel}</Link>
        <PageHeading eyebrow={intern.name.toUpperCase()} title={supervisor ? 'Weekly Review' : 'Mentor Review'} />
        <section className="card">
          {weekSelector}
          {supervisor ? (
            <><h3>Not available for review</h3><p className="empty-copy">Only submitted weeks can be reviewed. This week has not been submitted yet.</p></>
          ) : (
            <><h3>Not available for mentor review</h3><p className="empty-copy">This week is awaiting company review. Weeks appear here after the company supervisor approves them.</p></>
          )}
        </section>
      </>
    )
  }

  const snapshot = submittedBodyOf(entry)
  const words = countWords(snapshot)
  const filledDailies = (entry.dailyEntries ?? []).filter((day) => day.body.trim().length > 0)
  const dailySection = filledDailies.length > 0 && (
    <>
      <div className="simple-divider" aria-hidden="true" />
      <div className="simple-section">
        <span className="eyebrow">OPTIONAL DAILY LOGS</span>
        <div className="daily-list">
          {filledDailies.map((day) => {
            const dayHeading = isValidDateString(day.date)
              ? `${formatWeekdayName(day.date).toUpperCase()} ${formatNumericDate(day.date)}`
              : day.date
            return (
              <article key={day.date} className="day-full-card" aria-label={`Daily log ${dayHeading}`}>
                <span className="week-title-row">
                  <strong>{dayHeading}</strong>
                </span>
                <p className="day-full-body">{day.body}</p>
                <small className="cell-sub">{countWords(day.body)} words</small>
              </article>
            )
          })}
        </div>
      </div>
    </>
  )

  if (supervisor) {
    const reviewStatus = getReviewStatus(entry)
    const mentorStatus = getMentorReviewStatus(entry)
    const mentorFeedback = entry.mentorReview?.feedback?.trim() ? entry.mentorReview.feedback.trim() : ''
    const isPending = reviewStatus === 'pending'
    const draftText = entry.weeklyDraft ?? ''
    const showRevision = entry.review?.status === 'changes_requested' && draftText.trim().length > 0 && draftText !== snapshot
    return (
      <div className="simple-sheet">
        <Link className="back-link" to={backTo}><ArrowLeft size={15} /> {backLabel}</Link>
        <PageHeading eyebrow={intern.name.toUpperCase()} title="Weekly Review" />
        <section className="card review-body simple-sheet-card">
          <div className="review-badges">
            <StatusBadge status={getLifecycleStatus(entry) ?? 'submitted'} />
          </div>
          {weekSelector}
          <RefreshNotice load={load} saved={message?.ok ?? false} />
          <div className="simple-section">
            <span className="eyebrow">SUBMITTED WEEKLY REPORT</span>
            <p className="report-block">{snapshot}</p>
            <p className="cell-sub" style={{ margin: 0 }}>
              {words} words · Submitted {formatSupervisorDateOnly(entry.submittedAt, 'UTC')}
            </p>
          </div>

          {dailySection}

          {showRevision && (
            <div className="simple-section">
              <span className="eyebrow">LATEST SAVED REVISION (DRAFT)</span>
              <p className="report-block">{draftText}</p>
              <p className="cell-sub" style={{ margin: 0 }}>
                Saved {formatSupervisorTimestamp(entry.weeklyDraftUpdatedAt)} · read-only; the student has not resubmitted yet.
              </p>
            </div>
          )}

          <div className="simple-divider" aria-hidden="true" />

          <div className="simple-section">
            <span className="eyebrow">FEEDBACK</span>
            <textarea
              aria-label="Review feedback"
              value={feedback}
              onChange={(event) => markFeedback(event.target.value)}
              placeholder="Optional for approval, required to request changes…"
              rows={4}
            />
            {message && <div className={message.ok ? 'form-success' : 'form-error'}>{message.text}</div>}
            {reviewStatus === 'approved' && mentorStatus === 'approved' && (
              <p className="empty-copy">This week is completed. No further actions can be taken.</p>
            )}
            {reviewStatus === 'approved' && mentorStatus !== 'approved' && (
              <p className="empty-copy">Company approved. Awaiting university mentor review. No further supervisor actions can be taken.</p>
            )}
            {reviewStatus === 'changes_requested' && (
              <p className="empty-copy">Changes requested. This week is awaiting intern revision and resubmission.</p>
            )}
            <div className="editor-actions review-actions" style={{ marginTop: 0 }}>
              <div>
                <button className="button primary" type="button" onClick={() => doReview('approve')} disabled={saving || !isPending || !canReview}>{saving ? 'Saving…' : 'Approve'}</button>
                <button className="button secondary" type="button" onClick={() => doReview('request_changes')} disabled={saving || !isValidFeedback(feedback) || !isPending || !canReview}>{saving ? 'Saving…' : 'Request changes'}</button>
              </div>
            </div>
          </div>

          {mentorStatus && (
            <>
              <div className="simple-divider" aria-hidden="true" />
              <div className="simple-section">
                <span className="eyebrow">UNIVERSITY MENTOR (READ-ONLY)</span>
                {mentorFeedback
                  ? <p className="report-block">{mentorFeedback}</p>
                  : <p className="empty-copy" style={{ margin: 0 }}>No mentor feedback yet.</p>}
              </div>
            </>
          )}

        </section>
      </div>
    )
  }

  const mentorStatus = getMentorReviewStatus(entry) ?? 'pending'
  const actionable = isMentorPending(entry)
  const companyApproved = entry.review?.status === 'approved'
  const companyFeedback = entry.review?.feedback?.trim() ? entry.review.feedback.trim() : ''
  const draftText = entry.weeklyDraft ?? ''
  const showRevision = entry.review?.status === 'changes_requested' && draftText.trim().length > 0 && draftText !== snapshot
  return (
    <div className="simple-sheet">
      <Link className="back-link" to={backTo}><ArrowLeft size={15} /> {backLabel}</Link>
      <PageHeading eyebrow={intern.name.toUpperCase()} title="Mentor Review" />
      <section className="card review-body simple-sheet-card">
        <div className="review-badges">
          <StatusBadge status={getLifecycleStatus(entry) ?? 'submitted'} />
        </div>
        {weekSelector}
        {!companyApproved && (
          <p className="empty-copy" style={{ margin: 0 }}>
            Waiting for company re-review. This week stays read-only for mentors until the company supervisor approves it again.
          </p>
        )}
        {companyApproved && !actionable && mentorStatus === 'changes_requested' && (
          <p className="empty-copy" style={{ margin: 0 }}>
            Changes requested. This week is awaiting intern revision and company re-review.
          </p>
        )}
        <div className="simple-section">
          <span className="eyebrow">SUBMITTED WEEKLY REPORT</span>
          <p className="report-block">{snapshot}</p>
          <p className="cell-sub" style={{ margin: 0 }}>
            {words} words · Submitted {formatSupervisorDateOnly(entry.submittedAt, 'UTC')}
          </p>
        </div>

        {dailySection}

        {showRevision && (
          <div className="simple-section">
            <span className="eyebrow">LATEST SAVED REVISION (DRAFT)</span>
            <p className="report-block">{draftText}</p>
            <p className="cell-sub" style={{ margin: 0 }}>
              Saved {formatSupervisorTimestamp(entry.weeklyDraftUpdatedAt)} · read-only; the student has not resubmitted yet.
            </p>
          </div>
        )}

        <div className="simple-divider" aria-hidden="true" />

        <div className="simple-section">
          <span className="eyebrow">COMPANY SUPERVISOR FEEDBACK</span>
          {companyFeedback
            ? <p className="report-block">{companyFeedback}</p>
            : <p className="empty-copy" style={{ margin: 0 }}>No company feedback yet.</p>}
        </div>

        <div className="simple-divider" aria-hidden="true" />

        <div className="simple-section">
          <span className="eyebrow">MENTOR FEEDBACK</span>
          <textarea
            aria-label="Mentor feedback"
            value={feedback}
            onChange={(event) => markFeedback(event.target.value)}
            placeholder="Optional for approval, required to request changes…"
            rows={4}
            disabled={!actionable}
          />
          {message && <div className={message.ok ? 'form-success' : 'form-error'}>{message.text}</div>}
          {mentorStatus === 'approved' && companyApproved && (
            <p className="empty-copy">This week is completed. No further actions can be taken.</p>
          )}
          {mentorStatus === 'changes_requested' && (
            <p className="empty-copy">Changes requested. This week is awaiting intern revision and company re-review.</p>
          )}
          {!companyApproved && (
            <p className="empty-copy">Company approval is required before mentor review.</p>
          )}
          <div className="editor-actions review-actions" style={{ marginTop: 0 }}>
            <div>
              <button className="button primary" type="button" onClick={() => doReview('approve')} disabled={saving || !actionable || !canReview}>{saving ? 'Saving…' : 'Approve'}</button>
              <button className="button secondary" type="button" onClick={() => doReview('request_changes')} disabled={saving || !isValidFeedback(feedback) || !actionable || !canReview}>{saving ? 'Saving…' : 'Request changes'}</button>
            </div>
          </div>
        </div>

      </section>
    </div>
  )
}
