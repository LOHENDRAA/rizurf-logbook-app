/**
 * Dev/test fixtures for the MSW contract mock. Mirrors the demo workspace
 * (six interns, one supervisor company, one mentor) without any passwords:
 * the mock login accepts any non-empty password for a known email, exactly
 * like a real server would verify credentials opaquely.
 */

export interface FixtureUser {
  id: string
  name: string
  email: string
  role: 'student' | 'supervisor' | 'university_mentor'
  avatar: string
}

export const fixtureUsers: FixtureUser[] = [
  { id: 'student-1', name: 'Aisha Rahman', email: 'aisha.rahman@student.example.edu', role: 'student', avatar: 'AR' },
  { id: 'student-3', name: 'Maya Chen', email: 'maya.chen@student.example.edu.au', role: 'student', avatar: 'MC' },
  { id: 'supervisor-1', name: 'Sarah Lim', email: 'sarah.lim@nusantara.example.com', role: 'supervisor', avatar: 'SL' },
  { id: 'mentor-1', name: 'Dr. Maya Chen', email: 'maya.chen@university.example.edu', role: 'university_mentor', avatar: 'DM' },
]

export interface FixtureWeek {
  weekNumber: number
  startDate: string
  endDate: string
  status: 'not_started' | 'draft' | 'submitted'
  version: string
  dailyEntries: { date: string; body: string }[]
  weeklyDraft: string
  submittedBody?: string
  review?: { status: 'pending' | 'approved' | 'changes_requested'; feedback?: string }
  mentorReview?: { status: 'pending' | 'approved' | 'changes_requested'; feedback?: string }
  capabilities: { canEdit: boolean; canSubmit: boolean; canReview: boolean }
}

function week(overrides: Partial<FixtureWeek> & { weekNumber: number }): FixtureWeek {
  return {
    startDate: '2026-08-03',
    endDate: '2026-08-09',
    status: 'draft',
    version: `v-${overrides.weekNumber}-1`,
    dailyEntries: [],
    weeklyDraft: '',
    capabilities: { canEdit: true, canSubmit: true, canReview: false },
    ...overrides,
  }
}

/** Mutable in-memory store so handlers can exercise version conflicts. */
export function createFixtureStore() {
  const weeks = new Map<number, FixtureWeek>([
    [1, week({ weekNumber: 1, status: 'submitted', weeklyDraft: 'Seeded weekly report.', submittedBody: 'Seeded weekly report.', review: { status: 'pending' }, capabilities: { canEdit: false, canSubmit: false, canReview: false } })],
    [2, week({ weekNumber: 2, weeklyDraft: 'In-progress draft.' })],
    [3, week({ weekNumber: 3, status: 'submitted', weeklyDraft: 'Needs work.', submittedBody: 'Needs work.', review: { status: 'changes_requested', feedback: 'Add concrete examples.' }, capabilities: { canEdit: true, canSubmit: true, canReview: false } })],
  ])
  return { weeks }
}

export type FixtureStore = ReturnType<typeof createFixtureStore>
