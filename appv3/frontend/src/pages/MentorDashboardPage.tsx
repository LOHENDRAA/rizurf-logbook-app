import { useMemo } from 'react'
import { ArrowRight, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { countMentorLifecycleStages, lifecycleAttentionCount, type LifecycleCounts } from '../domain/review'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ManagedReviewQueue } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

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

export function MentorDashboardPage() {
  useDocumentTitle('Assigned mentees')
  const session = useOptionalSession()
  const { data, currentMentor } = useApp()

  const profile = currentMentor ? data.mentors?.find((item) => item.userId === currentMentor.id) : undefined

  const mentees = useMemo(() => {
    if (!profile) return []
    const rows = profile.studentIds.map((studentId) => {
      const student = data.users.find((user) => user.id === studentId && user.role === 'student')
      const placement = data.internships.find((internship) => internship.studentId === studentId)
      const journal = placement ? data.journals.find((item) => item.internshipId === placement.id) : undefined
      const entries = journal?.entries ?? []
      const counts = countMentorLifecycleStages(entries)
      const submitted = entries.filter((entry) => entry.status === 'submitted').length
      return { student, placement, journal, counts, submitted, total: entries.length }
    }).filter((row) => row.student)
    rows.sort((a, b) => {
      if (lifecycleAttentionCount(b.counts) !== lifecycleAttentionCount(a.counts)) return lifecycleAttentionCount(b.counts) - lifecycleAttentionCount(a.counts)
      return (a.student?.name ?? '').localeCompare(b.student?.name ?? '')
    })
    return rows
  }, [data, profile])

  // Managed mode lists the server-scoped mentee queue; otherwise legacy.
  if (session?.managed) return <ManagedReviewQueue mode="mentor" />

  if (!currentMentor || !profile) {
    return (
      <>
        <PageHeading eyebrow="UNIVERSITY MENTOR" title="Access denied" description="Your account is not linked to any mentees." />
        <section className="card"><h3>No mentees assigned</h3><p className="empty-copy">Contact your administrator if you expected mentor access.</p></section>
      </>
    )
  }

  return (
    <>
      <PageHeading title="Assigned mentees" />

      {mentees.length === 0 ? (
        <section className="card">
          <h3><Users size={16} /> No mentees yet</h3>
          <p className="empty-copy">No interns are assigned to you yet.</p>
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
              {mentees.map((row) => (
                <tr key={row.student!.id}>
                  <td><strong>{row.student!.name}</strong><small className="cell-sub">{row.submitted} of {row.total} submitted</small></td>
                  <td><small className="cell-sub">{row.placement?.position ?? '—'}</small></td>
                  <td><ReviewSummary counts={row.counts} /></td>
                  <td><Link className="button secondary small" to={`/mentor/interns/${row.student!.id}`}>Review <ArrowRight size={15} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
