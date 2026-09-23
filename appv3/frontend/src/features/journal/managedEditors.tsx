/**
 * Managed (server-backed) editor glue for DayPage/WeekPage.
 *
 * Rendered only when the SessionProvider manages the session
 * (`env.useApi`). Reads and writes go through `src/api/portal` with
 * version/ETag + If-Match; per-field persistence reuses `useAutosave`
 * (debounced, serialized, recovery drafts, compare-then-retry conflicts).
 * Unmanaged mode keeps the legacy AppContext path untouched.
 *
 * Plain `useEffect` fetching is used (no react-query provider requirement)
 * so existing page tests render unchanged when unmanaged.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { ApiError, formatErrorForDisplay } from '../../api/errors'
import { newIdempotencyKey } from '../../api/client'
import {
  getMyInternship,
  getMyWeek,
  listMyWeeks,
  submitWeek,
  updateDailyEntry,
  updateWeeklyDraft,
  type ApiInternship,
  type ApiWeekDetail,
  type ApiWeekSummary,
} from '../../api/portal'
import { getWeeklyReadiness } from '../../domain/weeklyReadiness'
import { canResubmitDual } from '../../domain/review'
import { WEEKLY_SUMMARY_MAX_LENGTH } from '../../state/AppContext'
import { dailyFieldKey, weeklyFieldKey } from '../../recovery/draftStore'
import { reportTelemetry } from '../../observability/reporter'
import type { JournalEntry } from '../../types'
import { SaveStatus } from '../../components/SaveStatus'
import { ConflictDialog } from '../../components/ConflictDialog'
import { useAutosave } from './useAutosave'

/** Minimal JournalEntry for structural domain helpers (dates/status). */
export function apiSummaryToEntry(summary: ApiWeekSummary): JournalEntry {
  return {
    id: `week-${summary.weekNumber}`,
    weekNumber: summary.weekNumber,
    startDate: summary.startDate,
    endDate: summary.endDate,
    body: '',
    status: summary.status,
    updatedAt: summary.updatedAt,
    submittedAt: summary.submittedAt,
    dailyEntries: [],
    weeklyDraft: '',
  }
}

/** Full week detail mapped for JournalEntry consumers (badges, lists). */
export function apiWeekToEntry(detail: ApiWeekDetail): JournalEntry {
  return {
    id: `week-${detail.weekNumber}`,
    weekNumber: detail.weekNumber,
    startDate: detail.startDate,
    endDate: detail.endDate,
    body: '',
    status: detail.status,
    updatedAt: detail.updatedAt,
    submittedAt: detail.submittedAt,
    review: detail.review
      ? { status: detail.review.status, feedback: detail.review.feedback, reviewedBy: detail.review.reviewedBy, reviewedAt: detail.review.reviewedAt }
      : undefined,
    mentorReview: detail.mentorReview
      ? {
          status: detail.mentorReview.status,
          feedback: detail.mentorReview.feedback,
          reviewedBy: detail.mentorReview.reviewedBy,
          reviewedAt: detail.mentorReview.reviewedAt,
        }
      : undefined,
    dailyEntries: detail.dailyEntries.map((day) => ({ date: day.date, body: day.body, updatedAt: day.updatedAt })),
    weeklyDraft: detail.weeklyDraft,
    weeklyDraftUpdatedAt: detail.weeklyDraftUpdatedAt,
    submittedBody: detail.submittedBody,
  }
}

export interface ManagedJournalLoad {
  status: 'loading' | 'ready' | 'error'
  /** True when the week/placement does not exist (caller redirects). */
  notFound: boolean
  internship?: ApiInternship
  weeks?: ApiWeekSummary[]
  detail?: ApiWeekDetail
  version?: string
  error?: string
  reload: () => void
}

/** Fetch internship + week list (+ one week detail) for managed editors. */
export function useManagedJournal(weekNumber: number | null, managed: boolean): ManagedJournalLoad {
  const [nonce, setNonce] = useState(0)
  const [load, setLoad] = useState<Omit<ManagedJournalLoad, 'reload'>>({ status: 'loading', notFound: false })
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!managed) return
    let cancelled = false
    setLoad({ status: 'loading', notFound: false })
    const work =
      weekNumber === null
        ? Promise.all([getMyInternship(), listMyWeeks()]).then(([internship, weeks]) => ({
            internship,
            weeks: weeks.data,
          }))
        : Promise.all([getMyInternship(), listMyWeeks(), getMyWeek(weekNumber)]).then(([internship, weeks, week]) => ({
            internship,
            weeks: weeks.data,
            detail: week.week,
            version: week.version,
          }))
    work.then(
      (data) => {
        if (!cancelled) setLoad({ status: 'ready', notFound: false, ...data })
      },
      (failure: unknown) => {
        if (cancelled) return
        // 401 also dispatches portal:unauthorized for the global re-auth
        // dialog; drafts stay in the recovery store.
        const notFound = failure instanceof ApiError && failure.status === 404
        setLoad({ status: 'error', notFound, error: formatErrorForDisplay(failure) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [managed, weekNumber, nonce])

  return { ...load, reload }
}

function useShowConflict(hasConflict: boolean): [boolean, (value: boolean) => void] {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (hasConflict) setVisible(true)
    if (!hasConflict) setVisible(false)
  }, [hasConflict])
  return [visible, setVisible]
}

/** Server-backed daily log editor: autosave + Save flush + conflict UI. */
export function ManagedDailyEditor({
  weekNumber,
  date,
  userId,
  debounceMs,
}: {
  weekNumber: number
  date: string
  userId: string
  debounceMs?: number
}) {
  const [baseline, setBaseline] = useState<{ body: string; version: string } | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadError(undefined)
    void getMyWeek(weekNumber)
      .then(({ week, version }) => {
        if (cancelled) return
        setBaseline({ body: week.dailyEntries.find((day) => day.date === date)?.body ?? '', version })
      })
      .catch((failure: unknown) => {
        if (!cancelled) setLoadError(formatErrorForDisplay(failure))
      })
    return () => {
      cancelled = true
    }
  }, [weekNumber, date, reloadNonce])

  if (loadError) {
    return (
      <div>
        <div className="form-error" role="alert">{loadError}</div>
        <div className="editor-actions day-actions">
          <div>
            <button className="button primary" type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!baseline) return <p className="empty-copy">Loading daily log…</p>
  return <ManagedDailyForm key={`${weekNumber}:${date}:${baseline.version}`} weekNumber={weekNumber} date={date} userId={userId} serverBody={baseline.body} version={baseline.version} debounceMs={debounceMs} />
}

function ManagedDailyForm({
  weekNumber,
  date,
  userId,
  serverBody,
  version,
  debounceMs,
}: {
  weekNumber: number
  date: string
  userId: string
  serverBody: string
  version: string
  debounceMs?: number
}) {
  const autosave = useAutosave<string>({
    userId,
    fieldKey: dailyFieldKey(weekNumber, date),
    serverBody,
    version,
    debounceMs,
    save: (body, current) => updateDailyEntry(weekNumber, date, body, current).then((result) => ({ version: result.version })),
    refetchServer: async () => {
      const fresh = await getMyWeek(weekNumber)
      const body = fresh.week.dailyEntries.find((day) => day.date === date)?.body ?? ''
      return { body, raw: body, version: fresh.version }
    },
  })
  const [showConflict, setShowConflict] = useShowConflict(autosave.conflict !== undefined)
  const [flushing, setFlushing] = useState(false)

  const flushNow = () => {
    if (flushing) return
    setFlushing(true)
    void autosave.flush().finally(() => setFlushing(false))
  }

  return (
    <div>
      <textarea
        aria-label={`Daily log for ${date}`}
        value={autosave.value}
        onChange={(event) => autosave.setValue(event.target.value)}
        rows={10}
      />
      <SaveStatus state={autosave.state} />
      {autosave.error && <div className="form-error" role="alert">{autosave.error}</div>}
      {autosave.conflict && showConflict && (
        <ConflictDialog
          localBody={autosave.conflict.localBody}
          serverBody={String(autosave.conflict.serverCopy ?? '')}
          onRetry={autosave.retryWithVersion}
          onKeepLocal={() => setShowConflict(false)}
        />
      )}
      <div className="editor-actions day-actions">
        <div>
          <button className="button primary" type="button" onClick={flushNow} disabled={flushing}>
            <Save size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  )
}

/** Server-backed weekly draft editor: autosave + conflict UI (no local copy). */
export function ManagedWeeklyEditor({
  weekNumber,
  userId,
  readOnly,
  serverCanEdit,
  initialDraft,
  version,
  debounceMs,
  onDraftChange,
}: {
  weekNumber: number
  userId: string
  /** Domain-derived edit matrix (dual-stage review state). */
  readOnly: boolean
  /** Server capability: authoritative UI enablement. */
  serverCanEdit: boolean
  initialDraft: string
  version: string
  debounceMs?: number
  onDraftChange?: (text: string) => void
}) {
  const locked = readOnly || !serverCanEdit
  const autosave = useAutosave<string>({
    userId,
    fieldKey: weeklyFieldKey(weekNumber),
    serverBody: initialDraft,
    version,
    debounceMs,
    maxLength: WEEKLY_SUMMARY_MAX_LENGTH,
    // Locked weeks never persist: the hook suppresses scheduling + flushes.
    disabled: locked,
    save: (body, current) => updateWeeklyDraft(weekNumber, body, current).then((result) => ({ version: result.version })),
    refetchServer: async () => {
      const fresh = await getMyWeek(weekNumber)
      return { body: fresh.week.weeklyDraft, raw: fresh.week.weeklyDraft, version: fresh.version }
    },
  })
  const [showConflict, setShowConflict] = useShowConflict(autosave.conflict !== undefined)
  const draftChangeRef = useRef(onDraftChange)
  draftChangeRef.current = onDraftChange
  const overLimit = autosave.value.length > WEEKLY_SUMMARY_MAX_LENGTH

  return (
    <div className="simple-section" aria-label="Weekly log">
      <h2>Weekly Log</h2>
      <label className="visually-hidden" htmlFor="weekly-log">Weekly Log</label>
      <textarea
        id="weekly-log"
        aria-label="Weekly Log"
        value={autosave.value}
        onChange={(event) => {
          autosave.setValue(event.target.value)
          draftChangeRef.current?.(event.target.value)
        }}
        rows={6}
        maxLength={WEEKLY_SUMMARY_MAX_LENGTH + 1}
        disabled={locked}
      />
      <div className="editor-meta">
        <p className={`word-counter${overLimit ? ' invalid' : ''}`}>{`${autosave.value.length} / ${WEEKLY_SUMMARY_MAX_LENGTH} characters`}</p>
        <SaveStatus state={autosave.state} />
      </div>
      {autosave.error && <div className="form-error" role="alert">{autosave.error}</div>}
      {overLimit && (
        <div className="form-error" role="alert">
          Weekly log must be {WEEKLY_SUMMARY_MAX_LENGTH} characters or fewer. You have {autosave.value.length}.
        </div>
      )}
      {autosave.conflict && showConflict && !locked && (
        <ConflictDialog
          localBody={autosave.conflict.localBody}
          serverBody={String(autosave.conflict.serverCopy ?? '')}
          onRetry={autosave.retryWithVersion}
          onKeepLocal={() => setShowConflict(false)}
        />
      )}
    </div>
  )
}

/** Server-backed submit/resubmit: latest text + fresh version + idempotency. */
export function ManagedSubmitSection({
  weekNumber,
  detail,
  programmeToday,
  draftText,
  serverCanSubmit,
  onSubmitted,
}: {
  weekNumber: number
  detail: ApiWeekDetail
  programmeToday: string
  /** Live editor text (falls back to the server draft). */
  draftText: string
  serverCanSubmit: boolean
  onSubmitted: () => void
}) {
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const submittedRef = useRef(false)
  useEffect(() => {
    setFeedback(null)
    setSaving(false)
  }, [weekNumber])

  const submitted = detail.status === 'submitted'
  const changesRequested = submitted && canResubmitDual(detail)
  const locked = submitted && !changesRequested
  const overLimit = draftText.length > WEEKLY_SUMMARY_MAX_LENGTH
  const readiness = getWeeklyReadiness({ ...detail, weeklyDraft: draftText }, programmeToday)

  const blocked = locked || !readiness.canSubmit || overLimit || !serverCanSubmit
  const label = !submitted ? 'Submit week' : changesRequested ? 'Resubmit week' : 'Submitted'
  const disabled = blocked || saving

  const onSubmit = () => {
    if (disabled || submittedRef.current) return
    // Read the latest textarea value directly so a pending debounced
    // autosave can never submit stale text (mirrors the legacy section).
    const latest = (document.getElementById('weekly-log') as HTMLTextAreaElement | null)?.value ?? draftText
    if (latest.length > WEEKLY_SUMMARY_MAX_LENGTH) {
      setFeedback({
        text: `Weekly log must be ${WEEKLY_SUMMARY_MAX_LENGTH} characters or fewer. You have ${latest.length}.`,
        ok: false,
      })
      return
    }
    const latestReadiness = getWeeklyReadiness({ ...detail, weeklyDraft: latest }, programmeToday)
    if (!latestReadiness.canSubmit) {
      setFeedback({ text: latestReadiness.reasons[0] ?? 'This week is not ready to submit yet.', ok: false })
      return
    }
    const isResubmit = submitted
    submittedRef.current = true
    setSaving(true)
    void (async () => {
      try {
        // Fresh version first: stale writes are rejected (412), never
        // silently overwritten. Retries reuse one idempotency key per click.
        const fresh = await getMyWeek(weekNumber)
        await submitWeek(weekNumber, latest, fresh.version, newIdempotencyKey())
        reportTelemetry({ event: 'submit_succeeded' })
        onSubmitted()
        setFeedback({ text: isResubmit ? 'Week resubmitted.' : 'Week submitted.', ok: true })
      } catch (failure) {
        reportTelemetry({
          event: 'submit_failed',
          status: failure instanceof ApiError ? failure.status : undefined,
          code: failure instanceof ApiError ? failure.code : undefined,
          requestId: failure instanceof ApiError ? failure.requestId : undefined,
        })
        // Prior UI is preserved: no local state is mutated on failure.
        setFeedback({ text: formatErrorForDisplay(failure), ok: false })
      } finally {
        submittedRef.current = false
        setSaving(false)
      }
    })()
  }

  return (
    <div>
      <div className="editor-actions day-actions">
        <div>
          <button className="button primary" type="button" onClick={onSubmit} disabled={disabled}>
            {saving ? 'Saving…' : label}
          </button>
        </div>
      </div>
      {feedback && feedback.ok && <div className="form-success" role="status">{feedback.text}</div>}
      {feedback && !feedback.ok && <div className="form-error" role="alert">{feedback.text}</div>}
    </div>
  )
}
