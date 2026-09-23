import { useEffect } from 'react'

/** Sets document.title per route; restores the default on unmount. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · Rizurf Logbook System`
    return () => {
      document.title = previous
    }
  }, [title])
}
