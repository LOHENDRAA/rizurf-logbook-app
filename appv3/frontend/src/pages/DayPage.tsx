import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { formatWeekdayName, getProgrammeDate, isValidDateString } from '../domain/dates'
import { findOwningEntry, getAvailableDateRange, isDateAvailable, isWeekday } from '../domain/daily'
import { getWeekAvailability } from '../domain/internship'
import { useApp } from '../state/AppContext'
import { useOptionalSession } from '../state/sessionContext'
import { ManagedDailyEditor, apiSummaryToEntry, useManagedJournal } from '../features/journal/managedEditors'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Weekend picks: daily logs are only available Monday to Friday. */
export const WEEKDAY_ONLY_MESSAGE = 'Daily logs are only available Monday to Friday.'
/** Future or locked-week picks: the log cannot be opened yet. */
export const DAILY_LOCKED_MESSAGE = 'This daily log is locked.'
/** Picks with no owning journal week (outside the schedule). */
export const NO_DAILY_FOR_DATE_MESSAGE = 'No daily log is available for this date.'
/** Empty or malformed date input. */
export const INVALID_DAILY_DATE_MESSAGE = 'Select a valid daily log date.'

export function DayPage() {
  useDocumentTitle('Daily log')
  const { currentInternship: legacyInternship, currentJournal: legacyJournal, updateDailyBody, saveDailyNow } = useApp()
  const session = useOptionalSession()
  const managed = session?.managed ?? false
  const journalLoad = useManagedJournal(null, managed)
  const { date } = useParams()
  const navigate = useNavigate()
  // App-controlled rejection message: the native popup alone is unreliable
  // (it can be dismissed before it is ever visible), so rejected picks also
  // render an inline alert below the date field.
  const [dateError, setDateError] = useState<string | null>(null)
  // Remount nonce for the date input: React wipes an imperative `.value`
  // assignment made in a blur handler on the next render of a controlled
  // input, so rejection remounts the field to declaratively restore the
  // route date. Only rejection bumps this (never typing), so focus is kept
  // while entering a date.
  const [restoreNonce, setRestoreNonce] = useState(0)
  // Draft date text: keyboard segment-by-segment typing must not be clobbered
  // by the controlled route `value` mid-edit and must not validate or
  // navigate until committed (Enter or blur). `draft` holds the in-progress
  // field text; the route `date` param remains the source of truth.
  const [draft, setDraft] = useState(date ?? '')
  // Keyboard-vs-picker signal for native `type="date"`: Chrome exposes a
  // technically complete ISO value after changing only one segment, and
  // React 19 surfaces both picker picks and keystrokes as onChange. A picker
  // selection fires input/change with no preceding keydown, while segment
  // typing always produces keydown events first, so any keydown that could
  // edit the field arms deferred-commit mode (consumed on commit). Picker
  // changes with the flag clear commit immediately. Over-marking is fail-safe
  // (deferred commit still lands on Enter/blur); under-marking would
  // reintroduce premature navigation, so only non-editing keys (Tab, Escape,
  // pure modifiers, function keys) leave the flag clear.
  const keyboardEditingRef = useRef(false)
  // A new route date (picker success, link, browser Back) clears any stale
  // rejection message from the previous log and resets the draft/keyboard flag.
  useEffect(() => {
    setDateError(null)
    setDraft(date ?? '')
    keyboardEditingRef.current = false
  }, [date])

  // Managed mode sources structure (internship + week ranges) from the API;
  // unmanaged mode keeps the legacy local store. Guards below operate on
  // whichever source is active, preserving identical validation.
  if (managed && !session?.user) return <Navigate to="/login" replace />
  if (managed && journalLoad.status === 'loading') {
    return <div className="splash"><span className="brand-mark">R</span><p>Loading daily log…</p></div>
  }
  if (managed && (journalLoad.status === 'error' || !journalLoad.internship || !journalLoad.weeks)) {
    if (journalLoad.notFound) return <Navigate to="/journal" replace />
    return (
      <div className="simple-sheet">
        <div className="form-error" role="alert">{journalLoad.error ?? 'The request could not be completed. Please try again.'}</div>
        <div className="editor-actions day-actions">
          <div>
            <button className="button primary" type="button" onClick={() => journalLoad.reload()}>Retry</button>
          </div>
        </div>
      </div>
    )
  }
  const currentInternship = managed ? journalLoad.internship : legacyInternship
  const journalEntries = managed
    ? (journalLoad.weeks ?? []).map(apiSummaryToEntry)
    : legacyJournal?.entries

  if (!currentInternship || !journalEntries) return <Navigate to="/journal" replace />
  if (!date || !isValidDateString(date)) return <Navigate to="/journal" replace />

  const programmeToday = getProgrammeDate(new Date(), currentInternship.programmeTimeZone)
  // Owning week is range-based (not stored membership): missing-but-valid
  // weekdays open as an empty editor and are created on first edit. Legacy
  // invalid stored logs (weekends, out-of-range) have no valid owning week
  // or fail availability, so they redirect.
  const owning = findOwningEntry(journalEntries, date)
  if (!owning || !isDateAvailable(date, owning, programmeToday)) return <Navigate to="/journal" replace />
  const day = !managed ? (owning.dailyEntries ?? []).find((candidate) => candidate.date === date) : undefined
  const range = getAvailableDateRange(journalEntries, programmeToday)

  // Every available daily log stays editable regardless of weekly
  // submission state; future days and locked weeks are rejected above
  // (direct URLs redirect) and below (picker attempts show native errors).
  // Text autosaves; Save forces an immediate write with no
  // feedback, including empty text. First edit lazily creates the daily entry.

  const reject = (input: HTMLInputElement, message: string) => {
    // Invalid picks are rejected after selection: show the inline alert
    // plus the native popup, stay on the current log and restore the route
    // date, no navigation. Custom validity is NOT cleared here (that would
    // dismiss the popup before it shows); it clears on the next input.
    // The remount (nonce bump) performs the visible restore declaratively;
    // the draft reset keeps the remounted controlled value on the route date.
    setDateError(message)
    setDraft(date ?? '')
    setRestoreNonce((nonce) => nonce + 1)
    input.setCustomValidity(message)
    input.reportValidity()
    input.value = date ?? ''
  }

  const validateCompleteDate = (input: HTMLInputElement, next: string): boolean => {
    if (!isValidDateString(next)) {
      reject(input, INVALID_DAILY_DATE_MESSAGE)
      return false
    }
    let weekday = false
    try {
      weekday = isWeekday(next)
    } catch {
      reject(input, INVALID_DAILY_DATE_MESSAGE)
      return false
    }
    if (!weekday) {
      reject(input, WEEKDAY_ONLY_MESSAGE)
      return false
    }
    const nextOwning = findOwningEntry(journalEntries ?? [], next)
    if (!nextOwning) {
      reject(input, NO_DAILY_FOR_DATE_MESSAGE)
      return false
    }
    if (next > programmeToday || getWeekAvailability(nextOwning, programmeToday) === 'locked') {
      reject(input, DAILY_LOCKED_MESSAGE)
      return false
    }
    return true
  }

  const commitDate = (input: HTMLInputElement, value: string) => {
    // Single commit path for Enter, blur, and the immediate picker path.
    // Consumes the keyboard-editing flag so one commit covers multi-keystroke
    // edits. Empty/malformed drafts stay on the current log with the INVALID
    // message; complete-but-disallowed dates keep their specific messages;
    // valid available dates clear errors and push to the next log.
    keyboardEditingRef.current = false
    if (!value || !isValidDateString(value)) {
      reject(input, INVALID_DAILY_DATE_MESSAGE)
      return
    }
    if (!validateCompleteDate(input, value)) return
    input.setCustomValidity('')
    setDateError(null)
    setDraft(value)
    // Same-date commit (typed then reverted): clear state, no duplicate push.
    if (value !== date) navigate(`/journal/days/${value}`)
  }

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    // Keyboard in-progress edit: hold the draft, clear stale errors, and
    // never validate or navigate mid-typing — even for complete-looking ISO
    // values produced by changing only one segment.
    if (keyboardEditingRef.current) {
      setDraft(next)
      event.target.setCustomValidity('')
      setDateError(null)
      return
    }
    setDraft(next)
    if (!next) {
      // Incomplete typing: native date inputs expose partial input as an
      // empty string, so never error, restore, or navigate mid-typing.
      // Just clear stale errors and leave the field as-is.
      event.target.setCustomValidity('')
      setDateError(null)
      return
    }
    // Picker selection (no preceding keyboard activity): validate + navigate
    // immediately without requiring Enter/blur.
    commitDate(event.target, next)
  }

  const handleDateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Commit the typed draft; no <form> wraps the field so there is no
      // submit to suppress beyond preventing default field behavior.
      event.preventDefault()
      commitDate(event.currentTarget, event.currentTarget.value)
      return
    }
    // Tab moves focus (blur commits); Escape/modifiers/function keys do not
    // edit date segments, so they leave picker-immediacy intact.
    if (event.key === 'Tab' || event.key === 'Escape') return
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return
    if (event.key === 'CapsLock' || event.key === 'NumLock' || event.key === 'ScrollLock') return
    if (event.key !== undefined && event.key !== null && /^F\d{1,2}$/.test(event.key)) return
    keyboardEditingRef.current = true
  }

  const handleDateBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.target.value
    // Untouched field still showing the route date: nothing to commit.
    if (!keyboardEditingRef.current && next === date) return
    // Reverted to the route date mid-edit: clear state, no duplicate push.
    if (next === date) {
      keyboardEditingRef.current = false
      event.target.setCustomValidity('')
      setDateError(null)
      setDraft(date ?? '')
      return
    }
    // Focus loss commits the typed draft (valid navigates, anything else
    // rejects with the INVALID or specific message and restores).
    commitDate(event.target, next)
  }

  return (
    <div className="simple-sheet">
      <Link className="back-link" to={`/journal/weeks/${owning.weekNumber}`}><ArrowLeft size={15} /> Back</Link>
      <PageHeading title="Daily Log" description={formatWeekdayName(date)} />
      <section className="card editor-card simple-sheet-card">
        <label className="simple-field day-date-field">
          Date:
          <input
            type="date"
            aria-label="Date"
            value={draft}
            key={`${date}:${restoreNonce}`}
            min={range?.min}
            max={range?.max}
            onInput={(event) => {
              event.currentTarget.setCustomValidity('')
              setDateError(null)
            }}
            onChange={handleDateChange}
            onKeyDown={handleDateKeyDown}
            onBlur={handleDateBlur}
          />
        </label>
        {dateError && <p role="alert" className="form-error">{dateError}</p>}
        {managed && session?.user ? (
          <ManagedDailyEditor weekNumber={owning.weekNumber} date={date} userId={session.user.id} />
        ) : (
          <>
            <textarea
              aria-label={`Daily log for ${date}`}
              value={day?.body ?? ''}
              onChange={(event) => {
                updateDailyBody(currentInternship.id, owning.weekNumber, date, event.target.value)
              }}
              rows={10}
            />
            <div className="editor-actions day-actions">
              <div>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => saveDailyNow()}
                >
                  <Save size={16} /> Save
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
