import { describe, expect, it } from 'vitest'
import { createSeedData, DOCUMENTS } from '../data'
import { fillMissingFields, weeklyDateDefaults } from './autofill'
import { ASSESSMENT_CRITERIA, ATTENDANCE_COLUMNS, COVER_CHECKLISTS, attendanceFieldKeys, attendancePageForSection, attendanceSectionIndexesForPage, combinedPageSelection, coverMarkPlacements, previewPageSelection } from './officialTemplates'
import { isSectionValid, removeStoredFile } from './workflow'

describe('preview and hydration helpers', () => {
  it('autofills undefined values but preserves empty and manual values', () => {
    expect(fillMissingFields({ studentName: '', studentId: 'manual' }, { studentName: 'Aisha', studentId: 'TP1', intake: 'APU' })).toEqual({ studentName: '', studentId: 'manual', intake: 'APU' })
    expect(fillMissingFields({ studentName: undefined }, { studentName: 'Aisha' })).toEqual({ studentName: 'Aisha' })
  })

  it('calculates deterministic logbook week dates and preserves overrides', () => {
    const record = createSeedData().records[0]
    const p1 = DOCUMENTS.find((item) => item.id === 'p1-logbook')!
    const p2 = DOCUMENTS.find((item) => item.id === 'p2-logbook')!
    expect(weeklyDateDefaults(p1, 0, record)).toEqual({ startDate: '2026-09-14', endDate: '2026-09-20' })
    expect(weeklyDateDefaults(p1, 7, record)).toEqual({ startDate: '2026-11-02', endDate: '2026-11-08' })
    expect(weeklyDateDefaults(p2, 0, record)).toEqual({ startDate: '2026-11-09', endDate: '2026-11-15' })
    expect(weeklyDateDefaults(p2, 7, record)).toEqual({ startDate: '2026-12-28', endDate: '2027-01-01' })
    expect(fillMissingFields({ startDate: '', endDate: 'manual-end' }, weeklyDateDefaults(p1, 0, record))).toEqual({ startDate: '', endDate: 'manual-end' })
  })

  it('seeds identity values without changing the seeded workflow', () => {
    const data = createSeedData()
    const cover = data.records[0].documents['p1-cover'].sections[0]
    expect(cover.fields.studentName).toBe('Aisha Rahman')
    expect(cover.fields.companyName).toBe('Rizurf Technology')
    expect(data.records[0].documents['p1-logbook'].sections[0].status).toBe('approved')
  })

  it('maps attendance weeks to paired official pages', () => {
    expect(attendancePageForSection(0)).toBe(0)
    expect(attendancePageForSection(1)).toBe(0)
    expect(attendancePageForSection(2)).toBe(1)
    expect(attendanceSectionIndexesForPage(3)).toEqual([6, 7])
    const definition = DOCUMENTS.find((item) => item.id === 'p2-attendance')!
    expect(previewPageSelection(definition, 1)[0].label).toBe('Weeks 01–02')
    expect(combinedPageSelection(definition)).toHaveLength(8)
  })

  it('maps only the current logbook week in the live preview', () => {
    const definition = DOCUMENTS.find((item) => item.id === 'p1-logbook')!
    expect(previewPageSelection(definition, 4)[0].sectionIndexes).toEqual([4])
    expect(combinedPageSelection(definition)).toHaveLength(8)
  })

  it('uses every official cover checklist row with unconditional auto-signing', () => {
    expect(COVER_CHECKLISTS.part1.map((item) => item.key)).toEqual(['logbook', 'cover-letter-cv', 'project-log', 'week-email'])
    expect(COVER_CHECKLISTS.part2.map((item) => item.key)).toEqual(['report', 'clearance', 'logbook', 'attendance', 'assessment', 'mentor-report'])
    // No per-row document dependency remains: marks draw for every row
    // whenever a signature embeds, even on a fully incomplete record.
    const data = createSeedData()
    expect(data.records[0].documents['p2-report']?.files ?? []).toHaveLength(0)
    expect(coverMarkPlacements('part1', {})).toHaveLength(4)
    expect(coverMarkPlacements('part2', {})).toHaveLength(6)
    expect(coverMarkPlacements('part1', undefined)).toEqual([])
    expect(coverMarkPlacements('part2', undefined)).toEqual([])
  })

  it('maps structured attendance fields to named official columns', () => {
    expect(attendanceFieldKeys('monday')).toEqual({ workplace: 'mondayWorkplace', date: 'mondayDate', timeIn: 'mondayTimeIn', timeOut: 'mondayTimeOut', timeServed: 'mondayHours' })
    expect(ATTENDANCE_COLUMNS).toMatchObject({ workplace: 57, date: 272, timeIn: 342, timeOut: 410, timeServed: 480 })
    const definition = DOCUMENTS.find((item) => item.id === 'p2-attendance')!
    const section = createSeedData().records[0].documents[definition.id].sections[0]
    // Prefilled weekday dates alone never validate — a manual entry is needed.
    section.fields = { mondayDate: '2026-09-14' }
    expect(isSectionValid(definition, section, 0)).toBe(false)
    section.fields = { mondayDate: '2026-09-14', mondayWorkplace: 'Office' }
    expect(isSectionValid(definition, section, 0)).toBe(true)
  })

  it('keeps the assessment page split and all eleven criteria stable', () => {
    expect(ASSESSMENT_CRITERIA).toHaveLength(11)
    expect(ASSESSMENT_CRITERIA.at(-1)).toContain('Others')
    const definition = DOCUMENTS.find((item) => item.id === 'p2-assessment')!
    expect(previewPageSelection(definition, 0).map((page) => page.sourcePage)).toEqual([0, 1])
    expect(previewPageSelection(definition, 0).every((page) => page.sectionIndexes[0] === 0)).toBe(true)
  })

  it('invalidates an approved upload when its existing file is removed', () => {
    const document = createSeedData().records[0].documents['p1-cv']
    document.sections[0].status = 'approved'
    document.files.push({ id: 'file-1', name: 'cv.pdf', type: 'application/pdf', size: 1, blob: new Blob(), uploadedAt: 'old' })
    const updated = removeStoredFile(document, 'file-1', 'new')
    expect(updated.files).toHaveLength(0)
    expect(updated.sections[0].status).toBe('draft')
    expect(updated.updatedAt).toBe('new')
    expect(removeStoredFile(document, 'missing', 'later')).toBe(document)
  })
})
