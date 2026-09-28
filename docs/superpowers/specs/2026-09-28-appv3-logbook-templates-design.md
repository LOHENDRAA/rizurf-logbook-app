# appv3 Logbook Templates (Part 1 of 4): Design

Date: 2026-09-28
Status: Approved in brainstorming, awaiting written-spec review

## 1. Context and goal

The standalone prototype (`LOHENDRAA/rizurf-logbook-app`, branch `logbook-prototype`) proved a university-template workflow:
- A supervisor uploads a university's Word/PDF logbook. Placeholders are detected and shown as an editable highlight overlay.
- Students fill each week's page from their daily notes, preview it, and submit it.
- The supervisor's approval signs the page.
- Students export the filled file.

These features now move into **appv3** (Laravel 13 API + React 19 SPA, Docker). appv3 already has daily logs with autosave, a weekly free-text draft, submission and review, and real sign-in.

The work is split into four sub-projects. Each gets its own spec, plan and build:

1. **Templates** (this spec): supervisors upload, correct and save one template per university.
2. **Logbook builder**: each week's page is auto-filled from the Daily log, with a live preview and a preview-before-submit step, using appv3's existing submit.
3. **Sign-off and export**:
   - Remove the university-mentor review stage, so the supervisor is the only reviewer.
   - Approval fills the template's signature spots (name and date in the template font, signature in Vladimir Script).
   - Students download the filled file.
4. **AI summaries**: a "Summarize week" action for weekly answer boxes, using Chrome's on-device AI first and an OpenAI fallback called from Laravel.

## 2. Decisions

| Topic | Decision |
|---|---|
| Review flow | Supervisor only. The mentor stage is removed in part 3, not here. |
| Runtime | Docker (`docker compose up`), as appv3 already ships. appv3 needs PHP 8.4. |
| Template scope | One template per university, shared by every company. Students are matched through `placements.university_name`. |
| Where detection/fill run | In the browser, reusing the prototype's pure-TypeScript core. Laravel stores the file and the placeholder JSON. |
| Period | Weekly only. appv3's journal is built around weeks. |
| Who can write templates | Users with the `supervisor` role. |

## 3. Backend (Laravel)

### 3.1 Table `logbook_templates`

| Column | Type | Notes |
|---|---|---|
| `id` | string, primary | same style as `placements.id` |
| `university_name` | string | as the supervisor typed it (trimmed) |
| `university_key` | string, **unique** | `mb_strtolower`, with whitespace collapsed to single spaces. Used to match `placements.university_name` the same way. |
| `format` | string(8) | `docx` or `pdf` |
| `file_name` | string | original upload name |
| `file_path` | string | `templates/{id}/original.{ext}` on the private `local` disk (never public) |
| `placeholders` | json | the prototype's `Placeholder[]`, stored as-is |
| `page_roles` | json, nullable | PDF: `('cover'\|'unit'\|'ignore')[]` |
| `unit_start_block` | unsigned int, nullable | Word: body block where the weekly page starts |
| `version` | string(64) | ETag source, changed on every write |
| `created_by`, `updated_by` | string, FK users | |
| timestamps | | |

Model `LogbookTemplate`, with `placeholders` and `page_roles` cast as arrays. `Placement::template()` resolves the template by university key.

### 3.2 Endpoints (under `/api/v1`, `auth`, same throttle group)

| Method & path | Who | Behaviour |
|---|---|---|
| `GET /templates` | supervisor | List: `id, universityName, format, placeholderCount, studentCount, updatedAt`. Uses a list ETag, like `me/journal/weeks`. |
| `POST /templates` | supervisor | Multipart: `file`, `universityName`, `placeholders` (JSON string), `pageRoles?`, `unitStartBlock?`. Creates the template and returns it with an `ETag`. **409** problem+json if the university key exists (the body carries `existingId`). Honours `Idempotency-Key`. |
| `GET /templates/{id}` | supervisor | Full template (no file), with an `ETag`. |
| `GET /templates/{id}/file` | supervisor, or a student whose placement's university key matches | Streams the original file with its content type. Otherwise **403**. |
| `PUT /templates/{id}` | supervisor | JSON body: `universityName, placeholders, pageRoles, unitStartBlock`. **`If-Match` required**: 428 if missing, 412 if stale. Returns the template with a new `ETag`. A new university name that collides with another template returns 409. |
| `DELETE /templates/{id}` | supervisor | **`If-Match` required**. Deletes the row and its file. Returns 204. |
| `GET /me/template` | student | The template for the student's placement university, including `fileUrl`. **404** if there isn't one. |

Errors use appv3's existing RFC 9457 problem+json, and the version and idempotency handling reuses `ConcurrencyService` and the idempotency store.

### 3.3 Validation (a trust boundary: never trust the browser)

- `file`: required on create, at most 10 MB, extension `docx`/`pdf`, **and** the content must match:
  - docx: a ZIP containing `word/document.xml`;
  - pdf: starts with `%PDF-`.
- `universityName`: 1–200 characters after trimming.
- `placeholders`: an array of at most 500 items. Each has:
  - `id` (≤ 64 characters) and `label` (≤ 300 characters);
  - `binding` ∈ {cover, daily, period, date, free, signature}, `source` ∈ {marker, label, manual}, `region` ∈ {cover, unit};
  - optional `dayIndex` (0–31), `dayMode` ∈ {weekday, nth}, `dateRole` ∈ {day, start, end, range, number};
  - an `anchor` of one of three kinds:
    - `pdf`: numeric `page, x, y, w, h`, optional `whiteout`;
    - `docx-cell`: `table` (1–2 ints), `row`, `col`;
    - `docx-text`: `paragraph`, `start`, `end`.
- `pageRoles`: array of `cover|unit|ignore`, required for pdf. `unitStartBlock`: an int of at least 0, required for docx.
- There must be at least one placeholder with `region: unit` (the same rule as the prototype's `validateTemplate`).

## 4. Frontend (React)

### 4.1 Code layout

- `src/features/templates/core/`: the prototype's `src/core` modules, copied unchanged. That is `model`, `ids`, `dates`, `docx/xml`, `detect/{labels,markers,docx,pdf}`, `pdf/text`, `fill/{docx,pdf,pdfLayout}` and `template`, plus their Vitest tests and fixtures.
  - The remaining modules (`periods`, `autofill`, `workflow`) arrive in part 2.
  - The Vue-specific `data/plain.ts` is not ported.
- `src/features/templates/overlay/`: React ports of `TemplateOverlay`, `PdfPageLayer`, `DocxLayer`, `PlaceholderBox`, `docxAnchors`, `bindingColors` and `PlaceholderInspector`. Same props, events and behaviour, including:
  - drag, resize and draw on PDF pages;
  - clicking a cell or selecting text in Word;
  - the "Repeats every period" line;
  - the unresolved-anchor warning.
- `src/features/templates/api.ts`: TanStack Query hooks over the generated client (`useTemplates`, `useTemplate`, `useSaveTemplate`, `useDeleteTemplate`, `useMyTemplate`).
- A shared `ask()` in-page confirmation dialog. `window.confirm` is blocked in embedded browsers, so a native `<dialog>` is used, styled with appv3 tokens.
- New dependencies: `jszip`, `pdf-lib`, `pdfjs-dist@4.10.38` (legacy build, worker served via Vite `?url`), `docx-preview`.

### 4.2 Pages (supervisor)

- **`/supervisor/templates`**
  - Table of universities: format, placeholder count, student count, last updated, Edit, Delete.
  - Delete asks first, warning when students use the template.
  - Has a "New template" button.
- **`/supervisor/templates/new`**
  1. The supervisor enters the university name and picks a .docx/.pdf, then clicks "Detect placeholders" (detection runs in the browser).
  2. The editor opens.
  3. Saving `POST`s. A 409 asks "A template for X already exists. Replace it?", then `PUT`s to `existingId` using the version from a fresh `GET`.
- **`/supervisor/templates/:id`**
  - The editor loads the file from `/templates/{id}/file` and the placeholders from `GET /templates/{id}`.
  - Saving `PUT`s with `If-Match`. A 412 opens appv3's `ConflictDialog`.
  - Leaving with unsaved edits asks first.
- **The editor itself** is the prototype's layout:
  - The document with highlight boxes on the left, coloured by binding. Label guesses are dashed; manual boxes are marked.
  - On the right: the legend, the inspector (label, binding, date role, day number/mode, delete) and the placeholder list grouped by region.
  - Toolbar: Select / Add placeholder; for Word, "Set repeating start" and "Whole document repeats"; for PDF, per-page role selects.
- `AppShell` gets a **Templates** link in supervisor navigation. The route is guarded by the existing `RequireSupervisor`.

### 4.3 Contract and mocks

- `openapi/portal.yaml` gains the endpoints and schemas from §3.2, and `generated.d.ts` is regenerated, so CI's drift check passes.
- MSW handlers and fixtures mirror the endpoints for dev and tests.

## 5. Error handling

| Case | Behaviour |
|---|---|
| Wrong type, oversized, or content doesn't match its extension | Server 422 problem+json. The editor shows the message and stays on the upload step. |
| Encrypted PDF | Detection fails in the browser with "This PDF is password-protected; upload an unlocked copy." |
| Image-only PDF | The editor opens with 0 detections and the banner "No text found — place placeholders manually." |
| University already has a template | 409, then a "Replace?" dialog, then an update of the existing template. |
| Concurrent edit | 412, then `ConflictDialog` (reload their version / keep editing). |
| Missing `If-Match` | 428 (a client bug; covered by tests). |
| Student fetches another university's file | 403. |
| Template deleted while students use it | `GET /me/template` returns 404. Part 2 shows "Your university has no logbook template yet — ask your supervisor." |
| Session expired | appv3's existing `ReauthDialog`. |

## 6. Testing

**Backend (PHPUnit, feature tests against MariaDB)**
- Create (docx and pdf), and rejection of wrong content (a .pdf that is really text) and of files over 10 MB.
- Duplicate university → 409 with `existingId`; name normalisation (" Taylor's  University " vs "taylor's university").
- `PUT`/`DELETE` without `If-Match` → 428, stale → 412, current → success with a new ETag.
- Supervisor-only writes: students get 403.
- `GET /templates/{id}/file`: the matching student gets 200, other students get 403.
- `GET /me/template`: 200 when matched, 404 when not.
- Placeholder validation rejects a bad `binding`, a malformed anchor, over 500 items, and no unit placeholder.
- Pint and Larastan stay clean.

**Frontend (Vitest)**
- The ported core tests pass unchanged: detection on the APU, Taylor's and PMU fixtures; fill; layout; the WinAnsi and stale-anchor cases.
- The templates list page renders rows and asks before deleting.
- The editor page: detect → save (POST); the 409 replace flow; a 412 shows `ConflictDialog`.

**E2E (Playwright, appv3's existing setup)**
- A supervisor uploads the Taylor's `.docx`, changes one binding, adds a manual cell placeholder, saves, and sees it in the list.

**CI stays green**: `composer validate`, Pint, Larastan, PHPUnit, the OpenAPI drift check, ESLint, Vitest, the production build, and `compose.yaml` validation.

## 7. Out of scope (later parts)

- The builder, notepad-driven autofill, and preview-before-submit (part 2).
- Removing the mentor stage, signing on approval, the Vladimir Script signature, and export (part 3).
- AI summaries (part 4).
- Non-weekly periods, template versioning/history, and an admin role.
