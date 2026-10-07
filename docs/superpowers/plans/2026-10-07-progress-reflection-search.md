# Progress, Weekly reflection and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overview gains progress counts and a journal activity grid, interns get a private weekly reflection, and everyone gets search from the top bar.

**Architecture:** Everything is worked out in the browser from data the journal store already loads. Reflections ride on `GET /journal`, the way projects do, and one new server write saves a reflection. Pure helpers live in `src/core` (`progress.ts`, `reflection.ts`, `search.ts`), and the views stay thin.

**Tech Stack:** Vue 3, Pinia, vue-router (hash), idb, Vitest with fake-indexeddb, Playwright; Laravel 12 on PHP 8.4.

**Spec:** `docs/superpowers/specs/2026-10-07-progress-reflection-search-design.md`

## Global Constraints

- **Repos:**
  - The app is `C:/Users/User/Downloads/Rizurf_Logbook/intern-logbook`, on branch `progress-reflection-search`, which already exists and holds the spec commit.
  - The server is `C:/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app/appv3/backend`. Create the branch `reflections-api` from `master` in Task 1.
- `src/core/**` must not import Vue, Pinia, idb or docx-preview. Views never import `src/data/repository`.
- Pass Vue state through `plain()` before it goes to IndexedDB.
- **Never run `npm run build`.** The app checks are:
  - `npx vue-tsc --noEmit`
  - `npx vitest run`
  - `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`
  - `npx playwright test --reporter=line`
- **Server tests:**
  ```bash
  OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test
  ```
  - Lint with `vendor/bin/pint --test` and `vendor/bin/phpstan analyse --no-progress --memory-limit=1G`, both run through `C:/Users/User/php84/php.exe`.
- **Editing in Git Bash:**
  - heredocs and sed mangle `\`, so use the Edit tool for anything with backslashes;
  - many files are CRLF, so Python edits must read with `newline=''`.
- **Copy (exact strings):**
  - "workdays so far"
  - "N of M workdays written"
  - "Nothing recorded this week yet."
  - "What did you learn this week?"
  - "Save reflection"
  - "Saved"
  - "We couldn't save your reflection. Try again."
  - "Leave without saving your reflection?"
  - "Search your experience"
  - "Search your journal, projects, learning, skills and reflections."
  - "Search your journal."
  - "Nothing found for “…”."
- Reflections are private, for interns only, with at most 5000 characters. A week key is the Monday `YYYY-MM-DD`.
- Highlighting uses `<mark>` pieces in the template. **No `v-html`.**
- Colours use theme tokens only (`--primary`, `--primary-light`, `--border`, `--muted`), so the gateway dark mode works.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A bad week address** (`/reflection/2026-02-30`, `/reflection/abc`, a Tuesday, or a future week) opens this week without throwing. `isMonday` must not call `toISOString` on an invalid date. This is pinned in Task 5.
2. **A failed reflection save** keeps the typed text and shows the error, and the store's map stays unchanged. This is pinned in Task 4 (store) and Task 6 (the page keeps `text`).
3. **Search text with regex or HTML characters** (`(`, `<b>`) is treated as plain text and rendered as text. This is pinned in Task 7.
4. **Entries on weekends, before the start date or blank** don't count as written days on Overview. This is pinned in Task 2 (`writtenOf`).
5. **Switching role while on `/search`** shows the new person's results, not the old ones. The component is keyed by role data and path. This is pinned in Task 8 e2e.

---

### Task 1: Reflections API (server)

**Files:**
- Create: `database/migrations/2026_10_09_000001_add_reflections.php`
- Create: `app/Models/Reflection.php`
- Create: `app/Http/Controllers/ReflectionController.php`
- Modify: `routes/portal.php` (import, plus one route after the `journal/{date}/organize` line)
- Modify: `app/Http/Controllers/JournalController.php` (`show`)
- Modify: `resources/openapi.json`
- Create: `tests/Feature/ReflectionsTest.php`
- Modify: `tests/Feature/PersonalJournalTest.php` (the two `assertExactJson` calls)

**Interfaces:**
- Produces:
  - `PUT /api/v1/journal/reflections/{week}` with body `{text: string|null}`, returning 204, 403 for non-interns, or 422;
  - `GET /api/v1/journal` gains `reflections: [{week: 'YYYY-MM-DD', text: string}]`, ordered by week.

- [ ] **Step 1: Branch and write the failing tests**

```bash
cd C:/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app/appv3/backend && git checkout master && git pull --ff-only && git checkout -b reflections-api
```

Create `tests/Feature/ReflectionsTest.php`:

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

/** An intern's private weekly reflections (piece 4). TestCase pins "today" to Monday 2026-09-21 in Kuala Lumpur. */
class ReflectionsTest extends TestCase
{
    public function test_an_intern_saves_updates_and_clears_a_reflection(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => '  Learned queues.  '])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-21', ['text' => 'This week.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => 'Learned queues properly.'])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', [
            ['week' => '2026-09-14', 'text' => 'Learned queues properly.'],
            ['week' => '2026-09-21', 'text' => 'This week.'],
        ]);

        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => '   '])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-21', ['text' => null])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);
    }

    public function test_bad_weeks_and_text_are_refused(): void
    {
        $this->be($this->user('student-1'));
        foreach (['2026-09-15', '2026-02-30', 'monday', '14-09-2026'] as $week) {
            $this->portal('PUT', "/api/v1/journal/reflections/{$week}", ['text' => 'x'])->assertUnprocessable();
        }
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => str_repeat('a', 5001)])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => ['not', 'text']])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', [])->assertUnprocessable();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);
    }

    public function test_supervisors_have_none_and_interns_see_only_their_own(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => 'Mine.'])->assertNoContent();

        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => 'x'])->assertForbidden();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);

        $this->be($this->user('student-2'));
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);
    }
}
```

In `tests/Feature/PersonalJournalTest.php`, add `'reflections' => []` after `'projects' => []` in both `assertExactJson` calls (around lines 25 and 36).

- [ ] **Step 2: Run the tests to see them fail**

Run: `OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test --filter "ReflectionsTest|PersonalJournalTest"`

Expected: FAIL. The reflection routes return 404 or 405, and the journal JSON has no `reflections`.

- [ ] **Step 3: Migration, model and controller**

`database/migrations/2026_10_09_000001_add_reflections.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** An intern's private weekly reflection: one per intern per week (keyed by the week's Monday). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reflections', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->date('week_start');
            $table->text('text');
            $table->timestamps();
            $table->unique(['user_id', 'week_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reflections');
    }
};
```

`app/Models/Reflection.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** An intern's private reflection on one week; only its writer ever reads it. */
class Reflection extends Model
{
    protected $fillable = ['user_id', 'week_start', 'text'];

    /** @return list<array{week: string, text: string}> */
    public static function listFor(string $userId): array
    {
        return self::query()->where('user_id', $userId)->orderBy('week_start')->get()
            ->map(fn (self $r): array => ['week' => substr((string) $r->week_start, 0, 10), 'text' => (string) $r->text])
            ->values()->all();
    }
}
```

`app/Http/Controllers/ReflectionController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Reflection;
use App\Models\User;
use App\Support\Problem;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\Response;

/** An intern's private weekly reflections. Always the signed-in intern's own; no route takes someone else's id. */
final class ReflectionController extends Controller
{
    public function save(Request $request, string $week): Response
    {
        /** @var User $user */
        $user = $request->user();
        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns keep weekly reflections.');
        }
        Validator::make(['week' => $week], [
            'week' => ['bail', 'date_format:Y-m-d', function (string $attribute, mixed $value, Closure $fail): void {
                if (! Carbon::createFromFormat('Y-m-d', (string) $value)?->isMonday()) {
                    $fail('A reflection week starts on a Monday.');
                }
            }],
        ])->validate();
        $text = trim((string) $request->validate(['text' => ['present', 'nullable', 'string', 'max:5000']])['text']);

        $key = ['user_id' => $user->id, 'week_start' => $week];
        if ($text === '') {
            Reflection::query()->where($key)->delete();
        } else {
            Reflection::query()->updateOrCreate($key, ['text' => $text]);
        }

        return response()->noContent();
    }
}
```

- [ ] **Step 4: Route, journal read and OpenAPI**

In `routes/portal.php`, add `use App\Http\Controllers\ReflectionController;` to the imports in alphabetical order. After the `journal/{date}/organize` route, add:

```php
    // An intern's private weekly reflection (week = its Monday): supervisors get 403.
    Route::put('journal/reflections/{week}', [ReflectionController::class, 'save'])->middleware('auth');
```

In `JournalController::show`, add `use App\Models\Reflection;` and, after the `'projects' => …` line:

```php
            'reflections' => $user->isStudent() ? Reflection::listFor($user->id) : [],
```

In `resources/openapi.json`:
- Add `"reflections"` at the end of the `outputs` of `GET /journal`, right after `"projects"`.
- Insert this path after the `"/journal/{date}/organization"` entry:

```json
    "/journal/reflections/{week}": {
      "put": {
        "summary": "Save the signed-in intern's private reflection on one week; empty text deletes it.",
        "parameters": [
          { "name": "week", "in": "path", "required": true, "schema": { "type": "string", "format": "date" } }
        ],
        "responses": {
          "204": { "description": "Saved." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Save Weekly Reflection",
          "purpose": "Keep an intern's private note on what they learned in a week",
          "use_when": ["An intern saves their weekly reflection"],
          "do_not_use_when": ["Writing a day's journal entry (use PUT /journal/{date})", "Supervisors (interns only)"],
          "inputs": ["week", "text"],
          "outputs": [],
          "requires": ["Signed-in intern", "week is a Monday"],
          "related_endpoints": ["GET /journal"],
          "tags": ["journal", "reflection", "private", "weekly"]
        }
      }
    },
```

- [ ] **Step 5: Run the whole server suite and the linters**

Run, from the backend directory:

```bash
OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test
C:/Users/User/php84/php.exe vendor/bin/pint --test
C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --no-progress --memory-limit=1G
```

Expected: all tests pass, including OpenApiTest. Pint and PHPStan are clean. If Pint complains, run `vendor/bin/pint` on the new files and re-run.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: private weekly reflections for interns, sent with the journal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Progress helpers (core)

**Files:**
- Create: `src/core/progress.ts`
- Test: `tests/unit/progress.test.ts`

**Interfaces:**
- Consumes: `acceptedRows`, `skillStats` and `Org` from `src/core/records.ts`; `eachDay`, `isWeekend` and `weekday` from `src/core/dates.ts`.
- Produces:
  - `workdaysSoFar(start: string, end: string | null, today: string): string[]`
  - `writtenOf(days: string[], entries: Record<string, string>): number`
  - `gridCells(days: string[]): (string | null)[]`
  - `logbookCounts(periods: Period[], statusOf: (key: string) => PeriodStatus, today: string): LogbookCounts`
  - `logbookLine(c: LogbookCounts): string`
  - `recordCounts(org: Org): { activities: number; learning: number; skills: number; skillProjects: number }`
  - `plural(n: number, one: string, many?: string): string`

- [ ] **Step 1: Write the failing test**

`tests/unit/progress.test.ts` (2026-09-21 is a Monday):

```ts
import { describe, expect, it } from 'vitest';
import type { Item, Period, PeriodStatus } from '../../src/core/model';
import { gridCells, logbookCounts, logbookLine, plural, recordCounts, workdaysSoFar, writtenOf } from '../../src/core/progress';

const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `${kind}-${text}`, kind, text, status });

describe('progress', () => {
  it('lists weekdays from the start up to today, stopping at the end date', () => {
    expect(workdaysSoFar('2026-09-16', '2026-09-24', '2026-09-28')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(workdaysSoFar('2026-09-16', null, '2026-09-19')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
    expect(workdaysSoFar('2026-09-16', null, '2026-09-15')).toEqual([]);
  });
  it('counts only listed days with real text as written', () => {
    const days = ['2026-09-17', '2026-09-18'];
    expect(writtenOf(days, { '2026-09-17': 'Did it', '2026-09-18': '   ', '2026-09-19': 'Saturday', '2026-09-10': 'Before the start' })).toBe(1);
  });
  it('pads the first week so each row of five starts on a Monday', () => {
    expect(gridCells(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21'])).toEqual([null, null, '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21']);
    expect(gridCells([])).toEqual([]);
  });
  it('counts started periods by status and names the most urgent other one', () => {
    const p = (key: string, start: string): Period => ({ key, kind: 'weekly', index: 1, start, end: start, label: key, workdays: [] });
    const status: Record<string, PeriodStatus> = { a: 'approved', b: 'approved', c: 'submitted', d: 'draft', e: 'changes_requested' };
    const c = logbookCounts([p('a', '2026-09-01'), p('b', '2026-09-07'), p('c', '2026-09-14'), p('d', '2026-09-21'), p('e', '2026-09-28')], k => status[k], '2026-09-21');
    expect(c).toEqual({ approved: 2, changes: 0, review: 1, draft: 1 });
    expect(logbookLine(c)).toBe('1 in review');
    expect(logbookLine({ approved: 0, changes: 2, review: 1, draft: 0 })).toBe('2 changes requested');
    expect(logbookLine({ approved: 3, changes: 0, review: 0, draft: 0 })).toBe('');
  });
  it('counts accepted records and merges skills ignoring case', () => {
    const org = {
      '2026-09-21': { projectId: 'p1', items: [item('activity', 'Built it'), item('learning', 'Queues'), item('skill', 'SQL'), item('activity', 'Nope', 'rejected')] },
      '2026-09-22': { projectId: 'p2', items: [item('activity', 'Tested it'), item('skill', 'sql')] },
    };
    expect(recordCounts(org)).toEqual({ activities: 2, learning: 1, skills: 1, skillProjects: 2 });
    expect(plural(1, 'learning point')).toBe('1 learning point');
    expect(plural(2, 'activity', 'activities')).toBe('2 activities');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/progress.test.ts`

Expected: FAIL, because `src/core/progress` can't be resolved.

- [ ] **Step 3: Implement**

`src/core/progress.ts`:

```ts
import type { Period, PeriodStatus } from './model';
import { acceptedRows, skillStats, type Org } from './records';
import { eachDay, isWeekend, weekday } from './dates';

/** Monday–Friday from `start` up to today, stopping at `end`. Empty before the start. */
export function workdaysSoFar(start: string, end: string | null, today: string): string[] {
  const last = end && end < today ? end : today;
  return last < start ? [] : eachDay(start, last).filter(d => !isWeekend(d));
}

/** How many of `days` have real text. */
export const writtenOf = (days: string[], entries: Record<string, string>): number => days.filter(d => entries[d]?.trim()).length;

/** Consecutive workdays, padded so each row of five starts on a Monday. */
export const gridCells = (days: string[]): (string | null)[] => (days.length ? [...Array<null>(weekday(days[0]) - 1).fill(null), ...days] : []);

export interface LogbookCounts { approved: number; changes: number; review: number; draft: number }

/** Periods that have started, by status. */
export function logbookCounts(periods: Period[], statusOf: (key: string) => PeriodStatus, today: string): LogbookCounts {
  const c: LogbookCounts = { approved: 0, changes: 0, review: 0, draft: 0 };
  for (const p of periods) {
    if (p.start > today) continue;
    const s = statusOf(p.key);
    c[s === 'approved' ? 'approved' : s === 'changes_requested' ? 'changes' : s === 'submitted' ? 'review' : 'draft']++;
  }
  return c;
}

/** The line under "N approved": the first non-zero of changes, review, draft. */
export function logbookLine(c: LogbookCounts): string {
  if (c.changes) return `${c.changes} changes requested`;
  if (c.review) return `${c.review} in review`;
  return c.draft ? `${c.draft} draft` : '';
}

export function recordCounts(org: Org) {
  const rows = acceptedRows(org);
  const skills = skillStats(org);
  return {
    activities: rows.filter(r => r.kind === 'activity').length,
    learning: rows.filter(r => r.kind === 'learning').length,
    skills: skills.length,
    skillProjects: new Set(skills.flatMap(s => s.projectIds)).size,
  };
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/progress.test.ts`

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/progress.ts tests/unit/progress.test.ts && git commit -m "feat: progress helpers for workdays, logbook and record counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Overview counts and activity grid

**Files:**
- Modify: `src/views/student/Overview.vue`
- Modify: `src/styles.css` (next to the `.ov-*` rules, around line 203)
- Modify: `tests/e2e/overview.spec.ts`

**Interfaces:**
- Consumes: everything Task 2 produces; `shortDate` isn't needed.
- Produces: the test ids `ov-count`, `ov-grid`, `ov-day` (class `on` when written) and `ov-grid-caption`.

- [ ] **Step 1: Write the failing e2e**

At the top of `tests/e2e/overview.spec.ts`, add the demo helper below the imports. Task 6 later moves it into `helpers.ts`; for now, define it locally:

```ts
async function demoAs(page: import('@playwright/test').Page, who: string) {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await asRole(page, who);
}
```

Append this test:

```ts
test('Overview counts the journal, logbook and records, with a grid of written workdays', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Overview');
  const counts = page.getByTestId('ov-count');
  await expect(counts).toHaveCount(4);
  await expect(counts.nth(0)).toContainText('JOURNAL DAYS');
  await expect(counts.nth(0)).toContainText('workdays so far');
  await expect(counts.nth(1)).toContainText(/LOGBOOK\s*1 approved\s*1 changes requested/);
  await expect(counts.nth(2)).toContainText(/ACTIVITIES\s*\d+\s*\d+ learning points?/);
  await expect(counts.nth(3)).toContainText(/SKILLS\s*\d+\s*across 2 projects/);
  const days = page.getByTestId('ov-day');
  const total = await days.count();
  const on = await page.locator('[data-testid="ov-day"].on').count();
  expect(total).toBeGreaterThan(10);
  await expect(page.getByTestId('ov-grid-caption')).toHaveText(`${on} of ${total} workdays written`);
  await expect(days.first()).toHaveAttribute('title', /^\w{3} \d{1,2} \w+ · (written|not written)$/);
});
```

In the existing test `Overview for a journal intern…`, add after the `ov-title` assertion:

```ts
  await expect(page.getByTestId('ov-count').nth(1)).toContainText('PROJECTS');
  await expect(page.getByTestId('ov-grid-caption')).toHaveText(/^0 of \d+ workdays written$/);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test tests/e2e/overview.spec.ts --reporter=line`

Expected: FAIL, because no `ov-count` exists.

- [ ] **Step 3: Implement**

In `src/views/student/Overview.vue`'s script, add these imports:

```ts
import { gridCells, logbookCounts, logbookLine, plural, recordCounts, workdaysSoFar, writtenOf } from '../../core/progress';
```

After the `progress`/`caption` computeds, add:

```ts
// Progress: written workdays from the start (the journal's start for journal interns) up to today.
const days = computed(() => {
  const start = isJournal.value ? journal.startDate : s.value?.startDate;
  return start ? workdaysSoFar(start, isJournal.value ? null : s.value?.endDate ?? null, today) : [];
});
const writtenDays = computed(() => writtenOf(days.value, journal.entries));
const cells = computed(() => gridCells(days.value));
const book = computed(() => logbookCounts(st.periods, st.statusOf, today));
const rec = computed(() => recordCounts(journal.org));
const dayLabel = (d: string) => `${parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${journal.entries[d]?.trim() ? 'written' : 'not written'}`;
```

In the template, add these right after the `ov-head` `</section>`:

```html
  <section v-if="days.length" class="ov-counts">
    <div class="card ov-count" data-testid="ov-count"><p class="caption">JOURNAL DAYS</p><strong class="ov-num">{{ writtenDays }} / {{ days.length }}</strong><span class="muted">workdays so far</span></div>
    <div v-if="!isJournal" class="card ov-count" data-testid="ov-count"><p class="caption">LOGBOOK</p><strong class="ov-num">{{ book.approved }} approved</strong><span class="muted">{{ logbookLine(book) }}</span></div>
    <div v-else class="card ov-count" data-testid="ov-count"><p class="caption">PROJECTS</p><strong class="ov-num">{{ journal.projects.length }}</strong><span class="muted">in your records</span></div>
    <div class="card ov-count" data-testid="ov-count"><p class="caption">ACTIVITIES</p><strong class="ov-num">{{ rec.activities }}</strong><span class="muted">{{ plural(rec.learning, 'learning point') }}</span></div>
    <div class="card ov-count" data-testid="ov-count"><p class="caption">SKILLS</p><strong class="ov-num">{{ rec.skills }}</strong><span class="muted">across {{ plural(rec.skillProjects, 'project') }}</span></div>
  </section>
  <section v-if="days.length" class="card" data-testid="ov-grid">
    <h2>Journal activity</h2>
    <div class="ov-grid">
      <template v-for="(d, i) in cells" :key="d ?? `pad-${i}`">
        <i v-if="d" class="ov-day" :class="{ on: !!journal.entries[d]?.trim() }" data-testid="ov-day" role="img" :title="dayLabel(d)" :aria-label="dayLabel(d)" />
        <i v-else class="ov-day pad" aria-hidden="true" />
      </template>
    </div>
    <p class="muted" data-testid="ov-grid-caption">{{ writtenDays }} of {{ days.length }} workdays written</p>
  </section>
```

In `src/styles.css`, add after the `.ov-box` rule:

```css
.ov-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
.ov-count { display: flex; flex-direction: column; gap: 2px; margin: 0; min-width: 0; }
.ov-num { font-size: 24px; color: var(--heading); }
.ov-grid { display: grid; grid-template-columns: repeat(5, 18px); gap: 5px; margin: 8px 0; }
.ov-day { display: block; width: 18px; height: 18px; border-radius: 4px; background: var(--primary-light); border: 1px solid var(--border); }
.ov-day.on { background: var(--primary); border-color: var(--primary); }
.ov-day.pad { visibility: hidden; }
```

- [ ] **Step 4: Run it to see it pass, then type-check**

Run: `npx playwright test tests/e2e/overview.spec.ts --reporter=line && npx vue-tsc --noEmit`

Expected: 3 passed, and vue-tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/student/Overview.vue src/styles.css tests/e2e/overview.spec.ts && git commit -m "feat: Overview shows progress counts and a journal activity grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reflections in the data layer and store

**Files:**
- Modify: `src/core/model.ts` (after `Journal`)
- Modify: `src/data/repository.ts`, `src/data/idb.ts`, `src/data/http.ts`, `src/data/demo.ts`
- Modify: `src/stores/journal.ts`
- Test: `tests/unit/data.test.ts`, `tests/unit/http.test.ts`, `tests/unit/stores.test.ts`

**Interfaces:**
- Produces:
  - `interface Reflection { week: string; text: string }`
  - `Journal.reflections?: Reflection[]`
  - `Repository.putReflection(owner: string, week: string, text: string): Promise<void>`
  - `useJournal().reflections: Record<string, string>` (week → text)
  - `useJournal().saveReflection(week: string, text: string): Promise<void>`, which throws on failure and leaves the map unchanged

- [ ] **Step 1: Write the failing tests**

`tests/unit/data.test.ts`:
- Add `reflections: []` to every `toEqual` that compares a whole `getJournal(...)` result. These are the objects that end with `projects: []` (around lines 75, 80, 83, 87 and 133).
- Then add these two tests inside `describe('IdbRepository'…)`:

```ts
  it('keeps one reflection per owner and week, trimmed; blank text deletes it', async () => {
    const r = fresh();
    await r.putReflection('student-aina', '2026-09-21', '  Learned a lot.  ');
    await r.putReflection('student-aina', '2026-09-14', 'Earlier.');
    await r.putReflection('student-daniel', '2026-09-21', "Not Aina's.");
    expect((await r.getJournal('student-aina')).reflections).toEqual([{ week: '2026-09-14', text: 'Earlier.' }, { week: '2026-09-21', text: 'Learned a lot.' }]);
    await r.putReflection('student-aina', '2026-09-21', '   ');
    expect((await r.getJournal('student-aina')).reflections).toEqual([{ week: '2026-09-14', text: 'Earlier.' }]);
  });
  it('upgrading from version 4 keeps the journal and projects and adds reflections', async () => {
    const name = `test-${Math.random()}`;
    const old = await openDB(name, 4, {
      upgrade(db) {
        for (const s of ['templates', 'students']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
        db.createObjectStore('projects', { keyPath: ['owner', 'id'] }).createIndex('byOwner', 'owner');
      },
    });
    await old.put('journal', { owner: 'a', date: '2026-09-21', text: 'Kept.' });
    await old.put('projects', { owner: 'a', id: 'p1', name: 'Kept project', description: null });
    old.close();
    const r = new IdbRepository(name);
    expect(await r.getJournal('a')).toEqual({ startDate: null, entries: [{ date: '2026-09-21', text: 'Kept.' }], projects: [{ id: 'p1', name: 'Kept project', description: null }], reflections: [] });
    await r.putReflection('a', '2026-09-21', 'New.');
    expect((await r.getJournal('a')).reflections).toEqual([{ week: '2026-09-21', text: 'New.' }]);
  });
```

`tests/unit/http.test.ts`: inside `describe('HttpRepository journal'…)`, add:

```ts
  it('saves a reflection and passes reflections through', async () => {
    routes['GET journal'] = () => json(200, { startDate: null, entries: [], projects: [], reflections: [{ week: '2026-09-14', text: 'R' }] });
    routes['PUT journal/reflections/2026-09-14'] = () => new Response(null, { status: 204 });
    const r = intern();
    expect((await r.getJournal('ignored')).reflections).toEqual([{ week: '2026-09-14', text: 'R' }]);
    await r.putReflection('ignored', '2026-09-14', 'Learned it');
    expect(calls.map(c => [c.method, c.path, c.body])).toEqual([
      ['GET', 'journal', undefined],
      ['PUT', 'journal/reflections/2026-09-14', JSON.stringify({ text: 'Learned it' })],
    ]);
  });
```

`tests/unit/stores.test.ts`: add a new describe at the end:

```ts
describe('journal store reflections', () => {
  it('saves trimmed, reloads, clears, and keeps the map when a save fails', async () => {
    const j = useJournal();
    await j.load('student-aina');
    expect(j.reflections).toEqual({});
    await j.saveReflection('2026-09-14', '  Queues are useful.  ');
    expect(j.reflections).toEqual({ '2026-09-14': 'Queues are useful.' });
    await j.load('student-aina');
    expect(j.reflections).toEqual({ '2026-09-14': 'Queues are useful.' });

    const spy = vi.spyOn(repo(), 'putReflection').mockRejectedValueOnce(new Error('offline'));
    await expect(j.saveReflection('2026-09-14', 'Changed')).rejects.toThrow('offline');
    expect(j.reflections).toEqual({ '2026-09-14': 'Queues are useful.' });
    spy.mockRestore();

    await j.saveReflection('2026-09-14', '  ');
    expect(j.reflections).toEqual({});
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/data.test.ts tests/unit/http.test.ts tests/unit/stores.test.ts`

Expected: FAIL, with `putReflection is not a function` and `reflections` missing.

- [ ] **Step 3: Implement**

In `src/core/model.ts`, after `JournalEntry`:

```ts
/** An intern's private note on one week; `week` is its Monday. */
export interface Reflection { week: string; text: string }
```

Then change `Journal` to:

```ts
export interface Journal extends JournalDetails { startDate: string | null; entries: JournalEntry[]; projects?: Project[]; reflections?: Reflection[] }
```

In `src/data/repository.ts`, add after `deleteProject`:

```ts
  /** The intern's own reflection on the week starting `week` (a Monday); blank text deletes it. */
  putReflection(owner: string, week: string, text: string): Promise<void>;
```

In `src/data/idb.ts`:
- Add `'reflections'` to the end of `STORES`.
- Change `openDB(this.name, 4,` to `openDB(this.name, 5,`.
- After the `oldVersion < 4` line, add:

```ts
        // Version 5: interns' private weekly reflections.
        if (oldVersion < 5) db.createObjectStore('reflections', { keyPath: ['owner', 'week'] }).createIndex('byOwner', 'owner');
```

- In `getJournal`, read `const reflections: { week: string; text: string }[] = await db.getAllFromIndex('reflections', 'byOwner', owner);` next to `projects`, and add this property after `projects:`:

```ts
      reflections: reflections.map(({ week, text }) => ({ week, text })).sort((a, b) => a.week.localeCompare(b.week)),
```

- After `deleteProject`, add:

```ts
  async putReflection(owner: string, week: string, text: string): Promise<void> {
    const db = await this.db();
    const t = text.trim();
    if (t) await db.put('reflections', { owner, week, text: t });
    else await db.delete('reflections', [owner, week]);
  }
```

In `src/data/http.ts`, add after `deleteProject`:

```ts
  async putReflection(_owner: string, week: string, text: string): Promise<void> {
    await api(`journal/reflections/${week}`, { method: 'PUT', body: { text } });
  }
```

In `src/stores/journal.ts`:
- Add `const reflections = ref<Record<string, string>>({});` after `projects`.
- In `load`, after `projects.value = …`, add `reflections.value = Object.fromEntries((j.reflections ?? []).map(r => [r.week, r.text]));`.
- Add this function after `deleteProject`:

```ts
  /** Saves (or, when blank, deletes) the intern's reflection on a week; throws on failure and leaves the map as it was. */
  async function saveReflection(week: string, text: string) {
    const t = text.trim();
    await repo().putReflection(who(), week, t);
    const next = { ...reflections.value };
    if (t) next[week] = t; else delete next[week];
    reflections.value = next;
  }
```

- Add `reflections, saveReflection` to the returned object.

In `src/data/demo.ts`, inside the per-student loop right after the `putOrganization` loop, add:

```ts
    await r.putReflection(id, addDays(mondayOf(todayISO()), -7), 'Testing the export endpoint early saved me a day of fixes. Next week: ask for a code review sooner.');
```

- [ ] **Step 4: Run them to see them pass, then the whole unit suite and the type check**

Run: `npx vitest run && npx vue-tsc --noEmit`

Expected: all pass, and vue-tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add -A src tests && git commit -m "feat: weekly reflections in the journal store, browser storage and HTTP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reflection helpers (core)

**Files:**
- Create: `src/core/reflection.ts`
- Test: `tests/unit/reflection.test.ts`

**Interfaces:**
- Consumes: `acceptedRows` and `Org` from records; `addDays`, `mondayOf`, `ISO_RE` and `parseISO` from dates; `Project` from model.
- Produces:
  - `isMonday(d: string): boolean`
  - `reflectionWeeks(start: string | null, today: string): { first: string; last: string }`
  - `weekSummary(week, entries, org, projects): WeekSummary`, where `WeekSummary = { days: number; activities: number; learning: number; projects: string[]; standOut: string[] }`

- [ ] **Step 1: Write the failing test**

`tests/unit/reflection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../src/core/model';
import { isMonday, reflectionWeeks, weekSummary } from '../../src/core/reflection';

const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `${kind}-${text}`, kind, text, status });

describe('reflection', () => {
  it('knows a real Monday and never throws on junk', () => {
    expect(isMonday('2026-09-21')).toBe(true);
    expect(isMonday('2026-09-22')).toBe(false);
    for (const bad of ['2026-02-30', 'abc', '', '2026-9-21', '2026-13-01']) expect(isMonday(bad)).toBe(false);
  });
  it('allows weeks from the start week up to this week', () => {
    expect(reflectionWeeks('2026-09-03', '2026-09-23')).toEqual({ first: '2026-08-31', last: '2026-09-21' });
    expect(reflectionWeeks(null, '2026-09-23')).toEqual({ first: '2026-09-21', last: '2026-09-21' });
    expect(reflectionWeeks('2026-10-05', '2026-09-23')).toEqual({ first: '2026-09-21', last: '2026-09-21' }); // starts later
  });
  it('sums up a week: days, accepted items, projects in first-use order, and up to three learning points', () => {
    const entries = { '2026-09-21': 'a', '2026-09-22': '  ', '2026-09-23': 'b', '2026-09-27': 'Sunday counts', '2026-09-28': 'next week' };
    const org = {
      '2026-09-21': { projectId: 'p2', items: [item('activity', 'A1'), item('learning', 'L1'), item('learning', 'L2')] },
      '2026-09-23': { projectId: 'p1', items: [item('activity', 'A2'), item('learning', 'L3'), item('learning', 'L4'), item('learning', 'X', 'rejected')] },
      '2026-09-28': { projectId: 'p3', items: [item('activity', 'next week')] },
    };
    const projects = [{ id: 'p1', name: 'ERP', description: null }, { id: 'p2', name: 'Invoices', description: null }, { id: 'p3', name: 'Later', description: null }];
    const s = weekSummary('2026-09-21', entries, org, projects);
    expect(s).toEqual({ days: 3, activities: 2, learning: 4, projects: ['Invoices', 'ERP'], standOut: ['L1', 'L2', 'L3'] });
    expect(weekSummary('2026-09-07', entries, org, projects)).toEqual({ days: 0, activities: 0, learning: 0, projects: [], standOut: [] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/reflection.test.ts`

Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Implement**

`src/core/reflection.ts`:

```ts
import type { Project } from './model';
import { acceptedRows, type Org } from './records';
import { addDays, ISO_RE, mondayOf, parseISO } from './dates';

/** A real calendar date that falls on a Monday; anything else (including junk) is false, never an error. */
export function isMonday(d: string): boolean {
  if (!ISO_RE.test(d)) return false;
  const t = parseISO(d);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d && t.getUTCDay() === 1;
}

/** The Mondays a reflection may be written for: the start week up to this week. */
export function reflectionWeeks(start: string | null, today: string): { first: string; last: string } {
  const last = mondayOf(today);
  const first = start ? mondayOf(start) : last;
  return { first: first < last ? first : last, last };
}

export interface WeekSummary { days: number; activities: number; learning: number; projects: string[]; standOut: string[] }

/** What the intern recorded in the week starting `week` (Monday to Sunday). */
export function weekSummary(week: string, entries: Record<string, string>, org: Org, projects: Project[]): WeekSummary {
  const end = addDays(week, 6);
  const inWeek = (d: string) => d >= week && d <= end;
  const dates = Object.keys(org).filter(inWeek).sort();
  const rows = dates.flatMap(d => acceptedRows({ [d]: org[d] }));
  const learning = rows.filter(r => r.kind === 'learning');
  const ids = [...new Set(dates.map(d => org[d].projectId).filter((id): id is string => !!id))];
  return {
    days: Object.keys(entries).filter(d => inWeek(d) && entries[d].trim()).length,
    activities: rows.filter(r => r.kind === 'activity').length,
    learning: learning.length,
    projects: ids.map(id => projects.find(p => p.id === id)?.name).filter((n): n is string => !!n),
    standOut: learning.slice(0, 3).map(r => r.text),
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/reflection.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/reflection.ts tests/unit/reflection.test.ts && git commit -m "feat: reflection helpers for weeks and a summary of what was recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Weekly reflection page

**Files:**
- Create: `src/views/Reflection.vue`
- Modify: `src/router.ts`, `src/App.vue` (`RECORDS`), `src/components/NavIcon.vue`, `src/styles.css`
- Modify: `tests/e2e/helpers.ts` (move `demoAs` here), `tests/e2e/logbook.spec.ts` and `tests/e2e/overview.spec.ts` (import it instead of defining it)
- Create: `tests/e2e/reflection.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 5: `isMonday`, `reflectionWeeks` and `weekSummary`;
  - from Task 4: `useJournal().reflections` and `saveReflection`;
  - from Task 2: `plural`;
  - `shortDate` from records and `ask` from `src/lib/ask`.
- Produces:
  - the route `/reflection/:week?` (name `reflection`), which is interns only, a writing page, and sends supervisors to `/today`;
  - the test ids `rf-title`, `rf-prev`, `rf-next`, `rf-summary`, `rf-text`, `rf-save`, `rf-saved` and `rf-error`;
  - an exported `demoAs(page, who)` in `tests/e2e/helpers.ts`.

- [ ] **Step 1: Write the failing e2e**

Move `demoAs` from `tests/e2e/logbook.spec.ts` into `tests/e2e/helpers.ts` as an exported function with the same body, adding `expect` to that file's Playwright import if it's missing. In `logbook.spec.ts` and `overview.spec.ts`, delete the local copy and import `demoAs` from `./helpers`.

`tests/e2e/reflection.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { asRole, demoAs, nav } from './helpers';

test('an intern writes a reflection beside a summary of the week; it is kept and unsaved text asks first', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  await expect(page.getByTestId('rf-title')).toHaveText(/^Week of \d{1,2} \w+$/);
  await expect(page.getByTestId('rf-next')).toBeDisabled();
  await expect(page.getByTestId('rf-save')).toBeDisabled();
  await page.getByTestId('rf-text').fill('Pairing helped me learn the codebase.');
  await page.getByTestId('rf-save').click();
  await expect(page.getByTestId('rf-saved')).toHaveText('Saved');

  // Last week: the demo seeded a reflection and five journal days.
  await page.getByTestId('rf-prev').click();
  await expect(page.getByTestId('rf-text')).toHaveValue(/^Testing the export endpoint early/);
  await expect(page.getByTestId('rf-summary')).toContainText('5 journal days');
  await expect(page.getByTestId('rf-summary')).toContainText('WHAT STOOD OUT');

  // Kept: switching person reloads the journal from storage.
  await asRole(page, 'Aina Rahman');
  await asRole(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  await expect(page.getByTestId('rf-text')).toHaveValue('Pairing helped me learn the codebase.');

  // Unsaved text asks before leaving; Cancel stays.
  await page.getByTestId('rf-text').fill('Half a thought');
  await nav(page, 'Journal');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/#\/reflection$/);
  await expect(page.getByTestId('rf-text')).toHaveValue('Half a thought');
  await nav(page, 'Journal');
  await page.getByTestId('ask-ok').click();
  await expect(page).toHaveURL(/#\/journal$/);
});

test('a bad week address opens this week, and supervisors have no reflection page', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  const thisWeek = await page.getByTestId('rf-title').textContent();
  await page.evaluate(() => { location.hash = '#/reflection/2026-02-30'; });
  await expect(page.getByTestId('rf-title')).toHaveText(thisWeek ?? '');
  await asRole(page, 'Supervisor');
  await page.evaluate(() => { location.hash = '#/reflection'; });
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByRole('link', { name: /^Reflection/ })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test tests/e2e/reflection.spec.ts --reporter=line`

Expected: FAIL, because there's no Reflection link.

- [ ] **Step 3: Implement**

In `src/router.ts`, add after the `skill` route:

```ts
    { path: '/reflection/:week?', name: 'reflection', component: () => import('./views/Reflection.vue') },
```

In the guard, change the comment and regex to:

```ts
  // Projects, Learning, Skills and Reflection are built from an intern's own journal: interns only, with or without a logbook.
  const records = /^\/(projects|learning|skills|reflection)(\/|$)/.test(to.path);
```

In `src/App.vue`, add `{ to: '/reflection', label: 'Reflection', icon: 'reflection' },` as the last entry of `RECORDS`.

In `src/components/NavIcon.vue`, add to `PATHS`:

```ts
  reflection: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5',
```

`src/views/Reflection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useStudent } from '../stores/student';
import { addDays, todayISO } from '../core/dates';
import { isMonday, reflectionWeeks, weekSummary } from '../core/reflection';
import { shortDate } from '../core/records';
import { plural } from '../core/progress';
import { ask } from '../lib/ask';

const journal = useJournal();
const st = useStudent();
const route = useRoute();
const router = useRouter();

// The page is remounted per address (App keys it by path), so the week is fixed for this instance.
const range = reflectionWeeks((journal.journalOnly ? journal.startDate : st.student?.startDate) ?? null, todayISO());
const asked = String(route.params.week ?? '');
const week = isMonday(asked) && asked >= range.first && asked <= range.last ? asked : range.last;
const prev = week > range.first ? addDays(week, -7) : null;
const next = week < range.last ? addDays(week, 7) : null;
const summary = weekSummary(week, journal.entries, journal.org, journal.projects);
const empty = !summary.days && !summary.activities && !summary.learning && !summary.projects.length;

const saved = ref(journal.reflections[week] ?? '');
const text = ref(saved.value);
const busy = ref(false);
const status = ref<'idle' | 'saved' | 'error'>('idle');
const dirty = computed(() => text.value.trim() !== saved.value);

async function save() {
  busy.value = true;
  status.value = 'idle';
  try {
    await journal.saveReflection(week, text.value);
    saved.value = text.value.trim();
    status.value = 'saved';
  } catch {
    status.value = 'error'; // the text stays in the box
  } finally {
    busy.value = false;
  }
}
const go = (w: string | null) => { if (w) void router.push(`/reflection/${w}`); };
const guard = async () => !dirty.value || ask('Leave without saving your reflection?', 'Leave');
onBeforeRouteLeave(guard);
onBeforeRouteUpdate(guard);
</script>

<template>
  <section class="card rf-head">
    <button type="button" data-testid="rf-prev" aria-label="Previous week" :disabled="!prev" @click="go(prev)">←</button>
    <div>
      <h1 data-testid="rf-title">Week of {{ shortDate(week) }}</h1>
      <p class="muted">{{ shortDate(week) }} – {{ shortDate(addDays(week, 4)) }}</p>
    </div>
    <button type="button" data-testid="rf-next" aria-label="Next week" :disabled="!next" @click="go(next)">→</button>
  </section>
  <div class="rf-body">
    <section class="card" data-testid="rf-summary">
      <h2>Your week</h2>
      <p v-if="empty" class="muted">Nothing recorded this week yet.</p>
      <template v-else>
        <p>{{ plural(summary.days, 'journal day') }} · {{ plural(summary.activities, 'activity', 'activities') }} · {{ plural(summary.learning, 'learning point') }}</p>
        <template v-if="summary.projects.length">
          <p class="caption">YOU WORKED ON</p>
          <ul><li v-for="p in summary.projects" :key="p">{{ p }}</li></ul>
        </template>
        <template v-if="summary.standOut.length">
          <p class="caption">WHAT STOOD OUT</p>
          <ul><li v-for="(s, i) in summary.standOut" :key="i">{{ s }}</li></ul>
        </template>
      </template>
    </section>
    <section class="card">
      <h2>Reflection</h2>
      <textarea v-model="text" data-testid="rf-text" maxlength="5000" rows="10" placeholder="What did you learn this week?" aria-label="What did you learn this week?" @input="status = 'idle'" />
      <div class="rf-actions">
        <button type="button" class="primary" data-testid="rf-save" :disabled="!dirty || busy" @click="save">Save reflection</button>
        <span v-if="status === 'saved'" class="muted" data-testid="rf-saved">Saved</span>
        <span v-if="status === 'error'" class="rf-error" role="alert" data-testid="rf-error">We couldn't save your reflection. Try again.</span>
      </div>
    </section>
  </div>
</template>
```

In `src/styles.css`, add:

```css
.rf-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.rf-head h1 { margin: 0; }
.rf-body { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px; }
.rf-body textarea { width: 100%; box-sizing: border-box; }
.rf-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.rf-error { color: var(--danger); }
@media (max-width: 800px) { .rf-body { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run it to see it pass, plus the specs whose helper moved, then type-check**

Run: `npx playwright test tests/e2e/reflection.spec.ts tests/e2e/logbook.spec.ts tests/e2e/overview.spec.ts --reporter=line && npx vue-tsc --noEmit`

Expected: all pass, and vue-tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add -A src tests && git commit -m "feat: Weekly reflection page for interns, beside a summary of the week

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Search helpers (core)

**Files:**
- Create: `src/core/search.ts`
- Test: `tests/unit/search.test.ts`

**Interfaces:**
- Consumes: `searchEntries` from `src/core/journal.ts`; `acceptedRows`, `skillStats`, `shortDate` and `Org` from records; `Project` from model.
- Produces:
  - `interface Hit { text: string; meta: string; to: string }`, where `text` is what's matched and highlighted and `meta` is a small line above it;
  - `interface Group { name: 'Journal' | 'Projects' | 'Learning' | 'Skills' | 'Reflections'; hits: Hit[] }`;
  - `interface SearchData { entries: Record<string, string>; org: Org; projects: Project[]; reflections: Record<string, string> }`;
  - `searchAll(query: string, data: SearchData, intern: boolean): Group[]`, which returns `[]` for an empty query and leaves out empty groups;
  - `excerpt(text: string, query: string, width = 120): { before: string; match: string; after: string }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../src/core/model';
import { excerpt, searchAll, type SearchData } from '../../src/core/search';

const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `${kind}-${text}`, kind, text, status });
const data: SearchData = {
  entries: { '2026-09-21': 'Built the Invoice export.', '2026-09-22': 'Fixed (a) bug in <b>bold</b> text.', '2026-09-18': 'invoice planning' },
  org: {
    '2026-09-21': { projectId: 'p1', items: [item('learning', 'Invoice totals need rounding'), item('learning', 'Invoice rejected idea', 'rejected'), item('skill', 'Invoice design')] },
  },
  projects: [{ id: 'p1', name: 'Invoice export', description: 'Monthly PDFs' }, { id: 'p2', name: 'Gateway', description: 'Sign-in for INVOICE apps' }],
  reflections: { '2026-09-14': 'Learned invoices.', '2026-09-21': 'Nothing here.' },
};

describe('search', () => {
  it('finds every kind of record ignoring case, in a fixed group order, newest first', () => {
    const groups = searchAll('  INVOICE ', data, true);
    expect(groups.map(g => `${g.name}:${g.hits.length}`)).toEqual(['Journal:2', 'Projects:2', 'Learning:1', 'Skills:1', 'Reflections:1']);
    expect(groups[0].hits.map(h => h.to)).toEqual(['/journal/2026-09-21', '/journal/2026-09-18']);
    expect(groups[1].hits[0]).toEqual({ text: 'Invoice export — Monthly PDFs', meta: '', to: '/projects/p1' });
    expect(groups[2].hits[0]).toEqual({ text: 'Invoice totals need rounding', meta: `${groups[0].hits[0].meta} · Invoice export`, to: '/learning' });
    expect(groups[3].hits[0].to).toBe('/skills/invoice%20design');
    expect(groups[4].hits[0]).toMatchObject({ meta: 'Week of 14 Sept', to: '/reflection/2026-09-14' });
  });
  it('gives supervisors their journal only, drops empty groups, and needs a query', () => {
    expect(searchAll('invoice', data, false).map(g => g.name)).toEqual(['Journal']);
    expect(searchAll('monthly', data, true).map(g => g.name)).toEqual(['Projects']);
    expect(searchAll('   ', data, true)).toEqual([]);
    expect(searchAll('zzz', data, true)).toEqual([]);
  });
  it('treats regex and HTML characters as plain text', () => {
    expect(searchAll('(a)', data, true)[0].hits[0].to).toBe('/journal/2026-09-22');
    expect(searchAll('<b>', data, true)[0].hits).toHaveLength(1);
    expect(excerpt('Fixed (a) bug in <b>bold</b>', '<B>')).toEqual({ before: 'Fixed (a) bug in ', match: '<b>', after: 'bold</b>' });
  });
  it('cuts long text around the first match and marks the cuts', () => {
    expect(excerpt('Built the login page', 'LOGIN')).toEqual({ before: 'Built the ', match: 'login', after: ' page' });
    const long = `${'a '.repeat(100)}needle${' b'.repeat(100)}`;
    const e = excerpt(long, 'needle', 40);
    expect(e.match).toBe('needle');
    expect(e.before.startsWith('…')).toBe(true);
    expect(e.after.endsWith('…')).toBe(true);
    expect((e.before + e.match + e.after).length).toBeLessThanOrEqual(42);
    const start = excerpt(`needle ${'x'.repeat(200)}`, 'needle', 40);
    expect(start.before).toBe('');
    expect(start.after.endsWith('…')).toBe(true);
    expect(excerpt('no match here', 'zzz')).toEqual({ before: 'no match here', match: '', after: '' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/search.test.ts`

Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Implement**

`src/core/search.ts`:

```ts
import type { Project } from './model';
import { acceptedRows, shortDate, skillStats, type Org } from './records';
import { searchEntries } from './journal';

export interface Hit { text: string; meta: string; to: string }
export interface Group { name: 'Journal' | 'Projects' | 'Learning' | 'Skills' | 'Reflections'; hits: Hit[] }
export interface SearchData { entries: Record<string, string>; org: Org; projects: Project[]; reflections: Record<string, string> }

/** Plain substring search, ignoring case; interns search all their records, supervisors only their journal. */
export function searchAll(query: string, data: SearchData, intern: boolean): Group[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  const names = new Map(data.projects.map(p => [p.id, p.name]));
  const groups: Group[] = [
    { name: 'Journal', hits: searchEntries(data.entries, q).map(e => ({ text: e.text, meta: shortDate(e.date), to: `/journal/${e.date}` })) },
  ];
  if (intern) {
    groups.push(
      { name: 'Projects', hits: data.projects.filter(p => has(p.name) || has(p.description))
        .map(p => ({ text: p.description ? `${p.name} — ${p.description}` : p.name, meta: '', to: `/projects/${p.id}` })) },
      { name: 'Learning', hits: acceptedRows(data.org).filter(r => r.kind === 'learning' && has(r.text))
        .map(r => ({ text: r.text, meta: [shortDate(r.date), r.projectId ? names.get(r.projectId) : ''].filter(Boolean).join(' · '), to: '/learning' })) },
      { name: 'Skills', hits: skillStats(data.org).filter(s => has(s.name))
        .map(s => ({ text: s.name, meta: '', to: `/skills/${encodeURIComponent(s.key)}` })) },
      { name: 'Reflections', hits: Object.entries(data.reflections).filter(([, t]) => has(t)).sort(([a], [b]) => b.localeCompare(a))
        .map(([w, t]) => ({ text: t, meta: `Week of ${shortDate(w)}`, to: `/reflection/${w}` })) },
    );
  }
  return groups.filter(g => g.hits.length);
}

/** About `width` characters around the first match, with "…" where the text is cut. */
export function excerpt(text: string, query: string, width = 120): { before: string; match: string; after: string } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const q = query.trim();
  const i = q ? flat.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return { before: flat.length > width ? `${flat.slice(0, width)}…` : flat, match: '', after: '' };
  const room = Math.max(0, width - q.length);
  const to = Math.min(flat.length, Math.max(0, i - Math.floor(room / 2)) + q.length + room);
  const from = Math.max(0, to - q.length - room);
  return {
    before: `${from > 0 ? '…' : ''}${flat.slice(from, i)}`,
    match: flat.slice(i, i + q.length),
    after: `${flat.slice(i + q.length, to)}${to < flat.length ? '…' : ''}`,
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/search.test.ts`

Expected: PASS (4 tests). If the `Week of 14 Sept` assertion fails only because of the month spelling, it's because `shortDate` comes from the ICU locale data: assert with `shortDate('2026-09-14')` instead, and ledger the ruling.

- [ ] **Step 5: Commit**

```bash
git add src/core/search.ts tests/unit/search.test.ts && git commit -m "feat: search across journal, projects, learning, skills and reflections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Search page and the top bar

**Files:**
- Create: `src/views/Search.vue`
- Modify: `src/router.ts`, `src/App.vue`, `src/components/NavIcon.vue`, `src/styles.css`
- Create: `tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 7: `searchAll` and `excerpt`;
  - `useJournal().entries`, `org`, `projects` and `reflections`;
  - `useSession().isSupervisor`.
- Produces:
  - the route `/search` (name `search`), which is a writing page for every role;
  - the test ids `top-search`, `search-input`, `search-group`, `search-result`, `search-more` and `search-empty`.
- App's `RouterView` key changes from `r.fullPath` to `r.path`, so editing `?q=` doesn't remount the page. No other page reads the query string.

- [ ] **Step 1: Write the failing e2e**

`tests/e2e/search.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { asRole, demoAs, iso, lastWeekday, writeEntry } from './helpers';

test('searching from the top bar shows grouped, highlighted results and opens a journal day', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await page.getByTestId('top-search').fill('invoice');
  await page.getByTestId('top-search').press('Enter');
  await expect(page).toHaveURL(/#\/search\?q=invoice$/);
  await expect(page.getByTestId('search-input')).toHaveValue('invoice');
  const groups = page.getByTestId('search-group');
  await expect(groups.first()).toContainText(/^Journal · \d+/);
  await expect(groups.filter({ hasText: /^Projects · 1/ })).toHaveCount(1);
  await expect(page.locator('[data-testid="search-result"] mark').first()).toHaveText(/^invoice$/i);

  await page.getByTestId('search-input').fill('zzzz-nothing');
  await expect(page.getByTestId('search-empty')).toHaveText('Nothing found for “zzzz-nothing”.');
  await expect(page).toHaveURL(/q=zzzz-nothing$/);
  await expect(page.getByTestId('search-input')).toBeFocused(); // typing never remounted the page

  await page.getByTestId('search-input').fill('invoice');
  await groups.first().getByTestId('search-result').first().click();
  await expect(page).toHaveURL(/#\/journal\/\d{4}-\d{2}-\d{2}$/);
});

test('a supervisor searches only their own journal, even after switching from an intern', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await page.getByTestId('top-search').fill('invoice');
  await page.getByTestId('top-search').press('Enter');
  await expect(page.getByTestId('search-group')).not.toHaveCount(1);
  await asRole(page, 'Supervisor');
  await writeEntry(page, iso(lastWeekday()), 'Reviewed the invoice export.');
  await page.getByTestId('top-search').fill('invoice');
  await page.getByTestId('top-search').press('Enter');
  await expect(page.getByTestId('search-group')).toHaveCount(1);
  await expect(page.getByTestId('search-group')).toContainText(/^Journal · 1/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test tests/e2e/search.spec.ts --reporter=line`

Expected: FAIL, because there's no `top-search`.

- [ ] **Step 3: Implement**

In `src/router.ts`, add after the `reflection` route:

```ts
    { path: '/search', name: 'search', component: () => import('./views/Search.vue') },
```

In the guard, change the `writing` line to:

```ts
  const writing = to.path === '/today' || to.path === '/search' || to.path.startsWith('/journal') || records;
```

In `src/components/NavIcon.vue`, add to `PATHS`:

```ts
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
```

In `src/App.vue`:
- Import `ref` from vue and `useRouter` from vue-router.
- Add to the script:

```ts
const router = useRouter();
const topQuery = ref('');
function find() {
  const q = topQuery.value.trim();
  topQuery.value = '';
  void router.push({ path: '/search', query: q ? { q } : {} });
}
```

- Change `page` to:

```ts
const page = computed(() => links.value.find(l => route.path.startsWith(l.to))?.label ?? (route.path === '/search' ? 'Search' : ''));
```

- In the topbar, add this between `<span class="spacer" />` and `<RoleSwitcher />`:

```html
      <form class="top-search" role="search" @submit.prevent="find">
        <input v-model="topQuery" type="search" data-testid="top-search" placeholder="Search your experience" aria-label="Search your experience" />
      </form>
      <RouterLink to="/search" class="top-search-icon" aria-label="Search your experience"><NavIcon name="search" /></RouterLink>
```

- Change the `RouterView` component key to `` :key="`${dataKey}:${r.path}`" ``.

`src/views/Search.vue`:

```vue
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useSession } from '../stores/session';
import { excerpt, searchAll } from '../core/search';

const journal = useJournal();
const route = useRoute();
const router = useRouter();
const intern = !useSession().isSupervisor; // the page remounts when the role's data changes
const LIMIT = 20;

const q = ref(String(route.query.q ?? ''));
// The top bar can search again while this page is open; typing here replaces ?q= without adding history.
watch(() => route.query.q, v => { q.value = String(v ?? ''); });
watch(q, v => { if (v !== String(route.query.q ?? '')) void router.replace({ query: v ? { q: v } : {} }); });

const groups = computed(() => searchAll(q.value, { entries: journal.entries, org: journal.org, projects: journal.projects, reflections: journal.reflections }, intern));
const all = reactive<Record<string, boolean>>({});
</script>

<template>
  <section class="card">
    <h1>Search your experience</h1>
    <input v-model="q" type="search" class="search-big" data-testid="search-input" placeholder="Search your experience" aria-label="Search your experience" autofocus />
  </section>
  <p v-if="!q.trim()" class="muted">{{ intern ? 'Search your journal, projects, learning, skills and reflections.' : 'Search your journal.' }}</p>
  <p v-else-if="!groups.length" class="muted" data-testid="search-empty">Nothing found for “{{ q.trim() }}”.</p>
  <section v-for="g in groups" :key="g.name" class="card" data-testid="search-group">
    <h2>{{ g.name }} · {{ g.hits.length }}</h2>
    <RouterLink v-for="(h, i) in all[g.name] ? g.hits : g.hits.slice(0, LIMIT)" :key="i" :to="h.to" class="search-hit" data-testid="search-result">
      <span v-if="h.meta" class="caption">{{ h.meta }}</span>
      <span v-for="e in [excerpt(h.text, q)]" :key="0">{{ e.before }}<mark v-if="e.match">{{ e.match }}</mark>{{ e.after }}</span>
    </RouterLink>
    <button v-if="g.hits.length > LIMIT && !all[g.name]" type="button" data-testid="search-more" @click="all[g.name] = true">Show all {{ g.hits.length }}</button>
  </section>
</template>
```

In `src/styles.css`, add:

```css
.top-search input { width: 240px; }
.top-search-icon { display: none; color: var(--muted); }
@media (max-width: 640px) { .top-search { display: none; } .top-search-icon { display: inline-flex; } }
.search-big { width: 100%; box-sizing: border-box; font-size: 18px; padding: 12px 14px; }
.search-hit { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--border); color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
.search-hit:first-of-type { border-top: 0; }
.search-hit mark { background: var(--primary-light); color: inherit; border-radius: 3px; padding: 0 2px; }
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run:

```bash
npx playwright test tests/e2e/search.spec.ts --reporter=line
npx vue-tsc --noEmit
npx vitest run
npx vite build --outDir "$TEMP/il-build" --emptyOutDir
npx playwright test --reporter=line
```

Expected: everything passes. If an existing spec breaks only because of the new top-bar input (for example, a `getByRole('searchbox')` or a role-switch layout check), update that spec's selector to be specific, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add -A src tests && git commit -m "feat: Search your experience from the top bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
