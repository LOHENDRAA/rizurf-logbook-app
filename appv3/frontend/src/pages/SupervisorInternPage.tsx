import { ArrowLeft, ArrowRight, CalendarDays } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AccessDenied } from '../components/AccessDenied'
import { PageHeading } from '../components/PageHeading'
import { StatusBadge } from '../components/StatusBadge'
import { getLifecycleStatus } from '../domain/review'
import { workingWeeklyText } from '../domain/weeklyReadiness'
import { weekLabel } from '../domain/weeks'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ManagedInternWeeks } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { JournalEntry } from '../types'
import { getSupervisorInternScope } from './supervisorInternHelpers'

interface SupervisorWeekRowProps {
  entry: JournalEntry
  studentId: string
}

/**
 * One week row in the intern overview list. Every visible week is a plain
 * link to its individual review detail.
 */
function SupervisorWeekRow({ entry, studentId }: SupervisorWeekRowProps) {
  const detailTo = `/supervisor/interns/${studentId}/weeks/${entry.weekNumber}`
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
      </span>
      <ArrowRight size={16} className="row-arrow" aria-hidden="true" />
    </Link>
  )
}

export function SupervisorInternPage() {
  useDocumentTitle('Intern review')
  const session = useOptionalSession()
  const { data, currentSupervisor } = useApp()
  const { studentId } = useParams()
  // Managed mode lists the server-scoped submitted weeks; otherwise legacy.
  if (session?.managed) return <ManagedInternWeeks mode="supervisor" studentId={studentId ?? ''} />
  const { profile, placement, student, journal } = getSupervisorInternScope(data, currentSupervisor, studentId)

  if (!currentSupervisor || !profile || !student || !placement || placement.companyId !== profile.companyId) {
    return <AccessDenied copy="This intern is not in your company." />
  }
  if (!journal) return <AccessDenied copy="No journal found for this intern." />

  // Supervisors see submitted weeks plus unsubmitted weeks with a saved
  // weekly summary draft. Draft rows are read-only and summary-only; weeks
  // without either stay hidden. Each week is reviewed individually on its
  // detail page.
  const visibleEntries = [...journal.entries]
    .filter((entry) => entry.status === 'submitted' || workingWeeklyText(entry).trim().length > 0)
    .sort((a, b) => a.weekNumber - b.weekNumber)

  return (
    <>
      <Link className="back-link" to="/supervisor/dashboard"><ArrowLeft size={15} /> Back to interns</Link>
      <PageHeading
        title={student.name}
        description={`${placement.position} · ${placement.universityName}`}
      />
      <div className="week-list">
        {visibleEntries.length === 0 && (
          <section className="card"><h3>No submitted weeks or saved drafts yet</h3><p className="empty-copy">Submitted weekly reports and saved weekly summaries will appear here for review. Submitted daily logs appear on the review detail; weeks without a submission or a saved summary are never shown.</p></section>
        )}
        {visibleEntries.map((entry) => (
          <SupervisorWeekRow
            key={entry.id}
            entry={entry}
            studentId={student.id}
          />
        ))}
      </div>
    </>
  )
}
