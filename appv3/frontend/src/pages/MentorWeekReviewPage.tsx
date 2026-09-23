import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AccessDenied } from '../components/AccessDenied'
import { PageHeading } from '../components/PageHeading'
import { StatusBadge } from '../components/StatusBadge'
import { formatNumericDate, formatWeekdayName, getProgrammeDate, isValidDateString } from '../domain/dates'
import { getWeekAvailability } from '../domain/internship'
import { countWords } from '../domain/journal'
import { getLifecycleStatus, getMentorReviewStatus, isMentorPending, isMentorVisible, isValidFeedback } from '../domain/review'
import { submittedBodyOf, workingWeeklyText } from '../domain/weeklyReadiness'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ManagedWeekReview } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatSupervisorDateOnly, formatSupervisorTimestamp, getMentorInternScope } from './supervisorInternHelpers'

export function MentorWeekReviewPage() {
  useDocumentTitle('Mentor review')
  const session = useOptionalSession()
  const { studentId, weekNumber: weekParam } = useParams()
  const weekNumber = Number(weekParam)
  const { data, currentMentor, approveWeek, requestChanges } = useApp()
  const navigate = useNavigate()

  const { profile, placement, student, journal } = getMentorInternScope(data, currentMentor, studentId)
  const entry = journal?.entries.find((candidate) => candidate.weekNumber === weekNumber)

  const [feedback, setFeedback] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const entryRef = useRef(entry)
  entryRef.current = entry
  useEffect(() => {
    setFeedback(entryRef.current?.mentorReview?.feedback ?? '')
    setMessage(null)
    setSaving(false)
  }, [studentId, weekNumber])

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
    if (!studentId || !Number.isInteger(weekNumber)) return <Navigate to="/mentor/dashboard" replace />
    return <ManagedWeekReview key={`${studentId}:${weekNumber}`} mode="mentor" studentId={studentId} weekNumber={weekNumber} />
  }

  if (!currentMentor || !profile || !student || !placement || !profile.studentIds.includes(student.id)) {
    return <AccessDenied copy="This intern is not assigned to you." backTo="/mentor/dashboard" backLabel="Back to mentees" eyebrow="UNIVERSITY MENTOR" />
  }
  if (!journal || !entry) return <Navigate to={`/mentor/interns/${studentId}`} replace />

  const onSelectWeek = (value: string) => {
    const next = Number(value)
    if (Number.isInteger(next)) navigate(`/mentor/interns/${studentId}/weeks/${next}`)
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

  // Mentor gate: first-time weeks are never visible/actionable before company
  // approval; mentor-touched weeks stay visible read-only afterwards.
  if (entry.status !== 'submitted' || !isMentorVisible(entry)) {
    return (
      <>
        <Link className="back-link" to={`/mentor/interns/${studentId}`}><ArrowLeft size={15} /> Back to Mentees</Link>
        <PageHeading eyebrow={student.name.toUpperCase()} title="Mentor Review" />
        <section className="card">
          {weekSelector}
          <h3>Not available for mentor review</h3><p className="empty-copy">This week is awaiting company review. Weeks appear here after the company supervisor approves them.</p>
        </section>
      </>
    )
  }

  const mentorStatus = getMentorReviewStatus(entry) ?? 'pending'
  const actionable = isMentorPending(entry)
  const companyApproved = entry.review?.status === 'approved'
  const waitingForCompany = !companyApproved
  const snapshot = submittedBodyOf(entry)
  const words = countWords(snapshot)
  const draftText = workingWeeklyText(entry)
  const hasDraft = draftText.trim().length > 0
  const showRevision = entry.review?.status === 'changes_requested' && hasDraft && draftText !== snapshot
  const filledDailies = (entry.dailyEntries ?? []).filter((day) => day.body.trim().length > 0)
  const companyFeedback = entry.review?.feedback?.trim() ? entry.review.feedback.trim() : ''

  const onApprove = () => {
    if (saving) return
    if (!actionable) {
      setMessage({ text: waitingForCompany ? 'This week is awaiting company review.' : 'Only weeks pending review can be reviewed.', ok: false })
      return
    }
    setSaving(true)
    void approveWeek(student.id, entry.weekNumber, feedback).then((result) => {
      setSaving(false)
      setMessage({ text: result.message, ok: result.ok })
    })
  }
  const onRequestChanges = () => {
    if (saving) return
    if (!actionable) {
      setMessage({ text: waitingForCompany ? 'This week is awaiting company review.' : 'Only weeks pending review can be reviewed.', ok: false })
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
      <Link className="back-link" to={`/mentor/interns/${studentId}`}><ArrowLeft size={15} /> Back to Mentees</Link>
      <PageHeading
        eyebrow={student.name.toUpperCase()}
        title="Mentor Review"
      />
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
            onChange={(event) => setFeedback(event.target.value)}
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
              <button className="button primary" type="button" onClick={onApprove} disabled={saving || !actionable}>{saving ? 'Saving…' : 'Approve'}</button>
              <button className="button secondary" type="button" onClick={onRequestChanges} disabled={saving || !isValidFeedback(feedback) || !actionable}>{saving ? 'Saving…' : 'Request changes'}</button>
            </div>
          </div>
        </div>

      </section>
    </div>
  )
}
