# Intern Logbook Phase 1 Prototype: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a front-end-only Vue prototype, served from XAMPP, of the intern logbook workflow:
- Supervisors upload a Word or PDF template, then review, correct and add placeholders.
- Students keep a daily notepad that autosaves, and build each period's logbook page with auto-fill and a live preview.
- Supervisors approve a period or request changes.
- Students export the approved periods as a filled file in the template's own format.

**Architecture:** Three layers.
- `src/core/` is pure TypeScript: detection, fill, periods, autofill and workflow rules. It must not import Vue, Pinia or IndexedDB, so it can move server-side later.
- `src/data/` puts IndexedDB behind a `Repository` interface. This is the seam that becomes REST calls in the Laravel version.
- `src/stores/` (Pinia) plus `src/views/` and `src/components/` (Vue) form the UI. Views only talk to stores, and stores only talk to `Repository`.

**Tech Stack:** Vite, Vue 3, TypeScript, Pinia, Vue Router (hash history), pdfjs-dist 4.10.38 (legacy build), pdf-lib, JSZip, docx-preview, idb, Vitest (+ fake-indexeddb), and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-intern-logbook-prototype-design.md`. Read it before starting. It explains every rule the tasks below implement.

**Reference code:** the v14 app at `../Rizurf_Logbook/app/index.html`. Tasks 6–11 port its detection and fill logic, and cite line numbers from that file.

**Working directory for every command:** `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`. The shell is Git Bash on Windows.

## Global Constraints

- Node 24, npm 11. PHP/XAMPP is only used to serve the built files. There is no backend.
- Vite `base: '/intern-logbook/'`. `npm run build` writes to `C:/xampp/htdocs/intern-logbook`.
- Router uses `createWebHashHistory()`, so Apache needs no rewrite rules.
- `src/core/**` imports only `jszip`, `pdf-lib`, `pdfjs-dist` and other `src/core` files. No `vue`, `pinia`, `idb`, `docx-preview`, and no DOM globals except `Blob`/`File`.
- Only `src/data/**` touches IndexedDB. Views never import `src/data/repository`. They go through a store.
- Dates are ISO `YYYY-MM-DD` strings internally. Anything shown or exported uses `DD/MM/YYYY`.
- Notepad autosave runs 800 ms after typing stops, on blur, on `visibilitychange` → hidden, and on `pagehide`.
- PDF text is Helvetica. Sizes shrink from 10pt in 0.5pt steps to a minimum of 5.5pt, with line height 1.2 × size. Text that still doesn't fit goes onto "Continued entries" pages.
- The export file name is `<University>_<Student>_logbook.<ext>`, with every run of non-alphanumerics replaced by `_`.
- Only `.docx` and `.pdf` uploads are accepted.
- The demo students are "Aina Rahman" (`student-aina`) and "Daniel Lim" (`student-daniel`). The supervisor role is named "Supervisor".
- The current role is kept in `sessionStorage` under the key `il.role`.
- Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These five inputs aren't covered by the spec's own tests but are the most likely to hurt a real user. Each one gets a pinned test in the task that owns the code:

1. **XML-special characters and line breaks in notes** (`&`, `<`, `>`, newlines) must produce a valid Word document, with the text escaped and newlines turned into line breaks. Tested in Task 10.
2. **Non-Latin text, smart quotes and emoji** (Malay/Chinese names, “quotes”, ✅) must not crash the PDF export. Characters Helvetica can't encode become `?`. Tested in Task 11.
3. **"Today" in local time.** In Malaysia (UTC+8), typing at 00:30 must count as today, not yesterday. Tested in Task 2.
4. **The same university name with different case or spacing** (`" Taylor's  University "` vs `"taylor's university"`) must be treated as the same template, so saving it asks to overwrite. Tested in Task 12.
5. **Stale values after a template edit.** Values for placeholder IDs that no longer exist, and anchors that point at tables or pages that aren't there, must be skipped on export without crashing. Tested in Tasks 10 and 11.

---

## File map

```
intern-logbook/
  package.json  tsconfig.json  vite.config.ts  playwright.config.ts  index.html  .gitignore
  src/
    main.ts  App.vue  router.ts  styles.css  env.d.ts
    core/
      model.ts        types shared by everything
      ids.ts          newId()
      dates.ts        ISO date helpers, todayISO (local time), formatDMY
      periods.ts      buildPeriods(), periodForDate()
      autofill.ts     dayDate, sourceValue, autofill, signatureValue, resolveValues, isCoverField
      workflow.ts     submit/approve/requestChanges transitions, locking, emptyRequired, STATUS_TEXT
      template.ts     detectFromFile, validateTemplate, normalizeUniversity, findByUniversity, cloneTemplate
      docx/xml.ts     OOXML string helpers (scan, text, body blocks, cells, replace)
      detect/labels.ts   regexes ported from v14 + isPlaceholderOrBlank + defaultMarkerBinding
      detect/markers.ts  findMarkers(text)
      detect/docx.ts     readDocxXml, docxContext, detectDocx, region/anchor helpers
      detect/pdf.ts      detectPdf(pages)
      pdf/text.ts        extractPdfText(bytes) (pdf.js)
      fill/docx.ts       applyValues, fillDocx
      fill/pdfLayout.ts  wrap, layoutText, boxLayout, toWinAnsi
      fill/pdf.ts        fillPdf, getHelvetica
    data/
      repository.ts   Repository interface + repo()/setRepository()
      idb.ts          IdbRepository
      plain.ts        plain(): strip Vue proxies before storing
      seed.ts         DEMO_STUDENTS, ensureSeed, resetDemoData
    stores/  session.ts toast.ts templates.ts student.ts review.ts
    lib/     debounce.ts download.ts errors.ts pdfjs-browser.ts
    components/
      RoleSwitcher.vue ToastHost.vue StatusBadge.vue PlaceholderInspector.vue
      overlay/ bindingColors.ts PlaceholderBox.vue PdfPageLayer.vue docxAnchors.ts DocxLayer.vue TemplateOverlay.vue
    views/
      supervisor/ TemplatesList.vue TemplateEditor.vue ReviewQueue.vue ReviewDetail.vue
      student/    Onboarding.vue Notepad.vue Builder.vue Export.vue
  tests/
    fixtures/  apu.docx apu.pdf taylors.docx taylors.pdf pmu.pdf pmu.docx pmu_extra.docx
    unit/      setup.ts + *.test.ts
    e2e/       helpers.ts smoke.spec.ts template-pdf.spec.ts template-docx.spec.ts flow.spec.ts
```

---

### Task 1: Project scaffold, tooling and fixtures

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `.gitignore`, `src/env.d.ts`, `src/main.ts`, `src/App.vue`, `tests/unit/setup.ts`, `tests/unit/smoke.test.ts`
- Copy: `tests/fixtures/*` from `../Rizurf_Logbook/templates/`

**Interfaces:**
- Produces: `npm test` (Vitest, `tests/unit/**/*.test.ts`, node environment, pdf.js worker set up in `tests/unit/setup.ts`), `npm run e2e` (Playwright against `vite preview` on port 4173), `npm run build` (typecheck + build to XAMPP), `npm run typecheck`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "intern-logbook",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "typecheck": "vue-tsc --noEmit",
    "preview": "vite preview",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install vue vue-router pinia jszip pdf-lib pdfjs-dist@4.10.38 docx-preview idb
npm install -D vite @vitejs/plugin-vue typescript vue-tsc vitest @playwright/test fake-indexeddb @types/node
npx playwright install chromium
```
Expected: each command exits with code 0. `package.json` now lists the dependencies.

- [ ] **Step 3: Write the config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "isolatedModules": true,
    "resolveJsonModule": true,
    "useDefineForClassFields": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The built app is served by XAMPP's Apache at http://localhost/intern-logbook/.
export default defineConfig({
  base: '/intern-logbook/',
  plugins: [vue()],
  build: { outDir: 'C:/xampp/htdocs/intern-logbook', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 20000,
  },
});
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:4173', acceptDownloads: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite build --outDir dist && npx vite preview --outDir dist --port 4173 --strictPort',
    url: 'http://localhost:4173/intern-logbook/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Intern Logbook</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules/
dist/
test-results/
playwright-report/
```

`src/env.d.ts`:
```ts
/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
```

`src/App.vue` (temporary. Task 15 replaces it):
```vue
<template><h1>Intern Logbook</h1></template>
```

`src/main.ts` (temporary. Task 15 replaces it):
```ts
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

`tests/unit/setup.ts`:
```ts
// pdf.js needs to know where its worker module is, even in Node, where it
// runs the worker in-process ("fake worker").
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;
```

- [ ] **Step 4: Copy the template fixtures from v14**

Run:
```bash
mkdir -p tests/fixtures
cp ../Rizurf_Logbook/templates/apu/university_template.docx tests/fixtures/apu.docx
cp ../Rizurf_Logbook/templates/apu/university_template.pdf tests/fixtures/apu.pdf
cp ../Rizurf_Logbook/templates/taylors/template2.docx tests/fixtures/taylors.docx
cp ../Rizurf_Logbook/templates/taylors/template2.pdf tests/fixtures/taylors.pdf
cp ../Rizurf_Logbook/templates/pmu/uploaded_logbook.pdf tests/fixtures/pmu.pdf
cp ../Rizurf_Logbook/templates/pmu/logbook_replica.docx tests/fixtures/pmu.docx
cp ../Rizurf_Logbook/templates/pmu/logbook_extra_columns.docx tests/fixtures/pmu_extra.docx
ls tests/fixtures
```
Expected: 7 files listed.

- [ ] **Step 5: Write the smoke test**

`tests/unit/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('tooling', () => {
  it('loads a fixture PDF with pdf.js in Node', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../fixtures/pmu.pdf', import.meta.url)));
    const doc = await getDocument({ data: bytes }).promise;
    expect(doc.numPages).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run the unit tests and the build**

Run: `npm test`
Expected: `1 passed`.

Run: `npm run build`
Expected: the build succeeds and `C:/xampp/htdocs/intern-logbook/index.html` exists (`ls C:/xampp/htdocs/intern-logbook`).

If `vue-tsc` reports `Could not find a declaration file for module 'pdfjs-dist/legacy/build/pdf.mjs'`, create `src/pdfjs-shim.d.ts`:
```ts
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}
```
Then rerun `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Vue + TS prototype with test tooling and fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core model, IDs and date helpers

**Files:**
- Create: `src/core/model.ts`, `src/core/ids.ts`, `src/core/dates.ts`
- Test: `tests/unit/dates.test.ts`

**Interfaces:**
- Produces (every later task uses these exact names):
  - `model.ts` types: `Format`, `PeriodKind`, `Binding`, `Source`, `DateRole`, `PageRole`, `DayMode`, `PdfAnchor`, `DocxCellAnchor`, `DocxTextAnchor`, `DocxAnchor`, `Anchor`, `Placeholder`, `Template`, `Student`, `NotepadEntry`, `PeriodStatus`, `PeriodFill`, `ReviewAction`, `Period`.
  - `newId(prefix?: string): string`
  - `dates.ts`: `ISO_RE`, `parseISO(s): Date`, `toISO(d: Date): string` (UTC), `addDays(s, n): string`, `weekday(s): number` (0 = Sunday), `isWeekend(s): boolean`, `mondayOf(s): string`, `eachDay(start, end): string[]`, `formatDMY(s): string`, `monthLabel(ym): string`, `todayISO(now?: Date): string` (**local** date).

- [ ] **Step 1: Write the model**

`src/core/model.ts`:
```ts
export type Format = 'docx' | 'pdf';
export type PeriodKind = 'daily' | 'weekly' | 'monthly';
export type Binding = 'cover' | 'daily' | 'period' | 'date' | 'free' | 'signature';
export type Source = 'marker' | 'label' | 'manual';
export type DateRole = 'day' | 'start' | 'end' | 'range' | 'number';
export type PageRole = 'cover' | 'unit' | 'ignore';
export type DayMode = 'weekday' | 'nth';

/** PDF points, origin bottom-left (same space as pdf.js text and pdf-lib drawing). */
export interface PdfAnchor { kind: 'pdf'; page: number; x: number; y: number; w: number; h: number; whiteout?: boolean }
/** table = path of indices: [3] is the 4th top-level table, [3, 0] its first nested table. */
export interface DocxCellAnchor { kind: 'docx-cell'; table: number[]; row: number; col: number }
/** paragraph = index among ALL w:p in document order; start/end = char offsets in its joined run text. */
export interface DocxTextAnchor { kind: 'docx-text'; paragraph: number; start: number; end: number }
export type DocxAnchor = DocxCellAnchor | DocxTextAnchor;
export type Anchor = PdfAnchor | DocxAnchor;

export interface Placeholder {
  id: string;
  label: string;
  binding: Binding;
  dayIndex?: number;
  dayMode?: DayMode;
  dateRole?: DateRole;
  source: Source;
  region: 'cover' | 'unit';
  anchor: Anchor;
}

export interface Template {
  id: string;
  university: string;
  format: Format;
  fileName: string;
  fileBytes: ArrayBuffer;
  period: PeriodKind;
  pageRoles?: PageRole[];
  unitStartBlock?: number;
  placeholders: Placeholder[];
  updatedAt: string;
}

export interface Student {
  id: string;
  name: string;
  templateId?: string;
  startDate?: string;
  endDate?: string;
  coverValues: Record<string, string>;
}

export interface NotepadEntry { studentId: string; date: string; text: string; updatedAt: string }

export type PeriodStatus = 'draft' | 'submitted' | 'changes_requested' | 'approved';

export interface PeriodFill {
  studentId: string;
  periodKey: string;
  values: Record<string, string>;
  autofilled: Record<string, string>;
  status: PeriodStatus;
  submittedAt?: string;
}

export interface ReviewAction {
  id: string;
  studentId: string;
  periodKey: string;
  action: 'submit' | 'approve' | 'request_changes';
  by: string;
  signature?: string;
  comment?: string;
  at: string;
}

/** One reviewable period, already trimmed to the internship dates. */
export interface Period {
  key: string;          // 'd:2026-09-24' | 'w:2026-09-21' (Monday) | 'm:2026-09'
  kind: PeriodKind;
  index: number;        // 1-based
  start: string;
  end: string;
  label: string;
  workdays: string[];   // Mon–Fri dates inside [start, end]
}
```

`src/core/ids.ts`:
```ts
let counter = 0;

/** Unique enough for a single-browser prototype. It avoids crypto.randomUUID, which is missing on plain-http LAN addresses. */
export function newId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 2: Write the failing date tests**

`tests/unit/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addDays, eachDay, formatDMY, isWeekend, mondayOf, monthLabel, todayISO, weekday } from '../../src/core/dates';
import { newId } from '../../src/core/ids';

describe('dates', () => {
  it('knows weekdays (2026-09-25 is a Friday)', () => {
    expect(weekday('2026-09-25')).toBe(5);
    expect(isWeekend('2026-09-26')).toBe(true);
    expect(isWeekend('2026-09-25')).toBe(false);
  });
  it('finds the Monday of a week, across month ends', () => {
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(mondayOf('2026-10-01')).toBe('2026-09-28');
  });
  it('adds days and lists ranges inclusively', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(eachDay('2026-09-29', '2026-09-28')).toEqual([]);
  });
  it('formats for display', () => {
    expect(formatDMY('2026-09-05')).toBe('05/09/2026');
    expect(monthLabel('2026-12')).toBe('December 2026');
  });
  // Review Focus #3: "today" is the user's LOCAL date, not the UTC date.
  it('uses the local date for today, even just after local midnight', () => {
    expect(todayISO(new Date(2026, 8, 25, 0, 30))).toBe('2026-09-25');
    expect(todayISO(new Date(2026, 8, 25, 23, 59))).toBe('2026-09-25');
  });
  it('makes distinct ids', () => {
    expect(newId('ph')).toMatch(/^ph_/);
    expect(newId()).not.toBe(newId());
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/dates.test.ts`
Expected: FAIL. It can't resolve `../../src/core/dates`.

- [ ] **Step 4: Implement `src/core/dates.ts`**

```ts
export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar dates are handled in UTC so day arithmetic never trips over DST. */
export const parseISO = (s: string): Date => new Date(`${s}T00:00:00Z`);
export const toISO = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export const weekday = (s: string): number => parseISO(s).getUTCDay();
export const isWeekend = (s: string): boolean => { const w = weekday(s); return w === 0 || w === 6; };
export const mondayOf = (s: string): string => addDays(s, -((weekday(s) + 6) % 7));

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const formatDMY = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The user's local calendar date. toISOString() would give the UTC date, which is yesterday in Malaysia before 08:00. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/dates.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core tests/unit/dates.test.ts
git commit -m "feat(core): add shared model, ids and date helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Period generation

**Files:**
- Create: `src/core/periods.ts`
- Test: `tests/unit/periods.test.ts`

**Interfaces:**
- Consumes: `Period`, `PeriodKind` (model); `ISO_RE`, `eachDay`, `isWeekend`, `mondayOf`, `formatDMY`, `monthLabel` (dates).
- Produces: `buildPeriods(kind: PeriodKind, start: string, end: string): Period[]`, which throws `Error` for bad or reversed dates. Also `periodForDate(periods: Period[], date: string): Period | undefined`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/periods.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildPeriods, periodForDate } from '../../src/core/periods';

describe('buildPeriods', () => {
  it('weekly: Monday-keyed blocks trimmed to the internship, starting mid-week', () => {
    const p = buildPeriods('weekly', '2026-09-23', '2026-10-06');
    expect(p.map(x => x.key)).toEqual(['w:2026-09-21', 'w:2026-09-28', 'w:2026-10-05']);
    expect(p[0]).toMatchObject({ index: 1, start: '2026-09-23', end: '2026-09-27', workdays: ['2026-09-23', '2026-09-24', '2026-09-25'] });
    expect(p[1].workdays).toHaveLength(5);
    expect(p[2]).toMatchObject({ start: '2026-10-05', end: '2026-10-06' });
    expect(p[0].label).toBe('Week 1 · 23/09/2026 – 27/09/2026');
  });
  it('monthly: calendar months across a year boundary', () => {
    const p = buildPeriods('monthly', '2026-12-15', '2027-01-10');
    expect(p.map(x => x.key)).toEqual(['m:2026-12', 'm:2027-01']);
    expect(p[0].label).toBe('Month 1 · December 2026');
    expect(p[1]).toMatchObject({ start: '2027-01-01', end: '2027-01-10' });
  });
  it('daily: one period per weekday, skipping weekends', () => {
    const p = buildPeriods('daily', '2026-09-25', '2026-09-28');
    expect(p.map(x => x.key)).toEqual(['d:2026-09-25', 'd:2026-09-28']);
    expect(p[1]).toMatchObject({ index: 2, workdays: ['2026-09-28'] });
  });
  it('handles a single-day internship', () => {
    expect(buildPeriods('weekly', '2026-09-24', '2026-09-24')).toHaveLength(1);
  });
  it('rejects reversed or malformed dates', () => {
    expect(() => buildPeriods('weekly', '2026-10-01', '2026-09-01')).toThrow('End date must be on or after the start date');
    expect(() => buildPeriods('weekly', '01/09/2026', '2026-09-30')).toThrow('YYYY-MM-DD');
  });
  it('finds the period containing a date', () => {
    const p = buildPeriods('weekly', '2026-09-23', '2026-10-06');
    expect(periodForDate(p, '2026-09-30')?.key).toBe('w:2026-09-28');
    expect(periodForDate(p, '2026-11-01')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/periods.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/periods.ts`**

```ts
import type { Period, PeriodKind } from './model';
import { ISO_RE, eachDay, formatDMY, isWeekend, mondayOf, monthLabel } from './dates';

export function buildPeriods(kind: PeriodKind, start: string, end: string): Period[] {
  if (!ISO_RE.test(start) || !ISO_RE.test(end)) throw new Error('Dates must be in YYYY-MM-DD format.');
  if (end < start) throw new Error('End date must be on or after the start date.');
  const days = eachDay(start, end);

  if (kind === 'daily') {
    return days.filter(d => !isWeekend(d)).map((d, i) => ({
      key: `d:${d}`, kind, index: i + 1, start: d, end: d, label: `Day ${i + 1} · ${formatDMY(d)}`, workdays: [d],
    }));
  }

  // Map keeps insertion order, so groups come out chronologically.
  const groups = new Map<string, string[]>();
  for (const d of days) {
    const key = kind === 'weekly' ? `w:${mondayOf(d)}` : `m:${d.slice(0, 7)}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  let index = 0;
  return Array.from(groups, ([key, ds]) => {
    index += 1;
    const s = ds[0];
    const e = ds[ds.length - 1];
    const label = kind === 'weekly'
      ? `Week ${index} · ${formatDMY(s)} – ${formatDMY(e)}`
      : `Month ${index} · ${monthLabel(key.slice(2))}`;
    return { key, kind, index, start: s, end: e, label, workdays: ds.filter(d => !isWeekend(d)) };
  });
}

export function periodForDate(periods: Period[], date: string): Period | undefined {
  return periods.find(p => date >= p.start && date <= p.end);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/periods.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/periods.ts tests/unit/periods.test.ts
git commit -m "feat(core): generate daily, weekly and monthly periods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Autofill and value resolution

**Files:**
- Create: `src/core/autofill.ts`
- Test: `tests/unit/autofill.test.ts`

**Interfaces:**
- Consumes: `Placeholder`, `Period`, `ReviewAction` (model); `addDays`, `formatDMY`, `todayISO` (dates).
- Produces:
  - `isCoverField(ph): boolean`: true when `region === 'cover'` or `binding === 'cover'`.
  - `dayDate(ph, period): string | null`
  - `sourceValue(ph, period, notes: Record<string, string>): string | null`: `null` means the placeholder isn't auto-filled.
  - `autofill(placeholders, period, notes, values, autofilled): { values; autofilled }`
  - `signatureValue(ph, approval?: ReviewAction): string`
  - `resolveValues(placeholders, coverValues, fillValues, approval?): Record<string, string>`: the final text for every placeholder, used by the preview, review and export.

- [ ] **Step 1: Write the failing tests**

`tests/unit/autofill.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Placeholder, ReviewAction } from '../../src/core/model';
import { buildPeriods } from '../../src/core/periods';
import { autofill, dayDate, resolveValues, signatureValue, sourceValue } from '../../src/core/autofill';

const cell = { kind: 'docx-cell' as const, table: [0], row: 0, col: 0 };
const ph = (id: string, extra: Partial<Placeholder>): Placeholder =>
  ({ id, label: id, binding: 'free', source: 'label', region: 'unit', anchor: cell, ...extra });

// Week 1 is trimmed: the internship starts Wednesday 2026-09-23.
const week1 = buildPeriods('weekly', '2026-09-23', '2026-10-06')[0];
const notes = { '2026-09-23': 'Wed notes', '2026-09-24': 'Thu notes' };

describe('dayDate', () => {
  it('nth mode counts working days inside the trimmed period', () => {
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 0 }), week1)).toBe('2026-09-23');
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 4 }), week1)).toBeNull();
  });
  it('weekday mode counts from Monday and returns null outside the internship', () => {
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 0, dayMode: 'weekday' }), week1)).toBeNull();
    expect(dayDate(ph('a', { binding: 'daily', dayIndex: 2, dayMode: 'weekday' }), week1)).toBe('2026-09-23');
  });
});

describe('sourceValue', () => {
  it('fills dates by role', () => {
    expect(sourceValue(ph('d', { binding: 'date', dayIndex: 1 }), week1, notes)).toBe('24/09/2026');
    expect(sourceValue(ph('d', { binding: 'date', dateRole: 'start' }), week1, notes)).toBe('23/09/2026');
    expect(sourceValue(ph('d', { binding: 'date', dateRole: 'end' }), week1, notes)).toBe('27/09/2026');
    expect(sourceValue(ph('d', { binding: 'date', dateRole: 'number' }), week1, notes)).toBe('1');
    expect(sourceValue(ph('d', { binding: 'date' }), week1, notes)).toBe('23/09/2026 – 27/09/2026');
  });
  it('does not autofill cover, period, free or signature placeholders', () => {
    for (const binding of ['period', 'free', 'signature'] as const) expect(sourceValue(ph('x', { binding }), week1, notes)).toBeNull();
    expect(sourceValue(ph('x', { binding: 'daily', region: 'cover', dayIndex: 0 }), week1, notes)).toBeNull();
  });
});

describe('autofill', () => {
  const phs = [ph('mon', { binding: 'daily', dayIndex: 0 }), ph('tue', { binding: 'daily', dayIndex: 1 }), ph('q', { binding: 'period' })];
  it('fills empty fields and records what it used', () => {
    const r = autofill(phs, week1, notes, {}, {});
    expect(r.values).toEqual({ mon: 'Wed notes', tue: 'Thu notes' });
    expect(r.autofilled).toEqual({ mon: 'Wed notes', tue: 'Thu notes' });
  });
  it('never overwrites a field the student edited', () => {
    const r = autofill(phs, week1, { ...notes, '2026-09-23': 'New' }, { mon: 'My own words' }, { mon: 'Wed notes' });
    expect(r.values.mon).toBe('My own words');
  });
  it('refreshes a field that still holds the previous autofill', () => {
    const r = autofill(phs, week1, { ...notes, '2026-09-23': 'New' }, { mon: 'Wed notes' }, { mon: 'Wed notes' });
    expect(r.values.mon).toBe('New');
    expect(r.autofilled.mon).toBe('New');
  });
});

describe('resolveValues', () => {
  const approval: ReviewAction = { id: 'r', studentId: 's', periodKey: 'w:x', action: 'approve', by: 'Supervisor', signature: 'Nur Aziz', at: new Date(2026, 8, 30, 10).toISOString() };
  it('takes cover, period and signature values from the right source', () => {
    const phs = [
      ph('name', { binding: 'cover', region: 'cover' }),
      ph('task', { binding: 'daily', dayIndex: 0 }),
      ph('sig', { binding: 'signature', label: 'Supervisor signature' }),
      ph('sigdate', { binding: 'signature', label: 'Date' }),
    ];
    expect(resolveValues(phs, { name: 'Aina' }, { task: 'Did things', name: 'ignored' }, approval))
      .toEqual({ name: 'Aina', task: 'Did things', sig: 'Nur Aziz', sigdate: '30/09/2026' });
  });
  it('leaves signatures blank before approval', () => {
    expect(signatureValue(ph('sig', { binding: 'signature' }))).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/autofill.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/autofill.ts`**

```ts
import type { Period, Placeholder, ReviewAction } from './model';
import { addDays, formatDMY, todayISO } from './dates';

/** Cover fields are filled once per student (Student.coverValues), not per period. */
export const isCoverField = (ph: Placeholder): boolean => ph.region === 'cover' || ph.binding === 'cover';

/** The calendar day a per-day placeholder stands for in this period, or null if none. */
export function dayDate(ph: Placeholder, period: Period): string | null {
  const n = ph.dayIndex ?? 0;
  if (ph.dayMode === 'weekday' && period.kind === 'weekly') {
    const d = addDays(period.key.slice(2), n); // key is 'w:<Monday>'
    return d >= period.start && d <= period.end ? d : null;
  }
  return period.workdays[n] ?? null;
}

/** What autofill would put in this placeholder, or null if it's never auto-filled. */
export function sourceValue(ph: Placeholder, period: Period, notes: Record<string, string>): string | null {
  if (isCoverField(ph) || ph.binding === 'signature') return null;
  if (ph.binding === 'daily') {
    const d = dayDate(ph, period);
    return d ? (notes[d] ?? '') : '';
  }
  if (ph.binding === 'date') {
    const role = ph.dateRole ?? (ph.dayIndex != null ? 'day' : 'range');
    if (role === 'day') { const d = dayDate(ph, period); return d ? formatDMY(d) : ''; }
    if (role === 'start') return formatDMY(period.start);
    if (role === 'end') return formatDMY(period.end);
    if (role === 'number') return String(period.index);
    return `${formatDMY(period.start)} – ${formatDMY(period.end)}`;
  }
  return null;
}

/**
 * Fills a placeholder only when it's empty or still holds exactly what the
 * last autofill put there, so the student's own edits always survive.
 */
export function autofill(
  placeholders: Placeholder[],
  period: Period,
  notes: Record<string, string>,
  values: Record<string, string>,
  autofilled: Record<string, string>,
): { values: Record<string, string>; autofilled: Record<string, string> } {
  const v = { ...values };
  const a = { ...autofilled };
  for (const ph of placeholders) {
    const src = sourceValue(ph, period, notes);
    if (src == null) continue;
    const cur = v[ph.id] ?? '';
    if (cur !== '' && cur !== (a[ph.id] ?? '')) continue;
    if (src === '' && cur === '') continue;
    v[ph.id] = src;
    a[ph.id] = src;
  }
  return { values: v, autofilled: a };
}

export function signatureValue(ph: Placeholder, approval?: ReviewAction): string {
  if (!approval) return '';
  return /date/i.test(ph.label) ? formatDMY(todayISO(new Date(approval.at))) : (approval.signature ?? '');
}

export function resolveValues(
  placeholders: Placeholder[],
  coverValues: Record<string, string>,
  fillValues: Record<string, string>,
  approval?: ReviewAction,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ph of placeholders) {
    if (ph.binding === 'signature') out[ph.id] = signatureValue(ph, approval);
    else if (isCoverField(ph)) out[ph.id] = coverValues[ph.id] ?? '';
    else out[ph.id] = fillValues[ph.id] ?? '';
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/autofill.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/autofill.ts tests/unit/autofill.test.ts
git commit -m "feat(core): autofill from notepad and resolve final values

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Review workflow rules

**Files:**
- Create: `src/core/workflow.ts`
- Test: `tests/unit/workflow.test.ts`

**Interfaces:**
- Consumes: `PeriodFill`, `PeriodStatus`, `Placeholder`, `ReviewAction` (model); `newId`.
- Produces:
  - `STATUS_TEXT: Record<PeriodStatus, string>`
  - `isLocked(fill?: PeriodFill): boolean`
  - `emptyFill(studentId, periodKey): PeriodFill`
  - `submitFill(fill, by, now?)`, `approveFill(fill, by, signature, now?)` and `requestChangesFill(fill, by, comment, now?)`. Each returns `{ fill: PeriodFill; action: ReviewAction }` and throws on an illegal transition.
  - `canChangeSetup(fills: PeriodFill[]): boolean`
  - `latestAction(actions, studentId, periodKey, kind?): ReviewAction | undefined`
  - `emptyRequired(placeholders, values): Placeholder[]`

- [ ] **Step 1: Write the failing tests**

`tests/unit/workflow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Placeholder, ReviewAction } from '../../src/core/model';
import { approveFill, canChangeSetup, emptyFill, emptyRequired, isLocked, latestAction, requestChangesFill, submitFill } from '../../src/core/workflow';

const now = new Date('2026-09-25T03:00:00Z');

describe('workflow', () => {
  it('submits a draft and locks it', () => {
    const { fill, action } = submitFill(emptyFill('s1', 'w:2026-09-21'), 'Aina Rahman', now);
    expect(fill.status).toBe('submitted');
    expect(fill.submittedAt).toBe(now.toISOString());
    expect(action).toMatchObject({ action: 'submit', by: 'Aina Rahman', studentId: 's1', periodKey: 'w:2026-09-21' });
    expect(isLocked(fill)).toBe(true);
  });
  it('approves only submitted periods and needs a typed name', () => {
    const submitted = submitFill(emptyFill('s1', 'k'), 'A', now).fill;
    expect(() => approveFill(submitted, 'Supervisor', '   ', now)).toThrow('Type your full name');
    const { fill, action } = approveFill(submitted, 'Supervisor', 'Nur Aziz', now);
    expect(fill.status).toBe('approved');
    expect(action.signature).toBe('Nur Aziz');
    expect(() => approveFill(emptyFill('s1', 'k'), 'Supervisor', 'X', now)).toThrow("isn't waiting for review");
  });
  it('requests changes with a comment and allows resubmission', () => {
    const submitted = submitFill(emptyFill('s1', 'k'), 'A', now).fill;
    expect(() => requestChangesFill(submitted, 'Supervisor', '', now)).toThrow('Write what needs to change');
    const back = requestChangesFill(submitted, 'Supervisor', 'More detail', now).fill;
    expect(back.status).toBe('changes_requested');
    expect(isLocked(back)).toBe(false);
    expect(submitFill(back, 'A', now).fill.status).toBe('submitted');
  });
  it('refuses to resubmit an approved period', () => {
    const approved = approveFill(submitFill(emptyFill('s', 'k'), 'A', now).fill, 'S', 'N', now).fill;
    expect(() => submitFill(approved, 'A', now)).toThrow("Can't submit");
  });
  it('allows changing setup only while everything is draft', () => {
    expect(canChangeSetup([])).toBe(true);
    expect(canChangeSetup([emptyFill('s', 'a')])).toBe(true);
    expect(canChangeSetup([submitFill(emptyFill('s', 'a'), 'A', now).fill])).toBe(false);
  });
  it('picks the latest action of a kind', () => {
    const a = (at: string, action: ReviewAction['action']): ReviewAction => ({ id: at, studentId: 's', periodKey: 'k', action, by: 'x', at });
    const list = [a('2026-09-01T00:00:00Z', 'request_changes'), a('2026-09-03T00:00:00Z', 'request_changes'), a('2026-09-02T00:00:00Z', 'submit')];
    expect(latestAction(list, 's', 'k', 'request_changes')?.id).toBe('2026-09-03T00:00:00Z');
    expect(latestAction(list, 's', 'k')?.id).toBe('2026-09-03T00:00:00Z');
    expect(latestAction(list, 's', 'other')).toBeUndefined();
  });
  it('lists empty required placeholders (not free or signature)', () => {
    const anchor = { kind: 'docx-cell' as const, table: [0], row: 0, col: 0 };
    const p = (id: string, binding: Placeholder['binding']): Placeholder => ({ id, label: id, binding, source: 'label', region: 'unit', anchor });
    const phs = [p('a', 'daily'), p('b', 'free'), p('c', 'signature'), p('d', 'period'), p('e', 'cover')];
    expect(emptyRequired(phs, { d: 'answered', e: '  ' }).map(x => x.id)).toEqual(['a', 'e']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/workflow.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/workflow.ts`**

```ts
import type { PeriodFill, PeriodStatus, Placeholder, ReviewAction } from './model';
import { newId } from './ids';

export const STATUS_TEXT: Record<PeriodStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

export const isLocked = (fill?: PeriodFill): boolean => !!fill && (fill.status === 'submitted' || fill.status === 'approved');

export const emptyFill = (studentId: string, periodKey: string): PeriodFill =>
  ({ studentId, periodKey, values: {}, autofilled: {}, status: 'draft' });

function action(fill: PeriodFill, kind: ReviewAction['action'], by: string, at: string, extra: Partial<ReviewAction> = {}): ReviewAction {
  return { id: newId('ra'), studentId: fill.studentId, periodKey: fill.periodKey, action: kind, by, at, ...extra };
}

export function submitFill(fill: PeriodFill, by: string, now = new Date()) {
  if (fill.status !== 'draft' && fill.status !== 'changes_requested') throw new Error(`Can't submit a period that is ${STATUS_TEXT[fill.status].toLowerCase()}.`);
  const at = now.toISOString();
  return { fill: { ...fill, status: 'submitted' as const, submittedAt: at }, action: action(fill, 'submit', by, at) };
}

export function approveFill(fill: PeriodFill, by: string, signature: string, now = new Date()) {
  if (fill.status !== 'submitted') throw new Error("This period isn't waiting for review.");
  if (!signature.trim()) throw new Error('Type your full name to sign the approval.');
  const at = now.toISOString();
  return { fill: { ...fill, status: 'approved' as const }, action: action(fill, 'approve', by, at, { signature: signature.trim() }) };
}

export function requestChangesFill(fill: PeriodFill, by: string, comment: string, now = new Date()) {
  if (fill.status !== 'submitted') throw new Error("This period isn't waiting for review.");
  if (!comment.trim()) throw new Error('Write what needs to change.');
  const at = now.toISOString();
  return { fill: { ...fill, status: 'changes_requested' as const }, action: action(fill, 'request_changes', by, at, { comment: comment.trim() }) };
}

export const canChangeSetup = (fills: PeriodFill[]): boolean => fills.every(f => f.status === 'draft');

export function latestAction(actions: ReviewAction[], studentId: string, periodKey: string, kind?: ReviewAction['action']): ReviewAction | undefined {
  return actions
    .filter(a => a.studentId === studentId && a.periodKey === periodKey && (!kind || a.action === kind))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function emptyRequired(placeholders: Placeholder[], values: Record<string, string>): Placeholder[] {
  return placeholders.filter(p => p.binding !== 'free' && p.binding !== 'signature' && !(values[p.id] ?? '').trim());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/workflow.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow.ts tests/unit/workflow.test.ts
git commit -m "feat(core): submit/approve/request-changes rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Word XML helpers

**Files:**
- Create: `src/core/docx/xml.ts`
- Test: `tests/unit/xml.test.ts`

**Interfaces:**
- Produces:
  - Types: `Block { start; end; full; selfClosing }`, `BodyBlock extends Block { tag }`, `CellLoc { table: number[]; row; col; start; end }`. All offsets are absolute in the document XML string.
  - `xmlEscape(s)`, `xmlUnescape(s)`, `scanBlocks(xml, tag): Block[]` (top-level blocks of that tag only), `textOf(fragment)`, `cellText(cellFull)`
  - `bodyRange(xml): { start; end }`, `bodyBlocks(xml): BodyBlock[]`, `allParagraphs(xml): Block[]`
  - `tableAt(xml, path): Block | undefined`, `cellIndex(xml): CellLoc[]`
  - `runXml(rPr, text)`, `replaceCellContent(cellFull, text)`, `replaceTextRange(pFull, start, end, text)`

`scanBlocks`, `textOf`, `cellText` and `xmlUnescape` are ported verbatim from v14 `index.html:1377-1394`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/xml.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { allParagraphs, bodyBlocks, cellIndex, cellText, replaceCellContent, replaceTextRange, scanBlocks, tableAt, textOf } from '../../src/core/docx/xml';

const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const tc = (inner: string) => `<w:tc><w:tcPr><w:tcW w:w="100"/></w:tcPr>${inner}</w:tc>`;
const nested = `<w:tbl><w:tr>${tc(p('inner'))}</w:tr></w:tbl>`;
const doc = `<w:document><w:body>${p('Title')}<w:tbl><w:tr>${tc(p('Name'))}${tc(p('') + nested)}</w:tr></w:tbl><w:p/><w:sectPr/></w:body></w:document>`;

describe('xml helpers', () => {
  it('scans only top-level blocks', () => {
    expect(scanBlocks(doc, 'w:tbl')).toHaveLength(1);
  });
  it('lists body blocks in order with tags', () => {
    expect(bodyBlocks(doc).map(b => b.tag)).toEqual(['w:p', 'w:tbl', 'w:p', 'w:sectPr']);
  });
  it('lists every paragraph in document order, including inside tables and self-closing ones', () => {
    expect(allParagraphs(doc).map(b => textOf(b.full))).toEqual(['Title', 'Name', '', 'inner', '']);
  });
  it('indexes cells including one nested level', () => {
    const cells = cellIndex(doc);
    expect(cells.map(c => `${c.table.join('.')}:${c.row}:${c.col}`)).toEqual(['0:0:0', '0:0:1', '0.0:0:0']);
    const inner = cells[2];
    expect(cellText(doc.slice(inner.start, inner.end))).toBe('inner');
    expect(tableAt(doc, [0, 0])?.full.startsWith('<w:tbl>')).toBe(true);
    expect(tableAt(doc, [5])).toBeUndefined();
  });
  it('replaces a cell, keeping tcPr and run formatting, escaping and breaking lines', () => {
    const cell = tc('<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>old</w:t></w:r></w:p>');
    const out = replaceCellContent(cell, 'A & B <c>\nline 2');
    expect(out).toContain('<w:tcPr><w:tcW w:w="100"/></w:tcPr>');
    expect(out).toContain('<w:jc w:val="left"/>');
    expect(out).toContain('<w:rPr><w:b/></w:rPr>');
    expect(out).toContain('A &amp; B &lt;c&gt;</w:t><w:br/><w:t xml:space="preserve">line 2');
    expect(out).not.toContain('old');
  });
  it('replaces a character range across runs', () => {
    const para = '<w:p><w:r><w:t>Name: &lt;na</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>me&gt; end</w:t></w:r></w:p>';
    expect(textOf(replaceTextRange(para, 6, 12, 'Aina'))).toBe('Name: Aina end');
  });
  it('inserts at the end of a paragraph with a separating space', () => {
    expect(textOf(replaceTextRange(p('Week'), 4, 4, '3'))).toBe('Week 3');
    expect(textOf(replaceTextRange('<w:p/>', 0, 0, 'Hello'))).toBe('Hello');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/xml.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/docx/xml.ts`**

```ts
export interface Block { start: number; end: number; full: string; selfClosing: boolean }
export interface BodyBlock extends Block { tag: string }
export interface CellLoc { table: number[]; row: number; col: number; start: number; end: number }

export const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const xmlUnescape = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Top-level blocks of one tag (nested ones of the same tag are inside them). Ported from v14 index.html:1379. */
export function scanBlocks(xml: string, tag: string): Block[] {
  const re = new RegExp(`<(\\/?)${tag}(\\s[^>]*?)?(\\/?)>`, 'g');
  const blocks: Block[] = [];
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const closing = m[1] === '/';
    const selfClosing = m[3] === '/';
    if (selfClosing) {
      if (depth === 0) blocks.push({ start: m.index, end: m.index + m[0].length, full: m[0], selfClosing: true });
      continue;
    }
    if (!closing) { if (depth === 0) start = m.index; depth++; }
    else {
      depth--;
      if (depth === 0) blocks.push({ start, end: m.index + m[0].length, full: xml.slice(start, m.index + m[0].length), selfClosing: false });
    }
  }
  return blocks;
}

export function textOf(fragment: string): string {
  const m = fragment.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
  return xmlUnescape(m.map(t => t.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '')).join(''));
}

export const cellText = (cellFull: string): string =>
  scanBlocks(cellFull, 'w:p').map(p => textOf(p.full)).join(' ').replace(/\s+/g, ' ').trim();

export function bodyRange(xml: string): { start: number; end: number } {
  const open = xml.match(/<w:body(?:\s[^>]*)?>/);
  const end = xml.lastIndexOf('</w:body>');
  if (!open || open.index == null || end < 0) throw new Error('This file has no Word document body.');
  return { start: open.index + open[0].length, end };
}

/** Direct children of <w:body> (paragraphs, tables, content controls, the final sectPr), in order. */
export function bodyBlocks(xml: string): BodyBlock[] {
  const { start, end } = bodyRange(xml);
  const re = /<(\/?)(w:[A-Za-z]+)(?:\s[^>]*?)?(\/?)>/g;
  re.lastIndex = start;
  const out: BodyBlock[] = [];
  let depth = 0;
  let cur: { tag: string; start: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < end) {
    const [tok, closing, tag, self] = m;
    if (self) {
      if (depth === 0) out.push({ tag, start: m.index, end: m.index + tok.length, full: tok, selfClosing: true });
      continue;
    }
    if (!closing) { if (depth === 0) cur = { tag, start: m.index }; depth++; }
    else {
      depth--;
      if (depth === 0 && cur) {
        const e = m.index + tok.length;
        out.push({ tag: cur.tag, start: cur.start, end: e, full: xml.slice(cur.start, e), selfClosing: false });
        cur = null;
      }
    }
  }
  return out;
}

/** Every <w:p> in document order, including ones inside tables. (Text boxes, which nest paragraphs, aren't supported.) */
export function allParagraphs(xml: string): Block[] {
  const re = /<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  const out: Block[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ start: m.index, end: m.index + m[0].length, full: m[0], selfClosing: m[0].endsWith('/>') });
  return out;
}

function innerOf(b: Block): { full: string; offset: number } {
  const open = b.full.indexOf('>') + 1;
  const close = b.full.lastIndexOf('</');
  return { full: b.full.slice(open, close), offset: b.start + open };
}
const shift = (b: Block, by: number): Block => ({ ...b, start: b.start + by, end: b.end + by });

export function tableAt(xml: string, path: number[]): Block | undefined {
  const top = scanBlocks(xml, 'w:tbl')[path[0]];
  if (!top || path.length === 1) return top;
  if (path.length > 2) return undefined;
  const inner = innerOf(top);
  const n = scanBlocks(inner.full, 'w:tbl')[path[1]];
  return n && shift(n, inner.offset);
}

function collectCells(t: Block, path: number[], out: CellLoc[]) {
  scanBlocks(t.full, 'w:tr').forEach((r, ri) =>
    scanBlocks(r.full, 'w:tc').forEach((c, ci) =>
      out.push({ table: path, row: ri, col: ci, start: t.start + r.start + c.start, end: t.start + r.start + c.end })));
}

/** Every cell of every top-level table and of tables nested one level deep. */
export function cellIndex(xml: string): CellLoc[] {
  const out: CellLoc[] = [];
  scanBlocks(xml, 'w:tbl').forEach((t, ti) => {
    collectCells(t, [ti], out);
    const inner = innerOf(t);
    scanBlocks(inner.full, 'w:tbl').forEach((n, ni) => collectCells(shift(n, inner.offset), [ti, ni], out));
  });
  return out;
}

export function runXml(rPr: string, text: string): string {
  const parts = text.split(/\r?\n/).map(l => `<w:t xml:space="preserve">${xmlEscape(l)}</w:t>`).join('<w:br/>');
  return `<w:r>${rPr}${parts}</w:r>`;
}

/** Replaces a cell's paragraphs with one paragraph holding `text`, keeping the cell's
 *  tcPr and the first paragraph's pPr and first run's rPr, so it looks like the template. */
export function replaceCellContent(cellFull: string, text: string): string {
  const open = cellFull.match(/^<w:tc(?:\s[^>]*)?>/)?.[0] ?? '<w:tc>';
  const tcPr = cellFull.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>|<w:tcPr\/>/)?.[0] ?? '';
  const firstP = scanBlocks(cellFull, 'w:p')[0]?.full ?? '';
  const pPr = firstP.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const run = firstP.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/)?.[0] ?? '';
  const rPr = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  return `${open}${tcPr}<w:p>${pPr}${runXml(rPr, text)}</w:p></w:tc>`;
}

function setRunText(rFull: string, content: string): string {
  const open = rFull.match(/^<w:r(?:\s[^>]*)?>/)?.[0] ?? '<w:r>';
  const rPr = rFull.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  if (!content) return `${open}${rPr}</w:r>`;
  return runXml(rPr, content).replace(/^<w:r>/, open);
}

/**
 * Replaces characters [start, end) of a paragraph's joined run text with `text`.
 * The first touched run takes the new text (and keeps its formatting), and later
 * touched runs lose the replaced part. start === end inserts text there, with a
 * leading space when it's glued to a word.
 */
export function replaceTextRange(pFull: string, start: number, end: number, text: string): string {
  const p = pFull.endsWith('/>') ? `${pFull.slice(0, -2)}></w:p>` : pFull;
  const runs = scanBlocks(p, 'w:r');
  const full = runs.map(r => textOf(r.full)).join('');
  let value = text;
  if (start === end && start > 0 && !/\s$/.test(full.slice(0, start))) value = ` ${value}`;
  if (!runs.length) return `${p.slice(0, -'</w:p>'.length)}${runXml('', value)}</w:p>`;

  const edits: { block: Block; replacement: string }[] = [];
  let pos = 0;
  let placed = false;
  for (const r of runs) {
    const t = textOf(r.full);
    const rs = pos;
    const re = pos + t.length;
    pos = re;
    const touches = start === end ? !placed && start >= rs && start <= re : re > start && rs < end;
    if (!touches) continue;
    const before = t.slice(0, Math.max(0, start - rs));
    const after = end - rs < t.length ? t.slice(Math.max(0, end - rs)) : '';
    edits.push({ block: r, replacement: setRunText(r.full, before + (placed ? '' : value) + after) });
    placed = true;
  }
  if (!placed) {
    const last = runs[runs.length - 1];
    edits.push({ block: last, replacement: setRunText(last.full, textOf(last.full) + value) });
  }
  let out = p;
  for (const e of edits.sort((a, b) => b.block.start - a.block.start)) out = out.slice(0, e.block.start) + e.replacement + out.slice(e.block.end);
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/xml.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/docx tests/unit/xml.test.ts
git commit -m "feat(core): OOXML string helpers for detection and fill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Label patterns and marker detection

**Files:**
- Create: `src/core/detect/labels.ts`, `src/core/detect/markers.ts`
- Test: `tests/unit/markers.test.ts`

**Interfaces:**
- Produces:
  - `labels.ts`: `COVER_KEYS`, `matchCoverKey(label): string | null`, `WEEK_RE`, `WEEK_START_RE`, `START_RE`, `END_RE`, `OBJ_RE`, `CONTENT_RE`, `WEEKDAY_RE`, `DAYN_RE`, `QNUM_RE`, `TASK_RE`, `TOOLS_RE`, `LESSON_RE`, `BRACKET_ONLY_RE`, `SUPERVISOR_ONLY_RE`, `SIGNATURE_RE`, `WEEKDAYS` (`['monday',…,'friday']`), `isPlaceholderOrBlank(s)`, `defaultMarkerBinding(label): Binding`
  - `markers.ts`: `MarkerHit { start; end; text; label; kind: 'bracket' | 'line' }` and `findMarkers(text): MarkerHit[]` (sorted by `start`).

The regexes are copied from v14 `index.html:1416-1477`. One change: `WEEK_RE` also matches month rows.

- [ ] **Step 1: Write the failing tests**

`tests/unit/markers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findMarkers } from '../../src/core/detect/markers';
import { defaultMarkerBinding, isPlaceholderOrBlank, matchCoverKey, WEEK_RE } from '../../src/core/detect/labels';

describe('findMarkers', () => {
  it('finds bracket markers with their inner text as label', () => {
    const hits = findMarkers('Name: {{ student_name }} ID [Matric No] on <insert date>');
    expect(hits.map(h => [h.label, h.kind])).toEqual([['student_name', 'bracket'], ['Matric No', 'bracket'], ['insert date', 'bracket']]);
    expect('Name: {{ student_name }}'.slice(hits[0].start, hits[0].end)).toBe('{{ student_name }}');
  });
  it('labels blank lines with the text before them', () => {
    const hits = findMarkers('Name: ________  Date: ..........');
    expect(hits.map(h => h.label)).toEqual(['Name', 'Date']);
    expect(hits.every(h => h.kind === 'line')).toBe(true);
  });
  it('ignores empty checkboxes, short ellipses and normal prose', () => {
    expect(findMarkers('Tick [ ] if done... then continue')).toEqual([]);
  });
  it('treats a unicode ellipsis run as a blank', () => {
    expect(findMarkers('Remarks: ……')).toHaveLength(1);
  });
});

describe('label patterns', () => {
  it('recognises cover labels and blanks', () => {
    expect(matchCoverKey("Student's Name")).toBe('studentName');
    expect(matchCoverKey('Hobbies')).toBeNull();
    expect(isPlaceholderOrBlank('  ')).toBe(true);
    expect(isPlaceholderOrBlank('<date>')).toBe(true);
    expect(isPlaceholderOrBlank('______')).toBe(true);
    expect(isPlaceholderOrBlank('Monday')).toBe(false);
  });
  it('matches week and month rows but not "weekly"', () => {
    expect(WEEK_RE.test('Week 3')).toBe(true);
    expect(WEEK_RE.test('Month:')).toBe(true);
    expect(WEEK_RE.test('Weekly report')).toBe(false);
  });
  it('picks default bindings for markers', () => {
    expect(defaultMarkerBinding('Supervisor signature')).toBe('signature');
    expect(defaultMarkerBinding('insert date')).toBe('date');
    expect(defaultMarkerBinding('Name')).toBe('free');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/markers.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement `src/core/detect/labels.ts`**

```ts
import type { Binding } from '../model';

// Ported from v14 index.html:1416-1477 (TMPL_* constants).
export const COVER_KEYS: [RegExp, string][] = [
  [/student\s*id|matric|registration\s*no|student\s*no/i, 'studentId'],
  [/student['’]?s?\s*name|intern['’]?s?\s*name|^name$|full\s*name/i, 'studentName'],
  [/company\s*name|organi[sz]ation|employer|internship\s*site|training\s*site|host\s*company|^company$/i, 'companyName'],
  [/university|institution/i, 'university'],
  [/programme|program|course/i, 'programme'],
  [/duration|period|internship\s*period|placement\s*period/i, 'duration'],
  [/supervisor/i, 'supervisor'],
  [/position|job\s*title|\brole\b/i, 'position'],
];
export const matchCoverKey = (label: string): string | null => COVER_KEYS.find(([re]) => re.test(label))?.[1] ?? null;

/** v14's TMPL_WEEK_RE plus month rows, so monthly templates find their repeating unit too. */
export const WEEK_RE = /^week\b|week\s*no|week\s*number|^month\b|month\s*no/i;
export const WEEK_START_RE = /week\s*(beginning|starting|commencing|of\b)/i;
export const START_RE = /start\s*date|date\s*from|from\s*date|commenc/i;
export const END_RE = /end\s*date|date\s*to|to\s*date|complet/i;
export const OBJ_RE = /object|activit|task|duties|assignment/i;
export const CONTENT_RE = /content|description|reflect|learn|knowledge|experience|summary/i;
export const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday)\b/i;
export const DAYN_RE = /^day\s*(\d{1,2})\s*[:.]?\s*$/i;
export const QNUM_RE = /^(q\s*)?\d{1,2}\s*[.)]?$/i;
export const TASK_RE = /task|operation|activit|work\s*done|duties/i;
export const TOOLS_RE = /tool|equipment|platform|resource/i;
export const LESSON_RE = /lesson|learn(ed)?|takeaway|reflect/i;
export const BRACKET_ONLY_RE = /^<[^<>]{1,80}>$/;
export const SUPERVISOR_ONLY_RE = /remark|comment|signature|stamp|official\s*use|endorse/i;
export const SIGNATURE_RE = /signature|signed\s*by/i;
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export function isPlaceholderOrBlank(s: string | undefined): boolean {
  const t = (s ?? '').trim();
  return t === '' || BRACKET_ONLY_RE.test(t) || /^\[[^\]]*\]$/.test(t) || /^_{3,}$/.test(t) || /^\.{5,}$/.test(t) || /^…{2,}$/.test(t);
}

export function defaultMarkerBinding(label: string): Binding {
  if (SIGNATURE_RE.test(label)) return 'signature';
  if (/date/i.test(label)) return 'date';
  return 'free';
}
```

- [ ] **Step 4: Implement `src/core/detect/markers.ts`**

```ts
export interface MarkerHit { start: number; end: number; text: string; label: string; kind: 'bracket' | 'line' }

const BRACKET_RE = /\{\{\s*([^{}]+?)\s*\}\}|\[([^[\]]{1,80})\]|<([^<>]{1,80})>/g;
// Five dots, not three, so an ordinary "..." in prose isn't taken for a blank.
const LINE_RE = /_{3,}|\.{5,}|…{2,}/g;

export function findMarkers(text: string): MarkerHit[] {
  const hits: MarkerHit[] = [];
  for (const m of text.matchAll(BRACKET_RE)) {
    const inner = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!inner) continue; // "[ ]" checkboxes
    hits.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], label: inner, kind: 'bracket' });
  }
  for (const m of text.matchAll(LINE_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (hits.some(h => s < h.end && e > h.start)) continue;
    const before = text.slice(0, s).split(/_{3,}|\.{5,}|…{2,}|[[\]<>{}]/).pop() ?? '';
    const label = before.replace(/[:\s]+$/, '').trim();
    hits.push({ start: s, end: e, text: m[0], label: label || 'Blank', kind: 'line' });
  }
  return hits.sort((a, b) => a.start - b.start);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/markers.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/detect tests/unit/markers.test.ts
git commit -m "feat(core): marker detection and ported label patterns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Word template detection

**Files:**
- Create: `src/core/detect/docx.ts`
- Test: `tests/unit/detect-docx.test.ts`

**Interfaces:**
- Consumes: Task 6 helpers, Task 7 patterns and markers, `newId`, and the model.
- Produces:
  - `readDocxXml(bytes: ArrayBuffer | Uint8Array): Promise<string>`
  - `DocxContext { xml; paras: Block[]; paraTexts: string[]; cells: CellLoc[]; blocks: BodyBlock[]; tables: Block[] }`
  - `docxContext(xml): DocxContext`
  - `detectDocx(xml): { placeholders: Placeholder[]; unitStartBlock: number; warnings: string[]; ctx: DocxContext }`
  - `anchorOffset(ctx, a): number`, `regionOfDocxAnchor(ctx, a, unitStartBlock): 'cover' | 'unit'`, `blockIndexOfTable(ctx, ti): number | null`, `tableIndexAtBlock(ctx, bi): number | null`

The label logic ports v14 `detectTemplate` (`index.html:1485-1682`) and `fillLabelArea` (`:1720-1754`, for the answer-slot rules). Instead of v14's shape objects, it emits `Placeholder` drafts.

- [ ] **Step 1: Write the failing tests**

`tests/unit/detect-docx.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blockIndexOfTable, detectDocx, docxContext, readDocxXml, regionOfDocxAnchor, tableIndexAtBlock } from '../../src/core/detect/docx';
import type { Placeholder } from '../../src/core/model';

const load = async (f: string) => readDocxXml(new Uint8Array(readFileSync(new URL(`../fixtures/${f}`, import.meta.url))));
const count = (phs: Placeholder[], binding: Placeholder['binding']) => phs.filter(p => p.binding === binding).length;
const debug = (phs: Placeholder[]) => phs.map(p => `${p.region} ${p.binding} ${p.label}`).join('\n');

const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const TC = (t: string) => `<w:tc>${P(t)}</w:tc>`;
const doc = (body: string) => `<w:document><w:body>${body}<w:sectPr/></w:body></w:document>`;

describe('detectDocx: synthetic documents', () => {
  it('turns markers into placeholders, whole-cell markers into cell anchors', () => {
    const xml = doc(P('Name: {{student_name}} Date: ______') + `<w:tbl><w:tr>${TC('Week')}${TC('&lt;insert dates&gt;')}</w:tr></w:tbl>`);
    const r = detectDocx(xml);
    const labels = r.placeholders.map(p => [p.label, p.anchor.kind, p.binding]);
    expect(labels).toContainEqual(['student_name', 'docx-text', 'free']);
    expect(labels).toContainEqual(['Date', 'docx-text', 'date']);
    // A 2-cell "Week | <dates>" row: the range label merged with the marker in the value cell,
    // and the week number is inserted after the word "Week".
    const range = r.placeholders.find(p => p.dateRole === 'range')!;
    expect(range.source).toBe('marker');
    expect(range.anchor).toEqual({ kind: 'docx-cell', table: [0], row: 0, col: 1 });
    expect(r.placeholders.find(p => p.dateRole === 'number')!.anchor.kind).toBe('docx-text');
    expect(r.unitStartBlock).toBe(1);
  });
  it('finds a weekday grid with every header column as a daily field', () => {
    const grid = `<w:tbl><w:tr>${TC('Day')}${TC('Task')}${TC('Hours')}</w:tr>` +
      ['Monday', 'Tuesday', 'Wednesday'].map(d => `<w:tr>${TC(d)}${TC('')}${TC('')}</w:tr>`).join('') + '</w:tbl>';
    const r = detectDocx(doc(P('Cover page') + `<w:tbl><w:tr>${TC('Week:')}${TC('')}</w:tr></w:tbl>` + grid));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily).toHaveLength(6);
    expect(daily.map(p => p.dayIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(daily.every(p => p.dayMode === 'weekday' && p.region === 'unit')).toBe(true);
    expect(r.unitStartBlock).toBe(1);
  });
  it('warns and repeats the whole document when there is no week row', () => {
    const r = detectDocx(doc(P('Just text &lt;name&gt;')));
    expect(r.unitStartBlock).toBe(0);
    expect(r.warnings[0]).toMatch(/repeats each period/);
  });
  it('maps between tables and body blocks and computes regions', () => {
    const ctx = docxContext(doc(P('a') + `<w:tbl><w:tr>${TC('x')}</w:tr></w:tbl>`));
    expect(blockIndexOfTable(ctx, 0)).toBe(1);
    expect(tableIndexAtBlock(ctx, 1)).toBe(0);
    expect(tableIndexAtBlock(ctx, 0)).toBeNull();
    expect(regionOfDocxAnchor(ctx, { kind: 'docx-text', paragraph: 0, start: 0, end: 0 }, 1)).toBe('cover');
    expect(regionOfDocxAnchor(ctx, { kind: 'docx-cell', table: [0], row: 0, col: 0 }, 1)).toBe('unit');
  });
});

// These fixture expectations come from v14's documented behaviour (CLAUDE.md, "Templates in templates/").
// If one fails, print debug(r.placeholders) and compare the port with v14's detectTemplate at the cited lines.
describe('detectDocx: real university templates', () => {
  it("Taylor's: Monday–Friday grid with Task/Tools/Lesson", async () => {
    const r = detectDocx(await load('taylors.docx'));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(15);
    expect(new Set(daily.map(p => p.dayIndex))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(daily.every(p => p.dayMode === 'weekday')).toBe(true);
  });
  it('PMU replica: Day 1–10 rows and 5 weekly questions', async () => {
    const r = detectDocx(await load('pmu.docx'));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(10);
    expect(daily.map(p => p.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(daily.every(p => p.dayMode === 'nth')).toBe(true);
    expect(count(r.placeholders, 'period'), debug(r.placeholders)).toBe(5);
  });
  it('PMU with extra columns: 3 fields per day', async () => {
    const r = detectDocx(await load('pmu_extra.docx'));
    expect(count(r.placeholders, 'daily'), debug(r.placeholders)).toBe(30);
  });
  it('APU: objective/content answer areas and a week number', async () => {
    const r = detectDocx(await load('apu.docx'));
    expect(count(r.placeholders, 'period'), debug(r.placeholders)).toBeGreaterThanOrEqual(1);
    expect(r.placeholders.some(p => p.binding === 'date' && p.dateRole === 'number'), debug(r.placeholders)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/detect-docx.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/detect/docx.ts`**

```ts
import JSZip from 'jszip';
import type { DateRole, DayMode, DocxAnchor, DocxCellAnchor, DocxTextAnchor, Placeholder } from '../model';
import { newId } from '../ids';
import { allParagraphs, bodyBlocks, cellIndex, cellText, scanBlocks, textOf, type Block, type BodyBlock, type CellLoc } from '../docx/xml';
import { findMarkers } from './markers';
import {
  CONTENT_RE, DAYN_RE, END_RE, OBJ_RE, SIGNATURE_RE, START_RE, SUPERVISOR_ONLY_RE, WEEKDAYS, WEEKDAY_RE, WEEK_RE,
  WEEK_START_RE, defaultMarkerBinding, isPlaceholderOrBlank, matchCoverKey,
} from './labels';

type Draft = Omit<Placeholder, 'id' | 'region'>;

export interface DocxContext { xml: string; paras: Block[]; paraTexts: string[]; cells: CellLoc[]; blocks: BodyBlock[]; tables: Block[] }
export interface DocxDetection { placeholders: Placeholder[]; unitStartBlock: number; warnings: string[]; ctx: DocxContext }

export async function readDocxXml(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('This file is not a Word document (word/document.xml is missing).');
  return f.async('string');
}

export function docxContext(xml: string): DocxContext {
  const paras = allParagraphs(xml);
  return { xml, paras, paraTexts: paras.map(p => textOf(p.full)), cells: cellIndex(xml), blocks: bodyBlocks(xml), tables: scanBlocks(xml, 'w:tbl') };
}

const cellKey = (c: { table: number[]; row: number; col: number }) => `${c.table.join('.')}:${c.row}:${c.col}`;

function innermostCell(ctx: DocxContext, offset: number): CellLoc | undefined {
  let best: CellLoc | undefined;
  for (const c of ctx.cells) if (offset >= c.start && offset < c.end && (!best || c.end - c.start < best.end - best.start)) best = c;
  return best;
}

export function anchorOffset(ctx: DocxContext, a: DocxAnchor): number {
  if (a.kind === 'docx-cell') return ctx.cells.find(c => cellKey(c) === cellKey(a))?.start ?? -1;
  return ctx.paras[a.paragraph]?.start ?? -1;
}

/** Two anchors are "the same spot" when they're in the same cell (or the same non-table paragraph). */
function spotKey(ctx: DocxContext, a: DocxAnchor): string {
  if (a.kind === 'docx-cell') return cellKey(a);
  const p = ctx.paras[a.paragraph];
  const c = p && innermostCell(ctx, p.start);
  return c ? cellKey(c) : `p${a.paragraph}`;
}

export function regionOfDocxAnchor(ctx: DocxContext, a: DocxAnchor, unitStartBlock: number): 'cover' | 'unit' {
  const off = anchorOffset(ctx, a);
  const start = ctx.blocks[unitStartBlock]?.start ?? 0;
  return off >= 0 && off < start ? 'cover' : 'unit';
}

export function blockIndexOfTable(ctx: DocxContext, ti: number): number | null {
  const t = ctx.tables[ti];
  if (!t) return null;
  const i = ctx.blocks.findIndex(b => t.start >= b.start && t.start < b.end);
  return i >= 0 ? i : null;
}

export function tableIndexAtBlock(ctx: DocxContext, bi: number): number | null {
  const b = ctx.blocks[bi];
  if (!b) return null;
  const i = ctx.tables.findIndex(t => t.start >= b.start && t.end <= b.end);
  return i >= 0 ? i : null;
}

export function detectDocx(xml: string): DocxDetection {
  const ctx = docxContext(xml);
  const warnings: string[] = [];
  const found = detectByLabels(ctx);
  let unitStartBlock = 0;
  if (found.unitTable == null) warnings.push('Couldn\'t find the part that repeats each period — use "Set repeating start" to choose it.');
  else if (!found.coverInUnit) unitStartBlock = blockIndexOfTable(ctx, found.unitTable) ?? 0;

  const labels = new Map<string, Draft>();
  for (const d of found.drafts) labels.set(spotKey(ctx, d.anchor as DocxAnchor), d); // later (more specific) wins
  const drafts = mergeDrafts(ctx, detectMarkers(ctx), [...labels.values()]);
  const placeholders = drafts.map(d => ({ ...d, id: newId('ph'), region: regionOfDocxAnchor(ctx, d.anchor as DocxAnchor, unitStartBlock) }));
  return { placeholders, unitStartBlock, warnings, ctx };
}

function detectMarkers(ctx: DocxContext): Draft[] {
  const out: Draft[] = [];
  ctx.paras.forEach((p, pi) => {
    const text = ctx.paraTexts[pi];
    for (const hit of findMarkers(text)) {
      const cell = innermostCell(ctx, p.start);
      const whole = !!cell && hit.text === text.trim() && cellText(ctx.xml.slice(cell.start, cell.end)) === text.trim();
      const anchor: DocxAnchor = whole
        ? { kind: 'docx-cell', table: cell!.table, row: cell!.row, col: cell!.col }
        : { kind: 'docx-text', paragraph: pi, start: hit.start, end: hit.end };
      out.push({ source: 'marker', label: hit.label, binding: defaultMarkerBinding(hit.label), anchor });
    }
  });
  return out;
}

/** A label and a marker at the same spot become one placeholder: label semantics, marker anchor. */
function mergeDrafts(ctx: DocxContext, markers: Draft[], labels: Draft[]): Draft[] {
  const used = new Set<Draft>();
  const out: Draft[] = [];
  for (const l of labels) {
    const k = spotKey(ctx, l.anchor as DocxAnchor);
    const m = markers.find(x => !used.has(x) && spotKey(ctx, x.anchor as DocxAnchor) === k);
    if (m) { used.add(m); out.push({ ...l, source: 'marker', anchor: m.anchor }); } else out.push(l);
  }
  for (const m of markers) if (!used.has(m)) out.push(m);
  const pos = (d: Draft) => anchorOffset(ctx, d.anchor as DocxAnchor) * 1000 + (d.anchor.kind === 'docx-text' ? d.anchor.start : 0);
  return out.sort((a, b) => pos(a) - pos(b));
}

interface TCell { start: number; end: number; full: string; text: string }
interface TRow { cells: TCell[] }

function tableModel(ctx: DocxContext): TRow[][] {
  return ctx.tables.map(t => scanBlocks(t.full, 'w:tr').map(r => ({
    cells: scanBlocks(r.full, 'w:tc').map(c => {
      const start = t.start + r.start + c.start;
      return { start, end: start + c.full.length, full: c.full, text: cellText(c.full) };
    }),
  })));
}

/** Port of v14 detectTemplate (index.html:1485-1682), producing placeholder drafts. */
function detectByLabels(ctx: DocxContext): { drafts: Draft[]; unitTable: number | null; coverInUnit: boolean } {
  const T = tableModel(ctx);
  const drafts: Draft[] = [];
  const clean = (s: string) => s.replace(/:\s*$/, '').trim();
  const cellA = (ti: number, row: number, col: number): DocxCellAnchor => ({ kind: 'docx-cell', table: [ti], row, col });
  const textA = (paragraph: number, start: number, end: number): DocxTextAnchor => ({ kind: 'docx-text', paragraph, start, end });
  const parasIn = (c: TCell) => ctx.paras.flatMap((p, i) => (p.start >= c.start && p.end <= c.end ? [i] : []));
  const endOf = (c: TCell, ti: number, ri: number, ci: number): DocxAnchor => {
    const pis = parasIn(c);
    const pi = [...pis].reverse().find(i => ctx.paraTexts[i].trim()) ?? pis[0];
    if (pi == null) return cellA(ti, ri, ci);
    const len = ctx.paraTexts[pi].length;
    return textA(pi, len, len);
  };
  // Where the value for a label cell goes: a blank 2nd paragraph, else a blank cell beside it, else after the label.
  const valueSlot = (ti: number, ri: number, ci: number): DocxAnchor => {
    const c = T[ti][ri].cells[ci];
    const pis = parasIn(c);
    const last = pis[pis.length - 1];
    if (pis.length > 1 && isPlaceholderOrBlank(ctx.paraTexts[last])) return textA(last, 0, ctx.paraTexts[last].length);
    const next = T[ti][ri].cells[ci + 1];
    if (next && isPlaceholderOrBlank(next.text)) return cellA(ti, ri, ci + 1);
    return endOf(c, ti, ri, ci);
  };
  // Answer area for a Shape A label row (v14 fillLabelArea): blank last cell, 2nd paragraph, row below, or after the label.
  const areaSlot = (ti: number, ri: number): DocxAnchor => {
    const cells = T[ti][ri].cells;
    const lastCi = cells.length - 1;
    const last = cells[lastCi];
    if (cells.length >= 2 && isPlaceholderOrBlank(last.text)) return cellA(ti, ri, lastCi);
    const pis = parasIn(last);
    if (pis.length > 1) return textA(pis[1], 0, ctx.paraTexts[pis[1]].length);
    const next = T[ti][ri + 1];
    if (next?.cells.length && isPlaceholderOrBlank(next.cells[next.cells.length - 1].text)) return cellA(ti, ri + 1, next.cells.length - 1);
    return endOf(last, ti, ri, lastCi);
  };

  // 1. Cover table: the first table where at least 2 labels are recognised.
  let coverTi = -1;
  for (let ti = 0; ti < T.length && coverTi < 0; ti++) {
    const fields: Draft[] = [];
    let matched = 0;
    T[ti].forEach((r, ri) => {
      const add = (label: string, col: number) => {
        const l = clean(label);
        if (!l || WEEK_RE.test(l) || WEEK_START_RE.test(l)) return;
        if (matchCoverKey(l)) matched++;
        fields.push({ source: 'label', label: l, binding: 'cover', anchor: cellA(ti, ri, col) });
      };
      const n = r.cells.length;
      if (n === 2) add(r.cells[0].text, 1);
      else if (n >= 4 && n % 2 === 0) for (let i = 0; i < n; i += 2) if (r.cells[i].text && isPlaceholderOrBlank(r.cells[i + 1].text)) add(r.cells[i].text, i + 1);
    });
    if (matched >= 2) { coverTi = ti; drafts.push(...fields); }
  }

  // 2. The week/month row marks the start of the repeating unit.
  let weekTi = -1;
  outer: for (let ti = 0; ti < T.length; ti++) {
    for (let ri = 0; ri < T[ti].length; ri++) {
      const cells = T[ti][ri].cells;
      if (cells.length < 2) continue;
      const texts = cells.map(c => c.text);
      const wI = texts.findIndex(x => WEEK_RE.test(x));
      if (wI < 0) continue;
      weekTi = ti;
      const date = (label: string, role: DateRole, anchor: DocxAnchor) =>
        drafts.push({ source: 'label', label: clean(label) || 'Date', binding: 'date', dateRole: role, anchor });
      if (WEEK_START_RE.test(texts[wI])) { date(texts[wI], 'start', valueSlot(ti, ri, wI)); break outer; }
      const sI = texts.findIndex(x => START_RE.test(x));
      const eI = texts.findIndex(x => END_RE.test(x));
      const twoCellRange = sI < 0 && eI < 0 && cells.length === 2;
      date(texts[wI], 'number', twoCellRange ? endOf(cells[wI], ti, ri, wI) : valueSlot(ti, ri, wI));
      if (sI >= 0) date(texts[sI], 'start', valueSlot(ti, ri, sI));
      if (eI >= 0) date(texts[eI], 'end', valueSlot(ti, ri, eI));
      if (twoCellRange) date('Period dates', 'range', cellA(ti, ri, wI === 0 ? 1 : 0));
      break outer;
    }
  }
  if (weekTi < 0) return { drafts, unitTable: null, coverInUnit: false };
  const coverInUnit = coverTi === weekTi;

  // 3. Shape A: Objective/Content rows inside the week table.
  const rows = T[weekTi];
  const first = (ri: number) => rows[ri].cells[0]?.text ?? '';
  const objRi = rows.findIndex((_, ri) => OBJ_RE.test(first(ri)));
  const conRi = rows.findIndex((_, ri) => ri !== objRi && CONTENT_RE.test(first(ri)));
  if (objRi >= 0 || conRi >= 0) {
    for (const ri of [objRi, conRi]) if (ri >= 0) drafts.push({ source: 'label', label: clean(first(ri)), binding: 'period', anchor: areaSlot(weekTi, ri) });
    return { drafts, unitTable: weekTi, coverInUnit };
  }

  // 4. Shape B: a day grid in one of the next two tables; every header column is a field.
  let dayTi = -1;
  for (let ti = weekTi + 1; ti < T.length && ti <= weekTi + 2; ti++) {
    const found: { ri: number; dayIndex: number; dayMode: DayMode; label: string }[] = [];
    T[ti].forEach((r, ri) => {
      const lbl = r.cells[0]?.text ?? '';
      if (!lbl) return;
      const m = lbl.match(WEEKDAY_RE);
      if (m) { found.push({ ri, dayIndex: WEEKDAYS.indexOf(m[1].toLowerCase()), dayMode: 'weekday', label: clean(lbl) }); return; }
      const n = lbl.match(DAYN_RE);
      if (n) found.push({ ri, dayIndex: Number(n[1]) - 1, dayMode: 'nth', label: clean(lbl) });
    });
    if (found.length < 3) continue;
    dayTi = ti;
    let columns: { ci: number; label: string }[] = [];
    let dateCi = -1;
    for (let hi = found[0].ri - 1; hi >= 0; hi--) {
      const texts = T[ti][hi].cells.map(c => c.text);
      if (!texts.slice(1).some(Boolean)) continue;
      texts.forEach((t, i) => {
        if (i === 0 || !t) return;
        if (/^date\s*:?$/i.test(t)) { dateCi = i; return; }
        columns.push({ ci: i, label: t });
      });
      break;
    }
    if (!columns.length) columns = [{ ci: 1, label: 'Activity' }];
    for (const d of found) {
      const n = T[ti][d.ri].cells.length;
      for (const c of columns) if (c.ci < n) drafts.push({ source: 'label', label: `${d.label} – ${c.label}`, binding: 'daily', dayIndex: d.dayIndex, dayMode: d.dayMode, anchor: cellA(ti, d.ri, c.ci) });
      if (dateCi >= 0 && dateCi < n) drafts.push({ source: 'label', label: `${d.label} – Date`, binding: 'date', dateRole: 'day', dayIndex: d.dayIndex, dayMode: d.dayMode, anchor: cellA(ti, d.ri, dateCi) });
    }
    break;
  }
  if (dayTi < 0) return { drafts, unitTable: weekTi, coverInUnit };

  // 5. After the grid: weekly questions (each followed by a blank answer) and supervisor signature spots.
  for (let ti = dayTi + 1; ti < T.length && ti <= dayTi + 3; ti++) {
    let any = false;
    T[ti].forEach((r, ri) => {
      if (!r.cells.length) return;
      r.cells.forEach((c, ci) => {
        if (SIGNATURE_RE.test(c.text) && c.text.split(/\s+/).length <= 6) {
          drafts.push({ source: 'label', label: clean(c.text.replace(/_{3,}.*/, '')) || 'Supervisor signature', binding: 'signature', anchor: valueSlot(ti, ri, ci) });
          any = true;
        }
      });
      const lastCi = r.cells.length - 1;
      const q = r.cells[lastCi].text;
      if (q.split(/\s+/).length < 4 || SUPERVISOR_ONLY_RE.test(q)) return;
      const next = T[ti][ri + 1];
      if (next?.cells.length && isPlaceholderOrBlank(next.cells[next.cells.length - 1].text)) {
        drafts.push({ source: 'label', label: q, binding: 'period', anchor: cellA(ti, ri + 1, next.cells.length - 1) });
        any = true;
        return;
      }
      const pis = parasIn(r.cells[lastCi]);
      const lp = pis[pis.length - 1];
      if (pis.length > 1 && isPlaceholderOrBlank(ctx.paraTexts[lp])) {
        drafts.push({ source: 'label', label: q, binding: 'period', anchor: textA(lp, 0, ctx.paraTexts[lp].length) });
        any = true;
      }
    });
    if (!any && !/remark|supervisor|signature/i.test(T[ti].map(r => r.cells.map(c => c.text).join(' ')).join(' '))) break;
  }
  return { drafts, unitTable: weekTi, coverInUnit };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/detect-docx.test.ts`
Expected: PASS (8 tests). If a fixture test fails, the assertion message prints every detected placeholder. Compare it with the template opened in Word and with v14's `detectTemplate`, then fix the port where it diverges. Don't loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/core/detect/docx.ts tests/unit/detect-docx.test.ts
git commit -m "feat(core): detect placeholders in Word templates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: PDF text extraction and detection

**Files:**
- Create: `src/core/pdf/text.ts`, `src/core/detect/pdf.ts`
- Test: `tests/unit/detect-pdf.test.ts`

**Interfaces:**
- Consumes: Task 7 patterns and markers, `newId`, and the model.
- Produces:
  - `PdfWord { str; x; y; width; height }`, `PdfTextPage { index; width; height; words: PdfWord[] }`
  - `extractPdfText(bytes: Uint8Array): Promise<PdfTextPage[]>`. It copies the bytes, because pdf.js detaches the buffer it's given. It rethrows pdf.js errors unchanged, including `PasswordException`.
  - `detectPdf(pages: PdfTextPage[]): { placeholders: Placeholder[]; pageRoles: PageRole[]; warnings: string[] }`

The port covers v14 `pdfGroupLines`/`pdfDetectPage` (`index.html:2125-2171`), `pdfSegments`/`pdfDetectGeneric` (`:2182-2372`) and the known APU/Taylor's layouts in `detectPdfTemplate` (`:2388-2469`). Every value position becomes a `PdfAnchor` box.

- [ ] **Step 1: Write the failing tests**

`tests/unit/detect-pdf.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText } from '../../src/core/pdf/text';
import { detectPdf } from '../../src/core/detect/pdf';
import type { Placeholder, PdfAnchor } from '../../src/core/model';

const fixture = (f: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${f}`, import.meta.url)));
const debug = (phs: Placeholder[]) => phs.map(p => `${p.region} ${p.binding} ${p.label}`).join('\n');

describe('extractPdfText', () => {
  it('returns words with positions and leaves the input usable', async () => {
    const bytes = fixture('pmu.pdf');
    const pages = await extractPdfText(bytes);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].words.length).toBeGreaterThan(10);
    expect(bytes.byteLength).toBeGreaterThan(0); // not detached
  });
});

describe('detectPdf: synthetic', () => {
  it('finds bracket markers with whiteout and flags image-only PDFs', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([400, 300]).drawText('Student: <student name>', { x: 40, y: 200, size: 12, font });
    const withText = detectPdf(await extractPdfText(await doc.save()));
    const m = withText.placeholders.find(p => p.label === 'student name')!;
    expect(m.source).toBe('marker');
    expect((m.anchor as PdfAnchor).whiteout).toBe(true);
    expect((m.anchor as PdfAnchor).x).toBeGreaterThan(80);

    const blank = await PDFDocument.create();
    blank.addPage([400, 300]);
    const none = detectPdf(await extractPdfText(await blank.save()));
    expect(none.placeholders).toEqual([]);
    expect(none.warnings.join(' ')).toMatch(/No text found/);
    expect(none.pageRoles).toEqual(['unit']);
  });
});

describe('detectPdf: real university templates', () => {
  it('PMU: Day 1–10 rows and 5 numbered questions', async () => {
    const r = detectPdf(await extractPdfText(fixture('pmu.pdf')));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(10);
    expect(daily.every(p => p.dayMode === 'nth')).toBe(true);
    expect(r.placeholders.filter(p => p.binding === 'period'), debug(r.placeholders)).toHaveLength(5);
    expect(r.pageRoles).toContain('unit');
  });
  it("Taylor's: weekday grid with three columns", async () => {
    const r = detectPdf(await extractPdfText(fixture('taylors.pdf')));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(15);
    expect(daily.every(p => p.dayMode === 'weekday')).toBe(true);
  });
  it('APU: at least one answer area', async () => {
    const r = detectPdf(await extractPdfText(fixture('apu.pdf')));
    expect(r.placeholders.filter(p => p.binding === 'period').length, debug(r.placeholders)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/detect-pdf.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement `src/core/pdf/text.ts`**

```ts
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfWord { str: string; x: number; y: number; width: number; height: number }
export interface PdfTextPage { index: number; width: number; height: number; words: PdfWord[] }

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextPage[]> {
  // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const pages: PdfTextPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const words: PdfWord[] = [];
      for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (!it.str || !it.str.trim() || !it.transform) continue;
        words.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width ?? 0, height: it.height || Math.abs(it.transform[3]) || 10 });
      }
      pages.push({ index: p - 1, width: page.view[2], height: page.view[3], words });
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 4: Implement `src/core/detect/pdf.ts`**

```ts
import type { DateRole, PageRole, PdfAnchor, Placeholder } from '../model';
import type { PdfTextPage, PdfWord } from '../pdf/text';
import { newId } from '../ids';
import { findMarkers } from './markers';
import {
  BRACKET_ONLY_RE, CONTENT_RE, DAYN_RE, END_RE, LESSON_RE, OBJ_RE, QNUM_RE, SIGNATURE_RE, START_RE, SUPERVISOR_ONLY_RE,
  TASK_RE, TOOLS_RE, WEEKDAYS, WEEKDAY_RE, WEEK_RE, WEEK_START_RE, defaultMarkerBinding, matchCoverKey,
} from './labels';

type Draft = Omit<Placeholder, 'id' | 'region' | 'anchor'> & { anchor: PdfAnchor };
interface Line { y: number; words: PdfWord[] }
interface Seg { y: number; x0: number; x1: number; h: number; words: PdfWord[]; text: string }
interface PageDet {
  coverFields: { key: string | null; line: Line; text: string }[];
  matchedCoverCount: number;
  weekLine?: Line; dayLines: Line[]; objLine?: Line; contentLine?: Line; headerLine?: Line;
}
interface Pg extends PdfTextPage { lines: Line[]; det: PageDet }
export interface PdfDetection { placeholders: Placeholder[]; pageRoles: PageRole[]; warnings: string[] }

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const hasSigBlank = (t: string) => /_{3,}/.test(t) || /\bsignature\b/i.test(t);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const box = (page: number, x: number, y: number, w: number, h: number): PdfAnchor => ({ kind: 'pdf', page, x, y, w: Math.max(4, w), h: Math.max(4, h) });
const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function detectPdf(pages: PdfTextPage[]): PdfDetection {
  const warnings: string[] = [];
  if (!pages.some(p => p.words.length)) warnings.push('No text found — place placeholders manually.');
  const P: Pg[] = pages.map(p => { const lines = groupLines(p.words); return { ...p, lines, det: detectPage(lines) }; });

  let labels: Draft[] = [];
  let unitPage: number | null = null;
  for (const pg of P) {
    const g = detectGeneric(pg, P);
    if (g) { labels = g.drafts; unitPage = g.unitPage; break; }
  }
  if (unitPage == null) {
    const k = detectKnown(P);
    if (k) { labels = k.drafts; unitPage = k.unitPage; }
  }
  if (unitPage == null && P.some(p => p.words.length)) warnings.push("Couldn't find the page that repeats each period — set it with the page menus.");

  const pageRoles: PageRole[] = pages.map((_, i) => (unitPage != null && i < unitPage ? 'cover' : 'unit'));
  const drafts = merge(P.flatMap(markerDrafts), labels);
  return {
    placeholders: drafts.map(d => ({ ...d, id: newId('ph'), region: pageRoles[d.anchor.page] === 'cover' ? 'cover' : 'unit' })),
    pageRoles,
    warnings,
  };
}

// ---- merging (spec 5.2 step 3, PDF variant) ----
const center = (a: PdfAnchor) => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });
const contains = (a: PdfAnchor, p: { x: number; y: number }) => p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;
const sameSpot = (a: PdfAnchor, b: PdfAnchor) => a.page === b.page && (contains(a, center(b)) || contains(b, center(a)));

function merge(markers: Draft[], labels: Draft[]): Draft[] {
  const used = new Set<Draft>();
  const out: Draft[] = [];
  for (const l of labels) {
    const ms = markers.filter(m => !used.has(m) && sameSpot(m.anchor, l.anchor));
    if (!ms.length) { out.push(l); continue; }
    ms.forEach(m => used.add(m));
    const biggest = [l.anchor, ...ms.map(m => m.anchor)].reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const whiteout = ms.some(m => m.anchor.whiteout);
    out.push({ ...l, source: 'marker', anchor: { ...biggest, ...(whiteout ? { whiteout: true } : {}) } });
  }
  for (const m of markers) if (!used.has(m)) out.push(m);
  return out.sort((a, b) => a.anchor.page - b.anchor.page || (b.anchor.y + b.anchor.h) - (a.anchor.y + a.anchor.h) || a.anchor.x - b.anchor.x);
}

function markerDrafts(pg: Pg): Draft[] {
  const out: Draft[] = [];
  for (const line of pg.lines) {
    // Rebuild the line's text with a map from each character back to its word, so markers split across items still get a box.
    let text = '';
    const map: { w: PdfWord; off: number }[] = [];
    line.words.forEach((w, i) => {
      if (i) { text += ' '; map.push({ w, off: 0 }); }
      for (let k = 0; k < w.str.length; k++) { text += w.str[k]; map.push({ w, off: k }); }
    });
    for (const hit of findMarkers(text)) {
      const a = map[hit.start];
      const b = map[hit.end - 1];
      const xAt = (m: { w: PdfWord; off: number }, after: boolean) => m.w.x + (m.w.str.length ? (m.w.width * (m.off + (after ? 1 : 0))) / m.w.str.length : 0);
      const x0 = xAt(a, false);
      const x1 = xAt(b, true);
      const h = Math.max(a.w.height, 8);
      const anchor = box(pg.index, x0, line.y - h * 0.25, Math.max(x1 - x0, 12), h * 1.3);
      out.push({ source: 'marker', label: hit.label, binding: defaultMarkerBinding(hit.label), anchor: hit.kind === 'bracket' ? { ...anchor, whiteout: true } : anchor });
    }
  }
  return out;
}

// ---- ports of v14 helpers ----
function groupLines(words: PdfWord[], tol = 2.5): Line[] {
  const lines: Line[] = [];
  for (const w of words) {
    let line = lines.find(l => Math.abs(l.y - w.y) <= tol);
    if (!line) { line = { y: w.y, words: [] }; lines.push(line); }
    line.words.push(w);
  }
  lines.forEach(l => l.words.sort((a, b) => a.x - b.x));
  return lines.sort((a, b) => b.y - a.y);
}
const lineText = (l: Line) => l.words.map(w => w.str).join(' ').replace(/\s+/g, ' ').trim();
const findLabelLine = (lines: Line[], re: RegExp, maxWords = 10) =>
  lines.find(l => { const t = lineText(l); return wordCount(t) <= maxWords && !hasSigBlank(t) && re.test(t); });

function detectPage(lines: Line[]): PageDet {
  const out: PageDet = { coverFields: [], matchedCoverCount: 0, dayLines: [] };
  for (const l of lines) {
    const t = lineText(l);
    if (wordCount(t) > 5 || hasSigBlank(t)) continue;
    const label = t.replace(/:\s*$/, '').trim();
    if (!label) continue;
    const key = matchCoverKey(label);
    if (key) out.matchedCoverCount++;
    out.coverFields.push({ key, line: l, text: t });
  }
  out.weekLine = lines.find(l => WEEK_RE.test(l.words[0]?.str ?? ''));
  out.dayLines = lines.filter(l => WEEKDAY_RE.test(l.words[0]?.str ?? ''));
  out.objLine = findLabelLine(lines, OBJ_RE, 25);
  out.contentLine = findLabelLine(lines, CONTENT_RE, 25);
  if (out.dayLines.length) {
    const firstY = out.dayLines[0].y;
    out.headerLine = lines.find(l => l.y > firstY && TASK_RE.test(lineText(l)) && wordCount(lineText(l)) <= 8);
  }
  return out;
}

function segments(lines: Line[], gap = 12): Seg[] {
  const segs: Seg[] = [];
  for (const l of lines) {
    let cur: Seg | null = null;
    const flush = () => {
      if (!cur) return;
      cur.text = cur.words.map(w => w.str).join(' ').replace(/\s+/g, ' ').replace(/\s+([:.,?;)])/g, '$1').trim();
      if (cur.text) segs.push(cur);
      cur = null;
    };
    for (const w of l.words) {
      if (cur && w.x - (cur as Seg).x1 > gap) flush();
      if (!cur) cur = { y: l.y, x0: w.x, x1: w.x + w.width, h: w.height, words: [w], text: '' };
      else { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x + w.width); cur.h = Math.max(cur.h, w.height); }
    }
    flush();
  }
  return segs;
}

/** Port of v14 pdfDetectGeneric (index.html:2209-2372): numbered/weekday day rows, header columns, numbered questions, cover labels. */
function detectGeneric(pg: Pg, pages: Pg[]): { drafts: Draft[]; unitPage: number } | null {
  const segs = segments(pg.lines);
  const dayN = segs.filter(s => DAYN_RE.test(s.text));
  const wkd = segs.filter(s => WEEKDAY_RE.test(s.text) && wordCount(s.text) <= 3);
  let rowsRaw: Seg[];
  let kind: 'dayN' | 'weekday';
  if (dayN.length >= 3) { rowsRaw = dayN; kind = 'dayN'; }
  else if (wkd.length >= 3 && !pg.det.headerLine) { rowsRaw = wkd; kind = 'weekday'; }
  else return null;

  const colX = median(rowsRaw.map(s => s.x0));
  const dayRowsS = rowsRaw.filter(s => Math.abs(s.x0 - colX) < 8).sort((a, b) => b.y - a.y);
  if (dayRowsS.length < 3) return null;
  const pitch = median(dayRowsS.slice(1).map((s, i) => dayRowsS[i].y - s.y));
  const h = median(dayRowsS.map(s => s.h)) || 11;
  const firstY = dayRowsS[0].y;
  const lastY = dayRowsS[dayRowsS.length - 1].y;
  const dayLabelX0 = Math.min(...dayRowsS.map(s => s.x0));
  const dayLabelX1 = Math.max(...dayRowsS.map(s => s.x1));

  // Header: the short lines stacked directly above the first day row.
  const headerSegs: Seg[] = [];
  let prevY = firstY;
  pg.lines.filter(l => l.y > firstY + 2).sort((a, b) => a.y - b.y).some(l => {
    if (l.y - prevY > pitch) return true;
    const ls = segs.filter(s => Math.abs(s.y - l.y) < 0.5);
    if (ls.some(s => wordCount(s.text) > 8)) return true;
    headerSegs.push(...ls);
    prevY = l.y;
    return false;
  });
  const headerTop = headerSegs.length ? Math.max(...headerSegs.map(s => s.y)) : firstY;
  const inDayCol = (s: Seg) => s.x1 > dayLabelX0 - 6 && s.x0 < dayLabelX1 + 24;
  const dayHead = headerSegs.filter(inDayCol);
  const dataHead: { x0: number; x1: number; parts: Seg[]; label: string }[] = [];
  headerSegs.filter(s => !inDayCol(s)).sort((a, b) => a.x0 - b.x0).forEach(s => {
    const m = dataHead.find(c => s.x0 < c.x1 && s.x1 > c.x0);
    if (m) { m.parts.push(s); m.x0 = Math.min(m.x0, s.x0); m.x1 = Math.max(m.x1, s.x1); }
    else dataHead.push({ x0: s.x0, x1: s.x1, parts: [s], label: '' });
  });
  dataHead.forEach(c => { c.label = c.parts.sort((a, b) => b.y - a.y).map(p => p.text).join(' '); });
  const pageRight = pg.width - 36;
  let dayColRight = dayLabelX1 + 14;
  if (dayHead.length) {
    const widest = dayHead.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
    const centered = 2 * ((widest.x0 + widest.x1) / 2) - (dayLabelX0 - 5);
    if (centered > dayLabelX1 + 4) dayColRight = centered;
  }
  if (dataHead.length) dayColRight = Math.min(dayColRight, dataHead[0].x0 - 4);
  let columns: { label: string; left: number; right: number }[];
  if (!dataHead.length) columns = [{ label: 'Activity', left: dayColRight, right: pageRight }];
  else {
    let left = dayColRight;
    columns = dataHead.map((c, i) => {
      const next = dataHead[i + 1];
      const leftAligned = c.x0 - left < 14;
      let right = leftAligned ? (next ? next.x0 - 6 : pageRight) : 2 * ((c.x0 + c.x1) / 2) - left;
      right = Math.min(right, next ? next.x0 - 2 : pg.width - 20);
      if (!next && !leftAligned) right = Math.max(right, Math.min(pageRight, c.x1 + 8));
      const col = { label: c.label, left, right };
      left = right;
      return col;
    });
  }

  const drafts: Draft[] = [];
  for (const s of dayRowsS) {
    const top = s.y + h * 1.2;
    const bottom = top - pitch;
    const dayIndex = kind === 'weekday' ? WEEKDAYS.indexOf(s.text.match(WEEKDAY_RE)![1].toLowerCase()) : Number(s.text.match(DAYN_RE)![1]) - 1;
    const dayMode = kind === 'weekday' ? 'weekday' as const : 'nth' as const;
    const rowLabel = s.text.replace(/:\s*$/, '');
    for (const c of columns) drafts.push({ source: 'label', label: `${rowLabel} – ${c.label}`, binding: 'daily', dayIndex, dayMode, anchor: box(pg.index, c.left + 2, bottom + 1, c.right - c.left - 4, top - bottom - 2) });
    drafts.push({ source: 'label', label: `${rowLabel} – Date`, binding: 'date', dateRole: 'day', dayIndex, dayMode, anchor: box(pg.index, s.x1 + 4, s.y - 2, Math.max(20, dayColRight - s.x1 - 8), 9) });
  }

  // Weekly questions between the grid and the signature line.
  const sig = segs.filter(s => s.y < lastY && SIGNATURE_RE.test(s.text)).sort((a, b) => b.y - a.y)[0];
  const floorY = sig ? sig.y + sig.h + 2 : 30;
  const zone = segs.filter(s => s.y < lastY - 4 && s.y > floorY);
  const nums = zone.filter(s => QNUM_RE.test(s.text));
  const numX1 = nums.length ? Math.max(...nums.map(n => n.x1)) : -Infinity;
  const texts = zone.filter(s => !QNUM_RE.test(s.text) && !/^\(.*\)\.?$/.test(s.text) && s.x0 > numX1 && s.h >= h * 0.8).sort((a, b) => b.y - a.y);
  const groups: { segs: Seg[]; topY: number; bottomY: number; x0: number; x1: number; h: number; label: string }[] = [];
  for (const s of texts) {
    const g = groups[groups.length - 1];
    if (g && g.bottomY - s.y <= s.h * 1.3 && Math.abs(s.x0 - g.x0) < 10) { g.segs.push(s); g.bottomY = s.y; g.x1 = Math.max(g.x1, s.x1); }
    else groups.push({ segs: [s], topY: s.y, bottomY: s.y, x0: s.x0, x1: s.x1, h: s.h, label: '' });
  }
  const qGroups = groups.filter(g => {
    const text = g.segs.map(s => s.text).join(' ');
    g.label = text;
    if (wordCount(text) < 3 || SUPERVISOR_ONLY_RE.test(text)) return false;
    if (nums.length) return nums.some(n => n.y >= g.bottomY - g.h && n.y <= g.topY + g.h * 0.6);
    return wordCount(text) >= 4 && (/\?/.test(text) || /^(what|how|why|describe|explain|list|state|discuss|reflect)/i.test(text));
  });
  const heights: number[] = [];
  const qs = qGroups.map((g, i) => {
    const top = g.bottomY - g.h * 0.25 - 0.5;
    const next = qGroups[i + 1];
    const bottom = next ? next.topY + next.h * 0.875 : null;
    if (bottom != null) heights.push(top - bottom);
    return { label: g.label, x0: g.x0, width: pageRight - g.x0, top, bottom };
  });
  const typical = heights.length ? median(heights) : h * 2.2;
  for (const q of qs) {
    const bottom = q.bottom ?? Math.max(floorY + 2, q.top - typical);
    if (q.top - bottom >= 6) drafts.push({ source: 'label', label: short(q.label), binding: 'period', anchor: box(pg.index, q.x0, bottom, q.width, q.top - bottom) });
  }
  // A signature line drawn with underscores is found by the marker pass instead (it merges by label).
  if (sig && !/_{3,}/.test(sig.text)) drafts.push({ source: 'label', label: sig.text.replace(/[:\s]+$/, ''), binding: 'signature', anchor: box(pg.index, sig.x1 + 6, sig.y - 2, Math.max(40, pageRight - sig.x1 - 6), sig.h + 4) });

  // Cover labels above the grid, including 2-line labels and side-by-side pairs.
  interface Cluster { x0: number; items: Lbl[]; pairedRight: number | null }
  interface Lbl { text: string; x0: number; x1: number; y: number; yTop: number; yBot: number; cluster?: Cluster; paired?: boolean }
  const above = segs.filter(s => s.y > headerTop + 2 && wordCount(s.text) <= 6).sort((a, b) => b.y - a.y);
  const used = new Set<Seg>();
  const lbls: Lbl[] = [];
  for (const s of above) {
    if (used.has(s)) continue;
    const parts = [s];
    let cur = s;
    while (!/:$/.test(cur.text)) {
      const c = cur;
      const nxt = above.find(o => !used.has(o) && !parts.includes(o) && Math.abs(o.x0 - c.x0) < 4 && c.y - o.y > 0 && c.y - o.y <= c.h * 1.4);
      if (!nxt) break;
      parts.push(nxt);
      cur = nxt;
    }
    const text = parts.map(p => p.text).join(' ');
    if (!/:$/.test(cur.text) && !matchCoverKey(text.replace(/:$/, ''))) continue;
    parts.forEach(p => used.add(p));
    lbls.push({ text, x0: s.x0, x1: Math.max(...parts.map(p => p.x1)), y: parts.reduce((a, p) => a + p.y, 0) / parts.length, yTop: s.y, yBot: cur.y });
  }
  const clusters: Cluster[] = [];
  for (const l of lbls) {
    let c = clusters.find(x => Math.abs(x.x0 - l.x0) < 8);
    if (!c) { c = { x0: l.x0, items: [], pairedRight: null }; clusters.push(c); }
    c.items.push(l);
    l.cluster = c;
  }
  clusters.sort((a, b) => a.x0 - b.x0);
  for (const l of lbls) l.paired = lbls.some(o => o.cluster !== l.cluster && o.yBot <= l.yTop + 3 && o.yTop >= l.yBot - 3);
  for (const c of clusters) { const pr = c.items.filter(l => l.paired); c.pairedRight = pr.length ? Math.max(...pr.map(l => l.x1)) : null; }
  const allRight = lbls.length ? Math.max(...lbls.map(l => l.x1)) : 0;
  const place = (l: Lbl) => {
    const x = clusters.length === 1 ? allRight + 22 : l.paired && l.cluster!.pairedRight != null ? l.cluster!.pairedRight + 22 : l.x1 + 34;
    const nextC = clusters.find(c => c.x0 > l.x0 + 8 && c.items.some(o => o.yBot <= l.yTop + 3 && o.yTop >= l.yBot - 3));
    return { x, y: l.y, w: Math.max(30, (nextC ? nextC.x0 - 10 : pageRight) - x) };
  };
  const coverHere: Draft[] = [];
  let matched = 0;
  for (const l of lbls) {
    const bare = l.text.replace(/:$/, '').trim();
    const p = place(l);
    const a = box(pg.index, p.x, p.y - 3, p.w, h + 4);
    const date = (role: DateRole) => drafts.push({ source: 'label', label: bare, binding: 'date', dateRole: role, anchor: a });
    if (WEEK_START_RE.test(bare) || START_RE.test(bare)) date('start');
    else if (END_RE.test(bare)) date('end');
    else if (WEEK_RE.test(bare)) date('number');
    else { if (matchCoverKey(bare)) matched++; coverHere.push({ source: 'label', label: bare, binding: 'cover', anchor: a }); }
  }
  if (matched) drafts.push(...coverHere);
  else {
    const cp = pages.filter(p => p !== pg).reduce<Pg | null>((best, p) => (p.det.matchedCoverCount > (best ? best.det.matchedCoverCount : 0) ? p : best), null);
    if (cp) drafts.push(...coverFieldsOf(cp));
  }
  return { drafts, unitPage: pg.index };
}

function coverFieldsOf(cp: Pg): Draft[] {
  const valueX = Math.max(...cp.det.coverFields.map(f => { const w = f.line.words[f.line.words.length - 1]; return w.x + w.width; })) + 22;
  return cp.det.coverFields.map(f => ({ source: 'label' as const, label: f.text.replace(/:\s*$/, '').trim(), binding: 'cover' as const, anchor: box(cp.index, valueX, f.line.y - 3, cp.width - 36 - valueX, 14) }));
}

/** Port of the known Shape A (APU) and Shape B (Taylor's) PDF layouts, v14 index.html:2388-2469. */
function detectKnown(P: Pg[]): { drafts: Draft[]; unitPage: number } | null {
  const weekPage = P.find(p => p.det.weekLine);
  if (!weekPage || !weekPage.det.weekLine) return null;
  const drafts: Draft[] = [];
  const coverPage = P.reduce<Pg | null>((best, p) => (p.det.matchedCoverCount > (best ? best.det.matchedCoverCount : 0) ? p : best), null);
  if (coverPage && coverPage.det.matchedCoverCount) drafts.push(...coverFieldsOf(coverPage));

  const ww = weekPage.det.weekLine.words;
  const fs = Math.round(ww[0]?.height || 11);
  const after = (w: PdfWord, role: DateRole) => drafts.push({ source: 'label', label: w.str.replace(/:\s*$/, ''), binding: 'date', dateRole: role, anchor: box(weekPage.index, w.x + w.width + 6, w.y - 3, 90, fs + 5) });
  const wn = ww.find(w => WEEK_RE.test(w.str));
  const sw = ww.find(w => START_RE.test(w.str));
  const ew = ww.find(w => END_RE.test(w.str));
  if (wn) after(wn, 'number');
  if (sw) after(sw, 'start');
  if (ew) after(ew, 'end');

  if (weekPage.det.dayLines.length >= 3) {
    const header = weekPage.det.headerLine?.words ?? [];
    const taskW = header.find(w => TASK_RE.test(w.str));
    const toolsW = header.find(w => TOOLS_RE.test(w.str));
    const lessonW = header.find(w => LESSON_RE.test(w.str));
    const right = weekPage.width - 40;
    const colXs = [taskW?.x ?? 150, toolsW?.x, lessonW?.x, right].filter((x): x is number => x != null).sort((a, b) => a - b);
    const colEnd = (x0: number) => colXs.find(x => x > x0) ?? right;
    const cols: { label: string; x0: number }[] = [{ label: taskW?.str ?? 'Task', x0: taskW?.x ?? 150 }];
    if (toolsW) cols.push({ label: toolsW.str, x0: toolsW.x });
    if (lessonW) cols.push({ label: lessonW.str, x0: lessonW.x });
    const dl = weekPage.det.dayLines;
    const rowH = dl.length > 1 ? Math.abs(dl[0].y - dl[1].y) : 24;
    for (const l of dl) {
      const name = l.words[0].str.toLowerCase().match(WEEKDAY_RE)![1];
      const dayIndex = WEEKDAYS.indexOf(name);
      const top = l.y + 9;
      const hgt = rowH - 4;
      for (const c of cols) drafts.push({ source: 'label', label: `${cap(name)} – ${c.label}`, binding: 'daily', dayIndex, dayMode: 'weekday', anchor: box(weekPage.index, c.x0 + 2, top - hgt, colEnd(c.x0) - c.x0 - 4, hgt) });
      const dateLine = weekPage.lines.find(ll => ll !== l && Math.abs(ll.y - (l.y - fs * 1.15)) < fs * 0.6 && ll.words.length === 1 && BRACKET_ONLY_RE.test(ll.words[0].str.trim()));
      if (dateLine) {
        const w = dateLine.words[0];
        drafts.push({ source: 'label', label: `${cap(name)} – Date`, binding: 'date', dateRole: 'day', dayIndex, dayMode: 'weekday', anchor: { ...box(weekPage.index, w.x, w.y - 3, w.width, fs + 5), whiteout: true } });
      }
    }
  } else {
    const obj = weekPage.det.objLine;
    const content = weekPage.det.contentLine;
    const absorb = (startY: number, maxGap = 16) => {
      let y = startY;
      weekPage.lines.filter(l => l.y < startY - 1).sort((a, b) => b.y - a.y).forEach(l => { if (y - l.y <= maxGap) y = l.y; });
      return y;
    };
    const nextLabelY = (afterY: number) => {
      const c = weekPage.lines.filter(l => l.y < afterY - 2 && wordCount(lineText(l)) <= 25 && (hasSigBlank(lineText(l)) || CONTENT_RE.test(lineText(l)))).map(l => l.y);
      return c.length ? Math.max(...c) : afterY - 300;
    };
    const area = (l: Line, bottom: number) => {
      const x0 = l.words[0].x;
      const top = absorb(l.y) - 4;
      drafts.push({ source: 'label', label: short(lineText(l)), binding: 'period', anchor: box(weekPage.index, x0, bottom, weekPage.width - x0 - 50, Math.max(10, top - bottom)) });
    };
    if (obj) area(obj, content ? absorb(content.y) + fs : nextLabelY(obj.y));
    if (content) area(content, nextLabelY(content.y));
  }
  return { drafts, unitPage: weekPage.index };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/detect-pdf.test.ts`
Expected: PASS (5 tests). If a fixture count is off, the assertion message prints every detected placeholder. Compare it with v14's functions at the cited lines, then fix the port.

- [ ] **Step 6: Commit**

```bash
git add src/core/pdf src/core/detect/pdf.ts tests/unit/detect-pdf.test.ts
git commit -m "feat(core): extract PDF text and detect PDF placeholders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Word fill

**Files:**
- Create: `src/core/fill/docx.ts`
- Test: `tests/unit/fill-docx.test.ts`

**Interfaces:**
- Consumes: Task 6 helpers and `Placeholder`.
- Produces:
  - `PAGE_BREAK` (string)
  - `applyValues(xml, placeholders, values): string`
  - `fillDocx(bytes: ArrayBuffer | Uint8Array, template: { placeholders: Placeholder[]; unitStartBlock?: number }, cover: Record<string, string>, periods: Record<string, string>[]): Promise<Uint8Array>`. It throws `'Select at least one period to export.'` when `periods` is empty.

- [ ] **Step 1: Write the failing tests**

`tests/unit/fill-docx.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { applyValues, fillDocx } from '../../src/core/fill/docx';
import { detectDocx, readDocxXml } from '../../src/core/detect/docx';
import type { Placeholder } from '../../src/core/model';

const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const BODY = P('Name: &lt;name&gt;  Date: &lt;date&gt;') +
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Monday</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>';
const XML = `<w:document><w:body>${BODY}<w:sectPr/></w:body></w:document>`;

async function makeDocx(xml: string) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array' });
}
const docXml = async (bytes: Uint8Array) => (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');

const phs: Placeholder[] = [
  { id: 'name', label: 'name', binding: 'cover', source: 'marker', region: 'cover', anchor: { kind: 'docx-text', paragraph: 0, start: 6, end: 12 } },
  { id: 'date', label: 'date', binding: 'cover', source: 'marker', region: 'cover', anchor: { kind: 'docx-text', paragraph: 0, start: 20, end: 26 } },
  { id: 'mon', label: 'Monday', binding: 'daily', source: 'label', region: 'unit', anchor: { kind: 'docx-cell', table: [0], row: 0, col: 1 } },
];
const template = { placeholders: phs, unitStartBlock: 1 };

describe('fillDocx', () => {
  it('fills the cover once and clones the unit per period with page breaks', async () => {
    const out = await docXml(await fillDocx(await makeDocx(XML), template, { name: 'Aina', date: '01/09/2026' }, [{ mon: 'Week one' }, { mon: 'Week two' }]));
    expect(out).toContain('Name: Aina  Date: 01/09/2026');
    expect(out.match(/<w:tbl>/g)).toHaveLength(2);
    expect(out.match(/w:type="page"/g)).toHaveLength(1);
    expect(out.indexOf('Week one')).toBeLessThan(out.indexOf('Week two'));
    expect(out.trimEnd().endsWith('<w:sectPr/></w:body></w:document>')).toBe(true);
  });
  // Review Focus #1: XML-special characters and newlines.
  it('escapes XML characters and turns newlines into line breaks', async () => {
    const out = await docXml(await fillDocx(await makeDocx(XML), template, {}, [{ mon: 'R&D <api> "ok"\nsecond line' }]));
    expect(out).toContain('R&amp;D &lt;api&gt; "ok"</w:t><w:br/><w:t xml:space="preserve">second line');
    expect(() => new DOMParserLike(out)).not.toThrow();
  });
  // Review Focus #5: stale ids and anchors that no longer resolve.
  it('ignores values for unknown placeholders and anchors that point nowhere', () => {
    const stale: Placeholder[] = [
      { id: 'gone', label: 'x', binding: 'free', source: 'manual', region: 'unit', anchor: { kind: 'docx-cell', table: [9], row: 0, col: 0 } },
      { id: 'gone2', label: 'y', binding: 'free', source: 'manual', region: 'unit', anchor: { kind: 'docx-text', paragraph: 99, start: 0, end: 0 } },
    ];
    expect(applyValues(XML, stale, { gone: 'a', gone2: 'b', never: 'c' })).toBe(XML);
  });
  it('refuses an empty selection', async () => {
    await expect(fillDocx(await makeDocx(XML), template, {}, [])).rejects.toThrow('Select at least one period');
  });
  it("round-trips a real template (Taylor's)", async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../fixtures/taylors.docx', import.meta.url)));
    const det = detectDocx(await readDocxXml(bytes));
    const values = Object.fromEntries(det.placeholders.filter(p => p.binding === 'daily').map((p, i) => [p.id, `MARK-${i}`]));
    const out = await docXml(await fillDocx(bytes, det, {}, [values]));
    expect(out).toContain('MARK-0');
    expect(out).toContain('MARK-14');
  });
});

/** Minimal well-formedness check: every opened w: element is closed in order. */
class DOMParserLike {
  constructor(xml: string) {
    const stack: string[] = [];
    for (const m of xml.matchAll(/<(\/?)(w:[A-Za-z]+)[^>]*?(\/?)>/g)) {
      if (m[3]) continue;
      if (!m[1]) stack.push(m[2]);
      else if (stack.pop() !== m[2]) throw new Error(`Mismatched </${m[2]}>`);
    }
    if (stack.length) throw new Error(`Unclosed ${stack.join(',')}`);
  }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/fill-docx.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/fill/docx.ts`**

```ts
import JSZip from 'jszip';
import type { Placeholder } from '../model';
import { allParagraphs, bodyBlocks, bodyRange, cellIndex, replaceCellContent, replaceTextRange } from '../docx/xml';

export const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/**
 * Writes values into the ORIGINAL document XML. Anchors are resolved against
 * that same XML, and edits are applied back-to-front so earlier offsets stay
 * valid. When a cell edit contains a text edit, the cell edit wins.
 */
export function applyValues(xml: string, placeholders: Placeholder[], values: Record<string, string>): string {
  const paras = allParagraphs(xml);
  const cells = cellIndex(xml);
  const cellEdits: { start: number; end: number; replacement: string }[] = [];
  const textByPara = new Map<number, { start: number; end: number; v: string }[]>();

  for (const ph of placeholders) {
    const v = values[ph.id];
    if (!v || !v.trim()) continue;
    const a = ph.anchor;
    if (a.kind === 'docx-cell') {
      const c = cells.find(x => x.table.join('.') === a.table.join('.') && x.row === a.row && x.col === a.col);
      if (c) cellEdits.push({ start: c.start, end: c.end, replacement: replaceCellContent(xml.slice(c.start, c.end), v) });
    } else if (a.kind === 'docx-text' && paras[a.paragraph]) {
      const list = textByPara.get(a.paragraph) ?? [];
      list.push({ start: a.start, end: a.end, v });
      textByPara.set(a.paragraph, list);
    }
  }

  const uniq = cellEdits.filter((e, i) => cellEdits.findIndex(o => o.start === e.start && o.end === e.end) === i);
  const outer = uniq.filter(e => !uniq.some(o => o !== e && o.start <= e.start && o.end >= e.end));
  const edits = [...outer];
  for (const [pi, list] of textByPara) {
    const p = paras[pi];
    if (outer.some(e => p.start >= e.start && p.end <= e.end)) continue;
    let full = p.full;
    for (const t of list.sort((a, b) => b.start - a.start)) full = replaceTextRange(full, t.start, t.end, t.v);
    edits.push({ start: p.start, end: p.end, replacement: full });
  }
  let out = xml;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  return out;
}

/** Cover blocks (filled once), then the unit blocks filled once per period, joined by page breaks, then the final sectPr. */
export async function fillDocx(
  bytes: ArrayBuffer | Uint8Array,
  template: { placeholders: Placeholder[]; unitStartBlock?: number },
  cover: Record<string, string>,
  periods: Record<string, string>[],
): Promise<Uint8Array> {
  if (!periods.length) throw new Error('Select at least one period to export.');
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('This file is not a Word document.');
  const xml = await file.async('string');
  const start = template.unitStartBlock ?? 0;
  const coverPhs = template.placeholders.filter(p => p.region === 'cover');
  const unitPhs = template.placeholders.filter(p => p.region === 'unit');
  const notSect = (b: { tag: string }) => b.tag !== 'w:sectPr';

  const coverBlocks = bodyBlocks(applyValues(xml, coverPhs, cover));
  const coverPart = coverBlocks.slice(0, start).filter(notSect).map(b => b.full).join('');
  const sect = coverBlocks.find(b => b.tag === 'w:sectPr')?.full ?? '';
  const units = periods.map(v => bodyBlocks(applyValues(xml, unitPhs, v)).slice(start).filter(notSect).map(b => b.full).join(''));

  const { start: bs, end: be } = bodyRange(xml);
  zip.file('word/document.xml', xml.slice(0, bs) + coverPart + units.join(PAGE_BREAK) + sect + xml.slice(be));
  return zip.generateAsync({ type: 'uint8array' });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/fill-docx.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/fill/docx.ts tests/unit/fill-docx.test.ts
git commit -m "feat(core): fill Word templates per period

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: PDF text layout and fill

**Files:**
- Create: `src/core/fill/pdfLayout.ts`, `src/core/fill/pdf.ts`
- Test: `tests/unit/fill-pdf.test.ts`

**Interfaces:**
- Consumes: `PdfAnchor`, `PageRole`, `Placeholder`; `extractPdfText` (test only).
- Produces:
  - `pdfLayout.ts`: `FontLike { widthOfTextAtSize(t, size): number }`, `Layout { size; lines: string[]; truncated; lineHeight }`, `MAX_SIZE = 10`, `MIN_SIZE = 5.5`, `LINE_GAP = 1.2`, `wrap(text, font, size, width)`, `layoutText(text, font, { w, h })`, `boxLayout(text, font, anchor)` (layout for the box inset by 1pt on each side, as used by both fill and preview), and `toWinAnsi(text)`.
  - `pdf.ts`: `getHelvetica(): Promise<PDFFont>` (cached, used by the preview), `PdfFillInput`, and `fillPdf(input): Promise<Uint8Array>`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/fill-pdf.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fillPdf } from '../../src/core/fill/pdf';
import { layoutText, toWinAnsi, wrap, type FontLike } from '../../src/core/fill/pdfLayout';
import { extractPdfText } from '../../src/core/pdf/text';
import type { Placeholder } from '../../src/core/model';

const mono: FontLike = { widthOfTextAtSize: (t, s) => t.length * s * 0.5 };

describe('layout', () => {
  it('keeps 10pt when text fits', () => {
    expect(layoutText('short text', mono, { w: 200, h: 30 })).toMatchObject({ size: 10, truncated: false, lines: ['short text'] });
  });
  it('shrinks to fit, then truncates at 5.5pt', () => {
    const long = 'word '.repeat(40);
    const shrunk = layoutText(long, mono, { w: 200, h: 40 });
    expect(shrunk.size).toBeLessThan(10);
    expect(shrunk.truncated).toBe(false);
    const cut = layoutText(long.repeat(10), mono, { w: 100, h: 10 });
    expect(cut).toMatchObject({ size: 5.5, truncated: true });
  });
  it('hard-breaks a word longer than the box and keeps blank lines', () => {
    expect(wrap('abcdefghij', mono, 10, 25)).toEqual(['abcde', 'fghij']);
    expect(wrap('a\n\nb', mono, 10, 100)).toEqual(['a', '', 'b']);
  });
  // Review Focus #2 (unit level)
  it('maps text to what Helvetica can encode', () => {
    expect(toWinAnsi('Kerja 完成 ✅ “done” – ok…')).toBe('Kerja ?? ? "done" - ok...');
  });
});

async function template() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 300]).drawText('COVER', { x: 20, y: 280, size: 10, font });
  doc.addPage([300, 300]).drawText('UNIT', { x: 20, y: 280, size: 10, font });
  return doc.save();
}
const ph = (id: string, page: number, extra: Partial<Placeholder> = {}): Placeholder => ({
  id, label: id, binding: 'free', source: 'manual', region: page === 0 ? 'cover' : 'unit',
  anchor: { kind: 'pdf', page, x: 20, y: 150, w: 250, h: 100 }, ...extra,
});
const words = (p: { words: { str: string }[] }) => p.words.map(w => w.str).join(' ');

describe('fillPdf', () => {
  it('copies cover pages once and unit pages per period, drawing values', async () => {
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [ph('c', 0), ph('u', 1)], pageRoles: ['cover', 'unit'] },
      cover: { c: 'Aina Rahman' },
      periods: [{ label: 'Week 1', values: { u: 'Did task one' } }, { label: 'Week 2', values: { u: 'Did task two' } }],
    });
    const pages = await extractPdfText(out);
    expect(pages).toHaveLength(3);
    expect(words(pages[0])).toContain('Aina Rahman');
    expect(words(pages[1])).toContain('Did task one');
    expect(words(pages[2])).toContain('Did task two');
  });
  it('skips ignored pages and appends overflow pages for text that cannot fit', async () => {
    const tiny = ph('u', 1, { anchor: { kind: 'pdf', page: 1, x: 20, y: 150, w: 40, h: 8 } });
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [tiny], pageRoles: ['ignore', 'unit'] },
      cover: {},
      periods: [{ label: 'Week 1', values: { u: 'A very long entry '.repeat(30) } }],
    });
    const pages = await extractPdfText(out);
    expect(pages).toHaveLength(2);
    expect(words(pages[1])).toContain('Continued entries');
    expect(words(pages[1])).toContain('Week 1 - u');
  });
  // Review Focus #2 (end to end)
  it('does not crash on non-Latin text or emoji', async () => {
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [ph('u', 1)], pageRoles: ['cover', 'unit'] },
      cover: {},
      periods: [{ label: 'W1', values: { u: 'Siti “Nur” 完成 ✅' } }],
    });
    expect(words((await extractPdfText(out))[1])).toContain('"Nur"');
  });
  // Review Focus #5
  it('ignores stale values and anchors on pages that no longer exist', async () => {
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [ph('u', 7)], pageRoles: ['cover', 'unit'] },
      cover: {},
      periods: [{ label: 'W1', values: { u: 'x', gone: 'y' } }],
    });
    expect(await extractPdfText(out)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/fill-pdf.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement `src/core/fill/pdfLayout.ts`**

```ts
import type { PdfAnchor } from '../model';

export interface FontLike { widthOfTextAtSize(text: string, size: number): number }
export interface Layout { size: number; lines: string[]; truncated: boolean; lineHeight: number }

export const MAX_SIZE = 10;
export const MIN_SIZE = 5.5;
export const LINE_GAP = 1.2;

function breakWord(word: string, font: FontLike, size: number, width: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= width) return [word];
  const parts: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (cur && font.widthOfTextAtSize(cur + ch, size) > width) { parts.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function wrap(text: string, font: FontLike, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) { out.push(''); continue; }
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      for (const piece of breakWord(word, font, size, width)) {
        const trial = cur ? `${cur} ${piece}` : piece;
        if (cur && font.widthOfTextAtSize(trial, size) > width) { out.push(cur); cur = piece; } else cur = trial;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Largest size from 10pt down to 5.5pt (0.5pt steps) at which the text fits; below that it's truncated. */
export function layoutText(text: string, font: FontLike, box: { w: number; h: number }): Layout {
  for (let k = 0; ; k++) {
    const size = MAX_SIZE - k * 0.5;
    const lineHeight = size * LINE_GAP;
    const lines = wrap(text, font, size, box.w);
    if (lines.length * lineHeight <= box.h + 0.01) return { size, lines, truncated: false, lineHeight };
    if (size <= MIN_SIZE) {
      const max = Math.max(1, Math.floor(box.h / lineHeight));
      return { size, lines: lines.slice(0, max), truncated: lines.length > max, lineHeight };
    }
  }
}

/** Text is drawn 1pt in from the box's left edge, so lay out against the inset width. Shared by fill and preview. */
export const boxLayout = (text: string, font: FontLike, a: PdfAnchor): Layout =>
  layoutText(text, font, { w: Math.max(1, a.w - 2), h: a.h });

const REPLACE: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-',
  '\u2026': '...', '\u2022': '*', '\u00A0': ' ', '\t': '    ',
};

/** Helvetica (a standard PDF font) can only encode WinAnsi; anything else would make pdf-lib throw. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u00A0\t]/g, c => REPLACE[c])
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/gu, '?');
}
```

- [ ] **Step 4: Implement `src/core/fill/pdf.ts`**

```ts
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PageRole, PdfAnchor, Placeholder } from '../model';
import { boxLayout, toWinAnsi, wrap } from './pdfLayout';

let helvetica: Promise<PDFFont> | null = null;
/** A Helvetica instance for measuring text in the live preview (same metrics as the export). */
export function getHelvetica(): Promise<PDFFont> {
  helvetica ??= PDFDocument.create().then(d => d.embedFont(StandardFonts.Helvetica));
  return helvetica;
}

export interface PdfFillInput {
  templateBytes: Uint8Array;
  template: { placeholders: Placeholder[]; pageRoles?: PageRole[] };
  cover: Record<string, string>;
  periods: { label: string; values: Record<string, string> }[];
}
interface Overflow { heading: string; text: string }

export async function fillPdf(input: PdfFillInput): Promise<Uint8Array> {
  if (!input.periods.length) throw new Error('Select at least one period to export.');
  const src = await PDFDocument.load(input.templateBytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const n = src.getPageCount();
  const roles: PageRole[] = Array.from({ length: n }, (_, i) => input.template.pageRoles?.[i] ?? 'unit');
  const on = (i: number) => input.template.placeholders.filter(p => p.anchor.kind === 'pdf' && p.anchor.page === i);
  const overflow: Overflow[] = [];

  const addFilled = async (i: number, values: Record<string, string>, heading: string) => {
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    for (const ph of on(i)) drawValue(page, ph, values[ph.id], font, heading, overflow);
  };
  for (let i = 0; i < n; i++) if (roles[i] === 'cover') await addFilled(i, input.cover, 'Cover');
  for (const p of input.periods) for (let i = 0; i < n; i++) if (roles[i] === 'unit') await addFilled(i, p.values, p.label);

  if (overflow.length) {
    const { width, height } = src.getPage(0).getSize();
    appendOverflow(out, font, bold, overflow, width, height);
  }
  return out.save();
}

function drawValue(page: PDFPage, ph: Placeholder, value: string | undefined, font: PDFFont, heading: string, overflow: Overflow[]) {
  if (!value?.trim()) return;
  const a = ph.anchor as PdfAnchor;
  if (a.whiteout) page.drawRectangle({ x: a.x - 1, y: a.y - 1, width: a.w + 2, height: a.h + 2, color: rgb(1, 1, 1) });
  const text = toWinAnsi(value);
  const lay = boxLayout(text, font, a);
  let y = a.y + a.h - lay.size;
  for (const line of lay.lines) {
    if (line) page.drawText(line, { x: a.x + 1, y, size: lay.size, font });
    y -= lay.lineHeight;
  }
  if (lay.truncated) overflow.push({ heading: `${heading} - ${ph.label}`, text });
}

/** Ported from v14 appendPdfOverflowPages (index.html:2608): nothing the intern wrote is dropped. */
function appendOverflow(doc: PDFDocument, font: PDFFont, bold: PDFFont, items: Overflow[], pw: number, ph: number) {
  const margin = 50;
  const width = pw - margin * 2;
  let page = doc.addPage([pw, ph]);
  let y = ph - margin;
  const ensure = (needed: number) => { if (y - needed < margin) { page = doc.addPage([pw, ph]); y = ph - margin; } };
  page.drawText('Continued entries', { x: margin, y, size: 13, font: bold });
  y -= 20;
  for (const l of wrap('These entries were too long for their box on the form. The full text is below.', font, 9, width)) {
    page.drawText(l, { x: margin, y, size: 9, font });
    y -= 12;
  }
  y -= 8;
  for (const it of items) {
    for (const l of wrap(toWinAnsi(it.heading), bold, 10, width)) { ensure(13); page.drawText(l, { x: margin, y, size: 10, font: bold }); y -= 13; }
    for (const l of wrap(it.text, font, 10, width)) { ensure(13); if (l) page.drawText(l, { x: margin, y, size: 10, font }); y -= 13; }
    y -= 10;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/fill-pdf.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/fill tests/unit/fill-pdf.test.ts
git commit -m "feat(core): lay out and fill PDF templates with overflow pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Template module

**Files:**
- Create: `src/core/template.ts`
- Test: `tests/unit/template.test.ts`

**Interfaces:**
- Consumes: `detectDocx`, `readDocxXml`, `DocxContext` (Task 8); `extractPdfText` (Task 9); `detectPdf` (Task 9).
- Produces:
  - `UserError extends Error`
  - `formatOf(name): Format`
  - `Detected { format; bytes: ArrayBuffer; placeholders; pageRoles?; unitStartBlock?; warnings; docx?: DocxContext }`
  - `detectFromFile(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Detected>`
  - `normalizeUniversity(name): string`, `findByUniversity(list, name, exceptId?)`, `validateTemplate(t): string[]`, `cloneTemplate(t): Template`

- [ ] **Step 1: Write the failing tests**

`tests/unit/template.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cloneTemplate, detectFromFile, findByUniversity, formatOf, normalizeUniversity, validateTemplate, UserError } from '../../src/core/template';
import type { Template } from '../../src/core/model';

const fileOf = (name: string, bytes: Uint8Array) => ({ name, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const fixture = (f: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${f}`, import.meta.url)));

const base: Template = {
  id: 't1', university: "Taylor's University", format: 'pdf', fileName: 'a.pdf', fileBytes: new ArrayBuffer(4), period: 'weekly',
  pageRoles: ['unit'], updatedAt: '', placeholders: [{ id: 'p', label: 'x', binding: 'daily', source: 'label', region: 'unit', anchor: { kind: 'pdf', page: 0, x: 1, y: 1, w: 5, h: 5 } }],
};

describe('template module', () => {
  it('accepts only .docx and .pdf', () => {
    expect(formatOf('Logbook.DOCX')).toBe('docx');
    expect(formatOf('a.pdf')).toBe('pdf');
    expect(() => formatOf('a.doc')).toThrow(UserError);
  });
  // Review Focus #4
  it('treats university names with different case and spacing as the same', () => {
    expect(normalizeUniversity("  Taylor's   University ")).toBe(normalizeUniversity("taylor's university"));
    expect(findByUniversity([base], " TAYLOR'S  university")?.id).toBe('t1');
    expect(findByUniversity([base], "taylor's university", 't1')).toBeUndefined();
  });
  it('validates required parts', () => {
    expect(validateTemplate(base)).toEqual([]);
    const bad = { ...base, university: ' ', pageRoles: ['cover' as const], placeholders: [] };
    expect(validateTemplate(bad)).toEqual([
      'Enter the university name.',
      'Mark at least one page as "Repeats every period".',
      'Add at least one placeholder to the repeating part.',
    ]);
  });
  it('deep-clones so editor changes do not leak into the stored copy', () => {
    const c = cloneTemplate(base);
    c.placeholders[0].label = 'changed';
    expect(base.placeholders[0].label).toBe('x');
    expect(c.fileBytes).toBe(base.fileBytes);
  });
  it('detects a PDF and keeps the original bytes intact', async () => {
    const r = await detectFromFile(fileOf('pmu.pdf', fixture('pmu.pdf')));
    expect(r.format).toBe('pdf');
    expect(r.bytes.byteLength).toBeGreaterThan(1000);
    expect(r.pageRoles?.length).toBeGreaterThan(0);
  });
  it('detects a Word file and returns its context', async () => {
    const r = await detectFromFile(fileOf('pmu.docx', fixture('pmu.docx')));
    expect(r.format).toBe('docx');
    expect(r.docx?.paraTexts.length).toBeGreaterThan(0);
  });
  it('explains unreadable and password-protected files', async () => {
    await expect(detectFromFile(fileOf('x.docx', new Uint8Array([1, 2, 3])))).rejects.toThrow("This Word file can't be opened");
    await expect(detectFromFile(fileOf('x.pdf', new Uint8Array([1, 2, 3])))).rejects.toThrow("This PDF can't be opened");
    const doc = await PDFDocument.create();
    doc.addPage();
    expect((await detectFromFile(fileOf('ok.pdf', await doc.save()))).warnings.join(' ')).toMatch(/No text found/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/template.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement `src/core/template.ts`**

```ts
import type { Format, PageRole, Placeholder, Template } from './model';
import { detectDocx, readDocxXml, type DocxContext } from './detect/docx';
import { detectPdf } from './detect/pdf';
import { extractPdfText } from './pdf/text';

/** An error whose message is written for the person using the app. */
export class UserError extends Error {}

export function formatOf(name: string): Format {
  const n = name.toLowerCase();
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.pdf')) return 'pdf';
  throw new UserError('Only Word (.docx) and PDF (.pdf) templates are supported.');
}

export interface Detected {
  format: Format;
  bytes: ArrayBuffer;
  placeholders: Placeholder[];
  pageRoles?: PageRole[];
  unitStartBlock?: number;
  warnings: string[];
  docx?: DocxContext;
}

export async function detectFromFile(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Detected> {
  const format = formatOf(file.name);
  const bytes = await file.arrayBuffer();
  if (format === 'docx') {
    let xml: string;
    try { xml = await readDocxXml(bytes); } catch { throw new UserError("This Word file can't be opened — it may be corrupt, or not a .docx file."); }
    const d = detectDocx(xml);
    return { format, bytes, placeholders: d.placeholders, unitStartBlock: d.unitStartBlock, warnings: d.warnings, docx: d.ctx };
  }
  let pages;
  try {
    pages = await extractPdfText(new Uint8Array(bytes));
  } catch (e) {
    if ((e as { name?: string })?.name === 'PasswordException') throw new UserError('This PDF is password-protected; upload an unlocked copy.');
    throw new UserError("This PDF can't be opened — it may be corrupt.");
  }
  const d = detectPdf(pages);
  return { format, bytes, placeholders: d.placeholders, pageRoles: d.pageRoles, warnings: d.warnings };
}

export const normalizeUniversity = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

export function findByUniversity(list: Template[], name: string, exceptId?: string): Template | undefined {
  const n = normalizeUniversity(name);
  return list.find(t => t.id !== exceptId && normalizeUniversity(t.university) === n);
}

export function validateTemplate(t: Template): string[] {
  const errors: string[] = [];
  if (!t.university.trim()) errors.push('Enter the university name.');
  if (t.format === 'pdf' && !(t.pageRoles ?? []).includes('unit')) errors.push('Mark at least one page as "Repeats every period".');
  if (t.format === 'docx' && t.unitStartBlock == null) errors.push('Choose where the repeating part starts.');
  if (!t.placeholders.some(p => p.region === 'unit')) errors.push('Add at least one placeholder to the repeating part.');
  return errors;
}

export function cloneTemplate(t: Template): Template {
  return {
    ...t,
    pageRoles: t.pageRoles ? [...t.pageRoles] : undefined,
    placeholders: t.placeholders.map(p => ({ ...p, anchor: p.anchor.kind === 'docx-cell' ? { ...p.anchor, table: [...p.anchor.table] } : { ...p.anchor } })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/template.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole unit suite**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/template.ts tests/unit/template.test.ts
git commit -m "feat(core): template detection entry point and validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Data layer (IndexedDB repository and seed)

**Files:**
- Create: `src/data/repository.ts`, `src/data/idb.ts`, `src/data/plain.ts`, `src/data/seed.ts`
- Test: `tests/unit/data.test.ts`

**Interfaces:**
- Consumes: the model types.
- Produces:
  - `Repository` interface:
    - `listTemplates()`, `getTemplate(id)`, `putTemplate(t)`, `deleteTemplate(id)`
    - `listStudents()`, `putStudent(s)`
    - `getNotes(studentId)`, `putNote(e)`
    - `getFills(studentId?)`, `putFill(f)`
    - `listActions(studentId?)`, `addAction(a)`
    - `reset()`
  - `repo(): Repository` (defaults to `new IdbRepository()`) and `setRepository(r)`
  - `IdbRepository(name = 'intern-logbook')`
  - `plain<T>(v: T): T`, which deep-copies without Vue proxies and keeps ArrayBuffers as they are.
  - `DEMO_STUDENTS`, `ensureSeed(r)`, `resetDemoData(r)`

- [ ] **Step 1: Write the failing tests**

`tests/unit/data.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { IdbRepository } from '../../src/data/idb';
import { plain } from '../../src/data/plain';
import { DEMO_STUDENTS, ensureSeed, resetDemoData } from '../../src/data/seed';
import type { Template } from '../../src/core/model';

const fresh = () => new IdbRepository(`test-${Math.random()}`);
const tpl: Template = { id: 't1', university: 'U', format: 'pdf', fileName: 'u.pdf', fileBytes: new Uint8Array([1, 2, 3]).buffer, period: 'weekly', pageRoles: ['unit'], placeholders: [], updatedAt: 'now' };

describe('IdbRepository', () => {
  it('round-trips templates including file bytes', async () => {
    const r = fresh();
    await r.putTemplate(tpl);
    const back = await r.getTemplate('t1');
    expect(new Uint8Array(back!.fileBytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await r.listTemplates()).toHaveLength(1);
    await r.deleteTemplate('t1');
    expect(await r.getTemplate('t1')).toBeUndefined();
  });
  it('stores notes and fills per student and filters by student', async () => {
    const r = fresh();
    await r.putNote({ studentId: 'a', date: '2026-09-24', text: 'x', updatedAt: '' });
    await r.putNote({ studentId: 'a', date: '2026-09-24', text: 'y', updatedAt: '' }); // same key overwrites
    await r.putNote({ studentId: 'b', date: '2026-09-24', text: 'z', updatedAt: '' });
    expect((await r.getNotes('a')).map(n => n.text)).toEqual(['y']);
    await r.putFill({ studentId: 'a', periodKey: 'w:1', values: {}, autofilled: {}, status: 'draft' });
    await r.putFill({ studentId: 'b', periodKey: 'w:1', values: {}, autofilled: {}, status: 'draft' });
    expect(await r.getFills('a')).toHaveLength(1);
    expect(await r.getFills()).toHaveLength(2);
    await r.addAction({ id: '1', studentId: 'a', periodKey: 'w:1', action: 'submit', by: 'A', at: '' });
    expect(await r.listActions('a')).toHaveLength(1);
    expect(await r.listActions('b')).toHaveLength(0);
  });
  it('stores reactive objects by stripping Vue proxies', async () => {
    const r = fresh();
    const s = reactive({ id: 's', name: 'N', coverValues: { a: '1' } });
    await r.putStudent(plain(s));
    expect((await r.listStudents())[0].coverValues).toEqual({ a: '1' });
  });
  it('seeds the demo students once and resets everything', async () => {
    const r = fresh();
    await ensureSeed(r);
    await ensureSeed(r);
    expect((await r.listStudents()).map(s => s.name).sort()).toEqual(DEMO_STUDENTS.map(s => s.name).sort());
    await r.putTemplate(tpl);
    await resetDemoData(r);
    expect(await r.listTemplates()).toEqual([]);
    expect(await r.listStudents()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/data.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement the data layer**

`src/data/repository.ts`:
```ts
import type { NotepadEntry, PeriodFill, ReviewAction, Student, Template } from '../core/model';
import { IdbRepository } from './idb';

/** The one seam between the app and storage. The Laravel version swaps this for REST calls. */
export interface Repository {
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  putTemplate(t: Template): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  listStudents(): Promise<Student[]>;
  putStudent(s: Student): Promise<void>;
  getNotes(studentId: string): Promise<NotepadEntry[]>;
  putNote(e: NotepadEntry): Promise<void>;
  getFills(studentId?: string): Promise<PeriodFill[]>;
  putFill(f: PeriodFill): Promise<void>;
  listActions(studentId?: string): Promise<ReviewAction[]>;
  addAction(a: ReviewAction): Promise<void>;
  reset(): Promise<void>;
}

let current: Repository | null = null;
export function repo(): Repository {
  current ??= new IdbRepository();
  return current;
}
export function setRepository(r: Repository): void {
  current = r;
}
```

`src/data/plain.ts`:
```ts
import { toRaw } from 'vue';

/** Deep copy without Vue proxies (IndexedDB can't clone proxies). ArrayBuffers are kept as-is. */
export function plain<T>(v: T): T {
  const r = toRaw(v) as unknown;
  if (r === null || typeof r !== 'object' || r instanceof ArrayBuffer || ArrayBuffer.isView(r)) return r as T;
  if (Array.isArray(r)) return r.map(x => plain(x)) as T;
  const o: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(r as Record<string, unknown>)) if (val !== undefined) o[k] = plain(val);
  return o as T;
}
```

`src/data/idb.ts`:
```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { NotepadEntry, PeriodFill, ReviewAction, Student, Template } from '../core/model';
import type { Repository } from './repository';
import { plain } from './plain';

const STORES = ['templates', 'students', 'notes', 'fills', 'actions'] as const;

export class IdbRepository implements Repository {
  private dbp: Promise<IDBPDatabase> | null = null;
  constructor(private readonly name = 'intern-logbook') {}

  private db(): Promise<IDBPDatabase> {
    this.dbp ??= openDB(this.name, 1, {
      upgrade(db) {
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('students', { keyPath: 'id' });
        db.createObjectStore('notes', { keyPath: ['studentId', 'date'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
      },
    });
    return this.dbp;
  }

  async listTemplates(): Promise<Template[]> { return (await this.db()).getAll('templates'); }
  async getTemplate(id: string): Promise<Template | undefined> { return (await this.db()).get('templates', id); }
  async putTemplate(t: Template): Promise<void> { await (await this.db()).put('templates', plain(t)); }
  async deleteTemplate(id: string): Promise<void> { await (await this.db()).delete('templates', id); }
  async listStudents(): Promise<Student[]> { return (await this.db()).getAll('students'); }
  async putStudent(s: Student): Promise<void> { await (await this.db()).put('students', plain(s)); }
  async getNotes(studentId: string): Promise<NotepadEntry[]> { return (await this.db()).getAllFromIndex('notes', 'byStudent', studentId); }
  async putNote(e: NotepadEntry): Promise<void> { await (await this.db()).put('notes', plain(e)); }
  async getFills(studentId?: string): Promise<PeriodFill[]> {
    const db = await this.db();
    return studentId ? db.getAllFromIndex('fills', 'byStudent', studentId) : db.getAll('fills');
  }
  async putFill(f: PeriodFill): Promise<void> { await (await this.db()).put('fills', plain(f)); }
  async listActions(studentId?: string): Promise<ReviewAction[]> {
    const db = await this.db();
    return studentId ? db.getAllFromIndex('actions', 'byStudent', studentId) : db.getAll('actions');
  }
  async addAction(a: ReviewAction): Promise<void> { await (await this.db()).put('actions', plain(a)); }
  async reset(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([...STORES], 'readwrite');
    await Promise.all([...STORES.map(s => tx.objectStore(s).clear()), tx.done]);
  }
}
```

`src/data/seed.ts`:
```ts
import type { Student } from '../core/model';
import type { Repository } from './repository';

export const DEMO_STUDENTS: Student[] = [
  { id: 'student-aina', name: 'Aina Rahman', coverValues: {} },
  { id: 'student-daniel', name: 'Daniel Lim', coverValues: {} },
];

export async function ensureSeed(r: Repository): Promise<void> {
  const existing = new Set((await r.listStudents()).map(s => s.id));
  for (const s of DEMO_STUDENTS) if (!existing.has(s.id)) await r.putStudent({ ...s, coverValues: {} });
}

export async function resetDemoData(r: Repository): Promise<void> {
  await r.reset();
  await ensureSeed(r);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data tests/unit/data.test.ts
git commit -m "feat(data): IndexedDB repository, demo seed and proxy-safe storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Pinia stores

**Files:**
- Create: `src/stores/session.ts`, `src/stores/toast.ts`, `src/stores/templates.ts`, `src/stores/student.ts`, `src/stores/review.ts`
- Test: `tests/unit/stores.test.ts`

**Interfaces:**
- Consumes: `repo()`, `plain`, `resetDemoData`, `buildPeriods`, the workflow functions, `eachDay`.
- Produces:
  - `useSession`: `SUPERVISOR = 'supervisor'`, plus `role`, `students`, `isSupervisor`, `setRole(r)`, `loadStudents()`, `resetDemo()`.
  - `useToast`: `items`, `show(text, error?)`, `dismiss(id)`.
  - `useTemplates`: `list`, `load()`, `save(t)`, `remove(id)`, `usage(id): Promise<number>`, `studentsWithValues(templateId, phIds): Promise<number>`.
  - `useStudent`:
    - State: `student`, `template`, `templateMissing`, `notes: Record<date, text>`, `fills: Record<periodKey, PeriodFill>`, `actions`, `loadedFor`, `periods`, `canChangeSetup`, `lockedDates: Set<string>`.
    - Actions: `load(id)`, `setup(templateId, start, end)`, `saveNote(date, text)`, `fillFor(key)`, `saveFill(f)`, `saveCover(values)`, `submit(key)`.
    - Helpers: `statusOf(key)`, `latest(key, kind?)`.
  - `useReview`: `SUPERVISOR_NAME = 'Supervisor'`, `ReviewRow`, plus `students`, `templates`, `fills`, `actions`, `rows`, `queue`, `load()`, `row(studentId, key)`, `notesFor(studentId)`, `approve(studentId, key, signature)`, `requestChanges(studentId, key, comment)`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/stores.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { IdbRepository } from '../../src/data/idb';
import { setRepository } from '../../src/data/repository';
import { ensureSeed } from '../../src/data/seed';
import { useStudent } from '../../src/stores/student';
import { useReview } from '../../src/stores/review';
import { useTemplates } from '../../src/stores/templates';
import type { Template } from '../../src/core/model';

const anchor = { kind: 'pdf' as const, page: 0, x: 0, y: 0, w: 10, h: 10 };
const TEMPLATE: Template = {
  id: 'tpl', university: 'PMU', format: 'pdf', fileName: 'p.pdf', fileBytes: new ArrayBuffer(8), period: 'weekly', pageRoles: ['unit'], updatedAt: '',
  placeholders: [
    { id: 'day0', label: 'Day 1', binding: 'daily', dayIndex: 0, source: 'label', region: 'unit', anchor },
    { id: 'q1', label: 'Question', binding: 'period', source: 'label', region: 'unit', anchor },
    { id: 'name', label: 'Name', binding: 'cover', source: 'label', region: 'unit', anchor },
  ],
};

beforeEach(async () => {
  setActivePinia(createPinia());
  const r = new IdbRepository(`stores-${Math.random()}`);
  setRepository(r);
  await ensureSeed(r);
  await r.putTemplate(TEMPLATE);
});

describe('student store', () => {
  it('sets up an internship and builds periods', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    expect(st.periods.map(p => p.key)).toEqual(['w:2026-09-21', 'w:2026-09-28', 'w:2026-10-05']);
    expect(st.student?.templateId).toBe('tpl');
  });
  it('persists notes', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.saveNote('2026-09-23', 'Hello');
    setActivePinia(createPinia());
    const again = useStudent();
    await again.load('student-aina');
    expect(again.notes['2026-09-23']).toBe('Hello');
  });
  it('locks a submitted period and its dates, and blocks setup changes', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await st.saveFill({ ...st.fillFor('w:2026-09-21'), values: { day0: 'x' } });
    await st.submit('w:2026-09-21');
    expect(st.statusOf('w:2026-09-21')).toBe('submitted');
    expect(st.lockedDates.has('2026-09-24')).toBe(true);
    await expect(st.saveFill(st.fillFor('w:2026-09-21'))).rejects.toThrow('locked');
    await expect(st.setup('tpl', '2026-09-01', '2026-10-06')).rejects.toThrow('before any period is submitted');
  });
  it('flags a missing template', async () => {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await useTemplates().remove('tpl');
    await st.load('student-aina');
    expect(st.templateMissing).toBe(true);
    expect(st.periods).toEqual([]);
  });
});

describe('review store', () => {
  async function submitted() {
    const st = useStudent();
    await st.load('student-aina');
    await st.setup('tpl', '2026-09-23', '2026-10-06');
    await st.submit('w:2026-09-21');
    const rv = useReview();
    await rv.load();
    return { st, rv };
  }
  it('queues submitted periods and approves them', async () => {
    const { st, rv } = await submitted();
    expect(rv.queue.map(r => r.period.key)).toEqual(['w:2026-09-21']);
    await expect(rv.approve('student-aina', 'w:2026-09-21', '')).rejects.toThrow('Type your full name');
    await rv.approve('student-aina', 'w:2026-09-21', 'Nur Aziz');
    expect(rv.queue).toEqual([]);
    await st.load('student-aina');
    expect(st.statusOf('w:2026-09-21')).toBe('approved');
    expect(st.latest('w:2026-09-21', 'approve')?.signature).toBe('Nur Aziz');
  });
  it('sends a period back and lets the student resubmit', async () => {
    const { st, rv } = await submitted();
    await rv.requestChanges('student-aina', 'w:2026-09-21', 'More detail');
    await st.load('student-aina');
    expect(st.statusOf('w:2026-09-21')).toBe('changes_requested');
    await st.saveFill({ ...st.fillFor('w:2026-09-21'), values: { q1: 'better' } });
    await st.submit('w:2026-09-21');
    await rv.load();
    expect(rv.queue).toHaveLength(1);
  });
  it('counts students who filled removed placeholders', async () => {
    const { st } = await submitted();
    await st.saveCover({ name: 'Aina' });
    expect(await useTemplates().studentsWithValues('tpl', ['name'])).toBe(1);
    expect(await useTemplates().studentsWithValues('tpl', ['q1'])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/stores.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement the stores**

`src/stores/session.ts`:
```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Student } from '../core/model';
import { repo } from '../data/repository';
import { resetDemoData } from '../data/seed';

export const SUPERVISOR = 'supervisor';
const KEY = 'il.role';
const read = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* storage blocked: the role lasts until reload */ } };

export const useSession = defineStore('session', () => {
  const role = ref<string>(read() ?? SUPERVISOR);
  const students = ref<Student[]>([]);
  const isSupervisor = computed(() => role.value === SUPERVISOR);
  function setRole(r: string) { role.value = r; write(r); }
  async function loadStudents() { students.value = await repo().listStudents(); }
  async function resetDemo() { await resetDemoData(repo()); setRole(SUPERVISOR); }
  return { role, students, isSupervisor, setRole, loadStudents, resetDemo };
});
```

`src/stores/toast.ts`:
```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToast = defineStore('toast', () => {
  const items = ref<{ id: number; text: string; error: boolean }[]>([]);
  let n = 0;
  function dismiss(id: number) { items.value = items.value.filter(i => i.id !== id); }
  function show(text: string, error = false) {
    const id = ++n;
    items.value.push({ id, text, error });
    setTimeout(() => dismiss(id), error ? 6000 : 3000);
  }
  return { items, show, dismiss };
});
```

`src/stores/templates.ts`:
```ts
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import type { Template } from '../core/model';
import { repo } from '../data/repository';
import { plain } from '../data/plain';

export const useTemplates = defineStore('templates', () => {
  const list = shallowRef<Template[]>([]);
  async function load() { list.value = await repo().listTemplates(); }
  async function save(t: Template) { await repo().putTemplate(plain(t)); await load(); }
  async function remove(id: string) { await repo().deleteTemplate(id); await load(); }
  async function usage(id: string) { return (await repo().listStudents()).filter(s => s.templateId === id).length; }
  /** How many students have typed something into any of these placeholders (warn before deleting them). */
  async function studentsWithValues(templateId: string, phIds: string[]) {
    const students = (await repo().listStudents()).filter(s => s.templateId === templateId);
    const fills = await repo().getFills();
    const has = (vals: Record<string, string>) => phIds.some(k => (vals[k] ?? '').trim());
    return students.filter(s => has(s.coverValues) || fills.some(f => f.studentId === s.id && has(f.values))).length;
  }
  return { list, load, save, remove, usage, studentsWithValues };
});
```

`src/stores/student.ts`:
```ts
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { Period, PeriodFill, ReviewAction, Student, Template } from '../core/model';
import { buildPeriods } from '../core/periods';
import { canChangeSetup as canChange, emptyFill, isLocked, latestAction, submitFill } from '../core/workflow';
import { eachDay } from '../core/dates';
import { repo } from '../data/repository';
import { plain } from '../data/plain';

export const useStudent = defineStore('student', () => {
  const student = ref<Student | null>(null);
  const template = shallowRef<Template | null>(null);
  const templateMissing = ref(false);
  const notes = ref<Record<string, string>>({});
  const fills = ref<Record<string, PeriodFill>>({});
  const actions = ref<ReviewAction[]>([]);
  const loadedFor = ref<string | null>(null);

  const periods = computed<Period[]>(() => {
    const s = student.value;
    const t = template.value;
    if (!s?.startDate || !s.endDate || !t) return [];
    return buildPeriods(t.period, s.startDate, s.endDate);
  });
  const canChangeSetup = computed(() => canChange(Object.values(fills.value)));
  const lockedDates = computed(() => {
    const set = new Set<string>();
    for (const p of periods.value) if (isLocked(fills.value[p.key])) eachDay(p.start, p.end).forEach(d => set.add(d));
    return set;
  });

  function me(): Student {
    if (!student.value) throw new Error('No student loaded.');
    return student.value;
  }

  async function load(studentId: string) {
    const s = (await repo().listStudents()).find(x => x.id === studentId);
    if (!s) throw new Error(`Unknown student ${studentId}`);
    const t = s.templateId ? await repo().getTemplate(s.templateId) : undefined;
    student.value = s;
    template.value = t ?? null;
    templateMissing.value = !!s.templateId && !t;
    notes.value = Object.fromEntries((await repo().getNotes(s.id)).map(e => [e.date, e.text]));
    fills.value = Object.fromEntries((await repo().getFills(s.id)).map(f => [f.periodKey, f]));
    actions.value = await repo().listActions(s.id);
    loadedFor.value = studentId;
  }

  async function setup(templateId: string, startDate: string, endDate: string) {
    const s = me();
    if (!canChangeSetup.value) throw new Error('You can only change your university or dates before any period is submitted.');
    const t = await repo().getTemplate(templateId);
    if (!t) throw new Error('That university template no longer exists.');
    buildPeriods(t.period, startDate, endDate); // throws on bad dates
    const next: Student = { ...plain(s), templateId, startDate, endDate, coverValues: s.templateId === templateId ? plain(s.coverValues) : {} };
    await repo().putStudent(next);
    await load(next.id);
  }

  async function saveNote(date: string, text: string) {
    const s = me();
    await repo().putNote({ studentId: s.id, date, text, updatedAt: new Date().toISOString() });
    notes.value = { ...notes.value, [date]: text };
  }

  const fillFor = (key: string): PeriodFill => fills.value[key] ?? emptyFill(me().id, key);

  async function persist(f: PeriodFill) {
    const copy = plain(f);
    await repo().putFill(copy);
    fills.value = { ...fills.value, [f.periodKey]: copy };
  }
  async function saveFill(f: PeriodFill) {
    if (isLocked(fills.value[f.periodKey])) throw new Error('This period is locked while it is with your supervisor.');
    await persist(f);
  }
  async function saveCover(values: Record<string, string>) {
    const next: Student = { ...plain(me()), coverValues: { ...values } };
    await repo().putStudent(next);
    student.value = next;
  }
  async function submit(key: string) {
    const { fill, action } = submitFill(fillFor(key), me().name);
    await persist(fill);
    await repo().addAction(action);
    actions.value = [...actions.value, action];
  }

  const statusOf = (key: string) => fills.value[key]?.status ?? 'draft';
  const latest = (key: string, kind?: ReviewAction['action']) => latestAction(actions.value, me().id, key, kind);

  return {
    student, template, templateMissing, notes, fills, actions, loadedFor, periods, canChangeSetup, lockedDates,
    load, setup, saveNote, fillFor, saveFill, saveCover, submit, statusOf, latest,
  };
});
```

`src/stores/review.ts`:
```ts
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { Period, PeriodFill, PeriodStatus, ReviewAction, Student, Template } from '../core/model';
import { buildPeriods } from '../core/periods';
import { approveFill, requestChangesFill } from '../core/workflow';
import { repo } from '../data/repository';
import { plain } from '../data/plain';

export const SUPERVISOR_NAME = 'Supervisor';
export interface ReviewRow { student: Student; template: Template; period: Period; fill: PeriodFill | undefined; status: PeriodStatus }

export const useReview = defineStore('review', () => {
  const students = ref<Student[]>([]);
  const templates = shallowRef<Template[]>([]);
  const fills = ref<PeriodFill[]>([]);
  const actions = ref<ReviewAction[]>([]);

  async function load() {
    const [s, t, f, a] = await Promise.all([repo().listStudents(), repo().listTemplates(), repo().getFills(), repo().listActions()]);
    students.value = s; templates.value = t; fills.value = f; actions.value = a;
  }

  const rows = computed<ReviewRow[]>(() => students.value.flatMap(s => {
    const t = templates.value.find(x => x.id === s.templateId);
    if (!t || !s.startDate || !s.endDate) return [];
    return buildPeriods(t.period, s.startDate, s.endDate).map(p => {
      const f = fills.value.find(x => x.studentId === s.id && x.periodKey === p.key);
      return { student: s, template: t, period: p, fill: f, status: f?.status ?? 'draft' };
    });
  }));
  const queue = computed(() => rows.value
    .filter(r => r.status === 'submitted')
    .sort((a, b) => (a.fill?.submittedAt ?? '').localeCompare(b.fill?.submittedAt ?? '')));

  const row = (studentId: string, key: string) => rows.value.find(r => r.student.id === studentId && r.period.key === key);
  async function notesFor(studentId: string) {
    return Object.fromEntries((await repo().getNotes(studentId)).map(n => [n.date, n.text])) as Record<string, string>;
  }

  async function decide(studentId: string, key: string, fn: (f: PeriodFill) => { fill: PeriodFill; action: ReviewAction }) {
    const r = row(studentId, key);
    if (!r?.fill) throw new Error('Nothing has been submitted for this period.');
    const { fill, action } = fn(plain(r.fill));
    await repo().putFill(fill);
    await repo().addAction(action);
    await load();
  }
  const approve = (studentId: string, key: string, signature: string) => decide(studentId, key, f => approveFill(f, SUPERVISOR_NAME, signature));
  const requestChanges = (studentId: string, key: string, comment: string) => decide(studentId, key, f => requestChangesFill(f, SUPERVISOR_NAME, comment));

  return { students, templates, fills, actions, rows, queue, load, row, notesFor, approve, requestChanges };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/stores.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores tests/unit/stores.test.ts
git commit -m "feat(stores): session, templates, student and review stores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: App shell (router, layout, role switcher, styles)

**Files:**
- Create: `src/router.ts`, `src/styles.css`, `src/lib/debounce.ts`, `src/lib/download.ts`, `src/lib/errors.ts`, `src/lib/pdfjs-browser.ts`, `src/components/RoleSwitcher.vue`, `src/components/ToastHost.vue`, `src/components/StatusBadge.vue`, `tests/e2e/helpers.ts`, `tests/e2e/smoke.spec.ts`
- Create (stub views, replaced in later tasks): `src/views/supervisor/{TemplatesList,TemplateEditor,ReviewQueue,ReviewDetail}.vue`, `src/views/student/{Onboarding,Notepad,Builder,Export}.vue`
- Replace: `src/App.vue`, `src/main.ts`

**Interfaces:**
- Consumes: all the stores and `ensureSeed`.
- Produces:
  - Routes (hash): `/`, `/supervisor/templates`, `/supervisor/templates/new`, `/supervisor/templates/:id`, `/supervisor/review`, `/supervisor/review/:studentId/:periodKey` (name `review-detail`), `/student/onboarding` (name `onboarding`), `/student/notepad`, `/student/builder/:periodKey?` (name `builder`), `/student/export`.
  - Utilities: `debounce(fn, ms): { call(); flush(): Promise<void>; cancel() }`, `downloadBytes(name, bytes, type)`, `safeFileName(...parts)`, `errorText(e)`, `openPdf(bytes: ArrayBuffer)` (browser pdf.js with its worker).
  - Test IDs: `role-select`, `reset-demo`, `status-badge`.
  - e2e helpers: `fixture(f)`, `asRole(page, label)`, `iso(d)`, `lastWeekday(d?)`, `pdfWords(bytes)`.

- [ ] **Step 1: Write the e2e helpers and the failing smoke test**

`tests/e2e/helpers.ts`:
```ts
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdfText } from '../../src/core/pdf/text';

GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

export const fixture = (f: string) => path.resolve('tests/fixtures', f);
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function lastWeekday(d = new Date()): Date {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return x;
}
export async function asRole(page: Page, label: string) {
  await page.getByTestId('role-select').selectOption({ label });
}
export async function pdfWords(bytes: Uint8Array): Promise<string> {
  return (await extractPdfText(bytes)).flatMap(p => p.words.map(w => w.str)).join(' ');
}
```

`tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { asRole } from './helpers';

test('switches roles and lands on each home page', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await expect(page.getByRole('link', { name: 'Templates' })).toBeVisible();
  await asRole(page, 'Aina Rahman');
  await expect(page).toHaveURL(/#\/student\/onboarding/);
  await expect(page.getByRole('link', { name: 'Notepad' })).toBeVisible();
  await asRole(page, 'Supervisor');
  await expect(page).toHaveURL(/#\/supervisor\/templates/);
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `npx playwright test tests/e2e/smoke.spec.ts`
Expected: FAIL. The temporary App has no `Templates` link.

- [ ] **Step 3: Write the utilities**

`src/lib/debounce.ts`:
```ts
/** Debounced async call. Runs are chained, so saves never overlap. flush() runs a pending call now. */
export function debounce(fn: () => Promise<void> | void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  const run = () => {
    timer = null;
    running = running.then(() => fn()).catch(() => undefined);
    return running;
  };
  return {
    call() { if (timer) clearTimeout(timer); timer = setTimeout(run, ms); },
    flush(): Promise<void> { if (timer) { clearTimeout(timer); return run(); } return running; },
    cancel() { if (timer) clearTimeout(timer); timer = null; },
  };
}
```

`src/lib/download.ts`:
```ts
export function downloadBytes(name: string, bytes: Uint8Array | Blob, type: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (...parts: string[]) =>
  parts.map(p => p.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).join('_');
```

`src/lib/errors.ts`:
```ts
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
```

`src/lib/pdfjs-browser.ts`:
```ts
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(bytes: ArrayBuffer) {
  return getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
}
```
If Vite reports that `pdf.worker.min.mjs` doesn't exist, use `pdfjs-dist/legacy/build/pdf.worker.mjs?url` instead.

- [ ] **Step 4: Write the shared components**

`src/components/StatusBadge.vue`:
```vue
<script setup lang="ts">
import type { PeriodStatus } from '../core/model';
import { STATUS_TEXT } from '../core/workflow';
defineProps<{ status: PeriodStatus }>();
</script>

<template>
  <span class="badge" :class="status" data-testid="status-badge">{{ STATUS_TEXT[status] }}</span>
</template>
```

`src/components/ToastHost.vue`:
```vue
<script setup lang="ts">
import { useToast } from '../stores/toast';
const toast = useToast();
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toast.items" :key="t.id" class="toast" :class="{ error: t.error }" @click="toast.dismiss(t.id)">{{ t.text }}</div>
  </div>
</template>
```

`src/components/RoleSwitcher.vue`:
```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { SUPERVISOR, useSession } from '../stores/session';
import { useStudent } from '../stores/student';

const session = useSession();
const student = useStudent();
const router = useRouter();

async function change(e: Event) {
  session.setRole((e.target as HTMLSelectElement).value);
  student.loadedFor = null; // force a fresh load: the other role may have changed data
  await router.push('/');
}
async function reset() {
  if (!confirm('Delete all templates, notes and reviews and start the demo again?')) return;
  await session.resetDemo();
  location.reload();
}
</script>

<template>
  <div class="role">
    <label class="inline">Viewing as
      <select data-testid="role-select" :value="session.role" @change="change">
        <option :value="SUPERVISOR">Supervisor</option>
        <option v-for="s in session.students" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </label>
    <button type="button" class="link" data-testid="reset-demo" @click="reset">Reset demo data</button>
  </div>
</template>
```

- [ ] **Step 5: Write stub views (one file each; later tasks replace them)**

Create each of these 8 files with the content below. Change the `<h1>` text to the file's name:
`src/views/supervisor/TemplatesList.vue`, `TemplateEditor.vue`, `ReviewQueue.vue`, `ReviewDetail.vue`, `src/views/student/Onboarding.vue`, `Notepad.vue`, `Builder.vue` and `Export.vue`.
```vue
<template>
  <section class="card"><h1>TemplatesList</h1><p class="muted">Built in a later task.</p></section>
</template>
```

- [ ] **Step 6: Write the router, App, main and styles**

`src/router.ts`:
```ts
import { createRouter, createWebHashHistory } from 'vue-router';
import { useSession } from './stores/session';
import { useStudent } from './stores/student';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => (useSession().isSupervisor ? '/supervisor/templates' : '/student/notepad') },
    { path: '/supervisor/templates', component: () => import('./views/supervisor/TemplatesList.vue') },
    { path: '/supervisor/templates/new', component: () => import('./views/supervisor/TemplateEditor.vue') },
    { path: '/supervisor/templates/:id', component: () => import('./views/supervisor/TemplateEditor.vue') },
    { path: '/supervisor/review', component: () => import('./views/supervisor/ReviewQueue.vue') },
    { path: '/supervisor/review/:studentId/:periodKey', name: 'review-detail', component: () => import('./views/supervisor/ReviewDetail.vue') },
    { path: '/student/onboarding', name: 'onboarding', component: () => import('./views/student/Onboarding.vue') },
    { path: '/student/notepad', component: () => import('./views/student/Notepad.vue') },
    { path: '/student/builder/:periodKey?', name: 'builder', component: () => import('./views/student/Builder.vue') },
    { path: '/student/export', component: () => import('./views/student/Export.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async to => {
  const session = useSession();
  if (to.path.startsWith('/supervisor') && !session.isSupervisor) return '/';
  if (to.path.startsWith('/student')) {
    if (session.isSupervisor) return '/';
    const st = useStudent();
    if (st.loadedFor !== session.role) await st.load(session.role);
    const needsSetup = !st.student?.templateId || st.templateMissing || !st.student.startDate;
    if (needsSetup && to.name !== 'onboarding') return { name: 'onboarding' };
  }
  return true;
});
```

`src/App.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useSession } from './stores/session';
import RoleSwitcher from './components/RoleSwitcher.vue';
import ToastHost from './components/ToastHost.vue';

const session = useSession();
const links = computed(() => session.isSupervisor
  ? [{ to: '/supervisor/templates', label: 'Templates' }, { to: '/supervisor/review', label: 'Review' }]
  : [{ to: '/student/notepad', label: 'Notepad' }, { to: '/student/builder', label: 'Logbook builder' }, { to: '/student/export', label: 'Export' }, { to: '/student/onboarding', label: 'My internship' }]);
</script>

<template>
  <header class="topbar">
    <strong class="brand">Intern Logbook</strong>
    <nav><RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink></nav>
    <RoleSwitcher />
  </header>
  <main>
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.fullPath" />
    </RouterView>
  </main>
  <ToastHost />
</template>
```

`src/main.ts`:
```ts
import './lib/pdfjs-browser';
import './styles.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { repo } from './data/repository';
import { ensureSeed } from './data/seed';
import { SUPERVISOR, useSession } from './stores/session';

async function start() {
  await ensureSeed(repo());
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  const session = useSession(pinia);
  await session.loadStudents();
  if (!session.isSupervisor && !session.students.some(s => s.id === session.role)) session.setRole(SUPERVISOR);
  app.use(router);
  app.mount('#app');
}

start().catch(e => {
  document.body.textContent = `The app could not start: ${e instanceof Error ? e.message : String(e)}`;
});
```

`src/styles.css`:
```css
:root {
  --bg: #f6f7f9; --surface: #fff; --text: #1c2230; --muted: #5d6678; --border: #d9dde5;
  --accent: #2563eb; --accent-text: #fff; --danger: #b91c1c; --warn-bg: #fff7e6; --warn-border: #f0b429;
  --error-bg: #fdecec; --paper: #e9ecf1; --radius: 8px;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif; color: var(--text); background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #12151b; --surface: #1b2029; --text: #e6e9ef; --muted: #9aa3b2; --border: #2d3440;
    --accent: #6ea0ff; --accent-text: #0b1020; --warn-bg: #2d2616; --error-bg: #3a1c1c; --paper: #0d1015; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
.topbar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.topbar nav { display: flex; gap: 14px; flex: 1; flex-wrap: wrap; }
.topbar nav a { color: var(--muted); text-decoration: none; padding: 4px 0; }
.topbar nav a.router-link-active { color: var(--text); border-bottom: 2px solid var(--accent); }
.role { display: flex; gap: 10px; align-items: center; }
main { padding: 16px; max-width: 1500px; margin: 0 auto; }
main > * { min-width: 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; min-width: 0; }
h1 { font-size: 1.25rem; margin: 0 0 12px; }
h2 { font-size: 1rem; margin: 0 0 8px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: .9rem; margin-bottom: 10px; }
label.inline, label.check { flex-direction: row; align-items: center; gap: 8px; margin: 0; }
input, select, textarea, button { font: inherit; color: inherit; }
input, select, textarea { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; min-width: 0; }
textarea { resize: vertical; width: 100%; }
button { cursor: pointer; border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 6px 12px; }
button[disabled] { opacity: .5; cursor: not-allowed; }
button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
button.danger { color: var(--danger); border-color: var(--danger); }
button.link { border: none; background: none; color: var(--accent); padding: 0; }
button[aria-pressed="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.muted { color: var(--muted); }
.banner { padding: 8px 12px; border-radius: 6px; background: var(--warn-bg); border: 1px solid var(--warn-border); margin: 0 0 12px; }
.banner.error { background: var(--error-bg); border-color: var(--danger); }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.spacer { flex: 1; }
table.list { width: 100%; border-collapse: collapse; }
table.list th, table.list td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
table.list tr.click { cursor: pointer; }
table.list tr.click:hover { background: var(--bg); }
.badge { font-size: .8rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); white-space: nowrap; }
.badge.submitted { border-color: #d97706; color: #d97706; }
.badge.approved { border-color: #16a34a; color: #16a34a; }
.badge.changes_requested { border-color: var(--danger); color: var(--danger); }
.tag { font-size: .75rem; padding: 1px 6px; border-radius: 999px; background: #16a34a22; color: #16a34a; margin-left: 6px; }
.toasts { position: fixed; bottom: 16px; right: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 50; }
.toast { background: var(--text); color: var(--bg); padding: 10px 14px; border-radius: 6px; max-width: 360px; cursor: pointer; }
.toast.error { background: var(--danger); color: #fff; }
/* Two-pane layouts */
.editor-grid, .review-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.builder-grid { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(0, 1.3fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .editor-grid, .review-grid, .builder-grid { grid-template-columns: minmax(0, 1fr); } }
.doc-pane, .preview { overflow: auto; max-height: calc(100vh - 170px); background: var(--paper); border-radius: var(--radius); padding: 12px; }
.side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; max-height: calc(100vh - 90px); overflow: auto; }
.toolbar { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin-bottom: 12px; }
.toolbar label { margin: 0; }
.seg { display: flex; gap: 4px; flex-wrap: wrap; }
.ph-list { display: flex; flex-direction: column; gap: 4px; }
.ph-item { display: flex; gap: 8px; align-items: center; text-align: left; }
.ph-item .ph-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-item small { color: var(--muted); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: .8rem; }
.legend span { display: flex; gap: 4px; align-items: center; }
/* Document overlay */
.overlay { display: flex; flex-direction: column; gap: 16px; align-items: center; }
.page-wrap { display: flex; flex-direction: column; gap: 6px; }
.page-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; font-size: .85rem; }
.pdf-page { position: relative; background: #fff; box-shadow: 0 1px 4px #0003; touch-action: none; }
.pdf-canvas { display: block; }
.adding .pdf-page { cursor: crosshair; }
.adding .ph-box { pointer-events: none; }
.ph-box { position: absolute; border: 2px solid; border-radius: 2px; cursor: move; }
.ph-box.selected { outline: 2px solid var(--accent); outline-offset: 1px; z-index: 2; }
.ph-box.warn { border-style: dotted; }
.ph-tag { position: absolute; left: -2px; top: -17px; font-size: 10px; line-height: 15px; padding: 0 4px; color: #fff; border-radius: 3px 3px 0 0; white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; display: none; }
.ph-box.selected .ph-tag, .ph-box:hover .ph-tag { display: block; }
.ph-resize { position: absolute; right: -5px; bottom: -5px; width: 10px; height: 10px; background: var(--accent); cursor: nwse-resize; }
.draw-box { position: absolute; border: 2px dashed var(--accent); background: #2563eb1a; pointer-events: none; }
.fill-box { position: absolute; overflow: hidden; font-family: Helvetica, Arial, sans-serif; color: #000; }
.fill-box.whiteout { background: #fff; }
.fill-box.overflow { outline: 2px solid #dc2626; }
.fill-line { white-space: pre; }
.docx-host { position: relative; color: #000; }
.docx-host.adding, .docx-host.picking { cursor: crosshair; }
.docx-host.adding .ph-box, .docx-host.picking .ph-box { pointer-events: none; }
.unit-line { position: absolute; left: 0; right: 0; border-top: 2px dashed #9333ea; pointer-events: none; }
.unit-line span { position: absolute; right: 8px; top: -18px; font-size: 11px; background: #9333ea; color: #fff; padding: 0 6px; border-radius: 3px; }
.il-hide > :not(.il-filled) { display: none !important; }
.il-filled { background: #fff8c5; }
/* Notepad */
.notepad { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 16px; }
@media (max-width: 700px) { .notepad { grid-template-columns: minmax(0, 1fr); } .date-list { max-height: 180px; } }
.date-list { display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 120px); overflow: auto; }
.date-list button { text-align: left; border: none; }
.date-list button.weekend { opacity: .6; }
.date-list button.today { font-weight: 600; }
.date-list button.has::after { content: " •"; color: var(--accent); }
.note header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.note textarea { min-height: 55vh; }
/* Forms */
.field { margin-bottom: 12px; }
.field label { margin-bottom: 4px; }
fieldset { border: 1px solid var(--border); border-radius: 6px; margin: 0 0 12px; min-width: 0; }
legend { font-weight: 600; padding: 0 4px; }
.plain-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
```

- [ ] **Step 7: Run the smoke test and the build**

Run: `npx playwright test tests/e2e/smoke.spec.ts`
Expected: PASS (1 test).

Run: `npm run build`
Expected: the build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(app): router, role switcher, layout and styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Supervisor template editor for PDF

**Files:**
- Create: `src/components/overlay/bindingColors.ts`, `src/components/overlay/PlaceholderBox.vue`, `src/components/overlay/PdfPageLayer.vue`, `src/components/overlay/TemplateOverlay.vue`, `src/components/PlaceholderInspector.vue`, `tests/e2e/template-pdf.spec.ts`
- Replace: `src/views/supervisor/TemplatesList.vue`, `src/views/supervisor/TemplateEditor.vue`

**Interfaces:**
- Consumes: `detectFromFile`, `validateTemplate`, `findByUniversity`, `cloneTemplate`, `UserError`; `docxContext`, `readDocxXml`, `regionOfDocxAnchor`, `blockIndexOfTable`; `useTemplates`, `useToast`; `openPdf`; `getHelvetica`, `boxLayout`, `toWinAnsi`, `Layout`.
- Produces:
  - `BINDING_META: Record<Binding, { label; color }>`
  - `TemplateOverlay`:
    - Props: `template: OverlayTemplate { format; fileBytes; placeholders; pageRoles?; unitStartBlock? }`, `mode: 'edit' | 'fill'`, `selectedId?`, `adding?`, `pickingUnit?`, `values?`.
    - Emits: `select(id)`, `update(ph)`, `add(anchor)`, `resolved(ids)`, `pick-table(ti)`, `page-role(page, role)`.
  - `PlaceholderInspector`: props `ph`, `unresolved`. Emits `update(ph)` and `remove()`.
  - Test IDs:
    - Lists and upload: `new-template`, `template-row`, `university-input`, `upload-input`, `detect-btn`.
    - Editor toolbar: `period-select`, `mode-select-btn`, `mode-add-btn`, `mode-unit-btn`, `save-template`.
    - Placeholders and pages: `ph-item`, `ph-box` (with `data-id`), `pdf-page` (with `data-index`), `page-role-<i>`, `fill-box`.
    - Inspector: `insp-label`, `insp-binding`, `insp-dayindex`, `insp-daterole`, `insp-delete`.

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/template-pdf.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { asRole, fixture } from './helpers';

test('supervisor uploads a PDF template, adjusts it and saves it', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill('Prince Mohammad Bin Fahd University');
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();

  const boxes = page.getByTestId('ph-box');
  await expect(boxes.first()).toBeVisible();
  const before = await boxes.count();
  expect(before).toBeGreaterThan(10);

  // Drag the first box 20px right and 10px down.
  const b0 = (await boxes.first().boundingBox())!;
  await page.mouse.move(b0.x + 4, b0.y + 4);
  await page.mouse.down();
  await page.mouse.move(b0.x + 24, b0.y + 14, { steps: 5 });
  await page.mouse.up();
  const b1 = (await boxes.first().boundingBox())!;
  expect(Math.round(b1.x - b0.x)).toBe(20);
  expect(Math.round(b1.y - b0.y)).toBe(10);

  // Draw a new placeholder and make it the supervisor signature.
  await page.getByTestId('mode-add-btn').click();
  const pg = (await page.getByTestId('pdf-page').first().boundingBox())!;
  await page.mouse.move(pg.x + 40, pg.y + 40);
  await page.mouse.down();
  await page.mouse.move(pg.x + 200, pg.y + 64, { steps: 5 });
  await page.mouse.up();
  await expect(boxes).toHaveCount(before + 1);
  await page.getByTestId('insp-binding').selectOption('signature');
  await page.getByTestId('insp-label').fill('Supervisor signature');

  await page.getByTestId('period-select').selectOption('weekly');
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText('Prince Mohammad Bin Fahd University');

  // Reopen: the edits were saved.
  await page.getByTestId('template-row').getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByTestId('ph-item').filter({ hasText: 'Supervisor signature' })).toHaveCount(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/template-pdf.spec.ts`
Expected: FAIL. `new-template` isn't found, because the stub view has no button.

- [ ] **Step 3: Write the overlay building blocks**

`src/components/overlay/bindingColors.ts`:
```ts
import type { Binding } from '../../core/model';

export const BINDING_META: Record<Binding, { label: string; color: string }> = {
  cover: { label: 'Cover (filled once)', color: '#2563eb' },
  daily: { label: 'Daily activity (notepad)', color: '#16a34a' },
  period: { label: 'Period answer', color: '#9333ea' },
  date: { label: 'Date', color: '#ea580c' },
  free: { label: 'Free text', color: '#64748b' },
  signature: { label: 'Supervisor signature', color: '#dc2626' },
};
```

`src/components/overlay/PlaceholderBox.vue`:
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  id: string; box: { left: number; top: number; width: number; height: number }; color: string; label: string;
  selected: boolean; dashed: boolean; pinned: boolean; draggable: boolean; resizable: boolean; warn?: boolean;
}>();
const emit = defineEmits<{ select: []; change: [d: { dx: number; dy: number; dw: number; dh: number }] }>();

const drag = ref<{ kind: 'move' | 'resize'; sx: number; sy: number; dx: number; dy: number } | null>(null);
const style = computed(() => {
  const d = drag.value;
  const mv = d?.kind === 'move';
  const rs = d?.kind === 'resize';
  return {
    left: `${props.box.left + (mv ? d!.dx : 0)}px`,
    top: `${props.box.top + (mv ? d!.dy : 0)}px`,
    width: `${Math.max(4, props.box.width + (rs ? d!.dx : 0))}px`,
    height: `${Math.max(4, props.box.height + (rs ? d!.dy : 0))}px`,
    borderColor: props.color,
    borderStyle: props.dashed ? 'dashed' : 'solid',
    background: `${props.color}${props.selected ? '33' : '14'}`,
  };
});

function start(kind: 'move' | 'resize', e: PointerEvent) {
  emit('select');
  if ((kind === 'move' && !props.draggable) || (kind === 'resize' && !props.resizable)) return;
  e.stopPropagation();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  drag.value = { kind, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
}
function move(e: PointerEvent) {
  if (!drag.value) return;
  drag.value = { ...drag.value, dx: e.clientX - drag.value.sx, dy: e.clientY - drag.value.sy };
}
function end() {
  const d = drag.value;
  drag.value = null;
  if (!d || (d.dx === 0 && d.dy === 0)) return;
  emit('change', d.kind === 'move' ? { dx: d.dx, dy: d.dy, dw: 0, dh: 0 } : { dx: 0, dy: 0, dw: d.dx, dh: d.dy });
}
</script>

<template>
  <div class="ph-box" :class="{ selected, warn }" :style="style" data-testid="ph-box" :data-id="id" :title="label"
       @pointerdown="start('move', $event)" @pointermove="move" @pointerup="end">
    <span class="ph-tag" :style="{ background: color }">{{ pinned ? '✎ ' : '' }}{{ label }}</span>
    <span v-if="resizable && selected" class="ph-resize" @pointerdown="start('resize', $event)" @pointermove="move" @pointerup="end" />
  </div>
</template>
```

`src/components/overlay/PdfPageLayer.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { PdfAnchor, Placeholder } from '../../core/model';
import type { Layout } from '../../core/fill/pdfLayout';
import PlaceholderBox from './PlaceholderBox.vue';
import { BINDING_META } from './bindingColors';

const props = defineProps<{
  pdf: { getPage(n: number): Promise<any> }; pageIndex: number; scale: number; placeholders: Placeholder[];
  mode: 'edit' | 'fill'; selectedId: string | null; adding: boolean; layouts: Record<string, Layout>;
}>();
const emit = defineEmits<{ select: [id: string]; update: [ph: Placeholder]; add: [a: PdfAnchor] }>();

const canvas = ref<HTMLCanvasElement>();
const view = ref<number[]>([0, 0, 612, 792]);
let task: { cancel(): void; promise: Promise<void> } | null = null;

async function render() {
  const page = await props.pdf.getPage(props.pageIndex + 1);
  view.value = page.view;
  const vp = page.getViewport({ scale: props.scale });
  const c = canvas.value;
  if (!c) return;
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  task?.cancel();
  task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
  try { await task!.promise; } catch { /* superseded by a newer render */ }
}
onMounted(render);
watch(() => [props.pdf, props.scale], render);

const size = computed(() => ({ width: `${(view.value[2] - view.value[0]) * props.scale}px`, height: `${(view.value[3] - view.value[1]) * props.scale}px` }));
const css = (a: PdfAnchor) => {
  const s = props.scale;
  const v = view.value;
  return { left: (a.x - v[0]) * s, top: (v[3] - a.y - a.h) * s, width: a.w * s, height: a.h * s };
};

function onChange(ph: Placeholder, d: { dx: number; dy: number; dw: number; dh: number }) {
  const a = ph.anchor as PdfAnchor;
  const s = props.scale;
  const h = Math.max(4, a.h + d.dh / s);
  // Origin is bottom-left: moving down or growing downward lowers y.
  emit('update', { ...ph, anchor: { ...a, x: a.x + d.dx / s, y: a.y - d.dy / s - (h - a.h), w: Math.max(4, a.w + d.dw / s), h } });
}

const draft = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
const pos = (e: PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function down(e: PointerEvent) {
  if (props.mode !== 'edit' || !props.adding) return;
  const p = pos(e);
  draft.value = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!draft.value) return;
  const p = pos(e);
  draft.value = { ...draft.value, x1: p.x, y1: p.y };
}
function up() {
  const d = draft.value;
  draft.value = null;
  if (!d) return;
  const l = Math.min(d.x0, d.x1);
  const t = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0);
  const h = Math.abs(d.y1 - d.y0);
  if (w < 6 || h < 6) return;
  const s = props.scale;
  const v = view.value;
  emit('add', { kind: 'pdf', page: props.pageIndex, x: v[0] + l / s, y: v[3] - (t + h) / s, w: w / s, h: h / s });
}
const draftStyle = computed(() => {
  const d = draft.value;
  return d && { left: `${Math.min(d.x0, d.x1)}px`, top: `${Math.min(d.y0, d.y1)}px`, width: `${Math.abs(d.x1 - d.x0)}px`, height: `${Math.abs(d.y1 - d.y0)}px` };
});
function fillStyle(ph: Placeholder) {
  const b = css(ph.anchor as PdfAnchor);
  const l = props.layouts[ph.id];
  const s = props.scale;
  return { left: `${b.left + s}px`, top: `${b.top}px`, width: `${b.width - s}px`, height: `${b.height}px`, fontSize: `${l.size * s}px`, lineHeight: `${l.lineHeight * s}px` };
}
</script>

<template>
  <div class="pdf-page" data-testid="pdf-page" :data-index="pageIndex" :style="size" @pointerdown="down" @pointermove="move" @pointerup="up">
    <canvas ref="canvas" class="pdf-canvas" :style="size" />
    <template v-if="mode === 'edit'">
      <PlaceholderBox v-for="ph in placeholders" :id="ph.id" :key="ph.id" :box="css(ph.anchor as PdfAnchor)" :color="BINDING_META[ph.binding].color"
        :label="ph.label" :selected="ph.id === selectedId" :dashed="ph.source === 'label'" :pinned="ph.source === 'manual'"
        :draggable="!adding" :resizable="!adding" @select="emit('select', ph.id)" @change="onChange(ph, $event)" />
      <div v-if="draftStyle" class="draw-box" :style="draftStyle" />
    </template>
    <template v-else>
      <div v-for="ph in placeholders.filter(p => layouts[p.id])" :key="ph.id" class="fill-box" data-testid="fill-box"
        :class="{ overflow: layouts[ph.id].truncated, whiteout: (ph.anchor as PdfAnchor).whiteout }" :style="fillStyle(ph)">
        <div v-for="(line, k) in layouts[ph.id].lines" :key="k" class="fill-line">{{ line }}</div>
      </div>
    </template>
  </div>
</template>
```

`src/components/overlay/TemplateOverlay.vue` (PDF only for now. Task 17 replaces this file):
```vue
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import type { Anchor, Format, PageRole, Placeholder } from '../../core/model';
import { openPdf } from '../../lib/pdfjs-browser';
import { getHelvetica } from '../../core/fill/pdf';
import { boxLayout, toWinAnsi, type Layout } from '../../core/fill/pdfLayout';
import PdfPageLayer from './PdfPageLayer.vue';

export interface OverlayTemplate { format: Format; fileBytes: ArrayBuffer; placeholders: Placeholder[]; pageRoles?: PageRole[]; unitStartBlock?: number }

const props = withDefaults(defineProps<{
  template: OverlayTemplate; mode: 'edit' | 'fill'; selectedId?: string | null; adding?: boolean; pickingUnit?: boolean; values?: Record<string, string>;
}>(), { selectedId: null, adding: false, pickingUnit: false, values: () => ({}) });
const emit = defineEmits<{
  select: [id: string]; update: [ph: Placeholder]; add: [a: Anchor]; resolved: [ids: string[]]; 'pick-table': [ti: number]; 'page-role': [page: number, role: PageRole];
}>();

const SCALE = 1.3;
const root = ref<HTMLElement>();
const pdf = shallowRef<Awaited<ReturnType<typeof openPdf>> | null>(null);
const pageCount = ref(0);
const layouts = shallowRef<Record<string, Layout>>({});
const loadError = ref('');

watch(() => props.template.fileBytes, async bytes => {
  pdf.value = null;
  loadError.value = '';
  if (props.template.format !== 'pdf') return;
  try {
    const d = await openPdf(bytes);
    pdf.value = d;
    pageCount.value = d.numPages;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}, { immediate: true });

watch(() => [props.values, props.template.placeholders, props.mode] as const, async () => {
  if (props.template.format !== 'pdf' || props.mode !== 'fill') { layouts.value = {}; return; }
  const font = await getHelvetica();
  const out: Record<string, Layout> = {};
  for (const ph of props.template.placeholders) {
    const v = props.values[ph.id];
    if (v?.trim() && ph.anchor.kind === 'pdf') out[ph.id] = boxLayout(toWinAnsi(v), font, ph.anchor);
  }
  layouts.value = out;
}, { immediate: true, deep: true });

const byPage = computed(() => {
  const m = new Map<number, Placeholder[]>();
  for (const ph of props.template.placeholders) if (ph.anchor.kind === 'pdf') m.set(ph.anchor.page, [...(m.get(ph.anchor.page) ?? []), ph]);
  return m;
});
const pages = computed(() => Array.from({ length: pageCount.value }, (_, i) => i)
  .filter(i => props.mode === 'edit' || (props.template.pageRoles?.[i] ?? 'unit') !== 'ignore'));

watch(() => props.selectedId, async id => {
  if (!id) return;
  await nextTick();
  root.value?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
</script>

<template>
  <div ref="root" class="overlay" :class="{ adding }">
    <p v-if="loadError" class="banner error">Couldn't show this file: {{ loadError }}</p>
    <template v-if="template.format === 'pdf' && pdf">
      <div v-for="i in pages" :key="i" class="page-wrap">
        <div v-if="mode === 'edit'" class="page-head">
          <span>Page {{ i + 1 }}</span>
          <select :data-testid="`page-role-${i}`" :value="template.pageRoles?.[i] ?? 'unit'"
            @change="emit('page-role', i, ($event.target as HTMLSelectElement).value as PageRole)">
            <option value="cover">Cover (filled once)</option>
            <option value="unit">Repeats every period</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
        <PdfPageLayer :pdf="pdf" :page-index="i" :scale="SCALE" :placeholders="byPage.get(i) ?? []" :mode="mode"
          :selected-id="selectedId" :adding="adding" :layouts="layouts"
          @select="emit('select', $event)" @update="emit('update', $event)" @add="emit('add', $event)" />
      </div>
    </template>
    <p v-else-if="template.format === 'docx'" class="muted">Word preview is added in the next task.</p>
    <p v-else-if="!loadError" class="muted">Loading document…</p>
  </div>
</template>
```

`src/components/PlaceholderInspector.vue`:
```vue
<script setup lang="ts">
import type { Binding, DateRole, DayMode, Placeholder } from '../core/model';
import { BINDING_META } from './overlay/bindingColors';

const props = defineProps<{ ph: Placeholder; unresolved: boolean }>();
const emit = defineEmits<{ update: [ph: Placeholder]; remove: [] }>();

const DATE_ROLES: [DateRole, string][] = [['day', 'That day'], ['start', 'Period start'], ['end', 'Period end'], ['range', 'Start – end'], ['number', 'Period number']];
const SOURCE_TEXT = { marker: 'a marker in the file', label: 'a label in the file', manual: 'you' } as const;

const set = (patch: Partial<Placeholder>) => emit('update', { ...props.ph, ...patch });
function onBinding(b: Binding) {
  const patch: Partial<Placeholder> = { binding: b };
  if (b === 'date' && !props.ph.dateRole) patch.dateRole = props.ph.dayIndex != null ? 'day' : 'range';
  set(patch);
}
const onDay = (v: string) => set({ dayIndex: v === '' ? undefined : Math.max(0, Number(v) - 1) });
</script>

<template>
  <div class="card inspector">
    <h2>Placeholder</h2>
    <p v-if="unresolved" class="banner">Can't show this one on the page. Delete it and add it again manually.</p>
    <label>Label <input data-testid="insp-label" :value="ph.label" @input="set({ label: ($event.target as HTMLInputElement).value })" /></label>
    <label>Filled with
      <select data-testid="insp-binding" :value="ph.binding" @change="onBinding(($event.target as HTMLSelectElement).value as Binding)">
        <option v-for="(m, b) in BINDING_META" :key="b" :value="b">{{ m.label }}</option>
      </select>
    </label>
    <label v-if="ph.binding === 'date'">Shows
      <select data-testid="insp-daterole" :value="ph.dateRole ?? (ph.dayIndex != null ? 'day' : 'range')" @change="set({ dateRole: ($event.target as HTMLSelectElement).value as DateRole })">
        <option v-for="[r, t] in DATE_ROLES" :key="r" :value="r">{{ t }}</option>
      </select>
    </label>
    <template v-if="ph.binding === 'daily' || (ph.binding === 'date' && (ph.dateRole ?? 'day') === 'day')">
      <label>Day number <input data-testid="insp-dayindex" type="number" min="1" :value="ph.dayIndex != null ? ph.dayIndex + 1 : ''" @input="onDay(($event.target as HTMLInputElement).value)" /></label>
      <label>Counting
        <select :value="ph.dayMode ?? 'nth'" @change="set({ dayMode: ($event.target as HTMLSelectElement).value as DayMode })">
          <option value="nth">Nth working day of the period</option>
          <option value="weekday">Weekday (1 = Monday)</option>
        </select>
      </label>
    </template>
    <p class="muted">Part: {{ ph.region === 'cover' ? 'Cover (filled once)' : 'Repeats every period' }} · Found by {{ SOURCE_TEXT[ph.source] }}</p>
    <button type="button" class="danger" data-testid="insp-delete" @click="emit('remove')">Delete placeholder</button>
  </div>
</template>
```

- [ ] **Step 4: Write the templates list**

`src/views/supervisor/TemplatesList.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { Template } from '../../core/model';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';

const templates = useTemplates();
const toast = useToast();
const usage = ref<Record<string, number>>({});

onMounted(async () => {
  await templates.load();
  for (const t of templates.list) usage.value[t.id] = await templates.usage(t.id);
});

async function remove(t: Template) {
  const n = usage.value[t.id] ?? 0;
  const q = n ? `${n} student(s) use this template. Delete it anyway? They'll be asked to pick another.` : `Delete the template for ${t.university}?`;
  if (!confirm(q)) return;
  try { await templates.remove(t.id); toast.show('Template deleted'); } catch (e) { toast.show(errorText(e), true); }
}
</script>

<template>
  <section class="card">
    <div class="row">
      <h1>University templates</h1>
      <span class="spacer" />
      <RouterLink to="/supervisor/templates/new"><button type="button" class="primary" data-testid="new-template">New template</button></RouterLink>
    </div>
    <p v-if="!templates.list.length" class="muted">No templates yet. Upload a university's logbook to get started.</p>
    <table v-else class="list">
      <thead><tr><th>University</th><th>Format</th><th>Period</th><th>Placeholders</th><th>Students</th><th /></tr></thead>
      <tbody>
        <tr v-for="t in templates.list" :key="t.id" data-testid="template-row">
          <td>{{ t.university }}</td>
          <td>{{ t.format.toUpperCase() }}</td>
          <td>{{ t.period }}</td>
          <td>{{ t.placeholders.length }}</td>
          <td>{{ usage[t.id] ?? 0 }}</td>
          <td class="row"><RouterLink :to="`/supervisor/templates/${t.id}`">Edit</RouterLink><button type="button" class="link" @click="remove(t)">Delete</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

- [ ] **Step 5: Write the template editor**

`src/views/supervisor/TemplateEditor.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import type { Anchor, PageRole, Placeholder, Template } from '../../core/model';
import { cloneTemplate, detectFromFile, findByUniversity, validateTemplate } from '../../core/template';
import { blockIndexOfTable, docxContext, readDocxXml, regionOfDocxAnchor, type DocxContext } from '../../core/detect/docx';
import { newId } from '../../core/ids';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import PlaceholderInspector from '../../components/PlaceholderInspector.vue';
import { BINDING_META } from '../../components/overlay/bindingColors';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';

const route = useRoute();
const router = useRouter();
const templates = useTemplates();
const toast = useToast();

const draft = ref<Template | null>(null);
const original = shallowRef<Template | null>(null);
const ctx = shallowRef<DocxContext | null>(null);
const selectedId = ref<string | null>(null);
const tool = ref<'select' | 'add' | 'unit'>('select');
const unresolved = ref<string[]>([]);
const warnings = ref<string[]>([]);
const dirty = ref(false);
const busy = ref(false);
const upload = ref<{ file: File | null; university: string }>({ file: null, university: '' });

onMounted(async () => {
  await templates.load();
  const id = route.params.id as string | undefined;
  if (!id) return;
  const t = templates.list.find(x => x.id === id);
  if (!t) { toast.show('That template no longer exists.', true); await router.replace('/supervisor/templates'); return; }
  original.value = t;
  draft.value = cloneTemplate(t);
  if (t.format === 'docx') ctx.value = docxContext(await readDocxXml(t.fileBytes));
});

async function runDetect() {
  const f = upload.value.file;
  if (!f) { toast.show('Choose a .docx or .pdf file first.', true); return; }
  busy.value = true;
  try {
    const r = await detectFromFile(f);
    draft.value = {
      id: newId('tpl'), university: upload.value.university.trim(), format: r.format, fileName: f.name, fileBytes: r.bytes,
      period: 'weekly', pageRoles: r.pageRoles, unitStartBlock: r.unitStartBlock, placeholders: r.placeholders, updatedAt: '',
    };
    ctx.value = r.docx ?? null;
    warnings.value = r.warnings;
    dirty.value = true;
    toast.show(`Found ${r.placeholders.length} placeholders. Check them and fix anything that's wrong.`);
  } catch (e) {
    toast.show(errorText(e), true);
  } finally {
    busy.value = false;
  }
}

function regionFor(anchor: Anchor): 'cover' | 'unit' {
  const t = draft.value!;
  if (anchor.kind === 'pdf') return t.pageRoles?.[anchor.page] === 'cover' ? 'cover' : 'unit';
  return ctx.value ? regionOfDocxAnchor(ctx.value, anchor, t.unitStartBlock ?? 0) : 'unit';
}
function recomputeRegions() {
  const t = draft.value!;
  t.placeholders = t.placeholders.map(p => ({ ...p, region: regionFor(p.anchor) }));
}
function updatePh(ph: Placeholder) {
  const t = draft.value!;
  t.placeholders = t.placeholders.map(p => (p.id === ph.id ? { ...ph, region: regionFor(ph.anchor) } : p));
  dirty.value = true;
}
function addPh(anchor: Anchor) {
  const ph: Placeholder = { id: newId('ph'), label: 'New field', binding: 'free', source: 'manual', region: regionFor(anchor), anchor };
  draft.value!.placeholders = [...draft.value!.placeholders, ph];
  selectedId.value = ph.id;
  tool.value = 'select';
  dirty.value = true;
}
function removePh(id: string) {
  draft.value!.placeholders = draft.value!.placeholders.filter(p => p.id !== id);
  selectedId.value = null;
  dirty.value = true;
}
function setPageRole(page: number, role: PageRole) {
  const t = draft.value!;
  const roles = [...(t.pageRoles ?? [])];
  roles[page] = role;
  t.pageRoles = roles;
  recomputeRegions();
  dirty.value = true;
}
function pickTable(ti: number) {
  if (!ctx.value) return;
  const bi = blockIndexOfTable(ctx.value, ti);
  if (bi == null) { toast.show("That table isn't at the top level of the document.", true); return; }
  draft.value!.unitStartBlock = bi;
  recomputeRegions();
  tool.value = 'select';
  dirty.value = true;
}
function wholeDocRepeats() {
  draft.value!.unitStartBlock = 0;
  recomputeRegions();
  dirty.value = true;
}

const selected = computed(() => draft.value?.placeholders.find(p => p.id === selectedId.value) ?? null);
const groups = computed(() => {
  const list = draft.value?.placeholders ?? [];
  return [
    { title: 'Cover (filled once)', items: list.filter(p => p.region === 'cover') },
    { title: 'Repeats every period', items: list.filter(p => p.region === 'unit') },
  ].filter(g => g.items.length);
});
const hint = computed(() => {
  if (tool.value === 'add') return draft.value?.format === 'pdf' ? 'Drag on the page to draw a new placeholder.' : 'Click a table cell, or select some text, to add a placeholder.';
  if (tool.value === 'unit') return 'Click the table where the repeating part (one period) starts.';
  return 'Click a highlight or a list item to edit it. Dashed boxes are guesses from labels: check them.';
});

async function save() {
  const t = draft.value!;
  t.university = t.university.trim();
  const errors = validateTemplate(t);
  if (errors.length) { toast.show(errors.join(' '), true); return; }
  const clash = findByUniversity(templates.list, t.university, t.id);
  if (clash && !confirm(`A template for "${clash.university}" already exists. Replace it?`)) return;
  const previous = clash ?? original.value;
  if (previous) {
    const keep = new Set(t.placeholders.map(p => p.id));
    const removed = previous.placeholders.filter(p => !keep.has(p.id)).map(p => p.id);
    const affected = removed.length ? await templates.studentsWithValues(previous.id, removed) : 0;
    if (affected && !confirm(`${affected} student(s) typed into fields you removed. Their text for those fields will be lost. Save anyway?`)) return;
  }
  try {
    if (clash) {
      if (original.value && original.value.id !== clash.id) await templates.remove(original.value.id);
      t.id = clash.id; // students linked to the old template keep their link
    }
    t.updatedAt = new Date().toISOString();
    await templates.save(t);
    dirty.value = false;
    toast.show('Template saved');
    await router.push('/supervisor/templates');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}

onBeforeRouteLeave(() => !dirty.value || confirm('Discard your unsaved changes to this template?'));
</script>

<template>
  <section v-if="!draft" class="card" style="max-width: 560px">
    <h1>New university template</h1>
    <label>University name <input v-model="upload.university" data-testid="university-input" placeholder="e.g. Taylor's University" /></label>
    <label>Template file (.docx or .pdf)
      <input data-testid="upload-input" type="file" accept=".docx,.pdf" @change="upload.file = ($event.target as HTMLInputElement).files?.[0] ?? null" />
    </label>
    <button type="button" class="primary" data-testid="detect-btn" :disabled="busy" @click="runDetect">{{ busy ? 'Detecting…' : 'Detect placeholders' }}</button>
  </section>

  <section v-else>
    <div class="toolbar card">
      <label>University <input v-model="draft.university" data-testid="university-input" @input="dirty = true" /></label>
      <label>Period
        <select v-model="draft.period" data-testid="period-select" @change="dirty = true">
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
      </label>
      <div class="seg">
        <button type="button" data-testid="mode-select-btn" :aria-pressed="tool === 'select'" @click="tool = 'select'">Select</button>
        <button type="button" data-testid="mode-add-btn" :aria-pressed="tool === 'add'" @click="tool = 'add'">Add placeholder</button>
        <template v-if="draft.format === 'docx'">
          <button type="button" data-testid="mode-unit-btn" :aria-pressed="tool === 'unit'" @click="tool = 'unit'">Set repeating start</button>
          <button type="button" @click="wholeDocRepeats">Whole document repeats</button>
        </template>
      </div>
      <span class="spacer" />
      <button type="button" class="primary" data-testid="save-template" @click="save">Save template</button>
    </div>
    <p class="muted">{{ hint }}</p>
    <p v-for="w in warnings" :key="w" class="banner">{{ w }}</p>
    <div class="editor-grid">
      <div class="doc-pane">
        <TemplateOverlay :template="draft" mode="edit" :selected-id="selectedId" :adding="tool === 'add'" :picking-unit="tool === 'unit'"
          @select="selectedId = $event" @update="updatePh" @add="addPh" @resolved="unresolved = $event" @pick-table="pickTable" @page-role="setPageRole" />
      </div>
      <aside class="side">
        <div class="card legend">
          <span v-for="(m, b) in BINDING_META" :key="b"><i class="dot" :style="{ background: m.color }" />{{ m.label }}</span>
        </div>
        <PlaceholderInspector v-if="selected" :ph="selected" :unresolved="unresolved.includes(selected.id)" @update="updatePh" @remove="removePh(selected.id)" />
        <div class="card">
          <h2>{{ draft.placeholders.length }} placeholders</h2>
          <div v-for="g in groups" :key="g.title">
            <p class="muted">{{ g.title }}</p>
            <div class="ph-list">
              <button v-for="ph in g.items" :key="ph.id" type="button" class="ph-item" data-testid="ph-item" :aria-pressed="ph.id === selectedId" @click="selectedId = ph.id">
                <i class="dot" :style="{ background: BINDING_META[ph.binding].color }" />
                <span class="ph-name">{{ ph.label }}</span>
                <small>{{ BINDING_META[ph.binding].label }}</small>
                <span v-if="unresolved.includes(ph.id)" title="Can't show this on the page">⚠</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npx playwright test tests/e2e/template-pdf.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add -A
git commit -m "feat(supervisor): PDF template editor with highlight overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Word overlay in the editor

**Files:**
- Create: `src/components/overlay/docxAnchors.ts`, `src/components/overlay/DocxLayer.vue`, `tests/e2e/template-docx.spec.ts`
- Replace: `src/components/overlay/TemplateOverlay.vue`

**Interfaces:**
- Consumes: `docxContext`, `readDocxXml`, `tableIndexAtBlock` (Task 8); `docx-preview`'s `renderAsync`.
- Produces:
  - `docxAnchors.ts`:
    - `DocxDomIndex { paraOf: (HTMLElement | null)[]; domToXml: Map<Element, number>; texts: string[]; tables: HTMLTableElement[]; nested: Map<HTMLTableElement, HTMLTableElement[]> }`
    - `indexDocxDom(root, paraTexts)`
    - `resolveAnchor(ix, a): { el: HTMLElement; rect(): DOMRect } | null`
    - `anchorFromCell(ix, td)`, `anchorFromSelection(ix, sel)`, `anchorAtParagraphEnd(ix, p)`, `topTableIndexOf(ix, el)`
  - `TemplateOverlay` gains Word support (same props and emits as Task 16).

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/template-docx.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { asRole, fixture } from './helpers';

test('supervisor edits a Word template: highlights, binding change, manual cell, repeating start', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill("Taylor's University");
  await page.getByTestId('upload-input').setInputFiles(fixture('taylors.docx'));
  await page.getByTestId('detect-btn').click();

  await expect(page.locator('.docx-host [data-testid="ph-box"]').first()).toBeVisible();
  const items = page.getByTestId('ph-item');
  const before = await items.count();

  await items.first().click();
  await page.getByTestId('insp-binding').selectOption('free');
  await expect(items.first()).toContainText('Free text');

  await page.getByTestId('mode-add-btn').click();
  await page.locator('.docx-host td').last().click();
  await expect(items).toHaveCount(before + 1);

  await page.getByTestId('mode-unit-btn').click();
  await page.locator('.docx-host table').first().click();
  await expect(page.locator('.unit-line')).toBeVisible();

  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText("Taylor's University");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/template-docx.spec.ts`
Expected: FAIL. No `.docx-host` boxes exist, because Task 16's overlay shows "Word preview is added in the next task".

- [ ] **Step 3: Write `src/components/overlay/docxAnchors.ts`**

```ts
import type { DocxAnchor, DocxCellAnchor, DocxTextAnchor } from '../../core/model';

/** Links the XML anchors to the DOM that docx-preview rendered. */
export interface DocxDomIndex {
  paraOf: (HTMLElement | null)[];          // xml paragraph index → rendered <p>
  domToXml: Map<Element, number>;          // rendered <p> → xml paragraph index
  texts: string[];                         // xml paragraph texts
  tables: HTMLTableElement[];              // top-level tables, document order
  nested: Map<HTMLTableElement, HTMLTableElement[]>;
}

const norm = (s: string) => s.replace(/\s+/g, '');

/**
 * docx-preview renders one <p> per <w:p>, in order, so index i usually lines up.
 * When it doesn't (e.g. an extra paragraph it synthesised), look nearby for the
 * paragraph with the same text instead of trusting the position blindly.
 */
export function indexDocxDom(root: HTMLElement, paraTexts: string[]): DocxDomIndex {
  const dom = Array.from(root.querySelectorAll<HTMLElement>('section.docx article p'));
  const same = (el: HTMLElement | undefined, want: string) => !!el && norm(el.textContent ?? '') === want;
  const paraOf = paraTexts.map((t, i) => {
    const want = norm(t);
    if (same(dom[i], want)) return dom[i];
    if (!want) return dom[i] ?? null;
    for (let d = 1; d < 40; d++) for (const j of [i - d, i + d]) if (same(dom[j], want)) return dom[j];
    return null;
  });
  const domToXml = new Map<Element, number>();
  paraOf.forEach((p, i) => { if (p && !domToXml.has(p)) domToXml.set(p, i); });
  const all = Array.from(root.querySelectorAll<HTMLTableElement>('section.docx article table'));
  const tables = all.filter(t => !t.parentElement?.closest('table'));
  const nested = new Map<HTMLTableElement, HTMLTableElement[]>();
  for (const t of tables) nested.set(t, all.filter(n => n !== t && n.parentElement?.closest('table') === t));
  return { paraOf, domToXml, texts: paraTexts, tables, nested };
}

function rangeRect(p: HTMLElement, start: number, end: number): DOMRect | null {
  if (start === end) return null;
  const range = document.createRange();
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let started = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    if (!started && start <= pos + len) { range.setStart(n, start - pos); started = true; }
    if (started && end <= pos + len) {
      range.setEnd(n, end - pos);
      const r = range.getBoundingClientRect();
      return r.width ? r : null;
    }
    pos += len;
  }
  return null;
}

export function resolveAnchor(ix: DocxDomIndex, a: DocxAnchor): { el: HTMLElement; rect(): DOMRect } | null {
  if (a.kind === 'docx-cell') {
    const top = ix.tables[a.table[0]];
    if (!top || a.table.length > 2) return null;
    const t = a.table.length === 1 ? top : ix.nested.get(top)?.[a.table[1]];
    const cell = t?.rows[a.row]?.cells[a.col] as HTMLElement | undefined;
    return cell ? { el: cell, rect: () => cell.getBoundingClientRect() } : null;
  }
  const p = ix.paraOf[a.paragraph];
  return p ? { el: p, rect: () => rangeRect(p, a.start, a.end) ?? p.getBoundingClientRect() } : null;
}

export function anchorFromCell(ix: DocxDomIndex, td: HTMLTableCellElement): DocxCellAnchor | null {
  const t = td.closest('table') as HTMLTableElement | null;
  const tr = td.parentElement as HTMLTableRowElement | null;
  if (!t || !tr) return null;
  const ti = ix.tables.indexOf(t);
  if (ti >= 0) return { kind: 'docx-cell', table: [ti], row: tr.rowIndex, col: td.cellIndex };
  for (const [top, list] of ix.nested) {
    const ni = list.indexOf(t);
    if (ni >= 0) return { kind: 'docx-cell', table: [ix.tables.indexOf(top), ni], row: tr.rowIndex, col: td.cellIndex };
  }
  return null;
}

const elOf = (n: Node): Element | null => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);

export function anchorFromSelection(ix: DocxDomIndex, sel: Selection): DocxTextAnchor | null {
  const range = sel.getRangeAt(0);
  const p = elOf(range.startContainer)?.closest('p');
  if (!p || p !== elOf(range.endContainer)?.closest('p')) return null;
  const pi = ix.domToXml.get(p);
  if (pi == null) return null;
  const pre = document.createRange();
  pre.selectNodeContents(p);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { kind: 'docx-text', paragraph: pi, start, end: start + range.toString().length };
}

export function anchorAtParagraphEnd(ix: DocxDomIndex, p: HTMLElement): DocxTextAnchor | null {
  const pi = ix.domToXml.get(p);
  if (pi == null) return null;
  const len = ix.texts[pi].length;
  return { kind: 'docx-text', paragraph: pi, start: len, end: len };
}

export function topTableIndexOf(ix: DocxDomIndex, el: Element): number | null {
  let t = el.closest('table');
  while (t?.parentElement?.closest('table')) t = t.parentElement.closest('table');
  const i = t ? ix.tables.indexOf(t as HTMLTableElement) : -1;
  return i >= 0 ? i : null;
}
```

- [ ] **Step 4: Write `src/components/overlay/DocxLayer.vue`**

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderAsync } from 'docx-preview';
import type { DocxAnchor, Placeholder } from '../../core/model';
import PlaceholderBox from './PlaceholderBox.vue';
import { BINDING_META } from './bindingColors';
import { anchorAtParagraphEnd, anchorFromCell, anchorFromSelection, indexDocxDom, resolveAnchor, topTableIndexOf, type DocxDomIndex } from './docxAnchors';

const props = defineProps<{
  bytes: ArrayBuffer; paraTexts: string[]; placeholders: Placeholder[]; mode: 'edit' | 'fill'; selectedId: string | null;
  adding: boolean; pickingUnit: boolean; unitTableIndex: number | null; values: Record<string, string>;
}>();
const emit = defineEmits<{ select: [id: string]; add: [a: DocxAnchor]; resolved: [ids: string[]]; 'pick-table': [ti: number] }>();

const host = ref<HTMLDivElement>();
const doc = ref<HTMLDivElement>();
const boxes = ref<{ ph: Placeholder; box: { left: number; top: number; width: number; height: number } }[]>([]);
const unitLineTop = ref<number | null>(null);
let index: DocxDomIndex | null = null;
const touched = new Set<HTMLElement>();
let observer: ResizeObserver | null = null;

async function render() {
  if (!doc.value) return;
  index = null;
  touched.clear();
  doc.value.innerHTML = '';
  await renderAsync(new Blob([props.bytes]), doc.value, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true });
  index = indexDocxDom(doc.value, props.paraTexts);
  refresh();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The preview fills values by hiding the original children and appending a
// marked node, never by replacing innerHTML. That keeps the element
// references in `index` valid across keystrokes.
function clearFill() {
  for (const el of touched) {
    el.classList.remove('il-hide');
    el.querySelectorAll(':scope > .il-filled').forEach(n => n.remove());
  }
  touched.clear();
}
function applyFill() {
  if (!index) return;
  const perEl = new Map<HTMLElement, { cell?: string; ranges: { start: number; end: number; v: string }[] }>();
  for (const ph of props.placeholders) {
    const v = props.values[ph.id];
    if (!v?.trim()) continue;
    const a = ph.anchor as DocxAnchor;
    const r = resolveAnchor(index, a);
    if (!r) continue;
    const entry = perEl.get(r.el) ?? { ranges: [] };
    perEl.set(r.el, entry);
    if (a.kind === 'docx-cell') entry.cell = v;
    else entry.ranges.push({ start: a.start, end: a.end, v });
  }
  for (const [el, e] of perEl) {
    let text: string;
    if (e.cell != null) text = e.cell;
    else {
      text = el.textContent ?? '';
      for (const r of e.ranges.sort((a, b) => b.start - a.start)) {
        const pre = text.slice(0, r.start);
        text = pre + (r.start === r.end && pre && !/\s$/.test(pre) ? ' ' : '') + r.v + text.slice(r.end);
      }
    }
    const node = document.createElement(e.cell != null ? 'p' : 'span');
    node.className = 'il-filled';
    node.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    el.classList.add('il-hide');
    el.appendChild(node);
    touched.add(el);
  }
}

function refresh() {
  if (!index || !host.value || !doc.value) return;
  clearFill();
  if (props.mode === 'fill') { applyFill(); boxes.value = []; return; }
  const origin = host.value.getBoundingClientRect();
  const out: typeof boxes.value = [];
  const missing: string[] = [];
  for (const ph of props.placeholders) {
    const r = resolveAnchor(index, ph.anchor as DocxAnchor);
    if (!r) { missing.push(ph.id); continue; }
    const rect = r.rect();
    out.push({ ph, box: { left: rect.left - origin.left, top: rect.top - origin.top, width: Math.max(rect.width, 10), height: Math.max(rect.height, 14) } });
  }
  boxes.value = out;
  emit('resolved', missing);
  const t = props.unitTableIndex != null ? index.tables[props.unitTableIndex] : null;
  const first = doc.value.querySelector('section.docx article');
  unitLineTop.value = t ? t.getBoundingClientRect().top - origin.top - 4 : first ? first.getBoundingClientRect().top - origin.top : null;
}

function onClick(e: MouseEvent) {
  if (props.mode !== 'edit' || !index) return;
  const target = e.target as HTMLElement;
  if (props.pickingUnit) {
    const ti = topTableIndexOf(index, target);
    if (ti != null) emit('pick-table', ti);
    return;
  }
  if (!props.adding) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    const a = anchorFromSelection(index, sel);
    sel.removeAllRanges();
    if (a) { emit('add', a); return; }
  }
  const td = target.closest('td');
  if (td) { const a = anchorFromCell(index, td as HTMLTableCellElement); if (a) emit('add', a); return; }
  const p = target.closest('p');
  if (p) { const a = anchorAtParagraphEnd(index, p as HTMLElement); if (a) emit('add', a); }
}

onMounted(() => {
  void render();
  observer = new ResizeObserver(() => refresh());
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.bytes, () => void render());
watch(() => [props.placeholders, props.values, props.mode, props.unitTableIndex], () => nextTick(refresh), { deep: true });
</script>

<template>
  <div ref="host" class="docx-host" :class="{ picking: pickingUnit, adding }" @click="onClick">
    <div ref="doc" />
    <template v-if="mode === 'edit'">
      <div v-if="unitLineTop != null" class="unit-line" :style="{ top: `${unitLineTop}px` }"><span>Repeats every period ↓</span></div>
      <PlaceholderBox v-for="b in boxes" :id="b.ph.id" :key="b.ph.id" :box="b.box" :color="BINDING_META[b.ph.binding].color" :label="b.ph.label"
        :selected="b.ph.id === selectedId" :dashed="b.ph.source === 'label'" :pinned="b.ph.source === 'manual'"
        :draggable="false" :resizable="false" @select="emit('select', b.ph.id)" />
    </template>
  </div>
</template>
```

- [ ] **Step 5: Replace `src/components/overlay/TemplateOverlay.vue` with the version that supports Word**

```vue
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import type { Anchor, Format, PageRole, Placeholder } from '../../core/model';
import { openPdf } from '../../lib/pdfjs-browser';
import { getHelvetica } from '../../core/fill/pdf';
import { boxLayout, toWinAnsi, type Layout } from '../../core/fill/pdfLayout';
import { docxContext, readDocxXml, tableIndexAtBlock, type DocxContext } from '../../core/detect/docx';
import PdfPageLayer from './PdfPageLayer.vue';
import DocxLayer from './DocxLayer.vue';

export interface OverlayTemplate { format: Format; fileBytes: ArrayBuffer; placeholders: Placeholder[]; pageRoles?: PageRole[]; unitStartBlock?: number }

const props = withDefaults(defineProps<{
  template: OverlayTemplate; mode: 'edit' | 'fill'; selectedId?: string | null; adding?: boolean; pickingUnit?: boolean; values?: Record<string, string>;
}>(), { selectedId: null, adding: false, pickingUnit: false, values: () => ({}) });
const emit = defineEmits<{
  select: [id: string]; update: [ph: Placeholder]; add: [a: Anchor]; resolved: [ids: string[]]; 'pick-table': [ti: number]; 'page-role': [page: number, role: PageRole];
}>();

const SCALE = 1.3;
const root = ref<HTMLElement>();
const pdf = shallowRef<Awaited<ReturnType<typeof openPdf>> | null>(null);
const ctx = shallowRef<DocxContext | null>(null);
const pageCount = ref(0);
const layouts = shallowRef<Record<string, Layout>>({});
const loadError = ref('');

watch(() => props.template.fileBytes, async bytes => {
  pdf.value = null;
  ctx.value = null;
  loadError.value = '';
  try {
    if (props.template.format === 'pdf') {
      const d = await openPdf(bytes);
      pdf.value = d;
      pageCount.value = d.numPages;
    } else {
      ctx.value = docxContext(await readDocxXml(bytes));
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}, { immediate: true });

watch(() => [props.values, props.template.placeholders, props.mode] as const, async () => {
  if (props.template.format !== 'pdf' || props.mode !== 'fill') { layouts.value = {}; return; }
  const font = await getHelvetica();
  const out: Record<string, Layout> = {};
  for (const ph of props.template.placeholders) {
    const v = props.values[ph.id];
    if (v?.trim() && ph.anchor.kind === 'pdf') out[ph.id] = boxLayout(toWinAnsi(v), font, ph.anchor);
  }
  layouts.value = out;
}, { immediate: true, deep: true });

const byPage = computed(() => {
  const m = new Map<number, Placeholder[]>();
  for (const ph of props.template.placeholders) if (ph.anchor.kind === 'pdf') m.set(ph.anchor.page, [...(m.get(ph.anchor.page) ?? []), ph]);
  return m;
});
const pages = computed(() => Array.from({ length: pageCount.value }, (_, i) => i)
  .filter(i => props.mode === 'edit' || (props.template.pageRoles?.[i] ?? 'unit') !== 'ignore'));
const unitTableIndex = computed(() => (ctx.value ? tableIndexAtBlock(ctx.value, props.template.unitStartBlock ?? 0) : null));

watch(() => props.selectedId, async id => {
  if (!id) return;
  await nextTick();
  root.value?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
</script>

<template>
  <div ref="root" class="overlay" :class="{ adding }">
    <p v-if="loadError" class="banner error">Couldn't show this file: {{ loadError }}</p>
    <template v-if="template.format === 'pdf' && pdf">
      <div v-for="i in pages" :key="i" class="page-wrap">
        <div v-if="mode === 'edit'" class="page-head">
          <span>Page {{ i + 1 }}</span>
          <select :data-testid="`page-role-${i}`" :value="template.pageRoles?.[i] ?? 'unit'"
            @change="emit('page-role', i, ($event.target as HTMLSelectElement).value as PageRole)">
            <option value="cover">Cover (filled once)</option>
            <option value="unit">Repeats every period</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
        <PdfPageLayer :pdf="pdf" :page-index="i" :scale="SCALE" :placeholders="byPage.get(i) ?? []" :mode="mode"
          :selected-id="selectedId" :adding="adding" :layouts="layouts"
          @select="emit('select', $event)" @update="emit('update', $event)" @add="emit('add', $event)" />
      </div>
    </template>
    <DocxLayer v-else-if="template.format === 'docx' && ctx" :bytes="template.fileBytes" :para-texts="ctx.paraTexts"
      :placeholders="template.placeholders" :mode="mode" :selected-id="selectedId" :adding="adding" :picking-unit="pickingUnit"
      :unit-table-index="unitTableIndex" :values="values"
      @select="emit('select', $event)" @add="emit('add', $event)" @resolved="emit('resolved', $event)" @pick-table="emit('pick-table', $event)" />
    <p v-else-if="!loadError" class="muted">Loading document…</p>
  </div>
</template>
```

- [ ] **Step 6: Run both editor e2e tests**

Run: `npx playwright test tests/e2e/template-docx.spec.ts tests/e2e/template-pdf.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add -A
git commit -m "feat(supervisor): Word template overlay with cell/text anchors and repeating start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Student onboarding and notepad

**Files:**
- Replace: `src/views/student/Onboarding.vue`, `src/views/student/Notepad.vue`
- Create: `tests/e2e/flow.spec.ts` (Tasks 19–21 add more tests to it)

**Interfaces:**
- Consumes: `useStudent` (`setup`, `saveNote`, `notes`, `lockedDates`, `canChangeSetup`, `templateMissing`), `useTemplates`, `debounce`, dates.
- Produces:
  - Test IDs: `onb-university`, `onb-start`, `onb-end`, `onb-save`, `note-date` (with `data-date`), `note-text`, `note-status`.
  - `flow.spec.ts` shared state: one `page` for the whole serial flow, with a supervisor-created PMU template that has a signature placeholder.

- [ ] **Step 1: Write the failing e2e tests (the start of `tests/e2e/flow.spec.ts`)**

```ts
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { asRole, fixture, iso, lastWeekday, pdfWords } from './helpers';

test.describe.configure({ mode: 'serial' });

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const NOTE = 'Configured the ERP gateway sandbox & wrote <notes>';
const noteDay = lastWeekday();
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
});
test.afterAll(async () => { await page.close(); });

test('supervisor prepares the PMU template with a signature spot', async () => {
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('mode-add-btn').click();
  const pg = (await page.getByTestId('pdf-page').first().boundingBox())!;
  await page.mouse.move(pg.x + 40, pg.y + 40);
  await page.mouse.down();
  await page.mouse.move(pg.x + 220, pg.y + 64, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId('insp-binding').selectOption('signature');
  await page.getByTestId('insp-label').fill('Supervisor signature');
  await page.getByTestId('period-select').selectOption('weekly');
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY);
});

test('student onboards and the notepad autosaves across a reload', async () => {
  await asRole(page, 'Aina Rahman');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-save').click();

  await page.locator(`[data-testid="note-date"][data-date="${iso(noteDay)}"]`).click();
  await page.getByTestId('note-text').fill(NOTE);
  await expect(page.getByTestId('note-status')).toContainText('Saved');

  await page.reload();
  await page.locator(`[data-testid="note-date"][data-date="${iso(noteDay)}"]`).click();
  await expect(page.getByTestId('note-text')).toHaveValue(NOTE);
  // Future days can't be picked.
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  await expect(page.locator(`[data-testid="note-date"][data-date="${iso(tomorrow)}"]`)).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: the first test passes. The second FAILS, because `onb-university` isn't found in the stub view.

- [ ] **Step 3: Write `src/views/student/Onboarding.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';
import { formatDMY } from '../../core/dates';

const st = useStudent();
const templates = useTemplates();
const toast = useToast();
const router = useRouter();
const form = ref({
  templateId: st.templateMissing ? '' : (st.student?.templateId ?? ''),
  start: st.student?.startDate ?? '',
  end: st.student?.endDate ?? '',
});
onMounted(() => templates.load());

async function save() {
  if (!form.value.templateId || !form.value.start || !form.value.end) { toast.show('Pick your university and both dates.', true); return; }
  try {
    await st.setup(form.value.templateId, form.value.start, form.value.end);
    toast.show('Saved');
    await router.push('/student/notepad');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
</script>

<template>
  <section class="card" style="max-width: 560px">
    <h1>My internship</h1>
    <p v-if="st.templateMissing" class="banner">Your university's template was removed. Pick another one to carry on.</p>
    <template v-if="st.canChangeSetup">
      <p v-if="!templates.list.length" class="banner">No university templates yet. Ask your supervisor to add one (switch to "Supervisor" at the top).</p>
      <label>University
        <select v-model="form.templateId" data-testid="onb-university">
          <option value="" disabled>Choose…</option>
          <option v-for="t in templates.list" :key="t.id" :value="t.id">{{ t.university }}</option>
        </select>
      </label>
      <label>Start date <input v-model="form.start" data-testid="onb-start" type="date" /></label>
      <label>End date <input v-model="form.end" data-testid="onb-end" type="date" /></label>
      <button type="button" class="primary" data-testid="onb-save" @click="save">Save</button>
    </template>
    <template v-else>
      <p>{{ st.template?.university }}: {{ formatDMY(st.student!.startDate!) }} to {{ formatDMY(st.student!.endDate!) }}</p>
      <p class="muted">These can't be changed after you've submitted a period.</p>
    </template>
  </section>
</template>
```

- [ ] **Step 4: Write `src/views/student/Notepad.vue`**

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import { eachDay, isWeekend, parseISO, todayISO } from '../../core/dates';
import { debounce } from '../../lib/debounce';

const st = useStudent();
const toast = useToast();
const today = todayISO();
const dates = computed(() => (st.student?.startDate && st.student.endDate ? eachDay(st.student.startDate, st.student.endDate) : []));

function initialDate() {
  const d = dates.value;
  if (!d.length) return today;
  if (today < d[0]) return d[0];
  if (today > d[d.length - 1]) return d[d.length - 1];
  return today;
}
const selected = ref(initialDate());
const text = ref(st.notes[selected.value] ?? '');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref('');
let pending: { date: string; text: string } | null = null;

async function persist() {
  const p = pending;
  if (!p) return;
  pending = null;
  try {
    await st.saveNote(p.date, p.text);
    status.value = 'saved';
    savedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    pending = pending ?? p; // keep it (unless newer text arrived) and retry on the next edit
    status.value = 'error';
    toast.show("Couldn't save your note. It's kept here and will retry when you type again.", true);
  }
}
const saver = debounce(persist, 800);
const flush = () => saver.flush();

const locked = computed(() => st.lockedDates.has(selected.value));
const isFuture = (d: string) => d > today;

function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  pending = { date: selected.value, text: text.value };
  status.value = 'saving';
  saver.call();
}
async function pick(d: string) {
  if (isFuture(d)) return;
  await flush();
  selected.value = d;
  text.value = st.notes[d] ?? '';
  status.value = 'idle';
}

const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
const onPageHide = () => { void flush(); };
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  void nextTick(() => document.querySelector(`[data-date="${selected.value}"]`)?.scrollIntoView({ block: 'center' }));
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  void flush();
});
onBeforeRouteLeave(async () => { await flush(); });

const dayLabel = (d: string) => parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
</script>

<template>
  <div class="notepad">
    <nav class="date-list" aria-label="Days of your internship">
      <button v-for="d in dates" :key="d" type="button" data-testid="note-date" :data-date="d"
        :class="{ weekend: isWeekend(d), today: d === today, has: !!st.notes[d]?.trim() }"
        :aria-pressed="d === selected" :disabled="isFuture(d)" @click="pick(d)">{{ dayLabel(d) }}</button>
    </nav>
    <section class="card note">
      <header>
        <h1>{{ dayLabel(selected) }}</h1>
        <span class="muted" data-testid="note-status" aria-live="polite">{{ statusText }}</span>
      </header>
      <p v-if="locked" class="banner">This day is in a period that's with your supervisor, so it's read-only.</p>
      <textarea data-testid="note-text" :value="text" :readonly="locked" placeholder="What did you work on today? Just jot it down; it saves automatically."
        @input="onInput" @blur="flush" />
    </section>
  </div>
</template>
```

- [ ] **Step 5: Run the flow tests to verify they pass**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(student): onboarding and autosaving daily notepad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Logbook builder

**Files:**
- Replace: `src/views/student/Builder.vue`
- Modify: `tests/e2e/flow.spec.ts` (add a test)

**Interfaces:**
- Consumes: `useStudent`, `autofill`, `dayDate`, `isCoverField`, `resolveValues`, `sourceValue`, `emptyRequired`, `isLocked`, `STATUS_TEXT`, `plain`, `debounce`, `TemplateOverlay` (fill mode), `StatusBadge`.
- Produces test IDs: `builder-period`, `field` (with `data-label`), `from-notepad`, `pull-again`, `submit-period`, `changes-banner`, `preview`.

- [ ] **Step 1: Add the failing e2e test to the end of `tests/e2e/flow.spec.ts`**

```ts
async function fieldValues() {
  return page.locator('[data-testid="field"] textarea').evaluateAll(els => els.map(e => (e as HTMLTextAreaElement).value));
}

test('student builds the period from the notepad with a live preview and submits it', async () => {
  await page.getByRole('link', { name: 'Logbook builder' }).click();
  await expect(page.getByTestId('field').first()).toBeVisible();
  expect(await fieldValues()).toContain(NOTE);
  await expect(page.getByTestId('from-notepad').first()).toBeVisible();
  await expect(page.getByTestId('preview')).toContainText('Configured the ERP gateway');

  // Typing into a period answer updates the preview immediately.
  const answer = page.locator('fieldset', { hasText: 'Period answers' }).locator('textarea').first();
  await answer.fill('I learned how the gateway routes requests.');
  await expect(page.getByTestId('preview')).toContainText('I learned how the gateway');

  await page.getByTestId('submit-period').click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Submitted');
  await expect(answer).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: the new test FAILS. `field` isn't found in the stub view.

- [ ] **Step 3: Write `src/views/student/Builder.vue`**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import type { PeriodFill, Placeholder } from '../../core/model';
import { autofill, dayDate, isCoverField, resolveValues, sourceValue } from '../../core/autofill';
import { emptyRequired, isLocked, STATUS_TEXT } from '../../core/workflow';
import { formatDMY, todayISO } from '../../core/dates';
import { plain } from '../../data/plain';
import { debounce } from '../../lib/debounce';
import { errorText } from '../../lib/errors';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import StatusBadge from '../../components/StatusBadge.vue';

const st = useStudent();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const today = todayISO();

const periodKey = computed(() => {
  const k = route.params.periodKey as string | undefined;
  if (k && st.periods.some(p => p.key === k)) return k;
  return (st.periods.find(p => today >= p.start && today <= p.end) ?? st.periods.find(p => st.statusOf(p.key) !== 'approved') ?? st.periods[0])?.key;
});
const period = computed(() => st.periods.find(p => p.key === periodKey.value));
const phs = computed(() => st.template?.placeholders ?? []);
const fill = ref<PeriodFill | null>(null);
const cover = ref<Record<string, string>>({});
const locked = computed(() => isLocked(fill.value ?? undefined));

const fillSaver = debounce(async () => {
  if (!fill.value || locked.value) return;
  try { await st.saveFill(plain(fill.value)); } catch (e) { toast.show(errorText(e), true); }
}, 500);
const coverSaver = debounce(async () => {
  try { await st.saveCover({ ...cover.value }); } catch (e) { toast.show(errorText(e), true); }
}, 500);
const flushAll = () => Promise.all([fillSaver.flush(), coverSaver.flush()]);

async function open() {
  const p = period.value;
  if (!p || !st.template || !st.student) { fill.value = null; return; }
  let f = plain(st.fillFor(p.key));
  if (f.status === 'draft') {
    const r = autofill(phs.value, p, st.notes, f.values, f.autofilled);
    if (JSON.stringify(r) !== JSON.stringify({ values: f.values, autofilled: f.autofilled })) {
      f = { ...f, ...r };
      try { await st.saveFill(f); } catch (e) { toast.show(errorText(e), true); }
    }
  }
  fill.value = f;
  cover.value = { ...st.student.coverValues };
}
watch(periodKey, async (_k, old) => { if (old) await flushAll(); await open(); }, { immediate: true });
onBeforeRouteLeave(async () => { await flushAll(); });
onBeforeUnmount(() => { void flushAll(); });

const approval = computed(() => (periodKey.value ? st.latest(periodKey.value, 'approve') : undefined));
const changesComment = computed(() => (fill.value?.status === 'changes_requested' && periodKey.value ? st.latest(periodKey.value, 'request_changes')?.comment : undefined));
const previewValues = computed(() => (fill.value ? resolveValues(phs.value, cover.value, fill.value.values, approval.value) : {}));

const groups = computed(() => {
  const own = (p: Placeholder) => !isCoverField(p);
  return [
    { title: 'Cover (shared by every period)', items: phs.value.filter(p => isCoverField(p) && p.binding !== 'signature') },
    { title: 'Days', items: phs.value.filter(p => own(p) && (p.binding === 'daily' || p.binding === 'date')).sort((a, b) => (a.dayIndex ?? -1) - (b.dayIndex ?? -1)) },
    { title: 'Period answers', items: phs.value.filter(p => own(p) && p.binding === 'period') },
    { title: 'Other', items: phs.value.filter(p => own(p) && p.binding === 'free') },
    { title: 'Filled by your supervisor', items: phs.value.filter(p => p.binding === 'signature') },
  ].filter(g => g.items.length);
});

const valueOf = (ph: Placeholder) => previewValues.value[ph.id] ?? '';
const editable = (ph: Placeholder) => ph.binding !== 'signature' && (isCoverField(ph) || !locked.value);
const multiline = (ph: Placeholder) => ph.binding === 'daily' || ph.binding === 'period' || ph.binding === 'free';
function labelFor(ph: Placeholder) {
  const p = period.value;
  if (!p || ph.dayIndex == null || isCoverField(ph)) return ph.label;
  const d = dayDate(ph, p);
  return d ? `${ph.label} (${formatDMY(d)})` : `${ph.label} (no day in this period)`;
}
function setValue(ph: Placeholder, v: string) {
  if (isCoverField(ph)) { cover.value = { ...cover.value, [ph.id]: v }; coverSaver.call(); }
  else if (fill.value) { fill.value.values[ph.id] = v; fillSaver.call(); }
}
function fromNotepad(ph: Placeholder) {
  const f = fill.value;
  return !!f && ph.binding === 'daily' && !!f.autofilled[ph.id] && (f.values[ph.id] ?? '') === f.autofilled[ph.id];
}
function drift(ph: Placeholder) {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || locked.value || ph.binding !== 'daily' || isCoverField(ph)) return false;
  const s = sourceValue(ph, p, st.notes);
  return s != null && s !== (f.autofilled[ph.id] ?? '');
}
function pullAgain(ph: Placeholder) {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || !confirm('Replace this field with the latest notepad text?')) return;
  const s = sourceValue(ph, p, st.notes) ?? '';
  f.values[ph.id] = s;
  f.autofilled[ph.id] = s;
  fillSaver.call();
}
async function submit() {
  const p = period.value;
  if (!p || !fill.value) return;
  await flushAll();
  const missing = emptyRequired(phs.value, previewValues.value);
  const msg = missing.length
    ? `${missing.length} field(s) are still empty:\n${missing.slice(0, 8).map(m => `• ${m.label}`).join('\n')}${missing.length > 8 ? '\n…' : ''}\n\nSubmit anyway?`
    : 'Send this period to your supervisor for review?';
  if (!confirm(msg)) return;
  try {
    await st.submit(p.key);
    fill.value = plain(st.fillFor(p.key));
    toast.show('Submitted for review');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
const goTo = (key: string) => router.push({ name: 'builder', params: { periodKey: key } });
</script>

<template>
  <section v-if="!period" class="card"><p>No periods yet. Check your internship dates under "My internship".</p></section>
  <section v-else>
    <div class="row card">
      <label class="inline">Period
        <select data-testid="builder-period" :value="periodKey" @change="goTo(($event.target as HTMLSelectElement).value)">
          <option v-for="p in st.periods" :key="p.key" :value="p.key">{{ p.label }} — {{ STATUS_TEXT[st.statusOf(p.key)] }}</option>
        </select>
      </label>
      <StatusBadge :status="fill?.status ?? 'draft'" />
      <span class="spacer" />
      <button type="button" class="primary" data-testid="submit-period" :disabled="locked" @click="submit">Submit for review</button>
    </div>
    <p v-if="changesComment" class="banner" data-testid="changes-banner">Your supervisor asked for changes: {{ changesComment }}</p>
    <p v-if="locked && fill" class="banner">This period is {{ STATUS_TEXT[fill.status].toLowerCase() }}, so it can't be edited.</p>
    <div class="builder-grid">
      <form class="card" @submit.prevent>
        <fieldset v-for="g in groups" :key="g.title">
          <legend>{{ g.title }}</legend>
          <div v-for="ph in g.items" :key="ph.id" class="field" data-testid="field" :data-label="ph.label">
            <label :for="`f-${ph.id}`">{{ labelFor(ph) }} <span v-if="fromNotepad(ph)" class="tag" data-testid="from-notepad">from notepad</span></label>
            <textarea v-if="multiline(ph)" :id="`f-${ph.id}`" rows="3" :value="valueOf(ph)" :disabled="!editable(ph)"
              @input="setValue(ph, ($event.target as HTMLTextAreaElement).value)" />
            <input v-else :id="`f-${ph.id}`" :value="valueOf(ph)" :disabled="!editable(ph)" @input="setValue(ph, ($event.target as HTMLInputElement).value)" />
            <button v-if="drift(ph)" type="button" class="link" data-testid="pull-again" @click="pullAgain(ph)">Notepad changed — pull again</button>
          </div>
        </fieldset>
      </form>
      <div class="preview" data-testid="preview">
        <TemplateOverlay v-if="st.template" :template="st.template" mode="fill" :values="previewValues" />
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run the flow tests**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(student): logbook builder with notepad autofill and live preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Supervisor review

**Files:**
- Replace: `src/views/supervisor/ReviewQueue.vue`, `src/views/supervisor/ReviewDetail.vue`
- Modify: `tests/e2e/flow.spec.ts` (add a test)

**Interfaces:**
- Consumes: `useReview` (`load`, `rows`, `queue`, `row`, `notesFor`, `approve`, `requestChanges`, `actions`), `latestAction`, `resolveValues`, `eachDay`, `formatDMY`, `TemplateOverlay`, `StatusBadge`.
- Produces test IDs: `queue-row`, `approve-name`, `approve-btn`, `changes-comment`, `changes-btn`, `history`.

- [ ] **Step 1: Add the failing e2e test to the end of `tests/e2e/flow.spec.ts`**

```ts
test('supervisor requests changes, student fixes and resubmits, supervisor approves', async () => {
  await asRole(page, 'Supervisor');
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByTestId('queue-row').first().click();
  await expect(page.getByTestId('preview')).toContainText('Configured the ERP gateway');
  await page.getByTestId('changes-comment').fill('Please describe the sandbox setup in more detail.');
  await page.getByTestId('changes-btn').click();
  await expect(page.getByTestId('history')).toContainText('Changes requested');

  await asRole(page, 'Aina Rahman');
  await page.getByRole('link', { name: 'Logbook builder' }).click();
  await expect(page.getByTestId('changes-banner')).toContainText('more detail');
  const values = await page.locator('[data-testid="field"] textarea').evaluateAll(els => els.map(e => (e as HTMLTextAreaElement).value));
  const i = values.indexOf(NOTE);
  await page.locator('[data-testid="field"] textarea').nth(i).fill(`${NOTE} Set up Docker and seeded test data.`);
  await page.getByTestId('submit-period').click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Submitted');

  await asRole(page, 'Supervisor');
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByTestId('queue-row').first().click();
  await page.getByTestId('approve-name').fill('Nur Aziz');
  await page.getByTestId('approve-btn').click();
  await expect(page.getByTestId('history')).toContainText('Approved');
  await expect(page.getByTestId('status-badge').first()).toHaveText('Approved');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: the new test FAILS. `queue-row` isn't found.

- [ ] **Step 3: Write `src/views/supervisor/ReviewQueue.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useReview } from '../../stores/review';
import { formatDMY } from '../../core/dates';
import StatusBadge from '../../components/StatusBadge.vue';

const rv = useReview();
const router = useRouter();
const tab = ref<'queue' | 'all'>('queue');
onMounted(() => rv.load());
const rows = computed(() => (tab.value === 'queue' ? rv.queue : rv.rows));
const open = (studentId: string, periodKey: string) => router.push({ name: 'review-detail', params: { studentId, periodKey } });
</script>

<template>
  <section class="card">
    <div class="row">
      <h1>Review</h1>
      <span class="spacer" />
      <div class="seg">
        <button type="button" :aria-pressed="tab === 'queue'" @click="tab = 'queue'">Waiting ({{ rv.queue.length }})</button>
        <button type="button" :aria-pressed="tab === 'all'" @click="tab = 'all'">All periods</button>
      </div>
    </div>
    <p v-if="!rows.length" class="muted">{{ tab === 'queue' ? 'Nothing is waiting for review.' : 'No students have set up their internship yet.' }}</p>
    <table v-else class="list">
      <thead><tr><th>Student</th><th>University</th><th>Period</th><th>Status</th><th>Submitted</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="`${r.student.id}|${r.period.key}`" class="click" data-testid="queue-row" @click="open(r.student.id, r.period.key)">
          <td>{{ r.student.name }}</td>
          <td>{{ r.template.university }}</td>
          <td>{{ r.period.label }}</td>
          <td><StatusBadge :status="r.status" /></td>
          <td>{{ r.fill?.submittedAt ? formatDMY(r.fill.submittedAt.slice(0, 10)) : '—' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

- [ ] **Step 4: Write `src/views/supervisor/ReviewDetail.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useReview } from '../../stores/review';
import { useToast } from '../../stores/toast';
import { latestAction } from '../../core/workflow';
import { resolveValues } from '../../core/autofill';
import { eachDay, formatDMY } from '../../core/dates';
import { errorText } from '../../lib/errors';
import TemplateOverlay from '../../components/overlay/TemplateOverlay.vue';
import StatusBadge from '../../components/StatusBadge.vue';

const route = useRoute();
const rv = useReview();
const toast = useToast();
const sid = route.params.studentId as string;
const key = route.params.periodKey as string;
const notes = ref<Record<string, string>>({});
const signature = ref('');
const comment = ref('');

onMounted(async () => {
  await rv.load();
  notes.value = await rv.notesFor(sid);
});

const row = computed(() => rv.row(sid, key));
const history = computed(() => rv.actions.filter(a => a.studentId === sid && a.periodKey === key).sort((a, b) => a.at.localeCompare(b.at)));
const approval = computed(() => latestAction(rv.actions, sid, key, 'approve'));
const values = computed(() => (row.value ? resolveValues(row.value.template.placeholders, row.value.student.coverValues, row.value.fill?.values ?? {}, approval.value) : {}));
const days = computed(() => (row.value ? eachDay(row.value.period.start, row.value.period.end) : []));
const ACTION_TEXT = { submit: 'Submitted', approve: 'Approved', request_changes: 'Changes requested' } as const;

async function approve() {
  try { await rv.approve(sid, key, signature.value); toast.show('Approved and signed'); } catch (e) { toast.show(errorText(e), true); }
}
async function requestChanges() {
  try { await rv.requestChanges(sid, key, comment.value); comment.value = ''; toast.show('Sent back to the student'); } catch (e) { toast.show(errorText(e), true); }
}
</script>

<template>
  <section v-if="!row" class="card"><p class="muted">Loading…</p></section>
  <section v-else>
    <div class="row card">
      <RouterLink to="/supervisor/review">← Review</RouterLink>
      <h1 style="margin: 0">{{ row.student.name }} · {{ row.period.label }}</h1>
      <StatusBadge :status="row.status" />
    </div>
    <div class="review-grid">
      <div class="preview" data-testid="preview">
        <TemplateOverlay :template="row.template" mode="fill" :values="values" />
      </div>
      <aside class="side">
        <div v-if="row.status === 'submitted'" class="card">
          <h2>Approve</h2>
          <label>Type your full name to sign <input v-model="signature" data-testid="approve-name" /></label>
          <button type="button" class="primary" data-testid="approve-btn" @click="approve">Approve</button>
          <h2 style="margin-top: 16px">Request changes</h2>
          <label>What needs to change? <textarea v-model="comment" data-testid="changes-comment" rows="3" /></label>
          <button type="button" data-testid="changes-btn" @click="requestChanges">Send back</button>
        </div>
        <div class="card">
          <h2>Notepad for these days</h2>
          <ul class="plain-list">
            <li v-for="d in days" :key="d"><strong>{{ formatDMY(d) }}</strong><br /><span :class="{ muted: !notes[d] }">{{ notes[d] || 'No notes' }}</span></li>
          </ul>
        </div>
        <div class="card" data-testid="history">
          <h2>History</h2>
          <ul class="plain-list">
            <li v-for="a in history" :key="a.id">
              {{ ACTION_TEXT[a.action] }} by {{ a.signature ?? a.by }} · {{ new Date(a.at).toLocaleString() }}
              <div v-if="a.comment" class="muted">“{{ a.comment }}”</div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>
```

- [ ] **Step 5: Run the flow tests**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(supervisor): review queue with approve and request-changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Export

**Files:**
- Replace: `src/views/student/Export.vue`
- Modify: `tests/e2e/flow.spec.ts` (add a test)

**Interfaces:**
- Consumes: `useStudent`, `resolveValues`, `fillDocx`, `fillPdf`, `downloadBytes`, `safeFileName`, `StatusBadge`.
- Produces test IDs: `approved-note`, `export-period` (checkbox), `export-btn`.

- [ ] **Step 1: Add the failing e2e test to the end of `tests/e2e/flow.spec.ts`**

```ts
test('student exports the approved period as a filled PDF', async () => {
  await asRole(page, 'Aina Rahman');
  await page.getByRole('link', { name: 'Export' }).click();
  await expect(page.getByTestId('approved-note')).toContainText('1 of');
  await expect(page.getByTestId('export-btn')).toBeDisabled();
  await page.locator('[data-testid="export-period"]:not([disabled])').first().check();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-btn').click()]);
  expect(download.suggestedFilename()).toBe('Prince_Mohammad_Bin_Fahd_University_Aina_Rahman_logbook.pdf');
  const text = await pdfWords(new Uint8Array(readFileSync((await download.path())!)));
  expect(text).toContain('Configured the ERP gateway');
  expect(text).toContain('Nur Aziz');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: the new test FAILS. `approved-note` isn't found.

- [ ] **Step 3: Write `src/views/student/Export.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStudent } from '../../stores/student';
import { useToast } from '../../stores/toast';
import { resolveValues } from '../../core/autofill';
import { fillDocx } from '../../core/fill/docx';
import { fillPdf } from '../../core/fill/pdf';
import { downloadBytes, safeFileName } from '../../lib/download';
import { errorText } from '../../lib/errors';
import StatusBadge from '../../components/StatusBadge.vue';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const st = useStudent();
const toast = useToast();
const selected = ref<string[]>([]);
const busy = ref(false);

const approved = computed(() => st.periods.filter(p => st.statusOf(p.key) === 'approved'));
const chosen = computed(() => approved.value.filter(p => selected.value.includes(p.key)));
const toggle = (key: string) => {
  selected.value = selected.value.includes(key) ? selected.value.filter(k => k !== key) : [...selected.value, key];
};
const selectAll = () => { selected.value = approved.value.map(p => p.key); };

async function doExport() {
  const t = st.template;
  const s = st.student;
  if (!t || !s || !chosen.value.length) return;
  busy.value = true;
  try {
    const periods = chosen.value.map(p => ({
      label: p.label,
      values: resolveValues(t.placeholders, s.coverValues, st.fillFor(p.key).values, st.latest(p.key, 'approve')),
    }));
    // The cover is filled once. Its signature comes from the latest selected approval.
    const cover = resolveValues(t.placeholders, s.coverValues, {}, st.latest(chosen.value[chosen.value.length - 1].key, 'approve'));
    const name = `${safeFileName(t.university, s.name)}_logbook.${t.format}`;
    if (t.format === 'docx') downloadBytes(name, await fillDocx(t.fileBytes, t, cover, periods.map(p => p.values)), DOCX_MIME);
    else downloadBytes(name, await fillPdf({ templateBytes: new Uint8Array(t.fileBytes), template: t, cover, periods }), 'application/pdf');
    toast.show('Logbook downloaded');
  } catch (e) {
    toast.show(errorText(e), true);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="card" style="max-width: 760px">
    <h1>Export logbook</h1>
    <p class="muted" data-testid="approved-note">{{ approved.length }} of {{ st.periods.length }} periods approved. Only approved periods can be exported.</p>
    <ul class="plain-list">
      <li v-for="p in st.periods" :key="p.key">
        <label class="check">
          <input type="checkbox" data-testid="export-period" :disabled="st.statusOf(p.key) !== 'approved'" :checked="selected.includes(p.key)" @change="toggle(p.key)" />
          {{ p.label }} <StatusBadge :status="st.statusOf(p.key)" />
        </label>
      </li>
    </ul>
    <div class="row" style="margin-top: 12px">
      <button type="button" class="link" :disabled="!approved.length" @click="selectAll">Select all approved</button>
      <span class="spacer" />
      <button type="button" class="primary" data-testid="export-btn" :disabled="busy || !chosen.length" @click="doExport">
        {{ busy ? 'Building file…' : `Download .${st.template?.format ?? ''}` }}
      </button>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run the full e2e suite**

Run: `npm run e2e`
Expected: PASS. That's every spec: smoke (1), template-pdf (1), template-docx (1) and flow (5).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(student): export approved periods in the template's format

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: README, project notes and XAMPP build check

**Files:**
- Create: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs a new developer can follow, and a verified build served by XAMPP.

- [ ] **Step 1: Write `README.md`**

````markdown
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

## Tests

```bash
npm test
```
Unit tests (Vitest) cover detection, fill, periods, autofill, workflow, storage and stores.

```bash
npx playwright install chromium
npm run e2e
```
Browser tests (Playwright) run the full supervisor → student → review → export flow.

## Where things are

- `src/core/`: pure logic (detection, fill, periods, autofill, workflow). It has no Vue and no storage, so it can move server-side.
- `src/data/`: the `Repository` interface plus its IndexedDB implementation. Swap this for REST calls when this moves into the ERP gateway.
- `src/stores/`, `src/views/`, `src/components/`: the Vue UI.
- Design spec: `docs/superpowers/specs/2026-09-25-intern-logbook-prototype-design.md`
````

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
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
```

- [ ] **Step 3: Run the full verification**

Run: `npm test`
Expected: all unit tests pass.

Run: `npm run e2e`
Expected: all browser tests pass.

Run: `npm run build`
Expected: the build succeeds, and `ls C:/xampp/htdocs/intern-logbook` shows `index.html` and `assets/`.

Manual check: start Apache from the XAMPP control panel, open http://localhost/intern-logbook/, and confirm the Templates page loads with no console errors.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: README and project notes for the prototype

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
