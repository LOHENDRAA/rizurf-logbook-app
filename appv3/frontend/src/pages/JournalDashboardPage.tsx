import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Lock, Unlock } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { StatusBadge, type BadgeStatus } from '../components/StatusBadge'
import { getProgrammeDate } from '../domain/dates'
import { findOwningEntry, isDateAvailable } from '../domain/daily'
import { getWeekAvailability, type WeekAvailability } from '../domain/internship'
import { getLifecycleStatus } from '../domain/review'
import { weekLabel } from '../domain/weeks'
import { getMyInternship, getMyWeek, listMyWeeks } from '../api/portal'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { summaryToReviewEntry, useManagedLoad } from '../features/review/managedReview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { JournalEntry } from '../types'
import { NoInternship } from './OverviewPage'

/** Locked is a computed display override (never stored); overdue stays display-only. */
function rowStatus(entry: JournalEntry, availability: WeekAvailability): BadgeStatus {
  if (availability === 'locked') return 'locked'
  if (availability === 'overdue') return 'overdue'
  if (entry.status === 'submitted') return getLifecycleStatus(entry) ?? 'submitted'
  return entry.status
}

function WeekRow({ entry, availability }: { entry: JournalEntry; availability: WeekAvailability }) {
  const label = weekLabel(entry.weekNumber)
  if (availability === 'locked') {
    return (
      <div className="week-row locked" aria-disabled="true" aria-label={`${label}, locked, starts ${entry.startDate}`}>
        <span className="document-index">{String(entry.weekNumber).padStart(2, '0')}</span>
        <span className="week-main">
          <span className="week-title-row">
            <strong>{label}</strong>
            <StatusBadge status={rowStatus(entry, availability)} />
          </span>
          <small><CalendarDays size={13} /> {entry.startDate}</small>
        </span>
        <Lock size={16} className="row-arrow" aria-hidden="true" />
      </div>
    )
  }
  return (
    <Link className="week-row" to={`/journal/weeks/${entry.weekNumber}`}>
      <span className="document-index">{String(entry.weekNumber).padStart(2, '0')}</span>
      <span className="week-main">
        <span className="week-title-row">
          <strong>{label}</strong>
          <StatusBadge status={rowStatus(entry, availability)} />
        </span>
        <small><CalendarDays size={13} /> {entry.startDate}</small>
      </span>
      <ArrowRight size={16} className="row-arrow" />
    </Link>
  )
}

export function JournalDashboardPage() {
  useDocumentTitle('Journal')
  const session = useOptionalSession()
  const { currentInternship, currentJournal } = useApp()
  // Managed mode reads weeks from the server; otherwise legacy.
  if (session?.managed) return <ManagedJournalDashboard userId={session.user?.id} />
  if (!currentInternship || !currentJournal) return <NoInternship />

  const today = getProgrammeDate(new Date(), currentInternship.programmeTimeZone)
  const entries = currentJournal.entries
  const availabilityOf = (entry: JournalEntry) => getWeekAvailability(entry, today)
  const sortedEntries = [...entries].sort((a, b) => a.weekNumber - b.weekNumber)

  const owningToday = findOwningEntry(entries, today)
  const todayAvailable = !!owningToday && isDateAvailable(today, owningToday, today)
  const todayBody = owningToday?.dailyEntries?.find((day) => day.date === today)?.body ?? ''

  return (
    <>
      <PageHeading
        title="Daily + weekly journals"
        description={`${currentInternship.programmeName} · ${currentInternship.universityName}`}
      />

      {todayAvailable ? (
        <section className="card today-card today-compact" aria-label="Today's daily log">
          <h3>Today&apos;s log</h3>
          <Link className="button primary" to={`/journal/days/${today}`}>
            {todayBody.trim() ? 'Continue today’s log' : 'Write today’s log'} <ArrowRight size={16} />
          </Link>
        </section>
      ) : null}

      {/* Unified list: every week oldest first. Overdue stays a label-only badge. */}
      {entries.length > 0 && (
        <section className="week-list" aria-label="Journal weeks">
          {sortedEntries.map((entry) => <WeekRow key={entry.id} entry={entry} availability={availabilityOf(entry)} />)}
        </section>
      )}

      {entries.length === 0 && (
        <section className="card">
          <h3><Unlock size={16} /> No journal weeks yet</h3>
          <p className="empty-copy">Your journal weeks will appear here once your internship schedule is available.</p>
        </section>
      )}
    </>
  )
}

/** Managed journal dashboard: weeks from the server, same grouping. */
function ManagedJournalDashboard({ userId }: { userId: string | undefined }) {
  const load = useManagedLoad('student-journal', async () => {
    const [internship, weeks] = await Promise.all([getMyInternship(), listMyWeeks()])
    return { internship, entries: weeks.data.map(summaryToReviewEntry) }
  })
  const [todayBody, setTodayBody] = useState<string | null>(null)

  const today = load.data ? getProgrammeDate(new Date(), load.data.internship.programmeTimeZone) : ''
  const entries = load.data?.entries ?? []
  const owningToday = load.data ? findOwningEntry(entries, today) : undefined
  const todayAvailable = !!owningToday && isDateAvailable(today, owningToday, today)
  const owningWeekNumber = owningToday?.weekNumber

  // Today's log preview comes from the owning week's detail (summaries carry
  // no daily text); failures fall back to the generic write CTA.
  useEffect(() => {
    if (!todayAvailable || owningWeekNumber === undefined) {
      setTodayBody(null)
      return
    }
    let cancelled = false
    void getMyWeek(owningWeekNumber)
      .then(({ week }) => {
        if (!cancelled) setTodayBody(week.dailyEntries.find((day) => day.date === today)?.body ?? '')
      })
      .catch(() => {
        if (!cancelled) setTodayBody('')
      })
    return () => {
      cancelled = true
    }
  }, [todayAvailable, owningWeekNumber, today])

  if (!userId) return <Navigate to="/login" replace />
  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="splash"><span className="brand-mark">R</span><p>Loading journal…</p></div>
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

  const availabilityOf = (entry: JournalEntry) => getWeekAvailability(entry, today)
  const sortedEntries = [...entries].sort((a, b) => a.weekNumber - b.weekNumber)

  return (
    <>
      <PageHeading
        title="Daily + weekly journals"
        description={`${load.data.internship.programmeName} · ${load.data.internship.universityName}`}
      />

      {todayAvailable ? (
        <section className="card today-card today-compact" aria-label="Today's daily log">
          <h3>Today&apos;s log</h3>
          <Link className="button primary" to={`/journal/days/${today}`}>
            {(todayBody ?? '').trim() ? 'Continue today’s log' : 'Write today’s log'} <ArrowRight size={16} />
          </Link>
        </section>
      ) : null}

      {/* Unified list: every week oldest first. Overdue stays a label-only badge. */}
      {entries.length > 0 && (
        <section className="week-list" aria-label="Journal weeks">
          {sortedEntries.map((entry) => <WeekRow key={entry.id} entry={entry} availability={availabilityOf(entry)} />)}
        </section>
      )}

      {entries.length === 0 && (
        <section className="card">
          <h3><Unlock size={16} /> No journal weeks yet</h3>
          <p className="empty-copy">Your journal weeks will appear here once your internship schedule is available.</p>
        </section>
      )}
    </>
  )
}
