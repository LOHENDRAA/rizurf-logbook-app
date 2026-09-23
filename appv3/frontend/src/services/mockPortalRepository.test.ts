import { beforeEach, describe, expect, it } from 'vitest'
import { del, set } from 'idb-keyval'
import { getProgrammeDate } from '../domain/dates'
import { getInternshipLifecycle } from '../domain/internship'
import { countLifecycleStages, countMentorLifecycleStages, getLifecycleStatus } from '../domain/review'
import { createDemoData, isPortalData, migrateEntryToV6, migratePortalData, mockPortalRepository } from './mockPortalRepository'

const NOW = new Date('2026-09-10T12:00:00Z')

describe('createDemoData', () => {
  it('produces a versioned v8 portal shape with six students, one supervisor, and one mentor', () => {
    const data = createDemoData(NOW)
    expect(isPortalData(data)).toBe(true)
    expect(data.version).toBe(8)
    expect(data.users.filter((user) => user.role === 'student')).toHaveLength(6)
    expect(data.users.filter((user) => user.role === 'supervisor')).toHaveLength(1)
    expect(data.users.filter((user) => user.role === 'university_mentor')).toHaveLength(1)
    expect(data.companies.length).toBeGreaterThanOrEqual(2)
    expect(data.supervisors).toHaveLength(1)
    expect(data.mentors).toHaveLength(1)
    expect(data.internships).toHaveLength(6)
    expect(data.journals).toHaveLength(6)

    expect(new Set(data.users.map((user) => user.id)).size).toBe(8)
    expect(new Set(data.users.map((user) => user.email)).size).toBe(8)
    expect(new Set(data.internships.map((internship) => internship.id)).size).toBe(6)
    // Fixtures carry identity only: passwords are verified server-side and
    // must never appear in client data, bundles, or storage.
    for (const user of data.users) {
      expect(user.password).toBeUndefined()
      expect(JSON.stringify(user)).not.toMatch(/intern123|supervisor123|mentor123/)
    }
    // One mentor per intern: Dr. Maya Chen covers all six demo interns.
    const mentor = data.users.find((user) => user.role === 'university_mentor')!
    expect(mentor.name).toBe('Dr. Maya Chen')
    expect(mentor.email).toBe('maya.chen@university.example.edu')
    expect(data.mentors[0].userId).toBe(mentor.id)
    expect([...data.mentors[0].studentIds].sort()).toEqual(['student-1', 'student-2', 'student-3', 'student-4', 'student-5', 'student-6'])

    // Every student has exactly one internship and one journal.
    for (const student of data.users.filter((user) => user.role === 'student')) {
      const internships = data.internships.filter((internship) => internship.studentId === student.id)
      expect(internships).toHaveLength(1)
      const journals = data.journals.filter((journal) => journal.internshipId === internships[0].id)
      expect(journals).toHaveLength(1)
    }

    expect(new Set(data.internships.map((internship) => internship.universityName)).size).toBe(6)
    expect(new Set(data.internships.map((internship) => internship.programmeName)).size).toBe(6)
    expect(new Set(data.internships.map((internship) => internship.position)).size).toBe(6)
    expect(new Set(data.internships.map((internship) => internship.programmeTimeZone)).size).toBe(6)
  })

  it('links placements and the supervisor through explicit company records', () => {
    const data = createDemoData(NOW)
    const supervisor = data.users.find((user) => user.role === 'supervisor')!
    const profile = data.supervisors.find((item) => item.userId === supervisor.id)!
    const company = data.companies.find((item) => item.id === profile.companyId)!
    expect(company.name).toBe('Nusantara Digital')
    for (const internship of data.internships) {
      expect(internship.companyId).toBeTruthy()
      expect(data.companies.some((item) => item.id === internship.companyId)).toBe(true)
    }
    const companyInterns = data.internships.filter((internship) => internship.companyId === profile.companyId)
    expect(companyInterns.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps the original Aisha and Daniel profiles', () => {
    const data = createDemoData(NOW)
    const aisha = data.users.find((user) => user.id === 'student-1')!
    expect(aisha.name).toBe('Aisha Rahman')
    const placementA = data.internships.find((internship) => internship.studentId === 'student-1')!
    expect(placementA.universityName).toBe('Universiti Teknologi Malaysia')
    expect(placementA.position).toBe('Software Engineering Intern')
    const daniel = data.users.find((user) => user.id === 'student-2')!
    expect(daniel.name).toBe('Daniel Lee')
    const placementB = data.internships.find((internship) => internship.studentId === 'student-2')!
    expect(placementB.universityName).toBe('University of Westminster')
    expect(placementB.position).toBe('Business Analyst Intern')
  })

  it('covers Marketing, Human Resources, Finance, and Data Analytics roles', () => {
    const data = createDemoData(NOW)
    const positions = data.internships.map((internship) => internship.position)
    expect(positions).toContain('Marketing Intern')
    expect(positions).toContain('Human Resources Intern')
    expect(positions).toContain('Finance Intern')
    expect(positions).toContain('Data Analytics Intern')
  })

  it('spans lifecycle variety: early, mid, late active plus upcoming and completed', () => {
    const data = createDemoData(NOW)
    const lifecycleOf = (placementId: string) => {
      const placement = data.internships.find((internship) => internship.id === placementId)!
      const journal = data.journals.find((item) => item.internshipId === placement.id)!
      const today = getProgrammeDate(NOW, placement.programmeTimeZone)
      return getInternshipLifecycle(placement.startDate, placement.endDate, today, journal.entries.length)
    }

    expect(lifecycleOf('placement-a')).toMatchObject({ phase: 'active', weekNumber: 4, totalWeeks: 12 })
    expect(lifecycleOf('placement-b').phase).toBe('before')
    expect(lifecycleOf('placement-c')).toMatchObject({ phase: 'active', weekNumber: 1 })
    expect(lifecycleOf('placement-d')).toMatchObject({ phase: 'active', weekNumber: 7 })
    expect(lifecycleOf('placement-e')).toMatchObject({ phase: 'active', weekNumber: 11 })
    expect(lifecycleOf('placement-f').phase).toBe('after')

    const upcoming = data.internships.find((internship) => internship.id === 'placement-b')!
    const todayB = getProgrammeDate(NOW, upcoming.programmeTimeZone)
    expect(upcoming.startDate > todayB).toBe(true)
    const completed = data.internships.find((internship) => internship.id === 'placement-f')!
    const todayF = getProgrammeDate(NOW, completed.programmeTimeZone)
    expect(completed.endDate < todayF).toBe(true)
  })

  it('seeds stage-appropriate journal states with long submitted bodies', () => {
    const data = createDemoData(NOW)
    const journalOf = (placementId: string) => data.journals.find((item) => item.internshipId === placementId)!

    const early = journalOf('placement-c')
    expect(early.entries.filter((entry) => entry.status === 'submitted')).toHaveLength(1)

    const mid = journalOf('placement-d')
    expect(mid.entries.filter((entry) => entry.status === 'submitted')).toHaveLength(5)
    expect(mid.entries.filter((entry) => entry.status === 'draft')).toHaveLength(1)

    const late = journalOf('placement-e')
    expect(late.entries.filter((entry) => entry.status === 'submitted')).toHaveLength(10)
    expect(late.entries.filter((entry) => entry.status === 'draft')).toHaveLength(1)

    const done = journalOf('placement-f')
    expect(done.entries.every((entry) => entry.status === 'submitted')).toBe(true)

    const upcoming = journalOf('placement-b')
    expect(upcoming.entries.every((entry) => entry.status === 'not_started')).toBe(true)

    for (const journal of data.journals) {
      for (const entry of journal.entries.filter((candidate) => candidate.status === 'submitted')) {
        expect((entry.submittedBody ?? '').trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('gives every seeded week daily logs plus a weekly draft', () => {
    const data = createDemoData(NOW)
    for (const journal of data.journals) {
      for (const entry of journal.entries) {
        expect(Array.isArray(entry.dailyEntries)).toBe(true)
        expect(typeof entry.weeklyDraft).toBe('string')
        expect('mode' in entry).toBe(false)
      }
    }
  })

  it('seeds submitted weeks with blank optional daily logs and a snapshot', () => {
    const data = createDemoData(NOW)
    const journal = data.journals.find((item) => item.internshipId === 'placement-a')!
    const submitted = journal.entries.filter((entry) => entry.status === 'submitted')
    expect(submitted.length).toBeGreaterThan(0)
    for (const entry of submitted) {
      expect(entry.dailyEntries.every((day) => day.body === '')).toBe(true)
      expect(entry.dailyEntries.every((day) => !('status' in day))).toBe(true)
      expect(entry.submittedBody).toBe(entry.weeklyDraft)
      expect((entry.submittedBody ?? '').trim().length).toBeGreaterThan(0)
      expect(entry.review?.status).toBeTruthy()
    }
  })

  it('seeds varied review states across submitted weeks', () => {
    const data = createDemoData(NOW)
    const statuses = data.journals.flatMap((journal) =>
      journal.entries.filter((entry) => entry.status === 'submitted').map((entry) => entry.review?.status ?? 'pending'),
    )
    expect(statuses).toContain('pending')
    expect(statuses).toContain('approved')
    expect(statuses).toContain('changes_requested')
    const supervisorCompanyInterns = data.internships.filter((internship) => internship.companyId === 'company-nusantara')
    const pendingInCompany = supervisorCompanyInterns.flatMap((internship) => {
      const journal = data.journals.find((item) => item.internshipId === internship.id)!
      return journal.entries.filter((entry) => entry.status === 'submitted' && (entry.review?.status ?? 'pending') === 'pending')
    })
    expect(pendingInCompany.length).toBeGreaterThanOrEqual(2)
  })

  it('seeds the exact per-intern lifecycle distribution', () => {
    const data = createDemoData(NOW)
    const countsOf = (placementId: string) => {
      const journal = data.journals.find((item) => item.internshipId === placementId)!
      return countLifecycleStages(journal.entries)
    }

    // Aisha: 2 submitted weeks, both company-approved + mentor-approved.
    expect(countsOf('placement-a')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 2 })
    // Daniel: upcoming, nothing submitted.
    const journalB = data.journals.find((item) => item.internshipId === 'placement-b')!
    expect(journalB.entries.filter((entry) => entry.status === 'submitted')).toHaveLength(0)
    expect(countsOf('placement-b')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 0 })
    // Maya: 1 submitted week awaiting company review.
    expect(countsOf('placement-c')).toEqual({ awaiting_company: 1, revision_required: 0, awaiting_mentor: 0, completed: 0 })
    // Amara: 2 awaiting company, 2 revision (1 company + 1 mentor), 1 awaiting mentor.
    expect(countsOf('placement-d')).toEqual({ awaiting_company: 2, revision_required: 2, awaiting_mentor: 1, completed: 0 })
    // Jonas: uniform halfway profile, all 10 awaiting mentor review.
    expect(countsOf('placement-e')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 10, completed: 0 })
    // Lily: all 10 completed.
    expect(countsOf('placement-f')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 10 })

    // Spot-check the Amara revision sources via the derived lifecycle.
    const journalD = data.journals.find((item) => item.internshipId === 'placement-d')!
    const byWeek = new Map(journalD.entries.map((entry) => [entry.weekNumber, entry]))
    expect(getLifecycleStatus(byWeek.get(2)!)).toBe('revision_required')
    expect(byWeek.get(2)!.review?.status).toBe('changes_requested')
    expect(getLifecycleStatus(byWeek.get(3)!)).toBe('revision_required')
    expect(byWeek.get(3)!.review?.status).toBe('approved')
    expect(byWeek.get(3)!.mentorReview?.status).toBe('changes_requested')
    // The mentor revision week stays company-approved (eligible).
    expect(byWeek.get(3)!.review?.status).toBe('approved')
    // Draft weeks never carry a lifecycle stage.
    expect(getLifecycleStatus(byWeek.get(6)!)).toBeUndefined()
  })

  it('seeds mentor-visible halfway and completed profiles', () => {
    const data = createDemoData(NOW)
    const mentorCountsOf = (placementId: string) => {
      const journal = data.journals.find((item) => item.internshipId === placementId)!
      return countMentorLifecycleStages(journal.entries)
    }

    expect(mentorCountsOf('placement-e')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 10, completed: 0 })
    expect(mentorCountsOf('placement-f')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 10 })
    expect(mentorCountsOf('placement-a')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 2 })
    // Amara is mentor-visible on the company-approved weeks only.
    expect(mentorCountsOf('placement-d')).toEqual({ awaiting_company: 0, revision_required: 1, awaiting_mentor: 1, completed: 0 })
    // Maya's company-pending week has no mentor history, so it stays hidden.
    expect(mentorCountsOf('placement-c')).toEqual({ awaiting_company: 0, revision_required: 0, awaiting_mentor: 0, completed: 0 })

    // Mentor decisions cover every state.
    const mentorStatuses = data.journals.flatMap((journal) =>
      journal.entries.filter((entry) => entry.mentorReview !== undefined).map((entry) => entry.mentorReview!.status),
    )
    expect(mentorStatuses).toContain('pending')
    expect(mentorStatuses).toContain('approved')
    expect(mentorStatuses).toContain('changes_requested')
    // Company decisions cover every state too.
    const companyStatuses = data.journals.flatMap((journal) =>
      journal.entries.filter((entry) => entry.status === 'submitted').map((entry) => entry.review?.status ?? 'pending'),
    )
    expect(companyStatuses).toContain('pending')
    expect(companyStatuses).toContain('approved')
    expect(companyStatuses).toContain('changes_requested')
  })

  it('seeds an active internship with visible journal progress', () => {
    const data = createDemoData(NOW)
    const active = data.internships.find((internship) => internship.id === 'placement-a')!
    const journal = data.journals.find((item) => item.internshipId === active.id)!
    const today = getProgrammeDate(NOW, active.programmeTimeZone)

    expect(active.startDate < today).toBe(true)
    expect(active.endDate > today).toBe(true)
    expect(journal.entries).toHaveLength(12)

    const submitted = journal.entries.filter((entry) => entry.status === 'submitted')
    const drafts = journal.entries.filter((entry) => entry.status === 'draft')
    expect(submitted.length).toBeGreaterThan(0)
    expect(drafts).toHaveLength(1)
    for (const entry of submitted) expect((entry.submittedBody ?? '').trim().length).toBeGreaterThan(0)
  })

  it('seeds a pre-start internship with every week locked', () => {
    const data = createDemoData(NOW)
    const upcoming = data.internships.find((internship) => internship.id === 'placement-b')!
    const journal = data.journals.find((item) => item.internshipId === upcoming.id)!
    const today = getProgrammeDate(NOW, upcoming.programmeTimeZone)

    expect(upcoming.startDate > today).toBe(true)
    expect(journal.entries).toHaveLength(8)
    expect(journal.entries.every((entry) => entry.startDate > today && entry.status === 'not_started')).toBe(true)
  })
})

describe('isPortalData', () => {
  it('accepts only the versioned v8 shape', () => {
    expect(isPortalData(createDemoData(NOW))).toBe(true)
    expect(isPortalData(undefined)).toBe(false)
    expect(isPortalData(null)).toBe(false)
    expect(isPortalData({ version: 2, students: [], internships: [], journals: [] })).toBe(false)
    expect(isPortalData({ version: 2, users: [], internships: [] })).toBe(false)
    expect(isPortalData({ version: 3, users: [], internships: [], journals: [] })).toBe(false)
    expect(isPortalData({ version: 5, users: [], companies: [], supervisors: [], mentors: [], internships: [], journals: [] })).toBe(false)
    expect(isPortalData({ version: 6, users: [], companies: [], supervisors: [], mentors: [], internships: [], journals: [] })).toBe(false)
    expect(isPortalData({ version: 7, users: [], companies: [], supervisors: [], internships: [], journals: [] })).toBe(false)
    expect(isPortalData({ users: [], journals: [] })).toBe(false)
  })
})

describe('migrateEntryToV6', () => {
  const STAMP = '2026-09-20T10:00:00.000Z'

  it('migrates submitted weekly-only entries with blank daily logs and a snapshot', () => {
    const body = 'hello'
    const migrated = migrateEntryToV6({
      id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
      body, status: 'submitted', dailyEntries: [], weeklyDraft: '',
      submittedAt: STAMP,
    } as never, STAMP)
    expect('mode' in migrated).toBe(false)
    expect(migrated.body).toBe('')
    expect(migrated.submittedBody).toBe(body)
    expect(migrated.weeklyDraft).toBe(body)
    expect(migrated.status).toBe('submitted')
    expect(migrated.dailyEntries.map((day) => day.date)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
    expect(migrated.dailyEntries.every((day) => day.body === '')).toBe(true)
    expect(migrated.dailyEntries.every((day) => !('status' in day))).toBe(true)
    expect(migrated.dailyEntries.every((day) => day.updatedAt === undefined)).toBe(true)
  })

  it('preserves genuine daily logs on submitted weeks and leaves gaps blank', () => {
    const body = 'Short weekly summary.'
    const migrated = migrateEntryToV6({
      id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
      body: '', status: 'submitted', weeklyDraft: body, submittedBody: body, submittedAt: STAMP,
      dailyEntries: [
        { date: '2026-09-14', body: 'My real Monday log.', status: 'complete', updatedAt: '2026-09-14T18:00:00.000Z' },
        { date: '2026-09-15', body: '', status: 'draft' },
      ],
    } as never, STAMP)
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-14')?.body).toBe('My real Monday log.')
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-14')?.updatedAt).toBe('2026-09-14T18:00:00.000Z')
    // Empty days stay blank: daily logs never gate submission.
    const tuesday = migrated.dailyEntries.find((day) => day.date === '2026-09-15')!
    expect(tuesday.body).toBe('')
    expect(migrated.dailyEntries.every((day) => !('status' in day))).toBe(true)
    expect(migrated.submittedBody).toBe(body)
  })

  it('clears exact placeholder sample text back to blank while preserving edited text', async () => {
    const { isPlaceholderDailyBody } = await import('./mockPortalRepository')
    const body = 'Short weekly summary.'
    const literal = 'Started the day by reviewing my goals with my supervisor and agreeing on priorities. Spent the morning learning the team workflow, shadowing a colleague, and taking notes on the deployment process. In the afternoon I picked up a starter task, reproduced the issue locally, and documented my findings for review.'
    expect(isPlaceholderDailyBody(literal, '2026-09-14', 1)).toBe(true)
    expect(isPlaceholderDailyBody('My real Monday log.', '2026-09-14', 1)).toBe(false)
    expect(isPlaceholderDailyBody(`${literal} edited`, '2026-09-14', 1)).toBe(false)
    const migrated = migrateEntryToV6({
      id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
      body: '', status: 'submitted', weeklyDraft: body, submittedBody: body, submittedAt: STAMP,
      dailyEntries: [
        { date: '2026-09-14', body: literal, updatedAt: STAMP },
        { date: '2026-09-15', body: `${literal} edited`, updatedAt: STAMP },
        { date: '2026-09-16', body: 'Genuine student text.', updatedAt: STAMP },
      ],
    } as never, STAMP)
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-14')?.body).toBe('')
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-14')?.updatedAt).toBeUndefined()
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-15')?.body).toBe(`${literal} edited`)
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-16')?.body).toBe('Genuine student text.')
    expect(migrated.dailyEntries.find((day) => day.date === '2026-09-16')?.updatedAt).toBe(STAMP)
  })

  it('moves unsubmitted legacy draft bodies into the weekly draft with blank daily logs', () => {
    const migrated = migrateEntryToV6({
      id: 'week-3', weekNumber: 3, startDate: '2026-09-28', endDate: '2026-10-04',
      body: 'Started looking into the reporting dashboard.', status: 'draft',
    } as never, STAMP)
    expect('mode' in migrated).toBe(false)
    expect(migrated.body).toBe('')
    expect(migrated.weeklyDraft).toBe('Started looking into the reporting dashboard.')
    expect(migrated.submittedBody).toBeUndefined()
    expect(migrated.dailyEntries.map((day) => day.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    ])
    expect(migrated.dailyEntries.every((day) => day.body === '')).toBe(true)
    expect(migrated.dailyEntries.every((day) => !('status' in day))).toBe(true)
    expect(migrated.status).toBe('draft')
  })

  it('adopts untouched weeks into the daily workflow with Mon–Fri logs', () => {
    // Mon 2026-09-14 … Sun 2026-09-20 → 5 required weekdays.
    const migrated = migrateEntryToV6({
      id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
      body: '', status: 'not_started', dailyEntries: [], weeklyDraft: '',
    } as never, STAMP)
    expect(migrated.dailyEntries.map((day) => day.date)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
    expect(migrated.dailyEntries.every((day) => day.body === '')).toBe(true)
    expect(migrated.dailyEntries.every((day) => !('status' in day))).toBe(true)
    expect(migrated.weeklyDraft).toBe('')
    expect(migrated.status).toBe('not_started')
  })

  it('keeps week numbers stable with zero required days for weekend-only periods', () => {
    // Sat 2026-09-12 … Sun 2026-09-13 has no weekdays.
    const migrated = migrateEntryToV6({
      id: 'week-2', weekNumber: 2, startDate: '2026-09-12', endDate: '2026-09-13',
      body: '', status: 'not_started', dailyEntries: [], weeklyDraft: '',
    } as never, STAMP)
    expect(migrated.weekNumber).toBe(2)
    expect(migrated.dailyEntries).toEqual([])
    expect(migrated.weeklyDraft).toBe('')
  })

  it('caps partial weeks to their end date', () => {
    // Single Monday.
    const migrated = migrateEntryToV6({
      id: 'week-9', weekNumber: 9, startDate: '2026-09-21', endDate: '2026-09-21',
      body: '', status: 'not_started', dailyEntries: [], weeklyDraft: '',
    } as never, STAMP)
    expect(migrated.dailyEntries.map((day) => day.date)).toEqual(['2026-09-21'])
  })

  it('is idempotent for already-migrated entries', () => {
    const once = migrateEntryToV6({
      id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
      body: '', status: 'not_started', dailyEntries: [], weeklyDraft: '',
    } as never, STAMP)
    expect(migrateEntryToV6(once as never, STAMP)).toEqual(once)
    const submitted = migrateEntryToV6({
      id: 'week-2', weekNumber: 2, startDate: '2026-09-14', endDate: '2026-09-20',
      body: 'Some draft body.', status: 'submitted', dailyEntries: [], weeklyDraft: '', submittedAt: STAMP,
    } as never, STAMP)
    expect(migrateEntryToV6(submitted as never, STAMP)).toEqual(submitted)
  })
})

describe('mockPortalRepository.load', () => {
  // Mirrors the internal PORTAL_KEY; the in-memory idb-keyval mock in
  // src/test/setup.ts keeps this isolated per test file.
  const KEY = 'portal-data-v1'

  beforeEach(async () => {
    await del(KEY)
  })

  it('returns undefined for empty storage', async () => {
    await expect(mockPortalRepository.load()).resolves.toBeUndefined()
  })

  it('migrates a stored v3 payload to v8', async () => {
    await set(KEY, {
      version: 3,
      users: [],
      companies: [],
      supervisors: [],
      internships: [],
      journals: [{
        internshipId: 'placement-a',
        entries: [{
          id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
          body: '', status: 'not_started',
        }],
      }],
    })
    const loaded = await mockPortalRepository.load()
    expect(loaded?.version).toBe(8)
    expect(loaded?.journals[0].entries[0].dailyEntries.map((day) => day.date)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
    expect(loaded?.mentors).toHaveLength(1)
  })

  it('clears unknown versions and reports a generic failure', async () => {
    await set(KEY, { version: 99, users: [], secret: 's3cr3t-payload-detail' })
    const failure = await mockPortalRepository.load().then(
      () => { throw new Error('expected load to reject') },
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toMatch(/could not be loaded/i)
    expect((failure as Error).message).not.toContain('s3cr3t-payload-detail')
    // The corrupt key is dropped so the next launch starts clean.
    await expect(mockPortalRepository.load()).resolves.toBeUndefined()
  })

  it('treats structurally corrupt v8 payloads as unloadable without hanging', async () => {
    const data = createDemoData(NOW)
    await set(KEY, {
      ...data,
      journals: [{ internshipId: 'placement-a', entries: [{ id: 'week-1', weekNumber: 1 }] },
      ],
    })
    await expect(mockPortalRepository.load()).rejects.toThrow(/could not be loaded/i)
    await expect(mockPortalRepository.load()).resolves.toBeUndefined()
  })
})

describe('migratePortalData', () => {
  it('migrates v3/v4/v5/v6/v7 payloads to v8 and rejects invalid shapes', () => {
    const payload = {
      version: 3,
      users: [],
      companies: [],
      supervisors: [],
      internships: [],
      journals: [{
        internshipId: 'placement-a',
        entries: [{
          id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20',
          body: '', status: 'not_started',
        }],
      }],
    }
    const migrated = migratePortalData(payload)
    expect(migrated?.version).toBe(8)
    expect(migrated?.journals[0].entries[0].dailyEntries.map((day) => day.date)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
    expect('mode' in migrated!.journals[0].entries[0]).toBe(false)
    const v4Payload = { ...createDemoData(NOW), version: 4 } as unknown
    expect(migratePortalData(v4Payload)?.version).toBe(8)
    expect(migratePortalData(undefined)).toBeUndefined()
    expect(migratePortalData({ version: 2 })).toBeUndefined()
    expect(migratePortalData(createDemoData(NOW))?.version).toBe(8)
  })

  it('migrates a stored v6 payload to v8 and clears fabricated daily text', async () => {
    const v6Seed = { ...createDemoData(NOW), version: 6 } as unknown
    const migrated = migratePortalData(v6Seed)
    expect(migrated?.version).toBe(8)
    for (const journal of migrated!.journals) {
      for (const entry of journal.entries.filter((candidate) => candidate.status === 'submitted')) {
        expect(entry.dailyEntries.every((day) => day.body === '')).toBe(true)
      }
    }
  })

  it('is idempotent for already-migrated v8 entries', () => {
    const data = createDemoData(NOW)
    const once = migratePortalData(data)
    expect(migratePortalData(once)?.version).toBe(8)
    expect(migratePortalData(once)).toEqual(once)
  })

  it('seeds mentor slots for company-approved weeks, pending by default', () => {
    const data = createDemoData(NOW)
    const approved = data.journals.flatMap((journal) =>
      journal.entries.filter((entry) => entry.status === 'submitted' && entry.review?.status === 'approved'),
    )
    expect(approved.length).toBeGreaterThan(0)
    // Every company-approved week reaches the mentor with a stored decision:
    // pending unless an explicit mentor approval or revision is seeded.
    for (const entry of approved) {
      expect(entry.mentorReview?.status).toBeTruthy()
    }
    const defaultPending = approved.filter((entry) => entry.mentorReview?.status === 'pending')
    expect(defaultPending.length).toBeGreaterThan(0)
    const decided = approved.filter((entry) => entry.mentorReview?.status !== 'pending')
    expect(decided.length).toBeGreaterThan(0)
    const pending = data.journals.flatMap((journal) =>
      journal.entries.filter((entry) => entry.status === 'submitted' && (entry.review?.status ?? 'pending') === 'pending'),
    )
    expect(pending.length).toBeGreaterThan(0)
    for (const entry of pending) {
      expect(entry.mentorReview).toBeUndefined()
    }
  })

  it('migrates a v7 payload to v8 with mentor pending for approved weeks', () => {
    const seed = createDemoData(NOW)
    const v7 = { ...seed, version: 7, mentors: undefined } as unknown as Record<string, unknown>
    delete v7.mentors
    v7.users = (seed.users as unknown[]).filter((user) => (user as { id: string }).id !== 'mentor-1')
    v7.journals = (seed.journals as unknown[]).map((journal) => ({
      ...(journal as object),
      entries: ((journal as { entries: { mentorReview?: unknown }[] }).entries as { mentorReview?: unknown }[]).map((entry) => {
        const rest = { ...entry }
        delete rest.mentorReview
        return rest
      }),
    }))
    const migrated = migratePortalData(v7)
    expect(migrated?.version).toBe(8)
    expect(migrated?.mentors).toHaveLength(1)
    expect(migrated?.users.some((user) => user.id === 'mentor-1' && user.role === 'university_mentor')).toBe(true)
    const approved = migrated!.journals.flatMap((journal) =>
      journal.entries.filter((entry) => entry.status === 'submitted' && entry.review?.status === 'approved'),
    )
    expect(approved.length).toBeGreaterThan(0)
    for (const entry of approved) {
      expect(entry.mentorReview?.status).toBe('pending')
    }
    // Idempotent: migrating twice keeps the same mentor slots.
    expect(migratePortalData(migrated)).toEqual(migrated)
  })
})
