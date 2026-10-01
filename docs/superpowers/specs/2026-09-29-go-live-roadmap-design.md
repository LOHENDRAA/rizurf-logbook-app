# Intern Logbook: Roadmap to Go Live

Date: 2026-09-29
Status: Approved in brainstorming, awaiting written-spec review

## 1. Goal

Turn the prototype (this repo, branch `logbook-prototype`) into the logbook that real interns and supervisors use.

Today all data lives in each person's browser (IndexedDB). An intern's submitted week never reaches the supervisor, and there is no real sign-in.

The finished logbook:
- keeps the prototype's screens;
- saves everything on a server on the team's VPS;
- lets people in through the Rizurf gateway.

Whether to make it the main logbook is decided later. This roadmap is the plan for when we do.

## 2. Decisions

| Topic | Decision |
|---|---|
| Screens | The Vue prototype, restyled to `RIZURF_UI_STANDARD.md` (commit f2dc811). |
| Server | appv3's Laravel 13 backend (`LOHENDRAA/rizurf-logbook-app`, `appv3/backend`), run with `docker compose` on the VPS. appv3's React screens are parked and no longer developed. |
| Hosting | Screens: Hostinger (a static build, e.g. `logbook.company.com`). Laravel API and MySQL: the company VPS (e.g. `api.company.com`), set up by the VPS admin with `appv3/DEPLOY.md`. |
| Sign-in | The gateway passes a token or cookie. The logbook checks it with the gateway and takes the user's role and company from it. |
| Accounts | The gateway already knows each user's role and company, so there is no admin screen. Interns still enter their university and internship dates under **My internship**. |
| Who reviews whom | A supervisor reviews the interns at their own company. There is no university-mentor stage. |
| Template per intern | Picked by the intern's university: one template per university. |
| Period | Weekly only. |
| Where documents are processed | In the browser, as now: detecting placeholders, the live preview, filling the Word or PDF file, and downloads. The server only stores files and results. |

## 3. Steps

Each step is built, tested and working before the next starts. Each gets its own implementation plan when its turn comes.

### Step 0: Get ready
- **VPS:** the admin follows `appv3/DEPLOY.md` (PHP 8.4, the app, MySQL, HTTPS). A test server with demo accounts comes first.
- **Automated tests:** move `appv3/.github/workflows/ci.yml` to the repo root (`.github/workflows/`) and fix its `working-directory` paths to `appv3/backend` and `appv3/frontend`, so GitHub actually runs it.
- **A machine that can run PHP 8.4+:** the VPS, Docker Desktop, or a standalone PHP 8.4. The team's PC has XAMPP's PHP 8.2.
- **Done when:** CI runs green on GitHub, and `docker compose up` serves appv3 over HTTPS on the VPS.

### Step 1: Templates on the server
- Build the **backend half** (Tasks 0–3) of `rizurf-logbook-app/docs/superpowers/plans/2026-09-29-appv3-logbook-templates.md` as written: the `logbook_templates` table, upload checks, and `GET/POST/PUT/DELETE /api/v1/templates…` plus `GET /api/v1/me/template`.
- Drop that plan's frontend half (Tasks 4–7). The prototype's screens replace it in step 3.
- **Done when:** that plan's backend tests pass.

### Step 2: The logbook on the server
Reuse appv3's tables and add only what the prototype needs.

| Prototype data | Server home |
|---|---|
| `Student` (name, dates, university, cover answers) | `placements`, plus a `cover_values` JSON column |
| `NotepadEntry` (one note per day) | `daily_entries` (exists) |
| `PeriodFill` (a week's placeholder answers, auto-filled marks, status) | `weeks`, plus `values` and `autofilled` JSON columns and `template_id` |
| `ReviewAction` (submit / approve / request changes, comment, signature) | `review_actions` (exists), plus `signature` (the signer's name) |

Rules the server enforces. Each one gets a test.
- Only a supervisor can approve or request changes, and only for interns at their own company.
- **On approve, the signature name and time come from the signed-in supervisor.** Whatever the browser sends is ignored, so an approval can't be forged.
- An intern can edit a week only while it is a draft or has changes requested. Submitted and approved weeks are read-only.
- Interns see only their own data.
- Saving over someone else's newer change is refused ("this changed elsewhere"), using appv3's existing ETag / If-Match handling.
- Remove the university-mentor review stage: its routes, controller, capability flags and seeded mentor.

**Done when:** backend tests cover every rule above.

### Step 3: The screens talk to the server
- Add `src/data/http.ts`, an `HttpRepository` that implements the existing `Repository` interface (`src/data/repository.ts`, 13 methods) with calls to `/api/v1`.
- `repo()` picks it when the build has `VITE_API_URL`; otherwise it uses the current browser storage (`IdbRepository`), so the offline demo keeps working.
- No screen changes, except showing a clear message when the server can't be reached. A failed load must never look like an empty list (UI standard §6).
- **Done when:**
  - the existing 99 unit and 11 end-to-end tests pass against the browser version;
  - a supervisor and an intern in two different browsers see each other's work.

### Step 4a: Pass the gateway's checks
- appv3 follows `RIZURF_API_TEMPLATE.md`'s checked rules: the `{"error": {...}}` body with the reserved codes, `X-Correlation-ID`, `/health` with the service id `intern-logbook`, and `/openapi.json` with the catalogue metadata.
- The prototype reads the new error body.
- **Done when:** the gateway's Conformance page shows 0 failures for `https://<api>/api/v1`.

### Step 4b: Sign in through the gateway
Follows `MICROAPP_AUTH.md`.
- The server swaps the gateway's one-time code for an identity token, verifies it (RS256 against the gateway's JWKS, then `token_use`, `iss`, `aud`, `exp`), and starts its own 15-minute session holding `sid` and `sub`.
- Every signed-in request asks the gateway's `/oauth/introspect` whether the session is still live (no cache; fail open on network errors), and answers `401` once it isn't.
- Roles are read from the logbook database's `users.role` column, matched by the gateway identity. The gateway's own `role` claim is ignored.
- Removed: passwords, `/auth/login`, `/auth/logout`, the sign-in form and the Sign out button. The gateway is the only place to sign in or out.
- `Cache-Control: no-store` on every API response.
- The **Viewing as** dropdown and the **Load / Reset demo data** buttons show only in builds without `VITE_API_URL`.
- Opening the screens without a session sends the browser to the gateway (once; a second failure within a minute shows an error instead of looping). A `401` in the middle of a session tells the person to copy unsaved text and reload, rather than redirecting and losing it.
- People are added with `php artisan logbook:user` (email, name, role, company).
- **Done when:** people coming from the gateway land signed in with the right role; signing out at the gateway locks the logbook on its next request; someone who isn't signed in can't see any data.

### Step 5: AI summaries on the server
- Move `public/api/summarize.php` into a Laravel endpoint, `POST /api/v1/summaries`.
- It only works for signed-in users, and each user has a daily limit (20 requests).
- The OpenAI key lives only in the VPS's `.env`.
- The prototype still tries Chrome's free built-in AI first.
- **Done when:** signed-out calls get a 401, the limit returns a 429 with a friendly message, and the key never appears in the browser.

### Step 6: Go live
- **Deploy:** upload the screens' build to Hostinger. The VPS admin updates the API with DEPLOY.md's "Updating" steps.
- **Daily backups** (DEPLOY.md's "Backups" section): the MySQL database (`mysqldump`) and `storage/app/private`, kept for 14 days, with one restore test.
- **Counts:**
  - the number on the logbook's icon in the gateway's **Your apps** (`MICROAPP_BADGES.md`): weeks waiting for this supervisor, or weeks sent back to this intern;
  - the same count on the **Review** link.
- **Done when:** one full run-through on the VPS works: upload a template, write notes, fill a week, submit, request changes, resubmit, approve, and download the signed page.

## 4. Open questions for the team (they block step 4 only)

1. **Answered:** `MICROAPP_AUTH.md` and `RIZURF_API_TEMPLATE.md` have been received. Still needed from the gateway admin for step 4b: the logbook's service id as registered (the token's `aud`), the gateway's address (`GATEWAY_URL`), and the screens' address as registered (`PUBLIC_URL`).
2. **Answered:** roles come from the logbook database's `users.role` column. The gateway's `role` claim is its own console role and is not used.
3. Where are `RIZURF_DESIGN_SYSTEM.md` and `MICROAPP_BADGES.md`? Step 6 needs the badges one. (`MICROAPP_GATEWAY_BUTTON.md` has been received, and the prototype already meets its checklist.)

## 5. Out of scope

- Monthly and daily logbooks (weekly only).
- Live editing of the same week in two tabs, beyond the "this changed elsewhere" warning.
- An admin screen.
- Email notifications.
- Keeping appv3's React screens up to date.

## 6. Risks

| Risk | What we do |
|---|---|
| The gateway's sign-in works differently than assumed | Step 4 is last before go-live and is isolated behind `GET /me`, so steps 0–3 don't depend on it. |
| Placeholder detection differs between browsers | It already runs in the browser today, and the fixture tests pin it down. |
| Data loss on the VPS | Daily backups plus a restore test before go-live (step 6). |
| Cost of AI summaries | Free Chrome AI first, a per-user daily limit, and `gpt-4o-mini`. |
