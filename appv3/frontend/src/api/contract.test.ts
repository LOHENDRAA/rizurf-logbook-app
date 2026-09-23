import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Contract drift guard: the yaml is the source of truth; the typed client
 * must cover every resource path and the generated types must be fresh.
 */
describe('openapi contract drift', () => {
  const yaml = readFileSync(resolve(root, 'openapi/portal.yaml'), 'utf8')
  const portal = readFileSync(resolve(root, 'src/api/portal.ts'), 'utf8')

  it('declares every required resource path with versioning + idempotency', () => {
    for (const path of [
      '/auth/login',
      '/auth/logout',
      '/me',
      '/me/internship',
      '/me/journal/weeks',
      '/me/journal/weeks/{weekNumber}/daily',
      '/me/journal/weeks/{weekNumber}/weekly-draft',
      '/me/journal/weeks/{weekNumber}/submit',
      '/supervisor/interns',
      '/supervisor/interns/{studentId}/weeks/{weekNumber}:',
      '/mentor/mentees',
      '/mentor/mentees/{studentId}/weeks/{weekNumber}:',
    ]) {
      expect(yaml).toContain(path)
    }
    for (const token of ['If-Match', 'Idempotency-Key', 'ETag', 'requestId', 'application/problem+json']) {
      expect(yaml).toContain(token)
    }
    expect(yaml).toContain('never sees tokens or passwords')
  })

  it('keeps passwords out of response schemas', () => {
    const occurrences = yaml.match(/password/g) ?? []
    // LoginRequest fields only.
    expect(occurrences.length).toBeLessThanOrEqual(3)
    expect(yaml).not.toMatch(/SessionUser:[\s\S]{0,400}password/)
  })

  it('typed client covers the contract resources', () => {
    for (const fragment of [
      '/auth/login',
      '/auth/logout',
      '/me/internship',
      '/me/journal/weeks',
      'weekly-draft',
      '/submit',
      '/supervisor/interns',
      'getSupervisorWeek',
      '/mentor/mentees',
      'getMenteeWeek',
    ]) {
      expect(portal).toContain(fragment)
    }
  })

  it('generated types are committed', () => {
    const generated = readFileSync(resolve(root, 'src/api/generated.d.ts'), 'utf8')
    expect(generated).toContain('SessionUser')
    expect(generated).toContain('WeekDetail')
  })
})
