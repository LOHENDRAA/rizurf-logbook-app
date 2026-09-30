# Intern Logbook (Phase 1 prototype)

A front-end-only prototype of the intern logbook workflow:

- **Supervisors** upload a university's Word or PDF logbook template. The app highlights the placeholders it detects, and the supervisor fixes or adds any, then saves the template under the university's name.
- **Students** keep a daily notepad that saves itself, and build each period's logbook page. Fields fill in from the notepad and a live preview updates as they type.
- **Supervisors** approve each period with a typed signature, or send it back with a comment.
- **Students** export the approved periods as a filled Word or PDF file.

There's no backend. Data lives in the browser (IndexedDB). Use "Viewing as" at the top to switch between the supervisor and the demo students, and "Reset demo data" to start over.

## Run it

```bash
npm install
npm run dev
```
Then open http://localhost:5173/intern-logbook/.

## Serve it from XAMPP

```bash
npm run build
```
This writes to `C:\xampp\htdocs\intern-logbook`. Start Apache in the XAMPP control panel and open http://localhost/intern-logbook/.

## Server mode

By default everything is stored in the browser. That's how you test locally, and it needs no server.

A build that names the API saves everything to appv3's Laravel server instead, so interns and supervisors share one logbook. Hosting is split in two:
- **API and MySQL:** the company VPS (set up with `appv3/DEPLOY.md` in the `rizurf-logbook-app` repo);
- **These screens:** Hostinger.

**Try it against the VPS test server from your PC.** Create `.env.development.local` in this folder. It's git-ignored.

```ini
VITE_API_URL=/
API_PROXY=https://api.company.com
```

Then run:

```bash
npm run dev
```

The dev server forwards `/api` and `/sanctum` to the VPS, so the sign-in cookie works on localhost.

Sign in with a test-server account:
- `aisha.rahman@student.example.edu` (an intern);
- `sarah.lim@nusantara.example.com` (a supervisor).

Their password is the test server's `DEMO_PASSWORD`. Ask the VPS admin for it. This sign-in form is temporary; the Rizurf gateway replaces it.

**Build for Hostinger:**

```bash
VITE_API_URL=https://api.company.com npm run build
```

## Tests

```bash
npm test
```
Unit tests (Vitest) cover detection, fill, periods, autofill, workflow, storage and stores.

Browser tests use your installed Google Chrome (see playwright.config.ts).

```bash
npm run e2e
```

## Where things are

- `src/core/`: pure logic (detection, fill, periods, autofill, workflow). It has no Vue and no storage, so it can move server-side.
- `src/data/`: the `Repository` interface plus its IndexedDB implementation. Swap this for REST calls when this moves into the ERP gateway.
- `src/stores/`, `src/views/`, `src/components/`: the Vue UI.
- Design spec: `docs/superpowers/specs/2026-09-25-intern-logbook-prototype-design.md`
