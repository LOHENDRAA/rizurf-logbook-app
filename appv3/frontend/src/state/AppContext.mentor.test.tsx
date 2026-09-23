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

describe('AppContext university mentor dual workflow', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('exposes the mentor assignment scope', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('mentor-1')
    })
    expect(captured!.currentRole).toBe('university_mentor')
    expect(captured!.currentMentor?.id).toBe('mentor-1')
    expect(captured!.isAssignedMentor('student-1')).toBe(true)
    expect(captured!.isAssignedMentor('student-6')).toBe(true)
    expect(captured!.isAssignedMentor('student-x')).toBe(false)
  })

  it('blocks mentor action before company approval', async () => {
    await renderProvider()
    // student-3 week 1 is company-pending: never visible/actionable to mentors.
    act(() => {
      captured!.switchUser('mentor-1')
    })
    let approve!: { ok: boolean; message: string }
    await act(async () => {
      approve = await captured!.approveWeek('student-3', 1)
    })
    expect(approve.ok).toBe(false)
    let rejected!: { ok: boolean; message: string }
    await act(async () => {
      rejected = await captured!.requestChanges('student-3', 1, 'Please add detail.')
    })
    expect(rejected.ok).toBe(false)
    expect(journalEntry('student-3', 1).mentorReview).toBeUndefined()
    expect(journalEntry('student-3', 1).review?.status).toBe('pending')
  })

  it('completes a week only after company approval then mentor approval', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    await act(async () => {
      const result = await captured!.approveWeek('student-3', 1)
      expect(result.ok).toBe(true)
    })
    // Company approval opens the mentor queue as pending.
    expect(journalEntry('student-3', 1).review?.status).toBe('approved')
    expect(journalEntry('student-3', 1).mentorReview?.status).toBe('pending')
    act(() => {
      captured!.switchUser('mentor-1')
    })
    await act(async () => {
      const result = await captured!.approveWeek('student-3', 1)
      expect(result.ok).toBe(true)
    })
    expect(journalEntry('student-3', 1).review?.status).toBe('approved')
    expect(journalEntry('student-3', 1).mentorReview?.status).toBe('approved')
  })

  it('restarts company review after a mentor rejection and returns to mentor pending', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    await act(async () => {
      await captured!.approveWeek('student-3', 1)
    })
    act(() => {
      captured!.switchUser('mentor-1')
    })
    await act(async () => {
      const result = await captured!.requestChanges('student-3', 1, 'Please add concrete examples.')
      expect(result.ok).toBe(true)
    })
    // Mentor rejection preserves the company approval in storage; the company
    // stage reads as needing re-review while the mentor slot holds the rejection.
    expect(journalEntry('student-3', 1).mentorReview?.status).toBe('changes_requested')
    expect(journalEntry('student-3', 1).mentorReview?.feedback).toBe('Please add concrete examples.')
    expect(journalEntry('student-3', 1).review?.status).toBe('approved')
    // Intern revises and resubmits: company back to pending, mentor preserved.
    act(() => {
      captured!.switchUser('student-3')
    })
    await act(async () => {
      const result = await captured!.submitJournal('placement-c', 1)
      expect(result.ok).toBe(true)
    })
    expect(journalEntry('student-3', 1).review?.status).toBe('pending')
    expect(journalEntry('student-3', 1).mentorReview?.status).toBe('changes_requested')
    // Company re-approves: mentor returns to pending with feedback retained.
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    await act(async () => {
      const result = await captured!.approveWeek('student-3', 1)
      expect(result.ok).toBe(true)
    })
    expect(journalEntry('student-3', 1).review?.status).toBe('approved')
    expect(journalEntry('student-3', 1).mentorReview?.status).toBe('pending')
    expect(journalEntry('student-3', 1).mentorReview?.feedback).toBe('Please add concrete examples.')
    // Mentor re-reviews to completion.
    act(() => {
      captured!.switchUser('mentor-1')
    })
    await act(async () => {
      const result = await captured!.approveWeek('student-3', 1)
      expect(result.ok).toBe(true)
    })
    expect(journalEntry('student-3', 1).mentorReview?.status).toBe('approved')
  })

  it('denies mentor action outside the assignment and supervisor action on the mentor slot', async () => {
    await renderProvider()
    act(() => {
      captured!.switchUser('mentor-1')
    })
    let outside!: { ok: boolean; message: string }
    await act(async () => {
      outside = await captured!.approveWeek('student-x', 1)
    })
    expect(outside.ok).toBe(false)
    // Supervisor request-changes on a company-pending week never writes the mentor slot.
    act(() => {
      captured!.switchUser('supervisor-1')
    })
    await act(async () => {
      const result = await captured!.requestChanges('student-4', 4, 'Please add concrete examples.')
      expect(result.ok).toBe(true)
    })
    expect(journalEntry('student-4', 4).review?.status).toBe('changes_requested')
    expect(journalEntry('student-4', 4).mentorReview).toBeUndefined()
  })
})
