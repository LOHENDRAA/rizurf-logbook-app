import { describe, expect, it } from 'vitest'
import { getWeeklyReadiness, isDailyFilled, requiredDailyDates, submittedBodyOf, workingWeeklyText } from './weeklyReadiness'

function dailyEntry(overrides: Record<string, unknown> = {}) {
  return {
    startDate: '2026-09-14',
    endDate: '2026-09-20',
    weeklyDraft: '',
    dailyEntries: [
      { date: '2026-09-14', body: 'Worked on onboarding.' },
      { date: '2026-09-15', body: 'Fixed a bug.' },
      { date: '2026-09-16', body: 'Paired with a mentor.' },
      { date: '2026-09-17', body: 'Reviewed pull requests.' },
      { date: '2026-09-18', body: 'Wrote documentation.' },
    ],
    ...overrides,
  }
}

describe('workingWeeklyText / submittedBodyOf', () => {
  it('reads the weekly draft and defaults to empty text', () => {
    expect(workingWeeklyText({ weeklyDraft: 'draft text' })).toBe('draft text')
    expect(workingWeeklyText({})).toBe('')
  })

  it('returns the submitted snapshot or an empty string', () => {
    expect(submittedBodyOf({ submittedBody: 'snapshot' })).toBe('snapshot')
    expect(submittedBodyOf({})).toBe('')
  })
})

describe('isDailyFilled', () => {
  it('treats whitespace-only bodies as empty', () => {
    expect(isDailyFilled({ body: '' })).toBe(false)
    expect(isDailyFilled({ body: '   \n\t ' })).toBe(false)
    expect(isDailyFilled({})).toBe(false)
    expect(isDailyFilled({ body: 'a' })).toBe(true)
    expect(isDailyFilled({ body: 'Short note.' })).toBe(true)
  })
})

describe('requiredDailyDates', () => {
  it('always equals the Monday–Friday dates in the week range, ignoring stored logs', () => {
    expect(requiredDailyDates(dailyEntry())).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
  })

  it('requires all weekdays even when stored logs are sparse or empty', () => {
    expect(requiredDailyDates({
      startDate: '2026-09-14',
      endDate: '2026-09-20',
      dailyEntries: [{ date: '2026-09-14' }],
    })).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
    expect(requiredDailyDates({ startDate: '2026-09-14', endDate: '2026-09-20', dailyEntries: [] })).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
  })

  it('ignores legacy invalid stored logs outside the range', () => {
    expect(requiredDailyDates({
      startDate: '2026-09-14',
      endDate: '2026-09-18',
      dailyEntries: [{ date: '2026-09-19' }, { date: '2026-09-13' }, { date: '2026-09-14' }],
    })).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
  })

  it('falls back to the week range when no logs are stored', () => {
    expect(requiredDailyDates({ startDate: '2026-09-14', endDate: '2026-09-18' })).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    ])
  })
})

describe('getWeeklyReadiness', () => {
  it('submits on any non-empty weekly text alone, before or after the week ends', () => {
    const ready = getWeeklyReadiness(dailyEntry({ weeklyDraft: 'hello' }), '2026-09-21')
    expect(ready).toMatchObject({ weekEnded: true, words: 1, canSubmit: true })
    expect(ready.reasons).toEqual([])
  })

  it('allows submission before the week ends on non-empty text alone', () => {
    const readiness = getWeeklyReadiness(dailyEntry({ weeklyDraft: 'one two' }), '2026-09-18')
    expect(readiness.weekEnded).toBe(false)
    expect(readiness.canSubmit).toBe(true)
    expect(readiness.reasons).toEqual([])
  })

  it('submits with empty daily logs when the weekly report is non-empty', () => {
    const readiness = getWeeklyReadiness(
      dailyEntry({
        weeklyDraft: 'hello',
        dailyEntries: [
          { date: '2026-09-14', body: '' },
          { date: '2026-09-15', body: '   ' },
          { date: '2026-09-16', body: '' },
          { date: '2026-09-17', body: '' },
          { date: '2026-09-18', body: '' },
        ],
      }),
      '2026-09-21',
    )
    expect(readiness.canSubmit).toBe(true)
    expect(readiness.reasons).toEqual([])
  })

  it('blocks submission when the weekly draft is empty or whitespace-only', () => {
    const empty = getWeeklyReadiness(
      dailyEntry({ weeklyDraft: '' }),
      '2026-09-21',
    )
    expect(empty.canSubmit).toBe(false)
    expect(empty.words).toBe(0)
    expect(empty.reasons).toEqual([
      'Weekly report must not be empty.',
    ])
    const whitespace = getWeeklyReadiness(
      dailyEntry({ weeklyDraft: '   \n\t  ' }),
      '2026-09-21',
    )
    expect(whitespace.canSubmit).toBe(false)
    expect(whitespace.reasons).toEqual([
      'Weekly report must not be empty.',
    ])
  })

  it('allows single-character and short drafts', () => {
    const single = getWeeklyReadiness(dailyEntry({ weeklyDraft: 'x' }), '2026-09-21')
    expect(single.canSubmit).toBe(true)
    expect(single.words).toBe(1)
    const twoWords = getWeeklyReadiness(dailyEntry({ weeklyDraft: 'one two' }), '2026-09-21')
    expect(twoWords.canSubmit).toBe(true)
  })

  it('treats not-yet-created daily dates as informational only, never blocking', () => {
    const readiness = getWeeklyReadiness(
      {
        startDate: '2026-09-14',
        endDate: '2026-09-20',
        weeklyDraft: 'hello',
        dailyEntries: [{ date: '2026-09-14', body: 'Worked on onboarding.' }],
      },
      '2026-09-21',
    )
    expect(readiness.canSubmit).toBe(true)
    expect(readiness.requiredCount).toBe(5)
    expect(readiness.completedCount).toBe(1)
    expect(readiness.missingDates).toEqual(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])
    expect(readiness.reasons).toEqual([])
  })

  it('requires nothing daily for zero-weekday weeks', () => {
    const readiness = getWeeklyReadiness(
      { startDate: '2026-09-12', endDate: '2026-09-13', weeklyDraft: 'hello', dailyEntries: [] },
      '2026-09-14',
    )
    expect(readiness.requiredCount).toBe(0)
    expect(readiness.allDailyComplete).toBe(true)
    expect(readiness.canSubmit).toBe(true)
  })
})
