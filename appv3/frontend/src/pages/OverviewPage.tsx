import { ArrowRight, BriefcaseBusiness, CalendarDays, GraduationCap, Layers } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { ProgressBar } from '../components/StatusBadge'
import { getProgrammeDate } from '../domain/dates'
import { findOwningEntry, isDateAvailable } from '../domain/daily'
import { getInternshipLifecycle } from '../domain/internship'
import { getMyInternship, listMyWeeks } from '../api/portal'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { summaryToReviewEntry, useManagedLoad } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NoInternship() {
  return (
    <>
      <PageHeading eyebrow="OVERVIEW" title="No active internship" description="Your account is not linked to an internship placement yet." />
      <section className="card">
        <h3>Nothing to show</h3>
        <p className="empty-copy">Contact your placement coordinator if you expected to see internship details here.</p>
      </section>
    </>
  )
}

export function OverviewPage() {
  useDocumentTitle('Internship overview')
  const session = useOptionalSession()
  const { currentStudent, currentInternship, currentJournal } = useApp()
  // Managed mode reads the placement from the server; otherwise legacy.
  if (session?.managed) return <ManagedOverview userId={session.user?.id} userName={session.user?.name ?? ''} />
  if (!currentStudent || !currentInternship || !currentJournal) return <NoInternship />

  const today = getProgrammeDate(new Date(), currentInternship.programmeTimeZone)
  const totalWeeks = currentJournal.entries.length
  const lifecycle = getInternshipLifecycle(currentInternship.startDate, currentInternship.endDate, today, totalWeeks)
  const owningToday = findOwningEntry(currentJournal.entries, today)
  const hasLogToday = !!owningToday && isDateAvailable(today, owningToday, today)

  return (
    <>
      <PageHeading
        eyebrow={`${currentStudent.name.toUpperCase()} · OVERVIEW`}
        title="Internship overview"
        description={`${currentInternship.position} at ${currentInternship.companyName}`}
      />

      <section className="lifecycle-hero">
        <div className="ambient ambient-one" />
        <div className="hero-progress-top">
          <div>
            <span className="hero-pill"><Layers size={13} /> INTERNSHIP TIMELINE</span>
            <h2>{lifecycle.headline}</h2>
            {lifecycle.weeksLabel !== lifecycle.headline && <p>{lifecycle.weeksLabel}</p>}
          </div>
          <div className="big-progress"><strong>{lifecycle.percent}%</strong><span>time elapsed</span></div>
        </div>
        <ProgressBar value={lifecycle.percent} />
        <div className="hero-meta">
          <span><CalendarDays size={16} /> {currentInternship.startDate} → {currentInternship.endDate}</span>
          <span>{totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'} total</span>
        </div>
      </section>

      <div className="section-heading"><div><span className="eyebrow">PLACEMENT</span><h2>Internship details</h2></div></div>
      <div className="detail-grid">
        <article className="card detail-card">
          <GraduationCap size={20} />
          <span className="eyebrow">UNIVERSITY</span>
          <h3>{currentInternship.universityName}</h3>
          <p>{currentInternship.programmeName}</p>
        </article>
        <article className="card detail-card">
          <BriefcaseBusiness size={20} />
          <span className="eyebrow">COMPANY</span>
          <h3>{currentInternship.companyName}</h3>
          <p>{currentInternship.position}</p>
        </article>
        <article className="card detail-card">
          <CalendarDays size={20} />
          <span className="eyebrow">DATES</span>
          <h3>{currentInternship.startDate} → {currentInternship.endDate}</h3>
          <p>{totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'} · {currentInternship.programmeTimeZone}</p>
        </article>
      </div>

      <section className="card feature-card">
        <div>
          <span className="eyebrow">DAILY LOG</span>
          <h3>Daily Log</h3>
          <p>Record what you worked on each scheduled internship day. Daily logs unlock on their scheduled date.</p>
        </div>
        {hasLogToday ? (
          <Link className="button primary" to={`/journal/days/${today}`}>Open today&apos;s log <ArrowRight size={16} /></Link>
        ) : (
          <button className="button primary" type="button" disabled>No log due today</button>
        )}
      </section>
    </>
  )
}

/** Managed overview: placement + lifecycle from the server, same layout. */
function ManagedOverview({ userId, userName }: { userId: string | undefined; userName: string }) {
  const load = useManagedLoad('student-overview', async () => {
    const [internship, weeks] = await Promise.all([getMyInternship(), listMyWeeks()])
    return { internship, entries: weeks.data.map(summaryToReviewEntry) }
  })

  if (!userId) return <Navigate to="/login" replace />
  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="splash"><span className="brand-mark">R</span><p>Loading overview…</p></div>
  }
  if (load.status === 'error' || !load.data) {
    if (load.notFound) return <NoInternship />
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

  const { internship, entries } = load.data
  const today = getProgrammeDate(new Date(), internship.programmeTimeZone)
  const totalWeeks = entries.length
  const lifecycle = getInternshipLifecycle(internship.startDate, internship.endDate, today, totalWeeks)
  const owningToday = findOwningEntry(entries, today)
  const hasLogToday = !!owningToday && isDateAvailable(today, owningToday, today)

  return (
    <>
      <PageHeading
        eyebrow={`${userName.toUpperCase()} · OVERVIEW`}
        title="Internship overview"
        description={`${internship.position} at ${internship.companyName}`}
      />

      <section className="lifecycle-hero">
        <div className="ambient ambient-one" />
        <div className="hero-progress-top">
          <div>
            <span className="hero-pill"><Layers size={13} /> INTERNSHIP TIMELINE</span>
            <h2>{lifecycle.headline}</h2>
            {lifecycle.weeksLabel !== lifecycle.headline && <p>{lifecycle.weeksLabel}</p>}
          </div>
          <div className="big-progress"><strong>{lifecycle.percent}%</strong><span>time elapsed</span></div>
        </div>
        <ProgressBar value={lifecycle.percent} />
        <div className="hero-meta">
          <span><CalendarDays size={16} /> {internship.startDate} → {internship.endDate}</span>
          <span>{totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'} total</span>
        </div>
      </section>

      <div className="section-heading"><div><span className="eyebrow">PLACEMENT</span><h2>Internship details</h2></div></div>
      <div className="detail-grid">
        <article className="card detail-card">
          <GraduationCap size={20} />
          <span className="eyebrow">UNIVERSITY</span>
          <h3>{internship.universityName}</h3>
          <p>{internship.programmeName}</p>
        </article>
        <article className="card detail-card">
          <BriefcaseBusiness size={20} />
          <span className="eyebrow">COMPANY</span>
          <h3>{internship.companyName}</h3>
          <p>{internship.position}</p>
        </article>
        <article className="card detail-card">
          <CalendarDays size={20} />
          <span className="eyebrow">DATES</span>
          <h3>{internship.startDate} → {internship.endDate}</h3>
          <p>{totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'} · {internship.programmeTimeZone}</p>
        </article>
      </div>

      <section className="card feature-card">
        <div>
          <span className="eyebrow">DAILY LOG</span>
          <h3>Daily Log</h3>
          <p>Record what you worked on each scheduled internship day. Daily logs unlock on their scheduled date.</p>
        </div>
        {hasLogToday ? (
          <Link className="button primary" to={`/journal/days/${today}`}>Open today&apos;s log <ArrowRight size={16} /></Link>
        ) : (
          <button className="button primary" type="button" disabled>No log due today</button>
        )}
      </section>
    </>
  )
}
