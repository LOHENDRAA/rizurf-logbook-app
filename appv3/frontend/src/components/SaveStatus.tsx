import type { SaveState } from '../features/journal/useAutosave'

const LABEL: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Save failed — retry',
  conflict: 'Conflict — compare and retry',
  offline: 'Offline — edits kept locally',
}

/** Visible autosave state for debounced editors. */
export function SaveStatus({ state, requestId }: { state: SaveState; requestId?: string }) {
  if (state === 'idle') return null
  return (
    <p className={`save-state save-state-${state}`} role="status" aria-live="polite">
      {LABEL[state]}
      {requestId && (state === 'failed' || state === 'conflict') ? ` (ref ${requestId})` : ''}
    </p>
  )
}
