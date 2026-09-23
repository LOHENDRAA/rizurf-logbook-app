import type { InternshipPlacement, Journal, MentorProfile, PortalData, SupervisorProfile, User } from '../types'

export interface SupervisorInternScope {
  profile: SupervisorProfile | undefined
  placement: InternshipPlacement | undefined
  student: User | undefined
  journal: Journal | undefined
}

export interface MentorInternScope {
  profile: MentorProfile | undefined
  placement: InternshipPlacement | undefined
  student: User | undefined
  journal: Journal | undefined
}

/**
 * Shared company-scoped lookup for the supervisor intern pages. Preserves the
 * full authorization check order: supervisor session, supervisor profile,
 * student role, placement, then company match. Callers apply their own guard
 * (overview shows AccessDenied for a missing journal; review redirects).
 */
export function getSupervisorInternScope(
  data: PortalData,
  currentSupervisor: User | undefined,
  studentId: string | undefined,
): SupervisorInternScope {
  const profile = currentSupervisor ? data.supervisors.find((item) => item.userId === currentSupervisor.id) : undefined
  const placement = data.internships.find((item) => item.studentId === studentId)
  const student = data.users.find((user) => user.id === studentId && user.role === 'student')
  const journal = placement ? data.journals.find((item) => item.internshipId === placement.id) : undefined
  return { profile, placement, student, journal }
}

/**
 * Shared assignment-scoped lookup for the mentor intern pages. Mirrors the
 * supervisor check order: mentor session, mentor profile, student role,
 * placement, then assignment match.
 */
export function getMentorInternScope(
  data: PortalData,
  currentMentor: User | undefined,
  studentId: string | undefined,
): MentorInternScope {
  const profile = currentMentor ? data.mentors?.find((item) => item.userId === currentMentor.id) : undefined
  const placement = data.internships.find((item) => item.studentId === studentId)
  const student = data.users.find((user) => user.id === studentId && user.role === 'student')
  const journal = placement ? data.journals.find((item) => item.internshipId === placement.id) : undefined
  return { profile, placement, student, journal }
}

/**
 * Local-timezone timestamp for supervisor-facing dates. Preserves the
 * previous `new Date(value).toLocaleString()` semantics (local TZ, not the
 * UTC date-only helpers in domain/dates). Empty values render as '—'.
 */
export function formatSupervisorTimestamp(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '—'
}

/**
 * Date-only supervisor date (`DD/MM/YYYY`) for an ISO timestamp, resolved in
 * the given time zone (programme time zone for submitted dates). No time,
 * no zone name. Missing or unparseable values render as '—'.
 */
export function formatSupervisorDateOnly(value: string | undefined, timeZone: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone,
    }).format(date)
  } catch {
    return '—'
  }
}
