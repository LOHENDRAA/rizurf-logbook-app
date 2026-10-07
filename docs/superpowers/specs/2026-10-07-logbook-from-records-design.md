# Logbook from your records — design

Date: 2026-10-07. Status: agreed in chat, awaiting spec review.

This is piece 3 of 5 in rebuilding the logbook around the features of "Claude- journal prototype.html". Pieces 1 (Today and Journal) and 2 (AI organising) are merged. The look stays the current Rizurf one (Styles.md), with the gateway's dark mode.

## What it does

- Logbook interns get a **Logbook** list of their weeks, showing sources, status and a next step.
- Each week's template boxes fill from the week's **accepted Activities and Learning**, or from the journal when there are none.
- When a supervisor sends a week back, the **original submission is kept**:
  - the intern can see what they sent;
  - the supervisor sees which boxes changed.

## Decisions

- **Fill by type (option A):**
  - Day boxes take the day's journal text.
  - Weekly answer boxes take the week's accepted items: Learning (and Skills) for learning-type boxes, Activities for the rest.
  - With no accepted items of that kind, a box falls back to the journal text.
- **Revisions are shown side by side (option A):**
  - the intern gets a read-only "Your submitted version" panel;
  - the supervisor gets a "Changed since the last submission" card.
  - There is no list of old versions in the history.
- **A list first (option A):** "Logbook builder" becomes "Logbook", a list of weeks; the builder becomes the week page.
- **Storage (approach 1):** every Submit in a week's history carries a copy of the answers sent. There is no new table, store or endpoint.
- **Unchanged:**
  - only a draft fills itself;
  - the intern's edits are never overwritten;
  - a sent-back week keeps its submitted answers until the intern pulls again;
  - "Pull from journal", "Journal changed — pull again" and ✨ Summarize week keep working;
  - journal-only interns and supervisors are not affected.

## Pages

### Logbook (`/logbook`, logbook interns)

The sidebar link "Logbook builder" becomes **Logbook**.

There is one row per week of the internship, newest first. Each row has:

- **Week:** "Week 10", with the dates ("5 – 9 Oct").
- **Sources:** "4 days · 6 activities · 3 learning", counting:
  - the week's workdays that have a journal entry;
  - the accepted Activities on those days;
  - the accepted Learning points on those days.
  "0 days" is shown as written.
- **Status:** the existing badge (Draft, Submitted, Changes requested, Approved).
- **A link** to `/logbook/:periodKey`:
  - "Continue" for a draft;
  - "Revise" for a week with changes requested;
  - "View" for a submitted or approved week.

A week that hasn't started yet (its start date is after today) shows "Starts 12 Oct" in place of the link.

`/student/builder` and `/student/builder/:periodKey` redirect to `/logbook` and `/logbook/:periodKey`.

### A week (`/logbook/:periodKey`): today's builder, changed

- **Header:**
  - The week dropdown is removed.
  - The page starts with "← Logbook" and the title "Week 10 · 5 – 9 Oct" with its status badge.
  - The buttons stay: Pull from journal, ✨ Summarize week, Preview & submit.
  - An unknown period key goes to the current week, as the builder does now.
- **Box tags.** Each day or weekly box shows where its text came from:
  - "From N accepted activities" or "From N learning points", while it still holds exactly what was filled from those items;
  - "From journal", while it still holds what was filled from the journal;
  - "Edited by you", once the intern has changed it.
  This replaces today's "from journal" tag. The test id `from-notepad` stays on both "From …" tags.
- **History card** (under the form; test id `history`):
  - Submitted, Changes requested (with the comment), Resubmitted and Approved, oldest first, each with who and when.
  - A second and later Submit reads "Resubmitted".
  - The list is the same component the supervisor's review page uses.
  - With no history it reads "Not submitted yet."
- **Sent back for changes:**
  - The supervisor's comment banner stays.
  - A folded **"Your submitted version · 9 Oct"** panel (test id `submitted-version`) opens to a read-only template preview of the latest submit's copy, with the cover fields applied.
  - Under the form: "Your original submission stays as it was. Your supervisor gets this revision when you resubmit."
  - With no copy (a demo week submitted before this change), the panel isn't shown.

### Supervisor review page

A resubmitted week gets a **"Changed since the last submission"** card (test id `changes`). Only weeks with at least two submits that both have copies get the card.

- Each box whose answer differs from the previous submit's copy is listed by label (test id `changed-box`).
- Each label opens to "Before" and "Now".
- A box missing from one copy counts as empty.
- With no differences, the card reads "Resubmitted with no changes."

## Filling rules

A weekly answer box is a placeholder with binding `period` that isn't a cover field. Its **kind** is:

- **learning**, when its label matches `/learn|knowledge|skill|lesson/i`;
- **activity**, otherwise.

The week's accepted items are those in `journal.org` on the period's workdays with status `accepted`, taken in date order.

| Box | Filled from | Text |
| --- | --- | --- |
| Day (`daily`) | that day's journal text | as now |
| Date (`date`) | the period's dates | as now |
| Weekly, activity kind | accepted activities | one line per activity: `• Built the login page` |
| Weekly, learning kind | accepted learning points, then skills | one line per learning point: `• …`. When there are accepted skills, a last line `Skills: A, B`, with names de-duplicated ignoring case and the first spelling kept. |
| Weekly, any kind, with none of its items | the journal | today's day-by-day bullets |

A learning box with skills but no learning points shows just the `Skills: …` line.

## Data

- **`ReviewAction` gains `values?: Record<string, string>`.** It is set only on `submit` actions: a copy of the fill's values at the moment of submitting (cover fields are kept in `Student.coverValues` and aren't included).
  - `submitFill` sets it.
  - `IdbRepository.addAction` stores it as is.
  - IndexedDB stays at version 4.
- **`HttpRepository`** maps `history[].values` into `ReviewAction.values`.

## Server (appv3 backend)

- `PortalResources::history` adds `values` to each submit line: the submission's `submitted_body` decoded as a JSON object of strings. A body that isn't one gives `{}`.
- The intern's logbook and the supervisor's view both use this history.
  - These are copies of what was submitted, so supervisors see nothing beyond what they were sent.
  - The supervisor rule from piece 1 (no `values` before a submit, no `autofilled`) stays.
- `openapi.json`: `history[].values` is added to the outputs of the week and logbook reads.
- No migration and no new route.

## Core helpers (`src/core`, no Vue)

- `boxKind(ph): 'activity' | 'learning'`, from the label rule.
- `sourceValue(ph, period, notes, org?)`:
  - with `org`, a weekly box follows the table above;
  - without it, it behaves exactly as now.
  `autofill(…, org?)` passes `org` through.
- `boxSource(ph, period, notes, org): { from: 'activity' | 'learning' | 'journal'; count: number } | null` gives the tag text; it is `null` for boxes autofill never fills.
- `weekSources(period, notes, org): { days, activities, learning }` gives the list's counts.
- `changedSince(before, now, placeholders): Placeholder[]` lists the non-cover, non-signature boxes whose trimmed text differs.

## Tests

- **Unit:**
  - `boxKind` on APU-style labels ("Type & Objective…" is activity; "Content: … knowledge, skills…" is learning);
  - `sourceValue`:
    - activity bullets;
    - learning bullets plus the Skills line (de-duplicated);
    - only the Skills line;
    - falls back to the journal;
    - waiting and rejected items are ignored;
  - autofill keeps the intern's edits when the source changes;
  - `boxSource` counts;
  - `weekSources`;
  - `changedSince`, including missing keys and whitespace;
  - `submitFill` stores a copy;
  - the HTTP mapping of `history[].values`.
- **Server:**
  - submit history lines carry their answers, for the intern and the supervisor;
  - a body that isn't a map gives `{}`;
  - the openapi test stays green.
- **End-to-end** (demo build):
  - The Logbook list shows each week's sources, status and link, and an upcoming week shows "Starts …".
  - A draft week's activity box fills from accepted activities and shows "From N accepted activities"; editing it shows "Edited by you".
  - Submit, have the supervisor request changes, then revise: the "Your submitted version" panel shows the original text, and the History card lists both.
  - Resubmit: the supervisor's review shows the "Changed" card listing the edited box.
  - `/student/builder/...` redirects.
  - The existing flow, builder, export and overview specs pass, updated only for the new navigation.

## Out of scope

- A list of old versions in the history (option C).
- Choosing a box's source by hand (option B).
- The prototype's admin template mapping.
