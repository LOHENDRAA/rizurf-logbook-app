import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_DATE_KEYS,
  AUTOFILL_FIELDS,
  DOCUMENTS,
  GLOBAL_COMPANY_ADDRESS,
  LOCKED_KEYS,
  PLACEMENT_EXTRAS,
  attendanceDateDefaults,
  createSeedData,
} from '../data'
import { autofillDocument, fillMissingFields, hydrateAppData, reconcileCoverMentor } from './autofill'
import { isSectionValid } from './workflow'

const EXPECTED_ADDRESS = GLOBAL_COMPANY_ADDRESS

function seedContext(internId = 'intern-1') {
  const data = createSeedData()
  const record = data.records.find((item) => item.internId === internId)!
  const intern = data.users.find((user) => user.id === internId)!
  const supervisor = data.users.find((user) => user.id === record.supervisorId)
  return { data, record, intern, supervisor }
}

describe('centralized autofill configuration', () => {
  it('declares locked vs editable-default modes for every auto-filled document', () => {
    expect(Object.keys(LOCKED_KEYS).sort()).toEqual(
      ['p1-cover', 'p1-logbook', 'p2-assessment', 'p2-attendance', 'p2-clearance', 'p2-cover', 'p2-logbook'].sort(),
    )
    expect(LOCKED_KEYS['p1-cover']).toContain('companyAddress')
    expect(LOCKED_KEYS['p2-cover']).toContain('companyAddress')
    expect(LOCKED_KEYS['p2-clearance']).toEqual(
      expect.arrayContaining(['studentName', 'department', 'studentId', 'intake', 'identityNumber', 'companyName', 'supervisorName', 'contactNumber']),
    )
    expect(LOCKED_KEYS['p2-clearance']).toHaveLength(8)
    for (const key of ['mondayDate', 'tuesdayDate', 'wednesdayDate', 'thursdayDate', 'fridayDate']) {
      expect(AUTOFILL_FIELDS['p2-attendance'][key].mode).toBe('editable-default')
    }
    expect(ATTENDANCE_DATE_KEYS).toEqual(['mondayDate', 'tuesdayDate', 'wednesdayDate', 'thursdayDate', 'fridayDate'])
    // Every other configured field is locked.
    for (const [documentId, fields] of Object.entries(AUTOFILL_FIELDS)) {
      for (const [key, spec] of Object.entries(fields)) {
        if (documentId === 'p2-attendance' && key.endsWith('Date')) {
          expect(spec.mode).toBe('editable-default')
        } else {
          expect(spec.mode).toBe('locked')
        }
      }
    }
  })

  it('seeds distinct fictional placement extras per intern', () => {
    const data = createSeedData()
    const extras = data.records.map((record) => [record.department, record.identityNumber, record.contactNumber])
    for (const [department, identityNumber, contactNumber] of extras) {
      expect(department).toBeTruthy()
      expect(identityNumber).toBeTruthy()
      expect(contactNumber).toBeTruthy()
    }
    expect(new Set(extras.map((entry) => entry[1])).size).toBe(3)
    expect(data.records[0].department).toBe(PLACEMENT_EXTRAS['intern-1'].department)
  })

  it('overwrites stale locked headers for clearance, logbook, and assessment', () => {
    const { record, intern, supervisor } = seedContext()
    const clearanceDef = DOCUMENTS.find((item) => item.id === 'p2-clearance')!
    const staleClearance = structuredClone(record.documents['p2-clearance'])
    staleClearance.sections[0].fields = {
      ...staleClearance.sections[0].fields,
      studentName: 'Stale', department: 'Stale Dept', supervisorName: 'Stale Sup',
      startDate: '2000-01-01', endDate: '2000-01-02',
    }
    const filledClearance = autofillDocument(record, clearanceDef, staleClearance, intern, supervisor)
    expect(filledClearance.sections[0].fields.studentName).toBe(intern.name)
    expect(filledClearance.sections[0].fields.department).toBe(record.department)
    expect(filledClearance.sections[0].fields.supervisorName).toBe(supervisor!.name)
    // Clearance stores only its 8 defined fields — never startDate/endDate.
    expect(Object.keys(filledClearance.sections[0].fields).sort()).toEqual(
      ['companyName', 'contactNumber', 'department', 'identityNumber', 'intake', 'studentId', 'studentName', 'supervisorName'].sort(),
    )
    expect(filledClearance.sections[0].fields.startDate).toBeUndefined()
    expect(filledClearance.sections[0].fields.endDate).toBeUndefined()

    const logbookDef = DOCUMENTS.find((item) => item.id === 'p1-logbook')!
    const staleLog = structuredClone(record.documents['p1-logbook'])
    staleLog.sections[2].fields = { ...staleLog.sections[2].fields, studentName: 'Stale', startDate: '2000-01-01', endDate: '2000-01-02', activities: 'Keep me', reflection: 'Keep me too' }
    const filledLog = autofillDocument(record, logbookDef, staleLog, intern, supervisor)
    expect(filledLog.sections[2].fields.studentName).toBe(intern.name)
    expect(filledLog.sections[2].fields.startDate).toBe('2026-09-28')
    expect(filledLog.sections[2].fields.endDate).toBe('2026-10-04')
    expect(filledLog.sections[2].fields.activities).toBe('Keep me')

    const assessmentDef = DOCUMENTS.find((item) => item.id === 'p2-assessment')!
    const staleAssessment = structuredClone(record.documents['p2-assessment'])
    staleAssessment.sections[0].fields = {
      ...staleAssessment.sections[0].fields,
      studentName: 'Stale', awardTitle: 'Stale Title', supervisorName: 'Stale Sup', 'criterion-0': 'A', score: '9',
    }
    const filledAssessment = autofillDocument(record, assessmentDef, staleAssessment, intern, supervisor)
    expect(filledAssessment.sections[0].fields.studentName).toBe(intern.name)
    expect(filledAssessment.sections[0].fields.awardTitle).toBe(record.title)
    expect(filledAssessment.sections[0].fields.supervisorName).toBe(supervisor!.name)
    expect(filledAssessment.sections[0].fields.startDate).toBe(record.startDate)
    expect(filledAssessment.sections[0].fields['criterion-0']).toBe('A')
    expect(filledAssessment.sections[0].fields.score).toBe('9')
  })

  it('stores locked attendance headers while prefilling weekday dates as editable defaults', () => {
    const { record, intern, supervisor } = seedContext()
    const definition = DOCUMENTS.find((item) => item.id === 'p2-attendance')!
    const empty = structuredClone(record.documents['p2-attendance'])
    empty.sections.forEach((section) => { section.fields = {} })
    const filled = autofillDocument(record, definition, empty, intern, supervisor)
    expect(filled.sections).toHaveLength(16)
    expect(filled.sections[0].fields.studentName).toBe(intern.name)
    expect(filled.sections[0].fields.supervisorName).toBe(supervisor!.name)
    expect(filled.sections[0].fields.companyAddress).toBe(EXPECTED_ADDRESS)
    expect(filled.sections[0].fields.identityNumber).toBe(record.identityNumber)
    expect(filled.sections[0].fields.mondayDate).toBe('2026-09-14')
    expect(filled.sections[0].fields.fridayDate).toBe('2026-09-18')
    expect(filled.sections[1].fields.mondayDate).toBe('2026-09-21')
    // Dates past the placement end cap at the end date (week 16 Monday
    // 2026-12-28, Friday 2027-01-01).
    expect(filled.sections[15].fields.mondayDate).toBe('2026-12-28')
    expect(filled.sections[15].fields.fridayDate).toBe('2027-01-01')
  })

  it('never overwrites user-edited attendance dates, including an explicit empty string', () => {
    const { record, intern, supervisor } = seedContext()
    const definition = DOCUMENTS.find((item) => item.id === 'p2-attendance')!
    const edited = structuredClone(record.documents['p2-attendance'])
    edited.sections[0].fields = {
      ...edited.sections[0].fields,
      mondayDate: '2026-09-15', tuesdayDate: '', mondayWorkplace: 'Remote',
    }
    const filled = autofillDocument(record, definition, edited, intern, supervisor)
    expect(filled.sections[0].fields.mondayDate).toBe('2026-09-15')
    expect(filled.sections[0].fields.tuesdayDate).toBe('')
    expect(filled.sections[0].fields.mondayWorkplace).toBe('Remote')
    expect(filled.sections[0].fields.wednesdayDate).toBe('2026-09-16')
  })

  it('caps attendance date defaults at the placement end date', () => {
    const { record } = seedContext()
    // record.endDate is 2027-01-01; per-cell capping only clips dates past
    // the end (week 16 Monday 2026-12-28 is untouched, Friday caps).
    expect(attendanceDateDefaults(0, record)).toMatchObject({ mondayDate: '2026-09-14', fridayDate: '2026-09-18' })
    expect(attendanceDateDefaults(15, record)).toMatchObject({ mondayDate: '2026-12-28', fridayDate: '2027-01-01' })
  })

  it('validates fully-locked clearance from stored canonical values without crashing when empty', () => {
    const { record, intern, supervisor } = seedContext()
    const definition = DOCUMENTS.find((item) => item.id === 'p2-clearance')!
    const section = record.documents['p2-clearance'].sections[0]
    expect(isSectionValid(definition, section, 0)).toBe(true)
    expect(isSectionValid(definition, { ...section, fields: {} }, 0)).toBe(false)
    // Missing supervisor still yields defined strings for the other 7 keys.
    const noSupervisor = autofillDocument(record, definition, structuredClone(record.documents['p2-clearance']), intern, undefined)
    expect(Object.values(noSupervisor.sections[0].fields).every((value) => typeof value === 'string')).toBe(true)
  })

  it('keeps fillMissing semantics: undefined gets a default, empty string is a user value', () => {
    expect(fillMissingFields({ a: '', b: 'x' }, { a: 'default-a', b: 'default-b', c: 'default-c' })).toEqual({ a: '', b: 'x', c: 'default-c' })
  })

  it('requires all 11 ratings plus score: headers and comments alone never validate', () => {
    const { record } = seedContext()
    const definition = DOCUMENTS.find((item) => item.id === 'p2-assessment')!
    // Seeded headers only (6 locked keys, zero ratings) is invalid.
    const headersOnly = record.documents['p2-assessment'].sections[0]
    expect(isSectionValid(definition, headersOnly, 0)).toBe(false)
    // Comments alone (even 11+1) never count.
    const commentsOnlyFields = { ...headersOnly.fields }
    for (let index = 0; index < 11; index += 1) commentsOnlyFields[`criterion-comment-${index}`] = 'Nice work'
    commentsOnlyFields.comments = 'Overall good'
    expect(isSectionValid(definition, { ...headersOnly, fields: commentsOnlyFields }, 0)).toBe(false)
    const fullRatings = (grade: string): Record<string, string> => Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`criterion-${index}`, grade]))
    // 10 of 11 ratings fails, even with a score.
    const tenOfEleven: Record<string, string> = { ...headersOnly.fields, ...fullRatings('B'), score: '8' }
    delete tenOfEleven['criterion-10']
    expect(isSectionValid(definition, { ...headersOnly, fields: tenOfEleven }, 0)).toBe(false)
    // Missing score fails with all 11 ratings present.
    expect(isSectionValid(definition, { ...headersOnly, fields: { ...headersOnly.fields, ...fullRatings('B') } }, 0)).toBe(false)
    // Invalid grade values fail.
    for (const bad of ['E', 'a', 'A+', '', '  ']) {
      expect(isSectionValid(definition, { ...headersOnly, fields: { ...headersOnly.fields, ...fullRatings('B'), 'criterion-5': bad, score: '8' } }, 0)).toBe(false)
    }
    // Invalid score values fail.
    for (const bad of ['0', '11', 'A', '', '8.5', '  ']) {
      expect(isSectionValid(definition, { ...headersOnly, fields: { ...headersOnly.fields, ...fullRatings('B'), score: bad } }, 0)).toBe(false)
    }
    // Full 11 ratings + score passes, with and without comments; surrounding
    // whitespace is tolerated.
    expect(isSectionValid(definition, { ...headersOnly, fields: { ...headersOnly.fields, ...fullRatings('A'), score: '10' } }, 0)).toBe(true)
    expect(isSectionValid(definition, { ...headersOnly, fields: { ...headersOnly.fields, ...fullRatings('C'), score: ' 7 ', comments: 'Steady progress', 'criterion-comment-0': 'Good attitude' } }, 0)).toBe(true)
  })

  it('seeds approved/submitted attendance sections with a valid manual entry', () => {
    const data = createSeedData()
    const definition = DOCUMENTS.find((item) => item.id === 'p2-attendance')!
    let seededCount = 0
    for (const record of data.records) {
      for (const section of record.documents['p2-attendance'].sections) {
        if (section.status !== 'approved' && section.status !== 'submitted_for_review') continue
        seededCount += 1
        expect(isSectionValid(definition, section, 0)).toBe(true)
        expect(section.fields.mondayWorkplace).toBeTruthy()
      }
    }
    // intern-3 (seedProgress 31) seeds weeks 1–7; the others seed none.
    expect(seededCount).toBeGreaterThan(0)
    // Untouched weeks stay dates-only and invalid until the user adds entry.
    const fresh = data.records[0].documents['p2-attendance'].sections[0]
    expect(fresh.status).toBe('not_started')
    expect(fresh.fields.mondayDate).toBeTruthy()
    expect(isSectionValid(definition, fresh, 0)).toBe(false)
  })

  it('requires a manual attendance entry: prefilled dates alone never validate', () => {
    const { record } = seedContext()
    const definition = DOCUMENTS.find((item) => item.id === 'p2-attendance')!
    // Fully prefilled defaults (locked headers + weekday dates) with no
    // manual entry is invalid.
    const datesOnly = record.documents['p2-attendance'].sections[0]
    expect(datesOnly.fields.mondayDate).toBeTruthy()
    expect(isSectionValid(definition, datesOnly, 0)).toBe(false)
    // Each manual entry kind validates on its own (group, not each).
    const manualEntries: Record<string, string>[] = [
      { mondayWorkplace: 'Office' },
      { mondayTimeIn: '09:00' },
      { mondayTimeOut: '18:00' },
      { mondayHours: '8' },
      { monday: 'Legacy combined entry' },
      { notes: 'Weekly notes' },
    ]
    for (const manual of manualEntries) {
      expect(isSectionValid(definition, { ...datesOnly, fields: { ...datesOnly.fields, ...manual } }, 0)).toBe(true)
    }
  })

  it('reconciles cover mentorName purely: one-sided fill, both-empty no-op, conflict preserved', () => {
    expect(reconcileCoverMentor('Dr. Mentor', '')).toEqual(['Dr. Mentor', 'Dr. Mentor'])
    expect(reconcileCoverMentor('', 'Dr. Mentor')).toEqual(['Dr. Mentor', 'Dr. Mentor'])
    expect(reconcileCoverMentor('Dr. Mentor', '   ')).toEqual(['Dr. Mentor', 'Dr. Mentor'])
    expect(reconcileCoverMentor(undefined, 'Dr. Mentor')).toEqual(['Dr. Mentor', 'Dr. Mentor'])
    expect(reconcileCoverMentor('', '')).toEqual(['', ''])
    expect(reconcileCoverMentor('   ', '')).toEqual(['   ', ''])
    expect(reconcileCoverMentor(undefined, undefined)).toEqual([undefined, undefined])
    // Conflicting legacy values are preserved verbatim until the next edit.
    expect(reconcileCoverMentor('Dr. One', 'Dr. Two')).toEqual(['Dr. One', 'Dr. Two'])
  })

  it('hydrates one-sided legacy mentor values to the empty side without touching status', () => {
    const seed = createSeedData()
    const saved = structuredClone(seed) as typeof seed
    saved.records[0].documents['p1-cover'].sections[0].fields.mentorName = 'Dr. Legacy'
    saved.records[0].documents['p2-cover'].sections[0].fields.mentorName = ''
    const p1Status = saved.records[0].documents['p1-cover'].sections[0].status
    const p2Status = saved.records[0].documents['p2-cover'].sections[0].status
    const hydrated = hydrateAppData(saved, seed)
    expect(hydrated.records[0].documents['p1-cover'].sections[0].fields.mentorName).toBe('Dr. Legacy')
    expect(hydrated.records[0].documents['p2-cover'].sections[0].fields.mentorName).toBe('Dr. Legacy')
    expect(hydrated.records[0].documents['p1-cover'].sections[0].status).toBe(p1Status)
    expect(hydrated.records[0].documents['p2-cover'].sections[0].status).toBe(p2Status)

    // Reverse direction.
    const saved2 = structuredClone(seed) as typeof seed
    saved2.records[0].documents['p1-cover'].sections[0].fields.mentorName = '   '
    saved2.records[0].documents['p2-cover'].sections[0].fields.mentorName = 'Dr. P2'
    const hydrated2 = hydrateAppData(saved2, seed)
    expect(hydrated2.records[0].documents['p1-cover'].sections[0].fields.mentorName).toBe('Dr. P2')
    expect(hydrated2.records[0].documents['p2-cover'].sections[0].fields.mentorName).toBe('Dr. P2')

    // Both-empty stays empty; conflicting values are both preserved.
    const saved3 = structuredClone(seed) as typeof seed
    saved3.records[0].documents['p1-cover'].sections[0].fields.mentorName = ''
    saved3.records[0].documents['p2-cover'].sections[0].fields.mentorName = ''
    const hydrated3 = hydrateAppData(saved3, seed)
    expect(hydrated3.records[0].documents['p1-cover'].sections[0].fields.mentorName).toBe('')
    expect(hydrated3.records[0].documents['p2-cover'].sections[0].fields.mentorName).toBe('')
    const saved4 = structuredClone(seed) as typeof seed
    saved4.records[0].documents['p1-cover'].sections[0].fields.mentorName = 'Dr. One'
    saved4.records[0].documents['p2-cover'].sections[0].fields.mentorName = 'Dr. Two'
    const hydrated4 = hydrateAppData(saved4, seed)
    expect(hydrated4.records[0].documents['p1-cover'].sections[0].fields.mentorName).toBe('Dr. One')
    expect(hydrated4.records[0].documents['p2-cover'].sections[0].fields.mentorName).toBe('Dr. Two')
  })

  it('hydrates old records missing placement extras with seeded demo values', () => {
    const seed = createSeedData()
    const saved = structuredClone(seed) as typeof seed
    for (const savedRecord of saved.records) {
      delete (savedRecord as Partial<typeof savedRecord>).department
      delete (savedRecord as Partial<typeof savedRecord>).identityNumber
      delete (savedRecord as Partial<typeof savedRecord>).contactNumber
    }
    // Stale a locked clearance value to prove canonical refresh still runs.
    saved.records[0].documents['p2-clearance'].sections[0].fields.department = 'Stale Dept'
    const hydrated = hydrateAppData(saved, seed)
    for (const [index, hydratedRecord] of hydrated.records.entries()) {
      expect(hydratedRecord.department).toBe(seed.records[index].department)
      expect(hydratedRecord.identityNumber).toBe(seed.records[index].identityNumber)
      expect(hydratedRecord.contactNumber).toBe(seed.records[index].contactNumber)
    }
    expect(hydrated.records[0].documents['p2-clearance'].sections[0].fields.department).toBe(seed.records[0].department)
    // Manual state still survives hydration.
    expect(hydrated.records[0].documents['p1-cover'].sections[0].fields.mentorName).toBe(
      saved.records[0].documents['p1-cover'].sections[0].fields.mentorName,
    )
  })
})
