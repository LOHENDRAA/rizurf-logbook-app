/**
 * Session provider: boots the app from the server session (`GET /me`) over
 * the Sanctum cookie session. No tokens or passwords touch JavaScript.
 *
 * - When the API is not configured (local dev without a backend), the
 *   session stays unauthenticated and the legacy local store owns the UI.
 * - `portal:unauthorized` events from the API client flip `reauthNeeded`
 *   without discarding editor state; callers keep drafts and resume after
 *   `login()` succeeds.
 * - Logout clears the query cache and all user-scoped recovery drafts.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getEnv } from '../config/env'
import { ApiError } from '../api/errors'
import { getMe, login as apiLogin, logout as apiLogout, type SessionUser } from '../api/portal'
import { clearAllRecoveryDrafts } from '../recovery/draftStore'
import { reportTelemetry } from '../observability/reporter'

export type SessionStatus = 'booting' | 'authenticated' | 'anonymous'

interface SessionContextValue {
  user: SessionUser | undefined
  status: SessionStatus
  /** True when a 401 interrupted editing; drafts are preserved. */
  reauthNeeded: boolean
  login: (email: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
  /** Revalidate after the user re-authenticates; resumes pending work. */
  resumeAfterReauth: () => Promise<void>
  dismissReauth: () => void
  refresh: () => Promise<void>
  /** True when the server session is authoritative (API configured). */
  managed: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const env = useMemo(() => getEnv(), [])
  const managed = env.useApi
  const [user, setUser] = useState<SessionUser | undefined>(undefined)
  const [status, setStatus] = useState<SessionStatus>(managed ? 'booting' : 'anonymous')
  const [reauthNeeded, setReauthNeeded] = useState(false)

  const refresh = useCallback(async () => {
    if (!managed) return
    try {
      const me = await getMe()
      setUser(me)
      setStatus('authenticated')
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        setUser(undefined)
        setStatus('anonymous')
        return
      }
      // Boot stays usable offline: editors work from recovery drafts and the
      // offline banner explains the state.
      setStatus((previous) => (previous === 'authenticated' ? previous : 'anonymous'))
    }
  }, [managed])

  useEffect(() => {
    if (!managed) return
    void refresh()
  }, [managed, refresh])

  useEffect(() => {
    const onUnauthorized = () => {
      setReauthNeeded(true)
      reportTelemetry({ event: 'reauth_shown' })
    }
    window.addEventListener('portal:unauthorized', onUnauthorized)
    return () => window.removeEventListener('portal:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(
    async (email: string, password: string): Promise<SessionUser> => {
      const me = await apiLogin(email, password)
      setUser(me)
      setStatus('authenticated')
      setReauthNeeded(false)
      reportTelemetry({ event: 'reauth_completed' })
      return me
    },
    [],
  )

  const logout = useCallback(async () => {
    const userId = user?.id
    try {
      if (managed) await apiLogout()
    } catch {
      // Session cookie may already be gone; still clear local state.
    }
    if (userId) clearAllRecoveryDrafts(userId)
    queryClient.clear()
    setUser(undefined)
    setStatus('anonymous')
    setReauthNeeded(false)
  }, [managed, queryClient, user?.id])

  const resumeAfterReauth = useCallback(async () => {
    await refresh()
    setReauthNeeded(false)
  }, [refresh])

  const dismissReauth = useCallback(() => {
    setReauthNeeded(false)
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({ user, status, reauthNeeded, login, logout, resumeAfterReauth, dismissReauth, refresh, managed }),
    [user, status, reauthNeeded, login, logout, resumeAfterReauth, dismissReauth, refresh, managed],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useOptionalSession()
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}

/**
 * Non-throwing session access for components (guards, login, editors) that
 * must also render without a SessionProvider (legacy unmanaged mode and
 * existing tests). Returns null when no provider is mounted; callers fall
 * back to the legacy local store.
 */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext)
}
