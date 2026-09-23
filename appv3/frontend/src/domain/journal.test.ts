import { describe, expect, it } from 'vitest'
import { canSubmit, countWords, isLateSubmission, journalStats, markSubmitted, nextStoredStatus } from './journal'
import type { JournalEntry } from '../types'

function entry(status: JournalEntry['status']): JournalEntry {
  return { id: 'week-1', weekNumber: 1, startDate: '2026-09-14', endDate: '2026-09-20', body: '', status, dailyEntries: [], weeklyDraft: '' }
}

describe('countWords', () => {
  it('handles empty, whitespace, and newline-separated bodies', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\t  ')).toBe(0)
    expect(countWords('one   two\nthree\tfour')).toBe(4)
    expect(countWords('  leading and trailing  ')).toBe(3)
  })
})

describe('canSubmit', () => {
  it('gates submission on non-empty text only', () => {
    expect(canSubmit('')).toEqual({ ok: false, words: 0 })
    expect(canSubmit('   \n\t  ')).toEqual({ ok: false, words: 0 })
    expect(canSubmit('hello')).toEqual({ ok: true, words: 1 })
    expect(canSubmit('one two')).toEqual({ ok: true, words: 2 })
    expect(canSubmit('x')).toEqual({ ok: true, words: 1 })
  })
})

describe('nextStoredStatus', () => {
  it('moves non-submitted bodies between not_started and draft', () => {
    expect(nextStoredStatus('not_started', 0)).toBe('not_started')
    expect(nextStoredStatus('not_started', 5)).toBe('draft')
    expect(nextStoredStatus('draft', 0)).toBe('not_started')
    expect(nextStoredStatus('draft', 120)).toBe('draft')
  })

  it('keeps submitted sticky while non-empty, else falls to draft', () => {
    expect(nextStoredStatus('submitted', 1)).toBe('submitted')
    expect(nextStoredStatus('submitted', 250)).toBe('submitted')
    expect(nextStoredStatus('submitted', 0)).toBe('draft')
  })
})

describe('markSubmitted', () => {
  it('updates status and both timestamps', () => {
    const stamp = '2026-09-30T10:00:00.000Z'
    expect(markSubmitted(stamp)).toEqual({ status: 'submitted', updatedAt: stamp, submittedAt: stamp })
  })
})

describe('isLateSubmission', () => {
  it('compares the submission date with the week end date', () => {
    expect(isLateSubmission('2026-09-20', '2026-09-21T09:00:00.000Z')).toBe(true)
    expect(isLateSubmission('2026-09-20', '2026-09-19T09:00:00.000Z')).toBe(false)
  })
})

describe('journalStats', () => {
  it('counts submitted entries and computes percent', () => {
    const entries = [entry('submitted'), entry('draft'), entry('not_started'), entry('submitted')]
    expect(journalStats(entries)).toEqual({ submitted: 2, total: 4, percent: 50 })
    expect(journalStats([])).toEqual({ submitted: 0, total: 0, percent: 0 })
  })
})
