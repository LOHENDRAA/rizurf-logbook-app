import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/errors'
import { clearAllRecoveryDrafts, loadRecoveryDraft } from '../../recovery/draftStore'
import { useAutosave } from './useAutosave'

beforeEach(() => {
  clearAllRecoveryDrafts('u1')
  vi.useRealTimers()
})

describe('useAutosave', () => {
  it('debounces keystrokes, serializes writes, and clears recovery on ack', async () => {
    const save = vi.fn(async (body: string) => ({ version: `v-${body.length}` }))
    const { result } = renderHook(() =>
      useAutosave({ userId: 'u1', fieldKey: 'weekly:2', serverBody: '', version: 'v-0', debounceMs: 10, save }),
    )
    act(() => {
      result.current.setValue('a')
      result.current.setValue('ab')
    })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith('ab', 'v-0')
    await waitFor(() => expect(result.current.state).toBe('saved'))
    expect(loadRecoveryDraft('u1', 'weekly:2')).toBeUndefined()
  })

  it('explicit flush persists immediately and surfaces failure without losing text', async () => {
    const save = vi.fn(async () => {
      throw new ApiError({ code: 'INTERNAL', status: 500, message: 'Something went wrong on our side. Please try again.', requestId: 'r1' })
    })
    const { result } = renderHook(() =>
      useAutosave({ userId: 'u1', fieldKey: 'weekly:2', serverBody: '', version: 'v-0', debounceMs: 10_000, save }),
    )
    act(() => {
      result.current.setValue('unsynced work')
    })
    let ok = true
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
    expect(result.current.state).toBe('failed')
    expect(result.current.value).toBe('unsynced work')
    // Draft preserved for recovery.
    expect(loadRecoveryDraft('u1', 'weekly:2')?.body).toBe('unsynced work')
  })

  it('preserves local text on 412, fetches the server copy, and retries with the fresh version', async () => {
    const save = vi.fn(async (body: string, version: string | undefined) => {
      if (version === 'v-stale') {
        throw new ApiError({ code: 'STALE_VERSION', status: 412, message: 'changed', requestId: 'r412' })
      }
      return { version: 'v-fresh+1' }
    })
    const refetchServer = vi.fn(async () => ({ body: 'server text', raw: 'server text', version: 'v-fresh' }))
    const { result } = renderHook(() =>
      useAutosave<string>({
        userId: 'u1',
        fieldKey: 'weekly:2',
        serverBody: '',
        version: 'v-stale',
        debounceMs: 10_000,
        save,
        refetchServer,
      }),
    )
    act(() => {
      result.current.setValue('my edits')
    })
    await act(async () => {
      await result.current.flush()
    })
    expect(result.current.state).toBe('conflict')
    expect(result.current.conflict?.localBody).toBe('my edits')
    expect(refetchServer).toHaveBeenCalledTimes(1)
    // Retry reconciled text against the fresh version.
    await act(async () => {
      await result.current.retryWithVersion('my edits + server')
    })
    expect(save).toHaveBeenLastCalledWith('my edits + server', 'v-fresh')
    await waitFor(() => expect(result.current.state).toBe('saved'))
  })

  it('serializes concurrent flushes so a stale write cannot win', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const seen: string[] = []
    const save = vi.fn(async (body: string) => {
      seen.push(body)
      await gate
      return { version: `v-${body}` }
    })
    const { result } = renderHook(() =>
      useAutosave({ userId: 'u1', fieldKey: 'weekly:2', serverBody: '', version: 'v-0', debounceMs: 10_000, save }),
    )
    act(() => {
      result.current.setValue('first')
    })
    let first!: Promise<boolean>
    act(() => {
      first = result.current.flush()
    })
    act(() => {
      result.current.setValue('second')
    })
    let second!: Promise<boolean>
    act(() => {
      second = result.current.flush()
    })
    release()
    await act(async () => {
      await Promise.all([first, second])
    })
    expect(seen).toEqual(['first', 'second'])
  })

  it('never persists while disabled (read-only week)', async () => {
    const save = vi.fn(async (body: string) => ({ version: `v-${body.length}` }))
    const { result, unmount } = renderHook(() =>
      useAutosave({ userId: 'u1', fieldKey: 'weekly:9', serverBody: 'fixed', version: 'v-0', debounceMs: 5, save, disabled: true }),
    )
    act(() => {
      result.current.setValue('changed while locked')
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.flush()).toBe(true)
    })
    expect(save).not.toHaveBeenCalled()
    unmount()
    expect(save).not.toHaveBeenCalled()
  })
})
