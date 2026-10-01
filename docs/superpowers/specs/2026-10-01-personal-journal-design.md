# Personal journal — design

Date: 2026-10-01. Status: approved in chat, awaiting spec review.

## Goal

People who don't need a logbook get a private journal with a clean week-by-week view:

- interns whose university has no logbook template;
- supervisors, who get a journal of their own.

## What stays the same

Interns with a logbook template keep the Notepad exactly as it is today: it feeds the Logbook builder, and their supervisor can read it. Nothing in this design changes the Notepad, `daily_entries`, placements, weeks, reviews or badges.

## Who gets the journal

- **Supervisors:** always. A **Journal** link joins their sidebar.
- **Interns with no placement:** Onboarding gets a "My university has no logbook" choice, which asks for one date: when the internship started. Saving it sets the journal's start date. After that, the intern's sidebar shows only **Journal**: no Notepad, Logbook builder or Export.
  - An intern counts as journal-only when they have no template and a journal start date is set. The router sends them to `/journal` instead of Onboarding.
  - Such an intern has no placement, so they never appear in a supervisor's lists.

## Privacy

Only the writer can read their journal. The server has no endpoint that takes another person's id, and no supervisor, review or badge query reads the journal table.

## Screen (`/journal`)

1. **Week table** (as in the reference picture): one row per week, "Week N" and its dates, for example "3 Aug – 9 Aug". It runs from Week 1 to the current week, newest at the bottom, and future weeks aren't listed. The current week is selected when the screen opens.
2. **Day cards** for the selected week, Monday to Sunday ("Mon 3"):
   - **Logged** means the day has an entry;
   - an empty day shows no status;
   - future days are disabled;
   - the selected day is highlighted.
3. **Editor:** a textarea for the selected day.
   - Typing autosaves after 800 ms, the same debounce as the Notepad.
   - A status line shows "Saving…" then "Saved".
   - Today is selected when the screen opens.

### Week numbering (`journalWeeks(startDate, entryDates, today)`, pure function)

- Week 1 starts on the Monday of `startDate`.
- With no `startDate` (a supervisor), Week 1 starts on the Monday of the earliest entry. With no entries either, Week 1 is the current week.
- The last week is the one containing `today`.
- If `startDate` is in the future, there is one week: the current one. Days before `startDate` are still writable.

## Server (appv3 backend)

- **Migration:**
  - new table `journal_entries`: `id`, `user_id` (an FK to users that cascades on delete), `date`, `body` (`mediumText`), timestamps, unique on (`user_id`, `date`);
  - new column `users.journal_start_date`, a nullable date.
- **Endpoints** (authenticated, always the signed-in user):
  - `GET /api/v1/journal` returns `{ "startDate": "YYYY-MM-DD" | null, "entries": [{ "date", "text" }] }`, sorted by date.
  - `PUT /api/v1/journal/{date}` with `{ "text" }` saves one day.
    - Rules: `date` is a valid `Y-m-d` and not after today in the app's timezone; `text` is a string of at most 20,000 characters.
    - Empty or whitespace-only text deletes that day.
    - Returns 204.
  - `PUT /api/v1/journal` with `{ "startDate" }` (a valid date) sets the start. Returns 204.
- **Errors:** validation failures use the existing Problem format (422). Unauthenticated requests get 401, as on every other route.
- **`openapi.json`:** add the three operations.

## Browser-only demo (prototype)

- IndexedDB gains a `journal` store, keyed by [`ownerId`, `date`], where `ownerId` is the current role (the student id, or `supervisor`). The journal start date is stored in the same store under the date key `start`.
- The `Repository` interface gains three methods, implemented by both the IndexedDB and HTTP repositories:
  - `getJournal(): Promise<{ startDate: string | null; entries: { date: string; text: string }[] }>`
  - `putJournalEntry(date: string, text: string): Promise<void>`
  - `setJournalStart(date: string): Promise<void>`

## Errors in the screen

A failed save shows the usual error toast. The text stays in the box and is retried on the next keystroke, so nothing typed is lost.

## Tests

- **Backend `tests/Feature/JournalTest.php`:**
  - you can read and write your own journal;
  - a supervisor at the same company, and another intern, see only their own;
  - a future date gets 422;
  - empty text deletes the day;
  - setting the start date works;
  - a request that isn't signed in gets 401.
- **Prototype unit:** `journalWeeks` handles a start date, no start date with entries, no start date and no entries, and a start date in the future.
- **Prototype e2e:**
  - a supervisor opens Journal, writes on today's card, sees **Logged**, reloads and the text is still there;
  - an intern picks "My university has no logbook", lands on Journal, and the sidebar has no Notepad, Logbook builder or Export links.

## Out of scope

- Switching a journal-only intern to a logbook later, if their university adds a template. That intern would go back through Onboarding. Add this if it happens.
- Search, export, or AI summaries of the journal.
