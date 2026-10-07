# Today and Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One private set of daily entries per person, written on a Today page and found on a Journal page. The same entries fill the logbook. The old per-week notes go away on the server and in the browser demo.

**Architecture:**
- **Server:** `journal_entries` (per user, per date) is already the private journal. It becomes the only store. A migration copies `daily_entries` into it and drops that table; every route and payload that carried week notes loses them.
- **Screens:**
  - one autosaving `EntryEditor` component serves Today and the entry page;
  - the logbook reads `useJournal().entries` where it read `useStudent().notes`;
  - IndexedDB v3 merges the `notes` store into `journal`.

**Tech Stack:**
- Server: Laravel 12 on PHP 8.4, PHPUnit, Pint, PHPStan.
- Screens: Vue 3, Pinia, vue-router (hash history), idb, Vitest with fake-indexeddb, Playwright.

**Spec:** `intern-logbook/docs/superpowers/specs/2026-10-07-today-and-journal-design.md`

**Repos and branches:**
- **Server:** `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app`, code in `appv3/backend`, branch `today-journal` from `master`.
- **Screens:** `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`, branch `today-journal-prototype` (the spec is already committed there).

**Commands:**
- **Server tests:** from `appv3/backend`:
  ```bash
  OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test --filter <Name>
  ```
  Drop `--filter` to run the whole suite.
- **Server style and analysis:**
  ```bash
  C:/Users/User/php84/php.exe vendor/bin/pint && C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --memory-limit=1G
  ```
- **Screens:**
  - `npx vitest run <file>`;
  - `npx vue-tsc --noEmit`;
  - `npx playwright test <file>`.

  Never `npm run build`. For a build check, use `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
- **Writing files:** write with the Write/Edit tools. Python heredocs in Git Bash mangle `\n` and `\U`.

## Global Constraints

- **One entry per day per person.** Saving an empty body deletes the entry.
- **Entries are private:** only the writer can read them. The server never sends one person's entries to another, and supervisors' payloads carry no notes.
- **Every role** (logbook intern, journal-only intern, supervisor) writes into the same store.
- **Any day up to today** (Malaysia time on the server; the browser's today in the screens) can be written or edited at any time. Future days are refused with "You can't write for a day that hasn't happened yet."
- **The body** is at most 20,000 characters (unchanged server rule).
- **Look:** existing classes and variables in `src/styles.css` (Rizurf Styles.md), no new colours. Dark mode follows `data-theme`.
- **Copy:**
  - "Pull from notepad" → "Pull from journal";
  - "from notepad" → "from journal";
  - "Notepad changed — pull again" → "Journal changed — pull again".
- **Untouched:** landing pages stay as now (interns → `/student/overview`, supervisors → `/supervisor/templates`).

## Review Focus

1. **The journal fails to load while an intern opens the Logbook builder.** The builder must not open; autofill with empty entries would clear autofilled day boxes. The router guard rethrows the load error for every route except My internship and Export (Task 5, Step 3). The builder also refuses to autofill until the journal for this role is loaded (Task 5, Step 4).
2. **A pending save when the person leaves, switches role, or the date in the address changes.** The editor flushes first and asks before discarding (Task 3, `EntryEditor`), and the e2e test types then navigates away immediately (Task 4).
3. **A typed-in address with a bad or future date** (`#/journal/2026-13-40`, `#/journal/2099-01-01`). The entry page shows the error and no editor; nothing is saved (Task 2 unit test for `isWritableDay`, Task 4 e2e).
4. **An intern with both a note and a journal entry on the same day.** The server migration and the IndexedDB upgrade both join them, journal text first (Tasks 2 and 5).
5. **A supervisor's payloads after an intern writes.** They contain neither `dailyEntries` nor the text (Task 1).

---

## File map

**Server (`appv3/backend`):**
- **Modify:**
  - `routes/portal.php`
  - `app/Http/Controllers/StudentWeekController.php`
  - `app/Http/Controllers/SupervisorController.php`
  - `app/Http/Resources/PortalResources.php`
  - `app/Models/Week.php`
  - `app/Services/WeekService.php`
  - `resources/openapi.json`
  - `tests/Feature/JournalTest.php`
  - `tests/Feature/LogbookTest.php`
  - `tests/Feature/PersonalJournalTest.php`
- **Delete:**
  - `app/Http/Requests/DailyUpdateRequest.php`
  - `app/Models/DailyEntry.php`
- **Create:**
  - `database/migrations/2026_10_07_000001_notes_move_into_the_journal.php`
  - `tests/Feature/NotesIntoJournalTest.php`

**Screens (`intern-logbook`):**
- **Modify:**
  - `src/core/journal.ts`: add `searchEntries`, `writtenThisWeek`, `isWritableDay`; drop `recentWeeks`.
  - `src/stores/journal.ts`
  - `src/stores/student.ts`
  - `src/stores/review.ts`
  - `src/router.ts`
  - `src/App.vue`
  - `src/views/student/Overview.vue`
  - `src/views/student/Builder.vue`
  - `src/views/student/Onboarding.vue`
  - `src/views/supervisor/ReviewDetail.vue`
  - `src/components/overlay/bindingColors.ts`
  - `src/lib/summarize.ts` (comments only)
  - `src/core/model.ts`
  - `src/data/repository.ts`
  - `src/data/idb.ts`
  - `src/data/http.ts`
  - `src/data/demo.ts`
  - `src/styles.css`
  - `../local-test/seed-demo.ts`
  - the tests listed per task
- **Create:**
  - `src/components/EntryEditor.vue`
  - `src/views/Today.vue`
  - `src/views/JournalEntry.vue`
  - `tests/e2e/today.spec.ts`
- **Replace:** `src/views/Journal.vue` (now the list).
- **Delete:**
  - `src/views/student/Notepad.vue`
  - `src/components/WeekDays.vue`

---

### Task 1: Server stops carrying week notes

**Files:**
- Modify:
  - `routes/portal.php`
  - `app/Http/Controllers/StudentWeekController.php`
  - `app/Http/Controllers/SupervisorController.php`
  - `app/Http/Resources/PortalResources.php`
  - `app/Models/Week.php`
  - `app/Services/WeekService.php`
  - `resources/openapi.json`
- Delete: `app/Http/Requests/DailyUpdateRequest.php`
- Test:
  - `tests/Feature/PersonalJournalTest.php`
  - `tests/Feature/LogbookTest.php`
  - `tests/Feature/JournalTest.php`

**Interfaces:**
- Produces:
  - week payloads without `dailyEntries`;
  - no `PUT /api/v1/me/journal/weeks/{n}/daily`;
  - `SETUP_DROPS_WORK` raised only for typed answers or submitted weeks.

- [ ] **Step 1: Branch**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git switch -c today-journal master
```

- [ ] **Step 2: Write the failing tests.** Add to `tests/Feature/PersonalJournalTest.php`, inside the class:

```php
    public function test_week_notes_are_gone_and_supervisors_never_receive_entries(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Private thoughts.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-09-21', 'body' => 'x'])->assertNotFound();
        $this->portal('GET', '/api/v1/me/logbook')->assertOk()->assertJsonMissingPath('weeks.0.dailyEntries');

        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()
            ->assertJsonMissingPath('weeks.0.dailyEntries')
            ->assertDontSee('Private thoughts.');
    }
```

Replace `test_changing_dates_keeps_notes_and_refuses_to_drop_them` and `test_a_cleared_note_does_not_block_a_date_change` in `tests/Feature/LogbookTest.php` with:

```php
    public function test_journal_entries_never_block_a_date_change(): void
    {
        $template = $this->template("Taylor's University");
        $this->newIntern();
        $body = $this->setupBody($template->id, '2026-09-14', '2026-09-30');

        $this->portal('PUT', '/api/v1/me/internship', $body)->assertOk();
        $this->portal('PUT', '/api/v1/journal/2026-09-15', ['text' => 'Set up my laptop.'])->assertNoContent();
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-16'], ['If-Match' => $etag])->assertOk();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.text', 'Set up my laptop.');
    }
```

The other `SETUP_DROPS_WORK` test (around line 216, typed answers) stays as it is.

- [ ] **Step 3: Run them and watch them fail**

Run: `... artisan test --filter "test_week_notes_are_gone|test_journal_entries_never_block"`
Expected: FAIL. The daily route answers 200 or 422, not 404; `dailyEntries` is present; the date change gets 409 `SETUP_DROPS_WORK`.

If `assertJsonMissingPath('weeks.0.…')` fails because a seeded intern has no weeks, write the entry for an intern set up through `newIntern()` + `PUT me/internship` instead. Ledger it.

- [ ] **Step 4: Remove the daily route and code**

- **`routes/portal.php`:** delete the three-line `Route::put('me/journal/weeks/{weekNumber}/daily', …)` block.
- **`StudentWeekController.php`:**
  - delete `updateDaily()` and `assertDailyAvailable()`;
  - delete the `DailyUpdateRequest` and `DailyEntry` imports;
  - change `->with(['dailyEntries', 'placement'])` and `$locked->load(['dailyEntries', 'placement'])` to `['placement']`;
  - remove any import that's now unused (run Pint and PHPStan to find them).
- **`SupervisorController.php`:** the same two `with`/`load` changes.
- **`PortalResources.php`:**
  - in `weekDetail()`, delete the `$dailies` loop and `$payload['dailyEntries'] = $dailies;`;
  - in `logbook()`, change the `load([...])` to `['submissions.submitter', 'reviewActions.reviewer']`.
- **`app/Models/Week.php`:** delete `dailyEntries()` and its docblock.
- **Delete** `app/Http/Requests/DailyUpdateRequest.php`.
- **`app/Services/WeekService.php`:**
  - delete the `$dropsNotes = DailyEntry::query()…->exists();` statement and the `DailyEntry` import;
  - change `if ($dropsNotes || $dropsAnswers)` to `if ($dropsAnswers)`;
  - change the message to `'Some of your answers fall outside the new dates. Clear them first, or keep the old dates.'`.

Leave `app/Models/DailyEntry.php` in place until Task 2; the migration test needs nothing from it.

- [ ] **Step 5: Delete the tests of the removed route.** In `tests/Feature/JournalTest.php`, delete:
  - `test_update_daily_saves_entry_and_bumps_version`;
  - `test_notes_are_locked_while_the_week_is_with_the_supervisor`;
  - `test_update_daily_accepts_weekends`;
  - `test_update_daily_rejects_date_outside_week_with_422`;
  - `test_update_daily_rejects_future_date_with_403`;
  - `test_update_daily_rejects_stale_version_with_412`.

In `test_a_week_that_has_not_started_takes_answers_but_not_notes_or_submit`, delete the `PUT …/weeks/2/daily` assertion (3 lines) and rename it `test_a_week_that_has_not_started_takes_answers_but_not_submit`.

- [ ] **Step 6: Update `resources/openapi.json`**

- **Delete:**
  - the path `/me/journal/weeks/{weekNumber}/daily`;
  - `"PUT /me/journal/weeks/{weekNumber}/daily"` from `info.x-rizurf.capabilities[0].endpoints`, `info.x-rizurf.workflows[0].steps`, and `paths./me/journal/weeks/{weekNumber}.get.x-rizurf.related_endpoints`;
  - `"Write daily notes"` from `capabilities[0].does`;
  - `"dailyEntries"` from the `outputs` of `GET /me/journal/weeks/{weekNumber}` and `GET /supervisor/interns/{studentId}/weeks/{weekNumber}`.
- **Change** `paths./journal/{date}.put.x-rizurf.do_not_use_when[0]` to `"Another person's entries (entries are private to the signed-in person)"`.
- If any week schema under `components` lists `dailyEntries` in `properties` or `required`, remove it there too.

Edit with a small Python script file in the scratchpad (raw strings), loading and re-dumping with `json.dump(d, f, indent=2, ensure_ascii=False)` plus a trailing newline. Then check that `git diff --stat` shows only those changes.

- [ ] **Step 7: Run the server suite**

Run the whole suite, then Pint and PHPStan.
Expected: all pass. `OpenApiTest::test_every_route_is_documented_and_nothing_else` passes with the route gone.

- [ ] **Step 8: Commit**

```bash
git add -A appv3/backend && git commit -m "feat: the server keeps no week notes; journal entries never block a date change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Migration copies notes into the journal

**Files:**
- Create:
  - `database/migrations/2026_10_07_000001_notes_move_into_the_journal.php`
  - `tests/Feature/NotesIntoJournalTest.php`
- Delete: `app/Models/DailyEntry.php`

**Interfaces:**
- Consumes: `daily_entries(week_id, date, body)`, `weeks(id, placement_id)`, `placements(id, student_id)`, `journal_entries(user_id, date, body, timestamps)`.
- Produces: the migration class with `up()`, `down()`, and the public `copyNotes(): void`.

- [ ] **Step 1: Write the failing test** in `tests/Feature/NotesIntoJournalTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Old Notepad notes move into their intern's private journal; same-day texts are joined, journal first. */
class NotesIntoJournalTest extends TestCase
{
    public function test_notes_move_into_the_journal_and_the_table_goes(): void
    {
        $migration = require database_path('migrations/2026_10_07_000001_notes_move_into_the_journal.php');
        $migration->down(); // the table as it was, empty

        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-16', ['text' => 'Journal first.'])->assertNoContent();
        $week = DB::table('weeks')->join('placements', 'placements.id', '=', 'weeks.placement_id')
            ->where('placements.student_id', 'student-1')->value('weeks.id');
        $this->assertNotNull($week, 'student-1 needs a placement with weeks in the test seed');
        DB::table('daily_entries')->insert([
            ['week_id' => $week, 'date' => '2026-09-15', 'body' => 'Only a note.', 'created_at' => now(), 'updated_at' => now()],
            ['week_id' => $week, 'date' => '2026-09-16', 'body' => 'Then the note.', 'created_at' => now(), 'updated_at' => now()],
            ['week_id' => $week, 'date' => '2026-09-17', 'body' => "  \n ", 'created_at' => now(), 'updated_at' => now()],
        ]);

        $migration->up();

        $this->assertFalse(Schema::hasTable('daily_entries'));
        $this->portal('GET', '/api/v1/journal')->assertOk()->assertJsonPath('entries', [
            ['date' => '2026-09-15', 'text' => 'Only a note.'],
            ['date' => '2026-09-16', 'text' => "Journal first.\n\nThen the note."],
        ]);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `... artisan test --filter NotesIntoJournalTest`
Expected: FAIL, because the migration file doesn't exist.

- [ ] **Step 3: Write the migration** `database/migrations/2026_10_07_000001_notes_move_into_the_journal.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** One private set of entries per person: the old Notepad notes join each intern's journal. Back up before running. */
return new class extends Migration
{
    public function up(): void
    {
        $this->copyNotes();
        Schema::dropIfExists('daily_entries');
    }

    /** Same day in both: the journal text, a blank line, then the note. Blank notes are skipped. */
    public function copyNotes(): void
    {
        $notes = DB::table('daily_entries')
            ->join('weeks', 'weeks.id', '=', 'daily_entries.week_id')
            ->join('placements', 'placements.id', '=', 'weeks.placement_id')
            ->select('placements.student_id as user_id', 'daily_entries.date', 'daily_entries.body')
            ->orderBy('daily_entries.date')
            ->get();

        foreach ($notes as $note) {
            $body = trim((string) $note->body);
            if ($body === '') {
                continue;
            }
            $key = ['user_id' => $note->user_id, 'date' => substr((string) $note->date, 0, 10)];
            $existing = DB::table('journal_entries')->where($key)->value('body');
            if ($existing === null) {
                DB::table('journal_entries')->insert([...$key, 'body' => $body, 'created_at' => now(), 'updated_at' => now()]);
            } else {
                DB::table('journal_entries')->where($key)->update(['body' => rtrim((string) $existing)."\n\n".$body, 'updated_at' => now()]);
            }
        }
    }

    /** The table comes back empty; the notes stay in the journal. */
    public function down(): void
    {
        Schema::create('daily_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('week_id')->constrained('weeks')->cascadeOnDelete();
            $table->date('date');
            $table->mediumText('body')->default('');
            $table->timestamps();
            $table->unique(['week_id', 'date']);
        });
    }
};
```

- [ ] **Step 4: Delete `app/Models/DailyEntry.php`, then run the test and the suite**

Run: `... artisan test --filter NotesIntoJournalTest`, then the whole suite, Pint and PHPStan.
Expected: PASS, and the suite is green.

If the test seed gives `student-1` no weeks (the assertion message says so), first set them up with `newIntern()`-style helpers from `LogbookTest` (copy the two helpers into this test if they're private there). Ledger it.

- [ ] **Step 5: Run it on MariaDB too** (the local XAMPP database type):

```bash
DB_CONNECTION=mysql DB_DATABASE=test_logbook_testing DB_USERNAME=root OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf C:/Users/User/php84/php.exe artisan test --filter NotesIntoJournalTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A appv3/backend && git commit -m "feat: migration moves Notepad notes into each intern's journal and drops daily_entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Journal helpers and the shared editor (screens)

**Files:**
- Modify: `src/core/journal.ts`
- Create: `src/components/EntryEditor.vue`
- Test: `tests/unit/journal.test.ts`

**Interfaces:**
- Produces:
  - `searchEntries(entries: Record<string, string>, query: string): { date: string; text: string }[]`: newest first, case-insensitive, blank entries excluded.
  - `writtenThisWeek(entries: Record<string, string>, today: string, range?: { start: string; end: string }): { written: number; of: number }`.
  - `isWritableDay(date: string, today: string): boolean`.
  - `<EntryEditor :date="iso">`: test ids `entry-text` (textarea) and `entry-status`; `defineExpose({ append(line: string): void, saved(): Promise<boolean> })`.
- Removes: `recentWeeks` (its only caller, the old Journal page, is replaced in Task 4).

- [ ] **Step 1: Write the failing tests.** In `tests/unit/journal.test.ts`:
  - delete the `recentWeeks` tests and its import;
  - add:

```ts
import { isWritableDay, searchEntries, writtenThisWeek } from '../../src/core/journal';

describe('searchEntries', () => {
  const entries = { '2026-10-05': 'Reviewed SUPPLIER sheets', '2026-10-07': 'Sprint planning', '2026-10-06': '  ', '2026-09-30': 'supplier call' };
  it('matches any case, newest first, skipping blank days', () => {
    expect(searchEntries(entries, 'supplier').map(e => e.date)).toEqual(['2026-10-05', '2026-09-30']);
  });
  it('a blank query lists every written day, newest first', () => {
    expect(searchEntries(entries, '  ').map(e => e.date)).toEqual(['2026-10-07', '2026-10-05', '2026-09-30']);
  });
});

describe('writtenThisWeek', () => {
  const entries = { '2026-10-05': 'a', '2026-10-07': 'b', '2026-10-04': 'weekend' };
  it("counts this week's weekdays up to today", () => {
    expect(writtenThisWeek(entries, '2026-10-07')).toEqual({ written: 2, of: 3 });
  });
  it('stays within the internship dates when given', () => {
    expect(writtenThisWeek(entries, '2026-10-07', { start: '2026-10-06', end: '2026-12-01' })).toEqual({ written: 1, of: 2 });
    expect(writtenThisWeek(entries, '2026-10-07', { start: '2026-10-01', end: '2026-10-05' })).toEqual({ written: 1, of: 1 });
  });
});

describe('isWritableDay', () => {
  it('takes real days up to today only', () => {
    expect(isWritableDay('2026-10-07', '2026-10-07')).toBe(true);
    expect(isWritableDay('2026-02-28', '2026-10-07')).toBe(true);
    expect(isWritableDay('2026-10-08', '2026-10-07')).toBe(false);
    expect(isWritableDay('2026-02-30', '2026-10-07')).toBe(false);
    expect(isWritableDay('2026-13-40', '2026-10-07')).toBe(false);
    expect(isWritableDay('yesterday', '2026-10-07')).toBe(false);
  });
});
```

(2026-10-07 is a Wednesday; 2026-10-04 is a Sunday.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/journal.test.ts`
Expected: FAIL, because `searchEntries` is not exported.

- [ ] **Step 3: Implement.** In `src/core/journal.ts`:
  - import `eachDay` and `isWeekend` with `addDays` and `mondayOf` from `./dates`;
  - delete `recentWeeks` and the `name?` field of `JournalWeek` if nothing else uses it (`grep -rn "\.name" src/components/WeekDays.vue` is the only reader, and that file goes in Task 4; keep the field until then if vue-tsc complains);
  - add:

```ts
/** Written days matching `query` (any case), newest first; a blank query lists them all. */
export function searchEntries(entries: Record<string, string>, query: string): { date: string; text: string }[] {
  const q = query.trim().toLowerCase();
  return Object.entries(entries)
    .filter(([, text]) => text.trim() && (!q || text.toLowerCase().includes(q)))
    .map(([date, text]) => ({ date, text }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** "Written on N of M days": this week's weekdays up to today (inside `range` when given), and how many have an entry. */
export function writtenThisWeek(entries: Record<string, string>, today: string, range?: { start: string; end: string }) {
  const days = eachDay(mondayOf(today), today).filter(d => !isWeekend(d) && (!range || (d >= range.start && d <= range.end)));
  return { written: days.filter(d => entries[d]?.trim()).length, of: days.length };
}

/** A real calendar day, written YYYY-MM-DD, no later than today. */
export const isWritableDay = (date: string, today: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date && date <= today;
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/unit/journal.test.ts`
Expected: PASS. If `addDays('2026-02-30', 0)` doesn't roll over to March (check `src/core/dates.ts`), compare against `new Date(\`${date}T00:00:00Z\`).toISOString().slice(0, 10)` instead.

- [ ] **Step 5: Create `src/components/EntryEditor.vue`.** It holds the autosave logic moved from the old `src/views/Journal.vue`: the same debounce, retry on the next keystroke, and flush on hide or leave.

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { debounce } from '../lib/debounce';
import { errorText } from '../lib/errors';
import { ask } from '../lib/ask';

/** One day's private entry, saved as you type. A failed save keeps the text and retries on the next keystroke. */
const props = defineProps<{ date: string; placeholder?: string }>();
const journal = useJournal();
const toast = useToast();
const text = ref(journal.entries[props.date] ?? '');
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
    toast.show(`Couldn't save your entry: ${errorText(e)} It's kept here and will retry when you type again.`, true);
  }
}
const saver = debounce(persist, 800);
const flush = () => saver.flush();
/** False while something typed still isn't saved. */
async function saved() {
  await flush();
  return !pending;
}
function set(value: string) {
  text.value = value;
  pending = { date: props.date, text: value };
  status.value = 'saving';
  saver.call();
}
const onInput = (e: Event) => set((e.target as HTMLTextAreaElement).value);
/** Adds a line (a prompt) at the end, on its own line. */
function append(line: string) {
  set(text.value.trim() ? `${text.value.replace(/\s+$/, '')}\n\n${line} ` : `${line} `);
}

// The entry page reuses this component when the date in the address changes.
watch(() => props.date, d => { text.value = journal.entries[d] ?? ''; status.value = 'idle'; });

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
const guard = async () => (await saved()) || ask("Your last change isn't saved yet. Leave anyway and lose it?", 'Leave');
onBeforeRouteLeave(guard);
onBeforeRouteUpdate(guard);

const statusText = computed(() => ({ idle: '', saving: 'Saving…', saved: `Saved ${savedAt.value}`, error: 'Not saved — will retry' })[status.value]);
defineExpose({ append, saved });
</script>

<template>
  <section class="card note">
    <header>
      <slot name="title" />
      <span class="muted" data-testid="entry-status" aria-live="polite">{{ statusText }}</span>
    </header>
    <textarea data-testid="entry-text" :value="text" aria-label="Entry" :placeholder="placeholder ?? 'Only you can read this; it saves automatically.'"
      @input="onInput" @blur="flush" />
  </section>
</template>
```

- [ ] **Step 6: Type-check, then commit**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: PASS. Old views still compile, because they don't use `recentWeeks`… except `src/views/Journal.vue`. If vue-tsc fails only there, keep `recentWeeks` until Task 4 deletes that view, and ledger it.

```bash
git add src/core/journal.ts src/components/EntryEditor.vue tests/unit/journal.test.ts && git commit -m "feat: journal search, this week's count, writable-day check and the shared autosaving entry editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Today, Journal and entry pages; sidebar; Notepad goes

**Files:**
- Create:
  - `src/views/Today.vue`
  - `src/views/JournalEntry.vue`
  - `tests/e2e/today.spec.ts`
- Replace: `src/views/Journal.vue`
- Delete:
  - `src/views/student/Notepad.vue`
  - `src/components/WeekDays.vue`
- Modify:
  - `src/router.ts`
  - `src/App.vue`
  - `src/views/student/Overview.vue` (button)
  - `src/views/student/Onboarding.vue:74`
  - `src/core/journal.ts` (drop `recentWeeks` if still there)
  - `src/styles.css` (remove week-view styles only used by WeekDays)
  - `tests/e2e/helpers.ts`
  - e2e specs: `flow`, `internship`, `journal`, `overview`, `role-switch`, `smoke`, `style`

**Interfaces:**
- Consumes (Task 3): `EntryEditor`, `searchEntries`, `writtenThisWeek`, `isWritableDay`, `journalWeeks`.
- Consumes (existing):
  - `useJournal()`: `entries`, `startDate`, `journalOnly`, `owner`, `load`, `save`;
  - `useStudent()`: `student`, `template`, `periods`, `statusOf`;
  - `useSession()`: `isSupervisor`, `role`.
- Produces:
  - routes `/today`, `/journal`, `/journal/:date` for every role;
  - `/student/notepad` redirects to `/today`;
  - test ids:
    - `today-date`, `today-caption`, `prompt-toggle`, `prompt` (×4);
    - `week-count`, `today-logbook`, `today-open-logbook`;
    - `journal-search`, `journal-date`, `journal-card` (with `data-date`), `journal-empty`;
    - `entry-back`, `entry-error`;
  - e2e helper `writeEntry(page, date, text)`.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/today.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { asRole, iso, nav, writeEntry } from './helpers';

const today = iso(new Date());
const past = (() => { const d = new Date(); d.setDate(d.getDate() - 9); return iso(d); })();
const future = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); })();

test('a supervisor writes today, finds it in the Journal, and catches up on a missed day', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await expect(page.getByTestId('today-date')).toBeVisible();
  await page.getByTestId('prompt-toggle').click();
  await page.getByTestId('prompt').first().click();
  await expect(page.getByTestId('entry-text')).toHaveValue(/^What did you work on\? $/);
  await page.getByTestId('entry-text').fill('Reviewed the SUPPLIER sheets.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await expect(page.getByTestId('week-count')).toContainText('Written on 1 of');

  await writeEntry(page, past, 'Planned the sprint.');
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-card')).toHaveCount(2);
  await expect(page.getByTestId('journal-card').first()).toHaveAttribute('data-date', today); // newest first
  await page.getByTestId('journal-search').fill('supplier');
  await expect(page.getByTestId('journal-card')).toHaveCount(1);
  await page.getByTestId('journal-search').fill('nothing like this');
  await expect(page.getByTestId('journal-empty')).toContainText('Nothing matches');

  // Open, edit and come back.
  await page.getByTestId('journal-search').fill('');
  await page.getByTestId('journal-card').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`#/journal/${past}$`));
  await page.getByTestId('entry-text').fill('Planned the sprint and the demo.');
  await page.getByTestId('entry-back').click(); // leaving straight away still saves
  await expect(page.getByTestId('journal-card').nth(1)).toContainText('Planned the sprint and the demo.');

  // A future or made-up day is refused, and nothing is saved.
  for (const bad of [future, '2026-13-40']) {
    await page.goto(`/intern-logbook/#/journal/${bad}`);
    await expect(page.getByTestId('entry-error')).toHaveText("You can't write for a day that hasn't happened yet.");
    await expect(page.getByTestId('entry-text')).toHaveCount(0);
  }
});

test('entries are per person: Aina never sees the supervisor\'s', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await page.getByTestId('entry-text').fill('Supervisor only.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await asRole(page, 'Aina Rahman');
  await page.goto('/intern-logbook/#/today');
  await expect(page.getByTestId('entry-text')).toHaveValue('');
});
```

Add to `tests/e2e/helpers.ts` (add `expect` to its `@playwright/test` import):

```ts
/** Writes one day's entry from the Journal page's "Write for another day" and waits until it's saved. */
export async function writeEntry(page: Page, date: string, text: string) {
  await nav(page, 'Journal');
  await page.getByTestId('journal-date').fill(date);
  await expect(page).toHaveURL(new RegExp(`#/journal/${date}$`));
  await page.getByTestId('entry-text').fill(text);
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/today.spec.ts`
Expected: FAIL. There's no "Today" link.

- [ ] **Step 3: Router.** In `src/router.ts`:
  - replace the `/student/notepad` and `/journal` routes with:

```ts
    { path: '/student/notepad', redirect: '/today' },
    { path: '/today', name: 'today', component: () => import('./views/Today.vue') },
    { path: '/journal', name: 'journal', component: () => import('./views/Journal.vue') },
    { path: '/journal/:date', name: 'journal-entry', component: () => import('./views/JournalEntry.vue') },
```

  - replace the `beforeEach` body with:

```ts
router.beforeEach(async to => {
  const session = useSession();
  if (to.path.startsWith('/supervisor') && !session.isSupervisor) return '/';
  const writing = to.path === '/today' || to.path.startsWith('/journal');
  if (!writing && !to.path.startsWith('/student')) return true;
  if (session.isSupervisor && !writing) return '/';

  const journal = useJournal();
  const st = useStudent();
  if (!session.isSupervisor && st.loadedFor !== session.role) await st.load(session.role);
  // Entries feed Today, Journal, the Overview count and the logbook: a failed load stops those pages
  // (the logbook's autofill would otherwise clear day boxes). My internship and Export work without them.
  if (journal.owner !== session.role) {
    try { await journal.load(session.role); } catch (e) { if (to.name !== 'onboarding' && to.path !== '/student/export') throw e; }
  }
  if (session.isSupervisor) return true;
  // An intern without a logbook has Today, Journal, Overview and My internship.
  if (journal.journalOnly) return writing || to.name === 'onboarding' || to.name === 'overview' ? true : '/student/overview';
  const needsSetup = !st.student?.templateId || st.templateMissing || !st.student.startDate;
  if (needsSetup && !writing && to.name !== 'onboarding') return { name: 'onboarding' };
  return true;
});
```

A rethrown load error already shows as a red toast (`router.onError` in `main.ts`) and leaves the previous page in place. On the very first navigation there is no previous page. So in `src/App.vue`, when `RouterView` has no matched component and a toast error is showing, render `<p class="banner" data-testid="load-error">We couldn't load your journal. Reload the page to try again.</p>` instead of an empty main area.

Keep it simple: a `loadFailed` ref in `useJournal`, set in `load()`'s catch before rethrowing and cleared on success, and shown by App.vue when `journal.loadFailed && !route.matched.length`.

- [ ] **Step 4: Sidebar.** In `src/App.vue`, `links`:
  - **supervisors:** Templates, Review, `{ to: '/today', label: 'Today', icon: 'notepad' }`, `{ to: '/journal', label: 'Journal', icon: 'journal' }`;
  - **journal-only interns:** Overview, Today, Journal, My internship;
  - **logbook interns:** Overview, Today, Journal, Logbook builder, Export, My internship (Notepad removed).

If `NavIcon.vue` has no `journal` path, add one (a book outline: `'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'`).

- [ ] **Step 5: `src/views/Today.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useStudent } from '../stores/student';
import { useSession } from '../stores/session';
import { journalWeeks, writtenThisWeek } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';
import EntryEditor from '../components/EntryEditor.vue';

const journal = useJournal();
const st = useStudent();
const session = useSession();
const today = todayISO();
const PROMPTS = ['What did you work on?', 'What did you learn?', 'What surprised you?', 'What was difficult?'];
const STATUS = { draft: 'Draft', submitted: 'Submitted', changes_requested: 'Changes requested', approved: 'Approved' } as const;
const editor = ref<InstanceType<typeof EntryEditor>>();
const prompts = ref(false);

const logbook = computed(() => !session.isSupervisor && !journal.journalOnly && !!st.student?.templateId);
const period = computed(() => (logbook.value ? st.periods.find(p => today >= p.start && today <= p.end) : undefined));
const caption = computed(() => {
  if (session.isSupervisor) return '';
  if (journal.journalOnly) return `Week ${journalWeeks(journal.startDate, Object.keys(journal.entries), today).length} of your journal`;
  const uni = st.template?.university ?? '';
  return period.value ? `Week ${period.value.index} · ${uni}` : uni;
});
const range = computed(() => (logbook.value && st.student?.startDate && st.student.endDate ? { start: st.student.startDate, end: st.student.endDate } : undefined));
const week = computed(() => writtenThisWeek(journal.entries, today, range.value));
const title = parseISO(today).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
</script>

<template>
  <div class="today">
    <div>
      <header class="page-head">
        <h1 data-testid="today-date">{{ title }}</h1>
        <p v-if="caption" class="muted" data-testid="today-caption">{{ caption }}</p>
      </header>
      <EntryEditor ref="editor" :date="today" placeholder="What happened today? Only you can read this; it saves automatically.">
        <template #title><h2>What happened today?</h2></template>
      </EntryEditor>
      <p>
        <button type="button" class="link" data-testid="prompt-toggle" :aria-expanded="prompts" @click="prompts = !prompts">Need a prompt?</button>
      </p>
      <p v-if="prompts" class="prompts">
        <button v-for="p in PROMPTS" :key="p" type="button" class="link" data-testid="prompt" @click="editor?.append(p)">{{ p }}</button>
      </p>
    </div>
    <aside class="today-side">
      <section class="card">
        <h2>This week</h2>
        <p data-testid="week-count">Written on {{ week.written }} of {{ week.of }} day{{ week.of === 1 ? '' : 's' }}</p>
      </section>
      <section v-if="logbook" class="card" data-testid="today-logbook">
        <template v-if="period">
          <h2>Logbook · Week {{ period.index }}</h2>
          <p><span class="badge">{{ STATUS[st.statusOf(period.key)] }}</span></p>
          <RouterLink :to="{ name: 'builder', params: { periodKey: period.key } }" data-testid="today-open-logbook">Open logbook</RouterLink>
        </template>
        <p v-else class="muted">The placement isn't in an active week right now.</p>
      </section>
    </aside>
  </div>
</template>
```

Add to `src/styles.css`, using existing variables only:

```css
.today { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; align-items: start; }
.today-side { display: grid; gap: 16px; }
.prompts { display: flex; flex-wrap: wrap; gap: 14px; }
@media (max-width: 900px) { .today { grid-template-columns: 1fr; } }
```

If `.page-head` doesn't exist, use the heading markup the current `Overview.vue` uses, and ledger it.

- [ ] **Step 6: Replace `src/views/Journal.vue` with the list**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { searchEntries } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';

const journal = useJournal();
const router = useRouter();
const today = todayISO();
const query = ref('');
const found = computed(() => searchEntries(journal.entries, query.value));
const months = computed(() => {
  const out: { month: string; items: { date: string; text: string }[] }[] = [];
  for (const e of found.value) {
    const month = parseISO(e.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (out.at(-1)?.month !== month) out.push({ month, items: [] });
    out.at(-1)!.items.push(e);
  }
  return out;
});
const dayLabel = (d: string) => parseISO(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const open = (date: string) => router.push({ name: 'journal-entry', params: { date } });
function pick(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  if (v) void open(v);
}
const empty = computed(() => (Object.values(journal.entries).some(t => t.trim()) ? `Nothing matches “${query.value.trim()}”.` : 'Your journal will build here as you write.'));
</script>

<template>
  <section class="card">
    <h1>Journal</h1>
    <p class="muted">Private: only you can read it.</p>
    <div class="journal-tools">
      <input v-model="query" type="search" data-testid="journal-search" placeholder="Search your journal" aria-label="Search your journal" />
      <label class="inline">Write for another day
        <input type="date" data-testid="journal-date" :max="today" @change="pick" />
      </label>
    </div>
  </section>
  <p v-if="!found.length" class="muted" data-testid="journal-empty">{{ empty }}</p>
  <template v-for="m in months" :key="m.month">
    <h2 class="journal-month">{{ m.month }}</h2>
    <button v-for="e in m.items" :key="e.date" type="button" class="card journal-card" data-testid="journal-card" :data-date="e.date" @click="open(e.date)">
      <strong>{{ dayLabel(e.date) }}</strong>
      <span class="journal-snippet">{{ e.text }}</span>
    </button>
  </template>
</template>
```

Add to `src/styles.css`:

```css
.journal-tools { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; }
.journal-tools input[type="search"] { flex: 1; min-width: 220px; }
.journal-month { margin: 22px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.journal-card { display: block; width: 100%; text-align: left; margin-bottom: 10px; border-radius: var(--radius-lg); white-space: normal; font-weight: 500; }
.journal-card:hover { border-color: var(--primary); }
.journal-snippet { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 4px; color: var(--muted); }
```

- [ ] **Step 7: `src/views/JournalEntry.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { isWritableDay } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';
import EntryEditor from '../components/EntryEditor.vue';

const route = useRoute();
const date = computed(() => String(route.params.date));
const ok = computed(() => isWritableDay(date.value, todayISO()));
const title = computed(() => parseISO(date.value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
</script>

<template>
  <p><RouterLink to="/journal" data-testid="entry-back">← Journal</RouterLink></p>
  <p v-if="!ok" class="banner" data-testid="entry-error">You can't write for a day that hasn't happened yet.</p>
  <EntryEditor v-else :date="date">
    <template #title><h1>{{ title }}</h1></template>
  </EntryEditor>
</template>
```

- [ ] **Step 8: Remove the Notepad and the week view**

- Delete `src/views/student/Notepad.vue` and `src/components/WeekDays.vue`.
- Delete `recentWeeks` from `src/core/journal.ts` if it's still there.
- Delete the styles only `WeekDays` used: `grep -n "day-card\|week-days\|week-select" src/styles.css`, and remove those rules.
- **`Onboarding.vue:74`:** `router.push('/student/notepad')` → `router.push('/today')`.
- **`Overview.vue`:**
  - the `ov-open` button reads `Open Today` for both kinds of intern;
  - `open` becomes `() => router.push('/today')`.

- [ ] **Step 9: Update the e2e specs that drove the Notepad and the old Journal.** Each Notepad write becomes `await writeEntry(page, <date>, <text>)` from the helper. Each "find it again" becomes a visit to `#/journal/<date>` and an `entry-text` value check.
  - **`flow.spec.ts`:**
    - "student onboards and the notepad autosaves across a reload": rename it "student onboards and an entry autosaves across a reload". After onboarding it lands on `/today`; write with `writeEntry`, reload, reopen `#/journal/<date>`, and expect the value.
    - Replace the future-day `week-select`/`day-card` check with `page.goto('/intern-logbook/#/journal/<tomorrow>')` and the `entry-error` text.
    - "builds the period from the notepad": `from-notepad` stays as the test id (only the label changes in Task 5).
    - Delete the "Notepad shows the submitted week as locked" block (lines ~87-91). Entries are now editable at any time; the spec says so.
  - **`internship.spec.ts`:**
    - `note-text` fill → `writeEntry(page, iso(lastWeekday()), 'Kept across switches.')`;
    - the hidden-links list becomes `['Logbook builder', 'Export']` with Today and Journal visible;
    - after switching back, check `#/journal/<that day>` holds the text.
  - **`journal.spec.ts`:**
    - replace the `day`/`week-select` tests with: a supervisor writes on Today and the text survives switching role away and back; a journal-only intern sees Overview, Today, Journal and My internship (no Logbook builder or Export);
    - keep the existing "a failed save keeps the text" test, switched to `entry-text`/`entry-status` on Today. For "the day/week stay put", check the URL stays `#/today` after the leave is refused.
  - **`overview.spec.ts`:** the `day-card`/`note-text` lines → `writeEntry(page, iso(lastWeekday()), 'Did things.')`; the final URL check → `/#\/today$/`.
  - **`role-switch.spec.ts`:** the same leak test on Today. Aina types on Today; switch to Daniel; Today is empty; switching back shows Aina's text.
  - **`smoke.spec.ts`:** `'Notepad'` → `'Today'`.
  - **`style.spec.ts`:** replace the `.day-card[aria-pressed="true"]` assertion with `expect(await css('.nav-item.router-link-active', 'color')).toBe('rgb(2, 126, 143)')`. That's `--primary-text` in light mode, the active Journal link. Read the real value once with a probe and ledger it if it differs.

- [ ] **Step 10: Run everything**

Run: `npx vue-tsc --noEmit && npx vitest run && npx playwright test`
Expected: all pass, including `today.spec.ts`.

- [ ] **Step 11: Commit**

```bash
git add -A src tests && git commit -m "feat: Today and Journal pages for every role; the Notepad and week view go

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The logbook reads the journal; browser demo merges notes

**Files:**
- Modify:
  - `src/core/model.ts` (delete `NotepadEntry`)
  - `src/data/repository.ts`
  - `src/data/idb.ts`
  - `src/data/http.ts`
  - `src/data/demo.ts`
  - `src/stores/student.ts`
  - `src/stores/review.ts`
  - `src/views/student/Builder.vue`
  - `src/views/student/Overview.vue`
  - `src/views/supervisor/ReviewDetail.vue`
  - `src/components/overlay/bindingColors.ts`
  - `src/lib/summarize.ts` (comments)
  - `../local-test/seed-demo.ts`
- Test:
  - `tests/unit/data.test.ts`
  - `tests/unit/http.test.ts`
  - `tests/unit/stores.test.ts`
  - `tests/e2e/flow.spec.ts`
  - `tests/e2e/internship.spec.ts`

**Interfaces:**
- Consumes: `useJournal().entries` / `.owner` / `.save`; `repo().putJournalEntry(owner, date, text)`.
- Produces:
  - `Repository` without `getNotes`/`putNote`;
  - IndexedDB version 3 with no `notes` store;
  - `useStudent()` without `notes`/`saveNote`;
  - `useReview()` without `notesFor`.

- [ ] **Step 1: Write the failing unit tests**

**`tests/unit/data.test.ts`:**
- replace the notes half of "stores notes and fills per student and filters by student" so it only covers fills (rename it "stores fills per student and filters by student");
- add:

```ts
import { openDB } from 'idb';

  it('upgrading moves old notes into the journal, joining a same-day entry', async () => {
    const name = `test-${Math.random()}`;
    const old = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('students', { keyPath: 'id' });
        db.createObjectStore('notes', { keyPath: ['studentId', 'date'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
      },
    });
    await old.put('notes', { studentId: 'a', date: '2026-09-21', text: 'Only a note.', updatedAt: '' });
    await old.put('notes', { studentId: 'a', date: '2026-09-22', text: 'Then the note.', updatedAt: '' });
    await old.put('notes', { studentId: 'a', date: '2026-09-23', text: '   ', updatedAt: '' });
    await old.put('journal', { owner: 'a', date: '2026-09-22', text: 'Journal first.' });
    old.close();

    const r = new IdbRepository(name);
    expect((await r.getJournal('a')).entries).toEqual([
      { date: '2026-09-21', text: 'Only a note.' },
      { date: '2026-09-22', text: 'Journal first.\n\nThen the note.' },
    ]);
  });
```

**`tests/unit/http.test.ts`:**
- delete the two `putNote` tests;
- in "maps an intern logbook onto Student, notes, fills and actions", delete the `getNotes` expectation and rename the test without "notes";
- remove `dailyEntries` from the fixture weeks.

**`tests/unit/stores.test.ts`:**
- "persists notes" → "persists journal entries" using `useJournal()`: `await j.load('student-aina'); await j.save('2026-09-23', 'Hello'); await j.load('student-aina'); expect(j.entries['2026-09-23']).toBe('Hello')`;
- in the setMode test (line ~197), replace `st.saveNote`/`st.notes` with the journal store's `save`/`entries` for the same owner.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/data.test.ts tests/unit/stores.test.ts`
Expected: FAIL. The upgrade test sees no entries for 2026-09-21, because version 2 is still current.

- [ ] **Step 3: Data layer**

- **`src/core/model.ts`:** delete `NotepadEntry` and its import everywhere.
- **`src/data/repository.ts`:** delete `getNotes` and `putNote`, and `NotepadEntry` from the import.
- **`src/data/idb.ts`:**
  - `const STORES = ['templates', 'students', 'fills', 'actions', 'journal'] as const;`
  - delete `getNotes`/`putNote`;
  - open at version 3, with this upgrade:

```ts
    this.dbp ??= openDB(this.name, 3, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('templates', { keyPath: 'id' });
          db.createObjectStore('students', { keyPath: 'id' });
          db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
          db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        }
        // The journal start date lives in the same store, under the date key 'start'.
        if (oldVersion < 2) db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
        // Version 3: one set of entries per person. Old notes join the owner's journal (same day: journal text, blank line, note).
        if (oldVersion >= 1 && oldVersion < 3) {
          const journal = tx.objectStore('journal');
          const [notes, rows] = await Promise.all([
            tx.objectStore('notes').getAll() as Promise<{ studentId: string; date: string; text: string }[]>,
            journal.getAll() as Promise<{ owner: string; date: string; text: string }[]>,
          ]);
          const have = new Map(rows.map(r => [`${r.owner}|${r.date}`, r.text]));
          for (const n of notes) {
            if (!n.text.trim()) continue;
            const old = have.get(`${n.studentId}|${n.date}`);
            void journal.put({ owner: n.studentId, date: n.date, text: old ? `${old.trimEnd()}\n\n${n.text.trim()}` : n.text.trim() });
          }
          db.deleteObjectStore('notes');
        }
      },
    });
```

  If `deleteObjectStore` throws because the transaction already finished after the `await` (fake-indexeddb will show it), keep the empty `notes` store instead: clear it with `void tx.objectStore('notes').clear()` and don't delete it. Ledger it.
- **`src/data/http.ts`:**
  - delete `dailyEntries` from `ApiWeek`, and `getNotes`/`putNote`;
  - `NotepadEntry` leaves the import.
- **`src/data/demo.ts`:** line 48 → `for (const [date, text] of Object.entries(notes)) await r.putJournalEntry(id, date, text);`
- **`../local-test/seed-demo.ts`:** the same change at line 102, with `repo.putJournalEntry(me.id, date, text)`.

- [ ] **Step 4: Stores and views**

- **`src/stores/student.ts`:**
  - delete `notes`, its load line and `saveNote`;
  - remove `notes` and `saveNote` from the returned object.
- **`src/stores/review.ts`:** delete `notesFor`, and remove it from the returned object.
- **`src/views/supervisor/ReviewDetail.vue`:**
  - delete `notes`, its load line (`notes.value = await rv.notesFor(sid)`) and the whole "Notepad for these days" section;
  - remove any import or computed (`days`) left unused.
- **`src/views/student/Builder.vue`:**
  - `const journal = useJournal();` and `const session = useSession();` (add the imports);
  - every `st.notes` → `journal.entries`;
  - guard autofill, at the line-50 block:
    ```ts
    // Never autofill from a journal that didn't load: empty entries would clear the day boxes.
    if (journal.owner !== session.role) return;
    ```
    It goes before `const r = autofill(...)`, as the first statement of that branch.
  - text changes:
    - `'Replace this field with the latest notepad text?'` → `'Replace this field with the latest journal text?'`;
    - `'Refill every day and date field from your notepad? …'` → `'Refill every day and date field from your journal? …'`;
    - button `Pull from notepad` → `Pull from journal`;
    - tag `from notepad` → `from journal`;
    - `Notepad changed — pull again` → `Journal changed — pull again`.
  - Rename the function `fromNotepad` to `fromJournal`. Keep the test ids `pull-all`, `from-notepad` and `pull-again`; ids aren't copy.
- **`src/views/student/Overview.vue`:**
  - `logged` → `writtenThisWeek(journal.entries, today, { start: s.value?.startDate ?? '', end: s.value?.endDate ?? '' }).written`, and `countable.length` → `.of` from the same call;
  - keep `written` for journal-only interns as `writtenThisWeek(journal.entries, today).written`;
  - delete `countable` if it's now unused.
- **`src/components/overlay/bindingColors.ts`:** `'Daily activity (notepad)'` → `'Daily activity (journal)'`.
- **`src/lib/summarize.ts`:** comments "notepad's"/"notes" → "journal's"/"entries" (no logic change).

- [ ] **Step 5: e2e for the logbook**

- **`flow.spec.ts`**, "builds the period": expect `page.getByTestId('pull-all')` to have text `Pull from journal`, and keep the `from-notepad` tag check, now saying `from journal`.
- **`internship.spec.ts`**, the journal-only-intern-switches-to-Logbook test: after switching to Logbook, open the builder for the week holding the entry's day, and expect a day box (`[data-testid="from-notepad"]` first) to be visible with the text `Kept across switches.` in its field.
- **Add to `tests/e2e/flow.spec.ts`:** a supervisor opens the submitted week's review and expects `page.getByText('Notepad for these days')` to have count 0.

- [ ] **Step 6: Run everything**

Run: `npx vue-tsc --noEmit && npx vitest run && npx playwright test`
Expected: all pass.

Also check that `grep -rn "getNotes\|putNote\|NotepadEntry\|saveNote\|notesFor\|\.notes\b" src ../local-test` returns nothing.

- [ ] **Step 7: Commit**

```bash
git add -A src tests ../local-test 2>/dev/null; git add -A src tests && git commit -m "feat: the logbook fills from the journal; the browser demo merges old notes into it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`local-test` isn't in this repo (it sits beside it). Its change is a local file, so mention it in the final message.

### Task 6: Both sides together, on the real stack

**Files:** none new. This is a verification task.

- [ ] **Step 1: Back up the local database first.** Take this backup before the migration runs:

```bash
"C:/xampp/mysql/bin/mysqldump.exe" -u root intern_logbook > "$TEMP/intern_logbook-before-today-journal.sql"
```

Expected: a non-empty file.

- [ ] **Step 2: Migrate.** From `appv3/backend`:

```bash
C:/Users/User/php84/php.exe artisan migrate
```

Expected: `2026_10_07_000001_notes_move_into_the_journal` ran.

- [ ] **Step 3: Build into XAMPP and walk through it**

Run `npx vite build --mode xampp` in `intern-logbook`. The API task must be running.

In the browser at `http://localhost/intern-logbook/`:
1. As Aina: Today shows "Week N · <university>" and the logbook card; write, and see "Saved".
2. Journal lists her old notes (now entries); search finds one.
3. Open the builder and use **Pull from journal**: the day boxes fill.
4. As Sarah (supervisor), via `http://127.0.0.1:4301/switch?email=…`: Review shows no notes; Today and Journal work.

Record what you saw in the ledger.

- [ ] **Step 4: Rebuild the shareable preview**

Run `npx vite build --mode single`, and copy `dist-preview/index.html` to `../Rizurf-Logbook-Preview.html`.

Open it from disk in Chrome. Switch Supervisor → Aina → Daniel, and open Today, Journal, an entry, and the builder. There must be no red toast and no console error.
