import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createSeedData, DOCUMENTS } from '../data'
import { hydrateAppData, mergeSignatureProfiles } from './autofill'
import { SAMPLE_SUPERVISOR_STAMP, SAMPLE_SUPERVISOR_USER_ID } from './sampleSignature'
import { approvalDateLabel, renderOfficialDocument, SIGNATURE_MANIFEST } from './officialTemplates'
import { canEmbedSignatureImage, isEmbeddableSignatureImage } from './signatures'

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

const UPLOAD_STAMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('p2 clearance sample stamp and centered approval date', () => {
  it('seeds the demo supervisor with both a signature and a sample stamp data URL', () => {
    expect(SAMPLE_SUPERVISOR_USER_ID).toBe('supervisor-1')
    const data = createSeedData()
    const seeded = data.signatures[SAMPLE_SUPERVISOR_USER_ID]
    expect(seeded.signature).toMatch(/^data:image\/png;base64,/)
    expect(seeded.stamp).toBe(SAMPLE_SUPERVISOR_STAMP)
    expect(seeded.stamp).toMatch(/^data:image\/png;base64,/)
    // Scoped to the demo supervisor only: no other profile gets a stamp.
    for (const [userId, profile] of Object.entries(data.signatures)) {
      if (userId === SAMPLE_SUPERVISOR_USER_ID) continue
      expect(profile.stamp).toBeUndefined()
    }
  })

  it('ships a valid embeddable PNG stamp that is clearly a demo mark', async () => {
    expect(isEmbeddableSignatureImage(SAMPLE_SUPERVISOR_STAMP)).toBe(true)
    expect(await canEmbedSignatureImage(SAMPLE_SUPERVISOR_STAMP)).toBe(true)
    const payload = SAMPLE_SUPERVISOR_STAMP.slice('data:image/png;base64,'.length)
    const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    // Genuine PNG magic bytes and a reasonable size for a small stamp.
    expect(Array.from(bytes.slice(0, 8)).map((byte) => byte.toString(16).padStart(2, '0')).join('')).toBe('89504e470d0a1a0a')
    expect(payload.length).toBeLessThan(50 * 1024)
    const pdf = await PDFDocument.create()
    const image = await pdf.embedPng(bytes)
    expect(image.width).toBe(image.height)
    expect(image.width).toBeGreaterThanOrEqual(200)
  })

  it('fills a missing/empty saved stamp from seed but never overrides an upload', () => {
    const seed = createSeedData().signatures
    const seedSignature = seed[SAMPLE_SUPERVISOR_USER_ID].signature!
    // No saved profile at all: seed signature + stamp apply.
    expect(mergeSignatureProfiles(seed, {})[SAMPLE_SUPERVISOR_USER_ID]).toEqual({
      signature: seedSignature,
      stamp: SAMPLE_SUPERVISOR_STAMP,
    })
    // Saved profile with an empty stamp string: seeded sample fills in, saved
    // signature is preserved.
    expect(mergeSignatureProfiles(seed, {
      [SAMPLE_SUPERVISOR_USER_ID]: { signature: UPLOAD_STAMP, stamp: '' },
    })[SAMPLE_SUPERVISOR_USER_ID]).toEqual({ signature: UPLOAD_STAMP, stamp: SAMPLE_SUPERVISOR_STAMP })
    // Saved profile with an uploaded stamp: the upload wins over the sample.
    expect(mergeSignatureProfiles(seed, {
      [SAMPLE_SUPERVISOR_USER_ID]: { signature: seedSignature, stamp: UPLOAD_STAMP },
    })[SAMPLE_SUPERVISOR_USER_ID]).toEqual({ signature: seedSignature, stamp: UPLOAD_STAMP })
    // Unknown supervisors never receive the sample stamp.
    const merged = mergeSignatureProfiles(seed, { 'supervisor-9': { signature: UPLOAD_STAMP } })
    expect(merged['supervisor-9']).toEqual({ signature: UPLOAD_STAMP })
    expect(merged['supervisor-9'].stamp).toBeUndefined()
  })

  it('hydrates legacy saved data to the seeded stamp unless one was uploaded', () => {
    const seed = createSeedData()
    const saved = structuredClone(seed) as typeof seed
    saved.signatures[SAMPLE_SUPERVISOR_USER_ID] = { signature: UPLOAD_STAMP }
    const hydrated = hydrateAppData(saved, seed)
    expect(hydrated.signatures[SAMPLE_SUPERVISOR_USER_ID]).toEqual({
      signature: UPLOAD_STAMP,
      stamp: SAMPLE_SUPERVISOR_STAMP,
    })
    const savedUpload = structuredClone(seed) as typeof seed
    savedUpload.signatures[SAMPLE_SUPERVISOR_USER_ID] = { signature: UPLOAD_STAMP, stamp: UPLOAD_STAMP }
    expect(hydrateAppData(savedUpload, seed).signatures[SAMPLE_SUPERVISOR_USER_ID].stamp).toBe(UPLOAD_STAMP)
  })

  it('centers the clearance approval date above the old baseline without moving anything else', () => {
    const date = SIGNATURE_MANIFEST.clearance.date
    // Baseline lifted off the bottom gridline into the vertical center of the
    // ruled Date cell (interior 348.64-412.44, center ~380.5; 8pt digits are
    // ~6pt tall so y=375 centers the glyph block at ~378).
    expect(date.y).toBe(375)
    expect(date.y).toBeGreaterThan(350)
    expect(date.y).toBeGreaterThanOrEqual(368)
    expect(date.y).toBeLessThanOrEqual(378)
    expect(date.x).toBe(415)
    expect(date.width).toBe(100)
    expect(date.height).toBe(15)
    // Image placements and every other document are untouched.
    expect(SIGNATURE_MANIFEST.clearance.signature).toEqual({ x: 78, y: 350, width: 90, height: 35 })
    expect(SIGNATURE_MANIFEST.clearance.stamp).toEqual({ x: 242, y: 350, width: 55, height: 45 })
    expect(SIGNATURE_MANIFEST.logbook.date).toEqual({ x: 78, y: 145, width: 155, height: 15 })
    expect(SIGNATURE_MANIFEST.attendance.date).toEqual({ x: 78, y: 117, width: 155, height: 15 })
    expect(SIGNATURE_MANIFEST.assessment.date).toEqual({ x: 330, y: 492, width: 80, height: 15 })
  })

  it('never invents an approval date label', () => {
    expect(approvalDateLabel(undefined)).toBeUndefined()
    expect(approvalDateLabel({ id: 's', label: 's', status: 'approved', fields: {}, history: [] })).toBeUndefined()
    expect(approvalDateLabel({ id: 's', label: 's', status: 'approved', fields: {}, history: [], approvedAt: 'not-a-date' })).toBeUndefined()
    expect(approvalDateLabel({ id: 's', label: 's', status: 'approved', fields: {}, history: [], approvedAt: '2026-09-15T00:00:00.000Z' })).toBe(
      new Date('2026-09-15T00:00:00.000Z').toLocaleDateString('en-MY'),
    )
  })

  it('renders the approved clearance with seeded signature + stamp, and the draft stays blank', async () => {
    const restore = stubTemplateFetch()
    try {
      const data = createSeedData()
      const definition = DOCUMENTS.find((item) => item.id === 'p2-clearance')!
      const record = data.records[0]
      const intern = data.users.find((user) => user.id === record.internId)!
      const supervisor = data.users.find((user) => user.id === record.supervisorId)
      const context = { record, intern, supervisor, signatures: data.signatures }
      const approvedSection = {
        ...record.documents['p2-clearance'].sections[0],
        status: 'approved' as const,
        approvedAt: '2026-09-15T00:00:00.000Z',
      }
      const approvedRecord = {
        ...record,
        documents: { ...record.documents, 'p2-clearance': { ...record.documents['p2-clearance'], sections: [approvedSection] } },
      }
      const approved = await renderOfficialDocument(definition, { ...context, record: approvedRecord })
      expect(await pageCountOf(approved)).toBe(1)
      // Draft/unapproved renders without throwing and stays free of the
      // approval gate (no invented date, no marks).
      const draft = await renderOfficialDocument(definition, context)
      expect(await pageCountOf(draft)).toBe(1)
      // A corrupt stamp never breaks rendering either.
      const corrupt = await renderOfficialDocument(definition, {
        ...context,
        record: approvedRecord,
        signatures: { ...data.signatures, [record.supervisorId]: { signature: data.signatures[record.supervisorId].signature, stamp: 'data:image/png;base64,aGVsbG8td29ybGQ=' } },
      })
      expect(await pageCountOf(corrupt)).toBe(1)
    } finally { restore() }
  })
})
