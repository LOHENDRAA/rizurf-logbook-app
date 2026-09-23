/**
 * Per-field debounced, serialized autosave hook.
 *
 * Guarantees:
 * - keystrokes stay local; the server write fires after `debounceMs`;
 * - writes for one field are serialized through a promise chain
 *   (a stale timer can never overwrite a newer transition);
 * - `flush()` persists immediately (explicit Save button);
 * - unsynced text is mirrored to the user-scoped recovery store and
 *   cleared on acknowledgement;
 * - 401 preserves the draft and raises re-auth; 409/412 preserves local
 *   text, refetches the server copy, and surfaces a conflict payload.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/errors'
import { reportTelemetry } from '../../observability/reporter'
import { clearRecoveryDraft, loadRecoveryDraft, saveRecoveryDraft } from '../../recovery/draftStore'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict' | 'offline'

export interface ConflictInfo<TServer = unknown> {
  localBody: string
  serverCopy: TServer | undefined
  version: string | undefined
}

interface AutosaveOptions<TServer> {
  userId: string
  fieldKey: string
  /** Last-known server text (authoritative baseline). */
  serverBody: string
  version: string | undefined
  debounceMs?: number
  /** Persist one value; resolves with the new version. */
  save: (body: string, version: string | undefined) => Promise<{ version: string }>
  /** Refetch the server copy after a 409/412. */
  refetchServer?: () => Promise<{ body: string; raw: TServer; version: string }>
  maxLength?: number
  /** When true (read-only week), never schedule or flush writes. */
  disabled?: boolean
}

export function useAutosave<TServer = unknown>(options: AutosaveOptions<TServer>) {
  const { userId, fieldKey, serverBody, version, debounceMs = 500, save, refetchServer, maxLength, disabled = false } = options
  const [value, setValue] = useState(() => loadRecoveryDraft(userId, fieldKey)?.body ?? serverBody)
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [conflict, setConflict] = useState<ConflictInfo<TServer> | undefined>(undefined)

  const valueRef = useRef(value)
  valueRef.current = value
  const serverRef = useRef(serverBody)
  const versionRef = useRef(version)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveRef = useRef(save)
  saveRef.current = save
  const refetchRef = useRef(refetchServer)
  refetchRef.current = refetchServer
  const conflictRef = useRef(conflict)
  conflictRef.current = conflict
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  // Adopt a newer server baseline (text + version) only when the editor is
  // clean: no pending local edits, no recovery draft, no open conflict.
  // Write-acknowledged versions live in versionRef and must never be
  // clobbered by a stale prop on re-render (that would resend If-Match with
  // the old version and loop on 412).
  useEffect(() => {
    if (conflictRef.current) return
    if (valueRef.current !== serverRef.current) return
    if (loadRecoveryDraft(userId, fieldKey)) return
    serverRef.current = serverBody
    versionRef.current = version
    setValue(serverBody)
  }, [serverBody, version, userId, fieldKey])

  const persist = useCallback(
    async (body: string): Promise<boolean> => {
      if (maxLength !== undefined && body.length > maxLength) return false
      if (body === serverRef.current && !loadRecoveryDraft(userId, fieldKey)) {
        setState((previous) => (previous === 'idle' ? previous : 'saved'))
        return true
      }
      setState('saving')
      setError(undefined)
      let ok = false
      const task = chainRef.current.then(async () => {
        try {
          const result = await saveRef.current(body, versionRef.current)
          versionRef.current = result.version
          serverRef.current = body
          clearRecoveryDraft(userId, fieldKey)
          setConflict(undefined)
          setState('saved')
          reportTelemetry({ event: 'autosave_succeeded' })
          ok = true
        } catch (failure) {
          saveRecoveryDraft({ userId, fieldKey, body, version: versionRef.current ?? '', updatedAt: new Date().toISOString() })
          if (failure instanceof ApiError && failure.isVersionConflict) {
            let serverCopy: TServer | undefined
            let freshVersion: string | undefined
            let freshBody = ''
            try {
              const refetched = await refetchRef.current?.()
              serverCopy = refetched?.raw
              freshVersion = refetched?.version
              freshBody = refetched?.body ?? ''
              if (freshVersion) versionRef.current = freshVersion
            } catch {
              // Keep the local text; the conflict UI still offers retry.
            }
            setConflict({ localBody: body, serverCopy, version: freshVersion })
            setState(freshBody === body ? 'failed' : 'conflict')
            reportTelemetry({ event: 'autosave_conflict', status: failure.status, code: failure.code, requestId: failure.requestId })
          } else if (failure instanceof ApiError && (failure.code === 'OFFLINE' || failure.status === 0)) {
            setState('offline')
            reportTelemetry({ event: 'offline_detected' })
          } else {
            setState('failed')
            setError(failure instanceof ApiError ? failure.message : 'We couldn\u2019t save your changes. Please try again.')
            reportTelemetry({
              event: 'autosave_failed',
              status: failure instanceof ApiError ? failure.status : undefined,
              code: failure instanceof ApiError ? failure.code : undefined,
              requestId: failure instanceof ApiError ? failure.requestId : undefined,
            })
          }
          ok = false
        }
      })
      chainRef.current = task.then(
        () => undefined,
        () => undefined,
      )
      await task
      return ok
    },
    [fieldKey, maxLength, userId],
  )

  // Debounced autosave on local edits. Read-only weeks never persist.
  useEffect(() => {
    if (disabled) return
    if (value === serverRef.current) return
    if (maxLength !== undefined && value.length > maxLength) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void persist(valueRef.current)
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, debounceMs, maxLength, persist, disabled])

  // Flush on unmount so the debounce never drops the last keystrokes.
  useEffect(
    () => () => {
      if (disabledRef.current) return
      if (timerRef.current) clearTimeout(timerRef.current)
      const pending = valueRef.current
      if (pending !== serverRef.current && (maxLength === undefined || pending.length <= maxLength)) {
        void persist(pending)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** Explicit Save: cancel the debounce and flush now (no-op when disabled). */
  const flush = useCallback(async (): Promise<boolean> => {
    if (disabledRef.current) return true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    return persist(valueRef.current)
  }, [persist])

  /** Retry with the fresh version after the user reconciles a conflict. */
  const retryWithVersion = useCallback(
    async (reconciledBody: string): Promise<boolean> => {
      setValue(reconciledBody)
      valueRef.current = reconciledBody
      return persist(reconciledBody)
    },
    [persist],
  )

  const setLocalValue = useCallback((next: string) => {
    setConflict(undefined)
    if (state === 'conflict' || state === 'failed' || state === 'offline') setState('idle')
    setValue(next)
  }, [state])

  return { value, setValue: setLocalValue, state, error, conflict, flush, retryWithVersion }
}
