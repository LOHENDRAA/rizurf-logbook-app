/**
 * User-scoped recovery drafts for unsynced edits only.
 *
 * Only text the server has not yet acknowledged is kept here, keyed by
 * user + field. Entries are deleted on successful sync and wiped on logout.
 * Never stores passwords, tokens, or server snapshots.
 */

export interface RecoveryDraft {
  userId: string
  fieldKey: string
  body: string
  version: string
  updatedAt: string
}

const PREFIX = 'portal-recovery-draft:'

/** In-memory fallback when Web Storage is unavailable (never persists). */
const memoryFallback = new Map<string, string>()

function storage(): Storage | undefined {
  try {
    const store = window.localStorage
    // Touch it: some environments expose the property but throw on access.
    if (!store || typeof store.getItem !== 'function') return undefined
    return store
  } catch {
    return undefined
  }
}

export function draftKey(userId: string, fieldKey: string): string {
  return `${PREFIX}${userId}:${fieldKey}`
}

/** Persist an unsynced field value (best effort; quota failures are ignored). */
export function saveRecoveryDraft(draft: RecoveryDraft): void {
  const serialized = JSON.stringify(draft)
  const store = storage()
  if (!store) {
    memoryFallback.set(draftKey(draft.userId, draft.fieldKey), serialized)
    return
  }
  try {
    store.setItem(draftKey(draft.userId, draft.fieldKey), serialized)
  } catch {
    // Recovery is opportunistic; autosave retries keep the authoritative copy.
  }
}

/** Read a recovery draft for this user + field. */
export function loadRecoveryDraft(userId: string, fieldKey: string): RecoveryDraft | undefined {
  const store = storage()
  try {
    const raw = store
      ? store.getItem(draftKey(userId, fieldKey))
      : (memoryFallback.get(draftKey(userId, fieldKey)) ?? null)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<RecoveryDraft>
    if (typeof parsed.body !== 'string' || typeof parsed.version !== 'string') return undefined
    if (parsed.userId !== userId || parsed.fieldKey !== fieldKey) return undefined
    return parsed as RecoveryDraft
  } catch {
    return undefined
  }
}

/** Delete the draft once the server has acknowledged the write. */
export function clearRecoveryDraft(userId: string, fieldKey: string): void {
  const store = storage()
  memoryFallback.delete(draftKey(userId, fieldKey))
  if (!store) return
  try {
    store.removeItem(draftKey(userId, fieldKey))
  } catch {
    // Best effort.
  }
}

/** Wipe every recovery draft for a user (logout, account switch). */
export function clearAllRecoveryDrafts(userId: string): void {
  const prefix = `${PREFIX}${userId}:`
  for (const key of [...memoryFallback.keys()]) {
    if (key.startsWith(prefix)) memoryFallback.delete(key)
  }
  const store = storage()
  if (!store) return
  try {
    const doomed: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (key && key.startsWith(prefix)) doomed.push(key)
    }
    for (const key of doomed) store.removeItem(key)
  } catch {
    // Best effort.
  }
}

/** Field-key helpers so editors share one naming scheme. */
export function dailyFieldKey(weekNumber: number, date: string): string {
  return `daily:${weekNumber}:${date}`
}

export function weeklyFieldKey(weekNumber: number): string {
  return `weekly:${weekNumber}`
}
