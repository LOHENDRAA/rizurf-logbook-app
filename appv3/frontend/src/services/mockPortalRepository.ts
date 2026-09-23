import { del, get, set } from 'idb-keyval'
import type { Company, InternshipPlacement, Journal, JournalEntry, JournalReview, MentorProfile, PortalData, SupervisorProfile, User } from '../types'
import { addDaysUtc, getProgrammeDate } from '../domain/dates'
import { weekdaysInWeek } from '../domain/daily'
import { buildWeeks } from '../domain/weeks'
import type { PortalRepository } from './portalRepository'

const PORTAL_KEY = 'portal-data-v1'
const LEGACY_JOURNAL_KEY = 'journal-data-v1'

export function isPortalData(value: unknown): value is PortalData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    data.version === 8 &&
    Array.isArray(data.users) &&
    Array.isArray(data.companies) &&
    Array.isArray(data.supervisors) &&
    Array.isArray(data.mentors) &&
    Array.isArray(data.internships) &&
    Array.isArray(data.journals)
  )
}

function isV7Payload(value: unknown): value is Omit<PortalData, 'version' | 'mentors'> & { version: 7 } {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    data.version === 7 &&
    Array.isArray(data.users) &&
    Array.isArray(data.companies) &&
    Array.isArray(data.supervisors) &&
    Array.isArray(data.internships) &&
    Array.isArray(data.journals)
  )
}

function isV6Payload(value: unknown): value is Omit<PortalData, 'version'> & { version: 6 } {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    data.version === 6 &&
    Array.isArray(data.users) &&
    Array.isArray(data.companies) &&
    Array.isArray(data.supervisors) &&
    Array.isArray(data.internships) &&
    Array.isArray(data.journals)
  )
}

function isV5Payload(value: unknown): value is Omit<PortalData, 'version'> & { version: 5 } {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    data.version === 5 &&
    Array.isArray(data.users) &&
    Array.isArray(data.companies) &&
    Array.isArray(data.supervisors) &&
    Array.isArray(data.internships) &&
    Array.isArray(data.journals)
  )
}

function isLegacyPayload(value: unknown): value is Omit<PortalData, 'version'> & { version: 3 | 4 } {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    (data.version === 3 || data.version === 4) &&
    Array.isArray(data.users) &&
    Array.isArray(data.companies) &&
    Array.isArray(data.supervisors) &&
    Array.isArray(data.internships) &&
    Array.isArray(data.journals)
  )
}

/** Deterministic realistic daily samples, cycled by date and week number. */
const SAMPLE_DAILY_BODIES = [
  'Started the day by reviewing my goals with my supervisor and agreeing on priorities. Spent the morning learning the team workflow, shadowing a colleague, and taking notes on the deployment process. In the afternoon I picked up a starter task, reproduced the issue locally, and documented my findings for review.',
  'Focused on the onboarding checklist and a customer-facing bug. Traced the issue through the frontend and the backend, wrote a failing test, and then fixed the root cause. Reviewed a teammate pull request and joined the afternoon stand-up with an update on my progress.',
  'Continued work on my assigned ticket by breaking it into smaller steps with clear deadlines. Paired with a senior engineer in the morning, then practised with sample data until I felt confident. Ended the day by writing up what I learned in the team wiki.',
  'Joined sprint planning and a design review, which helped me understand how decisions get made. Spent the afternoon improving the local setup documentation so the next intern can get started faster. Collected feedback from my mentor and turned it into concrete goals.',
  'Presented a draft of my work to the team, answered questions, and collected feedback that improved the final version. Helped a fellow intern troubleshoot a problem, which reinforced my own understanding. Closed out the day by organising my notes and planning tomorrow.',
  'Audited my task list and closed out the items I could complete independently. Updated the team documentation, organised shared files, and flagged one item needing supervisor input with clear notes on status and next steps. Reflected on time management at the end of the day.',
]

function sampleDailyBody(date: string, weekNumber: number): string {
  let hash = (weekNumber * 31) >>> 0
  for (const char of date) hash = ((hash * 31 + char.charCodeAt(0)) >>> 0)
  return SAMPLE_DAILY_BODIES[hash % SAMPLE_DAILY_BODIES.length]
}

/**
 * Exact-match placeholder detection: a body counts as fabricated sample text
 * when it equals any of the 6 SAMPLE_DAILY_BODIES literals or the
 * deterministic sampleDailyBody(date, weekNumber) output for its day.
 */
export function isPlaceholderDailyBody(body: string, date: string, weekNumber: number): boolean {
  if (SAMPLE_DAILY_BODIES.includes(body)) return true
  return body === sampleDailyBody(date, weekNumber)
}

/**
 * v3/v4/v5/v6 → v7 migration (idempotent): every week adopts the
 * daily-plus-weekly layout with body-based daily logs, and daily logs are a
 * separate optional record that is never fabricated.
 * - Submitted weeks keep status/submittedBody/review/submittedAt. Stored
 *   daily text is preserved verbatim except exact placeholder matches (the 6
 *   SAMPLE_DAILY_BODIES literals or sampleDailyBody(date, weekNumber) output),
 *   which are cleared back to blank. Missing required dates get blank logs;
 *   no sample bodies are ever generated and no updatedAt stamps are fabricated.
 * - Unsubmitted weeks keep their working text (`weeklyDraft`, falling back to
 *   the legacy `body`) and existing daily logs (placeholder matches cleared);
 *   missing required dates get blank logs.
 * - Legacy working fields are stripped (`body` stays ''); extra per-day
 *   lifecycle fields from older payloads are dropped by rebuilding each log
 *   as `{ date, body, updatedAt? }`.
 * - Zero-weekday periods keep stable week numbers with zero required days.
 */
export function migrateEntryToV7(
  raw: JournalEntry & { mode?: unknown; dailyEntries?: ({ date: string; body?: unknown; updatedAt?: unknown } & Record<string, unknown>)[] },
  nowIso = new Date().toISOString(),
): JournalEntry {
  void nowIso
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mode: _legacyMode, ...withoutMode } = raw
  const entry = withoutMode as JournalEntry
  const required = weekdaysInWeek(entry.startDate, entry.endDate)
  const stored = Array.isArray(entry.dailyEntries) ? entry.dailyEntries : []
  const byDate = new Map(stored.map((day) => [day.date, day]))
  const cleanStored = (date: string): { date: string; body: string; updatedAt?: string } => {
    const existing = byDate.get(date)
    const body = typeof existing?.body === 'string' ? existing.body : ''
    if (body !== '' && isPlaceholderDailyBody(body, date, entry.weekNumber)) {
      return { date, body: '' }
    }
    if (existing && typeof existing.updatedAt === 'string') {
      return { date, body, updatedAt: existing.updatedAt }
    }
    return { date, body }
  }

  if (entry.status === 'submitted') {
    const submittedBody =
      (typeof entry.submittedBody === 'string' && entry.submittedBody.trim().length > 0 ? entry.submittedBody : undefined) ??
      (typeof entry.body === 'string' && entry.body.trim().length > 0 ? entry.body : undefined) ??
      (typeof entry.weeklyDraft === 'string' && entry.weeklyDraft.trim().length > 0 ? entry.weeklyDraft : undefined) ??
      ''
    return {
      ...entry,
      body: '',
      status: 'submitted',
      dailyEntries: required.map((date) => cleanStored(date)),
      weeklyDraft: typeof entry.weeklyDraft === 'string' && entry.weeklyDraft.trim().length > 0 ? entry.weeklyDraft : submittedBody,
      submittedBody,
    }
  }

  const weeklyDraft = typeof entry.weeklyDraft === 'string' && entry.weeklyDraft.trim().length > 0
    ? entry.weeklyDraft
    : (typeof entry.body === 'string' ? entry.body : '')
  const dailyEntries = required.map((date) => cleanStored(date))
  // Preserve any stored logs outside the required range (e.g. older seeds),
  // clearing exact placeholder matches back to blank.
  for (const day of stored) {
    if (!dailyEntries.some((candidate) => candidate.date === day.date)) {
      const body = typeof day.body === 'string' ? day.body : ''
      if (body !== '' && isPlaceholderDailyBody(body, day.date, entry.weekNumber)) {
        dailyEntries.push({ date: day.date, body: '' })
      } else {
        dailyEntries.push({ date: day.date, body, ...(typeof day.updatedAt === 'string' ? { updatedAt: day.updatedAt } : {}) })
      }
    }
  }
  dailyEntries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return {
    ...entry,
    body: '',
    dailyEntries,
    weeklyDraft,
  }
}

/** Backwards-compatible aliases for the v7 migration. */
export const migrateEntryToV6 = migrateEntryToV7
export const migrateEntryToV5 = migrateEntryToV7

export function migratePortalData(value: unknown): PortalData | undefined {
  if (isPortalData(value)) {
    return {
      ...(value as PortalData),
      version: 8,
      journals: (value as PortalData).journals.map((journal) => ({
        ...journal,
        entries: journal.entries.map((entry) => migrateEntryToV7(entry as never)),
      })),
    }
  }
  if (isV7Payload(value)) {
    const v7 = value as unknown as Omit<PortalData, 'version' | 'mentors'> & { version: 7 }
    const journals = v7.journals.map((journal) => ({
      ...journal,
      entries: journal.entries.map((entry) => migrateEntryToV7(entry as never)),
    }))
    return migrateV7ToV8({
      users: v7.users as User[],
      companies: v7.companies as Company[],
      supervisors: v7.supervisors as SupervisorProfile[],
      internships: v7.internships as InternshipPlacement[],
      journals,
    })
  }
  if (isV6Payload(value) || isV5Payload(value) || isLegacyPayload(value)) {
    const journals = ((value as { journals: Journal[] }).journals as Journal[]).map((journal) => ({
      ...journal,
      entries: journal.entries.map((entry) => migrateEntryToV7(entry as never)),
    }))
    return migrateV7ToV8({
      users: (value as { users: User[] }).users as User[],
      companies: (value as { companies: Company[] }).companies as Company[],
      supervisors: (value as { supervisors: SupervisorProfile[] }).supervisors as SupervisorProfile[],
      internships: (value as { internships: InternshipPlacement[] }).internships as InternshipPlacement[],
      journals,
    })
  }
  return undefined
}

/** v7 → v8 migration (idempotent): adds the university mentor + mentor slot. */
export function migrateV7ToV8(base: {
  users: User[]
  companies: Company[]
  supervisors: SupervisorProfile[]
  internships: InternshipPlacement[]
  journals: Journal[]
}): PortalData {
  const users = [...base.users]
  if (!users.some((user) => user.id === DEMO_MENTOR_ID)) {
    users.push(mentorUser())
  }
  const studentIds = users.filter((user) => user.role === 'student').map((user) => user.id)
  const mentors: MentorProfile[] = [{ userId: DEMO_MENTOR_ID, studentIds }]
  const journals = base.journals.map((journal) => ({
    ...journal,
    entries: journal.entries.map((entry) => {
      if (entry.status !== 'submitted') return entry.mentorReview === undefined ? entry : entry
      if (entry.mentorReview !== undefined) return entry
      // Existing company-approved weeks enter the mentor queue as pending;
      // every other submitted week has not reached the mentor yet.
      if ((entry.review?.status ?? 'pending') === 'approved') {
        return { ...entry, mentorReview: { status: 'pending' } satisfies JournalReview }
      }
      return entry
    }),
  }))
  return {
    version: 8,
    users,
    companies: base.companies,
    supervisors: base.supervisors,
    mentors,
    internships: base.internships,
    journals,
  }
}

const BODY_WEEK_ONE =
  'During my first weeks I focused on understanding the product and the engineering workflow. I set up my local development environment, ran the full test suite, and read through the architecture documentation. I paired with a senior engineer on a small bug fix and learned how pull requests are reviewed in this team. I joined the daily stand-up, sprint planning, and a design review, which helped me understand how decisions get made. Later I picked up a starter ticket, reproduced the issue, and opened a draft pull request. I also wrote up my findings in the team wiki and listed open questions for my mentor. Finally I reflected on what went well and what I want to improve, especially testing and written communication.'

const BODY_WEEK_TWO =
  'This week I worked on the onboarding checklist and a customer-facing bug. I traced the issue through the frontend and the backend, added a failing test, and then fixed the root cause. I reviewed two pull requests from teammates and left comments about readability and edge cases. I also improved the documentation for the local setup so the next intern can get started faster. In the afternoon sessions I joined a workshop on accessibility and applied two of the ideas to my own work. I finished the week by writing a short demo script and presenting my progress in the team showcase. I captured feedback from my mentor and turned it into concrete goals for next week, including smaller commits and asking questions earlier.'

const DRAFT_BODY =
  'Started looking into the reporting dashboard. Gathered requirements from the product notes, sketched a rough plan, and scheduled a follow-up with the design team.'

const BODY_WEEK_THREE =
  'This week I took on more ownership of my day-to-day tasks and started contributing without waiting for detailed instructions. I began by reviewing my goals with my supervisor and agreeing on two priorities for the week, then broke each one into smaller steps with clear deadlines. I spent time learning a new internal tool, watched the training videos, and practised with sample data until I felt confident. Midweek I presented a draft of my work to the team, answered questions, and collected feedback that helped me improve the final version. I also helped a fellow intern troubleshoot a problem, which reinforced my own understanding. I documented my process so others can follow it later. By Friday I submitted both priorities, reflected on my time management, and set a learning goal for next week around clearer written updates.'

const BODY_WEEK_FOUR =
  'As my placement enters its final stretch I focused on finishing strong and handing over my work responsibly. I audited every task on my list, closed out the items I could complete independently, and flagged the ones that need input from my supervisor with clear notes on status and next steps. I updated the team documentation, organised shared files, and recorded short walkthroughs so whoever picks up my projects can continue without friction. I also asked three colleagues for honest feedback on my strengths and areas to grow, and I was grateful for their specific examples. In our final one-to-one my supervisor and I reviewed my learning goals and discussed how this experience connects to my final-year modules. I ended the week by writing thank-you notes and a personal summary of what this internship taught me about professional work.'

/** Long submitted bodies, cycled across weeks as realistic seed content. */
const SUBMITTED_BODIES = [BODY_WEEK_ONE, BODY_WEEK_TWO, BODY_WEEK_THREE, BODY_WEEK_FOUR]

export const DEMO_SUPERVISOR_ID = 'supervisor-1'
export const DEMO_SUPERVISOR_COMPANY_ID = 'company-nusantara'
export const DEMO_MENTOR_ID = 'mentor-1'

function studentUsers(): User[] {
  // No passwords: authentication is verified server-side via the cookie
  // session. These fixtures carry identity only.
  return [
    { id: 'student-1', name: 'Aisha Rahman', email: 'aisha.rahman@student.example.edu', role: 'student', avatar: 'AR' },
    { id: 'student-2', name: 'Daniel Lee', email: 'daniel.lee@student.example.ac.uk', role: 'student', avatar: 'DL' },
    { id: 'student-3', name: 'Maya Chen', email: 'maya.chen@student.example.edu.au', role: 'student', avatar: 'MC' },
    { id: 'student-4', name: 'Amara Okafor', email: 'amara.okafor@student.example.ca', role: 'student', avatar: 'AO' },
    { id: 'student-5', name: 'Jonas Weber', email: 'jonas.weber@student.example.de', role: 'student', avatar: 'JW' },
    { id: 'student-6', name: 'Lily Wang', email: 'lily.wang@student.example.nz', role: 'student', avatar: 'LW' },
  ]
}

function supervisorUser(): User {
  return {
    id: DEMO_SUPERVISOR_ID,
    name: 'Sarah Lim',
    email: 'sarah.lim@nusantara.example.com',
    role: 'supervisor',
    avatar: 'SL',
  }
}

function mentorUser(): User {
  return {
    id: DEMO_MENTOR_ID,
    name: 'Dr. Maya Chen',
    email: 'maya.chen@university.example.edu',
    role: 'university_mentor',
    avatar: 'DM',
  }
}

function mentorProfiles(): MentorProfile[] {
  return [{
    userId: DEMO_MENTOR_ID,
    studentIds: ['student-1', 'student-2', 'student-3', 'student-4', 'student-5', 'student-6'],
  }]
}

function companies(): Company[] {
  return [
    { id: DEMO_SUPERVISOR_COMPANY_ID, name: 'Nusantara Digital' },
    { id: 'company-thames', name: 'Thames Consulting' },
    { id: 'company-meridian', name: 'Meridian Capital' },
    { id: 'company-harbour', name: 'Harbour Analytics' },
  ]
}

function supervisorProfiles(): SupervisorProfile[] {
  return [{ userId: DEMO_SUPERVISOR_ID, companyId: DEMO_SUPERVISOR_COMPANY_ID }]
}

/** Submitted weeks use the daily-plus-weekly layout: blank optional daily logs plus a submitted snapshot. */
function submittedDailyWeek(entry: JournalEntry, nowIso: string, bodyIndex: number): JournalEntry {
  const weeklyText = SUBMITTED_BODIES[bodyIndex % SUBMITTED_BODIES.length]
  return {
    ...entry,
    body: '',
    status: 'submitted',
    dailyEntries: weekdaysInWeek(entry.startDate, entry.endDate).map((date) => ({
      date,
      body: '',
    })),
    weeklyDraft: weeklyText,
    weeklyDraftUpdatedAt: nowIso,
    submittedBody: weeklyText,
    updatedAt: nowIso,
    submittedAt: nowIso,
    review: { status: 'pending' } satisfies JournalReview,
  }
}

/**
 * Stage-appropriate journal seeding: the first `submittedCount` weeks are
 * submitted daily-plus-weekly entries, `draftWeek` (if given) is a daily week
 * with an in-progress weekly draft, and the rest are untouched daily weeks.
 */
function seedEntries(startDate: string, endDate: string, now: Date, submittedCount: number, draftWeek?: number): JournalEntry[] {
  const built = buildWeeks(startDate, endDate)
  if (!built.ok) throw new Error(built.message)
  const nowIso = now.toISOString()
  return built.entries.map((entry, index) => {
    const weekNumber = index + 1
    if (weekNumber <= submittedCount) return submittedDailyWeek(entry, nowIso, index)
    if (weekNumber === draftWeek) {
      return { ...entry, weeklyDraft: DRAFT_BODY, weeklyDraftUpdatedAt: nowIso, status: 'draft' as const, updatedAt: nowIso }
    }
    return entry
  })
}

function seedActiveEntries(startDate: string, endDate: string, now: Date): JournalEntry[] {
  return seedEntries(startDate, endDate, now, 2, 3)
}

function seedUpcomingEntries(startDate: string, endDate: string): JournalEntry[] {
  const built = buildWeeks(startDate, endDate)
  if (!built.ok) throw new Error(built.message)
  return built.entries
}

function withReviews(
  entries: JournalEntry[],
  reviews: Record<number, JournalReview>,
  mentorReviews: Record<number, JournalReview> = {},
): JournalEntry[] {
  return entries.map((entry) => {
    const review = reviews[entry.weekNumber]
    if (!review) return entry
    if (entry.status !== 'submitted') return entry
    const mentorOverride = mentorReviews[entry.weekNumber]
    // Company-approved weeks enter the mentor queue as pending unless an
    // explicit mentor decision (approved / changes_requested) is seeded.
    if (review.status === 'approved') {
      return { ...entry, review, mentorReview: mentorOverride ?? ({ status: 'pending' } satisfies JournalReview) }
    }
    if (mentorOverride) return { ...entry, review, mentorReview: mentorOverride }
    return { ...entry, review }
  })
}

/**
 * Deterministic placement window: `startOffsetDays` from the programme-local
 * today in `timeZone`, spanning `totalWeeks` full weeks.
 */
function placementWindow(now: Date, timeZone: string, startOffsetDays: number, totalWeeks: number): { start: string; end: string } {
  const today = getProgrammeDate(now, timeZone)
  const start = addDaysUtc(today, startOffsetDays)
  const end = addDaysUtc(start, totalWeeks * 7 - 1)
  return { start, end }
}

export function createDemoData(now: Date): PortalData {
  const nowIso = now.toISOString()
  const reviewer = 'Sarah Lim'
  // Aisha: active ~Week 4 of 12 (elapsed 24 days -> floor(24 / 7) + 1).
  const windowA = placementWindow(now, 'Asia/Kuala_Lumpur', -24, 12)
  // Daniel: upcoming, starts in 10 days, 8 weeks.
  const windowB = placementWindow(now, 'Europe/London', 10, 8)
  // Maya: early active ~Week 1 of 10.
  const windowC = placementWindow(now, 'Australia/Melbourne', -1, 10)
  // Amara: mid active ~Week 7 of 12 (elapsed 43 days -> floor(43 / 7) + 1).
  const windowD = placementWindow(now, 'America/Toronto', -43, 12)
  // Jonas: late active ~Week 11 of 12 (elapsed 71 days -> floor(71 / 7) + 1).
  const windowE = placementWindow(now, 'Europe/Berlin', -71, 12)
  // Lily: completed 10 weeks, ended 5 days ago.
  const windowF = placementWindow(now, 'Pacific/Auckland', -74, 10)

  const internshipA: InternshipPlacement = {
    id: 'placement-a',
    studentId: 'student-1',
    companyId: DEMO_SUPERVISOR_COMPANY_ID,
    universityName: 'Universiti Teknologi Malaysia',
    programmeName: 'BSc Computer Science',
    programmeTimeZone: 'Asia/Kuala_Lumpur',
    companyName: 'Nusantara Digital',
    position: 'Software Engineering Intern',
    startDate: windowA.start,
    endDate: windowA.end,
  }
  const internshipB: InternshipPlacement = {
    id: 'placement-b',
    studentId: 'student-2',
    companyId: 'company-thames',
    universityName: 'University of Westminster',
    programmeName: 'BA Business Management',
    programmeTimeZone: 'Europe/London',
    companyName: 'Thames Consulting',
    position: 'Business Analyst Intern',
    startDate: windowB.start,
    endDate: windowB.end,
  }
  // Grouped under the supervisor's company for review.
  const internshipC: InternshipPlacement = {
    id: 'placement-c',
    studentId: 'student-3',
    companyId: DEMO_SUPERVISOR_COMPANY_ID,
    universityName: 'University of Melbourne',
    programmeName: 'BCom Marketing',
    programmeTimeZone: 'Australia/Melbourne',
    companyName: 'Nusantara Digital',
    position: 'Marketing Intern',
    startDate: windowC.start,
    endDate: windowC.end,
  }
  const internshipD: InternshipPlacement = {
    id: 'placement-d',
    studentId: 'student-4',
    companyId: DEMO_SUPERVISOR_COMPANY_ID,
    universityName: 'University of Toronto',
    programmeName: 'BA Human Resource Management',
    programmeTimeZone: 'America/Toronto',
    companyName: 'Nusantara Digital',
    position: 'Human Resources Intern',
    startDate: windowD.start,
    endDate: windowD.end,
  }
  const internshipE: InternshipPlacement = {
    id: 'placement-e',
    studentId: 'student-5',
    companyId: 'company-meridian',
    universityName: 'Technical University of Munich',
    programmeName: 'BSc Finance',
    programmeTimeZone: 'Europe/Berlin',
    companyName: 'Meridian Capital',
    position: 'Finance Intern',
    startDate: windowE.start,
    endDate: windowE.end,
  }
  const internshipF: InternshipPlacement = {
    id: 'placement-f',
    studentId: 'student-6',
    companyId: 'company-harbour',
    universityName: 'University of Auckland',
    programmeName: 'BSc Data Science',
    programmeTimeZone: 'Pacific/Auckland',
    companyName: 'Harbour Analytics',
    position: 'Data Analytics Intern',
    startDate: windowF.start,
    endDate: windowF.end,
  }

  const journalA: Journal = {
    internshipId: internshipA.id,
    entries: withReviews(seedActiveEntries(windowA.start, windowA.end, now), {
      1: { status: 'approved', feedback: 'Clear reflection and strong evidence of learning.', reviewedBy: reviewer, reviewedAt: nowIso },
      2: { status: 'approved', feedback: 'Strong weekly report with clear evidence of progress.', reviewedBy: reviewer, reviewedAt: nowIso },
    }, {
      1: { status: 'approved', feedback: 'Excellent reflection; learning goals are well evidenced.', reviewedBy: 'Dr. Maya Chen', reviewedAt: nowIso },
      2: { status: 'approved', feedback: 'Good progress against placement objectives.', reviewedBy: 'Dr. Maya Chen', reviewedAt: nowIso },
    }),
  }
  const journalB: Journal = { internshipId: internshipB.id, entries: seedUpcomingEntries(windowB.start, windowB.end) }
  const journalC: Journal = {
    internshipId: internshipC.id,
    entries: withReviews(seedEntries(windowC.start, windowC.end, now, 1), {
      1: { status: 'pending' },
    }),
  }
  const journalD: Journal = {
    internshipId: internshipD.id,
    entries: withReviews(seedEntries(windowD.start, windowD.end, now, 5, 6), {
      1: { status: 'approved', feedback: 'Thorough handover notes, well done.', reviewedBy: reviewer, reviewedAt: nowIso },
      2: { status: 'changes_requested', feedback: 'Please add concrete examples from your HR shadowing.', reviewedBy: reviewer, reviewedAt: nowIso },
      3: { status: 'approved', feedback: 'Good engagement with the team this week.', reviewedBy: reviewer, reviewedAt: nowIso },
      4: { status: 'pending' },
      5: { status: 'pending' },
    }, {
      3: { status: 'changes_requested', feedback: 'Please connect your reflections to the placement learning outcomes.', reviewedBy: 'Dr. Maya Chen', reviewedAt: nowIso },
    }),
  }
  const jonasReviews: Record<number, JournalReview> = {}
  for (let week = 1; week <= 10; week += 1) {
    jonasReviews[week] = {
      status: 'approved',
      feedback: week % 2 === 1 ? 'Solid analysis.' : 'Good progress.',
      reviewedBy: 'Finance Supervisor',
      reviewedAt: nowIso,
    }
  }
  const journalE: Journal = {
    internshipId: internshipE.id,
    entries: withReviews(seedEntries(windowE.start, windowE.end, now, 10, 11), jonasReviews),
  }
  const lilyReviews: Record<number, JournalReview> = {}
  const lilyMentorReviews: Record<number, JournalReview> = {}
  for (let week = 1; week <= 10; week += 1) {
    lilyReviews[week] = {
      status: 'approved',
      feedback: week % 2 === 1 ? 'Excellent data summary.' : 'Strong analytics work with clear methodology.',
      reviewedBy: 'Analytics Supervisor',
      reviewedAt: nowIso,
    }
    lilyMentorReviews[week] = {
      status: 'approved',
      feedback: week % 2 === 1 ? 'Well evidenced against learning outcomes.' : 'Thorough reflection and strong analysis.',
      reviewedBy: 'Dr. Maya Chen',
      reviewedAt: nowIso,
    }
  }
  const journalF: Journal = {
    internshipId: internshipF.id,
    entries: withReviews(seedEntries(windowF.start, windowF.end, now, 10), lilyReviews, lilyMentorReviews),
  }

  return {
    version: 8,
    users: [...studentUsers(), supervisorUser(), mentorUser()],
    companies: companies(),
    supervisors: supervisorProfiles(),
    mentors: mentorProfiles(),
    internships: [internshipA, internshipB, internshipC, internshipD, internshipE, internshipF],
    journals: [journalA, journalB, journalC, journalD, journalE, journalF],
  }
}

export const mockPortalRepository: PortalRepository = {
  async load() {
    const saved = await get<unknown>(PORTAL_KEY)
    if (saved === undefined || saved === null) return undefined
    let migrated: PortalData | undefined
    try {
      migrated = migratePortalData(saved)
    } catch {
      migrated = undefined
    }
    if (!migrated) {
      // Unrecognized or damaged payload: drop it so the next launch starts
      // clean, then report a generic failure without leaking stored details.
      try {
        await del(PORTAL_KEY)
      } catch {
        // Best effort: a failing clear must not block the demo fallback.
      }
      throw new Error('Saved workspace could not be loaded.')
    }
    return migrated
  },
  async save(data) {
    await set(PORTAL_KEY, data)
  },
  async clear() {
    await del(PORTAL_KEY)
    await del(LEGACY_JOURNAL_KEY)
  },
  createDemoData,
}
