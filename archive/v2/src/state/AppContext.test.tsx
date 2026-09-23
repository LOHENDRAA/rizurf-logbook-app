import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from './AppContext'
import { ReviewPage } from '../pages/ReviewPage'

const stubTemplateFetch = () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    const pathname = new URL(String(url), 'http://localhost').pathname
    return new Response(await readFile(join(process.cwd(), 'public', pathname)), { status: 200 })
  }) as typeof fetch
  // jsdom Blobs lack arrayBuffer(), which generatePdf needs to embed the
  // rendered official pages — polyfill via FileReader for this test only.
  const proto = Blob.prototype as unknown as Record<string, unknown>
  const originalArrayBuffer = proto.arrayBuffer
  if (typeof originalArrayBuffer !== 'function') {
    proto.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error ?? new Error('read failed'))
        reader.readAsArrayBuffer(this)
      })
    }
  }
  return () => {
    globalThis.fetch = originalFetch
    if (typeof originalArrayBuffer !== 'function') delete proto.arrayBuffer
  }
}

vi.mock('../lib/storage', () => ({
  loadData: vi.fn(() => Promise.resolve(undefined)),
  saveData: vi.fn(() => Promise.resolve()),
  clearData: vi.fn(() => Promise.resolve()),
}))

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
  render(
    <AppProvider>
      <Capture />
    </AppProvider>,
  )
  await waitFor(() => expect(screen.getByText(/ready:/)).toBeInTheDocument())
  if (!captured) throw new Error('AppContext was not captured')
  return captured
}

describe('AppContext quickLogin', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('selects each seeded account deterministically by ID', async () => {
    await renderProvider()
    for (const id of ['intern-1', 'intern-2', 'intern-3', 'supervisor-1'] as const) {
      act(() => {
        captured!.quickLogin(id)
      })
      expect(sessionStorage.getItem('internflow-user')).toBe(id)
      expect(captured!.currentUser?.id).toBe(id)
    }
    expect(captured!.currentUser?.name).toBe('Marcus Tan')
  })

  it('does not overwrite a valid session for an unknown ID', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-2')
    })
    expect(sessionStorage.getItem('internflow-user')).toBe('intern-2')

    act(() => {
      captured!.quickLogin('no-such-user')
    })
    expect(sessionStorage.getItem('internflow-user')).toBe('intern-2')
    expect(captured!.currentUser?.id).toBe('intern-2')
  })

  it('keeps email/password login working alongside quick login', async () => {
    await renderProvider()
    let ok = false
    act(() => {
      ok = captured!.login('daniel.lee@mail.apu.edu.my', 'intern123')
    })
    expect(ok).toBe(true)
    expect(sessionStorage.getItem('internflow-user')).toBe('intern-2')

    act(() => {
      ok = captured!.login('daniel.lee@mail.apu.edu.my', 'wrong-password')
    })
    expect(ok).toBe(false)
    expect(sessionStorage.getItem('internflow-user')).toBe('intern-2')
  })
})

const HELLO_WORLD = 'data:image/png;base64,aGVsbG8td29ybGQ='

describe('AppContext cover visual-only Completed', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  const coverSection = (documentId = 'p1-cover') => captured!.data.records.find((record) => record.internId === 'intern-1')!.documents[documentId].sections[0]
  const supervisorNotifications = () => captured!.data.notifications.filter((item) => item.userId === 'supervisor-1').length

  it('marks p1-cover complete with no signature: completed status, history, no approval side effects', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    // Seeded cover starts approved; editing the mentor moves it to draft.
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { mentorName: 'Dr. Mentor' })
    })
    expect(coverSection().status).toBe('draft')
    expect(coverSection().approvedAt).toBeUndefined()
    const historyBefore = coverSection().history.length
    const notificationsBefore = supervisorNotifications()
    const updatedBefore = coverSection().updatedAt

    // No signature is saved at all, yet completion must succeed.
    expect(captured!.data.signatures['intern-1']?.signature).toBeFalsy()
    let result = { ok: false, message: '' }
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Marked complete.')
    const section = coverSection()
    expect(section.status).toBe('completed')
    expect(section.status).not.toBe('approved')
    expect(section.approvedAt).toBeUndefined()
    expect(section.history).toHaveLength(historyBefore + 1)
    expect(section.history[section.history.length - 1].action).toBe('Completed')
    expect(section.updatedAt).toBeDefined()
    expect(section.updatedAt).not.toBe(updatedBefore)
    // Visual-only: no supervisor notification, never submitted for review.
    expect(supervisorNotifications()).toBe(notificationsBefore)
    // Hidden locked values survive the transition.
    expect(section.fields.studentName).toBeTruthy()
    expect(section.fields.companyAddress).toBeTruthy()
    expect(section.fields.mentorName).toBe('Dr. Mentor')
  })

  it('allows Completed with a corrupt signature and never produces approved', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { mentorName: 'Dr. Mentor' })
    })
    act(() => {
      captured!.updateSignature('intern-1', { signature: HELLO_WORLD })
    })
    const historyBefore = coverSection().history.length
    let result = { ok: false, message: '' }
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    expect(result.ok).toBe(true)
    expect(coverSection().status).toBe('completed')
    expect(coverSection().approvedAt).toBeUndefined()
    expect(coverSection().history).toHaveLength(historyBefore + 1)
  })

  it('marks p2-cover complete with only mentorName and never yields approved', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    // p2-cover has a single manual field: mentorName starts empty, so it
    // cannot complete yet even though locked values are stored.
    const p2Before = coverSection('p2-cover')
    expect(p2Before.fields.studentName).toBeTruthy()
    expect(p2Before.fields.companyAddress).toBeTruthy()
    let result = { ok: true, message: '' }
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p2-cover', [coverSection('p2-cover').id])
    })
    expect(result.ok).toBe(false)
    expect(coverSection('p2-cover').status).not.toBe('completed')
    // A forged companyAddress is stripped; the canonical address is kept.
    act(() => {
      captured!.updateFields('intern-1', 'p2-cover', coverSection('p2-cover').id, { companyAddress: 'Forged Tower', mentorName: 'Dr. Mentor' })
    })
    expect(coverSection('p2-cover').fields.companyAddress).not.toBe('Forged Tower')
    const historyBefore = coverSection('p2-cover').history.length
    const notificationsBefore = supervisorNotifications()
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p2-cover', [coverSection('p2-cover').id])
    })
    expect(result.ok).toBe(true)
    const section = coverSection('p2-cover')
    expect(section.status).toBe('completed')
    expect(section.approvedAt).toBeUndefined()
    expect(section.history).toHaveLength(historyBefore + 1)
    expect(supervisorNotifications()).toBe(notificationsBefore)
    expect(section.fields.studentName).toBeTruthy()
    expect(section.fields.mentorName).toBe('Dr. Mentor')
  })

  it('editing a completed cover flips it back to draft and cleared manual blocks re-completion', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { mentorName: 'Dr. Mentor' })
    })
    await act(async () => {
      await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    expect(coverSection().status).toBe('completed')
    const historyBefore = coverSection().history.length
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { mentorName: 'Dr. Edited' })
    })
    expect(coverSection().status).toBe('draft')
    expect(coverSection().fields.mentorName).toBe('Dr. Edited')
    // Clearing the manual field fails validation on the next attempt.
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { mentorName: '' })
    })
    let result = { ok: true, message: '' }
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    expect(result.ok).toBe(false)
    expect(coverSection().status).toBe('draft')
    expect(coverSection().history).toHaveLength(historyBefore)
  })

  it('strips locked-key edits and keeps supervisor approve/requestChanges as no-ops for covers', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    const before = { ...coverSection().fields }
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { studentName: 'Forged Name', companyAddress: 'Forged Address', mentorName: 'Dr. Mentor' })
    })
    // Locked keys are ignored; the manual key is saved.
    expect(coverSection().fields.studentName).toBe(before.studentName)
    expect(coverSection().fields.companyAddress).toBe(before.companyAddress)
    expect(coverSection().fields.mentorName).toBe('Dr. Mentor')
    await act(async () => {
      await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    expect(coverSection().status).toBe('completed')
    const historyBefore = coverSection().history.length
    act(() => {
      captured!.quickLogin('supervisor-1')
    })
    act(() => {
      captured!.approveSections('intern-1', 'p1-cover', [coverSection().id])
    })
    act(() => {
      captured!.requestChanges('intern-1', 'p1-cover', coverSection().id, 'Please change')
    })
    expect(coverSection().status).toBe('completed')
    expect(coverSection().history).toHaveLength(historyBefore)
  })

  it('strips locked keys for every document while keeping manual values', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    const recordOf = () => captured!.data.records.find((record) => record.internId === 'intern-1')!
    // Logbook: locked identity + dates stripped, narratives saved.
    const logbook = recordOf().documents['p1-logbook'].sections[0]
    const logbookBefore = { ...logbook.fields }
    act(() => {
      captured!.updateFields('intern-1', 'p1-logbook', logbook.id, {
        studentName: 'Forged', startDate: '2000-01-01', endDate: '2000-01-02',
        activities: 'Real work', reflection: 'Real learning',
      })
    })
    const logbookAfter = recordOf().documents['p1-logbook'].sections[0].fields
    expect(logbookAfter.studentName).toBe(logbookBefore.studentName)
    expect(logbookAfter.startDate).toBe(logbookBefore.startDate)
    expect(logbookAfter.endDate).toBe(logbookBefore.endDate)
    expect(logbookAfter.activities).toBe('Real work')
    expect(logbookAfter.reflection).toBe('Real learning')
    // Clearance: every field is locked, so a forged-only call is a no-op.
    const clearance = recordOf().documents['p2-clearance'].sections[0]
    const clearanceBefore = { ...clearance.fields }
    act(() => {
      captured!.updateFields('intern-1', 'p2-clearance', clearance.id, { studentName: 'Forged', department: 'Forged Dept' })
    })
    expect(recordOf().documents['p2-clearance'].sections[0].fields).toEqual(clearanceBefore)
    // Attendance: locked headers stripped, manual rows + editable dates saved.
    const attendance = recordOf().documents['p2-attendance'].sections[0]
    const attendanceBefore = { ...attendance.fields }
    act(() => {
      captured!.updateFields('intern-1', 'p2-attendance', attendance.id, {
        studentName: 'Forged', companyAddress: 'Forged Address',
        mondayDate: '2026-09-15', mondayWorkplace: 'Remote',
      })
    })
    const attendanceAfter = recordOf().documents['p2-attendance'].sections[0].fields
    expect(attendanceAfter.studentName).toBe(attendanceBefore.studentName)
    expect(attendanceAfter.companyAddress).toBe(attendanceBefore.companyAddress)
    expect(attendanceAfter.mondayDate).toBe('2026-09-15')
    expect(attendanceAfter.mondayWorkplace).toBe('Remote')
  })

  it('is idempotent: a second Mark complete adds no duplicate history', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection().id, { mentorName: 'Dr. Mentor' })
    })
    await act(async () => {
      await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    const historyBefore = coverSection().history.length
    let result = { ok: false, message: '' }
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p1-cover', [coverSection().id])
    })
    expect(result.ok).toBe(true)
    expect(coverSection().status).toBe('completed')
    expect(coverSection().history).toHaveLength(historyBefore)
  })

  it('leaves non-cover submit/approve behavior unchanged', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    const logbook = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-logbook'].sections[0]
    act(() => {
      captured!.updateFields('intern-1', 'p1-logbook', logbook.id, { activities: 'Did project work.', reflection: 'Learned a lot.' })
    })
    const notificationsBefore = supervisorNotifications()
    let result = { ok: false, message: '' }
    await act(async () => {
      result = await captured!.submitSections('intern-1', 'p1-logbook', [logbook.id])
    })
    expect(result.ok).toBe(true)
    const submitted = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-logbook'].sections[0]
    expect(submitted.status).toBe('submitted_for_review')
    expect(supervisorNotifications()).toBe(notificationsBefore + 1)
    act(() => {
      captured!.quickLogin('supervisor-1')
    })
    act(() => {
      captured!.approveSections('intern-1', 'p1-logbook', [logbook.id])
    })
    const approved = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-logbook'].sections[0]
    expect(approved.status).toBe('approved')
    expect(approved.approvedAt).toBeDefined()
  })
})

describe('AppContext cover mentorName bidirectional sync', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  const recordOf = () => captured!.data.records.find((record) => record.internId === 'intern-1')!
  const coverSection = (documentId = 'p1-cover') => recordOf().documents[documentId].sections[0]

  it('mirrors p1→p2 verbatim and strips forged locked keys on both sides', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    const p1Before = { ...coverSection('p1-cover').fields }
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { companyAddress: 'Forged Tower', mentorName: 'Dr. Mentor' })
    })
    expect(coverSection('p1-cover').fields.mentorName).toBe('Dr. Mentor')
    expect(coverSection('p2-cover').fields.mentorName).toBe('Dr. Mentor')
    // Forged locked keys are stripped on the edited side and never leak via the sibling path.
    expect(coverSection('p1-cover').fields.companyAddress).toBe(p1Before.companyAddress)
    expect(coverSection('p2-cover').fields.companyAddress).not.toBe('Forged Tower')
  })

  it('mirrors p2→p1 (reverse direction)', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    act(() => {
      captured!.updateFields('intern-1', 'p2-cover', coverSection('p2-cover').id, { mentorName: 'Dr. Reverse' })
    })
    expect(coverSection('p2-cover').fields.mentorName).toBe('Dr. Reverse')
    expect(coverSection('p1-cover').fields.mentorName).toBe('Dr. Reverse')
  })

  it('propagates clearing to both sides and blocks completion on both', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { mentorName: 'Dr. Mentor' })
    })
    expect(coverSection('p2-cover').fields.mentorName).toBe('Dr. Mentor')
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { mentorName: '' })
    })
    expect(coverSection('p1-cover').fields.mentorName).toBe('')
    expect(coverSection('p2-cover').fields.mentorName).toBe('')
    let p1Result = { ok: true, message: '' }
    let p2Result = { ok: true, message: '' }
    await act(async () => {
      p1Result = await captured!.submitSections('intern-1', 'p1-cover', [coverSection('p1-cover').id])
    })
    await act(async () => {
      p2Result = await captured!.submitSections('intern-1', 'p2-cover', [coverSection('p2-cover').id])
    })
    expect(p1Result.ok).toBe(false)
    expect(p2Result.ok).toBe(false)
  })

  it('demotes a completed sibling to draft, clears approvedAt, and marks PDFs outdated', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    // Complete both covers first.
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { mentorName: 'Dr. Mentor' })
    })
    await act(async () => {
      await captured!.submitSections('intern-1', 'p1-cover', [coverSection('p1-cover').id])
    })
    await act(async () => {
      await captured!.submitSections('intern-1', 'p2-cover', [coverSection('p2-cover').id])
    })
    expect(coverSection('p1-cover').status).toBe('completed')
    expect(coverSection('p2-cover').status).toBe('completed')
    // Seed a stale approvedAt + fresh PDF on the sibling to prove demotion semantics.
    const p1HistoryBefore = coverSection('p1-cover').history.length
    const p2HistoryBefore = coverSection('p2-cover').history.length
    const restoreFetch = stubTemplateFetch()
    try {
      await act(async () => {
        await captured!.generatePdf('intern-1', 'part1')
      })
    } finally { restoreFetch() }
    expect(recordOf().pdfs.some((pdf) => pdf.outdated === false)).toBe(true)
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { mentorName: 'Dr. Edited' })
    })
    expect(coverSection('p1-cover').status).toBe('draft')
    expect(coverSection('p2-cover').status).toBe('draft')
    expect(coverSection('p1-cover').fields.mentorName).toBe('Dr. Edited')
    expect(coverSection('p2-cover').fields.mentorName).toBe('Dr. Edited')
    expect(coverSection('p1-cover').approvedAt).toBeUndefined()
    expect(coverSection('p2-cover').approvedAt).toBeUndefined()
    // Keystroke demotion writes no history on either side.
    expect(coverSection('p1-cover').history).toHaveLength(p1HistoryBefore)
    expect(coverSection('p2-cover').history).toHaveLength(p2HistoryBefore)
    expect(recordOf().pdfs.every((pdf) => pdf.outdated)).toBe(true)
  })

  it('leaves the sibling untouched for non-cover and non-mentor edits', async () => {
    await renderProvider()
    act(() => {
      captured!.quickLogin('intern-1')
    })
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { mentorName: 'Dr. Mentor' })
    })
    const p2Before = coverSection('p2-cover').fields.mentorName
    const p2UpdatedBefore = coverSection('p2-cover').updatedAt
    // Non-cover edit: logbook activity must not touch either cover.
    const logbook = recordOf().documents['p1-logbook'].sections[0]
    act(() => {
      captured!.updateFields('intern-1', 'p1-logbook', logbook.id, { activities: 'Real work', reflection: 'Real learning' })
    })
    expect(coverSection('p2-cover').fields.mentorName).toBe(p2Before)
    // Non-mentor (forged locked-only) edit on a cover is a no-op for the sibling.
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', coverSection('p1-cover').id, { companyAddress: 'Forged Tower' })
    })
    expect(coverSection('p2-cover').fields.mentorName).toBe(p2Before)
    expect(coverSection('p2-cover').updatedAt).toBe(p2UpdatedBefore)
  })
})

describe('ReviewPage cover Completed display', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  function renderReview(internId: string, userId: string) {
    captured = undefined
    sessionStorage.setItem('internflow-user', userId)
    return render(
      <AppProvider>
        <MemoryRouter initialEntries={[`/supervisor/interns/${internId}`]}>
          <Routes>
            <Route path="/supervisor/interns/:internId" element={<ReviewPage />} />
            <Route path="/dashboard" element={<div>dashboard fallback</div>} />
          </Routes>
          <ReviewNavigator />
        </MemoryRouter>
        <Capture />
      </AppProvider>,
    )
  }

  function ReviewNavigator() {
    const navigate = useNavigate()
    useEffect(() => {
      ;(window as unknown as { __navigate?: (path: string) => void }).__navigate = navigate
    }, [navigate])
    return null
  }

  const navigateTo = (path: string) => {
    const navigate = (window as unknown as { __navigate?: (path: string) => void }).__navigate
    if (!navigate) throw new Error('navigator not ready')
    act(() => {
      navigate(path)
    })
  }

  it('shows a completed cover as Completed with Approve & sign disabled', async () => {
    renderReview('intern-1', 'intern-1')
    await waitFor(() => expect(screen.getByText(/ready:/)).toBeInTheDocument())
    act(() => {
      captured!.quickLogin('intern-1')
    })
    const sectionId = captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0].id
    act(() => {
      captured!.updateFields('intern-1', 'p1-cover', sectionId, { mentorName: 'Dr. Mentor' })
    })
    await act(async () => {
      await captured!.submitSections('intern-1', 'p1-cover', [sectionId])
    })
    expect(captured!.data.records.find((record) => record.internId === 'intern-1')!.documents['p1-cover'].sections[0].status).toBe('completed')
    // Switch to the supervisor and return to the review URL (the intern
    // session redirects away from the supervisor-only route).
    act(() => {
      captured!.quickLogin('supervisor-1')
    })
    navigateTo('/supervisor/interns/intern-1')
    // "Cover" (p1-cover), not "Cover letter".
    const coverButton = screen.getByRole('button', {
      name: (name) => /cover/i.test(name) && !/letter/i.test(name),
    })
    fireEvent.click(coverButton)
    await waitFor(() => expect(screen.getAllByText('Completed').length).toBeGreaterThan(0))
    expect(screen.queryByText('Approved')).toBeNull()
    expect(screen.getByRole('button', { name: /approve & sign/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /request changes/i })).toBeDisabled()
  })
})
