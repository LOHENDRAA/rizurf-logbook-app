# Today and Journal — design

Date: 2026-10-07. Status: agreed in chat, awaiting spec review.

Piece 1 of 5 in rebuilding the logbook around the features of the user's "Claude- journal prototype.html". The look stays the current Rizurf one (Styles.md) with the gateway's dark mode (MICROAPP_DARK_MODE.md); only the prototype's features are taken.

## The five pieces

1. **Today and Journal** (this spec): a Today page to write today's entry, and a Journal page to find and edit past ones.
2. **AI organising:** suggestions from each entry (Activity, Learning, Skill), accepted, edited or rejected; Projects, Learning and Skills pages.
3. **Logbook from your records:** a list of weeks with status and history; revisions keep the original; the template boxes fill from accepted Activities and Learning.
4. **Progress and reflection:** Progress counts and activity grid, Weekly reflection, Search across everything.
5. **Around the edges:** notification bell, supervisor overview counts, start-up walkthrough, phone layout.

Out of all pieces: an admin role and admin template mapping (supervisors keep the template editor), and evidence file attachments.

## Decisions

- **One entry per day per person.** Writing again adds to the same day's entry.
- **Entries are private.** Only the person who wrote them can read them. Supervisors see the submitted logbook, nothing else.
- **One set of entries per person, for every role.** Logbook interns, journal-only interns and supervisors all write into the same store. For logbook interns the same entries also fill the logbook. Switching between Logbook and Journal mode never hides or loses entries.
- **Any day up to today can be written or edited at any time.** Editing a day after its week is submitted doesn't change the submitted logbook.

## Pages

### Today (`/today`), every role

- **Header:**
  - today's date, e.g. "Wednesday, 7 October";
  - for logbook interns, "Week 10 · Asia Pacific University" below it;
  - for journal-only interns, "Week 3 of your journal".
- **Writing:** the line "What happened today?" over a large writing box holding today's entry.
- **Saving:** automatic while typing, showing "Saving…" then "Saved".
- **"Need a prompt?":** shows four starter questions:
  - What did you work on?
  - What did you learn?
  - What surprised you?
  - What was difficult?

  Clicking one appends it to the entry on a new line.
- **Side cards:**
  - **This week:** "Written on N of M days". M counts this week's weekdays up to today; for interns it also stays within the internship dates.
  - **Logbook interns only:** "Logbook · Week N", that week's status (Draft, Submitted, Changes requested, Approved) and an **Open logbook** link to the builder for that week. Outside the internship dates, the card reads "The placement isn't in an active week right now."

### Journal (`/journal`), every role

- **List:**
  - a search box;
  - entries newest first, grouped under month headings ("October 2026");
  - each card shows the day ("Monday, 5 October") and the first two lines of text.
- **Search:**
  - matches the text, ignoring case, among entries already loaded;
  - with no match: "Nothing matches “…”."
  - with no entries at all: "Your journal will build here as you write."
- **Write for another day:** a native date input with `max` set to today; choosing a day opens it.

### Entry page (`/journal/:date`), every role

- The full entry for that day, editable, with the same autosave.
- A "← Journal" link back.
- An empty day shows an empty box; saving creates the entry.

### Sidebar

- **Logbook interns:** Overview, **Today**, **Journal**, Logbook builder, Export, My internship.
- **Journal-only interns:** Overview, **Today**, **Journal**, My internship.
- **Supervisors:** Templates, Review, **Today**, **Journal**.

The landing pages stay as now: Overview for interns, Templates for supervisors.

### Removed

- The Notepad (`/student/notepad`) and its week view with day cards. The route redirects to `/today`.
- The supervisor's 12-week journal view. `/journal` is now the list above.
- "Notepad for these days" on the supervisor's review page.
- Overview's Journal card button now reads **Open Today** and goes to `/today`.

## Data and server

### One store

`journal_entries` (`user_id`, `date`, `body`, unique per user and date) becomes the only place entries live. The current rules stay:

- the date is today or earlier, Malaysia time;
- the body is at most 20,000 characters;
- saving an empty body deletes the entry.

### Migration

A one-off migration:

1. For every `daily_entries` row whose body isn't blank, find the intern who owns its placement.
2. If that person has no journal entry for that date, create one with the note's text.
3. If they do, set the entry to the journal text, a blank line, then the note's text.
4. Drop `daily_entries`.

Its `down()` recreates an empty `daily_entries` table; the merge itself isn't undone. Back up the `intern_logbook` database before running it.

### Routes

- **Unchanged:**
  - `GET /journal` returns all your entries;
  - `PUT /journal/{date}` with `{ text }` saves one.
- **Removed:** `PUT me/journal/weeks/{n}/daily`.
- **Changed:** week payloads (`me/journal/weeks…`, `me/logbook`, and every supervisor endpoint) no longer contain `dailyEntries`. The server never sends one person's entries to another.
- **Simpler:** changing internship dates is no longer blocked by notes outside the new dates (`SETUP_DROPS_WORK` now only counts typed answers and submitted weeks).
- `openapi.json` follows these changes.

### Screens

- The logbook's "Pull from notepad" button becomes **Pull from journal**. It, the day boxes and Summarize week read the entries from the journal for the placement's dates, where they used to read week notes.
- **Browser-only demo (IndexedDB):**
  - the `notes` store merges into the `journal` store, in a database version upgrade, with the same rule for same-day texts;
  - the repository loses `putNote` and `listNotes`; logbook code uses the journal methods;
  - the demo data writes its sample notes into the journal.

The old screens in `appv3/frontend` aren't used any more (`intern-logbook` replaced them). They aren't kept working.

## Errors

- **A failed save:**
  - the text stays on screen with a red message, and the next keystroke tries again;
  - leaving the page with unsaved text asks first, as the Notepad does now.
- **A future date** (from the date input or typed into the address): "You can't write for a day that hasn't happened yet." Nothing is saved.
- **The journal can't load:** Today and Journal show the error message, never an empty page.

## Tests

### Server

- The migration copies notes into the right person's journal, joins same-day texts, skips blank notes, and drops the table.
- `PUT me/journal/weeks/{n}/daily` is gone.
- Week payloads have no `dailyEntries`, for the intern and for supervisors.
- Changing internship dates isn't blocked by journal entries outside the new dates.
- `PUT /journal/{date}` still refuses future days.

### Screens: unit tests

- The IndexedDB upgrade merges notes into the journal, joining same-day texts.
- Search matches text, ignoring case.
- The "Written on N of M days" count:
  - mid-week;
  - at the start and end of the internship;
  - for a journal-only intern.

### Screens: browser tests

- Writing on Today saves, and the entry shows in Journal and is found by search.
- Writing for a missed past day works, and a future day is refused.
- Editing an entry from its page saves.
- "Pull from journal" fills the logbook from journal entries.
- The supervisor's review page shows no daily notes.
- A supervisor has Today and Journal in the sidebar and can write.
- A journal-only intern who switches to Logbook finds their entries in the logbook's day boxes.
