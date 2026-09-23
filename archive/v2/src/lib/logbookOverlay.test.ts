import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { createSeedData, DOCUMENTS } from '../data'
import { combinedPageSelection, linesFor, LOGBOOK_FIELDS, logbookField, maxLinesFor, previewPageSelection, renderOfficialDocument } from './officialTemplates'

/** Cell borders measured from the official template vector content (PDF points, bottom-left origin). */
const CELLS = {
  page: { width: 595.304, height: 841.89 },
  identity: { left: 136.1, right: 544, nameTop: 680.739, nameBottom: 665.739, idBottom: 650.739, companyBottom: 621.239 },
  week: { top: 603.439, bottom: 573.939, weekRight: 136.1, startRight: 320.4, right: 544 },
  activities: { left: 51.3, right: 544, top: 573.939, bottom: 510.139 },
  content: { left: 51.3, right: 544, top: 484.339, bottom: 218.239 },
}

const embedRegular = async () => {
  const pdf = await PDFDocument.create()
  return pdf.embedFont(StandardFonts.Helvetica)
}

const layoutOf = (key: Parameters<typeof logbookField>[0], text: string, font: PDFFont) => {
  const field = logbookField(key)
  const maxLines = maxLinesFor(field.y - field.bottom, field.size)
  return { field, maxLines, lineHeight: field.size * 1.25, lines: linesFor(text, font, field.size, field.width, maxLines) }
}

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

describe('weekly logbook overlay geometry', () => {
  it('keeps every field inside its measured template cell', () => {
    const byKey = Object.fromEntries(LOGBOOK_FIELDS.map((field) => [field.key, field]))
    expect(Object.keys(byKey).sort()).toEqual(['activities', 'companyName', 'endDate', 'reflection', 'startDate', 'studentId', 'studentName', 'week'])
    // Identity rows share the value column right of its left border.
    for (const key of ['studentName', 'studentId', 'companyName'] as const) {
      expect(byKey[key].x).toBeGreaterThanOrEqual(CELLS.identity.left)
      expect(byKey[key].x + byKey[key].width).toBeLessThanOrEqual(CELLS.identity.right)
    }
    expect(byKey.studentName.y).toBeLessThan(CELLS.identity.nameTop)
    expect(byKey.studentName.bottom).toBeGreaterThanOrEqual(CELLS.identity.nameBottom)
    expect(byKey.studentId.y).toBeLessThan(CELLS.identity.nameBottom)
    expect(byKey.studentId.bottom).toBeGreaterThanOrEqual(CELLS.identity.idBottom)
    expect(byKey.companyName.y).toBeLessThan(CELLS.identity.idBottom)
    expect(byKey.companyName.bottom).toBeGreaterThanOrEqual(CELLS.identity.companyBottom)
    // Week/start/end values stay in their own sub-cells without overlapping.
    const row = [byKey.week, byKey.startDate, byKey.endDate]
    const edges = [CELLS.week.weekRight, CELLS.week.startRight, CELLS.week.right]
    row.forEach((field, index) => {
      expect(field.x + field.width).toBeLessThanOrEqual(edges[index])
      expect(field.y).toBeLessThan(CELLS.week.top)
      expect(field.bottom).toBeGreaterThanOrEqual(CELLS.week.bottom)
      if (index > 0) expect(field.x).toBeGreaterThanOrEqual(row[index - 1].x + row[index - 1].width)
    })
    // Body boxes stay between their own borders and clear the next section.
    expect(byKey.activities.y).toBeLessThan(CELLS.activities.top)
    expect(byKey.activities.bottom).toBeGreaterThanOrEqual(CELLS.activities.bottom)
    expect(byKey.reflection.y).toBeLessThan(CELLS.content.top)
    expect(byKey.reflection.bottom).toBeGreaterThanOrEqual(CELLS.content.bottom)
    for (const field of LOGBOOK_FIELDS) {
      expect(field.x).toBeGreaterThanOrEqual(0)
      expect(field.x + field.width).toBeLessThanOrEqual(CELLS.page.width)
      expect(field.bottom).toBeGreaterThanOrEqual(0)
      expect(field.y).toBeLessThanOrEqual(CELLS.page.height)
      const maxLines = maxLinesFor(field.y - field.bottom, field.size)
      const lastBaseline = field.y - (maxLines - 1) * field.size * 1.25
      expect(lastBaseline).toBeGreaterThanOrEqual(field.bottom)
    }
  })

  it('confines long prose and unbroken tokens within each body cell', async () => {
    const font = await embedRegular()
    const proseFor = (repeats: number) => `${'Planned and completed backend integration tasks, wrote unit tests, reviewed pull requests, and documented deployment steps. '.repeat(repeats)}`
    for (const [key, repeats] of [['activities', 12], ['reflection', 40]] as const) {
      const { field, maxLines, lines } = layoutOf(key, proseFor(repeats), font)
      expect(lines).toHaveLength(maxLines)
      expect(maxLines).toBeGreaterThan(1)
      lines.forEach((line) => { expect(font.widthOfTextAtSize(line, field.size)).toBeLessThanOrEqual(field.width + 0.01) })
      expect(lines.at(-1)).toMatch(/\.\.\.$/)
      expect(font.widthOfTextAtSize(lines.at(-1)!, field.size)).toBeLessThanOrEqual(field.width + 0.01)
    }
    const token = layoutOf('activities', `${'A'.repeat(140)} done`, font)
    expect(token.lines.length).toBeGreaterThan(1)
    token.lines.forEach((line) => { expect(font.widthOfTextAtSize(line, token.field.size)).toBeLessThanOrEqual(token.field.width + 0.01) })
    // The old activities placement (baseline 540, height 70) let 7 lines fall
    // to y=480, below the measured 510.139 cell bottom; the manifest must not.
    const oldLastBaseline = 540 - (maxLinesFor(70, 8) - 1) * 8 * 1.25
    expect(oldLastBaseline).toBeLessThan(CELLS.activities.bottom)
    const fixed = logbookField('activities')
    const fixedLast = fixed.y - (maxLinesFor(fixed.y - fixed.bottom, fixed.size) - 1) * fixed.size * 1.25
    expect(fixedLast).toBeGreaterThanOrEqual(fixed.bottom)
  })

  it('labels P1 weeks 01-08 and P2 weeks 09-16 in preview and combined output', () => {
    const p1 = DOCUMENTS.find((item) => item.id === 'p1-logbook')!
    const p2 = DOCUMENTS.find((item) => item.id === 'p2-logbook')!
    expect(previewPageSelection(p1, 0)[0]).toMatchObject({ sourcePage: 0, sectionIndexes: [0], label: 'Week 01' })
    expect(previewPageSelection(p1, 7)[0]).toMatchObject({ sourcePage: 0, sectionIndexes: [7], label: 'Week 08' })
    expect(previewPageSelection(p2, 0)[0]).toMatchObject({ sourcePage: 0, sectionIndexes: [0], label: 'Week 09' })
    expect(previewPageSelection(p2, 7)[0]).toMatchObject({ sourcePage: 0, sectionIndexes: [7], label: 'Week 16' })
    for (const definition of [p1, p2]) {
      const combined = combinedPageSelection(definition)
      expect(combined).toHaveLength(8)
      combined.forEach((page, index) => { expect(page.sectionIndexes).toEqual([index]) })
    }
  })

  it('renders one page per selected week and eight pages combined for both parts', async () => {
    const restore = stubTemplateFetch()
    try {
      const data = createSeedData()
      const record = data.records[0]
      const intern = data.users.find((user) => user.id === record.internId)!
      const supervisor = data.users.find((user) => user.id === record.supervisorId)
      const context = { record, intern, supervisor, signatures: data.signatures }
      for (const id of ['p1-logbook', 'p2-logbook'] as const) {
        const definition = DOCUMENTS.find((item) => item.id === id)!
        record.documents[id].sections.forEach((section, index) => {
          section.fields = {
            ...section.fields,
            activities: `Week work ${'planning, building, testing, and documenting services. '.repeat(10)}`,
            reflection: `Reflection ${'on technical growth and career relevance. '.repeat(12)}`,
            supervisorComments: 'Legacy value with no template region and must never render.',
          }
          if (id === 'p2-logbook' && index === 7) section.fields.endDate = record.endDate
          section.status = 'approved'
          section.approvedAt = new Date('2027-01-02T00:00:00Z').toISOString()
        })
        const single = await renderOfficialDocument(definition, context, previewPageSelection(definition, id === 'p1-logbook' ? 2 : 7))
        expect(await pageCountOf(single)).toBe(1)
        const combined = await renderOfficialDocument(definition, context, combinedPageSelection(definition))
        expect(await pageCountOf(combined)).toBe(8)
        const unbroken = `https://example.invalid/${'x'.repeat(160)}`
        record.documents[id].sections[0].fields.activities = unbroken
        const overflow = await renderOfficialDocument(definition, context, previewPageSelection(definition, 0))
        expect(await pageCountOf(overflow)).toBe(1)
      }
    } finally { restore() }
  }, 30000)
})
