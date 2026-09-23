import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { StatusBadge } from '../components/StatusBadge'
import { formatShortDate, formatWeekdayName, getProgrammeDate } from '../domain/dates'
import { weekdaysInWeek } from '../domain/daily'
import { getWeekAvailability } from '../domain/internship'
import { getLifecycleStatus, getReviewStatus, isReadOnlyForStudentDual, canResubmitDual } from '../domain/review'
import { getWeeklyReadiness } from '../domain/weeklyReadiness'
import { weekLabel } from '../domain/weeks'
import { useApp, WEEKLY_SUMMARY_MAX_LENGTH } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import {
  ManagedSubmitSection,
  ManagedWeeklyEditor,
  apiSummaryToEntry,
  apiWeekToEntry,
  useManagedJournal,
} from '../features/journal/managedEditors'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { JournalEntry } from '../types'

/** Debounce for autosaving the weekly summary (keystrokes stay local). */
const SUMMARY_AUTOSAVE_MS = 500

function WeekStartingSelector({
  entry,
  availableEntries,
  onSelectWeek,
}: {
  entry: JournalEntry
  availableEntries: JournalEntry[]
  onSelectWeek: (weekNumber: number) => void
}) {
  return (
    <div className="simple-section">
      <div className="simple-field week-starting-field">
        <label htmlFor="week-starting">Week starting</label>
        <select
          id="week-starting"
          aria-label="Week starting"
          value={entry.weekNumber}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isInteger(next)) onSelectWeek(next)
          }}
        >
          {availableEntries.map((candidate) => (
            <option key={candidate.id} value={candidate.weekNumber}>
              {`${weekLabel(candidate.weekNumber)} — ${formatShortDate(candidate.startDate)}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function DailyWeekEditor({
  entry,
  programmeToday,
}: {
  entry: JournalEntry
  programmeToday: string
}) {
  // Every in-range weekday is listed (stored or missing); legacy stored logs
  // outside the required set (weekends/out-of-range) are hidden. Missing
  // days render Empty with an Open link; future days render Locked with no
  // navigation. Daily logs are a separate optional record: they stay editable
  // regardless of weekly submission state.
  const required = weekdaysInWeek(entry.startDate, entry.endDate)
  const byDate = new Map((entry.dailyEntries ?? []).map((day) => [day.date, day]))

  return (
    <div className="simple-section">
      <h2>Optional Daily Logs</h2>
      <p className="empty-copy">Optional and separate — not included in weekly submission and does not block submission.</p>
      {required.length === 0 && (
        <p className="empty-copy">No weekday logs are required for this period (no Monday–Friday dates fall inside it).</p>
      )}
      <div className="daily-list">
        {required.map((date) => {
          const stored = byDate.get(date)
          const body = (stored?.body ?? '').trim()
          const openable = date <= programmeToday
          return (
            <article key={date} className="day-full-card" aria-label={`Daily log ${date}`}>
              <span className="week-title-row">
                <strong>{formatWeekdayName(date)}</strong>
                {openable
                  ? <Link className="day-open-link" to={`/journal/days/${date}`}>Open <ArrowRight size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /></Link>
                  : <span className="day-locked">Locked</span>}
              </span>
              {body
                ? <p className="day-full-body">{stored!.body}</p>
                : <p className="day-full-body muted">Empty</p>}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function WeeklySummarySection({
  internshipId,
  entry,
  readOnly,
}: {
  internshipId: string
  entry: JournalEntry
  readOnly: boolean
}) {
  const { updateWeeklyDraft } = useApp()
  const savedDraft = entry.weeklyDraft ?? ''
  const [value, setValue] = useState(savedDraft)
  const overLimit = value.length > WEEKLY_SUMMARY_MAX_LENGTH

  // Refs so the unmount flush always sees the latest text and snapshot.
  const latestValue = useRef(value)
  latestValue.current = value
  const latestSaved = useRef(savedDraft)
  latestSaved.current = savedDraft
  const updater = useRef(updateWeeklyDraft)
  updater.current = updateWeeklyDraft
  const identity = useRef({ internshipId, weekNumber: entry.weekNumber })
  identity.current = { internshipId, weekNumber: entry.weekNumber }
  const lockedRef = useRef(readOnly)
  lockedRef.current = readOnly

  // Debounced autosave: typing stays local, persistence follows shortly
  // after. Over-limit text is never persisted. Read-only weeks never persist.
  useEffect(() => {
    if (readOnly || value === savedDraft || value.length > WEEKLY_SUMMARY_MAX_LENGTH) return
    const timer = setTimeout(() => {
      updater.current(identity.current.internshipId, identity.current.weekNumber, value)
    }, SUMMARY_AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [value, savedDraft, readOnly])

  // Flush a pending edit when leaving the page so the debounce never drops
  // the last keystrokes.
  useEffect(
    () => () => {
      const text = latestValue.current
      if (!lockedRef.current && text !== latestSaved.current && text.length <= WEEKLY_SUMMARY_MAX_LENGTH) {
        updater.current(identity.current.internshipId, identity.current.weekNumber, text)
      }
    },
    [],
  )

  // A read-only week that becomes editable (changes requested) must pick up
  // the latest saved draft; an editable week that locks keeps its text.
  useEffect(() => {
    if (!readOnly) setValue(savedDraft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  return (
    <div className="simple-section" aria-label="Weekly log">
      <h2>Weekly Log</h2>
      <label className="visually-hidden" htmlFor="weekly-log">Weekly Log</label>
      <textarea
        id="weekly-log"
        aria-label="Weekly Log"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={6}
        maxLength={WEEKLY_SUMMARY_MAX_LENGTH + 1}
        disabled={readOnly}
      />
        <div className="editor-meta">
          <p className={`word-counter${overLimit ? ' invalid' : ''}`}>{`${value.length} / ${WEEKLY_SUMMARY_MAX_LENGTH} characters`}</p>
          {savedDraft.trim().length > 0 && entry.weeklyDraftUpdatedAt && (
            <p className="save-state">Autosaved {new Date(entry.weeklyDraftUpdatedAt).toLocaleString()}</p>
          )}
        </div>
        {overLimit && (
          <div className="form-error" role="alert">
            Weekly log must be {WEEKLY_SUMMARY_MAX_LENGTH} characters or fewer. You have {value.length}.
          </div>
        )}
    </div>
  )
}

function WeeklySubmitSection({
  internshipId,
  entry,
  programmeToday,
}: {
  internshipId: string
  entry: JournalEntry
  programmeToday: string
}) {
  const { submitWeekly } = useApp()
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  // Cross-week leak fix: the section stays mounted while the week selector
  // navigates, so stale success/error copy is cleared per week.
  useEffect(() => {
    setFeedback(null)
    setSaving(false)
  }, [internshipId, entry.weekNumber])

  const submitted = entry.status === 'submitted'
  const changesRequested = submitted && canResubmitDual(entry)
  // Fully locked for the student: submitted without an open revision path
  // (company changes requested, or company approved + mentor changes requested).
  const locked = submitted && !changesRequested
  const draft = entry.weeklyDraft ?? ''
  const overLimit = draft.length > WEEKLY_SUMMARY_MAX_LENGTH
  const readiness = getWeeklyReadiness(entry, programmeToday)

  const blocked = locked || !readiness.canSubmit || overLimit
  // A changes-requested week reopens the submit path immediately: readiness
  // still passes on the unchanged snapshot, so no dirty-vs-snapshot gate.
  const label = !submitted ? 'Submit week' : changesRequested ? 'Resubmit week' : 'Submitted'
  const disabled = blocked || saving

  const onSubmit = () => {
    if (disabled) return
    // Read the latest textarea value directly so a pending debounced
    // autosave can never submit stale text.
    const latest = (document.getElementById('weekly-log') as HTMLTextAreaElement | null)?.value ?? draft
    setSaving(true)
    void submitWeekly(internshipId, entry.weekNumber, latest).then((result) => {
      setSaving(false)
      setFeedback(result.ok ? { text: result.message, ok: true } : { text: result.message, ok: false })
    })
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

export function WeekPage() {
  useDocumentTitle('Weekly log')
  const session = useOptionalSession()
  const managed = session?.managed ?? false
  const { currentInternship: legacyInternship, currentJournal: legacyJournal } = useApp()
  const { weekNumber: weekParam } = useParams()
  const navigate = useNavigate()
  const weekNumber = Number(weekParam)

  if (!weekParam || !Number.isInteger(weekNumber)) return <Navigate to="/journal" replace />
  // Managed mode sources the week from the API (versioned detail + server
  // capabilities); unmanaged mode keeps the legacy local store.
  if (managed) return <ManagedWeekView weekNumber={weekNumber} userId={session?.user?.id} />
  const currentInternship = legacyInternship
  const currentJournal = legacyJournal
  if (!currentInternship || !currentJournal) return <Navigate to="/journal" replace />
  const entry = currentJournal.entries.find((candidate) => candidate.weekNumber === weekNumber)
  if (!entry) return <Navigate to="/journal" replace />

  const today = getProgrammeDate(new Date(), currentInternship.programmeTimeZone)
  const availability = getWeekAvailability(entry, today)
  if (availability === 'locked') return <Navigate to="/journal" replace />
  const availableEntries = [...currentJournal.entries]
    .filter((candidate) => getWeekAvailability(candidate, today) !== 'locked')
    .sort((a, b) => a.weekNumber - b.weekNumber)
  // Locked is a computed display override (never stored); overdue stays display-only.
  // Submitted weeks show a single lifecycle badge (no intermediate approvals).
  const overallStatus = entry.status === 'submitted'
    ? (getLifecycleStatus(entry) ?? 'submitted' as const)
    : availability === 'overdue'
      ? 'overdue' as const
      : entry.status
  // Student edit matrix: submitted weeks lock the weekly report except on the
  // company or pre-resubmit mentor revision path. Daily logs stay editable throughout.
  const weeklyReadOnly = isReadOnlyForStudentDual(entry)
  const companyFeedback = entry.review?.feedback?.trim() ? entry.review.feedback.trim() : ''
  const mentorFeedback = entry.mentorReview?.feedback?.trim() ? entry.mentorReview.feedback.trim() : ''
  const companyChanges = entry.status === 'submitted' && getReviewStatus(entry) === 'changes_requested' && companyFeedback
  const mentorChanges = entry.status === 'submitted' && entry.mentorReview?.status === 'changes_requested' && mentorFeedback

  return (
    <div className="simple-sheet">
      <Link className="back-link" to="/journal"><ArrowLeft size={15} /> Back to journal</Link>
      <PageHeading
        title="Weekly Consolidation Log"
      >
        <div className="editor-badges"><StatusBadge status={overallStatus} /></div>
      </PageHeading>
      {companyChanges && (
        <div className="form-error" role="alert">
          Company changes requested: {companyFeedback}
        </div>
      )}
      {mentorChanges && (
        <div className="form-error" role="alert">
          Mentor changes requested: {mentorFeedback}
        </div>
      )}
      {entry.status === 'submitted' && (
        <section className="card" aria-labelledby="week-feedback-heading">
          <div className="simple-section">
            <h2 id="week-feedback-heading">Feedback</h2>
            {companyFeedback && <p className="empty-copy" style={{ marginBottom: 0 }}>Company feedback: {companyFeedback}</p>}
            {mentorFeedback && <p className="empty-copy" style={{ marginBottom: 0 }}>Mentor feedback: {mentorFeedback}</p>}
            {!companyFeedback && !mentorFeedback && <p className="empty-copy" style={{ marginBottom: 0 }}>No feedback yet.</p>}
          </div>
        </section>
      )}
      <section className="card editor-card simple-sheet-card" aria-label="Weekly log">
        <WeekStartingSelector
          entry={entry}
          availableEntries={availableEntries}
          onSelectWeek={(next) => navigate(`/journal/weeks/${next}`)}
        />
        <WeeklySummarySection
          key={entry.id}
          internshipId={currentInternship.id}
          entry={entry}
          readOnly={weeklyReadOnly}
        />
        <div className="simple-divider" aria-hidden="true" />
        <DailyWeekEditor
          entry={entry}
          programmeToday={today}
        />
        <WeeklySubmitSection
          internshipId={currentInternship.id}
          entry={entry}
          programmeToday={today}
        />
      </section>
    </div>
  )
}

/**
 * Managed week view: structure, drafts, and submit all come from the API.
 * Validation, badges, and feedback rendering mirror the legacy view exactly;
 * only the persistence seam changes (versioned autosave + atomic submit).
 * Exported for managed-flow tests; App routing uses WeekPage above.
 */
export function ManagedWeekView({ weekNumber, userId }: { weekNumber: number; userId: string | undefined }) {
  const navigate = useNavigate()
  const load = useManagedJournal(weekNumber, true)
  const [localDraft, setLocalDraft] = useState<string | null>(null)
  const readyVersion = load.status === 'ready' ? load.version : undefined
  // A new week (or a refreshed server version after submit) resets the
  // locally mirrored draft text; the editor remounts on the version key.
  useEffect(() => {
    setLocalDraft(null)
  }, [weekNumber, readyVersion])

  if (!userId) return <Navigate to="/login" replace />
  if (load.status === 'loading') {
    return <div className="splash"><span className="brand-mark">R</span><p>Loading weekly log…</p></div>
  }
  if (load.status === 'error' || !load.internship || !load.weeks || !load.detail || !load.version) {
    if (load.notFound) return <Navigate to="/journal" replace />
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

  const today = getProgrammeDate(new Date(), load.internship.programmeTimeZone)
  const entry = apiWeekToEntry(load.detail)
  const availability = getWeekAvailability(entry, today)
  if (availability === 'locked') return <Navigate to="/journal" replace />
  const availableEntries = load.weeks
    .map(apiSummaryToEntry)
    .filter((candidate) => getWeekAvailability(candidate, today) !== 'locked')
    .sort((a, b) => a.weekNumber - b.weekNumber)
  const overallStatus = entry.status === 'submitted'
    ? (getLifecycleStatus(entry) ?? 'submitted' as const)
    : availability === 'overdue'
      ? 'overdue' as const
      : entry.status
  const weeklyReadOnly = isReadOnlyForStudentDual(entry)
  const companyFeedback = entry.review?.feedback?.trim() ? entry.review.feedback.trim() : ''
  const mentorFeedback = entry.mentorReview?.feedback?.trim() ? entry.mentorReview.feedback.trim() : ''
  const companyChanges = entry.status === 'submitted' && getReviewStatus(entry) === 'changes_requested' && companyFeedback
  const mentorChanges = entry.status === 'submitted' && entry.mentorReview?.status === 'changes_requested' && mentorFeedback

  return (
    <div className="simple-sheet">
      <Link className="back-link" to="/journal"><ArrowLeft size={15} /> Back to journal</Link>
      <PageHeading
        title="Weekly Consolidation Log"
      >
        <div className="editor-badges"><StatusBadge status={overallStatus} /></div>
      </PageHeading>
      {companyChanges && (
        <div className="form-error" role="alert">
          Company changes requested: {companyFeedback}
        </div>
      )}
      {mentorChanges && (
        <div className="form-error" role="alert">
          Mentor changes requested: {mentorFeedback}
        </div>
      )}
      {entry.status === 'submitted' && (
        <section className="card" aria-labelledby="week-feedback-heading">
          <div className="simple-section">
            <h2 id="week-feedback-heading">Feedback</h2>
            {companyFeedback && <p className="empty-copy" style={{ marginBottom: 0 }}>Company feedback: {companyFeedback}</p>}
            {mentorFeedback && <p className="empty-copy" style={{ marginBottom: 0 }}>Mentor feedback: {mentorFeedback}</p>}
            {!companyFeedback && !mentorFeedback && <p className="empty-copy" style={{ marginBottom: 0 }}>No feedback yet.</p>}
          </div>
        </section>
      )}
      <section className="card editor-card simple-sheet-card" aria-label="Weekly log">
        <WeekStartingSelector
          entry={entry}
          availableEntries={availableEntries}
          onSelectWeek={(next) => navigate(`/journal/weeks/${next}`)}
        />
        <ManagedWeeklyEditor
          key={`${entry.id}:${load.version}`}
          weekNumber={entry.weekNumber}
          userId={userId}
          readOnly={weeklyReadOnly}
          serverCanEdit={load.detail.capabilities.canEdit}
          initialDraft={load.detail.weeklyDraft}
          version={load.version}
          onDraftChange={setLocalDraft}
        />
        <div className="simple-divider" aria-hidden="true" />
        <DailyWeekEditor
          entry={entry}
          programmeToday={today}
        />
        <ManagedSubmitSection
          weekNumber={entry.weekNumber}
          detail={load.detail}
          programmeToday={today}
          draftText={localDraft ?? load.detail.weeklyDraft}
          serverCanSubmit={load.detail.capabilities.canSubmit}
          onSubmitted={() => load.reload()}
        />
      </section>
    </div>
  )
}
