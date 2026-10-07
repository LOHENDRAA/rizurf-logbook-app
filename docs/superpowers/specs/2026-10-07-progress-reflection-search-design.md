# Progress, Weekly reflection and Search — design

Date: 2026-10-07. Status: agreed in chat, awaiting spec review.

This is piece 4 of 5 in rebuilding the logbook around the features of "Claude- journal prototype.html". Pieces 1 (Today and Journal), 2 (AI organising) and 3 (Logbook from your records) are merged. The look stays the current Rizurf one (Styles.md), with the gateway's dark mode.

## What it does

- **Overview** gains progress counts and a journal activity grid.
- Interns get a private **Weekly reflection** for each week, beside a summary of what they recorded that week.
- Everyone gets **Search** from the top bar.
  - Interns search their journal, projects, learning, skills and reflections.
  - Supervisors search their own journal.

## Decisions

- **Progress goes on Overview (option A).** There is no separate Progress page.
- **Reflections are private (option A).** Only the intern sees them. They don't feed the logbook, and the supervisor never sees them.
- **Search is in the top bar for everyone (option A).** The Journal page keeps its own search box.
- **Approach 1:** everything is worked out in the browser from data the app already loads.
  - Reflections come with `GET /journal`, the way projects do.
  - One new write call saves a reflection.
  - There is no server search endpoint.
- **Left out of Overview:** the prototype's "Active projects" and "Recent learning" lists. The Projects and Learning pages already show them.

## Pages

### Overview (`/student/overview`), changed

Four count cards go under the internship heading (`data-testid="ov-count"`). Each card has a caption, a big number and a small line underneath.

| Caption | Number | Line underneath |
|---|---|---|
| JOURNAL DAYS | `written / workdays`, e.g. "23 / 28" | "workdays so far" |
| LOGBOOK (logbook interns) | "N approved" | The first non-zero of: "N changes requested", "N in review", "N draft". Empty if none. |
| PROJECTS (journal-only interns) | number of projects | "in your records" |
| ACTIVITIES | number of accepted activities | "N learning point(s)" |
| SKILLS | number of distinct accepted skills (ignoring case) | "across N project(s)" |

**Workdays so far:**
- They are the Monday–Friday dates from the start up to today, stopping at the end date.
- The start is the internship start date. For journal-only interns, it is the journal start date.
- A day counts as written when its journal text isn't blank.
- Only days in that range count, so days written before the start don't.

**Activity grid**, in a "Journal activity" card (`data-testid="ov-grid"`):
- There is one square per workday so far (`data-testid="ov-day"`), five per row (Mon–Fri), so each row is one week.
  - A first week that starts mid-week gets empty, unlabelled cells before its start day, so the columns line up.
  - A written day has the class `on` and is filled with the accent colour.
  - An unwritten day is filled with the tint colour. Both colours come from the theme tokens, so dark mode works.
- Each square has a `title` and an `aria-label` like "Mon 14 Sept · written" or "Mon 14 Sept · not written".
- Under the grid it says "23 of 28 workdays written" (`data-testid="ov-grid-caption"`).
- Before the start date, the cards and grid are hidden, and the card reads "Starts in N day(s)". The caption already says this.
- With no start date, the cards and grid are hidden.

**Logbook counts** come from `st.periods` and `st.statusOf`, counting only periods that have started (start ≤ today).

### Weekly reflection (`/reflection`, `/reflection/:week`), new, interns only

- It's a sidebar link, **Reflection**, under RECORDS, after Skills, with a new NavIcon `reflection`.
- The router treats it like Projects, Learning and Skills:
  - it is a writing page;
  - supervisors are sent to `/today`;
  - journal-only interns may use it.
- **Which week:**
  - `/reflection` opens this week's Monday.
  - `:week` is a Monday (`YYYY-MM-DD`). A date that isn't a Monday, or a week outside the allowed range, falls back to this week. The address isn't rewritten.
- **Allowed range:** from the start date's Monday to this week's Monday. If there's no start date, it starts at this week's Monday.
- **Header:** "Week of 14 Sept" (`data-testid="rf-title"`), with the Mon–Fri date range underneath.
  - ← and → buttons (`rf-prev`, `rf-next`) move one week.
  - Each is disabled at the edge of the allowed range.
- **Left card, "Your week"** (`data-testid="rf-summary"`):
  - "N journal day(s) · N activit(y|ies) · N learning point(s)". Journal days counts written days from Monday to Sunday of that week.
  - **You worked on:** the names of projects linked to that week's entries, in order of first use. This is left out if there are none.
  - **What stood out:** up to three accepted learning points from that week, oldest first. This is left out if there are none.
  - With nothing at all, the card says "Nothing recorded this week yet."
- **Right card:**
  - A textarea (`data-testid="rf-text"`) with the hint "What did you learn this week?", `maxlength` 5000.
  - A **Save reflection** button (`rf-save`), disabled while nothing has changed or a save is in progress.
  - After a save, "Saved" shows (`rf-saved`) until the next edit.
  - If a save fails, "We couldn't save your reflection. Try again." shows (`rf-error`), and the text is kept.
- **Unsaved text:** leaving the page, or moving to another week, with unsaved text asks "Leave without saving your reflection?" through the app's existing confirm dialog (`ask`). Cancel stays on the page.
- **Clearing:** saving an empty box deletes that week's reflection.

### Search (`/search?q=…`), new, everyone

- **Top bar:** a search input (`data-testid="top-search"`) with the hint "Search your experience" and `aria-label="Search your experience"`.
  - Pressing Enter goes to `/search?q=<text>`.
  - Under 640px wide, it shows only a search icon button that links to `/search`.
- **The page:**
  - A large search input (`data-testid="search-input"`) is filled from `q`.
  - Typing updates the results and replaces `q` in the address with `router.replace`, so Back leaves the page rather than stepping through every key.
- **Matching:** the trimmed query must appear in the text, ignoring case.
  - An empty query shows "Search your journal, projects, learning, skills and reflections." For supervisors it shows "Search your journal."
  - With nothing found, it shows "Nothing found for “…”." (`data-testid="search-empty"`)
- **Groups**, in this order (`data-testid="search-group"`, heading "Journal · 3"). An empty group is not shown.

  | Group | Searches | Result shows | Opens |
  |---|---|---|---|
  | Journal | entry text, newest first | the date and an extract | `/journal/:date` |
  | Projects | name, then description | the name, and the description if present | `/projects/:id` |
  | Learning | accepted learning points, newest first | the point, the date and the project name | `/learning` |
  | Skills | skill names, merged ignoring case as on the Skills page | the skill | `/skills/:name` |
  | Reflections | reflection text, newest week first | "Week of 14 Sept" and an extract | `/reflection/:week` |

  - Supervisors get only the Journal group.
  - Each result is a link (`data-testid="search-result"`).
- **Extract:** about 120 characters around the first match, with "…" where the text is cut.
  - The match is wrapped in `<mark>`, built from `{before, match, after}` pieces in the template. There is no `v-html`.
  - Text shorter than 120 characters is shown whole.
- **Long groups:** each group shows its first 20 results, then a "Show all N" button (`search-more`) that shows the rest.

## Data

- `model.ts`: `interface Reflection { week: string; text: string }`. `Journal` gains `reflections?: Reflection[]`.
- **Store `useJournal`:**
  - `reflections: Record<string, string>` (week → text), loaded with the journal;
  - `saveReflection(week, text)`:
    - trims the text;
    - calls the repository;
    - updates the map, removing the week when the text is empty;
    - throws on failure so the page can show the error.
- **IndexedDB goes to version 5** with a `reflections` store keyed by `[owner, week]`.
  - `IdbRepository.putReflection(owner, week, text)` puts the reflection, or deletes it when the text is empty.
  - `getJournal` returns `reflections` for that owner.
  - The upgrade from version 4 keeps all existing data.
- **`HttpRepository.putReflection(week, text)`** sends `PUT /journal/reflections/{week}` with `{text}`. `getJournal` maps `reflections`.
- **Demo data** (`demo.ts`) seeds one reflection for the demo intern's previous week.

## Server (appv3 backend)

- **Migration:** a `reflections` table with these columns:
  - `id`;
  - `user_id` (FK users, cascade delete);
  - `week_start` (date);
  - `text` (text);
  - timestamps;
  - unique (`user_id`, `week_start`).
- **Model `Reflection`:** fillable `user_id`, `week_start`, `text`. `listFor($userId)` returns `[{week, text}]`, ordered by week.
- **`PUT /journal/reflections/{week}`** (`ReflectionController@save`, same auth and throttle as the other journal writes):
  - non-interns get 403;
  - a `week` that isn't a valid `Y-m-d` Monday gets 422 (Problem envelope);
  - `text` must be a string (nullable), max 5000; anything else gets 422;
  - empty or whitespace-only text deletes the row;
  - otherwise it does `updateOrCreate` with the trimmed text;
  - success returns 204.
- **`JournalController::show`** adds `reflections`: `Reflection::listFor` for interns, `[]` for others.
- **`openapi.json`:** the new path, and `reflections` in the journal read output.

## Core helpers (`src/core`, no Vue)

- **`progress.ts`:**
  - `workdaysSoFar(start, end | null, today): string[]`;
  - `logbookCounts(periods, statusOf, today): { approved; changes; review; draft }`;
  - `recordCounts(org): { activities; learning; skills; skillProjects }`, built from `acceptedRows`/`skillStats`;
  - `gridRows(days): (string | null)[][]`, which gives Mon–Fri rows with `null` padding.
- **`reflection.ts`:**
  - `weekSummary(week, entries, org, projects): { days; activities; learning; projects: string[]; standOut: string[] }`;
  - `reflectionWeeks(start | null, today): { first; last }`;
  - `isMonday(date)`.
- **`search.ts`:**
  - `searchAll(query, data, intern: boolean): Group[]`;
  - `excerpt(text, query, width = 120): { before; match; after }`;
  - it reuses `searchEntries`, `acceptedRows`, `skillStats` and `nameKey`.

## Tests

- **Unit:**
  - `workdaysSoFar`: skips weekends, stops at the end date and at today, and gives an empty list before the start;
  - `gridRows` padding for a mid-week start;
  - `logbookCounts` ignores periods that haven't started;
  - `recordCounts` merges skills ignoring case;
  - `weekSummary`, including an empty week and the cap of three for "stood out";
  - `reflectionWeeks` and `isMonday`;
  - `searchAll`:
    - matching ignores case;
    - group order;
    - only accepted learning;
    - the supervisor gets the Journal group only;
    - empty groups are left out;
  - `excerpt`: text cut at both ends, short text, and a match at the start;
  - the store's `saveReflection`, including an empty text removing the week;
  - the IDB `putReflection` round trip, the empty delete, and the upgrade from version 4 keeping data;
  - the HTTP `putReflection` and the `reflections` mapping.
- **Server** (ReflectionsTest, PersonalJournalTest):
  - save, update and clear;
  - a supervisor gets 403;
  - a date that isn't a Monday, bad dates, and text that is too long or isn't a string get 422;
  - one intern can't see another's reflections;
  - `GET /journal` includes reflections for interns and `[]` for supervisors;
  - the openapi test stays green.
- **End-to-end** (demo build):
  - Overview shows four count cards and a grid whose written squares match the caption.
  - Reflection:
    - write and save, reload, and the text is still there;
    - move to the previous week and back;
    - unsaved text asks before leaving, and Cancel stays;
    - a supervisor going to `/reflection` lands on `/today`.
  - Search:
    - typing in the top bar and pressing Enter shows grouped results with a `<mark>`;
    - clicking a Journal result opens that day;
    - a supervisor sees only Journal results.
  - The existing specs pass, updated only for the new top bar input and the Overview additions.

## Out of scope

- The prototype's "Active projects" and "Recent learning" lists on Overview.
- Sharing reflections with supervisors, or using them in the logbook.
- A server-side search endpoint or a search index.
- The phone layout of the top bar beyond the icon button (piece 5).
