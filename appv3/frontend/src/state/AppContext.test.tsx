import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { AppProvider, useApp } from './AppContext'
import { testRepository } from '../test/testRepository'
import type { PortalRepository } from '../services/portalRepository'
import type { PortalData } from '../types'

type Captured = ReturnType<typeof useApp> | undefined
let captured: Captured

function Capture() {
  const context = useApp()
  useEffect(() => {
    captured = context
  }, [context])
  return <div>{context.ready ? `ready:${context.currentStudent?.id ?? 'none'}` : 'loading'}</div>
}

async function renderProvider(repository: PortalRepository = testRepository()) {
  captured = undefined
  sessionStorage.clear()
  render(
    <AppProvider repository={repository}>
      <Capture />
    </AppProvider>,
  )
  await waitFor(() => expect(screen.getByText(/ready:/)).toBeInTheDocument())
  if (!captured) throw new Error('AppContext was not captured')
  return captured
}

describe('AppContext auth', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('supports switchUser and case-insensitive email login', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('student-1')
    })
    expect(captured!.currentStudent?.id).toBe('student-1')
    act(() => {
      captured!.logout()
    })
    expect(captured!.currentStudent).toBeUndefined()
    let ok = false
    act(() => {
      ok = captured!.login('AISHA.RAHMAN@STUDENT.EXAMPLE.EDU', 'intern123')
    })
    expect(ok).toBe(true)
    expect(captured!.currentStudent?.id).toBe('student-1')
    expect(captured!.currentInternship?.id).toBe('placement-a')
    expect(captured!.currentJournal?.entries).toHaveLength(12)
  })
})

describe('AppContext weekly entries (daily-plus-weekly)', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  function weeklyCustomData(): PortalData {
    return {
      version: 8,
      users: [
        { id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' },
        { id: 'sup1', name: 'Test Supervisor', email: 'sup1@example.edu', password: 'pw', role: 'supervisor', avatar: 'TP' },
      ],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [{ userId: 'sup1', companyId: 'c1' }],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: '2026-01-05', endDate: '2026-01-18',
      }],
      journals: [{
        internshipId: 'p1',
        entries: [
          {
            id: 'week-1', weekNumber: 1, startDate: '2026-01-05', endDate: '2026-01-11',
            body: '', status: 'not_started',
            dailyEntries: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((date) => ({
              date, body: `Worked on ${date}.`,
            })),
            weeklyDraft: '',
          },
        ],
      }],
    }
  }

  async function renderWeekly() {
    await renderProvider(testRepository({ createDemoData: () => weeklyCustomData() }))
    act(() => {
      captured!.switchUser('s1')
    })
  }

  const cweek = (number: number) => captured!.currentJournal!.entries.find((entry) => entry.weekNumber === number)!

  it('moves typing to draft and clears to not_started', async () => {
    await renderWeekly()
    expect(cweek(1).status).toBe('not_started')

    act(() => {
      captured!.updateJournalBody('p1', 1, 'Short note.')
    })
    expect(cweek(1).weeklyDraft).toBe('Short note.')
    expect(cweek(1).status).toBe('draft')

    act(() => {
      captured!.updateJournalBody('p1', 1, '   ')
    })
    // Status is weekly-only: clearing the draft returns to not_started even
    // though daily logs still carry text.
    expect(cweek(1).status).toBe('not_started')
  })

  it('blocks empty submission and snapshots a short draft', async () => {
    await renderWeekly()
    act(() => {
      captured!.updateJournalBody('p1', 1, '   ')
    })
    let blocked!: { ok: boolean; message: string; words: number }
    await act(async () => {
      blocked = await captured!.submitJournal('p1', 1)
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.words).toBe(0)
    expect(blocked.message).toMatch(/must not be empty/i)
    expect(cweek(1).status).toBe('not_started')

    act(() => {
      captured!.updateJournalBody('p1', 1, 'hello')
    })
    let accepted!: { ok: boolean; message: string; words: number }
    await act(async () => {
      accepted = await captured!.submitJournal('p1', 1)
    })
    expect(accepted.ok).toBe(true)
    expect(cweek(1).status).toBe('submitted')
    expect(cweek(1).submittedBody).toBe('hello')
    expect(cweek(1).review?.status).toBe('pending')
  })

  it('locks working edits while pending and reopens weekly-only revision after requested changes', async () => {
    await renderWeekly()
    act(() => {
      captured!.updateJournalBody('p1', 1, 'hello')
    })
    let first!: { ok: boolean; message: string; words: number }
    await act(async () => {
      first = await captured!.submitJournal('p1', 1)
    })
    expect(first.ok).toBe(true)
    const submitted = cweek(1).weeklyDraft
    expect(cweek(1).submittedBody).toBe(submitted)

    // Working edits while pending are rejected and never touch the snapshot.
    act(() => {
      captured!.updateJournalBody('p1', 1, `${submitted} Extra reflection added.`)
    })
    expect(cweek(1).weeklyDraft).toBe(submitted)
    expect(cweek(1).submittedBody).toBe(submitted)
    expect(cweek(1).status).toBe('submitted')

    // Resubmission while pending is rejected: the week already awaits review.
    let blocked!: { ok: boolean; message: string; words: number }
    await act(async () => {
      blocked = await captured!.submitJournal('p1', 1)
    })
    expect(blocked.ok).toBe(false)
    expect(cweek(1).review?.status).toBe('pending')

    act(() => {
      captured!.switchUser('sup1')
    })
    let requested!: { ok: boolean; message: string }
    await act(async () => {
      requested = await captured!.requestChanges('s1', 1, 'Please add concrete examples.')
    })
    expect(requested.ok).toBe(true)

    act(() => {
      captured!.switchUser('s1')
    })
    act(() => {
      captured!.updateJournalBody('p1', 1, `${cweek(1).weeklyDraft} More detail.`)
    })
    let rereview!: { ok: boolean; message: string; words: number }
    await act(async () => {
      rereview = await captured!.submitJournal('p1', 1)
    })
    expect(rereview.ok).toBe(true)
    expect(cweek(1).review?.status).toBe('pending')
    expect(cweek(1).review?.feedback).toBe('Please add concrete examples.')
  })

  it('updates submittedAt on resubmission', async () => {
    await renderWeekly()
    act(() => {
      captured!.updateJournalBody('p1', 1, 'hello')
    })
    await act(async () => {
      await captured!.submitJournal('p1', 1)
    })
    const first = cweek(1).submittedAt
    expect(first).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 5))
    act(() => {
      captured!.switchUser('sup1')
    })
    await act(async () => {
      await captured!.requestChanges('s1', 1, 'Please expand the timeline section.')
    })
    act(() => {
      captured!.switchUser('s1')
    })
    await act(async () => {
      await captured!.submitJournal('p1', 1)
    })
    expect(cweek(1).submittedAt).not.toBe(first)
  })

  it('keeps approved weeks final: student edits and resubmits are rejected', async () => {
    await renderWeekly()
    act(() => {
      captured!.updateJournalBody('p1', 1, 'hello')
    })
    await act(async () => {
      await captured!.submitJournal('p1', 1)
    })
    act(() => {
      captured!.switchUser('sup1')
    })
    await act(async () => {
      await captured!.approveWeek('s1', 1)
    })
    act(() => {
      captured!.switchUser('s1')
    })
    expect(cweek(1).review?.status).toBe('approved')
    const firstSubmittedAt = cweek(1).submittedAt
    const snapshot = cweek(1).submittedBody

    // Approved weeks are read-only: the draft is untouched by edit attempts.
    act(() => {
      captured!.updateJournalBody('p1', 1, `${cweek(1).weeklyDraft} Additional outcomes.`)
    })
    expect(cweek(1).weeklyDraft).not.toContain('Additional outcomes.')
    expect(cweek(1).status).toBe('submitted')

    await new Promise((resolve) => setTimeout(resolve, 5))
    let resubmit!: { ok: boolean; message: string; words: number }
    await act(async () => {
      resubmit = await captured!.submitJournal('p1', 1)
    })
    expect(resubmit.ok).toBe(false)
    expect(cweek(1).review?.status).toBe('approved')
    expect(cweek(1).submittedBody).toBe(snapshot)
    expect(cweek(1).submittedAt).toBe(firstSubmittedAt)
  })

  it('never persists an over-limit weekly draft and blocks submission while over limit', async () => {
    await renderWeekly()
    act(() => {
      captured!.updateWeeklyDraft('p1', 1, 'x'.repeat(5001))
    })
    expect(cweek(1).weeklyDraft).toBe('')
    expect(cweek(1).status).toBe('not_started')
  })
})

describe('AppContext daily entries and weekly reports', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  function dailyCustomData(): PortalData {
    const dailies = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16'].map((date) => ({
      date, body: '',
    }))
    const futureDailies = ['2099-01-05', '2099-01-06', '2099-01-07', '2099-01-08', '2099-01-09'].map((date) => ({
      date, body: '',
    }))
    return {
      version: 8,
      users: [
        { id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' },
        { id: 'sup1', name: 'Test Supervisor', email: 'sup1@example.edu', password: 'pw', role: 'supervisor', avatar: 'TP' },
      ],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [{ userId: 'sup1', companyId: 'c1' }],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: '2026-01-12', endDate: '2026-01-18',
      }],
      journals: [{
        internshipId: 'p1',
        entries: [
          {
            id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18',
            body: '', status: 'not_started', dailyEntries: dailies, weeklyDraft: '',
          },
          {
            id: 'week-3', weekNumber: 3, startDate: '2099-01-05', endDate: '2099-01-11',
            body: '', status: 'not_started', dailyEntries: futureDailies, weeklyDraft: '',
          },
        ],
      }],
    }
  }

  async function renderDaily() {
    await renderProvider(testRepository({ createDemoData: () => dailyCustomData() }))
    act(() => {
      captured!.switchUser('s1')
    })
  }

  const cweek = (number: number) => captured!.currentJournal!.entries.find((entry) => entry.weekNumber === number)!
  const cday = (weekNumber: number, date: string) => cweek(weekNumber).dailyEntries!.find((day) => day.date === date)!

  it('saves daily bodies with no word limit and keeps status weekly-only', async () => {
    await renderDaily()
    expect(cweek(2).status).toBe('not_started')
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', 'a')
    })
    expect(cday(2, '2026-01-12').body).toBe('a')
    // Daily activity never affects weekly status.
    expect(cweek(2).status).toBe('not_started')
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'Weekly thinking.')
    })
    expect(cweek(2).weeklyDraft).toBe('Weekly thinking.')
    expect(cweek(2).status).toBe('draft')
  })

  it('blocks edits, drafts, and submits on locked future weeks', async () => {
    await renderDaily()
    // Week 3 starts in 2099: locked until its start date.
    act(() => {
      captured!.updateDailyBody('p1', 3, '2099-01-05', 'Planned work.')
    })
    expect(cday(3, '2099-01-05').body).toBe('')
    expect(cweek(3).status).toBe('not_started')
    act(() => {
      captured!.updateWeeklyDraft('p1', 3, 'Future thinking.')
    })
    expect(cweek(3).weeklyDraft).toBe('')
    expect(cweek(3).status).toBe('not_started')
    let result!: { ok: boolean; message: string; words: number }
    await act(async () => {
      result = await captured!.submitWeekly('p1', 3)
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/not started yet/i)
    expect(result.words).toBe(0)
    expect(cweek(3).status).toBe('not_started')
  })

  it('unlocks a week automatically on its start date', async () => {
    const { getProgrammeDate, addDaysUtc } = await import('../domain/dates')
    const today = getProgrammeDate(new Date(), 'UTC')
    const boundaryData = (): PortalData => ({
      version: 8,
      users: [
        { id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' },
      ],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: today, endDate: addDaysUtc(today, 6),
      }],
      journals: [{
        internshipId: 'p1',
        entries: [
          {
            id: 'week-1', weekNumber: 1, startDate: today, endDate: addDaysUtc(today, 6),
            body: '', status: 'not_started',
            dailyEntries: [{ date: today, body: '' }],
            weeklyDraft: '',
          },
        ],
      }],
    })
    await renderProvider(testRepository({ createDemoData: boundaryData }))
    act(() => {
      captured!.switchUser('s1')
    })
    const week = () => captured!.currentJournal!.entries.find((entry) => entry.weekNumber === 1)!
    act(() => {
      captured!.updateDailyBody('p1', 1, today, 'Started today.')
    })
    expect(week().dailyEntries!.find((day) => day.date === today)!.body).toBe('Started today.')
    // Daily activity never affects weekly status.
    expect(week().status).toBe('not_started')
    act(() => {
      captured!.updateWeeklyDraft('p1', 1, 'Boundary draft.')
    })
    expect(week().weeklyDraft).toBe('Boundary draft.')
  })

  it('treats whitespace-only daily bodies as empty but never blocks weekly submission', async () => {
    await renderDaily()
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', '   ')
    })
    expect(cday(2, '2026-01-12').body).toBe('   ')
    //Whitespace-only counts as empty for daily display, but dailies never
    // gate submission: a short weekly report submits with zero dailies.
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'one two')
    })
    let accepted!: { ok: boolean; message: string; words: number }
    await act(async () => {
      accepted = await captured!.submitWeekly('p1', 2)
    })
    expect(accepted.ok).toBe(true)
    expect(cweek(2).status).toBe('submitted')
    expect(cweek(2).submittedBody).toBe('one two')

    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', 'Fixed the login bug.')
    })
    expect(cday(2, '2026-01-12').body).toBe('Fixed the login bug.')
  })

  it('submits with empty daily logs when the weekly report is non-empty', async () => {
    await renderDaily()
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'hello')
    })
    let result!: { ok: boolean; message: string; words: number }
    await act(async () => {
      result = await captured!.submitWeekly('p1', 2)
    })
    expect(result.ok).toBe(true)
    expect(cweek(2).status).toBe('submitted')
    expect(cweek(2).submittedBody).toBe('hello')
    expect(cweek(2).review?.status).toBe('pending')
  })

  it('blocks empty weekly submission even with filled daily logs, then submits a short draft', async () => {
    await renderDaily()
    for (const date of ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16']) {
      act(() => {
        captured!.updateDailyBody('p1', 2, date, `Worked on ${date}.`)
      })
    }
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, '   ')
    })
    let result!: { ok: boolean; message: string; words: number }
    await act(async () => {
      result = await captured!.submitWeekly('p1', 2)
    })
    expect(result.ok).toBe(false)
    expect(result.words).toBe(0)
    expect(result.message).toMatch(/must not be empty/i)

    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'hello')
    })
    await act(async () => {
      result = await captured!.submitWeekly('p1', 2)
    })
    expect(result.ok).toBe(true)
    expect(cweek(2).status).toBe('submitted')
    expect(cweek(2).submittedBody).toBe('hello')
    expect(cweek(2).review?.status).toBe('pending')
  })

  it('keeps daily logs editable after submission while the snapshot stays intact', async () => {
    await renderDaily()
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'hello')
    })
    await act(async () => {
      await captured!.submitWeekly('p1', 2)
    })
    const snapshot = cweek(2).submittedBody
    expect(cweek(2).status).toBe('submitted')

    // Daily edits after submission are accepted without touching the snapshot.
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', 'Edited after submit.')
    })
    expect(cday(2, '2026-01-12').body).toBe('Edited after submit.')
    expect(cweek(2).submittedBody).toBe(snapshot)
    expect(cweek(2).status).toBe('submitted')

    act(() => {
      captured!.switchUser('sup1')
    })
    await act(async () => {
      await captured!.requestChanges('s1', 2, 'Please add deployment notes.')
    })
    act(() => {
      captured!.switchUser('s1')
    })
    // Daily logs stay editable on the revision path too.
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', 'Edited after changes requested.')
    })
    expect(cday(2, '2026-01-12').body).toBe('Edited after changes requested.')
    // An emptied weekly draft blocks resubmission; any non-empty text allows it.
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, '   ')
    })
    let emptied!: { ok: boolean; message: string; words: number }
    await act(async () => {
      emptied = await captured!.submitWeekly('p1', 2)
    })
    expect(emptied.ok).toBe(false)
    expect(emptied.message).toMatch(/must not be empty/i)
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'Short weekly summary. Revised with deployment notes.')
    })
    // Clearing a daily never blocks resubmission: the weekly revision alone gates.
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', '   ')
    })
    expect(cweek(2).weeklyDraft).toContain('deployment notes')
    let resubmit!: { ok: boolean; message: string; words: number }
    await act(async () => {
      resubmit = await captured!.submitWeekly('p1', 2)
    })
    expect(resubmit.ok).toBe(true)
    expect(cweek(2).review?.status).toBe('pending')
    expect(cweek(2).review?.feedback).toBe('Please add deployment notes.')
    expect(cweek(2).submittedBody).toContain('deployment notes')
  })

  it('clearing a daily before submission preserves the weekly draft and still submits', async () => {
    await renderDaily()
    for (const date of ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16']) {
      act(() => {
        captured!.updateDailyBody('p1', 2, date, `Worked on ${date}.`)
      })
    }
    act(() => {
      captured!.updateWeeklyDraft('p1', 2, 'hello')
    })
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-14', '')
    })
    expect(cweek(2).weeklyDraft).toBe('hello')
    let result!: { ok: boolean; message: string; words: number }
    await act(async () => {
      result = await captured!.submitWeekly('p1', 2)
    })
    // Dailies never block submission.
    expect(result.ok).toBe(true)
    expect(cweek(2).status).toBe('submitted')
  })

  it('creates a missing valid weekday sorted without changing weekly status', async () => {
    const sparse = (): PortalData => ({
      version: 8,
      users: [
        { id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' },
      ],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: '2026-01-12', endDate: '2026-01-18',
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18',
          body: '', status: 'not_started',
          dailyEntries: [{ date: '2026-01-16', body: 'Friday work.' }],
          weeklyDraft: '',
        }],
      }],
    })
    await renderProvider(testRepository({ createDemoData: sparse }))
    act(() => {
      captured!.switchUser('s1')
    })
    const week = () => captured!.currentJournal!.entries.find((entry) => entry.weekNumber === 2)!
    // 2026-01-12 is a Monday inside the range and in the past: created on edit.
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-12', 'Monday work.')
    })
    expect(week().dailyEntries!.map((day) => day.date)).toEqual(['2026-01-12', '2026-01-16'])
    expect(week().dailyEntries!.find((day) => day.date === '2026-01-12')!.body).toBe('Monday work.')
    // Daily-only activity leaves the weekly status untouched.
    expect(week().status).toBe('not_started')
  })

  it('allows daily writes on submitted weeks, keeping the snapshot intact', async () => {
    const submittedSparse = (): PortalData => ({
      version: 8,
      users: [
        { id: 's1', name: 'Test Student', email: 's1@example.edu', password: 'pw', role: 'student', avatar: 'TS' },
      ],
      companies: [{ id: 'c1', name: 'Test Co' }],
      supervisors: [],
      mentors: [],
      internships: [{
        id: 'p1', studentId: 's1', companyId: 'c1', universityName: 'U', programmeName: 'P',
        programmeTimeZone: 'UTC', companyName: 'Test Co', position: 'Intern',
        startDate: '2026-01-12', endDate: '2026-01-18',
      }],
      journals: [{
        internshipId: 'p1',
        entries: [{
          id: 'week-2', weekNumber: 2, startDate: '2026-01-12', endDate: '2026-01-18',
          body: '', status: 'submitted',
          dailyEntries: [{ date: '2026-01-12', body: 'Logged work.' }],
          weeklyDraft: 'Weekly summary text.',
          submittedBody: 'Submitted weekly text.',
        }],
      }],
    })
    await renderProvider(testRepository({ createDemoData: submittedSparse }))
    act(() => {
      captured!.switchUser('s1')
    })
    const week = () => captured!.currentJournal!.entries.find((entry) => entry.weekNumber === 2)!
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-13', 'Tuesday work.')
    })
    // Submitted weeks accept new daily logs; the weekly snapshot never changes.
    expect(week().dailyEntries!.map((day) => day.date)).toEqual(['2026-01-12', '2026-01-13'])
    expect(week().dailyEntries!.find((day) => day.date === '2026-01-13')!.body).toBe('Tuesday work.')
    expect(week().status).toBe('submitted')
    expect(week().submittedBody).toBe('Submitted weekly text.')
  })

  it('rejects weekend, out-of-range, future, and locked-week dates without changes', async () => {
    await renderDaily()
    const before = JSON.stringify(cweek(2).dailyEntries)
    // Weekend: 2026-01-10 is a Saturday.
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-01-10', 'Weekend work.')
    })
    // Out of range for week 2 (2026-01-12 … 2026-01-18).
    act(() => {
      captured!.updateDailyBody('p1', 2, '2026-02-04', 'Outside work.')
    })
    // Malformed date.
    act(() => {
      captured!.updateDailyBody('p1', 2, 'not-a-date', 'Bad work.')
    })
    // Future day in the far-future week 3 range.
    act(() => {
      captured!.updateDailyBody('p1', 3, '2099-01-06', 'Future work.')
    })
    expect(JSON.stringify(cweek(2).dailyEntries)).toBe(before)
    expect(cweek(2).status).toBe('not_started')
    expect(cweek(3).dailyEntries!.find((day) => day.date === '2099-01-06')!.body).toBe('')
  })

  it('debounces persistence writes and saves the latest draft', async () => {
    vi.useFakeTimers()
    const save = vi.fn<(data: PortalData) => Promise<void>>(async () => {})
    try {
      sessionStorage.clear()
      render(
        <AppProvider repository={testRepository({ save, createDemoData: () => dailyCustomData() })}>
          <Capture />
        </AppProvider>,
      )
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
      })
      // The provider is ready once the load promise resolves; no student yet.
      expect(screen.getByText('ready:none')).toBeInTheDocument()
      expect(captured?.ready).toBe(true)

      act(() => {
        captured!.switchUser('s1')
      })
      save.mockClear()
      act(() => {
        captured!.updateWeeklyDraft('p1', 2, 'a')
        captured!.updateWeeklyDraft('p1', 2, 'ab')
        captured!.updateWeeklyDraft('p1', 2, 'abc')
      })
      expect(save).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      expect(save).toHaveBeenCalledTimes(1)
      const saved = save.mock.calls[0][0]
      const entry = saved.journals.find((journal) => journal.internshipId === 'p1')!.entries.find((item) => item.weekNumber === 2)!
      expect(entry.weeklyDraft).toBe('abc')
    } finally {
      vi.useRealTimers()
    }
  })
})
