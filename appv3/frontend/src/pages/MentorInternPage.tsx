import { ArrowLeft, ArrowRight, CalendarDays } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AccessDenied } from '../components/AccessDenied'
import { PageHeading } from '../components/PageHeading'
import { StatusBadge } from '../components/StatusBadge'
import { getLifecycleStatus, isMentorVisible } from '../domain/review'
import { weekLabel } from '../domain/weeks'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ManagedInternWeeks } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { JournalEntry } from '../types'
import { getMentorInternScope } from './supervisorInternHelpers'

interface MentorWeekRowProps {
  entry: JournalEntry
  studentId: string
  waiting: boolean
}

/**
 * One week row in the mentee overview list. Mentor-touched weeks stay visible
 * read-only while the intern revises and the company re-reviews.
 */
function MentorWeekRow({ entry, studentId, waiting }: MentorWeekRowProps) {
  const detailTo = `/mentor/interns/${studentId}/weeks/${entry.weekNumber}`
  return (
    <Link className="week-row" to={detailTo}>
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
}

export function MentorInternPage() {
  useDocumentTitle('Mentee review')
  const session = useOptionalSession()
  const { data, currentMentor } = useApp()
  const { studentId } = useParams()
  // Managed mode lists mentor-visible weeks from the server; otherwise legacy.
  if (session?.managed) return <ManagedInternWeeks mode="mentor" studentId={studentId ?? ''} />
  const { profile, placement, student, journal } = getMentorInternScope(data, currentMentor, studentId)

  if (!currentMentor || !profile || !student || !placement || !profile.studentIds.includes(student.id)) {
    return <AccessDenied copy="This intern is not assigned to you." backTo="/mentor/dashboard" backLabel="Back to mentees" eyebrow="UNIVERSITY MENTOR" />
  }
  if (!journal) return <AccessDenied copy="No journal found for this intern." backTo="/mentor/dashboard" backLabel="Back to mentees" eyebrow="UNIVERSITY MENTOR" />

  // Mentors see a week only after company approval on the first pass; once a
  // week has reached the mentor it stays visible read-only while waiting for
  // intern revision + company re-approval. Unsubmitted weeks with a saved
  // weekly summary stay hidden for mentors (no company decision exists yet).
  const visibleEntries = [...journal.entries]
    .filter((entry) => {
      if (entry.status !== 'submitted') return false
      if (isMentorVisible(entry)) return true
      // First-pass pre-approval weeks are never visible/actionable.
      return false
    })
    .sort((a, b) => a.weekNumber - b.weekNumber)

  return (
    <>
      <Link className="back-link" to="/mentor/dashboard"><ArrowLeft size={15} /> Back to mentees</Link>
      <PageHeading
        title={student.name}
        description={`${placement.position} · ${placement.universityName}`}
      />
      <div className="week-list">
        {visibleEntries.length === 0 && (
          <section className="card"><h3>No weeks ready for mentor review yet</h3><p className="empty-copy">Weeks appear here after the company supervisor approves them. Submitted daily logs appear on the review detail.</p></section>
        )}
        {visibleEntries.map((entry) => {
          const waiting = entry.status === 'submitted'
            && entry.mentorReview !== undefined
            && !(entry.review?.status === 'approved' && (entry.mentorReview?.status ?? 'pending') === 'pending')
          return (
            <MentorWeekRow
              key={entry.id}
              entry={entry}
              studentId={student.id}
              waiting={waiting}
            />
          )
        })}
      </div>
    </>
  )
}
