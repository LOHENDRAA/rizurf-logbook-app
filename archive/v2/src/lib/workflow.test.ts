import { describe, expect, it } from 'vitest'
import { createSeedData, DOCUMENTS } from '../data'
import { documentProgress, documentStatus, isCompleteStatus, isSectionValid, partComplete, partProgress, shouldHideLockedFields } from './workflow'

describe('workflow calculations', () => {
  it('calculates progress from granular sections', () => {
    const record = createSeedData().records[0]
    const progress = partProgress(record, 'part1')

    expect(progress.total).toBe(13)
    expect(progress.approved).toBe(3)
    expect(progress.percent).toBe(23)
    expect(partComplete(record, 'part1')).toBe(false)
  })

  it('prioritizes requested changes in document status', () => {
    const record = createSeedData().records[0].documents['p1-logbook']
    record.sections[0].status = 'approved'
    record.sections[1].status = 'changes_requested'
    record.sections[2].status = 'submitted_for_review'

    expect(documentStatus(record)).toBe('changes_requested')
    expect(documentProgress(record)).toBe(13)
  })

  it('requires both logbook narrative fields', () => {
    const definition = DOCUMENTS.find((item) => item.id === 'p1-logbook')!
    const section = createSeedData().records[0].documents['p1-logbook'].sections[0]
    section.fields = { activities: 'Implemented the assigned feature.' }

    expect(isSectionValid(definition, section, 0)).toBe(false)
    section.fields.reflection = 'Improved requirements analysis and communication.'
    expect(isSectionValid(definition, section, 0)).toBe(true)
  })

  it('requires at least one file for upload documents', () => {
    const definition = DOCUMENTS.find((item) => item.id === 'p1-cv')!
    const section = createSeedData().records[0].documents['p1-cv'].sections[0]

    expect(isSectionValid(definition, section, 0)).toBe(false)
    expect(isSectionValid(definition, section, 1)).toBe(true)
  })

  it('seeds a nearly complete intern with Part 1 unlocked', () => {
    const record = createSeedData().records[2]

    expect(partComplete(record, 'part1')).toBe(true)
    expect(partProgress(record, 'part2').approved).toBeGreaterThan(0)
  })

  it('counts completed like approved in document and part progress', () => {
    const record = createSeedData().records[0]
    const document = record.documents['p1-cover']
    document.sections[0].status = 'completed'
    expect(isCompleteStatus('completed')).toBe(true)
    expect(isCompleteStatus('approved')).toBe(true)
    expect(isCompleteStatus('draft')).toBe(false)
    expect(documentStatus(document)).toBe('completed')
    expect(documentProgress(document)).toBe(100)
    const progress = partProgress(record, 'part1')
    // intern-1 seeds 3 approved sections; the completed cover keeps 3 complete.
    expect(progress.approved).toBe(3)
    expect(progress.total).toBe(13)
  })

  it('keeps legacy all-approved documents distinct from completed', () => {
    const record = createSeedData().records[2].documents['p1-cover']
    expect(documentStatus(record)).toBe('approved')
  })

  it('validates only manual fields on covers, and stored canonical values on fully-locked clearance', () => {
    const p1 = DOCUMENTS.find((item) => item.id === 'p1-cover')!
    const p2 = DOCUMENTS.find((item) => item.id === 'p2-cover')!
    const clearance = DOCUMENTS.find((item) => item.id === 'p2-clearance')!
    const record = createSeedData().records[0]
    // p1: mentorName alone decides validity; locked values are stored anyway.
    const p1Empty = { ...record.documents['p1-cover'].sections[0], fields: { ...record.documents['p1-cover'].sections[0].fields, mentorName: '' } }
    expect(isSectionValid(p1, p1Empty, 0)).toBe(false)
    expect(isSectionValid(p1, { ...p1Empty, fields: { ...p1Empty.fields, mentorName: 'Dr. M' } }, 0)).toBe(true)
    // p2: mentorName alone decides validity (companyAddress is locked).
    const p2Empty = { ...record.documents['p2-cover'].sections[0], fields: { ...record.documents['p2-cover'].sections[0].fields, mentorName: '' } }
    expect(isSectionValid(p2, p2Empty, 0)).toBe(false)
    expect(isSectionValid(p2, { ...p2Empty, fields: { ...p2Empty.fields, mentorName: 'Dr. M' } }, 0)).toBe(true)
    // clearance: fully locked, so the stored canonical values decide validity.
    const clearanceSection = record.documents['p2-clearance'].sections[0]
    expect(isSectionValid(clearance, clearanceSection, 0)).toBe(true)
    expect(isSectionValid(clearance, { ...clearanceSection, fields: {} }, 0)).toBe(false)
  })

  it('hides locked fields only on covers and clearance', () => {
    expect(shouldHideLockedFields(DOCUMENTS.find((item) => item.id === 'p1-cover')!)).toBe(true)
    expect(shouldHideLockedFields(DOCUMENTS.find((item) => item.id === 'p2-cover')!)).toBe(true)
    expect(shouldHideLockedFields(DOCUMENTS.find((item) => item.id === 'p2-clearance')!)).toBe(true)
    expect(shouldHideLockedFields(DOCUMENTS.find((item) => item.id === 'p1-logbook')!)).toBe(false)
    expect(shouldHideLockedFields(DOCUMENTS.find((item) => item.id === 'p2-attendance')!)).toBe(false)
  })

  it('unlocks Part 2 when Part 1 covers are completed rather than approved', () => {
    const record = createSeedData().records[0]
    // Flip every Part 1 section to completed: part must read complete.
    Object.values(record.documents).forEach((document) => {
      if (!document.id.startsWith('p1-')) return
      document.sections.forEach((section) => { section.status = 'completed' })
    })
    expect(partComplete(record, 'part1')).toBe(true)
    expect(partProgress(record, 'part1').percent).toBe(100)
  })
})
