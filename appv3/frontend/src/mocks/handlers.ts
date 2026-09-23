/**
 * MSW handlers mirroring openapi/portal.yaml: success paths plus
 * 401 / 403 / 404 / 409 / 412 / 422 error paths with RFC 9457 bodies.
 * Dev/test only — never initialized in production (see mocks/browser).
 */

import { http, HttpResponse } from 'msw'
import { createFixtureStore, fixtureUsers, type FixtureStore, type FixtureWeek } from './fixtures'

let requestCounter = 0
function requestId(): string {
  requestCounter += 1
  return `mock-req-${requestCounter}`
}

function problem(status: number, code: string, title: string, detail?: string) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, code, requestId: requestId(), ...(detail ? { detail } : {}) },
    { status, headers: { 'X-Request-Id': `mock-req-${requestCounter}` } },
  )
}

function sessionFor(userId: string | null) {
  const user = fixtureUsers.find((candidate) => candidate.id === userId)
  if (!user) return undefined
  return {
    ...user,
    capabilities:
      user.role === 'student'
        ? { canEdit: true, canSubmit: true, canReview: false }
        : { canEdit: false, canSubmit: false, canReview: true },
  }
}

export function createHandlers(store: FixtureStore = createFixtureStore()) {
  let sessionUserId: string | null = 'student-1'
  const seenIdempotency = new Map<string, FixtureWeek>()

  const requireSession = () => {
    if (!sessionUserId) return problem(401, 'UNAUTHENTICATED', 'Session expired', 'Sign in again to continue.')
    return undefined
  }

  /** Server-authoritative review enablement, computed per resource state. */
  const reviewCapabilities = (week: FixtureWeek, role: 'supervisor' | 'mentor') => ({
    canEdit: false,
    canSubmit: false,
    canReview:
      role === 'supervisor'
        ? week.status === 'submitted' && week.review?.status === 'pending'
        : week.status === 'submitted' &&
          week.review?.status === 'approved' &&
          (week.mentorReview?.status ?? 'pending') === 'pending',
  })

  const summaryOf = (week: FixtureWeek, role: 'supervisor' | 'mentor') => ({
    weekNumber: week.weekNumber,
    startDate: week.startDate,
    endDate: week.endDate,
    status: week.status,
    version: week.version,
    companyStatus: week.review?.status,
    mentorStatus: week.mentorReview?.status ?? null,
    capabilities: reviewCapabilities(week, role),
  })

  const detailOf = (week: FixtureWeek, role: 'supervisor' | 'mentor') => ({
    ...week,
    capabilities: reviewCapabilities(week, role),
  })

  return [
    http.post('*/api/v1/auth/login', async ({ request }) => {
      const body = (await request.json().catch(() => undefined)) as { email?: unknown; password?: unknown } | undefined
      const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
      const password = typeof body?.password === 'string' ? body.password : ''
      if (!email || !password) return problem(422, 'VALIDATION_FAILED', 'Email and password are required.')
      const user = fixtureUsers.find((candidate) => candidate.email.toLowerCase() === email)
      if (!user) return problem(401, 'UNAUTHENTICATED', 'Email or password is incorrect.')
      sessionUserId = user.id
      return HttpResponse.json(sessionFor(user.id))
    }),

    http.post('*/api/v1/auth/logout', () => {
      sessionUserId = null
      return new HttpResponse(null, { status: 204 })
    }),

    http.get('*/api/v1/me', () => {
      const denied = requireSession()
      if (denied) return denied
      return HttpResponse.json(sessionFor(sessionUserId))
    }),

    http.get('*/api/v1/me/internship', () => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'student-1' && sessionUserId !== 'student-3') {
        return problem(403, 'FORBIDDEN', 'Only students have placements.')
      }
      return HttpResponse.json({
        id: 'placement-a',
        studentId: sessionUserId,
        companyId: 'company-nusantara',
        universityName: 'Universiti Teknologi Malaysia',
        programmeName: 'BSc Computer Science',
        programmeTimeZone: 'Asia/Kuala_Lumpur',
        companyName: 'Nusantara Digital',
        position: 'Software Engineering Intern',
        startDate: '2026-07-06',
        endDate: '2026-09-27',
      })
    }),

    http.get('*/api/v1/me/journal/weeks', ({ request }) => {
      const denied = requireSession()
      if (denied) return denied
      const url = new URL(request.url)
      if (url.searchParams.get('page') === '99') return problem(404, 'NOT_FOUND', 'No journal found for this placement.')
      const data = [...store.weeks.values()].map((week) => ({
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
        status: week.status,
        version: week.version,
        capabilities: week.capabilities,
      }))
      return HttpResponse.json({ data, meta: { page: 1, perPage: 20, total: data.length } })
    }),

    http.get('*/api/v1/me/journal/weeks/:weekNumber', ({ params }) => {
      const denied = requireSession()
      if (denied) return denied
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week) return problem(404, 'NOT_FOUND', 'Journal week could not be found.')
      return HttpResponse.json(week, { headers: { ETag: week.version } })
    }),

    http.put('*/api/v1/me/journal/weeks/:weekNumber/daily', async ({ params, request }) => {
      const denied = requireSession()
      if (denied) return denied
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week) return problem(404, 'NOT_FOUND', 'Journal week could not be found.')
      const ifMatch = request.headers.get('If-Match')
      if (ifMatch && ifMatch !== week.version) {
        return problem(412, 'STALE_VERSION', 'This log changed elsewhere. Compare and retry.')
      }
      const body = (await request.json().catch(() => undefined)) as { date?: unknown; body?: unknown } | undefined
      if (typeof body?.date !== 'string' || typeof body?.body !== 'string') {
        return problem(422, 'VALIDATION_FAILED', 'A valid date and body are required.')
      }
      const existing = week.dailyEntries.find((day) => day.date === body.date)
      if (existing) existing.body = body.body
      else week.dailyEntries.push({ date: body.date, body: body.body })
      week.version = `${week.version}+d`
      return HttpResponse.json({ date: body.date, body: body.body, version: week.version }, { headers: { ETag: week.version } })
    }),

    http.put('*/api/v1/me/journal/weeks/:weekNumber/weekly-draft', async ({ params, request }) => {
      const denied = requireSession()
      if (denied) return denied
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week) return problem(404, 'NOT_FOUND', 'Journal week could not be found.')
      const ifMatch = request.headers.get('If-Match')
      if (ifMatch && ifMatch !== week.version) {
        return problem(412, 'STALE_VERSION', 'This draft changed elsewhere. Compare and retry.')
      }
      const body = (await request.json().catch(() => undefined)) as { draft?: unknown } | undefined
      if (typeof body?.draft !== 'string') return problem(422, 'VALIDATION_FAILED', 'Draft text is required.')
      if (body.draft.length > 5000) return problem(422, 'VALIDATION_FAILED', 'Weekly log must be 5000 characters or fewer.')
      week.weeklyDraft = body.draft
      week.version = `${week.version}+w`
      return HttpResponse.json({ draft: week.weeklyDraft, version: week.version }, { headers: { ETag: week.version } })
    }),

    http.post('*/api/v1/me/journal/weeks/:weekNumber/submit', async ({ params, request }) => {
      const denied = requireSession()
      if (denied) return denied
      const key = request.headers.get('Idempotency-Key')
      if (!key) return problem(422, 'VALIDATION_FAILED', 'Idempotency-Key is required.')
      if (seenIdempotency.has(key)) return HttpResponse.json(seenIdempotency.get(key))
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week) return problem(404, 'NOT_FOUND', 'Journal week could not be found.')
      const ifMatch = request.headers.get('If-Match')
      if (ifMatch && ifMatch !== week.version) {
        return problem(412, 'STALE_VERSION', 'This week changed elsewhere. Compare and retry.')
      }
      const body = (await request.json().catch(() => undefined)) as { draft?: unknown } | undefined
      const draft = typeof body?.draft === 'string' ? body.draft : ''
      if (draft.trim().length === 0) return problem(422, 'VALIDATION_FAILED', 'A non-empty weekly draft is required.')
      if (week.status === 'submitted' && week.review?.status === 'pending') {
        return problem(409, 'TRANSITION_CONFLICT', 'This week is already submitted and awaiting review.')
      }
      week.status = 'submitted'
      week.weeklyDraft = draft
      week.submittedBody = draft
      week.review = { status: 'pending' }
      week.version = `${week.version}+s`
      const payload = { ...week }
      seenIdempotency.set(key, payload)
      return HttpResponse.json(payload, { headers: { ETag: week.version } })
    }),

    http.get('*/api/v1/supervisor/interns', () => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'supervisor-1') return problem(403, 'FORBIDDEN', 'Only supervisors can view this queue.')
      return HttpResponse.json({
        data: [
          { studentId: 'student-1', name: 'Aisha Rahman', email: 'aisha.rahman@student.example.edu', avatar: 'AR', companyName: 'Nusantara Digital', capabilities: { canEdit: false, canSubmit: false, canReview: true } },
        ],
        meta: { page: 1, perPage: 20, total: 1 },
      })
    }),

    http.get('*/api/v1/supervisor/interns/:studentId/weeks', ({ params }) => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'supervisor-1') return problem(403, 'FORBIDDEN', 'Only supervisors can view this queue.')
      if (params.studentId !== 'student-1') return problem(403, 'FORBIDDEN', 'This intern is not in your company.')
      const data = [...store.weeks.values()].map((week) => summaryOf(week, 'supervisor'))
      return HttpResponse.json({ data, meta: { page: 1, perPage: 20, total: data.length } })
    }),

    http.get('*/api/v1/supervisor/interns/:studentId/weeks/:weekNumber', ({ params }) => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'supervisor-1') return problem(403, 'FORBIDDEN', 'Only supervisors can review journals.')
      if (params.studentId !== 'student-1') return problem(403, 'FORBIDDEN', 'This intern is not in your company.')
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week) return problem(404, 'NOT_FOUND', 'Journal week could not be found.')
      return HttpResponse.json(detailOf(week, 'supervisor'), { headers: { ETag: week.version } })
    }),

    http.post('*/api/v1/supervisor/interns/:studentId/weeks/:weekNumber/review', async ({ params, request }) => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'supervisor-1') return problem(403, 'FORBIDDEN', 'Only supervisors can review journals.')
      if (params.studentId !== 'student-1') return problem(403, 'FORBIDDEN', 'This intern is not in your company.')
      const key = request.headers.get('Idempotency-Key')
      if (!key) return problem(422, 'VALIDATION_FAILED', 'Idempotency-Key is required.')
      if (seenIdempotency.has(key)) return HttpResponse.json(seenIdempotency.get(key))
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week || week.status !== 'submitted') return problem(409, 'TRANSITION_CONFLICT', 'Only submitted entries can be reviewed.')
      const ifMatch = request.headers.get('If-Match')
      if (ifMatch && ifMatch !== week.version) {
        return problem(412, 'STALE_VERSION', 'This week changed elsewhere. Compare and retry.')
      }
      const body = (await request.json().catch(() => undefined)) as { decision?: unknown; feedback?: unknown } | undefined
      if (body?.decision === 'request_changes' && (typeof body.feedback !== 'string' || body.feedback.trim() === '')) {
        return problem(422, 'VALIDATION_FAILED', 'Feedback is required to request changes.')
      }
      week.review = { status: body?.decision === 'approve' ? 'approved' : 'changes_requested', feedback: typeof body?.feedback === 'string' ? body.feedback : undefined }
      week.version = `${week.version}+r`
      const payload = { ...week, capabilities: reviewCapabilities(week, 'supervisor') }
      seenIdempotency.set(key, payload)
      return HttpResponse.json(payload, { headers: { ETag: week.version } })
    }),

    http.get('*/api/v1/mentor/mentees', () => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'mentor-1') return problem(403, 'FORBIDDEN', 'Only mentors can view this queue.')
      return HttpResponse.json({
        data: [
          { studentId: 'student-1', name: 'Aisha Rahman', email: 'aisha.rahman@student.example.edu', avatar: 'AR', companyName: 'Nusantara Digital', capabilities: { canEdit: false, canSubmit: false, canReview: true } },
        ],
        meta: { page: 1, perPage: 20, total: 1 },
      })
    }),

    http.get('*/api/v1/mentor/mentees/:studentId/weeks', ({ params }) => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'mentor-1') return problem(403, 'FORBIDDEN', 'Only mentors can view this queue.')
      if (params.studentId !== 'student-1') return problem(403, 'FORBIDDEN', 'This intern is not assigned to you.')
      const data = [...store.weeks.values()].map((week) => summaryOf(week, 'mentor'))
      return HttpResponse.json({ data, meta: { page: 1, perPage: 20, total: data.length } })
    }),

    http.get('*/api/v1/mentor/mentees/:studentId/weeks/:weekNumber', ({ params }) => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'mentor-1') return problem(403, 'FORBIDDEN', 'Only mentors can review journals.')
      if (params.studentId !== 'student-1') return problem(403, 'FORBIDDEN', 'This intern is not assigned to you.')
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week) return problem(404, 'NOT_FOUND', 'Journal week could not be found.')
      return HttpResponse.json(detailOf(week, 'mentor'), { headers: { ETag: week.version } })
    }),

    http.post('*/api/v1/mentor/mentees/:studentId/weeks/:weekNumber/review', async ({ params, request }) => {
      const denied = requireSession()
      if (denied) return denied
      if (sessionUserId !== 'mentor-1') return problem(403, 'FORBIDDEN', 'Only mentors can review journals.')
      if (params.studentId !== 'student-1') return problem(403, 'FORBIDDEN', 'This intern is not assigned to you.')
      const key = request.headers.get('Idempotency-Key')
      if (!key) return problem(422, 'VALIDATION_FAILED', 'Idempotency-Key is required.')
      if (seenIdempotency.has(key)) return HttpResponse.json(seenIdempotency.get(key))
      const week = store.weeks.get(Number(params.weekNumber))
      if (!week || week.review?.status !== 'approved') {
        return problem(409, 'TRANSITION_CONFLICT', 'This week is awaiting company review.')
      }
      const ifMatch = request.headers.get('If-Match')
      if (ifMatch && ifMatch !== week.version) {
        return problem(412, 'STALE_VERSION', 'This week changed elsewhere. Compare and retry.')
      }
      const body = (await request.json().catch(() => undefined)) as { decision?: unknown; feedback?: unknown } | undefined
      if (body?.decision === 'request_changes' && (typeof body.feedback !== 'string' || body.feedback.trim() === '')) {
        return problem(422, 'VALIDATION_FAILED', 'Feedback is required to request changes.')
      }
      week.mentorReview = { status: body?.decision === 'approve' ? 'approved' : 'changes_requested', feedback: typeof body?.feedback === 'string' ? body.feedback : undefined }
      if (week.mentorReview.status === 'changes_requested') week.review = { status: 'pending' }
      week.version = `${week.version}+m`
      const payload = { ...week, capabilities: reviewCapabilities(week, 'mentor') }
      seenIdempotency.set(key, payload)
      return HttpResponse.json(payload, { headers: { ETag: week.version } })
    }),
  ]
}
