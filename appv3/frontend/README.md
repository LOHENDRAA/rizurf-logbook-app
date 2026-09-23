# Rizurf Logbook System

Rizurf Logbook System is a university-agnostic internship logbook. Students keep private Monday–Friday daily logs that feed readiness for a separate weekly report; reviews run Intern → Company Supervisor → University Mentor in order, with revision loops. Journal weeks unlock by date.

> [!NOTE]
> Backend integration: the frontend talks to a versioned REST API (`/api/v1`, see `openapi/portal.yaml`) with Laravel Sanctum same-site HttpOnly cookie sessions. The app boots from `GET /me`; credentials are verified server-side and never touch JavaScript storage. When no API is configured (local development without a backend), the app falls back to the built-in prototype store with seeded demo data; only unsynced user-scoped recovery drafts are kept in local storage, and they are cleared on sync/logout.

## Backend contract

- Source of truth: [`openapi/portal.yaml`](openapi/portal.yaml) — auth, `/me`, internship, journal weeks, daily/weekly-draft autosave, submit, supervisor and mentor queues + reviews. Optimistic concurrency via `ETag`/`If-Match` versions, `Idempotency-Key` on submit/review, RFC 9457 `problem+json` errors with `code` + `requestId`, pagination on list endpoints.
- Typed client: `src/api/` (`client.ts` sends `credentials: 'include'`, CSRF handshake, `X-Request-Id` correlation; `portal.ts` validates payloads with zod at the boundary; `generated.d.ts` is produced by `npm run openapi:types`).
- Environment: copy `.env.example` to `.env`. `VITE_ENABLE_MSW=true` runs the MSW contract mock, dev/test only — production builds fail closed.
- Deployment (same-site app/api, SPA fallback, CSP): see [`docs/deployment.md`](docs/deployment.md).

## Editor behavior (API-backed)

- Daily/weekly edits autosave debounced per field with visible `Saving… / Saved / Save failed / Conflict / Offline` states; explicit Save flushes immediately.
- Submit/review transitions carry the latest text + version + idempotency key, are serialized per entity, disable while in flight, and preserve the prior UI on failure.
- A 401 during editing preserves the unsynced draft and prompts re-auth with resume after login.
- A 409/412 preserves local text, fetches the server copy, and shows a compare-then-retry dialog.
- UI enablement (`canEdit`/`canSubmit`/`canReview`) comes from the server; client role checks are never authoritative.

## Features

- **Overview** — university, programme, company, position, and read-only internship dates with an internship *time* progress bar and lifecycle headline (`Starts in X days`, `Week X of N`, `Internship period completed`).
- **Journal** — today-first daily log, missing-days alert, and weeks grouped into Current, Past, and Upcoming (locked).
- Private daily logs (Mon–Fri only, no word limit, autosaved with a Save button that forces an immediate write with no popup) plus a separate weekly report editor with a non-empty submission gate.
- Daily logs unlock on their programme-local date; future days are locked. Today + overdue days stay editable until the week is first submitted; afterwards daily logs are permanently read-only (even when changes are requested).
- Weekly submission requires any non-empty weekly draft (interns may submit before the week ends; `weekEnded` is informational only). Daily logs are optional and never gate submission. Requested-changes revisions are weekly-text-only, require non-empty text, and can be resubmitted immediately even when unchanged.
- Submitted weeks are fully read-only while pending or approved; only a `changes_requested` week reopens the weekly editor (daily logs stay locked). Supervisor feedback on requested changes is shown to the intern on the week page.
- Supervisors review submitted weeks only: the submitted weekly snapshot plus the submitted daily logs (unsubmitted weeks show a read-only draft summary or stay unavailable). Decisions are **Approve** and **Request changes** (feedback required for the latter); every decision is saved durably before the UI commits it, and a failed save keeps the prior status with a generic retry message.
- Dual-stage workflow Intern → Company Supervisor → University Mentor: company approval opens the mentor queue; a mentor rejection restarts company review (intern revises → company pending → company re-approves → mentor pending again). A week is **Completed** only after both stages approve. Only the latest feedback per stage is kept.

## Journal statuses

```text
not_started -> draft -> submitted (company: pending -> approved | changes_requested -> pending …; mentor, after company approval: pending -> approved | changes_requested -> company pending …)
```

A submitted week is `Completed` only after company **and** mentor approval. `Locked` and `Overdue` are derived from dates at render time and are never persisted.
Daily logs carry no status: a required day counts toward submission when its
body has non-whitespace text. The weekly report keeps the
`not_started -> draft -> submitted` lifecycle above; daily text autosaves and
the Save button forces an immediate write with no popup, including empty text.

### Review state matrix (student editing)

| State | Daily logs | Weekly report | Submit button |
| --- | --- | --- | --- |
| `draft` / `not_started` | editable | editable | `Submit week` (gated on readiness) |
| `submitted` + `pending` | read-only | read-only | `Submitted` (disabled; resubmit rejected) |
| `submitted` + `approved` | read-only (final) | read-only (final) | `Submitted` (disabled; resubmit rejected) |
| `submitted` + `changes_requested` | read-only | editable | `Resubmit week` (enabled immediately, even unchanged) |

Resubmission snapshots the current weekly draft (so an unchanged resubmit still
refreshes `submittedAt`) and returns the company review to `pending` while retaining the
supervisor feedback; the mentor slot is preserved untouched. Supervisor feedback text resets per student + week so it
never leaks across weeks, and submit/review messages render only after the
durable save settles.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Demo authentication |
| `/dashboard` | Internship overview |
| `/journal` | Journal dashboard (today-first daily + week groups) |
| `/journal/days/:date` | Daily log editor (`YYYY-MM-DD`) |
| `/journal/weeks/:weekNumber` | Week page: private daily logs + separate weekly editor |
| `/supervisor/dashboard` | Company interns |
| `/supervisor/interns/:studentId` | Intern weeks for company review |
| `/supervisor/interns/:studentId/weeks/:weekNumber` | Company week review (mentor outcome read-only) |
| `/mentor/dashboard` | Assigned mentees |
| `/mentor/interns/:studentId` | Mentee weeks ready for mentor review (post company approval) |
| `/mentor/interns/:studentId/weeks/:weekNumber` | Mentor week review |

`/weeks/:id` redirects to `/journal`. Unknown routes redirect to the dashboard when signed in, otherwise to login. Direct navigation to a locked week redirects back to the journal.

## Technology Stack

| Area | Technology |
| --- | --- |
| Application | React 19, TypeScript |
| Development server and build | Vite 7 |
| Routing | React Router 7 (lazy routes + Suspense) |
| Server state | TanStack Query 5 (reads; mutations never auto-retry) |
| API | Versioned REST client (`src/api`) + zod boundary validation |
| Contract | `openapi/portal.yaml` (+ generated types, lint, drift check) |
| Dev/test mock | MSW 2 handlers mirroring the contract (dev/test only, never production) |
| Local fallback store | IndexedDB through `idb-keyval` (dev/test fallback; recovery drafts only in API mode) |
| Icons | Lucide React |
| Testing | Vitest, Testing Library, Playwright (critical journeys, MSW-backed) |
| Code quality | ESLint, TypeScript strict mode |

## Demo Accounts (local development only)

Six interns across different universities and time zones (all assigned to the university mentor), one company supervisor, and one university mentor. There are no demo passwords in the codebase: credentials are verified server-side (the MSW dev mock accepts any non-empty password for a known email).

| Name | Role | Email |
| --- | --- | --- |
| Aisha Rahman | Intern | `aisha.rahman@student.example.edu` |
| Daniel Lee | Intern | `daniel.lee@student.example.ac.uk` |
| Maya Chen | Intern | `maya.chen@student.example.edu.au` |
| Amara Okafor | Intern | `amara.okafor@student.example.ca` |
| Jonas Weber | Intern | `jonas.weber@student.example.de` |
| Lily Wang | Intern | `lily.wang@student.example.nz` |
| Sarah Lim | Company Supervisor | `sarah.lim@nusantara.example.com` |
| Dr. Maya Chen | University Mentor | `maya.chen@university.example.edu` |

## Local Data and Resetting

Without an API configured, portal data is stored in IndexedDB under `portal-data-v1`. Use **Reset demo** in the sidebar (development only — hidden in production) to clear the store (including the legacy `journal-data-v1` key) and restore seeded records. With an API configured, only unsynced user-scoped recovery drafts live in local storage; they are deleted on sync and wiped on logout.

## Project Structure

```text
openapi/
`-- portal.yaml         # Versioned REST contract (source of truth)
src/
|-- api/                 # Typed client, error model, zod-validated resources, generated types
|-- config/              # Validated env (API base URL, app env, MSW production guard)
|-- domain/            # Pure, timezone-injectable date/week/journal rules
|   |-- dates.ts
|   |-- weeks.ts
|   |-- daily.ts           # Mon–Fri required days + daily availability
|   |-- weeklyReadiness.ts # weekly submission readiness + snapshot selectors
|   |-- internship.ts
|   `-- journal.ts
|-- features/journal/    # Per-field debounced serialized autosave hook
|-- recovery/            # User-scoped unsynced recovery drafts (cleared on sync/logout)
|-- observability/       # Telemetry adapter (coarse events only, no journal text)
|-- mocks/               # MSW contract mirror: fixtures, handlers, browser/node entries
|-- services/          # Persistence seam + idb-keyval fallback implementation
|   |-- portalRepository.ts
|   `-- mockPortalRepository.ts
|-- state/             # AppContext (transitional UI store) + server session provider
|-- pages/             # Login, Overview, Journal dashboard, Day + Week editors
|-- components/        # AppShell, PageHeading, StatusBadge, SaveStatus, ConflictDialog, ReauthDialog, ErrorBoundary, OfflineBanner
|-- App.tsx            # Routes (lazy)
|-- types.ts           # Portal domain types (no passwords in API shapes)
`-- styles.css         # Design system and responsive layouts
```

## Prototype Limitations

- No backend is bundled: point `VITE_API_BASE_URL` at the Laravel API for production use.
- Anyone using the browser profile can access locally stored fallback records.
- Local fallback data is not encrypted, backed up, or synchronized between devices.

## Validation

```sh
npm ci
npm run openapi:drift   # generated types in sync + contract shape check
npm run lint
npm run build           # tsc + vite (production: MSW off, no demo secrets in entry bundle)
npm run bundle:check    # fail-closed entry-bundle scan
npx vitest run          # 396 tests: 366 legacy + 30 contract/client/recovery/autosave/integration
```

Playwright critical journeys (`e2e/`, MSW-backed: student edit/submit, supervisor approve/request-changes, mentor approve/reject-restart) are scaffolded but require browsers not installed in this environment (`npm run e2e` once `@playwright/test` browsers are available).
