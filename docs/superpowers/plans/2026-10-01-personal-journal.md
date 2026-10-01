# Personal Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, week-by-week journal for supervisors and for interns whose university has no logbook template.

**Architecture:**
- Backend: a new `journal_entries` table, plus `users.journal_start_date`. Three routes (`GET`/`PUT /journal`, `PUT /journal/{date}`) only ever touch the signed-in user's own rows.
- Prototype:
  - `journalWeeks()` (pure) numbers the weeks;
  - the `Repository` gains three journal methods (IndexedDB and HTTP);
  - a `useJournal` store feeds a new `/journal` screen (week table → day cards → autosaving editor);
  - Onboarding gains "My university has no logbook", which makes an intern journal-only.

**Tech Stack:** Laravel 12 + PHPUnit (backend); Vue 3 + Pinia + vue-router + idb + Vitest + Playwright (prototype).

**Spec:** `intern-logbook/docs/superpowers/specs/2026-10-01-personal-journal-design.md`

## Global Constraints

- **Privacy:** only the writer can read their journal. No endpoint takes another person's id, and no supervisor, review or badge query reads `journal_entries`.
- **Unchanged:** interns with a logbook template keep the Notepad, `daily_entries`, placements, weeks, reviews and badges exactly as they are.
- **Journal-only intern:** has no template and has a journal start date set. Their sidebar shows only **Journal**.
- **Week 1:** starts on the Monday of `startDate`. With no `startDate`, the Monday of the earliest entry; with neither, the current week. The last week contains today, and future weeks aren't listed. A future `startDate` gives one week, the current one.
- **Day cards:** Monday to Sunday ("Mon 3"). **Logged** when the day has an entry; future days are disabled; the selected day is highlighted.
- **Editor autosave:** 800 ms debounce; status "Saving…" then "Saved". A failed save shows the error toast, keeps the text and retries on the next keystroke.
- **Server rules:**
  - `date` is a valid `Y-m-d`, not after today in `Asia/Kuala_Lumpur`;
  - `text` is at most 20,000 characters;
  - empty or whitespace-only text deletes the day;
  - `PUT` endpoints return 204, and validation failures 422.
- **Branches:** backend `personal-journal-api` (rizurf-logbook-app, from `master`); prototype `personal-journal-prototype` (intern-logbook, already holds the spec commit). The names must differ, because both repos share one GitHub repo.
- **No pushing or merging** until the user asks.
- **Never `npm run build`**, because it writes to `C:\xampp\htdocs`. Use `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
- **Backend tests run locally** with PHP 8.4 on SQLite in memory:

  ```bash
  DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test
  ```

  GitHub CI (MariaDB) stays the final word when the branch is pushed.

## Review Focus

1. **Entry before Week 1:** a journal-only intern who wrote before their start date, or whose start date is still in the future and who writes today. A person expects every entry they wrote to stay visible. `journalWeeks` therefore starts Week 1 at the earliest of the start date and any entry (pinned in Task 2).
2. **Server date near midnight in Malaysia:** at 00:30 KL on the 22nd (still the 21st in UTC), writing for the 22nd must be allowed. Pinned in Task 1 (`test_today_is_malaysian_today`).
3. **Another person's journal through the supervisor's intern endpoints:** a supervisor reading an intern's logbook must never see that intern's journal text. Pinned in Task 1 (`test_nobody_else_can_read_it`).
4. **Switching role in the browser demo:** the supervisor's journal and an intern's are separate owners. Changing role must load the new owner's journal and not show the previous one. Pinned in Task 4 e2e (privacy step).
5. **Deleting a day's text:** clearing the box must remove **Logged** and leave nothing behind after a reload. Pinned in Task 3 (IndexedDB delete) and Task 1 (server delete).

---

### Task 1: Backend journal API

Work in `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app` on a new branch: `git switch -c personal-journal-api` (from `master`). Paths below are relative to `appv3/backend`.

**Files:**
- Create: `database/migrations/2026_10_01_000001_add_personal_journal.php`
- Create: `app/Models/JournalEntry.php`
- Create: `app/Http/Controllers/JournalController.php`
- Modify: `routes/portal.php` (import, plus three routes after the `summaries` route)
- Modify: `resources/openapi.json` (paths `/journal` and `/journal/{date}`)
- Test: `tests/Feature/JournalTest.php`

**Interfaces:**
- Produces (HTTP):
  - `GET /api/v1/journal` → `200 { "startDate": "YYYY-MM-DD" | null, "entries": [{ "date": "YYYY-MM-DD", "text": string }] }`, sorted by date.
  - `PUT /api/v1/journal/{date}` with `{ "text": string }` → 204.
  - `PUT /api/v1/journal` with `{ "startDate": "YYYY-MM-DD" }` → 204.

- [ ] **Step 1: Write the failing test**

`tests/Feature/JournalTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Tests\TestCase;

/** The private journal: TestCase pins "today" to 2026-09-21 12:00 in Kuala Lumpur. */
class JournalTest extends TestCase
{
    public function test_you_can_write_and_read_your_own_journal(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the new interns.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/2026-09-18', ['text' => 'Planned the sprint.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the new interns twice.'])->assertNoContent();

        $this->portal('GET', '/api/v1/journal')->assertOk()->assertExactJson([
            'startDate' => null,
            'entries' => [
                ['date' => '2026-09-18', 'text' => 'Planned the sprint.'],
                ['date' => '2026-09-21', 'text' => 'Met the new interns twice.'],
            ],
        ]);
    }

    public function test_nobody_else_can_read_it(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Private thoughts.'])->assertNoContent();

        foreach (['supervisor-1', 'student-3', 'student-2'] as $other) {
            $this->be($this->user($other));
            $this->portal('GET', '/api/v1/journal')->assertOk()->assertExactJson(['startDate' => null, 'entries' => []]);
        }

        // The supervisor's view of this intern's logbook doesn't carry the journal either.
        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()->assertDontSee('Private thoughts.');
    }

    public function test_a_future_or_impossible_day_is_refused(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-22', ['text' => 'Tomorrow.'])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/2026-02-30', ['text' => 'Not a day.'])->assertUnprocessable();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries', []);
    }

    public function test_today_is_malaysian_today(): void
    {
        // 00:30 on the 22nd in Kuala Lumpur is still the 21st in UTC.
        $this->travelTo(Carbon::parse('2026-09-22 00:30:00', 'Asia/Kuala_Lumpur'));
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-22', ['text' => 'Early start.'])->assertNoContent();
    }

    public function test_empty_text_deletes_the_day(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Draft.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => '   '])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries', []);
    }

    public function test_text_over_20000_characters_is_refused(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => str_repeat('a', 20001)])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => str_repeat('a', 20000)])->assertNoContent();
    }

    public function test_setting_the_start_date(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal', ['startDate' => '2026-08-03'])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('startDate', '2026-08-03');
        $this->portal('PUT', '/api/v1/journal', ['startDate' => 'soon'])->assertUnprocessable();
    }

    public function test_you_must_be_signed_in(): void
    {
        $this->portal('GET', '/api/v1/journal')->assertUnauthorized();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'x'])->assertUnauthorized();
        $this->portal('PUT', '/api/v1/journal', ['startDate' => '2026-08-03'])->assertUnauthorized();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `appv3/backend`): `DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test --filter JournalTest`
Expected: FAIL. The routes don't exist yet, so the requests get 404 where 204/200/401 are asserted.

- [ ] **Step 3: Write the migration, the model, the controller and the routes**

`database/migrations/2026_10_01_000001_add_personal_journal.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The private journal: one row per person per day, and the day its Week 1 starts. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->date('date');
            $table->mediumText('body');
            $table->timestamps();
            $table->unique(['user_id', 'date']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->date('journal_start_date')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('journal_start_date');
        });
        Schema::dropIfExists('journal_entries');
    }
};
```

`app/Models/JournalEntry.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One day of someone's private journal (JournalController). */
class JournalEntry extends Model
{
    protected $fillable = ['user_id', 'date', 'body'];
}
```

`app/Http/Controllers/JournalController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

/**
 * A private journal for people who don't keep a logbook: supervisors, and interns whose university has none.
 * Only the signed-in person's own entries are ever read or written; no route takes someone else's id.
 */
final class JournalController extends Controller
{
    private const TIMEZONE = 'Asia/Kuala_Lumpur';

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $start = $user->journal_start_date;

        return response()->json([
            'startDate' => $start === null ? null : substr((string) $start, 0, 10),
            'entries' => JournalEntry::query()->where('user_id', $user->id)->orderBy('date')->get()
                ->map(fn (JournalEntry $e): array => ['date' => substr((string) $e->date, 0, 10), 'text' => (string) $e->body])
                ->all(),
        ]);
    }

    public function save(Request $request, string $date): Response
    {
        Validator::make(['date' => $date], [
            'date' => ['date_format:Y-m-d', 'before_or_equal:'.now(self::TIMEZONE)->toDateString()],
        ], [
            'date.before_or_equal' => "You can't write in your journal for a day that hasn't happened yet.",
        ])->validate();
        $text = (string) $request->validate(['text' => ['present', 'nullable', 'string', 'max:20000']])['text'];

        /** @var User $user */
        $user = $request->user();
        $key = ['user_id' => $user->id, 'date' => $date];
        if (trim($text) === '') {
            JournalEntry::query()->where($key)->delete();
        } else {
            JournalEntry::query()->updateOrCreate($key, ['body' => $text]);
        }

        return response()->noContent();
    }

    public function start(Request $request): Response
    {
        $start = $request->validate(['startDate' => ['required', 'date_format:Y-m-d']])['startDate'];

        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['journal_start_date' => $start])->save();

        return response()->noContent();
    }
}
```

`routes/portal.php`:
- add `use App\Http\Controllers\JournalController;` among the imports (alphabetical, after `HealthController`);
- add after the `summaries` route:

```php
    // The private journal (supervisors, and interns without a logbook): always the signed-in person's own.
    Route::get('journal', [JournalController::class, 'show'])->middleware('auth');
    Route::put('journal', [JournalController::class, 'start'])->middleware('auth');
    Route::put('journal/{date}', [JournalController::class, 'save'])->middleware('auth');
```

- [ ] **Step 4: Run JournalTest to verify it passes**

Run: `DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test --filter JournalTest`
Expected: PASS (8 tests).

- [ ] **Step 5: Document the routes in OpenAPI**

Run: `DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test --filter OpenApiTest`
Expected: FAIL in `test_every_route_is_documented_and_nothing_else`, because `/journal` and `/journal/{date}` are missing.

Add to `resources/openapi.json` under `paths`, after `/summaries`. Use the Edit tool, since the file is UTF-8 and has curly quotes elsewhere.

```json
    "/journal": {
      "get": {
        "summary": "Read the signed-in person's private journal.",
        "responses": {
          "200": { "description": "OK." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Read Journal",
          "purpose": "Show someone their own private journal, week by week",
          "use_when": ["A supervisor, or an intern without a logbook, opens their journal"],
          "do_not_use_when": ["Reading an intern's logbook notes (use GET /me/logbook)"],
          "inputs": [],
          "outputs": ["startDate", "entries[].date", "entries[].text"],
          "requires": ["Signed-in session"],
          "related_endpoints": ["PUT /journal/{date}", "PUT /journal"],
          "tags": ["journal", "diary", "private", "personal"]
        }
      },
      "put": {
        "summary": "Set the day the signed-in person's journal starts (its Week 1).",
        "responses": {
          "204": { "description": "Saved." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Set Journal Start",
          "purpose": "Number journal weeks from the start of an internship",
          "use_when": ["An intern without a logbook sets up their journal"],
          "do_not_use_when": ["Setting up a logbook internship (use PUT /me/internship)"],
          "inputs": ["startDate"],
          "outputs": [],
          "requires": ["Signed-in session"],
          "related_endpoints": ["GET /journal"],
          "tags": ["journal", "start date", "setup"]
        }
      }
    },
    "/journal/{date}": {
      "put": {
        "summary": "Save one day of the signed-in person's private journal; empty text deletes it.",
        "parameters": [
          { "name": "date", "in": "path", "required": true, "schema": { "type": "string", "format": "date" } }
        ],
        "responses": {
          "204": { "description": "Saved." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Save Journal Day",
          "purpose": "Write down a private note about a day",
          "use_when": ["Someone types in their journal"],
          "do_not_use_when": ["An intern's logbook notepad (use PUT /me/journal/weeks/{weekNumber}/daily)"],
          "inputs": ["date", "text"],
          "outputs": [],
          "requires": ["Signed-in session", "The day isn't in the future"],
          "related_endpoints": ["GET /journal"],
          "tags": ["journal", "diary", "private", "note"]
        }
      }
    },
```

Run the OpenApiTest again. Expected: PASS. If a test asserts something about these entries that isn't covered here (for example non-empty `inputs`/`outputs` arrays), rule on it in the ledger and fill the field to satisfy the test.

- [ ] **Step 6: Run the whole backend suite, Pint and PHPStan**

Run:
- `DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test`
- `C:/Users/User/php84/php.exe vendor/bin/pint --test`
- `C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --memory-limit=1G`

Expected: all pass. If a failure also happens on `master` (an SQLite-only difference), note it in the ledger and confirm it isn't caused by this branch with `git stash`.

- [ ] **Step 7: Commit**

```bash
git add appv3/backend/database/migrations/2026_10_01_000001_add_personal_journal.php appv3/backend/app/Models/JournalEntry.php appv3/backend/app/Http/Controllers/JournalController.php appv3/backend/routes/portal.php appv3/backend/resources/openapi.json appv3/backend/tests/Feature/JournalTest.php
git commit -m "feat: private journal API (GET/PUT /journal, PUT /journal/{date})"
```

---

### Task 2: Week numbering (`journalWeeks`)

Work in `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook` on branch `personal-journal-prototype`.

**Files:**
- Create: `src/core/journal.ts`
- Test: `tests/unit/journal.test.ts`

**Interfaces:**
- Produces:
  - `export interface JournalWeek { n: number; start: string; end: string }`, where `start` is a Monday and `end` the Sunday after it, both ISO dates;
  - `export function journalWeeks(startDate: string | null, entryDates: string[], today: string): JournalWeek[]`.

- [ ] **Step 1: Write the failing test**

`tests/unit/journal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { journalWeeks } from '../../src/core/journal';

const TODAY = '2026-10-01'; // a Thursday; its week starts Monday 2026-09-28

describe('journalWeeks', () => {
  it('numbers weeks from the Monday of the start date up to this week', () => {
    const w = journalWeeks('2026-08-05', [], TODAY);
    expect(w[0]).toEqual({ n: 1, start: '2026-08-03', end: '2026-08-09' });
    expect(w.at(-1)).toEqual({ n: 9, start: '2026-09-28', end: '2026-10-04' });
    expect(w).toHaveLength(9);
  });
  it('without a start date, starts at the week of the earliest entry', () => {
    const w = journalWeeks(null, ['2026-09-16', '2026-09-10'], TODAY);
    expect(w.map(x => x.start)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });
  it('with nothing at all, is just this week', () => {
    expect(journalWeeks(null, [], TODAY)).toEqual([{ n: 1, start: '2026-09-28', end: '2026-10-04' }]);
  });
  it('a start date in the future gives just this week', () => {
    expect(journalWeeks('2026-11-02', [], TODAY)).toEqual([{ n: 1, start: '2026-09-28', end: '2026-10-04' }]);
  });
  it('never hides an entry written before the start date', () => {
    expect(journalWeeks('2026-09-21', ['2026-09-10'], TODAY)[0]).toEqual({ n: 1, start: '2026-09-07', end: '2026-09-13' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/journal.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/core/journal".

- [ ] **Step 3: Write the implementation**

`src/core/journal.ts`:

```ts
import { addDays, mondayOf } from './dates';

export interface JournalWeek { n: number; start: string; end: string }

/**
 * The journal's weeks, Week 1 first, up to the week containing today. Week 1 starts on the Monday of the
 * earliest of: the start date, any entry, and today, so a future start date still shows this week and an
 * entry written before the start date is never hidden.
 */
export function journalWeeks(startDate: string | null, entryDates: string[], today: string): JournalWeek[] {
  const first = [startDate ?? today, ...entryDates, today].sort()[0];
  const out: JournalWeek[] = [];
  for (let m = mondayOf(first), n = 1; m <= mondayOf(today); m = addDays(m, 7), n++) out.push({ n, start: m, end: addDays(m, 6) });
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/journal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/journal.ts tests/unit/journal.test.ts
git commit -m "feat: number the journal's weeks"
```

---

### Task 3: Journal storage in both repositories

**Files:**
- Modify: `src/core/model.ts` (add `Journal`)
- Modify: `src/data/repository.ts` (three methods on `Repository`)
- Modify: `src/data/idb.ts` (DB version 2, a `journal` store, the methods, and `reset` clears it)
- Modify: `src/data/http.ts` (the methods)
- Test: `tests/unit/data.test.ts`, `tests/unit/http.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Task 1's HTTP shapes are listed under its Interfaces.
- Produces:
  - `export interface Journal { startDate: string | null; entries: { date: string; text: string }[] }` (in `src/core/model.ts`);
  - on `Repository`:
    - `getJournal(owner: string): Promise<Journal>` (entries sorted by date);
    - `putJournalEntry(owner: string, date: string, text: string): Promise<void>` (blank text deletes);
    - `setJournalStart(owner: string, date: string): Promise<void>`.

  `owner` is the session role: a student id, or `'supervisor'`. The HTTP repository ignores it, because the server knows who's signed in.

Ruling recorded in the plan: the spec lists these methods without `owner`. The browser demo has several people in one database, so the methods take the owner, as `getNotes(studentId)` already does. Cost if wrong: one parameter.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('IdbRepository', ...)` block in `tests/unit/data.test.ts`:

```ts
  it('keeps one private journal per owner, sorted, and a blank day deletes it', async () => {
    const r = fresh();
    expect(await r.getJournal('supervisor')).toEqual({ startDate: null, entries: [] });
    await r.putJournalEntry('supervisor', '2026-09-21', 'Met the interns.');
    await r.putJournalEntry('supervisor', '2026-09-18', 'Planned.');
    await r.putJournalEntry('student-aina', '2026-09-21', 'Mine.');
    await r.setJournalStart('student-aina', '2026-08-03');
    expect(await r.getJournal('supervisor')).toEqual({ startDate: null, entries: [
      { date: '2026-09-18', text: 'Planned.' }, { date: '2026-09-21', text: 'Met the interns.' },
    ] });
    expect(await r.getJournal('student-aina')).toEqual({ startDate: '2026-08-03', entries: [{ date: '2026-09-21', text: 'Mine.' }] });
    await r.putJournalEntry('supervisor', '2026-09-21', '  ');
    expect((await r.getJournal('supervisor')).entries.map(e => e.date)).toEqual(['2026-09-18']);
    await r.reset();
    expect(await r.getJournal('student-aina')).toEqual({ startDate: null, entries: [] });
  });
```

Append to `tests/unit/http.test.ts` (a new `describe` at the end of the file):

```ts
describe('HttpRepository journal', () => {
  const me = { id: 'student-1', name: 'Aisha Rahman', role: 'student' as const };
  it('reads, saves a day and sets the start, always as the signed-in person', async () => {
    routes['GET journal'] = () => json(200, { startDate: null, entries: [{ date: '2026-09-21', text: 'Hi' }] });
    routes['PUT journal/2026-09-21'] = () => new Response(null, { status: 204 });
    routes['PUT journal'] = () => new Response(null, { status: 204 });
    const r = new HttpRepository(me);
    expect(await r.getJournal('ignored')).toEqual({ startDate: null, entries: [{ date: '2026-09-21', text: 'Hi' }] });
    await r.putJournalEntry('ignored', '2026-09-21', 'Hello');
    await r.setJournalStart('ignored', '2026-08-03');
    expect(calls.map(c => [c.method, c.path, c.body])).toEqual([
      ['GET', 'journal', undefined],
      ['PUT', 'journal/2026-09-21', JSON.stringify({ text: 'Hello' })],
      ['PUT', 'journal', JSON.stringify({ startDate: '2026-08-03' })],
    ]);
  });
});
```

If `HttpRepository`'s constructor in `http.test.ts` is built from a different `Me` shape, copy the one the file already uses. The `Me` type is `{ id; name; role: 'student' | 'supervisor' }` in `src/data/api.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/data.test.ts tests/unit/http.test.ts`
Expected: FAIL with "r.getJournal is not a function", in both files.

- [ ] **Step 3: Write the implementation**

`src/core/model.ts`, after `NotepadEntry`:

```ts
/** A person's private journal (supervisors, and interns whose university has no logbook). */
export interface Journal { startDate: string | null; entries: { date: string; text: string }[] }
```

`src/data/repository.ts`:
- add `Journal` to the type import;
- add to the interface, after `putNote`:

```ts
  /** The private journal of `owner` (a student id or 'supervisor'); the server ignores `owner` and uses who's signed in. */
  getJournal(owner: string): Promise<Journal>;
  /** Blank text deletes the day. */
  putJournalEntry(owner: string, date: string, text: string): Promise<void>;
  setJournalStart(owner: string, date: string): Promise<void>;
```

`src/data/idb.ts`:
- add `Journal` to the type import;
- change `STORES` to `['templates', 'students', 'notes', 'fills', 'actions', 'journal'] as const`;
- replace the `openDB` call so existing browsers upgrade:

```ts
    this.dbp ??= openDB(this.name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('templates', { keyPath: 'id' });
          db.createObjectStore('students', { keyPath: 'id' });
          db.createObjectStore('notes', { keyPath: ['studentId', 'date'] }).createIndex('byStudent', 'studentId');
          db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
          db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        }
        // The journal start date lives in the same store, under the date key 'start'.
        if (oldVersion < 2) db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
      },
    });
```

- add the methods, after `putNote`:

```ts
  async getJournal(owner: string): Promise<Journal> {
    const rows: { owner: string; date: string; text: string }[] = await (await this.db()).getAllFromIndex('journal', 'byOwner', owner);
    return {
      startDate: rows.find(r => r.date === 'start')?.text ?? null,
      entries: rows.filter(r => r.date !== 'start').map(r => ({ date: r.date, text: r.text })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
  async putJournalEntry(owner: string, date: string, text: string): Promise<void> {
    const db = await this.db();
    if (text.trim()) await db.put('journal', { owner, date, text });
    else await db.delete('journal', [owner, date]);
  }
  async setJournalStart(owner: string, date: string): Promise<void> { await (await this.db()).put('journal', { owner, date: 'start', text: date }); }
```

`src/data/http.ts`:
- add `Journal` to the type import;
- add the methods, after `putNote`:

```ts
  // The journal is always the signed-in person's own; the server takes no owner, so `_owner` is unused.
  async getJournal(_owner: string): Promise<Journal> { return (await api<Journal>('journal')).data; }
  async putJournalEntry(_owner: string, date: string, text: string): Promise<void> { await api(`journal/${date}`, { method: 'PUT', body: { text } }); }
  async setJournalStart(_owner: string, date: string): Promise<void> { await api('journal', { method: 'PUT', body: { startDate: date } }); }
```

If ESLint or `vue-tsc` flags the unused `_owner`, check how the repo handles unused parameters (`noUnusedParameters` in `tsconfig`). An underscore prefix is the usual escape. Ledger whatever you choose.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/data.test.ts tests/unit/http.test.ts`
Expected: PASS.

Then run `npx vue-tsc --noEmit`. Expected: no errors (both repositories implement the new methods).

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts src/data/repository.ts src/data/idb.ts src/data/http.ts tests/unit/data.test.ts tests/unit/http.test.ts
git commit -m "feat: journal storage in IndexedDB and over the API"
```

---

### Task 4: Journal screen, store, routing and Onboarding

**Files:**
- Create: `src/stores/journal.ts`
- Create: `src/views/Journal.vue`
- Modify: `src/router.ts` (the `/journal` route and the guard)
- Modify: `src/App.vue` (links)
- Modify: `src/views/student/Onboarding.vue` (the "no logbook" choice)
- Modify: `src/styles.css` (journal layout, day cards)
- Test: `tests/e2e/journal.spec.ts`

**Interfaces:**
- Consumes:
  - `journalWeeks(startDate, entryDates, today): JournalWeek[]` (Task 2);
  - `repo().getJournal(owner)`, `repo().putJournalEntry(owner, date, text)` and `repo().setJournalStart(owner, date)` (Task 3).
- Produces: the `useJournal` store, with:
  - `owner: Ref<string | null>`, `startDate: Ref<string | null>`, `entries: Ref<Record<string, string>>`, `journalOnly: ComputedRef<boolean>`;
  - `load(owner: string): Promise<void>`, `save(date: string, text: string): Promise<void>`, `start(owner: string, date: string): Promise<void>`.

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/journal.spec.ts` (browser-only demo mode; each test gets a fresh browser context, so a fresh IndexedDB):

```ts
import { expect, test } from '@playwright/test';
import { asRole, iso, nav } from './helpers';

const today = iso(new Date());
const day = (page: import('@playwright/test').Page, d: string) => page.locator(`[data-testid="journal-day"][data-date="${d}"]`);

test('a supervisor keeps a private journal that survives a reload', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Journal');
  await expect(day(page, today)).toHaveAttribute('aria-pressed', 'true');
  await expect(day(page, today)).not.toContainText('Logged');

  await page.getByTestId('journal-text').fill('Met the new interns.');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');
  await expect(day(page, today)).toContainText('Logged');

  await page.reload();
  await expect(page.getByTestId('journal-text')).toHaveValue('Met the new interns.');

  // Clearing the day removes it.
  await page.getByTestId('journal-text').fill('');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');
  await page.reload();
  await expect(day(page, today)).not.toContainText('Logged');
});

test('an intern without a logbook gets only the journal, and nobody else can read it', async ({ page }) => {
  const start = new Date(); start.setDate(start.getDate() - 21);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Daniel Lim');
  await page.getByTestId('onb-university').selectOption('none');
  await expect(page.getByTestId('onb-end')).toBeHidden();
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-save').click();

  await expect(page).toHaveURL(/#\/journal$/);
  await expect(page.getByTestId('journal-week')).toHaveCount(4); // 21 days back: this week plus three before it
  for (const name of ['Notepad', 'Logbook builder', 'Export']) await expect(page.getByRole('link', { name })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Journal' })).toBeVisible();

  await page.getByTestId('journal-text').fill('Private thoughts.');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');

  await asRole(page, 'Supervisor');
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-text')).toHaveValue('');
  await expect(day(page, today)).not.toContainText('Logged');

  // Back as Daniel, the journal is still his; going to the Notepad lands on the journal.
  await asRole(page, 'Daniel Lim');
  await page.goto('/intern-logbook/#/student/notepad');
  await expect(page).toHaveURL(/#\/journal$/);
  await expect(page.getByTestId('journal-text')).toHaveValue('Private thoughts.');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/journal.spec.ts`
Expected: FAIL. There is no "Journal" link for the supervisor, and no `none` option in Onboarding.

- [ ] **Step 3: Write the store**

`src/stores/journal.ts`:

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { repo } from '../data/repository';
import { useSession } from './session';
import { useStudent } from './student';

/** The signed-in person's private journal. Loaded per owner (the session role), so switching role never shows someone else's. */
export const useJournal = defineStore('journal', () => {
  const owner = ref<string | null>(null);
  const startDate = ref<string | null>(null);
  const entries = ref<Record<string, string>>({});

  /** An intern with no logbook template who chose the journal in Onboarding. */
  const journalOnly = computed(() => {
    const session = useSession();
    return !session.isSupervisor && owner.value === session.role && !!startDate.value && !useStudent().student?.templateId;
  });

  async function load(o: string) {
    const j = await repo().getJournal(o);
    startDate.value = j.startDate;
    entries.value = Object.fromEntries(j.entries.map(e => [e.date, e.text]));
    owner.value = o;
  }
  async function save(date: string, text: string) {
    if (!owner.value) throw new Error('No journal loaded.');
    await repo().putJournalEntry(owner.value, date, text);
    const next = { ...entries.value };
    if (text.trim()) next[date] = text; else delete next[date];
    entries.value = next;
  }
  async function start(o: string, date: string) {
    await repo().setJournalStart(o, date);
    await load(o);
  }

  return { owner, startDate, entries, journalOnly, load, save, start };
});
```

- [ ] **Step 4: Write the route and the guard**

`src/router.ts`:
- add `import { useJournal } from './stores/journal';`;
- add the route before the catch-all: `{ path: '/journal', component: () => import('./views/Journal.vue') },`;
- replace `router.beforeEach` with:

```ts
router.beforeEach(async to => {
  const session = useSession();
  if (to.path.startsWith('/supervisor') && !session.isSupervisor) return '/';
  const isJournal = to.path === '/journal';
  if (!isJournal && !to.path.startsWith('/student')) return true;

  const journal = useJournal();
  if (journal.owner !== session.role) await journal.load(session.role);
  if (session.isSupervisor) return isJournal ? true : '/';

  const st = useStudent();
  if (st.loadedFor !== session.role) await st.load(session.role);
  // An intern without a logbook only has the journal (and Onboarding, to pick a university later).
  if (journal.journalOnly) return isJournal || to.name === 'onboarding' ? true : '/journal';
  if (isJournal) return '/';
  const needsSetup = !st.student?.templateId || st.templateMissing || !st.student.startDate;
  if (needsSetup && to.name !== 'onboarding') return { name: 'onboarding' };
  return true;
});
```

- [ ] **Step 5: Write the sidebar links**

`src/App.vue`:
- add `import { useJournal } from './stores/journal';` and `const journal = useJournal();`;
- replace the `links` computed:

```ts
const links = computed(() => session.isSupervisor
  ? [
      { to: '/supervisor/templates', label: 'Templates', icon: 'templates' },
      { to: '/supervisor/review', label: 'Review', icon: 'review' },
      { to: '/journal', label: 'Journal', icon: 'notepad' },
    ]
  : journal.journalOnly
    ? [{ to: '/journal', label: 'Journal', icon: 'notepad' }]
    : [
        { to: '/student/notepad', label: 'Notepad', icon: 'notepad' },
        { to: '/student/builder', label: 'Logbook builder', icon: 'builder' },
        { to: '/student/export', label: 'Export', icon: 'export' },
        { to: '/student/onboarding', label: 'My internship', icon: 'internship' },
      ]);
```

- in the `dataKey` computed, key the journal by its loaded owner, so switching role remounts the screen with the new owner's data:

```ts
const dataKey = computed(() => (session.isSupervisor ? `supervisor:${journal.owner}` : `${student.loadedFor ?? 'loading'}:${journal.owner}`));
```

- [ ] **Step 6: Write the "no logbook" choice in Onboarding**

`src/views/student/Onboarding.vue`:
- add `import { useJournal } from '../../stores/journal';` and `const journal = useJournal();`;
- replace `save()`:

```ts
const NONE = 'none';
async function save() {
  try {
    if (form.value.templateId === NONE) {
      if (!form.value.start) { toast.show('Pick the day your internship started.', true); return; }
      await journal.start(st.student!.id, form.value.start);
      toast.show('Saved');
      await router.push('/journal');
      return;
    }
    if (!form.value.templateId || !form.value.start || !form.value.end) { toast.show('Pick your university and both dates.', true); return; }
    await st.setup(form.value.templateId, form.value.start, form.value.end);
    toast.show('Saved');
    await router.push('/student/notepad');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
```

- in the template, add the option after the `v-for` option, and hide the end date for it:

```html
          <option :value="NONE">My university has no logbook (keep a private journal)</option>
```

```html
      <label>{{ form.templateId === NONE ? 'Internship started on' : 'Start date' }} <input v-model="form.start" data-testid="onb-start" type="date" /></label>
      <label v-if="form.templateId !== NONE">End date <input v-model="form.end" data-testid="onb-end" type="date" /></label>
```

- [ ] **Step 7: Write the screen**

`src/views/Journal.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { addDays, eachDay, mondayOf, parseISO, todayISO } from '../core/dates';
import { journalWeeks } from '../core/journal';
import { debounce } from '../lib/debounce';
import { errorText } from '../lib/errors';

const journal = useJournal();
const toast = useToast();
const today = todayISO();
const weeks = computed(() => journalWeeks(journal.startDate, Object.keys(journal.entries), today));
const week = ref(mondayOf(today));
const days = computed(() => eachDay(week.value, addDays(week.value, 6)));
const selected = ref(today);
const text = ref(journal.entries[today] ?? '');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref('');
let pending: { date: string; text: string } | null = null;

async function persist() {
  const p = pending;
  if (!p) return;
  pending = null;
  try {
    await journal.save(p.date, p.text);
    status.value = 'saved';
    savedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    pending = pending ?? p; // keep it (unless newer text arrived) and retry on the next edit
    status.value = 'error';
    toast.show(`Couldn't save your journal: ${errorText(e)} It's kept here and will retry when you type again.`, true);
  }
}
const saver = debounce(persist, 800);
const flush = () => saver.flush();

function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  pending = { date: selected.value, text: text.value };
  status.value = 'saving';
  saver.call();
}
async function pick(d: string) {
  if (d > today) return;
  await flush();
  selected.value = d;
  text.value = journal.entries[d] ?? '';
  status.value = 'idle';
}
async function pickWeek(start: string) {
  week.value = start;
  const end = addDays(start, 6);
  await pick(end < today ? end : today);
}

const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
const onPageHide = () => { void flush(); };
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  void flush();
});
onBeforeRouteLeave(async () => { await flush(); });

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseISO(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const short = (d: string) => fmt(d, { day: 'numeric', month: 'short' });
const card = (d: string) => `${fmt(d, { weekday: 'short' })} ${Number(d.slice(8))}`;
const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
</script>

<template>
  <div class="journal">
    <section class="card weeks">
      <h1>Journal</h1>
      <p class="muted">Private: only you can read it.</p>
      <div class="scroll">
      <table class="list">
        <thead><tr><th>Week</th><th>Dates</th></tr></thead>
        <tbody>
          <tr v-for="w in weeks" :key="w.start" data-testid="journal-week" :class="{ selected: w.start === week }">
            <th scope="row"><button type="button" class="link" :aria-pressed="w.start === week" @click="pickWeek(w.start)">Week {{ w.n }}</button></th>
            <td class="mono">{{ short(w.start) }} – {{ short(w.end) }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>
    <div class="journal-main">
      <section class="card">
        <h2>Daily entries</h2>
        <div class="day-cards">
          <button v-for="d in days" :key="d" type="button" class="day-card" data-testid="journal-day" :data-date="d"
            :aria-pressed="d === selected" :disabled="d > today" @click="pick(d)">
            <span class="mono">{{ card(d) }}</span>
            <span v-if="journal.entries[d]?.trim()" class="logged">Logged</span>
          </button>
        </div>
      </section>
      <section class="card note">
        <header>
          <h2>{{ fmt(selected, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h2>
          <span class="muted" data-testid="journal-status" aria-live="polite">{{ statusText }}</span>
        </header>
        <textarea data-testid="journal-text" :value="text" aria-label="Journal entry" placeholder="How did today go? Only you can read this; it saves automatically."
          @input="onInput" @blur="flush" />
      </section>
    </div>
  </div>
</template>
```

Check that `button.link` exists in `styles.css` (Builder uses `class="link"`). If it doesn't, add `.link { background: none; border: none; padding: 0; color: inherit; font: inherit; font-weight: 600; cursor: pointer; box-shadow: none; }` under the journal rules.

- [ ] **Step 8: Write the styles**

Append to `src/styles.css`, after the `.note textarea` rule:

```css
.journal { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 800px) { .journal { grid-template-columns: minmax(0, 1fr); } }
.journal .weeks table { font-size: 14px; }
.journal .weeks .scroll { max-height: calc(100vh - 220px); overflow: auto; }
.journal .weeks tr.selected { background: var(--bg); }
.journal-main { display: grid; gap: 16px; min-width: 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
.day-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.day-card { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 10px 12px; min-height: 64px;
  border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); text-align: left; box-shadow: none; }
.day-card[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.day-card:disabled { opacity: .45; }
.day-card .logged { font-weight: 600; font-size: 13px; }
.day-card .logged::before { content: "● "; font-size: 9px; vertical-align: middle; }
```

- [ ] **Step 9: Run the e2e test to verify it passes**

Run: `npx playwright test tests/e2e/journal.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Run the full prototype suite**

Run:
- `npx vitest run`
- `npx vue-tsc --noEmit`
- `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`
- `npx playwright test`

Expected: all pass. `flow.spec.ts` and `role-switch.spec.ts` must still pass: the guard now loads the journal on student routes, and the supervisor sidebar has a third link.

- [ ] **Step 11: Commit**

```bash
git add src/stores/journal.ts src/views/Journal.vue src/router.ts src/App.vue src/views/student/Onboarding.vue src/styles.css tests/e2e/journal.spec.ts
git commit -m "feat: private week-by-week journal for supervisors and interns without a logbook"
```

---

### Task 5: Try it in server mode

No new code, unless the run turns up a bug. Fix any bug found with a failing test first, in the task that owns the code.

- [ ] **Step 1:** In `appv3/backend`, run `C:/Users/User/php84/php.exe artisan migrate` (adds the table and the column to `database/local.sqlite`). Restart `logbook-api`.
- [ ] **Step 2:** As Sarah (open `http://127.0.0.1:4301/` and pick "Open the logbook as… Sarah"), open **Journal**, write today and reload. Expected: the text is still there, and **Logged** shows.
- [ ] **Step 3:** Switch to Aisha. Expected: her sidebar is unchanged (Notepad, Logbook builder, Export, My internship). Going to `#/journal` sends her back to the Notepad.
- [ ] **Step 4:** Ledger what you saw. A journal-only intern can't be tried in server mode with the demo seed, because every seeded intern has a placement. The e2e covers that path.
