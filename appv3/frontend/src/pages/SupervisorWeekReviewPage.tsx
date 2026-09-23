import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AccessDenied } from '../components/AccessDenied'
import { PageHeading } from '../components/PageHeading'
import { StatusBadge } from '../components/StatusBadge'
import { formatNumericDate, formatWeekdayName, getProgrammeDate, isValidDateString } from '../domain/dates'
import { getWeekAvailability } from '../domain/internship'
import { countWords } from '../domain/journal'
import { getLifecycleStatus, getMentorReviewStatus, getReviewStatus, isValidFeedback } from '../domain/review'
import { submittedBodyOf, workingWeeklyText } from '../domain/weeklyReadiness'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ManagedWeekReview } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatSupervisorDateOnly, formatSupervisorTimestamp, getSupervisorInternScope } from './supervisorInternHelpers'

export function SupervisorWeekReviewPage() {
  useDocumentTitle('Weekly review')
  const session = useOptionalSession()
  const { studentId, weekNumber: weekParam } = useParams()
  const weekNumber = Number(weekParam)
  const { data, currentSupervisor, approveWeek, requestChanges } = useApp()
  const navigate = useNavigate()

  const { profile, placement, student, journal } = getSupervisorInternScope(data, currentSupervisor, studentId)
  const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)

  const [feedback, setFeedback] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  // Cross-week leak fix: the page stays mounted while the Week dropdown
  // navigates, so feedback/message reset per student+week (not per distinct
  // feedback text, which would leak typed edits across same-feedback weeks).
  // A ref carries the latest entry so the effect stays keyed on primitives.
  const entryRef = useRef(entry)
  entryRef.current = entry
  useEffect(() => {
    setFeedback(entryRef.current?.review?.feedback ?? '')
    setMessage(null)
    setSaving(false)
  }, [studentId, weekNumber])

  // Unlocked weeks for the Week dropdown, oldest first. Future locked weeks
  // stay hidden; a directly-accessed locked week is still listed so the
  // selector value stays valid and the user can navigate away.
  const programmeToday = placement ? getProgrammeDate(new Date(), placement.programmeTimeZone) : ''
  const allEntries = [...(journal?.entries ?? [])].sort((a, b) => a.weekNumber - b.weekNumber)
  const unlockedEntries = allEntries.filter((candidate) => getWeekAvailability(candidate, programmeToday) !== 'locked')
  const weekOptions =
    entry && !unlockedEntries.some((candidate) => candidate.weekNumber === entry.weekNumber)
      ? [...unlockedEntries, entry].sort((a, b) => a.weekNumber - b.weekNumber)
      : unlockedEntries

  // Managed mode reviews the server snapshot with atomic versioned
  // transitions; otherwise the legacy local path below.
  if (session?.managed) {
    if (!studentId || !Number.isInteger(weekNumber)) return <Navigate to="/supervisor/dashboard" replace />
    return <ManagedWeekReview key={`${studentId}:${weekNumber}`} mode="supervisor" studentId={studentId} weekNumber={weekNumber} />
  }

  if (!currentSupervisor || !profile || !student || !placement || placement.companyId !== profile.companyId) {
    return <AccessDenied copy="This intern is not in your company." />
  }
  if (!journal || !entry) return <Navigate to={`/supervisor/interns/${studentId}`} replace />

  const onSelectWeek = (value: string) => {
    const next = Number(value)
    if (Number.isInteger(next)) navigate(`/supervisor/interns/${studentId}/weeks/${next}`)
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

  // Only submitted content is reviewable. Unsubmitted weeks with a saved
  // weekly summary are visible read-only and summary-only (no daily logs,
  // no review actions); weeks without either stay unavailable.
  const draftText = workingWeeklyText(entry)
  const hasDraft = draftText.trim().length > 0
  if (entry.status !== 'submitted') {
    if (!hasDraft) {
      return (
        <>
          <Link className="back-link" to={`/supervisor/interns/${studentId}`}><ArrowLeft size={15} /> Back to Interns</Link>
          <PageHeading eyebrow={student.name.toUpperCase()} title="Weekly Review" />
          <section className="card">
            {weekSelector}
            <h3>Not available for review</h3><p className="empty-copy">Only submitted weeks can be reviewed. This week has not been submitted yet.</p>
          </section>
        </>
      )
    }
    return (
      <div className="simple-sheet">
        <Link className="back-link" to={`/supervisor/interns/${studentId}`}><ArrowLeft size={15} /> Back to Interns</Link>
        <PageHeading
          eyebrow={student.name.toUpperCase()}
          title="Weekly Review"
        />
        <section className="card review-body simple-sheet-card">
          <div className="review-badges">
            <StatusBadge status="draft" />
          </div>
          {weekSelector}
          <div className="simple-section">
            <span className="eyebrow">WEEKLY SUMMARY (DRAFT)</span>
            <p className="report-block">{draftText}</p>
            <p className="cell-sub" style={{ margin: 0 }}>
              {countWords(draftText)} words
              {entry.weeklyDraftUpdatedAt ? ` · Draft saved ${formatSupervisorTimestamp(entry.weeklyDraftUpdatedAt)}` : ''}
            </p>
          </div>
          <p className="empty-copy" style={{ margin: 0 }}>
            This week has not been submitted yet. Saved summaries are read-only for supervisors and cannot be approved.
          </p>
        </section>
      </div>
    )
  }

  const reviewStatus = getReviewStatus(entry)
  const mentorStatus = getMentorReviewStatus(entry)
  const mentorFeedback = entry.mentorReview?.feedback?.trim() ? entry.mentorReview.feedback.trim() : ''
  const isPending = reviewStatus === 'pending'
  const snapshot = submittedBodyOf(entry)
  const words = countWords(snapshot)
  // After requested changes the student may keep saving revisions without
  // resubmitting: show the immutable snapshot alongside the latest draft.
  const showRevision = entry.review?.status === 'changes_requested' && hasDraft && draftText !== snapshot
  // Optional daily logs: live text only, filled entries only. The whole
  // section hides when nothing is filled.
  const filledDailies = (entry.dailyEntries ?? []).filter((day) => day.body.trim().length > 0)

  const onApprove = () => {
    if (saving) return
    if (!isPending) {
      setMessage({ text: 'Only weeks pending review can be reviewed.', ok: false })
      return
    }
    setSaving(true)
    // Messages render only after the durable save settles.
    void approveWeek(student.id, entry.weekNumber, feedback).then((result) => {
      setSaving(false)
      setMessage({ text: result.message, ok: result.ok })
    })
  }
  const onRequestChanges = () => {
    if (saving) return
    if (!isPending) {
      setMessage({ text: 'Only weeks pending review can be reviewed.', ok: false })
      return
    }
    if (!isValidFeedback(feedback)) {
      setMessage({ text: 'Feedback is required to request changes.', ok: false })
      return
    }
    setSaving(true)
    void requestChanges(student.id, entry.weekNumber, feedback).then((result) => {
      setSaving(false)
      setMessage({ text: result.message, ok: result.ok })
    })
  }

  return (
    <div className="simple-sheet">
      <Link className="back-link" to={`/supervisor/interns/${studentId}`}><ArrowLeft size={15} /> Back to Interns</Link>
      <PageHeading
        eyebrow={student.name.toUpperCase()}
        title="Weekly Review"
      />
      <section className="card review-body simple-sheet-card">
        <div className="review-badges">
          <StatusBadge status={getLifecycleStatus(entry) ?? 'submitted'} />
        </div>
        {weekSelector}
        <div className="simple-section">
          <span className="eyebrow">SUBMITTED WEEKLY REPORT</span>
          <p className="report-block">{snapshot}</p>
          <p className="cell-sub" style={{ margin: 0 }}>
            {words} words · Submitted {formatSupervisorDateOnly(entry.submittedAt, placement.programmeTimeZone)}
          </p>
        </div>

        {filledDailies.length > 0 && (
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
        )}

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
            onChange={(event) => setFeedback(event.target.value)}
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
              <button className="button primary" type="button" onClick={onApprove} disabled={saving || !isPending}>{saving ? 'Saving…' : 'Approve'}</button>
              <button className="button secondary" type="button" onClick={onRequestChanges} disabled={saving || !isValidFeedback(feedback) || !isPending}>{saving ? 'Saving…' : 'Request changes'}</button>
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
