import { useEffect, useState } from 'react'
import { reportTelemetry } from '../observability/reporter'

/** Offline banner: edits stay local (recovery drafts) until reconnected. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)

  useEffect(() => {
    const onOffline = () => {
      setOffline(true)
      reportTelemetry({ event: 'offline_detected' })
    }
    const onOnline = () => setOffline(false)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="offline-banner" role="alert">
      You are offline. Edits are kept locally and will sync when you reconnect.
    </div>
  )
}
