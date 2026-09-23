/**
 * Validated environment configuration.
 *
 * - `VITE_API_BASE_URL`: same-origin default (''), else an explicit https URL.
 * - `VITE_APP_ENV`: dev | staging | production (defaults by Vite mode).
 * - `VITE_ENABLE_MSW`: mock service worker for dev/test only. Production
 *   builds refuse to enable it (fail-closed).
 */

export type AppEnv = 'development' | 'test' | 'staging' | 'production'

export interface EnvConfig {
  apiBaseUrl: string
  appEnv: AppEnv
  enableMsw: boolean
  isProduction: boolean
  /** True when the app should talk to /api/v1 instead of the local prototype store. */
  useApi: boolean
}

function readViteEnv(): Record<string, string | undefined> {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
    return meta.env ?? {}
  } catch {
    return {}
  }
}

export function resolveEnv(source?: Record<string, string | undefined>): EnvConfig {
  const raw = source ?? readViteEnv()
  const mode = (raw.MODE ?? raw.VITE_APP_ENV ?? 'development').toLowerCase()
  const appEnv: AppEnv =
    mode === 'production' || mode === 'prod' ? 'production'
    : mode === 'staging' ? 'staging'
    : mode === 'test' ? 'test'
    : 'development'
  const isProduction = appEnv === 'production'

  const apiBaseUrl = (raw.VITE_API_BASE_URL ?? '').trim()
  if (apiBaseUrl !== '' && !/^https?:\/\/[^/]+/i.test(apiBaseUrl)) {
    throw new Error('Invalid VITE_API_BASE_URL: expected "" (same-origin) or an absolute http(s) URL.')
  }
  if (isProduction && apiBaseUrl !== '' && !/^https:\/\//i.test(apiBaseUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(apiBaseUrl)) {
    throw new Error('Invalid VITE_API_BASE_URL for production: expected an https URL or same-origin ("").')
  }

  const mswRequested = (raw.VITE_ENABLE_MSW ?? '').toLowerCase() === 'true'
  if (mswRequested && isProduction) {
    // Fail closed: the mock server must never run in production.
    throw new Error('VITE_ENABLE_MSW must be false in production builds.')
  }
  const enableMsw = mswRequested && !isProduction

  return {
    apiBaseUrl,
    appEnv,
    enableMsw,
    isProduction,
    useApi: apiBaseUrl !== '' || isProduction || appEnv === 'staging',
  }
}

let cached: EnvConfig | undefined

/** Validated, memoized env for app code. Throws on invalid production config. */
export function getEnv(): EnvConfig {
  cached ??= resolveEnv()
  return cached
}

/** Test-only reset for the memoized config. */
export function __resetEnvCache(): void {
  cached = undefined
}
