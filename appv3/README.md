# Rizurf Logbook

Internship logbook monorepo: a React SPA (`frontend/`) backed by a versioned
Laravel 13 + Sanctum cookie-session API (`backend/`, served under `/api/v1`).

## Layout

- `frontend/` — React 19 + Vite SPA. API contract: `frontend/openapi/portal.yaml`.
  Dev/test only MSW mocks mirror the contract; production calls the same-origin API.
- `backend/` — Laravel 13 API (MariaDB, Sanctum SPA auth, ETag/`If-Match`
  optimistic concurrency, `Idempotency-Key` replays, RFC 9457 `problem+json`).
- `compose.yaml` / `docker/` — production-style packaging: nginx serves the
  prebuilt SPA with an SPA fallback and proxies `/api/*` + `/sanctum/*` to
  php-fpm; MariaDB persists in a volume.

## Run with Docker (serves SPA + API on one origin)

```sh
cp .env.example .env
# Optional: stable app key for sessions across restarts.
docker compose run --rm app php artisan key:generate --show
# Paste the output as APP_KEY in .env, then:
docker compose up --build
```

Open `http://localhost:8080` (or the port set via `APP_PORT` in `.env`;
default `8080` since `8000` is commonly occupied). Seed the demo workspace:

```sh
docker compose exec app php artisan migrate --seed
```

Demo logins (password from `backend/.env` `DEMO_PASSWORD`, default `password`
for local seeding): `aisha.rahman@student.example.edu` (student),
`sarah.lim@nusantara.example.com` (supervisor),
`maya.chen@university.example.edu` (mentor). Seeding is refused in production.

## Local development (without Docker)

Backend (MariaDB on `3306`, PHP 8.5):

```sh
cd backend
composer install
cp .env.example .env   # socket-auth defaults work with local MariaDB
php artisan migrate --seed
php artisan serve --port=8001   # configurable; 8000 may be occupied
```

Frontend:

```sh
cd frontend
npm ci
npm run dev
```

## CI

`.github/workflows/ci.yml` runs backend checks
(`composer validate`, Pint, Larastan, PHPUnit against MariaDB) plus the
frontend pipeline (OpenAPI drift check, ESLint, Vitest, production build) and
validates `compose.yaml`.
