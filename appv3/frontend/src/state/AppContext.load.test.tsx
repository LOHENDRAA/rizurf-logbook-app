import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { AppProvider, useApp } from './AppContext'
import { testRepository } from '../test/testRepository'
import type { PortalRepository } from '../services/portalRepository'

type Captured = ReturnType<typeof useApp> | undefined
let captured: Captured

function Capture() {
  const context = useApp()
  useEffect(() => {
    captured = context
  }, [context])
  return <div>{context.ready ? `ready:${context.data.users.length}` : 'loading'}</div>
}

async function renderWith(repository: PortalRepository) {
  captured = undefined
  sessionStorage.clear()
  render(
    <AppProvider repository={repository}>
      <Capture />
    </AppProvider>,
  )
  await waitFor(() => expect(screen.getByText(/ready:/)).toBeInTheDocument())
  // Flush passive effects so the captured context is the settled one.
  await act(async () => {})
  if (!captured) throw new Error('AppContext was not captured')
  return captured as NonNullable<Captured>
}

describe('AppContext load failure handling', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
  })

  it('leaves the splash with demo data and a non-blocking error when load rejects', async () => {
    const ctx = await renderWith(
      testRepository({ load: async () => { throw new Error('indexedDB exploded: secret-xyz') } }),
    )
    expect(ctx.ready).toBe(true)
    // Demo fallback is usable.
    expect(ctx.data.version).toBe(8)
    expect(ctx.data.users.length).toBeGreaterThan(0)
    // Generic message: never leaks the underlying error.
    expect(ctx.loadError).toMatch(/fresh demo data/i)
    expect(ctx.loadError).not.toContain('secret-xyz')
  })

  it('treats an undefined load as empty storage with no error', async () => {
    const ctx = await renderWith(testRepository({ load: async () => undefined }))
    expect(ctx.ready).toBe(true)
    expect(ctx.loadError).toBeNull()
    expect(ctx.data.version).toBe(8)
  })

  it('retryLoad recovers once storage works again', async () => {
    let shouldFail = true
    const saved = testRepository().createDemoData(new Date())
    const repository = testRepository({
      load: async () => {
        if (shouldFail) throw new Error('boom')
        return saved
      },
    })
    await renderWith(repository)
    expect(captured!.loadError).not.toBeNull()

    shouldFail = false
    await act(async () => {
      await captured!.retryLoad()
    })
    expect(captured!.loadError).toBeNull()
    expect(captured!.data).toBe(saved)
  })

  it('retryLoad keeps demo data and the error when storage still fails', async () => {
    await renderWith(testRepository({ load: async () => { throw new Error('boom') } }))
    expect(captured!.loadError).not.toBeNull()
    await act(async () => {
      await captured!.retryLoad()
    })
    expect(captured!.ready).toBe(true)
    expect(captured!.loadError).not.toBeNull()
    expect(captured!.data.version).toBe(8)
  })

  it('dismissLoadError clears the banner without losing data', async () => {
    await renderWith(testRepository({ load: async () => { throw new Error('boom') } }))
    expect(captured!.loadError).not.toBeNull()
    const users = captured!.data.users.length
    act(() => {
      captured!.dismissLoadError()
    })
    expect(captured!.loadError).toBeNull()
    expect(captured!.data.users).toHaveLength(users)
  })

  it('resetDemo clears the error even when clear() rejects', async () => {
    await renderWith(
      testRepository({
        load: async () => { throw new Error('boom') },
        clear: async () => { throw new Error('quota exceeded') },
      }),
    )
    expect(captured!.loadError).not.toBeNull()
    await act(async () => {
      await captured!.resetDemo()
    })
    expect(captured!.loadError).toBeNull()
    expect(captured!.data.version).toBe(8)
  })

  it('does not write before ready and survives quota errors on save', async () => {
    vi.useFakeTimers()
    try {
      const save = vi.fn(async () => { throw new Error('quota exceeded') })
      captured = undefined
      sessionStorage.clear()
      render(
        <AppProvider repository={testRepository({ save })}>
          <Capture />
        </AppProvider>,
      )
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.getByText(/ready:/)).toBeInTheDocument()
      // The initial load must not trigger a save; only edits do.
      expect(save).not.toHaveBeenCalled()

      save.mockClear()
      act(() => {
        captured!.switchUser('student-1')
      })
      act(() => {
        captured!.updateWeeklyDraft('placement-a', 3, 'Some weekly thinking here.')
      })
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      expect(save).toHaveBeenCalledTimes(1)
      // A rejected save never surfaces as a load error or a hang.
      expect(captured!.ready).toBe(true)
      expect(captured!.loadError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
