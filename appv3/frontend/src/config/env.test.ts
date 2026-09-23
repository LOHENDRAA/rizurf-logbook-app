import { describe, expect, it } from 'vitest'
import { resolveEnv } from './env'

describe('env validation', () => {
  it('defaults to same-origin dev without the mock server', () => {
    const env = resolveEnv({ MODE: 'development' })
    expect(env.apiBaseUrl).toBe('')
    expect(env.enableMsw).toBe(false)
    expect(env.useApi).toBe(false)
  })

  it('enables the API path for staging/production and https enforcement', () => {
    expect(resolveEnv({ MODE: 'staging', VITE_API_BASE_URL: 'https://api.staging.example.edu' }).useApi).toBe(true)
    expect(() => resolveEnv({ VITE_APP_ENV: 'production', VITE_API_BASE_URL: 'http://api.example.edu' })).toThrow(/https/)
  })

  it('rejects absolute non-http base urls', () => {
    expect(() => resolveEnv({ MODE: 'development', VITE_API_BASE_URL: 'ftp://x' })).toThrow(/VITE_API_BASE_URL/)
  })

  it('fail-closes MSW in production', () => {
    expect(() => resolveEnv({ VITE_APP_ENV: 'production', VITE_ENABLE_MSW: 'true' })).toThrow(/MSW/)
    expect(resolveEnv({ MODE: 'development', VITE_ENABLE_MSW: 'true' }).enableMsw).toBe(true)
    expect(resolveEnv({ MODE: 'test', VITE_ENABLE_MSW: 'true' }).enableMsw).toBe(true)
  })
})
