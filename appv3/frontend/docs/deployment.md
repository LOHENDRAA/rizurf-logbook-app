# Deployment

## Topology

Serve the SPA and the Laravel API from the same site (same-origin or
sibling subdomains behind one parent domain) so the Sanctum HttpOnly
`Secure; SameSite=Lax` session cookie is sent with `credentials: 'include'`.
Cross-site third-party cookies are not supported.

- Same-origin (recommended): `https://app.example.edu/` serves `dist/`,
  `https://app.example.edu/api/v1` proxies to Laravel. Set
  `VITE_API_BASE_URL=` (empty).
- Explicit API origin: set `VITE_API_BASE_URL=https://api.example.edu`
  with CORS `Access-Control-Allow-Origin: https://app.example.edu` and
  `Access-Control-Allow-Credentials: true`. Both hosts must be HTTPS.

## SPA fallback

All non-file routes must serve `dist/index.html` (Laravel fallback route
or web-server `try_files`), preserving `/login`, `/dashboard`, `/journal`,
`/supervisor/*`, `/mentor/*`.

## Build

```sh
npm ci
npm run openapi:types   # regenerate src/api/generated.d.ts after contract edits
npm run openapi:lint    # contract shape check (runs in CI)
npm run lint
npm run build           # tsc + vite; VITE_ENABLE_MSW must be false/unset
npm run bundle:check    # asserts no demo passwords / MSW in dist
npx vitest run
```

## Content Security Policy (starter)

Fonts are currently loaded from Google Fonts (`@import` in `styles.css`).
Either self-host Inter under `/fonts` and drop the remote import, or
allowlist it:

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://api.example.edu;
img-src 'self' data:;
frame-ancestors 'none';
```

No inline secrets are used; the session lives in the HttpOnly cookie only.

## Environment matrix

| Env | `VITE_APP_ENV` | `VITE_API_BASE_URL` | `VITE_ENABLE_MSW` |
| --- | --- | --- | --- |
| dev (no backend) | development | empty | true |
| dev (with backend) | development | http://localhost:8000 | false |
| staging | staging | https://api.staging.example.edu | false |
| production | production | empty or https API | false (enforced) |
