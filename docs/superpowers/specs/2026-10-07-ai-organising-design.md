# AI organising — design

Date: 2026-10-07. Status: agreed in chat, awaiting spec review.

This is piece 2 of 5 in rebuilding the logbook around the features of "Claude- journal prototype.html". Piece 1, Today and Journal (`2026-10-07-today-and-journal-design.md`), is merged. The look stays the current Rizurf one (Styles.md) with the gateway's dark mode.

## What it does

An intern presses **✦ Organize** on an entry. The AI suggests:

- the project the entry belongs to;
- the Activities, Learning points and Skills the entry shows.

The intern accepts, edits or rejects each suggestion. Accepted items build three new pages: **Projects**, **Learning** and **Skills**.

## Decisions

- **Interns only.** This covers logbook and journal-only interns. Supervisors keep the plain Today and Journal, with no Organize button and no new pages.
- **Private.** Projects and items belong to their owner. Nobody else can read them, and supervisors never receive them.
- **On request only.** Nothing is sent to OpenAI unless the intern presses Organize. The server's OpenAI key is used, with gpt-4o-mini.
- **The AI suggests the project too:** either an existing one or a new name.
- **Browser demo and preview:**
  - The demo data comes with projects, learning and skills already filled in.
  - Organize uses a no-AI stand-in: each sentence becomes an Activity, and the project is the intern's most recent one. The panel is labelled "Demo suggestions (no AI)".
- **Out of scope:**
  - evidence files;
  - supervisor feedback on skills;
  - the Evidence and Feedback counts in the original prototype.

## Organizing an entry

### The button

- **✦ Organize** sits under the entry box on Today and on the entry page (`/journal/:date`).
- It is disabled while the entry is empty or still saving.
- While it runs, it reads "✦ Organizing your entry…".
- It saves any unsaved text before it organizes.

### The review panel ("Review what I found")

The panel sits on the right; on a narrow screen it goes below the box. It holds one card per suggestion:

- **Project:** one card naming an existing project or a new one.
- **Activity:** 1 to 4 cards.
- **Learning:** 0 to 3 cards.
- **Skill:** 0 to 3 cards.

Every suggestion uses only what the entry says.

Each card has three buttons:

- **Accept**
- **Edit:** change the text, then save it as accepted.
- **Reject:** the card goes away.

On the Project card:

- **Edit** lets you pick an existing project from a list or type a new name.
- **Accept** assigns the entry to that project, creating the project if the name is new.

Under the box, a summary line reads "3 accepted · 2 waiting · Review". "Review" reopens the panel.

### Organizing again

- Suggestions not yet reviewed are replaced.
- Accepted ones are kept.
- A new suggestion is dropped if it matches an accepted or rejected item of the same kind (trimmed, ignoring case). Rejected items are never shown again.
- Only one project is accepted at a time. Accepting a different project replaces it.

### When it fails

- The panel shows: "Your entry is saved. I couldn't organize it right now. Try again". The entry text is never touched.
- Each intern can organize 30 times a day. This limit is separate from the 20 summaries a day.
- Over the limit, the panel shows: "You've organized 30 times today. Try again tomorrow."

### The entry page

The entry page (`/journal/:date`) has a **Connected to** side card. It shows the entry's project, which links to that project, and its accepted Activities, Learning points and Skills.

### Changing or clearing an entry

- Editing the text keeps the items.
- Clearing an entry deletes its items too. If any item was accepted, the intern is asked first:

  > "This entry has accepted items. Clearing it removes them from your Projects, Learning and Skills. Clear it?"

## Pages

The three pages are for interns only. They appear in the sidebar after Journal: **Projects**, **Learning**, **Skills**. All of them are computed in the browser from the loaded journal and projects.

### Projects (`/projects`)

- One card per project, ordered by the newest accepted activity first. Projects with no activity go last, by name.
- Each card shows:
  - the name;
  - the description, if there is one;
  - "13 activities · 8 learning points · 4 skills".
- **+ New project** asks for a name (required, at most 120 characters, unique per person ignoring case) and an optional description (at most 500 characters).
- With no projects yet, the page reads: "Projects appear when you accept one from an entry, or add one here."

### A project (`/projects/:id`)

The project page has four tabs:

- **Overview:**
  - the three counts as tiles;
  - **Rename** and **Edit description**;
  - **Delete**, which asks first. Delete works only while no entry uses the project. Otherwise it shows: "Entries still use this project. Move them first."
- **Timeline:** the project's accepted activities, newest first. Each one shows its date and links to its entry.
- **Learning:** the project's accepted learning points, newest first, with their dates.
- **Skills:** the skills seen in the project, with counts.

An unknown id shows "That project doesn't exist." and a link back to Projects.

### Learning (`/learning`)

- Every accepted learning point, newest first, with its project (or "No project") and date. Each one links to its entry.
- A project filter at the top: "All projects", each project, and "No project".
- With none yet, the page reads: "Learning points appear here when you accept them from your entries."

### Skills (`/skills`)

- One card per skill. Skills with the same name, ignoring case and outer spaces, count as one; the card shows the most recent spelling.
- Each card shows:
  - "Seen in 2 projects · 6 activities · 3 learning points";
  - "First seen 5 Aug".
- The activities and learning points counted are the accepted ones from the same entries as the skill.
- With none yet, the page reads: "Skills appear only when your journal supports them."

### A skill (`/skills/:name`)

- **Why this skill appears:** "Accepted from N entries in: project names".
- A timeline of the entries behind the skill, newest first. Each row shows the date and that entry's accepted activities, and links to the entry.
- An unknown name shows "You haven't been seen using that skill yet." and a link back to Skills.

## Data

### On each journal entry

Each entry gets two new fields:

- `projectId`: a project id, or null.
- `items`: a list of `{ id, kind, text, status }`.
  - `kind`: `project`, `activity`, `learning` or `skill`.
  - `status`: `suggested`, `accepted` or `rejected`.
  - `text`: 1 to 300 characters.
  - The list holds at most 40 items.

A `project` item holds the suggested name in `text`. Accepting it sets `projectId`.

### Projects

Each project is `{ id, name, description }` and belongs to one person.

### One merge rule, in the browser

`mergeSuggestions(items, fresh)` lives in `src/core/organize.ts` and applies the "Organizing again" rules. The server's suggestions and the demo stand-in both go through it, and the page saves the result.

## Server (appv3 backend)

### Migration

- New `projects` table:
  - `id`;
  - `user_id` (a foreign key that cascades on delete);
  - `name` (120);
  - `description` (nullable, 500);
  - timestamps;
  - unique on `user_id` + `name_key`, where `name_key` is the lower-cased, trimmed name.
- `journal_entries` gets:
  - `project_id`: nullable, a foreign key to `projects`. Deleting a project is blocked in the app while entries use it.
  - `items`: JSON, nullable.

### Endpoints

All endpoints work on the signed-in person's own data only. The new endpoints return 403 for supervisors.

- **`GET journal`:**
  - adds `projectId` and `items` to each entry, with `items` as `[]` when empty;
  - adds a top-level `projects` list of `{id, name, description}`;
  - supervisors get `projects: []`.
- **`POST journal/{date}/organize`:**
  - Reads the saved entry for that date and returns 404 if there is none.
  - Sends the text and the person's project names to OpenAI, and returns `{ project, activities[], learning[], skills[] }`.
  - Saves nothing.
  - Throttled by `throttle:organize`: 30 a day per user.
  - Returns 503 when there is no key, OpenAI fails, or the reply isn't valid.
  - Lists longer than allowed are cut to 4, 3 and 3, and each text to 300 characters.
- **`PUT journal/{date}/organization`:**
  - Body: `{ projectId?: string|null, newProjectName?: string, items: [...] }`.
  - Checks the item shape and limits above.
  - The `projectId` must belong to the person; otherwise it returns 422.
  - `newProjectName` creates the project, or reuses one with the same name ignoring case.
  - Returns 404 if the entry doesn't exist.
  - Returns `{ projectId, items, projects }`.
- **Projects:**
  - `POST projects` takes `{name, description?}` and returns 201 with the project. A duplicate name returns 422.
  - `PATCH projects/{id}` takes the same fields.
  - `DELETE projects/{id}` returns 204, or 409 while any entry uses the project.
  - Someone else's project returns 404.
- **`PUT journal/{date}`** (saving text) keeps `project_id` and `items`. A blank text deletes the row, items included, as before.

### Prompt

- JSON response format.
- The prompt says:
  - use only what the entry states;
  - first person is not needed;
  - short phrases;
  - prefer one of the listed existing projects when it fits, otherwise name a new short project;
  - 1 to 4 activities, 0 to 3 learning points, 0 to 3 skills;
  - skills are short names such as "Data modelling".
- Anything that isn't that JSON shape counts as a failure (503).

### Contract

`openapi.json` gets the new paths and fields. `OpenApiTest` keeps enforcing them.

## Prototype (browser storage)

- IndexedDB moves to version 4:
  - journal rows keep any `projectId`/`items` they have;
  - a new `projects` store, keyed by `[owner, id]`, with a `byOwner` index;
  - `reset()` clears it.
- The repository gets:
  - `putOrganization(owner, date, {projectId, items})`;
  - `createProject`, `updateProject`, `deleteProject`;
  - `getJournal` returns `projects` and each entry's `projectId`/`items`.
- The HTTP repository calls the endpoints above. The local repository runs the demo stand-in for organize.
- The demo seed adds 2 projects and accepted items on most of the demo intern's entries.
- The single-file preview gets the same demo data.

## Tests

### Server

- organize, with a faked OpenAI reply:
  - the shape returned;
  - cutting to the limits;
  - 503 with no key;
  - 503 on a malformed reply;
  - 404 with no entry;
  - the 30-a-day limit;
  - 403 for supervisors.
- organization:
  - saves and returns;
  - creates a new project, and reuses one with the same name in a different case;
  - 422 for someone else's project;
  - 422 for a bad kind or status, text that is too long, or too many items.
- projects:
  - create, rename and delete;
  - a duplicate name returns 422;
  - delete returns 409 while the project is in use;
  - another person's project returns 404.
- Saving text keeps the items; blank text removes them.
- `GET journal` returns the new fields.
- The supervisor's logbook view is unchanged and leaks no items.

### Unit

- `mergeSuggestions`:
  - replaces suggestions not yet reviewed;
  - keeps accepted ones;
  - drops matches with accepted or rejected items, ignoring case;
  - keeps only one accepted project.
- The page calculations:
  - project counts;
  - the case-insensitive skill merge and "first seen";
  - the learning filter, including "No project".
- The version 4 IndexedDB upgrade keeps existing entries and adds `projects`.
- The demo stand-in turns sentences into activities and picks the most recent project.

### End-to-end, on the demo build

- Organize, then Accept, Edit and Reject; the summary line; the Connected to card.
- Accepting a new project name creates it, and it shows on Projects.
- Organizing again keeps accepted items and doesn't bring back rejected ones.
- The Projects, project tabs, Learning (filtered) and Skills/skill pages work, with empty states for a fresh intern.
- Deleting a project in use is refused.
- Clearing an entry with accepted items asks first.
- Supervisors see no Organize button and no Projects, Learning or Skills links. A direct URL redirects to Today.
