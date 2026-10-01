# Intern Overview and My internship — design

Date: 2026-10-01. Status: agreed in chat, awaiting spec review. Builds on branch `notepad-weeks-prototype` (Notepad week view), which isn't merged yet.

## Goal

Interns get an **Overview** page (first reference picture) and a clearer **My internship** page (second reference picture). This applies to both logbook interns and interns without a logbook.

## Logbook or journal (chosen on My internship, changeable any time)

- **Choice:** the top of My internship shows a two-way choice:
  - **Logbook**: "Fill in my university's logbook";
  - **Journal**: "Private notes, no logbook".

  It replaces the "My university has no logbook" option in the university list. A new intern picks one before anything else.
- **Stored mode:** the intern's mode lives on their account as `users.logbook_mode`, either `'logbook'` or `'journal'`, or `null` before they choose. The app no longer infers journal mode from "no template plus a start date".
  - **Migration:** users with a `journal_start_date` and no placement get `'journal'`; everyone else stays `null`, and `null` with a placement counts as `'logbook'`.
- **Switching never deletes anything.** Each mode keeps its own data.
  - **Logbook → Journal:**
    - Notes, weeks, answers and submissions stay saved. Anything already submitted stays with the supervisor, and the intern still appears in their lists.
    - The intern now sees Overview, Journal and My internship.
    - If the journal has no start date yet, the form asks for "Started on", pre-filled with the internship start date.
  - **Journal → Logbook:**
    - The journal stays private and untouched.
    - With no placement yet, the form asks for university and dates, as today; with one, the switch is immediate and everything is as they left it.
- **Server:** `PUT /api/v1/me/mode` with `{ "mode": "logbook" | "journal" }` returns 204 and is for students only. `GET /me/logbook` returns `mode` in `student`.
- **Browser demo:** the mode is stored on the `Student` record (`mode?: 'logbook' | 'journal'`), set through a new repository method, `setMode(studentId, mode)`.
- **Journal-only check:** "journal-only" means `mode === 'journal'`. The router, sidebar and `useJournal().journalOnly` all use this one value.

## Sidebar and landing

- Logbook interns: **Overview**, Notepad, Logbook builder, Export, My internship.
- Interns without a logbook: **Overview**, Journal, My internship.
- `/` and sign-in land interns on `/student/overview`. Supervisors are unchanged.
- An intern who hasn't set up yet still goes to Onboarding first, as now. My internship's edit form is the Onboarding form.

## Data

### New fields

- **Logbook interns:** the placement's existing `position` and `programme_name` (always empty today). `PUT /me/internship` accepts `position` and `programmeName`, each an optional string of at most 120 characters. The existing setup lock is unchanged: it covers only the university and the dates, so position and programme can be changed at any time.
- **Interns without a logbook:** three new nullable `users` columns: `journal_university`, `journal_programme` and `journal_position`, each at most 120 characters. `GET /journal` returns them as `university`, `programme` and `position`. `PUT /journal` accepts them alongside `startDate`. `startDate` stays required there.

### Who the person is and who supervises them

`GET /me/logbook` gains a `profile` object, returned whether or not the intern has a placement:

```json
{
  "email": "aisha@…",
  "companyName": "Nusantara Sdn Bhd",
  "timeZone": "Asia/Kuala_Lumpur",
  "position": "Backend Intern",
  "programme": "BSc Software Engineering",
  "supervisors": [{ "name": "Sarah Lim", "email": "sarah@…" }]
}
```

- `supervisors` lists the users with the supervisor role at the intern's own company, sorted by name. It is empty with no company.
- `position` and `programme` come from the placement. With no placement, they are `null` (journal interns read theirs from `GET /journal`).
- `timeZone` is the placement's time zone, or `Asia/Kuala_Lumpur` without one.

**Privacy:** supervisors expose only their name and email, and only to interns at the same company. Nothing new is shown to supervisors.

### Browser-only demo

- `Student` gains optional `position` and `programme`; the journal gains optional `university`, `programme` and `position`.
- Company shows "—", the supervisor shows "Supervisor", the email shows "—", and the time zone shows the browser's.

## Overview (`/student/overview`)

### Logbook interns

1. **Header card:**
   - a small caption, "WEEK 3 OF 12";
   - the title: position, or the university if there's no position;
   - on the right, "3 Aug 2026 → 27 Sept 2026";
   - a progress bar, the share of internship days passed (0–100%).
   - Before the start date the caption reads "STARTS IN N DAYS"; after the end date, "FINISHED".
2. **Placement card**, with three boxes:
   - **University** / programme;
   - **Company** / position;
   - **Your supervisor** / name and email, one line per supervisor.
3. **Journal card**, titled "Notepad":
   - "You've logged N of M weekdays this week", where M is the weekdays of this week that fall inside the internship and are not in the future;
   - an **Open this week's notepad** button.
   - Outside the internship dates it reads "The placement isn't in an active week right now." and the button opens the Notepad anyway.
4. **Needs your attention** card, with one link per item, oldest first. Each link opens that period in the Logbook builder.
   - "Week N · supervisor requested changes", for a period whose status is `changes_requested`.
   - "Week N · overdue, not submitted", for a period whose end date is before today and whose status is `draft`.
   - With nothing, it reads "You're all caught up."

### Interns without a logbook

- **Header:** "WEEK N OF YOUR JOURNAL", counted from the journal start date. The title is the position, or "Intern". There's no date range and no progress bar.
- **Placement card:** the same three boxes, filled from the journal fields and the profile.
- **Journal card:** "You've written on N days this week", with an **Open this week's journal** button.
- No Needs your attention card.

### Rules (pure functions in `src/core/overview.ts`)

- `internshipProgress(start, end, today)` returns `{ week, of, percent, state: 'before' | 'during' | 'after', daysToStart }`.
- `needsAttention(periods, statusOf, today)` returns `{ key, label }[]`.
  - `periods` are the `Period`s with their 1-based index used as the week number.
  - `statusOf(key)` returns a `PeriodStatus`.

## My internship (`/student/onboarding`)

When set up, the page shows cards (second reference picture):

- **Left card:**
  - **Placement:** Company, Position, Period ("3 Aug 2026 – 27 Sept 2026"; journal interns get "Started 3 Aug 2026"), Time zone;
  - **University:** University, Programme.
- **Right cards:**
  - **Student:** Name, Email;
  - **Your supervisor:** Name, Email, Company, repeated per supervisor.
- An **Edit** button opens the form below.

**Form:** in Logbook mode, today's fields plus Position and Programme. In Journal mode, the form shows University (free text), Programme, Position and Started on.
- University and dates stay locked after a submitted week, as now; Position and Programme are always editable.
- Not set up yet: the form shows straight away, as Onboarding does today.

## Errors

- Saving shows the usual toast on failure and keeps the form open with what was typed.
- If the profile or supervisors can't load, the cards show "—" rather than blocking the page.

## Tests

- **Backend:**
  - `PUT /me/mode` switches both ways and keeps the placement, weeks and journal entries; supervisors get 403; an invalid mode gets 422;
  - `GET /me/logbook` returns the mode;
  - `PUT /me/internship` saves position and programme even after a week is submitted, while dates stay locked;
  - `GET /me/logbook` `profile` lists only supervisors of the intern's own company (an intern at Merlion doesn't see Nusantara's supervisor);
  - `GET /me/logbook` works for an intern without a placement;
  - `PUT /journal` saves the three journal fields and `GET /journal` returns them.
- **Prototype unit:**
  - `internshipProgress`: before, during and after, plus week numbers at the edges;
  - `needsAttention`: changes requested, overdue draft, a submitted or approved week (not listed), and a future draft (not listed);
  - both repositories round-trip the new fields.
- **Prototype e2e:**
  - a logbook intern onboards and lands on Overview, with week and progress shown;
  - after the supervisor requests changes, the Overview lists "Week 1 · supervisor requested changes" and the link opens the builder;
  - My internship shows the cards, and Edit saves a Position that then appears on Overview;
  - a journal-only intern sees Overview, Journal and My internship with the journal fields;
  - a logbook intern switches to Journal and back: the sidebar changes each time, and their notes are still there after switching back.

## Out of scope

- Supervisors assigning themselves to specific interns.
- Editing the company (it comes from the account).
