/**
 * Typed resource functions over `/api/v1` (mirrors openapi/portal.yaml).
 * Runtime validation happens at these boundaries: unknown server payloads
 * are rejected with a generic error instead of crashing render.
 */

import { z } from 'zod'
import { API_PREFIX, apiRequest, csrfCookie, newIdempotencyKey } from './client'

const capabilitiesSchema = z.object({
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
  canReview: z.boolean(),
})

export type Capabilities = z.infer<typeof capabilitiesSchema>

const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['student', 'supervisor', 'university_mentor']),
  avatar: z.string().optional().default(''),
  capabilities: capabilitiesSchema,
})

export type SessionUser = z.infer<typeof sessionUserSchema>

const internshipSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  companyId: z.string(),
  universityName: z.string(),
  programmeName: z.string(),
  programmeTimeZone: z.string(),
  companyName: z.string(),
  position: z.string(),
  startDate: z.string(),
  endDate: z.string(),
})

export type ApiInternship = z.infer<typeof internshipSchema>

const reviewSchema = z.object({
  status: z.enum(['pending', 'approved', 'changes_requested']),
  feedback: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
})

const dailyEntrySchema = z.object({
  date: z.string(),
  body: z.string(),
  updatedAt: z.string().optional(),
})

const weekSummarySchema = z.object({
  weekNumber: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['not_started', 'draft', 'submitted']),
  version: z.string(),
  updatedAt: z.string().optional(),
  submittedAt: z.string().optional(),
  companyStatus: z.enum(['pending', 'approved', 'changes_requested']).optional(),
  mentorStatus: z.string().nullable().optional(),
  capabilities: capabilitiesSchema,
})

export type ApiWeekSummary = z.infer<typeof weekSummarySchema>

const weekDetailSchema = weekSummarySchema.extend({
  dailyEntries: z.array(dailyEntrySchema).default([]),
  weeklyDraft: z.string().default(''),
  weeklyDraftUpdatedAt: z.string().optional(),
  submittedBody: z.string().optional(),
  review: reviewSchema.optional(),
  mentorReview: reviewSchema.optional(),
})

export type ApiWeekDetail = z.infer<typeof weekDetailSchema>

const pageMetaSchema = z.object({
  page: z.number(),
  perPage: z.number(),
  total: z.number(),
})

const weekListSchema = z.object({
  data: z.array(weekSummarySchema),
  meta: pageMetaSchema,
})

export type ApiWeekList = z.infer<typeof weekListSchema>

const internSummarySchema = z.object({
  studentId: z.string(),
  name: z.string(),
  email: z.string(),
  avatar: z.string().optional().default(''),
  companyName: z.string().optional().default(''),
  capabilities: capabilitiesSchema,
})

export type ApiInternSummary = z.infer<typeof internSummarySchema>

const internListSchema = z.object({
  data: z.array(internSummarySchema),
  meta: pageMetaSchema,
})

export type ApiInternList = z.infer<typeof internListSchema>

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(message)
  return result.data
}

const malformedMessage = 'The server returned an unexpected response. Please try again.'

export async function login(email: string, password: string): Promise<SessionUser> {
  await csrfCookie()
  const response = await apiRequest<unknown>(`${API_PREFIX}/auth/login`, {
    method: 'POST',
    body: { email, password },
    idempotencyKey: newIdempotencyKey(),
  })
  return parse(sessionUserSchema, response.data, malformedMessage)
}

export async function logout(): Promise<void> {
  await apiRequest<unknown>(`${API_PREFIX}/auth/logout`, { method: 'POST', idempotencyKey: newIdempotencyKey() })
}

export async function getMe(signal?: AbortSignal): Promise<SessionUser> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/me`, { signal })
  return parse(sessionUserSchema, response.data, malformedMessage)
}

export async function getMyInternship(signal?: AbortSignal): Promise<ApiInternship> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/me/internship`, { signal })
  return parse(internshipSchema, response.data, malformedMessage)
}

export async function listMyWeeks(page = 1, signal?: AbortSignal): Promise<ApiWeekList> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/me/journal/weeks?page=${page}`, { signal })
  return parse(weekListSchema, response.data, malformedMessage)
}

export interface WeekWithVersion {
  week: ApiWeekDetail
  version: string
}

export async function getMyWeek(weekNumber: number, signal?: AbortSignal): Promise<WeekWithVersion> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/me/journal/weeks/${weekNumber}`, { signal })
  const week = parse(weekDetailSchema, response.data, malformedMessage)
  return { week, version: response.etag ?? week.version }
}

export async function updateDailyEntry(
  weekNumber: number,
  date: string,
  body: string,
  version?: string,
  idempotencyKey?: string,
): Promise<{ version: string; updatedAt?: string }> {
  const response = await apiRequest<{ version: string; updatedAt?: string }>(
    `${API_PREFIX}/me/journal/weeks/${weekNumber}/daily`,
    { method: 'PUT', body: { date, body }, ifMatch: version, idempotencyKey },
  )
  return response.data
}

export async function updateWeeklyDraft(
  weekNumber: number,
  draft: string,
  version?: string,
  idempotencyKey?: string,
): Promise<{ version: string; updatedAt?: string }> {
  const response = await apiRequest<{ version: string; updatedAt?: string }>(
    `${API_PREFIX}/me/journal/weeks/${weekNumber}/weekly-draft`,
    { method: 'PUT', body: { draft }, ifMatch: version, idempotencyKey },
  )
  return response.data
}

export async function submitWeek(
  weekNumber: number,
  draft: string,
  version: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<WeekWithVersion> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/me/journal/weeks/${weekNumber}/submit`, {
    method: 'POST',
    body: { draft, version },
    ifMatch: version,
    idempotencyKey,
  })
  const week = parse(weekDetailSchema, response.data, malformedMessage)
  return { week, version: response.etag ?? week.version }
}

export type ReviewDecision = 'approve' | 'request_changes'

export async function supervisorReview(
  studentId: string,
  weekNumber: number,
  decision: ReviewDecision,
  feedback: string | undefined,
  version: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<WeekWithVersion> {
  const response = await apiRequest<unknown>(
    `${API_PREFIX}/supervisor/interns/${studentId}/weeks/${weekNumber}/review`,
    { method: 'POST', body: { decision, feedback }, ifMatch: version, idempotencyKey },
  )
  const week = parse(weekDetailSchema, response.data, malformedMessage)
  return { week, version: response.etag ?? week.version }
}

export async function mentorReview(
  studentId: string,
  weekNumber: number,
  decision: ReviewDecision,
  feedback: string | undefined,
  version: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<WeekWithVersion> {
  const response = await apiRequest<unknown>(
    `${API_PREFIX}/mentor/mentees/${studentId}/weeks/${weekNumber}/review`,
    { method: 'POST', body: { decision, feedback }, ifMatch: version, idempotencyKey },
  )
  const week = parse(weekDetailSchema, response.data, malformedMessage)
  return { week, version: response.etag ?? week.version }
}

export async function listSupervisorInterns(page = 1, signal?: AbortSignal): Promise<ApiInternList> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/supervisor/interns?page=${page}`, { signal })
  return parse(internListSchema, response.data, malformedMessage)
}

export async function listSupervisorInternWeeks(studentId: string, page = 1, signal?: AbortSignal): Promise<ApiWeekList> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/supervisor/interns/${studentId}/weeks?page=${page}`, { signal })
  return parse(weekListSchema, response.data, malformedMessage)
}

export async function getSupervisorWeek(studentId: string, weekNumber: number, signal?: AbortSignal): Promise<WeekWithVersion> {
  const response = await apiRequest<unknown>(
    `${API_PREFIX}/supervisor/interns/${studentId}/weeks/${weekNumber}`,
    { signal },
  )
  const week = parse(weekDetailSchema, response.data, malformedMessage)
  return { week, version: response.etag ?? week.version }
}

export async function listMentees(page = 1, signal?: AbortSignal): Promise<ApiInternList> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/mentor/mentees?page=${page}`, { signal })
  return parse(internListSchema, response.data, malformedMessage)
}

export async function listMenteeWeeks(studentId: string, page = 1, signal?: AbortSignal): Promise<ApiWeekList> {
  const response = await apiRequest<unknown>(`${API_PREFIX}/mentor/mentees/${studentId}/weeks?page=${page}`, { signal })
  return parse(weekListSchema, response.data, malformedMessage)
}

export async function getMenteeWeek(studentId: string, weekNumber: number, signal?: AbortSignal): Promise<WeekWithVersion> {
  const response = await apiRequest<unknown>(
    `${API_PREFIX}/mentor/mentees/${studentId}/weeks/${weekNumber}`,
    { signal },
  )
  const week = parse(weekDetailSchema, response.data, malformedMessage)
  return { week, version: response.etag ?? week.version }
}
