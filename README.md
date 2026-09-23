# RizurfV2 — handoff copy

Clean, lean copy of the Rizurf project (source: `~/Rizurf`, left untouched).
Facts below were verified against the copied trees on 2026-09-23; anything
not verified is labelled as observed, not as status.

## Start-here map

| Path | What it is | Status |
| --- | --- | --- |
| `app/` | **Current app (v3)** — Laravel 13 API + React 19 SPA monorepo, Docker-packaged | Runnable shape intact; needs `composer install` / `npm ci` + env files |
| `archive/v1/` | Earliest static-HTML prototype (4 pages + 1 PNG) | Reference only |
| `archive/v2/` | React + Vite **frontend-only** prototype (no backend ever existed) | Reference only; needs `npm ci` to run |
| `reference/` | Design files (`LogbookFiles/`) reorganized by logbook workflow (descriptive names, old→new index in `reference/README.md`) | Reference only, see `reference/README.md` |
| `logbook_v4_google_stitch_design.zip` | Google Stitch AI design export ("Universal Logbook" / "Precision Developer Canvas"): sign-in, nav hub, daily log, weekly review, brand logo | **Spec'd v4 direction, not yet implemented** — not part of `reference/`'s 42-artifact index, but not an untethered exploration either: it's the UI for the product brief in `reference/08-v4-product-vision/` (skills tracking, weekly/monthly reflection cadence, goals loop, growth record). No schema support in `appv3/` yet; treat as the documented next direction, pending an explicit decision to build it. |

`app/` keeps `backend/`, `frontend/`, `docker/`, `compose.yaml`, `.env.example`
files and `.github/` as siblings, so Docker build contexts and CI
`working-directory` paths keep working.

## Current app (v3) architecture

- `app/backend/` — Laravel 13 API (MariaDB, Sanctum SPA cookie-session auth),
  versioned routes in `routes/portal.php` served under `/api/v1`.
  Notable behaviours (per `app/README.md` + `app/frontend/README.md`):
  ETag/`If-Match` optimistic concurrency, `Idempotency-Key` replays,
  RFC 9457 `problem+json` errors, database-backed sessions.
- `app/frontend/` — React 19 + Vite 7 + TanStack Query SPA.
  API contract source of truth: `frontend/openapi/portal.yaml`
  (~860 lines); `frontend/src/api/generated.d.ts` is committed generated
  output (CI drift-checks it). Dev/test-only MSW mocks mirror the contract;
  production calls the same-origin API.
- `app/compose.yaml` + `app/docker/` — nginx serves the prebuilt SPA with SPA
  fallback and proxies `/api/*` + `/sanctum/*` to php-fpm; MariaDB persists
  in a volume. Only the host port is configurable (`APP_PORT`, default 8080).

## Run the current app with Docker

From `app/` (per `app/README.md`):

```sh
cp .env.example .env
# Optional: stable app key for sessions across restarts.
docker compose run --rm app php artisan key:generate --show
# Paste the output as APP_KEY in .env, then:
docker compose up --build
```

Open `http://localhost:8080` (or the port set via `APP_PORT` in `.env`),
then seed the demo workspace:

```sh
docker compose exec app php artisan migrate --seed
```

## Local development (without Docker)

Backend (PHP, Composer, MariaDB), per `app/README.md`:

```sh
cd backend
composer install
cp .env.example .env   # socket-auth defaults work with local MariaDB
php artisan migrate --seed
php artisan serve --port=8001   # configurable; 8000 may be occupied
```

Frontend (Node + npm), per `app/frontend/README.md` and
`app/frontend/docs/deployment.md`:

```sh
cd frontend
npm ci
npm run dev
```

With a backend running, point the SPA at it via `.env`
(see `docs/deployment.md` environment matrix); without a backend the app
falls back to its prototype store / MSW mock in dev/test only.

## Environment setup

Real `.env` files were **excluded** from this copy (no secrets carried over).
Each level ships a checked-in example — copy and fill in:

- `app/.env.example` -> `app/.env` (compose: ports, DB credentials, app key)
- `app/backend/.env.example` -> `app/backend/.env` (local Laravel config)
- `app/frontend/.env.example` -> `app/frontend/.env` (Vite settings)

All secret values in the examples are empty or obvious placeholders such as
`change-me`. Demo login identities live in the backend seeders
(`app/backend/database/seeders/`) and the archived prototype READMEs —
see those files directly, and rotate any credentials for real use.

## Validation commands (not run here — no network/DB/browsers in this env)

Backend (`app/backend/`):

```sh
composer validate --strict
./vendor/bin/pint --test
./vendor/bin/phpstan analyse --no-progress
php artisan test
```

Frontend (`app/frontend/`):

```sh
npm run openapi:drift   # regenerates types to a temp path and diffs + lints contract
npm run lint
npx vitest run
npm run build           # VITE_ENABLE_MSW must be false/unset
npm run bundle:check    # asserts no demo secrets / MSW in dist
```

E2E (`app/frontend/e2e/`, Playwright) needs browsers installed.
CI (`.github/workflows/ci.yml`) runs the backend checks, the frontend
pipeline, and `docker compose config` validation.

## Observed gaps (observed, not status — verify before acting)

- **Port mismatch in docs:** root `app/README.md` uses
  `php artisan serve --port=8001`, while `app/frontend/docs/deployment.md`
  lists dev-with-backend `VITE_API_BASE_URL` as `http://localhost:8000` and
  `app/backend/.env.example` sets `APP_URL=http://localhost:8000`.
  Documented here, not reconciled.
- **Stock Laravel boilerplate kept as-is:** `app/backend/README.md` is the
  default Laravel skeleton readme; `app/backend/AGENTS.md` and
  `app/backend/CLAUDE.md` are identical Laravel Boost placeholder docs;
  `app/backend/resources/` (css/js/views), `vite.config.js`, `package.json`,
  `.npmrc` are unused SPA scaffolding. Annotated, not deleted.
- **Duplicate nested CI:** `app/frontend/.github/workflows/ci.yml` is a
  frontend-only pipeline alongside the monorepo `app/.github/workflows/ci.yml`.
  Kept as found.
- **No root `.gitignore` existed in v3:** added `app/.gitignore` during this
  handoff (new file; existing `app/backend/.gitignore` untouched). It covers
  `node_modules/`, `dist/`, `vendor/`, `*.tsbuildinfo`, `.env`,
  backend storage runtime dirs, `bootstrap/cache/*.php`,
  `.phpunit.result.cache`, `database.sqlite`.
- **`app/backend/tests/Unit/` is empty** (only `tests/Feature/` has tests:
  Auth, Journal, Review).
- **`openapi:drift` assumes a temp path:** the npm script writes its check
  file to `/tmp/opencode/portal-generated-check.d.ts`.
- **Design files unreferenced by code:** a case-insensitive search for
  "logbookfiles" across `Project/` source (excluding `node_modules`,
  `vendor`, `dist`) found no references; `reference/` materials appear to be
  design input only.
- **E2E browsers were unavailable** in the environment where this copy was
  made, so `app/frontend/e2e/` was copied unrun.

## Lean-copy omit log

Kept: all source, tests, assets, lockfiles (`composer.lock`,
`package-lock.json` at both app and archive levels), templates, docs,
`.env.example` files, committed generated types, mocks, `openapi/`,
nested `frontend/.github/`, backend vite scaffolding.

Omitted (generated / secrets / scratch / local-only):

- `app/`: `frontend/node_modules/`, `frontend/dist/`,
  `frontend/*.tsbuildinfo`, `frontend/vite.config.js` +
  `frontend/vite.config.d.ts` (both are generated output of the kept
  `vite.config.ts`), `backend/vendor/`, `backend/storage/logs/*.log`,
  the compiled view under `backend/storage/framework/views/`,
  `backend/bootstrap/cache/packages.php` + `services.php`,
  `backend/.phpunit.result.cache`, `backend/database/database.sqlite`,
  every real `.env` (`app/.env`, `app/backend/.env`; no frontend `.env` existed).
  Empty storage/framework dirs and all `.gitignore` placeholders were kept.
- `archive/v1/`: complete (4 HTML + 1 PNG, ~180K); no secrets/deps found.
- `archive/v2/`: kept README, `package.json` + lock, `index.html`, configs,
  `src/**`, `public/templates/*.pdf` (7 PDFs). Omitted: `node_modules/`,
  `dist/`, `.playwright-cli/`, 7 `scratch-*.ts` files, `scratch-out/`
  (signature artifacts, treated as sensitive), `visual-evidence/`, 6
  top-level `*.yml` Playwright snapshots, `*.tsbuildinfo`,
  `vite.config.js` / `.d.ts` (generated from `vite.config.ts`), and
  `src/lib/visual.tmp.test.ts` — clearly scratch: its suite is named
  "temporary official visual evidence" and it reads/writes only
  `/tmp/opencode/` sentinel files, skipping when they are absent.
- `reference/`: organized reorder of `LogbookFiles/` (42 artifacts, content-untouched,
  old→new index in `reference/README.md`).

## Sizes (this copy)

- `app/`: ~2.1M (backend ~872K, frontend ~1.3M)
- `archive/v1/`: ~180K
- `archive/v2/`: ~1.4M
- `reference/`: ~43M (design binaries dominate)
