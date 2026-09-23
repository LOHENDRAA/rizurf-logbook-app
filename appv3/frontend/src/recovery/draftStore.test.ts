import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllRecoveryDrafts,
  clearRecoveryDraft,
  dailyFieldKey,
  loadRecoveryDraft,
  saveRecoveryDraft,
  weeklyFieldKey,
} from './draftStore'

describe('recovery draft store', () => {
  beforeEach(() => {
    clearAllRecoveryDrafts('u1')
    clearAllRecoveryDrafts('u2')
  })

  it('round-trips a user-scoped unsynced draft and deletes it on sync', () => {
    saveRecoveryDraft({ userId: 'u1', fieldKey: weeklyFieldKey(2), body: 'unsynced', version: 'v-1', updatedAt: 't' })
    expect(loadRecoveryDraft('u1', weeklyFieldKey(2))?.body).toBe('unsynced')
    // Another user cannot read it.
    expect(loadRecoveryDraft('u2', weeklyFieldKey(2))).toBeUndefined()
    clearRecoveryDraft('u1', weeklyFieldKey(2))
    expect(loadRecoveryDraft('u1', weeklyFieldKey(2))).toBeUndefined()
  })

  it('wipes every draft for a user on logout without touching others', () => {
    saveRecoveryDraft({ userId: 'u1', fieldKey: dailyFieldKey(1, '2026-08-04'), body: 'a', version: 'v', updatedAt: 't' })
    saveRecoveryDraft({ userId: 'u1', fieldKey: weeklyFieldKey(1), body: 'b', version: 'v', updatedAt: 't' })
    saveRecoveryDraft({ userId: 'u2', fieldKey: weeklyFieldKey(1), body: 'c', version: 'v', updatedAt: 't' })
    clearAllRecoveryDrafts('u1')
    expect(loadRecoveryDraft('u1', weeklyFieldKey(1))).toBeUndefined()
    expect(loadRecoveryDraft('u1', dailyFieldKey(1, '2026-08-04'))).toBeUndefined()
    expect(loadRecoveryDraft('u2', weeklyFieldKey(1))?.body).toBe('c')
  })

  it('rejects cross-user payloads', () => {
    // A draft filed under another user is never returned for this user.
    saveRecoveryDraft({ userId: 'intruder', fieldKey: 'weekly:1', body: 'x', version: 'v', updatedAt: 't' })
    expect(loadRecoveryDraft('u1', 'weekly:1')).toBeUndefined()
    expect(loadRecoveryDraft('intruder', 'weekly:1')?.body).toBe('x')
    clearAllRecoveryDrafts('intruder')
  })
})
