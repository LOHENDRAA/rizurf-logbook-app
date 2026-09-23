import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import { AppProvider, useApp } from './AppContext'
import { testRepository } from '../test/testRepository'

type Captured = ReturnType<typeof useApp> | undefined
let captured: Captured

function Capture() {
  const context = useApp()
  useEffect(() => {
    captured = context
  }, [context])
  return <div>{context.ready ? `ready:${context.currentUser?.id ?? 'none'}` : 'loading'}</div>
}

async function renderProvider() {
  captured = undefined
  sessionStorage.clear()
  render(
    <AppProvider repository={testRepository()}>
      <Capture />
    </AppProvider>,
  )
  await waitFor(() => expect(screen.getByText(/ready:/)).toBeInTheDocument())
  if (!captured) throw new Error('AppContext was not captured')
  return captured
}

function journalEntry(studentId: string, weekNumber: number) {
  const placement = captured!.data.internships.find((item) => item.studentId === studentId)!
  const journal = captured!.data.journals.find((item) => item.internshipId === placement.id)!
  return journal.entries.find((item) => item.weekNumber === weekNumber)!
}

describe('AppContext supervisor review actions', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('logs in the supervisor and exposes the company scope', async () => {
    await renderProvider()
    let ok = false
    act(() => {
      ok = captured!.login('sarah.lim@nusantara.example.com', 'supervisor123')
    })
    expect(ok).toBe(true)
    expect(captured!.currentRole).toBe('supervisor')
    expect(captured!.currentSupervisor?.id).toBe('supervisor-1')
    expect(captured!.supervisorCompany?.id).toBe('company-nusantara')
    expect(captured!.isInSupervisorCompany('student-1')).toBe(true)
    expect(captured!.isInSupervisorCompany('student-3')).toBe(true)
    expect(captured!.isInSupervisorCompany('student-5')).toBe(false)
  })

  it('approves a pending week and locks student edits and resubmission', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    let result!: { ok: boolean; message: string }
    await act(async () => {
      result = await captured!.approveWeek('student-3', 1)
    })
    expect(result.ok).toBe(true)
    expect(journalEntry('student-3', 1).review?.status).toBe('approved')
    expect(journalEntry('student-3', 1).review?.reviewedBy).toBe('Sarah Lim')
    expect(journalEntry('student-3', 1).review?.reviewedAt).toBeTruthy()

    // Approved weeks are final: edits are rejected and the snapshot is intact.
    act(() => {
      captured!.switchUser('student-3')
    })
    const before = journalEntry('student-3', 1).weeklyDraft
    const snapshot = journalEntry('student-3', 1).submittedBody
    act(() => {
      captured!.updateJournalBody('placement-c', 1, `${before} Attempted edit after approval.`)
    })
    expect(journalEntry('student-3', 1).weeklyDraft).toBe(before)
    expect(journalEntry('student-3', 1).submittedBody).toBe(snapshot)
    let submit!: { ok: boolean; message: string; words: number }
    await act(async () => {
      submit = await captured!.submitJournal('placement-c', 1)
    })
    expect(submit.ok).toBe(false)
    expect(journalEntry('student-3', 1).review?.status).toBe('approved')
    expect(journalEntry('student-3', 1).submittedBody).toBe(snapshot)
  })

  it('rejects cross-company review access', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    let result!: { ok: boolean; message: string }
    await act(async () => {
      result = await captured!.approveWeek('student-5', 3)
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/access denied/i)
    expect(journalEntry('student-5', 3).review?.status ?? 'pending').toBe('approved')
  })

  it('requires feedback for request-changes and unlocks resubmission to pending', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    let blocked!: { ok: boolean; message: string }
    await act(async () => {
      blocked = await captured!.requestChanges('student-4', 4, '   ')
    })
    expect(blocked.ok).toBe(false)

    let ok!: { ok: boolean; message: string }
    await act(async () => {
      ok = await captured!.requestChanges('student-4', 4, 'Please add concrete examples.')
    })
    expect(ok.ok).toBe(true)
    expect(journalEntry('student-4', 4).review?.status).toBe('changes_requested')

    // Student can edit and resubmit; feedback is retained and status returns to pending.
    act(() => {
      captured!.switchUser('student-4')
    })
    act(() => {
      captured!.updateJournalBody('placement-d', 4, `${journalEntry('student-4', 4).weeklyDraft} Extra reflection added.`)
    })
    let resubmit!: { ok: boolean; message: string; words: number }
    await act(async () => {
      resubmit = await captured!.submitJournal('placement-d', 4)
    })
    expect(resubmit.ok).toBe(true)
    expect(journalEntry('student-4', 4).review?.status).toBe('pending')
    expect(journalEntry('student-4', 4).review?.feedback).toBe('Please add concrete examples.')
  })

  it('resubmits a changes-requested week with unchanged text', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    await act(async () => {
      await captured!.requestChanges('student-4', 4, 'Please add concrete examples.')
    })
    act(() => {
      captured!.switchUser('student-4')
    })
    const snapshot = journalEntry('student-4', 4).submittedBody
    const submittedAt = journalEntry('student-4', 4).submittedAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    // No edits at all: immediate resubmit still returns to pending and
    // refreshes the snapshot timestamp.
    let resubmit!: { ok: boolean; message: string; words: number }
    await act(async () => {
      resubmit = await captured!.submitJournal('placement-d', 4)
    })
    expect(resubmit.ok).toBe(true)
    expect(journalEntry('student-4', 4).review?.status).toBe('pending')
    expect(journalEntry('student-4', 4).review?.feedback).toBe('Please add concrete examples.')
    expect(journalEntry('student-4', 4).submittedBody).toBe(snapshot)
    expect(journalEntry('student-4', 4).submittedAt).not.toBe(submittedAt)
  })

  it('never reviews drafts and rejects review actions on already-decided weeks', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    let draft!: { ok: boolean; message: string }
    await act(async () => {
      draft = await captured!.approveWeek('student-1', 3)
    })
    expect(draft.ok).toBe(false)
    // Approved weeks are final: both decisions are rejected without changes.
    const approvedBefore = journalEntry('student-1', 1).review
    let approveApproved!: { ok: boolean; message: string }
    await act(async () => {
      approveApproved = await captured!.approveWeek('student-1', 1, 'Still looks good.')
    })
    expect(approveApproved.ok).toBe(false)
    expect(approveApproved.message).toMatch(/only.*pending/i)
    expect(journalEntry('student-1', 1).review).toEqual(approvedBefore)
    let rejected!: { ok: boolean; message: string }
    await act(async () => {
      rejected = await captured!.requestChanges('student-1', 1, 'Needs one more concrete example.')
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.message).toMatch(/only.*pending/i)
    expect(journalEntry('student-1', 1).review?.status).toBe('approved')
    expect(journalEntry('student-1', 1).review?.feedback).toBe(approvedBefore?.feedback)
    // Changes-requested weeks await intern resubmission: both decisions rejected.
    const changesBefore = journalEntry('student-4', 2).review
    let approveChanges!: { ok: boolean; message: string }
    await act(async () => {
      approveChanges = await captured!.approveWeek('student-4', 2, 'Now reads well.')
    })
    expect(approveChanges.ok).toBe(false)
    expect(approveChanges.message).toMatch(/only.*pending/i)
    expect(journalEntry('student-4', 2).review).toEqual(changesBefore)
    let rerequest!: { ok: boolean; message: string }
    await act(async () => {
      rerequest = await captured!.requestChanges('student-4', 2, 'One more example, please.')
    })
    expect(rerequest.ok).toBe(false)
    expect(rerequest.message).toMatch(/only.*pending/i)
    expect(journalEntry('student-4', 2).review).toEqual(changesBefore)
  })

  it('blocks review actions for students', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('student-1')
    })
    let result!: { ok: boolean; message: string }
    await act(async () => {
      result = await captured!.approveWeek('student-1', 2)
    })
    expect(result.ok).toBe(false)
  })

  it('rejects approving a changes-requested week until the intern resubmits, then allows a fresh decision', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    const before = journalEntry('student-4', 2).review
    const beforeAt = before?.reviewedAt
    let blocked!: { ok: boolean; message: string }
    await act(async () => {
      blocked = await captured!.approveWeek('student-4', 2, 'Now reads well, thanks for the detail.')
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toMatch(/only.*pending/i)
    expect(journalEntry('student-4', 2).review).toEqual(before)
    // Intern resubmits (even unchanged) back to pending, retaining feedback.
    act(() => {
      captured!.switchUser('student-4')
    })
    let resubmit!: { ok: boolean; message: string; words: number }
    await act(async () => {
      resubmit = await captured!.submitJournal('placement-d', 2)
    })
    expect(resubmit.ok).toBe(true)
    expect(journalEntry('student-4', 2).review?.status).toBe('pending')
    expect(journalEntry('student-4', 2).review?.feedback).toBe(before?.feedback)
    // Supervisor can decide again on the pending week.
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    let result!: { ok: boolean; message: string }
    await act(async () => {
      result = await captured!.approveWeek('student-4', 2, 'Now reads well, thanks for the detail.')
    })
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/review saved/i)
    expect(journalEntry('student-4', 2).review?.status).toBe('approved')
    expect(journalEntry('student-4', 2).review?.feedback).toBe('Now reads well, thanks for the detail.')
    expect(journalEntry('student-4', 2).review?.reviewedBy).toBe('Sarah Lim')
    expect(journalEntry('student-4', 2).review?.reviewedAt).toBeTruthy()
    expect(journalEntry('student-4', 2).review?.reviewedAt).not.toBe(beforeAt)
  })

  it('approves with blank feedback by clearing it and keeps the student draft untouched', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    const draftBefore = journalEntry('student-4', 4).weeklyDraft
    const snapshotBefore = journalEntry('student-4', 4).submittedBody
    let cleared!: { ok: boolean; message: string }
    await act(async () => {
      cleared = await captured!.approveWeek('student-4', 4, '   ')
    })
    expect(cleared.ok).toBe(true)
    expect(journalEntry('student-4', 4).review?.status).toBe('approved')
    expect(journalEntry('student-4', 4).review?.feedback).toBeUndefined()
    expect(journalEntry('student-4', 4).weeklyDraft).toBe(draftBefore)
    expect(journalEntry('student-4', 4).submittedBody).toBe(snapshotBefore)

    let blocked!: { ok: boolean; message: string }
    await act(async () => {
      blocked = await captured!.requestChanges('student-4', 4, '   ')
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toMatch(/feedback is required to request changes/i)
    expect(journalEntry('student-4', 4).review?.status).toBe('approved')
  })

  it('rejects review transitions for draft, cross-company, missing, and student callers', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    // Drafts are never reviewable.
    let draft!: { ok: boolean; message: string }
    await act(async () => {
      draft = await captured!.requestChanges('student-1', 3, 'Some feedback.')
    })
    expect(draft.ok).toBe(false)

    // Cross-company access is denied.
    let crossCompany!: { ok: boolean; message: string }
    await act(async () => {
      crossCompany = await captured!.requestChanges('student-5', 3, 'Some feedback.')
    })
    expect(crossCompany.ok).toBe(false)

    // Missing weeks are rejected without state change.
    let missing!: { ok: boolean; message: string }
    await act(async () => {
      missing = await captured!.approveWeek('student-1', 99)
    })
    expect(missing.ok).toBe(false)

    // Students are blocked.
    act(() => {
      captured!.switchUser('student-1')
    })
    let student!: { ok: boolean; message: string }
    await act(async () => {
      student = await captured!.approveWeek('student-1', 2)
    })
    expect(student.ok).toBe(false)
  })

  it('submits a ready daily week as pending review with a snapshot', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('student-1')
    })
    // Week 3 of placement-a is filled in with daily text plus a short draft.
    const dates = journalEntry('student-1', 3).dailyEntries!.map((day) => day.date)
    expect(dates.length).toBeGreaterThan(0)
    for (const date of dates) {
      act(() => {
        captured!.updateDailyBody('placement-a', 3, date, `Worked on feature ${date}.`)
      })
    }
    act(() => {
      captured!.updateWeeklyDraft('placement-a', 3, 'one two')
    })
    let result!: { ok: boolean; message: string; words: number }
    await act(async () => {
      result = await captured!.submitWeekly('placement-a', 3)
    })
    expect(result.ok).toBe(true)
    expect(journalEntry('student-1', 3).status).toBe('submitted')
    expect(journalEntry('student-1', 3).review?.status).toBe('pending')
    expect(journalEntry('student-1', 3).submittedBody).toBe('one two')
  })

  it('keeps the prior review status when the durable save fails', async () => {
    captured = undefined
    sessionStorage.clear()
    const failing = testRepository()
    failing.save = async () => {
      throw new Error('disk full')
    }
    render(
      <AppProvider repository={failing}>
        <Capture />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByText(/ready:/)).toBeInTheDocument())
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    const before = journalEntry('student-4', 4).review?.status ?? 'pending'
    let result!: { ok: boolean; message: string }
    await act(async () => {
      result = await captured!.requestChanges('student-4', 4, 'Please add concrete examples.')
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/couldn.t save/i)
    expect(journalEntry('student-4', 4).review?.status ?? 'pending').toBe(before)
  })
})
