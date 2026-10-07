# Logbook from your records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logbook interns get a Logbook list of weeks; each week's boxes fill from accepted Activities and Learning; sent-back weeks keep and show the original submission; supervisors see what changed on a resubmit.

**Architecture:** The pure helpers in `src/core/autofill.ts` and `src/core/workflow.ts` gain the filling rules, the box tags, the week counts and `changedSince`. Each submit action carries a copy of the answers it sent: `ReviewAction.values` in the browser, and `history[].values` from the server's existing `submissions` rows. The builder becomes the week page at `/logbook/:periodKey`, under a new list page at `/logbook`.

**Tech Stack:** Vue 3, Pinia, vue-router (hash), idb, Vitest, Playwright; Laravel 12 on PHP 8.4, Pint, PHPStan, OpenApiTest.

**Spec:** `docs/superpowers/specs/2026-10-07-logbook-from-records-design.md`

## Global Constraints

- Logbook interns only. Journal-only interns and supervisors don't get the Logbook list or week page; supervisors only gain the "Changed" card on their review page.
- **Filling rules:**
  - A weekly box is `learning` when its label matches `/learn|knowledge|skill|lesson/i`; otherwise it is `activity`.
  - Weekly boxes fill from the week's accepted items on the period's workdays, in date order, falling back to the journal bullets.
  - The Skills line is `Skills: A, B`, de-duplicated ignoring case, keeping the first spelling.
- **Unchanged:** only a draft fills itself; the intern's edits are never overwritten; a sent-back week keeps its submitted answers.
- **Copy:**
  - `Starts 12 Oct`
  - `Continue` / `Revise` / `View`
  - `From N accepted activities` (`activity` when N is 1), `From N learning points` (`point` when N is 1); `From accepted skills` when there are no learning points; `From journal`; `Edited by you`
  - `Not submitted yet.`
  - `Resubmitted`
  - `Your submitted version · 9 Oct`
  - `Your original submission stays as it was. Your supervisor gets this revision when you resubmit.`
  - `Changed since the last submission`, `Resubmitted with no changes.`, `Before`, `Now`
- **Test ids:**
  - list: `week-row`, `week-sources`, `week-open`, `week-upcoming`
  - week page: `logbook-back`, `week-title`, `history`, `submitted-version`, `revision-note`
  - supervisor: `changes`, `changed-box`
  - unchanged: `from-notepad` stays on the "From …" tags; `field`, `submit-period`, `confirm-submit`, `pull-all`, `pull-again`, `changes-banner`
- **Commands:**
  - Never run `npm run build`. Type-check with `npx vue-tsc --noEmit`; check a build with `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
  - Server tests:

    ```bash
    cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app/appv3/backend && OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test
    ```

    The output is JSON; grep `"result"`.
  - Lint the server with `C:/Users/User/php84/php.exe vendor/bin/pint --test` and `C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --no-progress --memory-limit=1G`.
- **Branches:**
  - Server repo: `logbook-history-api`, cut from `master`.
  - Prototype: `logbook-records`, which already exists with the spec.
- **Editing:** use the Edit tool, not heredocs or sed, for text containing `\n` or `\\`.

## Review Focus

1. **A week with accepted skills but no learning points.** The learning box shows only the `Skills: …` line, and its tag reads "From accepted skills". Tested in Task 2.
2. **Waiting or rejected items** must never reach a box or the counts. Tested in Task 2.
3. **A resubmit where the intern changed nothing** shows "Resubmitted with no changes.", not an empty card. Tested in Task 3 (`changedSince` returns `[]`) and wired in Task 6.
4. **An old server submission whose body isn't a map** (or is empty) gives `values: {}`, and then the page shows no panel or card rather than crashing. Tested in Task 1, and the page guards in Tasks 5 and 6.
5. **Opening `/student/builder` or an unknown week key** lands on the Logbook or the current week, never a blank page. Tested in Task 4.

---

### Task 1: Each submit in the history carries its answers (server)

**Files:**
- Modify:
  - `rizurf-logbook-app/appv3/backend/app/Http/Resources/PortalResources.php` (`history`)
  - `appv3/backend/resources/openapi.json` (four `"history",` outputs)
  - `appv3/backend/tests/Feature/ReviewTest.php` (two tests)

**Interfaces:**
- Produces: every `history[]` line with `action: 'submit'` gains `values: object` (the answers sent, as strings; `{}` when the stored body isn't a JSON object).

- [ ] **Step 1: Branch**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git switch master && git pull --ff-only && git switch -c logbook-history-api
```

- [ ] **Step 2: Write the failing tests** (append inside `ReviewTest`, before the closing brace; add `use Illuminate\Support\Facades\DB;` at the top)

```php
    public function test_each_submit_in_the_history_carries_the_answers_it_sent(): void
    {
        $this->studentSubmit(4, 'First go.');
        $this->supervisorReview('student-1', 4, ['decision' => 'request_changes', 'feedback' => 'Add examples.'], [
            'Idempotency-Key' => $this->idemKey(),
        ])->assertOk();
        $this->studentSubmit(4, 'Second go, with examples.');

        $sent = fn (array $history): array => array_map(
            fn (array $h) => $h['values']['summary'] ?? null,
            array_values(array_filter($history, fn (array $h) => $h['action'] === 'submit')),
        );

        $this->be($this->user('student-1'));
        $this->assertSame(['First go.', 'Second go, with examples.'], $sent($this->portal('GET', '/api/v1/me/journal/weeks/4')->assertOk()->json('history')));

        $this->be($this->user('supervisor-1'));
        $week = collect($this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()->json('weeks'))->firstWhere('weekNumber', 4);
        $this->assertSame(['First go.', 'Second go, with examples.'], $sent($week['history']));
    }

    public function test_a_stored_submission_that_is_not_a_map_gives_empty_values(): void
    {
        $this->studentSubmit(4, 'First go.');
        DB::table('submissions')->update(['submitted_body' => '"just text"']);

        $this->be($this->user('student-1'));
        $history = $this->portal('GET', '/api/v1/me/journal/weeks/4')->assertOk();
        $history->assertJsonPath('history.0.action', 'submit');
        $this->assertSame('{}', json_encode($history->json('history.0.values'), JSON_FORCE_OBJECT));
        $this->assertStringContainsString('"values":{}', (string) $history->getContent());
    }
```

- [ ] **Step 3: Run them to verify they fail**

Run: the server test command with `--filter="each_submit_in_the_history|not_a_map"`
Expected: FAIL. `values` is missing (`Undefined array key "values"`, or the null-filled array doesn't match).

- [ ] **Step 4: Implement** in `PortalResources::history`

Change the docblock's `@return array<int, array<string, string>>` to `@return array<int, array<string, mixed>>`. Then replace the `$submits` map with:

```php
        $submits = $week->submissions->map(function (Submission $submission): array {
            $body = json_decode((string) $submission->submitted_body, true);

            return [
                'id' => "s{$submission->id}",
                'action' => 'submit',
                'by' => $submission->submitter->name ?? $submission->submitted_by,
                'at' => (string) $submission->created_at?->toJSON(),
                // A copy of the answers this submit sent (an empty object for bodies stored before answers were a map).
                'values' => is_array($body) && $body !== [] && ! array_is_list($body)
                    ? array_map(fn (mixed $v): string => is_string($v) ? $v : '', $body)
                    : (object) [],
            ];
        });
```

If PHPStan or a caller complains about the widened return type, follow the type through: the callers only embed it in JSON.

- [ ] **Step 5: Document it**

In `resources/openapi.json`, each of the four output lists that holds `"history",` gains `"history[].values",` right after it. Use the Edit tool on each occurrence; they sit near lines 644, 760, 972 and 1038.

- [ ] **Step 6: Run the server suite and lint**

Run: the server test command (whole suite), then Pint `--test` and PHPStan.
Expected: all pass; Pint clean; PHPStan no errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git add -A appv3/backend && git commit -m "feat(api): each submit in a week's history carries the answers it sent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Filling rules, box tags and week counts (prototype core)

**Files:**
- Modify:
  - `intern-logbook/src/core/autofill.ts`
  - `tests/unit/autofill.test.ts`

**Interfaces:**
- Consumes: `Org` from `src/core/records.ts`, `nameKey` from `src/core/organize.ts`.
- Produces (in `autofill.ts`):
  - `boxKind(ph: Placeholder): 'activity' | 'learning'`
  - `sourceValue(ph, period, notes, org?: Org): string | null`: with `org`, weekly boxes follow the table; without it, unchanged.
  - `autofill(placeholders, period, notes, values, autofilled, org?: Org)`: passes `org` to `sourceValue`.
  - `type BoxSource = { from: 'activity' | 'learning' | 'journal'; count: number }` and `boxSource(ph, period, org: Org): BoxSource | null`. It is `null` for anything but non-cover `daily`/`period` boxes. Daily boxes give `{ from: 'journal', count: 0 }`.
  - `weekSources(period, notes, org): { days: number; activities: number; learning: number }`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/autofill.test.ts`; widen its import to `import { autofill, boxKind, boxSource, dayDate, resolveValues, signatureValue, sourceValue, weekSources } from '../../src/core/autofill';` and add `import type { Item } from '../../src/core/model';`)

```ts
describe('filling from accepted items', () => {
  let n = 0;
  const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `i${++n}`, kind, text, status });
  const typeBox = ph('t', { binding: 'period', label: 'Type (s) & Objective(s) of the Activities' });
  const contentBox = ph('c', { binding: 'period', label: 'Content: describe the technical and non-technical knowledge, skills, and experiences developed' });
  const org = {
    '2026-09-23': { projectId: null, items: [item('activity', 'Built the login page'), item('skill', 'Unit testing'), item('learning', 'CSRF tokens'), item('activity', 'Waiting', 'suggested')] },
    '2026-09-24': { projectId: null, items: [item('activity', 'Fixed a redirect bug'), item('skill', 'unit TESTING'), item('skill', 'API design'), item('learning', 'Rejected', 'rejected')] },
    '2026-10-01': { projectId: null, items: [item('activity', 'Next week')] },
  };

  it('tells learning boxes from activity boxes by their label', () => {
    expect(boxKind(typeBox)).toBe('activity');
    expect(boxKind(contentBox)).toBe('learning');
    expect(boxKind(ph('x', { binding: 'period', label: 'Lessons this week' }))).toBe('learning');
  });
  it('fills activity boxes with the week\'s accepted activities, in date order', () => {
    expect(sourceValue(typeBox, week1, notes, org)).toBe('• Built the login page\n• Fixed a redirect bug');
  });
  it('fills learning boxes with learning points, then the skills once each', () => {
    expect(sourceValue(contentBox, week1, notes, org)).toBe('• CSRF tokens\nSkills: Unit testing, API design');
  });
  it('a learning box with only skills shows just the Skills line', () => {
    const skillsOnly = { '2026-09-23': { projectId: null, items: [item('skill', 'Data modelling')] } };
    expect(sourceValue(contentBox, week1, notes, skillsOnly)).toBe('Skills: Data modelling');
    expect(boxSource(contentBox, week1, skillsOnly)).toEqual({ from: 'learning', count: 0 });
  });
  it('falls back to the journal when the week has none of that kind, and without org behaves as before', () => {
    const journalOnly = sourceValue(typeBox, week1, notes);
    expect(sourceValue(typeBox, week1, notes, {})).toBe(journalOnly);
    expect(journalOnly).toContain('Wed notes');
    expect(boxSource(typeBox, week1, {})).toEqual({ from: 'journal', count: 0 });
  });
  it('tags each box with where its text came from', () => {
    expect(boxSource(typeBox, week1, org)).toEqual({ from: 'activity', count: 2 });
    expect(boxSource(contentBox, week1, org)).toEqual({ from: 'learning', count: 1 });
    expect(boxSource(ph('d', { binding: 'daily', dayIndex: 0 }), week1, org)).toEqual({ from: 'journal', count: 0 });
    expect(boxSource(ph('x', { binding: 'date', dateRole: 'start' }), week1, org)).toBeNull();
  });
  it('autofill uses accepted items and still keeps the intern\'s edits', () => {
    const first = autofill([typeBox], week1, notes, {}, {}, org);
    expect(first.values.t).toBe('• Built the login page\n• Fixed a redirect bug');
    const edited = { ...first.values, t: 'My own words' };
    expect(autofill([typeBox], week1, notes, edited, first.autofilled, {}).values.t).toBe('My own words');
  });
  it('counts the week\'s sources: days written, accepted activities and learning', () => {
    expect(weekSources(week1, notes, org)).toEqual({ days: 2, activities: 2, learning: 1 });
    expect(weekSources(week1, {}, {})).toEqual({ days: 0, activities: 0, learning: 0 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/autofill.test.ts`
Expected: FAIL. `boxKind` is not exported.

- [ ] **Step 3: Implement** in `src/core/autofill.ts`

Add the imports:

```ts
import type { Org } from './records';
import { nameKey } from './organize';
```

Add, above `sourceValue`:

```ts
/** A weekly answer box asks about learning when its label says so; every other weekly box gets activities. */
export const boxKind = (ph: Placeholder): 'activity' | 'learning' => (/learn|knowledge|skill|lesson/i.test(ph.label) ? 'learning' : 'activity');

/** The week's accepted items on its workdays, in date order; skills once each (ignoring case, first spelling kept). */
function weekItems(period: Period, org: Org) {
  const accepted = period.workdays.flatMap(d => (org[d]?.items ?? []).filter(i => i.status === 'accepted'));
  const texts = (kind: string) => accepted.filter(i => i.kind === kind).map(i => i.text.trim()).filter(Boolean);
  const skills: string[] = [];
  for (const s of texts('skill')) if (!skills.some(x => nameKey(x) === nameKey(s))) skills.push(s);
  return { activities: texts('activity'), learning: texts('learning'), skills };
}

/** The weekly box's text from accepted items, or null when the week has none of the kind it needs. */
function fromItems(ph: Placeholder, period: Period, org: Org): string | null {
  const w = weekItems(period, org);
  if (boxKind(ph) === 'activity') return w.activities.length ? w.activities.map(t => `• ${t}`).join('\n') : null;
  if (!w.learning.length && !w.skills.length) return null;
  return [...w.learning.map(t => `• ${t}`), ...(w.skills.length ? [`Skills: ${w.skills.join(', ')}`] : [])].join('\n');
}

export type BoxSource = { from: 'activity' | 'learning' | 'journal'; count: number };

/** Where a day or weekly box's autofilled text comes from (for its tag); null for boxes that aren't filled from records. */
export function boxSource(ph: Placeholder, period: Period, org: Org): BoxSource | null {
  if (isCoverField(ph)) return null;
  if (ph.binding === 'daily') return { from: 'journal', count: 0 };
  if (ph.binding !== 'period') return null;
  if (fromItems(ph, period, org) == null) return { from: 'journal', count: 0 };
  const w = weekItems(period, org);
  return boxKind(ph) === 'activity' ? { from: 'activity', count: w.activities.length } : { from: 'learning', count: w.learning.length };
}

/** The Logbook list's sources for one week. */
export function weekSources(period: Period, notes: Record<string, string>, org: Org): { days: number; activities: number; learning: number } {
  const w = weekItems(period, org);
  return { days: period.workdays.filter(d => notes[d]?.trim()).length, activities: w.activities.length, learning: w.learning.length };
}
```

Change `sourceValue`'s signature to `(ph: Placeholder, period: Period, notes: Record<string, string>, org?: Org)`. Make the first line of its `period` branch:

```ts
    const items = org ? fromItems(ph, period, org) : null;
    if (items != null) return items;
```

before the existing journal-bullets `return`. Change `autofill`'s signature to add a last parameter `org?: Org`, and its call to `sourceValue(ph, period, notes, org)`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/unit/autofill.test.ts`, then `npx vue-tsc --noEmit`
Expected: PASS; vue-tsc clean. Existing callers don't pass `org` yet, which is valid.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/core/autofill.ts tests/unit/autofill.test.ts && git commit -m "feat: weekly boxes fill from accepted activities and learning; box tags and week counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Submits keep a copy; `changedSince`; the server's copies reach the browser (prototype)

**Files:**
- Modify:
  - `src/core/model.ts` (`ReviewAction.values?`)
  - `src/core/workflow.ts` (`submitFill` copies; `changedSince`)
  - `src/data/http.ts` (`ApiWeek.history[].values`, `listActions` mapping)
  - `tests/unit/workflow.test.ts`
  - `tests/unit/http.test.ts`

**Interfaces:**
- Produces:
  - `ReviewAction.values?: Record<string, string>`, set on submit actions.
  - `changedSince(before: Record<string, string>, now: Record<string, string>, placeholders: Placeholder[]): Placeholder[]`
  - `sentCopy(a?: ReviewAction): Record<string, string> | null` — a submit's copy, null when missing or empty

- [ ] **Step 1: Write the failing tests**

In `tests/unit/workflow.test.ts`, extend the import with `changedSince`, and the type import (add one if missing) with `Placeholder`. Add these inside `describe('workflow', ...)`:

```ts
  it('a submit keeps a copy of the answers it sent', () => {
    const fill = { ...emptyFill('s1', 'k', 'tpl'), values: { a: 'Built it' } };
    const { action } = submitFill(fill, 'A', now);
    expect(action.values).toEqual({ a: 'Built it' });
    fill.values.a = 'changed later';
    expect(action.values).toEqual({ a: 'Built it' }); // a copy, not the same object
  });
  it('lists the boxes whose answers changed, ignoring cover fields, signatures and outer spaces', () => {
    const anchor = { kind: 'pdf' as const, page: 0, x: 0, y: 0, w: 1, h: 1 };
    const p = (id: string, extra: Partial<Placeholder> = {}): Placeholder => ({ id, label: id.toUpperCase(), binding: 'period', source: 'label', region: 'unit', anchor, ...extra });
    const phs = [p('a'), p('b'), p('c'), p('name', { binding: 'cover', region: 'cover' }), p('sig', { binding: 'signature' })];
    expect(changedSince({ a: 'x', b: 'same ', name: 'N' }, { a: 'y', b: 'same', c: 'new', name: 'M', sig: 'S' }, phs).map(x => x.id)).toEqual(['a', 'c']);
    expect(changedSince({ a: 'x' }, { a: 'x' }, phs)).toEqual([]);
  });
```

In `tests/unit/http.test.ts`, in the first test, change the first history entry of the `week(1, {...})` fixture to:

```ts
          { id: 's1', action: 'submit', by: 'Aisha Rahman', at: '2026-09-19T02:00:00.000000Z', values: { a: 'x' } },
```

and the first expected `listActions` row to:

```ts
      { id: 's1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'submit', by: 'Aisha Rahman', at: '2026-09-19T02:00:00.000000Z', values: { a: 'x' } },
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/workflow.test.ts tests/unit/http.test.ts`
Expected: FAIL. `action.values` is undefined, `changedSince` isn't exported, and the HTTP row lacks `values`. vue-tsc would also flag `values` on the fixture.

- [ ] **Step 3: Implement**

`src/core/model.ts`, inside `ReviewAction`, after `comment?: string;`:

```ts
  /** Submit actions only: a copy of the answers sent (cover fields live on the student). */
  values?: Record<string, string>;
```

`src/core/workflow.ts`:
- In `submitFill`, change the action to `action(fill, 'submit', by, at, { values: { ...fill.values } })`.
- Add at the end, and add `isCoverField` to the imports: `import { isCoverField } from './autofill';`

```ts
/** The boxes a resubmit changed: non-cover, non-signature answers whose trimmed text differs (missing counts as empty). */
export function changedSince(before: Record<string, string>, now: Record<string, string>, placeholders: Placeholder[]): Placeholder[] {
  return placeholders.filter(p => !isCoverField(p) && p.binding !== 'signature' && (before[p.id] ?? '').trim() !== (now[p.id] ?? '').trim());
}
```

This import adds no cycle: `autofill.ts` never imports `workflow.ts`.

Also add, next to `changedSince`, the guard that every page uses:

```ts
/** A submit's copy, or null when it has none (demo weeks from before copies, or an old server body that gave {}). */
export const sentCopy = (a?: ReviewAction): Record<string, string> | null => (a?.values && Object.keys(a.values).length ? a.values : null);
```

Add to the workflow test, inside the `describe`:

```ts
  it('treats a missing or empty copy as no copy', () => {
    expect(sentCopy(undefined)).toBeNull();
    expect(sentCopy({ id: 'x', studentId: 's', periodKey: 'k', action: 'submit', by: 'A', at: '', values: {} })).toBeNull();
    expect(sentCopy({ id: 'x', studentId: 's', periodKey: 'k', action: 'submit', by: 'A', at: '', values: { a: 'x' } })).toEqual({ a: 'x' });
  });
```

and `sentCopy` to its import.

`src/data/http.ts`:
- In `ApiWeek.history`'s element type, add `values?: Record<string, string>;`.
- In `listActions`, after `...(h.comment ? { comment: h.comment } : {}),`, add `...(h.values ? { values: h.values } : {}),`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run` then `npx vue-tsc --noEmit`
Expected: all unit tests pass; vue-tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/core/model.ts src/core/workflow.ts src/data/http.ts tests/unit/workflow.test.ts tests/unit/http.test.ts && git commit -m "feat: each submit keeps a copy of its answers; changedSince lists edited boxes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Logbook list and its routes (prototype)

**Files:**
- Create:
  - `intern-logbook/src/views/student/Logbook.vue`
  - `intern-logbook/tests/e2e/logbook.spec.ts`
- Modify:
  - `src/router.ts`
  - `src/App.vue`
  - `tests/e2e/helpers.ts` (`openWeek`)
  - existing e2e specs that use `nav(page, 'Logbook builder')` or the `builder-period` dropdown: `flow.spec.ts`, `internship.spec.ts`, `journal.spec.ts`, `builder-cover-race.spec.ts`

**Interfaces:**
- Consumes: `weekSources` (Task 2), and the student store's `periods`, `statusOf` and `template`.
- Produces:
  - Routes `/logbook` (name `logbook`) and `/logbook/:periodKey` (name `builder`, so existing `{ name: 'builder', params: { periodKey } }` links keep working).
  - `/student/builder/:periodKey?` redirects to `/logbook/:periodKey`, or to `/logbook` without a key.
  - e2e helper `openWeek(page, link = 'Continue')`: goes to Logbook and clicks the first `week-open` link with that text.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/logbook.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { asRole, nav } from './helpers';

async function demoAs(page: import('@playwright/test').Page, who: string) {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await asRole(page, who);
}

test('the Logbook lists every week with its sources, status and next step', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Logbook');
  const rows = page.getByTestId('week-row');
  await expect(rows.first()).toBeVisible();
  // Newest first: the internship runs ~12 weeks, so the top rows haven't started yet.
  await expect(rows.first().getByTestId('week-upcoming')).toContainText('Starts ');
  await expect(rows.first().getByTestId('week-open')).toHaveCount(0);
  const week1 = rows.filter({ hasText: 'Week 1 ' });
  await expect(week1.getByTestId('week-sources')).toHaveText(/^5 days · \d+ activities · \d+ learning$/);
  await expect(week1.getByTestId('status-badge')).toHaveText('Approved');
  await expect(week1.getByTestId('week-open')).toHaveText('View');
  await expect(rows.filter({ hasText: 'Week 2 ' }).getByTestId('week-open')).toHaveText('Revise');
  await rows.filter({ hasText: 'Week 2 ' }).getByTestId('week-open').click();
  await expect(page).toHaveURL(/#\/logbook\/w:/);
});

test('old builder addresses and unknown weeks still land somewhere sensible', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await page.evaluate(() => { location.hash = '#/student/builder'; });
  await expect(page).toHaveURL(/#\/logbook$/);
  await page.evaluate(() => { location.hash = '#/logbook/w:1999-01-04'; });
  await expect(page.getByTestId('field').first()).toBeVisible(); // the builder falls back to the current week
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/logbook.spec.ts --reporter=line`
Expected: FAIL. There is no `Logbook` link (the nav regex `^Logbook(\s|$)` doesn't match "Logbook builder").

- [ ] **Step 3: Routes** in `src/router.ts`

Replace the builder route line with:

```ts
    { path: '/student/builder/:periodKey?', redirect: to => (to.params.periodKey ? `/logbook/${String(to.params.periodKey)}` : '/logbook') },
    { path: '/logbook', name: 'logbook', component: () => import('./views/student/Logbook.vue') },
    { path: '/logbook/:periodKey', name: 'builder', component: () => import('./views/student/Builder.vue') },
```

In the guard, the logbook pages are intern pages. Replace the line `if (!writing && !to.path.startsWith('/student')) return true;` with:

```ts
  const internPage = to.path.startsWith('/student') || to.path.startsWith('/logbook');
  if (!writing && !internPage) return true;
```

Journal-only interns are already sent to Overview for anything outside their list, and supervisors to `/`, because neither rule allows `/logbook`.

- [ ] **Step 4: Sidebar** in `src/App.vue`

Replace `{ to: '/student/builder', label: 'Logbook builder', icon: 'builder' },` with `{ to: '/logbook', label: 'Logbook', icon: 'builder' },`.

- [ ] **Step 5: Write `src/views/student/Logbook.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { weekSources } from '../../core/autofill';
import { shortDate } from '../../core/records';
import { todayISO } from '../../core/dates';
import type { PeriodStatus } from '../../core/model';
import StatusBadge from '../../components/StatusBadge.vue';

/** Every week of the internship, newest first, with what it's built from and what to do next. */
const st = useStudent();
const journal = useJournal();
const today = todayISO();
const NEXT: Record<PeriodStatus, string> = { draft: 'Continue', changes_requested: 'Revise', submitted: 'View', approved: 'View' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rows = computed(() => [...st.periods].reverse().map(p => {
  const s = weekSources(p, journal.entries, journal.org);
  return {
    p,
    dates: p.start === p.end ? shortDate(p.start) : `${shortDate(p.start)} – ${shortDate(p.end)}`,
    sources: `${plural(s.days, 'day', 'days')} · ${plural(s.activities, 'activity', 'activities')} · ${s.learning} learning`,
    status: st.statusOf(p.key),
    upcoming: p.start > today,
  };
}));
</script>

<template>
  <h1>Logbook</h1>
  <p v-if="st.template" class="muted">{{ st.template.university }}</p>
  <div class="card table-card">
    <table class="logbook-table">
      <thead><tr><th>Week</th><th>Sources</th><th>Status</th><th /></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.p.key" data-testid="week-row">
          <td><strong>Week {{ r.p.index }}</strong> <span class="muted">{{ r.dates }}</span></td>
          <td data-testid="week-sources">{{ r.sources }}</td>
          <td><StatusBadge :status="r.status" /></td>
          <td>
            <span v-if="r.upcoming" class="muted" data-testid="week-upcoming">Starts {{ shortDate(r.p.start) }}</span>
            <RouterLink v-else :to="{ name: 'builder', params: { periodKey: r.p.key } }" data-testid="week-open">{{ NEXT[r.status] }}</RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

Append to `src/styles.css`:

```css
.table-card { padding: 0; overflow-x: auto; }
.logbook-table { width: 100%; border-collapse: collapse; }
.logbook-table th, .logbook-table td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.logbook-table tr:last-child td { border-bottom: none; }
```

- [ ] **Step 6: Builder fallback for an unknown key**

`Builder.vue`'s `periodKey` computed already falls back to the current week when the key isn't one of the periods. Leave it. The route param is now required, so no other change is needed.

- [ ] **Step 7: Update the existing e2e navigation**

Add to `tests/e2e/helpers.ts`:

```ts
/** Opens a week from the Logbook list: the first row whose link says `link` (Continue, Revise or View). */
export async function openWeek(page: Page, link = 'Continue') {
  await nav(page, 'Logbook');
  await page.getByTestId('week-open').filter({ hasText: link }).first().click();
  await expect(page.getByTestId('field').first()).toBeVisible();
}
```

Then:
- **`flow.spec.ts`:**
  - import `openWeek`;
  - replace `await nav(page, 'Logbook builder');` in the "builds the period" test with `await openWeek(page);`;
  - in the "requests changes" test, replace it with `await openWeek(page, 'Revise');`.
- **`internship.spec.ts`:**
  - line 37 becomes `for (const name of ['Logbook', 'Export']) await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);`;
  - the later `await nav(page, 'Logbook builder');` becomes `await openWeek(page);` (import it).
- **`journal.spec.ts`:** line 31 becomes the same `['Logbook', 'Export']` exact-name check.
- **`builder-cover-race.spec.ts`:** the dropdown is gone. The test now switches weeks through the list.
  - Replace the block from `await nav(page, 'Logbook builder');` to the end of the test with:

```ts
  await openWeek(page);
  const nameField = page.locator('[data-testid="field"][data-label="Name"] input, [data-testid="field"][data-label="Name"] textarea');
  await expect(nameField).toBeVisible();
  await nameField.fill(COVER_NAME);
  // Leave straight away (well under the 500ms cover-save debounce) and open another week: the edit must survive.
  await page.getByTestId('logbook-back').click();
  await page.getByTestId('week-open').nth(1).click();
  await expect(nameField).toHaveValue(COVER_NAME);
```

  - Import `openWeek`; remove the now-unused `firstKey`/`secondKey`/`options` lines and any unused imports.
  - `logbook-back` comes in Task 5. Until then this spec fails, as expected; it is re-run at the end of Task 5.

- [ ] **Step 8: Run the tests**

Run: `npx vue-tsc --noEmit`, then `npx playwright test tests/e2e/logbook.spec.ts tests/e2e/flow.spec.ts tests/e2e/internship.spec.ts tests/e2e/journal.spec.ts --reporter=line`
Expected: PASS, except that any assertion on the builder's old "from journal" tag (flow.spec line 67) fails until Task 5. Change that line now to `await expect(page.getByTestId('from-notepad').first()).toHaveText('From journal');`; it passes after Task 5. Record both as expected-red in the ledger.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/views/student/Logbook.vue src/router.ts src/App.vue src/styles.css tests/e2e && git commit -m "feat: a Logbook list of weeks with sources, status and next step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The week page: header, filling from records, tags, history, your submitted version (prototype)

**Files:**
- Create:
  - `intern-logbook/src/components/WeekHistory.vue`
  - `intern-logbook/tests/e2e/week.spec.ts`
- Modify: `src/views/student/Builder.vue`

**Interfaces:**
- Consumes:
  - `autofill(…, org)`, `sourceValue(…, org)` and `boxSource` (Task 2);
  - `ReviewAction.values` (Task 3);
  - the student store's `actions`, `latest` and `fillFor`;
  - `journal.org`.
- Produces: `WeekHistory.vue`, with props `{ actions: ReviewAction[] }` (sorted oldest first by the component), rendering `data-testid="history"`.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/week.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { asRole, iso, lastWeekday, openWeek, writeEntry } from './helpers';

async function demoAs(page: import('@playwright/test').Page, who: string) {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await asRole(page, who);
}

test('a draft week fills its weekly boxes from accepted activities, tagged, and an edit is tagged as yours', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await writeEntry(page, iso(lastWeekday()), 'Built the login page.');
  await page.getByTestId('organize').click();
  const activity = page.locator('[data-testid="review-card"][data-kind="activity"]');
  await activity.getByTestId('review-accept').click();
  await expect(page.getByTestId('connected-item')).toContainText('Built the login page');

  await openWeek(page);
  await expect(page.getByTestId('week-title')).toContainText('Week ');
  const typeBox = page.locator('[data-testid="field"]', { hasText: 'Type' });
  await expect(typeBox.locator('textarea')).toHaveValue(/• Built the login page/);
  await expect(typeBox.getByTestId('from-notepad')).toHaveText(/^From \d+ accepted activit(y|ies)$/);
  await typeBox.locator('textarea').fill('My own words about the week.');
  await expect(typeBox.getByTestId('box-edited')).toHaveText('Edited by you');
  await expect(page.getByTestId('history')).toContainText('Not submitted yet.');
});

test('a sent-back week shows the version that was sent, and its history', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await openWeek(page, 'Revise');
  await expect(page.getByTestId('changes-banner')).toBeVisible();
  const sent = page.getByTestId('submitted-version');
  await expect(sent).toContainText('Your submitted version · ');
  await sent.locator('summary').click();
  await expect(sent.getByTestId('preview')).toBeVisible();
  await expect(page.getByTestId('revision-note')).toHaveText('Your original submission stays as it was. Your supervisor gets this revision when you resubmit.');
  await expect(page.getByTestId('history')).toContainText('Submitted by Daniel Lim');
  await expect(page.getByTestId('history')).toContainText('Changes requested');
  await page.getByTestId('logbook-back').click();
  await expect(page).toHaveURL(/#\/logbook$/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/week.spec.ts --reporter=line`
Expected: FAIL. `week-title` is not found.

- [ ] **Step 3: Write `src/components/WeekHistory.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewAction } from '../core/model';

/** A week's submits and review decisions, oldest first. A second or later submit reads "Resubmitted". */
const props = defineProps<{ actions: ReviewAction[] }>();
const lines = computed(() => {
  let submits = 0;
  return [...props.actions].sort((a, b) => a.at.localeCompare(b.at)).map(a => {
    const what = a.action === 'submit' ? (submits++ ? 'Resubmitted' : 'Submitted') : a.action === 'approve' ? 'Approved' : 'Changes requested';
    return { a, what };
  });
});
</script>

<template>
  <div class="card" data-testid="history">
    <h2>History</h2>
    <p v-if="!lines.length" class="muted">Not submitted yet.</p>
    <ul v-else class="plain-list">
      <li v-for="{ a, what } in lines" :key="a.id">
        {{ what }} by {{ a.signature ?? a.by }} · {{ new Date(a.at).toLocaleString() }}
        <div v-if="a.comment" class="muted">“{{ a.comment }}”</div>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 4: Change `src/views/student/Builder.vue`**

- **Imports:**
  - add `boxSource` to the `../../core/autofill` import;
  - add `import { RouterLink } from 'vue-router';` (merge with the existing vue-router import);
  - add `import WeekHistory from '../../components/WeekHistory.vue';` and `import { shortDate } from '../../core/records';`;
  - remove `STATUS_TEXT` from the import only if it ends up unused.
- **Fill from records:** pass `journal.org` everywhere the journal is a source.
  - In `open()`: `autofill(phs.value, p, journal.entries, f.values, f.autofilled, journal.org)`.
  - In `drift()`, `pullAgain()` and `pullAll()`: `sourceValue(ph, p, journal.entries, journal.org)`.
  - In `summarizeWeek()`: `sourceValue(ph, p, journal.entries, journal.org) ?? ''`.
- **Replace `fromJournal`/`fromNotes`'s tag** with a tag function, and delete the old `fromJournal` function:

```ts
const fromNotes = (ph: Placeholder) => ph.binding === 'daily' || ph.binding === 'period';
/** Where this box's text came from, while it still holds exactly that; null once the intern has changed it. */
function sourceTag(ph: Placeholder): string | null {
  const f = fill.value;
  const p = period.value;
  if (!f || !p || !fromNotes(ph) || isCoverField(ph) || !f.autofilled[ph.id] || (f.values[ph.id] ?? '') !== f.autofilled[ph.id]) return null;
  const s = boxSource(ph, p, journal.org);
  if (!s || s.from === 'journal') return 'From journal';
  if (s.from === 'activity') return `From ${s.count} accepted activit${s.count === 1 ? 'y' : 'ies'}`;
  return s.count ? `From ${s.count} learning point${s.count === 1 ? '' : 's'}` : 'From accepted skills';
}
const edited = (ph: Placeholder) => !!fill.value && fromNotes(ph) && !isCoverField(ph) && !sourceTag(ph) && !!(fill.value.values[ph.id] ?? '').trim();
```

- **History and the sent version:**

```ts
const history = computed(() => (periodKey.value ? st.actions.filter(a => a.studentId === st.student?.id && a.periodKey === periodKey.value) : []));
/** The copy the latest submit sent, shown while the week is sent back. */
const lastSubmit = computed(() => (fill.value?.status === 'changes_requested' && periodKey.value ? st.latest(periodKey.value, 'submit') : undefined));
const sentValues = computed(() => { const v = sentCopy(lastSubmit.value); return v ? resolveValues(phs.value, cover.value, v) : null; });
```

- **Delete `goTo()`.** The week dropdown is removed.
- **Template:**
  - Replace the first `.row.card` header block (the `<label class="inline">Period …</label>` with its `<select>`, and the `StatusBadge`) with:

```vue
    <p><RouterLink to="/logbook" data-testid="logbook-back">← Logbook</RouterLink></p>
    <div class="row card">
      <h1 style="margin: 0" data-testid="week-title">Week {{ period.index }} · {{ shortDate(period.start) }} – {{ shortDate(period.end) }}</h1>
      <StatusBadge :status="fill?.status ?? 'draft'" />
```

    The three existing buttons stay, followed by the closing `</div>` that was already there.
  - Replace the field label's tag `<span v-if="fromJournal(ph)" class="tag" data-testid="from-notepad">from journal</span>` with:

```vue
<span v-if="sourceTag(ph)" class="tag" data-testid="from-notepad">{{ sourceTag(ph) }}</span>
<span v-else-if="edited(ph)" class="tag" data-testid="box-edited">Edited by you</span>
```

  - After the `changes-banner` paragraph, add:

```vue
    <details v-if="sentValues && lastSubmit" class="card" data-testid="submitted-version">
      <summary>Your submitted version · {{ shortDate(lastSubmit.at.slice(0, 10)) }}</summary>
      <div class="preview" data-testid="preview">
        <TemplateOverlay v-if="st.template" :template="st.template" mode="fill" :values="sentValues" />
      </div>
    </details>
```

  - After the closing `</div>` of `.builder-grid`, add:

```vue
    <p v-if="fill?.status === 'changes_requested'" class="muted" data-testid="revision-note">Your original submission stays as it was. Your supervisor gets this revision when you resubmit.</p>
    <WeekHistory :actions="history" />
```

- **Check:**
  - `data-testid="preview"` now appears twice on a sent-back week. `flow.spec` uses `getByTestId('preview')` right after submitting, while the week is not sent back, so it stays unique there.
  - If Playwright strict mode complains anywhere, scope that assertion to `.builder-grid` and ledger a ruling.

- [ ] **Step 5: Run the tests**

Run: `npx vue-tsc --noEmit`, then `npx playwright test tests/e2e/week.spec.ts tests/e2e/flow.spec.ts tests/e2e/builder-cover-race.spec.ts tests/e2e/internship.spec.ts --reporter=line`
Expected: all PASS, including the two expected-red items from Task 4.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/components/WeekHistory.vue src/views/student/Builder.vue tests/e2e/week.spec.ts && git commit -m "feat: the week page fills from your records, tags each box, shows history and the version you sent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Changed since the last submission" for the supervisor (prototype)

**Files:**
- Modify:
  - `src/views/supervisor/ReviewDetail.vue`
  - `tests/e2e/week.spec.ts` (one more test)

**Interfaces:**
- Consumes: `changedSince` and `sentCopy` (Task 3), `WeekHistory.vue` (Task 5), and `ReviewAction.values`.

- [ ] **Step 1: Write the failing e2e test** (append to `tests/e2e/week.spec.ts`)

```ts
test('the supervisor sees which boxes a resubmit changed', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await openWeek(page, 'Revise');
  const typeBox = page.locator('[data-testid="field"]', { hasText: 'Type' });
  await typeBox.locator('textarea').fill('Revised: built and tested the export endpoint.');
  await page.getByTestId('submit-period').click();
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Submitted');

  await asRole(page, 'Supervisor');
  await page.getByRole('link', { name: /^Review(\s|$)/ }).click();
  await page.getByTestId('queue-row').filter({ hasText: 'Daniel Lim' }).filter({ hasText: 'Week 2 ·' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('Changed since the last submission');
  await expect(changes.getByTestId('changed-box')).toHaveCount(1);
  await changes.getByTestId('changed-box').locator('summary').click();
  await expect(changes.getByTestId('changed-box')).toContainText('Revised: built and tested the export endpoint.');
  await expect(page.getByTestId('history')).toContainText('Resubmitted');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/week.spec.ts -g "resubmit changed" --reporter=line`
Expected: FAIL. `changes` is not found.

- [ ] **Step 3: Implement** in `ReviewDetail.vue`

- **Imports:**
  - add `changedSince` to the workflow import;
  - add `import WeekHistory from '../../components/WeekHistory.vue';`;
  - remove `ACTION_TEXT`, which becomes unused.
- **Add:**

```ts
/** The last two submits that carry copies: what the intern changed in this resubmit. */
const changed = computed(() => {
  const copies = history.value.filter(a => a.action === 'submit').map(a => sentCopy(a));
  if (!row.value || copies.length < 2) return null;
  const [before, now] = copies.slice(-2);
  if (!before || !now) return null; // one of the two has no copy: nothing to compare
  return changedSince(before, now, row.value.template.placeholders).map(p => ({ p, before: before[p.id] ?? '', now: now[p.id] ?? '' }));
});
```

- **Replace the history card markup** (`<div class="card" data-testid="history"> … </div>`) with `<WeekHistory :actions="history" />`. Before it, inside `<aside class="side">`, add:

```vue
        <div v-if="changed" class="card" data-testid="changes">
          <h2>Changed since the last submission</h2>
          <p v-if="!changed.length" class="muted">Resubmitted with no changes.</p>
          <details v-for="c in changed" :key="c.p.id" data-testid="changed-box">
            <summary>{{ c.p.label }}</summary>
            <p class="muted">Before</p>
            <p class="pre">{{ c.before || '(empty)' }}</p>
            <p class="muted">Now</p>
            <p class="pre">{{ c.now || '(empty)' }}</p>
          </details>
        </div>
```

- **Append to `src/styles.css`:** `.pre { white-space: pre-wrap; margin: 0 0 8px; }`

- [ ] **Step 4: Run the tests**

Run: `npx vue-tsc --noEmit`, `npx vitest run`, then the full `npx playwright test --reporter=line`
Expected: all green. `flow.spec`'s supervisor-side `history` checks ('Changes requested', 'Approved') still match the shared component.

- [ ] **Step 5: Final checks**

- Run `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
- Build the preview with `npx vite build --mode single`, serve it with the `preview-html` launch config, and check:
  - as Daniel, the Logbook list shows its rows;
  - the Revise week shows "Your submitted version";
  - there are no console errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/views/supervisor/ReviewDetail.vue src/styles.css tests/e2e/week.spec.ts && git commit -m "feat: supervisors see which boxes a resubmit changed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
