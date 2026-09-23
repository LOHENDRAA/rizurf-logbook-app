import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createSeedData, DOCUMENTS, GLOBAL_COMPANY_ADDRESS, LOCKED_KEYS } from '../data'
import { P1_COVER_LOCKED_KEYS, P2_COVER_LOCKED_KEYS, autofillDocument, canonicalP1CoverFields, canonicalP2CoverFields, hydrateAppData } from './autofill'
import { COVER_CHECKLISTS, coverMarkPlacements, isP1CoverApproved, renderOfficialDocument, shouldDrawCoverMarks, shouldDrawP1CoverMarks } from './officialTemplates'
import { isEmbeddableSignatureImage, canEmbedSignatureImage } from './signatures'
import { documentStatus, isSectionValid, p1CoverCompletionError } from './workflow'

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// Genuine 2x2 white JPEG bytes (mislabeled PNG bytes must NOT stand in for JPEG).
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='
const PNG_AS_JPEG = TINY_PNG.replace('data:image/png', 'data:image/jpeg')
const JPG_AS_PNG = TINY_JPG.replace('data:image/jpeg', 'data:image/png')
const HELLO_WORLD_PNG = 'data:image/png;base64,aGVsbG8td29ybGQ='
const TRUNCATED_PNG = `data:image/png;base64,${Buffer.from(TINY_PNG.split(',')[1], 'base64').slice(0, 20).toString('base64')}`
const EXPECTED_ADDRESS = 'First Floor, 28-1, Jln 1/116B, Sri Desa Entrepreneur Park, 58200 Kuala Lumpur, Federal Territory of Kuala Lumpur'

const stubTemplateFetch = () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    const pathname = new URL(String(url), 'http://localhost').pathname
    return new Response(await readFile(join(process.cwd(), 'public', pathname)), { status: 200 })
  }) as typeof fetch
  return () => { globalThis.fetch = originalFetch }
}

const bytesOf = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as ArrayBuffer)
  reader.onerror = reject
  reader.readAsArrayBuffer(blob)
})

const pageCountOf = async (blob: Blob) => (await PDFDocument.load(await bytesOf(blob))).getPageCount()

describe('part 1 cover canonical behavior', () => {
  it('centralizes the exact company address', () => {
    expect(GLOBAL_COMPANY_ADDRESS).toBe(EXPECTED_ADDRESS)
  })

  it('seeds all seven canonical p1 values with the exact address, and p2 is canonical too', () => {
    const data = createSeedData()
    const record = data.records[0]
    const intern = data.users.find((user) => user.id === record.internId)!
    const fields = record.documents['p1-cover'].sections[0].fields
    expect(fields).toMatchObject(canonicalP1CoverFields(record, intern))
    expect(fields.companyAddress).toBe(EXPECTED_ADDRESS)
    for (const key of P1_COVER_LOCKED_KEYS) expect(fields[key]).toBeTruthy()
    // p2 cover placement values are canonical as well (single global address).
    const p2Fields = record.documents['p2-cover'].sections[0].fields
    expect(p2Fields).toMatchObject(canonicalP2CoverFields(record, intern))
    expect(p2Fields.companyAddress).toBe(EXPECTED_ADDRESS)
    expect(p2Fields.studentName).toBe(intern.name)
  })

  it('replaces stale p1 locked values on hydration while preserving mentor and section state', () => {
    const seed = createSeedData()
    const saved = structuredClone(seed) as typeof seed
    const savedRecord = saved.records[0]
    const section = savedRecord.documents['p1-cover'].sections[0]
    section.status = 'approved'
    section.history = [{ id: 'h1', action: 'Completed', actor: 'Aisha Rahman', date: '2026-10-01T00:00:00.000Z' }]
    section.fields = {
      ...section.fields,
      studentName: 'Stale Name', studentId: '', intake: 'STALE', companyName: 'Stale Co',
      companyAddress: 'Stale Address', startDate: '2000-01-01', endDate: '',
      mentorName: 'Dr. Keep Me',
    }
    const hydrated = hydrateAppData(saved, seed)
    const next = hydrated.records[0].documents['p1-cover'].sections[0].fields
    const intern = hydrated.users.find((user) => user.id === hydrated.records[0].internId)!
    expect(next).toMatchObject(canonicalP1CoverFields(hydrated.records[0], intern))
    expect(next.companyAddress).toBe(EXPECTED_ADDRESS)
    expect(next.mentorName).toBe('Dr. Keep Me')
    expect(hydrated.records[0].documents['p1-cover'].sections[0].status).toBe('approved')
    expect(hydrated.records[0].documents['p1-cover'].sections[0].history).toHaveLength(1)
  })

  it('marks only the academic mentor editable in the p1 definition', () => {
    const definition = DOCUMENTS.find((item) => item.id === 'p1-cover')!
    const editable = (definition.fields ?? []).filter((field) => !field.readOnly).map((field) => field.key)
    expect(editable).toEqual(['mentorName'])
    expect(definition.fields).toHaveLength(8)
  })

  it('marks only the academic mentor editable in the p2 definition', () => {
    const definition = DOCUMENTS.find((item) => item.id === 'p2-cover')!
    const editable = (definition.fields ?? []).filter((field) => !field.readOnly).map((field) => field.key)
    expect(editable).toEqual(['mentorName'])
    expect(definition.fields).toHaveLength(8)
    expect(P2_COVER_LOCKED_KEYS).toEqual(['studentName', 'studentId', 'intake', 'companyName', 'companyAddress', 'startDate', 'endDate'])
    expect(LOCKED_KEYS['p2-cover']).toEqual([...P2_COVER_LOCKED_KEYS])
  })

  it('prefilters only structurally plausible signature images (not authoritative)', () => {
    expect(isEmbeddableSignatureImage(TINY_PNG)).toBe(true)
    expect(isEmbeddableSignatureImage(TINY_JPG)).toBe(true)
    expect(isEmbeddableSignatureImage('')).toBe(false)
    expect(isEmbeddableSignatureImage('   ')).toBe(false)
    expect(isEmbeddableSignatureImage(undefined)).toBe(false)
    expect(isEmbeddableSignatureImage('not-a-data-url')).toBe(false)
    expect(isEmbeddableSignatureImage('data:image/gif;base64,R0lGODdhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==')).toBe(false)
    expect(isEmbeddableSignatureImage('data:image/png;base64,!!!not-base64!!!')).toBe(false)
    expect(isEmbeddableSignatureImage('data:image/png;base64,')).toBe(false)
  })

  it('authoritatively embeds only genuine decodable images', async () => {
    expect(await canEmbedSignatureImage(TINY_PNG)).toBe(true)
    expect(await canEmbedSignatureImage(TINY_JPG)).toBe(true)
    expect(await canEmbedSignatureImage(PNG_AS_JPEG)).toBe(false)
    expect(await canEmbedSignatureImage(JPG_AS_PNG)).toBe(false)
    expect(await canEmbedSignatureImage(HELLO_WORLD_PNG)).toBe(false)
    expect(await canEmbedSignatureImage(TRUNCATED_PNG)).toBe(false)
    expect(await canEmbedSignatureImage('')).toBe(false)
    expect(await canEmbedSignatureImage('data:image/gif;base64,R0lGODdhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==')).toBe(false)
  })

  it('requires only manual fields for cover completion, never a signature', async () => {
    const definition = DOCUMENTS.find((item) => item.id === 'p1-cover')!
    const record = createSeedData().records[0]
    const section = { ...record.documents['p1-cover'].sections[0], fields: { ...record.documents['p1-cover'].sections[0].fields, mentorName: '' } }
    expect(await p1CoverCompletionError(definition, section, 0, TINY_PNG)).toContain('Complete the required information')
    const withMentor = { ...section, fields: { ...section.fields, mentorName: 'Dr. Mentor' } }
    expect(isSectionValid(definition, withMentor, 0)).toBe(true)
    // No signature gate: missing, corrupt, mislabeled, and valid signatures
    // all allow completion once manual fields are valid.
    expect(await p1CoverCompletionError(definition, withMentor, 0, '')).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, undefined)).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, 'data:image/gif;base64,R0lGODdhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==')).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, PNG_AS_JPEG)).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, JPG_AS_PNG)).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, HELLO_WORLD_PNG)).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, TRUNCATED_PNG)).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, TINY_PNG)).toBeUndefined()
    expect(await p1CoverCompletionError(definition, withMentor, 0, TINY_JPG)).toBeUndefined()
    // p2-cover validates its single manual field only, also without any gate.
    const p2 = DOCUMENTS.find((item) => item.id === 'p2-cover')!
    const p2Record = createSeedData().records[0]
    const p2Base = { ...p2Record.documents['p2-cover'].sections[0], fields: { ...p2Record.documents['p2-cover'].sections[0].fields, companyAddress: 'Level 21, Test Tower', mentorName: '' } }
    expect(isSectionValid(p2, p2Base, 0)).toBe(false)
    expect(await p1CoverCompletionError(p2, p2Base, 0, '')).toContain('Complete the required information')
    // A forged companyAddress value is irrelevant to validity: the locked
    // canonical address is stored, only mentorName decides.
    const p2Full = { ...p2Base, fields: { ...p2Base.fields, mentorName: 'Dr. Mentor' } }
    expect(isSectionValid(p2, p2Full, 0)).toBe(true)
    expect(await p1CoverCompletionError(p2, p2Full, 0, '')).toBeUndefined()
    // Non-cover documents always return undefined.
    const logbook = DOCUMENTS.find((item) => item.id === 'p1-logbook')!
    expect(await p1CoverCompletionError(logbook, p2Base, 0, '')).toBeUndefined()
  })

  it('overwrites stale locked p1 values through autofill while keeping mentorName', () => {
    const data = createSeedData()
    const record = data.records[0]
    const intern = data.users.find((user) => user.id === record.internId)!
    const definition = DOCUMENTS.find((item) => item.id === 'p1-cover')!
    const stale = structuredClone(record.documents['p1-cover'])
    stale.sections[0].fields.studentName = 'Wrong'
    stale.sections[0].fields.companyAddress = 'Wrong'
    stale.sections[0].fields.mentorName = 'Dr. Keep'
    const filled = autofillDocument(record, definition, stale, intern, undefined)
    expect(filled.sections[0].fields.studentName).toBe(intern.name)
    expect(filled.sections[0].fields.companyAddress).toBe(EXPECTED_ADDRESS)
    expect(filled.sections[0].fields.mentorName).toBe('Dr. Keep')
  })

  it('overwrites stale locked p2 values through autofill while keeping mentorName', () => {
    const data = createSeedData()
    const record = data.records[0]
    const intern = data.users.find((user) => user.id === record.internId)!
    const definition = DOCUMENTS.find((item) => item.id === 'p2-cover')!
    const stale = structuredClone(record.documents['p2-cover'])
    stale.sections[0].fields.studentName = 'Wrong'
    stale.sections[0].fields.companyName = 'Wrong Co'
    stale.sections[0].fields.startDate = '2000-01-01'
    stale.sections[0].fields.companyAddress = 'Stale Address'
    stale.sections[0].fields.mentorName = 'Dr. Keep'
    const filled = autofillDocument(record, definition, stale, intern, undefined)
    expect(filled.sections[0].fields).toMatchObject(canonicalP2CoverFields(record, intern))
    expect(filled.sections[0].fields.companyAddress).toBe(EXPECTED_ADDRESS)
    expect(filled.sections[0].fields.mentorName).toBe('Dr. Keep')
  })

  it('replaces stale p2 locked values on hydration while preserving mentorName and section state', () => {
    const seed = createSeedData()
    const saved = structuredClone(seed) as typeof seed
    const section = saved.records[0].documents['p2-cover'].sections[0]
    section.status = 'completed'
    section.history = [{ id: 'h1', action: 'Completed', actor: 'Aisha Rahman', date: '2026-10-01T00:00:00.000Z' }]
    section.fields = {
      ...section.fields,
      studentName: 'Stale Name', companyName: 'Stale Co', startDate: '2000-01-01',
      companyAddress: 'Stale Address', mentorName: 'Dr. Keep Me',
    }
    const hydrated = hydrateAppData(saved, seed)
    const next = hydrated.records[0].documents['p2-cover'].sections[0].fields
    const intern = hydrated.users.find((user) => user.id === hydrated.records[0].internId)!
    expect(next).toMatchObject(canonicalP2CoverFields(hydrated.records[0], intern))
    expect(next.companyAddress).toBe(EXPECTED_ADDRESS)
    expect(next.mentorName).toBe('Dr. Keep Me')
    expect(hydrated.records[0].documents['p2-cover'].sections[0].status).toBe('completed')
    expect(hydrated.records[0].documents['p2-cover'].sections[0].history).toHaveLength(1)
  })

  it('draws cover marks from an embedded signature alone, independent of status and other docs', () => {
    const data = createSeedData()
    const record = data.records[0]
    // completed counts as complete alongside legacy approved.
    record.documents['p1-cover'].sections[0].status = 'draft'
    expect(isP1CoverApproved(record)).toBe(false)
    record.documents['p1-cover'].sections[0].status = 'completed'
    expect(isP1CoverApproved(record)).toBe(true)
    record.documents['p1-cover'].sections[0].status = 'approved'
    expect(isP1CoverApproved(record)).toBe(true)
    // The shared gate depends only on embedding, never on status or documents.
    expect(shouldDrawCoverMarks(undefined)).toBe(false)
    expect(shouldDrawCoverMarks('')).toBe(false)
    expect(shouldDrawCoverMarks({})).toBe(true)
    // Backwards-compat alias delegates; the approval flag is ignored.
    expect(shouldDrawP1CoverMarks(false, undefined)).toBe(false)
    expect(shouldDrawP1CoverMarks(true, undefined)).toBe(false)
    expect(shouldDrawP1CoverMarks(false, {})).toBe(true)
    expect(shouldDrawP1CoverMarks(true, {})).toBe(true)
    // All four p1 rows participate with preserved geometry.
    expect(COVER_CHECKLISTS.part1).toHaveLength(4)
    expect(coverMarkPlacements('part1', {})).toHaveLength(4)
    expect(coverMarkPlacements('part1', {})[0]).toMatchObject({ key: 'logbook', x: 285, y: 331, imageX: 385, imageWidth: 80, imageHeight: 25 })
    expect(coverMarkPlacements('part1', undefined)).toEqual([])
    // All six p2 rows participate unconditionally with preserved geometry —
    // even though none of the referenced documents is complete here.
    expect(COVER_CHECKLISTS.part2).toHaveLength(6)
    expect(COVER_CHECKLISTS.part2.every((item) => !('requirement' in item))).toBe(true)
    expect(COVER_CHECKLISTS.part1.every((item) => !('requirement' in item))).toBe(true)
    expect(record.documents['p2-report']?.files).toHaveLength(0)
    const p2Marks = coverMarkPlacements('part2', {})
    expect(p2Marks).toHaveLength(6)
    expect(p2Marks.map((mark) => mark.key)).toEqual(['report', 'clearance', 'logbook', 'attendance', 'assessment', 'mentor-report'])
    expect(p2Marks[0]).toMatchObject({ x: 355, y: 350, imageX: 420, imageWidth: 70, imageHeight: 25 })
    expect(p2Marks.every((mark) => mark.imageY === mark.y - 13)).toBe(true)
    expect(coverMarkPlacements('part2', undefined)).toEqual([])
  })

  it('reports a completed single-section cover as Completed in documentStatus', () => {
    const data = createSeedData()
    const document = data.records[0].documents['p1-cover']
    document.sections[0].status = 'completed'
    expect(documentStatus(document)).toBe('completed')
    document.sections[0].status = 'approved'
    expect(documentStatus(document)).toBe('approved')
  })

  it('renders completed and draft covers without crashing for valid, missing, and corrupt signatures', async () => {
    const restore = stubTemplateFetch()
    try {
      const data = createSeedData()
      const record = data.records[0]
      const intern = data.users.find((user) => user.id === record.internId)!
      const supervisor = data.users.find((user) => user.id === record.supervisorId)
      const definition = DOCUMENTS.find((item) => item.id === 'p1-cover')!
      record.documents['p1-cover'].sections[0].fields = {
        ...record.documents['p1-cover'].sections[0].fields,
        mentorName: 'Dr. Mentor',
      }
      // A Completed cover without a student signature still renders, only without marks.
      record.documents['p1-cover'].sections[0].status = 'completed'
      expect(isP1CoverApproved(record)).toBe(true)
      expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: data.signatures }))).toBe(1)
      // Legacy approved covers keep rendering with signature marks.
      record.documents['p1-cover'].sections[0].status = 'approved'
      expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: data.signatures }))).toBe(1)
      // An eligible uploaded signature renders the same page successfully.
      expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: { ...data.signatures, [intern.id]: { signature: TINY_PNG } } }))).toBe(1)
      // A structurally plausible but undecodable payload is rejected by the
      // authoritative check yet still never crashes rendering — including on
      // a Completed cover (regression: corrupt signature never blocks marks path).
      const corrupt = { ...data.signatures, [intern.id]: { signature: HELLO_WORLD_PNG } }
      expect(await canEmbedSignatureImage(corrupt[intern.id].signature)).toBe(false)
      expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: corrupt }))).toBe(1)
      record.documents['p1-cover'].sections[0].status = 'completed'
      expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: corrupt }))).toBe(1)
      // Draft covers with a signature present also render (auto-applied,
      // independent of any button click).
      record.documents['p1-cover'].sections[0].status = 'draft'
      expect(isP1CoverApproved(record)).toBe(false)
      expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: { ...data.signatures, [intern.id]: { signature: TINY_PNG } } }))).toBe(1)
    } finally { restore() }
  }, 30000)

  it('renders the p2 cover unconditionally for every status with valid, missing, and corrupt signatures', async () => {
    const restore = stubTemplateFetch()
    try {
      const data = createSeedData()
      const record = data.records[0]
      const intern = data.users.find((user) => user.id === record.internId)!
      const supervisor = data.users.find((user) => user.id === record.supervisorId)
      const definition = DOCUMENTS.find((item) => item.id === 'p2-cover')!
      // Deliberately incomplete record: no report/mentor-report files and no
      // p2 approvals — marks must still draw for all six rows when signed.
      expect(record.documents['p2-report']?.files ?? []).toHaveLength(0)
      expect(record.documents['p2-mentor-report']?.files ?? []).toHaveLength(0)
      record.documents['p2-cover'].sections[0].fields = {
        ...record.documents['p2-cover'].sections[0].fields,
        companyAddress: 'Level 21, Test Tower', mentorName: 'Dr. Mentor',
      }
      const signed = { ...data.signatures, [intern.id]: { signature: TINY_PNG } }
      const corrupt = { ...data.signatures, [intern.id]: { signature: HELLO_WORLD_PNG } }
      for (const status of ['draft', 'completed', 'approved'] as const) {
        record.documents['p2-cover'].sections[0].status = status
        expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: data.signatures }))).toBe(1)
        expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: signed }))).toBe(1)
        expect(await pageCountOf(await renderOfficialDocument(definition, { record, intern, supervisor, signatures: corrupt }))).toBe(1)
      }
      // Zero-section record still renders without crashing.
      const empty = { ...record, documents: { ...record.documents, 'p2-cover': { ...record.documents['p2-cover'], sections: [] } } }
      expect(await pageCountOf(await renderOfficialDocument(definition, { record: empty, intern, supervisor, signatures: signed }))).toBe(1)
    } finally { restore() }
  }, 30000)
})
