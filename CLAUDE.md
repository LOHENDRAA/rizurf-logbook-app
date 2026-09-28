# intern-logbook

Phase 1 front-end prototype of the intern logbook, built before it moves into Rizurf's ERP gateway (Laravel on XAMPP). The spec is at `docs/superpowers/specs/2026-09-25-intern-logbook-prototype-design.md`. The implementation plan is in `docs/superpowers/plans/`.

## Rules
- `src/core/**` must not import Vue, Pinia, idb or docx-preview. It's the part that gets ported to the backend.
- Views never import `src/data/repository`. They go through a Pinia store.
- Store Vue state through `plain()` before it goes to IndexedDB (proxies can't be cloned).
- Detection must keep passing the fixture tests in `tests/unit/detect-*.test.ts`. The APU, Taylor's and PMU templates in `tests/fixtures/` came from the v14 app (`../Rizurf_Logbook`).
- Run `npm test` and `npm run e2e` before calling a change done.

## Known limits
- Scanned (image-only) PDFs have no text, so the supervisor places every placeholder by hand.
- In Word, anchors in tables nested more than one level deep, and cells merged vertically (vMerge), may not show on the page. The inspector warns about these, and the export still uses the XML anchor.
- PDF exports put cover pages first, then one copy of the unit pages per period.
- There's no real login. Roles are a switcher and data is per browser.
- If a university template is deleted, its students pick another under My internship, even after submitting periods; their old fills stay stored but are not shown.
