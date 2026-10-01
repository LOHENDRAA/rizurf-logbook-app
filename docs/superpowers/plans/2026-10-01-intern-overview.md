# Intern Overview, My internship and Logbook/Journal Switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interns get an Overview page, a card-style My internship page, and a Logbook/Journal choice they can switch at any time without losing anything.

**Architecture:**
- **Backend:**
  - `users` gains `logbook_mode` and three journal detail columns;
  - `GET /me/logbook` gains a `profile` object (email, mode, company, time zone, position, programme, supervisors at the same company);
  - `PUT /me/mode` switches mode;
  - `PUT /me/internship` accepts position and programme;
  - `GET/PUT /journal` carry the journal details.
- **Prototype:**
  - two pure rules in `src/core/overview.ts`;
  - the new fields flow through both repositories into `Student` and `Journal`;
  - `useJournal().mode` becomes the single source of "journal-only";
  - a new Overview view, and Onboarding.vue becomes the card-style My internship page with the mode switch.

**Tech Stack:** Laravel 12 + PHPUnit; Vue 3 + Pinia + vue-router + idb + Vitest + Playwright.

**Spec:** `intern-logbook/docs/superpowers/specs/2026-10-01-intern-overview-design.md`

## Global Constraints

- **Switching:** never deletes anything. Logbook → Journal keeps notes, weeks and submissions, and Journal → Logbook keeps the journal private and untouched.
- **Journal-only:** means mode `'journal'`. The router, sidebar and Overview read it from one place, `useJournal().mode`.
- **Effective mode:** `users.logbook_mode` if set; otherwise `'logbook'` when there's a placement (server) or a template (browser), `'journal'` when there's a journal start date and no template (legacy), else `null`.
- **Supervisors:** only those at the intern's own company, and only their name and email. Nothing new is shown to supervisors, so `PortalResources::logbook` (also used by the supervisor endpoint) is not changed and `profile` is added in `LogbookController::respond` only.
- **Position and Programme** (and the journal's University): optional strings of at most 120 characters. University and dates still lock after a submitted week; position and programme are always editable.
- **Sidebar:**
  - logbook mode: Overview, Notepad, Logbook builder, Export, My internship;
  - journal mode: Overview, Journal, My internship;
  - supervisors unchanged.
- **Landing:** `/` lands interns on `/student/overview`. Not set up yet → Onboarding (My internship). After a first logbook setup, go to the Notepad; after a journal setup, go to the Journal.
- **Branches:**
  - backend `intern-overview-api` from `master`, in `rizurf-logbook-app`;
  - prototype `intern-overview-prototype`, which already holds the spec and is built on the unmerged `notepad-weeks-prototype`.
- **No pushing or merging** until asked.
- **Never `npm run build`.** Use `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
- **Backend tests on this PC**, from `appv3/backend`:

  ```bash
  OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test
  ```

  Pint and PHPStan are in `vendor/bin`.

## Review Focus

1. **A logbook intern switches to Journal and back, after submitting a week.** Their weeks, notes and submitted status must be exactly as before, and the supervisor must still see the submitted week. Pinned by the backend `test_switching_mode_keeps_everything` and the e2e round trip in Task 4.
2. **Saving only Position after a week is submitted** must succeed, while a date change still gets 409 SETUP_LOCKED. Pinned by the backend `test_position_and_programme_save_after_a_submission`, and by the student store's `setup()` no longer refusing an unchanged template and dates (unit test in Task 3).
3. **A placement created through the API keeps the position and programme typed at first setup.** The create path must not overwrite them with `''`. Pinned by the backend `test_first_setup_saves_position_and_programme`.
4. **An intern at a company with no supervisor, or with no company,** gets `supervisors: []`, and the page shows "No supervisor at your company yet" instead of breaking. Pinned by the backend `test_profile_supervisors_are_only_from_your_company` (student-2 at Merlion has none) and the Task 4 view code.
5. **A legacy journal-only intern** (journal start date, no mode stored) must still be journal-only after this change, both in the browser demo and on the server (data migration). Pinned by the unit test `legacy journal intern stays journal-only` in Task 3 and the backend migration test.

---

### Task 1: Backend — mode, profile, position/programme, journal details

In `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app`, run `git switch -c intern-overview-api` (from `master`). Paths are relative to `appv3/backend`.

**Files:**
- Create: `database/migrations/2026_10_01_000002_add_intern_mode_and_details.php`
- Modify: `app/Http/Controllers/MeController.php` (add `mode()`)
- Modify: `app/Http/Controllers/LogbookController.php` (setup fields, `respond()` adds `profile`)
- Modify: `app/Http/Requests/InternshipRequest.php` (`position`, `programmeName` rules)
- Modify: `app/Http/Controllers/JournalController.php` (details in `show` and `start`)
- Modify: `app/Http/Resources/PortalResources.php` (add `profile()`)
- Modify: `routes/portal.php` (`PUT me/mode`)
- Modify: `resources/openapi.json` (`/me/mode`)
- Modify: `tests/Feature/PersonalJournalTest.php` (the exact-JSON expectations gain the three detail keys)
- Test: `tests/Feature/InternOverviewTest.php`

**Interfaces:**
- Produces (HTTP):
  - `GET /api/v1/me/logbook` gains `profile: { email: string, mode: 'logbook'|'journal'|null, companyName: string|null, timeZone: string, position: string|null, programme: string|null, supervisors: {name: string, email: string}[] }`.
  - `PUT /api/v1/me/mode` with `{ mode: 'logbook'|'journal' }` returns 204. Supervisors get 403; a bad mode gets 422.
  - `PUT /api/v1/me/internship` also accepts optional `position` and `programmeName` (string, at most 120, nullable). They are saved only when the key is present.
  - `GET /api/v1/journal` returns `{ startDate, university, programme, position, entries }`.
  - `PUT /api/v1/journal` with `{ startDate, university?, programme?, position? }`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/InternOverviewTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Overview / My internship data: mode, profile, position and programme, journal details. */
class InternOverviewTest extends TestCase
{
    public function test_profile_carries_email_company_and_your_own_supervisors(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('GET', '/api/v1/me/logbook')->assertOk()
            ->assertJsonPath('profile.email', 'aisha.rahman@student.example.edu')
            ->assertJsonPath('profile.mode', 'logbook')
            ->assertJsonPath('profile.companyName', 'Nusantara Digital')
            ->assertJsonPath('profile.timeZone', 'Asia/Kuala_Lumpur')
            ->assertJsonPath('profile.position', 'Software Engineering Intern')
            ->assertJsonPath('profile.programme', 'BSc Computer Science')
            ->assertJsonPath('profile.supervisors', [['name' => 'Sarah Lim', 'email' => 'sarah.lim@nusantara.example.com']]);
    }

    public function test_profile_supervisors_are_only_from_your_company(): void
    {
        $this->be($this->user('student-2')); // Merlion has no supervisor in the seed

        $this->portal('GET', '/api/v1/me/logbook')->assertOk()->assertJsonPath('profile.supervisors', []);
    }

    public function test_an_intern_without_a_placement_still_gets_a_profile(): void
    {
        Placement::query()->where('student_id', 'student-1')->delete();
        $this->be($this->user('student-1'));

        $this->portal('GET', '/api/v1/me/logbook')->assertOk()
            ->assertJsonPath('profile.mode', null)
            ->assertJsonPath('profile.position', null)
            ->assertJsonPath('profile.timeZone', 'Asia/Kuala_Lumpur')
            ->assertJsonPath('profile.companyName', 'Nusantara Digital');
    }

    public function test_the_supervisor_view_of_an_intern_is_unchanged(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()->assertJsonMissingPath('profile');
    }

    public function test_switching_mode_keeps_everything(): void
    {
        $this->be($this->user('student-1'));
        $before = $this->portal('GET', '/api/v1/me/logbook')->json('weeks');

        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'journal'])->assertNoContent();
        $this->portal('GET', '/api/v1/me/logbook')->assertJsonPath('profile.mode', 'journal');
        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'logbook'])->assertNoContent();

        $this->portal('GET', '/api/v1/me/logbook')->assertJsonPath('profile.mode', 'logbook')->assertJsonPath('weeks', $before);
    }

    public function test_mode_is_for_interns_and_must_be_valid(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'diary'])->assertUnprocessable();

        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'journal'])->assertForbidden();
    }

    public function test_first_setup_saves_position_and_programme(): void
    {
        $template = LogbookTemplate::query()->firstOrFail();
        Placement::query()->where('student_id', 'student-1')->delete();
        $this->be($this->user('student-1'));

        $this->portal('PUT', '/api/v1/me/internship', [
            'templateId' => $template->id, 'startDate' => '2026-09-21', 'endDate' => '2026-10-04', 'coverValues' => [],
            'position' => 'Data Intern', 'programmeName' => 'BSc Data Science',
        ])->assertOk();

        $this->portal('GET', '/api/v1/me/logbook')
            ->assertJsonPath('profile.position', 'Data Intern')
            ->assertJsonPath('profile.programme', 'BSc Data Science');
    }

    public function test_position_and_programme_save_after_a_submission(): void
    {
        $this->be($this->user('student-1')); // the seed has student-1's week 1 submitted
        $logbook = $this->portal('GET', '/api/v1/me/logbook');
        $etag = (string) $logbook->headers->get('ETag');
        $s = $logbook->json('student');
        $body = ['templateId' => $s['templateId'], 'startDate' => $s['startDate'], 'endDate' => $s['endDate'], 'coverValues' => []];

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'position' => 'Platform Intern'], ['If-Match' => $etag])->assertOk();
        $this->portal('GET', '/api/v1/me/logbook')->assertJsonPath('profile.position', 'Platform Intern');

        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');
        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'endDate' => '2026-09-20'], ['If-Match' => $etag])
            ->assertConflict()->assertJsonPath('error.code', 'SETUP_LOCKED');
    }

    public function test_journal_details_round_trip(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('PUT', '/api/v1/journal', [
            'startDate' => '2026-08-03', 'university' => 'Sunway University', 'programme' => 'BSc IT', 'position' => 'QA Intern',
        ])->assertNoContent();

        $this->portal('GET', '/api/v1/journal')->assertOk()
            ->assertJsonPath('university', 'Sunway University')
            ->assertJsonPath('programme', 'BSc IT')
            ->assertJsonPath('position', 'QA Intern');
        $this->portal('PUT', '/api/v1/journal', ['startDate' => '2026-08-03', 'position' => str_repeat('a', 121)])->assertUnprocessable();
    }

    public function test_the_migration_marks_existing_journal_interns(): void
    {
        $migration = require database_path('migrations/2026_10_01_000002_add_intern_mode_and_details.php');
        Placement::query()->where('student_id', 'student-1')->delete();
        User::query()->whereKey('student-1')->update(['journal_start_date' => '2026-08-03', 'logbook_mode' => null]);
        User::query()->whereKey('student-2')->update(['journal_start_date' => '2026-08-03', 'logbook_mode' => null]); // has a placement

        $migration->markJournalInterns();

        $this->assertSame('journal', DB::table('users')->where('id', 'student-1')->value('logbook_mode'));
        $this->assertNull(DB::table('users')->where('id', 'student-2')->value('logbook_mode'));
    }
}
```

In `tests/Feature/PersonalJournalTest.php`, every `assertExactJson([...'startDate' => null...])` gains `'university' => null, 'programme' => null, 'position' => null` next to `'startDate'`. Those are the two in `test_you_can_write_and_read_your_own_journal` and `test_nobody_else_can_read_it`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `OPENSSL_CONF=… DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test --filter 'InternOverviewTest|PersonalJournalTest'`
Expected: FAIL. `profile` is missing, `PUT /me/mode` gets 404, the migration file is missing, and PersonalJournalTest's exact JSON lacks the new keys.

- [ ] **Step 3: Write the implementation**

`database/migrations/2026_10_01_000002_add_intern_mode_and_details.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Interns choose a logbook or a journal (switchable); journal interns keep their own university, programme and position. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('logbook_mode', 16)->nullable();
            $table->string('journal_university', 120)->nullable();
            $table->string('journal_programme', 120)->nullable();
            $table->string('journal_position', 120)->nullable();
        });
        $this->markJournalInterns();
    }

    /** Interns who already keep a journal and have no placement were journal-only before the mode existed. */
    public function markJournalInterns(): void
    {
        DB::table('users')
            ->whereNull('logbook_mode')
            ->whereNotNull('journal_start_date')
            ->whereNotIn('id', DB::table('placements')->select('student_id'))
            ->update(['logbook_mode' => 'journal']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['logbook_mode', 'journal_university', 'journal_programme', 'journal_position']);
        });
    }
};
```

`app/Http/Resources/PortalResources.php`: add after `sessionUser()`, and import `App\Models\User` if it isn't already imported:

```php
    /**
     * The signed-in intern's own details for Overview and My internship; never part of what supervisors read.
     *
     * @return array<string, mixed>
     */
    public static function profile(User $student, ?Placement $placement): array
    {
        return [
            'email' => $student->email,
            'mode' => $student->logbook_mode ?? ($placement === null ? null : 'logbook'),
            'companyName' => $student->company?->name,
            'timeZone' => $placement?->programme_timezone ?: 'Asia/Kuala_Lumpur',
            'position' => $placement?->position ?: null,
            'programme' => $placement?->programme_name ?: null,
            'supervisors' => $student->company_id === null ? [] : User::query()
                ->where('company_id', $student->company_id)
                ->where('role', User::ROLE_SUPERVISOR)
                ->orderBy('name')
                ->get(['name', 'email'])
                ->map(fn (User $u): array => ['name' => $u->name, 'email' => $u->email])
                ->all(),
        ];
    }
```

`app/Http/Controllers/LogbookController.php`:
- in `respond()`, build the array first, add the profile, then respond:

```php
        $data = PortalResources::logbook(
            $student,
            $placement,
            $weeks,
            fn (Week $week): array => $this->capabilities->forStudentWeek($week, $today, $this->weeks)
        );
        $data['profile'] = PortalResources::profile($student, $placement);
        $response = response()->json($data);
```

- in `setup()`, after `$fields = [...]`, add:

```php
        // Position and programme are free text and never locked; saved only when sent.
        foreach (['position' => 'position', 'programmeName' => 'programme_name'] as $input => $column) {
            if ($request->exists($input)) {
                $fields[$column] = (string) $request->validated($input);
            }
        }
```

- in the `new Placement([...])` call, move `'programme_name' => ''` and `'position' => ''` **before** `...$fields`, so typed values win:

```php
                $placement = new Placement([
                    'programme_name' => '',
                    'position' => '',
                    ...$fields,
                    'id' => (string) Str::uuid(),
                    'student_id' => $user->id,
                    'company_id' => $user->company_id,
                    'programme_timezone' => self::TIMEZONE,
                    'version' => 'p-1',
                ]);
```

`app/Http/Requests/InternshipRequest.php` rules, adding:

```php
            'position' => ['sometimes', 'nullable', 'string', 'max:120'],
            'programmeName' => ['sometimes', 'nullable', 'string', 'max:120'],
```

`app/Http/Controllers/MeController.php`: add the imports `Illuminate\Http\Response as HttpResponse` and `Illuminate\Validation\Rule`, then the method:

```php
    public function mode(Request $request): HttpResponse
    {
        $user = $request->user();

        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns choose between a logbook and a journal.');
        }

        $mode = $request->validate(['mode' => ['required', Rule::in(['logbook', 'journal'])]])['mode'];
        $user->forceFill(['logbook_mode' => $mode])->save();

        return response()->noContent();
    }
```

`app/Http/Controllers/JournalController.php`:
- `show()` adds, after `'startDate' => …`:

```php
            'university' => $user->journal_university,
            'programme' => $user->journal_programme,
            'position' => $user->journal_position,
```

- `start()` becomes:

```php
    public function start(Request $request): Response
    {
        $data = $request->validate([
            'startDate' => ['required', 'date_format:Y-m-d'],
            'university' => ['sometimes', 'nullable', 'string', 'max:120'],
            'programme' => ['sometimes', 'nullable', 'string', 'max:120'],
            'position' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['journal_start_date' => $data['startDate']]);
        foreach (['university', 'programme', 'position'] as $field) {
            if (array_key_exists($field, $data)) {
                $user->forceFill(["journal_{$field}" => $data[$field]]);
            }
        }
        $user->save();

        return response()->noContent();
    }
```

`routes/portal.php`, after the `me/internship` PUT:

```php
    Route::put('me/mode', [MeController::class, 'mode'])->middleware('auth');
```

`resources/openapi.json`: add after `/me/internship`, with the Edit tool:

```json
    "/me/mode": {
      "put": {
        "summary": "Choose between keeping a logbook and a private journal; switching keeps everything.",
        "responses": {
          "204": { "description": "Saved." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Choose Logbook Or Journal",
          "purpose": "Switch an intern between the university logbook and a private journal",
          "use_when": ["An intern picks Logbook or Journal on My internship"],
          "do_not_use_when": ["Setting up the internship dates (use PUT /me/internship)"],
          "inputs": ["mode"],
          "outputs": [],
          "requires": ["Signed-in intern"],
          "related_endpoints": ["GET /me/logbook", "PUT /journal"],
          "tags": ["mode", "journal", "logbook", "switch"]
        }
      }
    },
```

Also update the `/journal` GET entry's `outputs` to `["startDate", "university", "programme", "position", "entries[].date", "entries[].text"]`, and the PUT entry's `inputs` to `["startDate", "university", "programme", "position"]`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `… artisan test --filter 'InternOverviewTest|PersonalJournalTest|OpenApiTest|LogbookTest'`
Expected: PASS.

- [ ] **Step 5: Run the whole suite, Pint, PHPStan and the OpenAPI validator**

Run, from `appv3/backend`:
- the full `artisan test` command from Global Constraints;
- `C:/Users/User/php84/php.exe vendor/bin/pint --test`;
- `C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --memory-limit=1G --no-progress`;
- from `$TEMP/claude/C--Users-User-Downloads-Rizurf-Logbook/ed93beff-9dc7-4de7-a929-3f30d4b2fa44/scratchpad/oav`: `node -e "require('@apidevtools/swagger-parser').validate(process.argv[1]).then(()=>console.log('valid'),e=>console.log(e.message))" "<backend>/resources/openapi.json"`.

Expected: all pass, and the validator prints `valid`. If PHPStan flags `$student->company?->name` or the `logbook_mode`/`journal_*` attributes, add the matching `@property` lines to `app/Models/User.php`'s docblock (following its existing style) and ledger it.

- [ ] **Step 6: Commit**

```bash
git add appv3/backend
git commit -m "feat: intern mode switch, profile for Overview, position/programme and journal details"
```

---

### Task 2: Overview rules (`src/core/overview.ts`)

Work in `intern-logbook` on branch `intern-overview-prototype`.

**Files:**
- Create: `src/core/overview.ts`
- Test: `tests/unit/overview.test.ts`

**Interfaces:**
- Produces:
  - `export interface Progress { state: 'before' | 'during' | 'after'; week: number; of: number; percent: number; daysToStart: number }`
  - `export function internshipProgress(start: string, end: string, today: string): Progress`
  - `export function needsAttention(periods: Period[], statusOf: (key: string) => PeriodStatus, today: string): { key: string; label: string }[]`

- [ ] **Step 1: Write the failing test**

`tests/unit/overview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { internshipProgress, needsAttention } from '../../src/core/overview';
import { buildPeriods } from '../../src/core/periods';
import type { PeriodStatus } from '../../src/core/model';

describe('internshipProgress', () => {
  const S = '2026-08-03', E = '2026-09-27'; // 8 weeks, 56 days
  it('during: week N of M and the share of days passed', () => {
    expect(internshipProgress(S, E, '2026-09-25')).toEqual({ state: 'during', week: 8, of: 8, percent: 96, daysToStart: 0 });
    expect(internshipProgress(S, E, S)).toEqual({ state: 'during', week: 1, of: 8, percent: 2, daysToStart: 0 });
    expect(internshipProgress(S, E, '2026-08-10').week).toBe(2); // a Monday starts the next week
  });
  it('before the start: days to go', () => {
    expect(internshipProgress(S, E, '2026-08-01')).toEqual({ state: 'before', week: 0, of: 8, percent: 0, daysToStart: 2 });
  });
  it('after the end: finished', () => {
    expect(internshipProgress(S, E, '2026-10-01')).toEqual({ state: 'after', week: 8, of: 8, percent: 100, daysToStart: 0 });
  });
});

describe('needsAttention', () => {
  const periods = buildPeriods('weekly', '2026-08-03', '2026-09-27');
  const status = (m: Record<string, PeriodStatus>) => (key: string): PeriodStatus => m[key] ?? 'draft';
  it('lists sent-back weeks and overdue drafts, oldest first', () => {
    const [w1, w2, w3, w4] = periods;
    const items = needsAttention(periods, status({ [w1.key]: 'approved', [w2.key]: 'changes_requested', [w3.key]: 'submitted' }), '2026-08-31');
    expect(items).toEqual([
      { key: w2.key, label: 'Week 2 · supervisor requested changes' },
      { key: w4.key, label: 'Week 4 · overdue, not submitted' },
    ]);
  });
  it('a week still running, or in the future, is not overdue', () => {
    expect(needsAttention(periods, status({}), '2026-08-05')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/overview.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/core/overview".

- [ ] **Step 3: Write the implementation**

`src/core/overview.ts`:

```ts
import type { Period, PeriodStatus } from './model';
import { mondayOf, parseISO } from './dates';

export interface Progress { state: 'before' | 'during' | 'after'; week: number; of: number; percent: number; daysToStart: number }

const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
const UNIT = { daily: 'Day', weekly: 'Week', monthly: 'Month' } as const;

/** Where today falls in the internship: week N of M (Monday-to-Sunday weeks from the start) and the share of days passed. */
export function internshipProgress(start: string, end: string, today: string): Progress {
  const of = daysBetween(mondayOf(start), mondayOf(end)) / 7 + 1;
  if (today < start) return { state: 'before', week: 0, of, percent: 0, daysToStart: daysBetween(today, start) };
  if (today > end) return { state: 'after', week: of, of, percent: 100, daysToStart: 0 };
  const percent = Math.round(((daysBetween(start, today) + 1) / (daysBetween(start, end) + 1)) * 100);
  return { state: 'during', week: daysBetween(mondayOf(start), mondayOf(today)) / 7 + 1, of, percent, daysToStart: 0 };
}

/** Periods the intern should act on: sent back by the supervisor, or ended and still a draft. */
export function needsAttention(periods: Period[], statusOf: (key: string) => PeriodStatus, today: string) {
  return periods.flatMap(p => {
    const s = statusOf(p.key);
    const name = `${UNIT[p.kind]} ${p.index}`;
    if (s === 'changes_requested') return [{ key: p.key, label: `${name} · supervisor requested changes` }];
    if (s === 'draft' && p.end < today) return [{ key: p.key, label: `${name} · overdue, not submitted` }];
    return [];
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/overview.test.ts`
Expected: PASS (5 tests). `src/core` must not import Vue (CLAUDE.md), and it doesn't.

- [ ] **Step 5: Commit**

```bash
git add src/core/overview.ts tests/unit/overview.test.ts
git commit -m "feat: Overview rules: internship progress and what needs attention"
```

---

### Task 3: Data — new fields, mode, journal details, one source of journal-only

**Files:**
- Modify: `src/core/model.ts` (`Student`, `Journal`, `JournalDetails`, `Supervisor`, `InternMode`)
- Modify: `src/data/repository.ts` (`setMode`, and `setJournalStart` gains `details`)
- Modify: `src/data/idb.ts`
- Modify: `src/data/http.ts` (`ApiLogbook.profile`, map it in `listStudents`, `putStudent` sends position/programme, `setMode`, `setJournalStart` details)
- Modify: `src/stores/student.ts` (`setup()` accepts position and programme and allows them after a submission; `setMode()`)
- Modify: `src/stores/journal.ts` (`mode`, `journalOnly` from mode, `university`/`programme`/`position`, and `start()` gains `details`)
- Modify: `src/router.ts` (journal-mode routes, `/` → overview, load the journal for journal-mode interns)
- Test: `tests/unit/data.test.ts`, `tests/unit/http.test.ts`, `tests/unit/stores.test.ts`

**Interfaces:**
- Consumes: Task 1's HTTP shapes.
- Produces:
  - `export type InternMode = 'logbook' | 'journal'`
  - `export interface Supervisor { name: string; email: string }`
  - `export interface JournalDetails { university?: string | null; programme?: string | null; position?: string | null }`
  - `Student` gains the optional fields `mode?: InternMode; position?: string; programme?: string; email?: string; company?: string; timeZone?: string; supervisors?: Supervisor[]`
  - `Journal` becomes `{ startDate: string | null; entries: {date: string; text: string}[] } & JournalDetails`
  - `Repository.setMode(studentId: string, mode: InternMode): Promise<void>`
  - `Repository.setJournalStart(owner: string, date: string, details?: JournalDetails): Promise<void>`
  - `useStudent().setup(templateId, startDate, endDate, details?: { position?: string; programme?: string })`
  - `useStudent().setMode(mode: InternMode): Promise<void>`
  - `useJournal()` gains `mode: ComputedRef<InternMode | null>`, `university`, `programme` and `position` (`Ref<string | null>`), and `start(owner, date, details?: JournalDetails)`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('IdbRepository', …)` in `tests/unit/data.test.ts`:

```ts
  it('stores the mode on the student and journal details next to the start date', async () => {
    const r = fresh();
    await r.putStudent({ id: 's1', name: 'S', coverValues: {}, position: 'QA Intern', programme: 'BSc IT' });
    await r.setMode('s1', 'journal');
    expect((await r.listStudents())[0]).toMatchObject({ mode: 'journal', position: 'QA Intern', programme: 'BSc IT' });
    await r.setJournalStart('s1', '2026-08-03', { university: 'Sunway', programme: 'BSc IT', position: 'QA' });
    expect(await r.getJournal('s1')).toEqual({ startDate: '2026-08-03', university: 'Sunway', programme: 'BSc IT', position: 'QA', entries: [] });
  });
```

Append to `tests/unit/http.test.ts`:

```ts
describe('HttpRepository profile and mode', () => {
  it('maps the profile onto the student and switches mode', async () => {
    routes['GET me/logbook'] = () => json(200, {
      ...book(),
      profile: { email: 'a@x', mode: 'journal', companyName: 'Nusantara', timeZone: 'Asia/Kuala_Lumpur', position: 'Intern', programme: 'BSc', supervisors: [{ name: 'Sarah', email: 's@x' }] },
    }, '"p-1"');
    routes['PUT me/mode'] = () => new Response(null, { status: 204 });
    const r = intern();
    expect((await r.listStudents())[0]).toMatchObject({
      email: 'a@x', mode: 'journal', company: 'Nusantara', timeZone: 'Asia/Kuala_Lumpur', position: 'Intern', programme: 'BSc', supervisors: [{ name: 'Sarah', email: 's@x' }],
    });
    await r.setMode('student-1', 'logbook');
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', path: 'me/mode', body: JSON.stringify({ mode: 'logbook' }) });
  });
  it('sends position and programme with the internship', async () => {
    routes['GET me/logbook'] = () => json(200, book(), '"p-1"');
    routes['PUT me/internship'] = () => json(200, book({ version: 'p-2' }));
    const r = intern();
    const [s] = await r.listStudents();
    await r.putStudent({ ...s, position: 'Data Intern', programme: 'BSc DS' });
    expect(JSON.parse(String(calls.at(-1)!.body))).toMatchObject({ position: 'Data Intern', programmeName: 'BSc DS' });
  });
});
```

If `http.test.ts`'s existing GET route for `me/logbook` uses a different helper or ETag form, copy what its "reads" tests use.

Append to `tests/unit/stores.test.ts` (it already sets up Pinia and an `IdbRepository` with `ensureSeed` and the `TEMPLATE`):

```ts
describe('mode and details', () => {
  it('legacy journal intern stays journal-only; logbook interns are logbook; setMode switches without losing notes', async () => {
    const session = useSession();
    const st = useStudent();
    const journal = useJournal();
    const id = DEMO_STUDENTS[0].id;
    session.setRole(id);
    await st.load(id);
    await journal.load(id);
    expect(journal.mode).toBeNull();

    await journal.start(id, '2026-08-03'); // the previous release's "no logbook" choice: no mode stored
    expect(journal.mode).toBe('journal');
    expect(journal.journalOnly).toBe(true);

    await st.setup(TEMPLATE.id, '2026-09-21', '2026-10-04', { position: 'Data Intern' });
    await st.setMode('logbook');
    await st.saveNote('2026-09-21', 'kept');
    expect(journal.mode).toBe('logbook');
    expect(st.student?.position).toBe('Data Intern');

    await st.setMode('journal');
    expect(journal.journalOnly).toBe(true);
    await st.setMode('logbook');
    expect(st.notes['2026-09-21']).toBe('kept');
  });
  it('position saves after a period is submitted; dates still lock', async () => {
    const st = useStudent();
    const id = DEMO_STUDENTS[0].id;
    await st.load(id);
    await st.setup(TEMPLATE.id, '2026-09-21', '2026-10-04');
    await st.submit(st.periods[0].key);
    await st.setup(TEMPLATE.id, '2026-09-21', '2026-10-04', { position: 'Platform Intern' });
    expect(st.student?.position).toBe('Platform Intern');
    await expect(st.setup(TEMPLATE.id, '2026-09-21', '2026-10-11')).rejects.toThrow('before any period is submitted');
  });
});
```

Add the imports this needs at the top of `stores.test.ts`: `useJournal` from `../../src/stores/journal` and `DEMO_STUDENTS` from `../../src/data/seed`, unless they're already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/data.test.ts tests/unit/http.test.ts tests/unit/stores.test.ts`
Expected: FAIL (`setMode is not a function`, `mode` undefined, and `setup` refusing after a submission).

- [ ] **Step 3: Write the implementation**

`src/core/model.ts`:

```ts
export type InternMode = 'logbook' | 'journal';
export interface Supervisor { name: string; email: string }
```

`Student` gains:

```ts
  /** Logbook or journal; unset before the intern chooses (older records: inferred, see useJournal().mode). */
  mode?: InternMode;
  position?: string;
  programme?: string;
  /** Server mode only, from the intern's own profile. */
  email?: string;
  company?: string;
  timeZone?: string;
  supervisors?: Supervisor[];
```

`Journal` becomes:

```ts
export interface JournalDetails { university?: string | null; programme?: string | null; position?: string | null }
/** A person's private journal (supervisors, and interns whose university has no logbook). */
export interface Journal extends JournalDetails { startDate: string | null; entries: { date: string; text: string }[] }
```

`src/data/repository.ts`: import `InternMode` and `JournalDetails`, then:

```ts
  setJournalStart(owner: string, date: string, details?: JournalDetails): Promise<void>;
  /** Logbook or journal; switching never deletes anything. */
  setMode(studentId: string, mode: InternMode): Promise<void>;
```

`src/data/idb.ts`:

```ts
  async getJournal(owner: string): Promise<Journal> {
    const rows: { owner: string; date: string; text: string; details?: JournalDetails }[] = await (await this.db()).getAllFromIndex('journal', 'byOwner', owner);
    const start = rows.find(r => r.date === 'start');
    return {
      startDate: start?.text ?? null,
      ...(start?.details ?? {}),
      entries: rows.filter(r => r.date !== 'start').map(r => ({ date: r.date, text: r.text })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
  async setJournalStart(owner: string, date: string, details?: JournalDetails): Promise<void> {
    const db = await this.db();
    const old: { details?: JournalDetails } | undefined = await db.get('journal', [owner, 'start']);
    await db.put('journal', plain({ owner, date: 'start', text: date, details: { ...old?.details, ...details } }));
  }
  async setMode(studentId: string, mode: InternMode): Promise<void> {
    const db = await this.db();
    const s: Student | undefined = await db.get('students', studentId);
    if (!s) throw new Error(`Unknown student ${studentId}`);
    await db.put('students', plain({ ...s, mode }));
  }
```

The `details` spread in `getJournal` must not add keys when nothing is stored, so `data.test.ts`'s existing `toEqual({ startDate: null, entries: [] })` still passes. Store details as `{}` only when they were given; the spread of `{}` adds nothing.

`src/data/http.ts`:
- `ApiLogbook` gains `profile?: { email: string; mode: InternMode | null; companyName: string | null; timeZone: string; position: string | null; programme: string | null; supervisors: Supervisor[] }`;
- `listStudents()` maps it:

```ts
    return [...this.books.values()].map(({ student: s, profile: p }) => ({
      id: s.id,
      name: s.name,
      ...(s.templateId ? { templateId: s.templateId } : {}),
      ...(s.startDate ? { startDate: s.startDate } : {}),
      ...(s.endDate ? { endDate: s.endDate } : {}),
      coverValues: s.coverValues,
      ...(p ? {
        email: p.email, timeZone: p.timeZone, supervisors: p.supervisors,
        ...(p.mode ? { mode: p.mode } : {}), ...(p.companyName ? { company: p.companyName } : {}),
        ...(p.position ? { position: p.position } : {}), ...(p.programme ? { programme: p.programme } : {}),
      } : {}),
    }));
```

- `putStudent` body adds `position: s.position ?? '', programmeName: s.programme ?? ''`;
- the new methods:

```ts
  async setJournalStart(_owner: string, date: string, details: JournalDetails = {}): Promise<void> {
    await api('journal', { method: 'PUT', body: { startDate: date, ...details } });
  }
  async setMode(_studentId: string, mode: InternMode): Promise<void> {
    await api('me/mode', { method: 'PUT', body: { mode } });
  }
```

`src/stores/student.ts`:
- `setup` becomes:

```ts
  async function setup(templateId: string, startDate: string, endDate: string, details: { position?: string; programme?: string } = {}) {
    const s = me();
    const changed = s.templateId !== templateId || s.startDate !== startDate || s.endDate !== endDate;
    if (changed && !canChangeSetup.value && !templateMissing.value) throw new Error('You can only change your university or dates before any period is submitted.');
    const t = await repo().getTemplate(templateId);
    if (!t) throw new Error('That university template no longer exists.');
    buildPeriods(t.period, startDate, endDate); // throws on bad dates
    const next: Student = {
      ...plain(s), templateId, startDate, endDate,
      position: details.position ?? s.position, programme: details.programme ?? s.programme,
      coverValues: s.templateId === templateId ? plain(s.coverValues) : {},
    };
    await repo().putStudent(next);
    await load(next.id);
  }
  async function setMode(mode: InternMode) {
    await repo().setMode(me().id, mode);
    await load(me().id);
  }
```

- add `setMode` to the returned object, and import `InternMode`.

`src/stores/journal.ts`:
- add the refs `university`, `programme` and `position` (all `ref<string | null>(null)`), set from `j.university ?? null` (and so on) in `load()`;
- `start(o, date, details?)` calls `repo().setJournalStart(o, date, details)` and then `load(o)`;
- replace `journalOnly` with:

```ts
  /** The intern's chosen mode; for records from before the choice existed: a template means logbook, a journal start means journal. */
  const mode = computed<InternMode | null>(() => {
    const st = useStudent();
    const s = st.student;
    if (useSession().isSupervisor || !s || st.loadedFor !== useSession().role) return null;
    return s.mode ?? (s.templateId ? 'logbook' : owner.value === s.id && startDate.value ? 'journal' : null);
  });
  /** An intern who keeps the journal instead of the logbook. */
  const journalOnly = computed(() => mode.value === 'journal');
```

- and return `mode`, `university`, `programme` and `position`.

`src/router.ts`:
- add the route `{ path: '/student/overview', name: 'overview', component: () => import('./views/student/Overview.vue') }`. Task 5 creates the file. Until then, create `src/views/student/Overview.vue` as `<template><section class="card"><h1>Overview</h1></section></template>` so the build passes.
- `/` redirect: `useSession().isSupervisor ? '/supervisor/templates' : '/student/overview'`.
- in the guard, the journal-load condition becomes `(isJournal || st.student?.mode === 'journal' || !st.student?.templateId)`, and the journal-only line becomes:

```ts
  if (journal.journalOnly) return isJournal || to.name === 'onboarding' || to.name === 'overview' ? true : '/student/overview';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run` and then `npx vue-tsc --noEmit`
Expected: all unit tests pass, and the type check is clean.

- [ ] **Step 5: Commit**

```bash
git add src tests/unit
git commit -m "feat: intern mode, profile fields and journal details in both repositories"
```

---

### Task 4: My internship — cards, Logbook/Journal switch, edit form

**Files:**
- Modify: `src/views/student/Onboarding.vue` (rewrite)
- Modify: `src/App.vue` (links: Overview first; journal mode gets Overview, Journal and My internship)
- Modify: `src/components/NavIcon.vue` (an `overview` icon)
- Modify: `src/styles.css` (info cards, mode switch)
- Modify: `tests/e2e/journal.spec.ts` (use the mode switch, and journal-only interns land on Overview)
- Test: `tests/e2e/internship.spec.ts`

**Interfaces:**
- Consumes:
  - `useStudent().setup(…, details)`, `setMode(mode)`;
  - `useJournal().mode`, `start(owner, date, details)`, `university`, `programme`, `position`, `startDate`;
  - the `Student` fields `email`, `company`, `timeZone`, `supervisors`, `position` and `programme`.
- Produces these test ids:
  - `mode-logbook`, `mode-journal` (radio inputs);
  - `onb-university`, `onb-start`, `onb-end`, `onb-save` (unchanged);
  - `onb-position`, `onb-programme`, `onb-uni-text` (journal university), `internship-edit`, `info-card`.

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/internship.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { asRole, fixture, iso, nav } from './helpers';

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);

test('My internship shows cards, saves Position, and switches Logbook ↔ Journal without losing notes', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('save-template').click();

  await asRole(page, 'Aina Rahman');
  await expect(page.getByTestId('mode-logbook')).toBeChecked(); // a new intern starts on Logbook
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-position').fill('Data Intern');
  await page.getByTestId('onb-save').click();
  await page.getByTestId('note-text').fill('Kept across switches.');
  await expect(page.getByTestId('note-status')).toContainText('Saved');

  await nav(page, 'My internship');
  await expect(page.getByTestId('info-card').first()).toContainText('Data Intern');
  await expect(page.getByTestId('info-card').first()).toContainText(UNIVERSITY);

  await page.getByTestId('mode-journal').check();
  await expect(page.getByTestId('onb-start')).toHaveValue(iso(start)); // pre-filled from the internship
  await page.getByTestId('onb-save').click();
  await expect(page).toHaveURL(/#\/journal$/);
  for (const name of ['Notepad', 'Logbook builder', 'Export']) await expect(page.getByRole('link', { name })).toHaveCount(0);

  await nav(page, 'My internship');
  await page.getByTestId('mode-logbook').check(); // already set up: switches straight away
  await expect(page).toHaveURL(/#\/student\/overview$/);
  await nav(page, 'Notepad');
  await expect(page.getByTestId('note-text')).toHaveValue('Kept across switches.');
});
```

`tests/e2e/journal.spec.ts`: everywhere it does `selectOption('none')` and then `expect(onb-end).toBeHidden()`, change it to:

```ts
  await page.getByTestId('mode-journal').check();
  await expect(page.getByTestId('onb-end')).toBeHidden();
```

The intern-without-a-logbook test then:
- expects `toHaveURL(/#\/journal$/)` right after saving (unchanged);
- expects the sidebar to contain `Overview`, `Journal` and `My internship`;
- in its last step, expects `#/student/notepad` to redirect to `/#\/student\/overview$/` instead of `/journal`. Before the final `journal-text` check, add `await nav(page, 'Journal');`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/internship.spec.ts tests/e2e/journal.spec.ts --reporter=line`
Expected: FAIL (no `mode-logbook` radio).

- [ ] **Step 3: Write the implementation**

`src/components/NavIcon.vue`, `PATHS` gains:

```ts
  overview: 'M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z',
```

`src/App.vue`, the student branches of `links`:

```ts
  : journal.journalOnly
    ? [
        { to: '/student/overview', label: 'Overview', icon: 'overview' },
        { to: '/journal', label: 'Journal', icon: 'notepad' },
        { to: '/student/onboarding', label: 'My internship', icon: 'internship' },
      ]
    : [
        { to: '/student/overview', label: 'Overview', icon: 'overview' },
        { to: '/student/notepad', label: 'Notepad', icon: 'notepad' },
        { to: '/student/builder', label: 'Logbook builder', icon: 'builder' },
        { to: '/student/export', label: 'Export', icon: 'export' },
        { to: '/student/onboarding', label: 'My internship', icon: 'internship' },
      ]);
```

`src/views/student/Onboarding.vue` (whole file):

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { useTemplates } from '../../stores/templates';
import { useToast } from '../../stores/toast';
import { errorText } from '../../lib/errors';
import { parseISO } from '../../core/dates';
import type { InternMode } from '../../core/model';

const st = useStudent();
const journal = useJournal();
const templates = useTemplates();
const toast = useToast();
const router = useRouter();
onMounted(() => templates.load());

const s = computed(() => st.student);
const current = computed(() => journal.mode);
const logbookReady = computed(() => !!s.value?.templateId && !st.templateMissing && !!s.value.startDate);
// A new intern starts on Logbook; the choice can be changed before saving and switched any time after.
const choice = ref<InternMode>(current.value ?? 'logbook');
const editing = ref(!current.value || (current.value === 'logbook' && !logbookReady.value));
const busy = ref(false);
const form = ref({
  templateId: st.templateMissing ? '' : (s.value?.templateId ?? ''),
  start: s.value?.startDate ?? '',
  end: s.value?.endDate ?? '',
  position: (current.value === 'journal' ? journal.position : s.value?.position) ?? '',
  programme: (current.value === 'journal' ? journal.programme : s.value?.programme) ?? '',
  university: journal.university ?? '',
});

async function switchTo(m: InternMode) {
  if (m === current.value) { editing.value = false; return; }
  const ready = m === 'logbook' ? logbookReady.value : !!journal.startDate;
  if (!ready) {
    // First time in this mode: ask for what it needs, pre-filled from the other one.
    if (m === 'journal') form.value = { ...form.value, start: journal.startDate ?? s.value?.startDate ?? '', university: journal.university ?? st.template?.university ?? '' };
    editing.value = true;
    return;
  }
  busy.value = true;
  try {
    await st.setMode(m);
    toast.show(m === 'journal' ? 'Switched to your journal' : 'Switched to your logbook');
    await router.push('/student/overview');
  } catch (e) {
    toast.show(errorText(e), true);
    choice.value = current.value ?? 'logbook';
  } finally { busy.value = false; }
}
watch(choice, m => { if (current.value) void switchTo(m); });

async function save() {
  const f = form.value;
  try {
    if (choice.value === 'journal') {
      if (!f.start) { toast.show('Pick the day your internship started.', true); return; }
      await journal.start(s.value!.id, f.start, { university: f.university, programme: f.programme, position: f.position });
      if (current.value !== 'journal') await st.setMode('journal');
      toast.show('Saved');
      editing.value = false;
      await router.push('/journal');
      return;
    }
    if (!f.templateId || !f.start || !f.end) { toast.show('Pick your university and both dates.', true); return; }
    const first = !logbookReady.value;
    await st.setup(f.templateId, f.start, f.end, { position: f.position, programme: f.programme });
    if (current.value !== 'logbook') await st.setMode('logbook');
    toast.show('Saved');
    editing.value = false;
    if (first) await router.push('/student/notepad');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}

const long = (d?: string | null) => (d ? parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const dash = (v?: string | null) => v || '—';
const tz = computed(() => s.value?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
const supervisors = computed(() => s.value?.supervisors);
const lockedSetup = computed(() => !st.canChangeSetup && !st.templateMissing);
</script>

<template>
  <section class="card mode-switch" aria-label="Logbook or journal">
    <h1>My internship</h1>
    <div class="segmented" role="radiogroup">
      <label><input v-model="choice" type="radio" value="logbook" data-testid="mode-logbook" :disabled="busy" />
        <span><strong>Logbook</strong> Fill in my university's logbook</span></label>
      <label><input v-model="choice" type="radio" value="journal" data-testid="mode-journal" :disabled="busy" />
        <span><strong>Journal</strong> Private notes, no logbook</span></label>
    </div>
    <p v-if="current" class="muted">You can switch any time; nothing you've written is deleted.</p>
  </section>

  <section v-if="editing" class="card" style="max-width: 560px">
    <p v-if="st.templateMissing && choice === 'logbook'" class="banner">Your university's template was removed. Pick another one to carry on.</p>
    <template v-if="choice === 'logbook'">
      <p v-if="!templates.list.length" class="banner">No university templates yet. Ask your supervisor to add one.</p>
      <label>University
        <select v-model="form.templateId" data-testid="onb-university" :disabled="lockedSetup">
          <option value="" disabled>Choose…</option>
          <option v-for="t in templates.list" :key="t.id" :value="t.id">{{ t.university }}</option>
        </select>
      </label>
      <label>Start date <input v-model="form.start" data-testid="onb-start" type="date" :disabled="lockedSetup" /></label>
      <label>End date <input v-model="form.end" data-testid="onb-end" type="date" :disabled="lockedSetup" /></label>
      <p v-if="lockedSetup" class="muted">University and dates can't be changed after you've submitted a period.</p>
    </template>
    <template v-else>
      <label>University <input v-model="form.university" data-testid="onb-uni-text" maxlength="120" /></label>
      <label>Internship started on <input v-model="form.start" data-testid="onb-start" type="date" /></label>
    </template>
    <label>Programme <input v-model="form.programme" data-testid="onb-programme" maxlength="120" placeholder="e.g. BSc Computer Science" /></label>
    <label>Position <input v-model="form.position" data-testid="onb-position" maxlength="120" placeholder="e.g. Backend Intern" /></label>
    <div class="row">
      <button type="button" class="primary" data-testid="onb-save" @click="save">Save</button>
      <button v-if="current" type="button" @click="editing = false; choice = current">Cancel</button>
    </div>
  </section>

  <div v-else class="info-grid">
    <section class="card" data-testid="info-card">
      <h2>Placement</h2>
      <dl class="facts">
        <dt>Company</dt><dd>{{ dash(s?.company) }}</dd>
        <dt>Position</dt><dd>{{ dash(current === 'journal' ? journal.position : s?.position) }}</dd>
        <dt>Period</dt><dd>{{ current === 'journal' ? `Started ${long(journal.startDate)}` : `${long(s?.startDate)} – ${long(s?.endDate)}` }}</dd>
        <dt>Time zone</dt><dd>{{ tz }}</dd>
      </dl>
      <h2>University</h2>
      <dl class="facts">
        <dt>University</dt><dd>{{ dash(current === 'journal' ? journal.university : st.template?.university) }}</dd>
        <dt>Programme</dt><dd>{{ dash(current === 'journal' ? journal.programme : s?.programme) }}</dd>
      </dl>
      <button type="button" data-testid="internship-edit" @click="editing = true">Edit</button>
    </section>
    <div class="info-side">
      <section class="card" data-testid="info-card">
        <h2>Student</h2>
        <dl class="facts"><dt>Name</dt><dd>{{ s?.name }}</dd><dt>Email</dt><dd>{{ dash(s?.email) }}</dd></dl>
      </section>
      <section class="card" data-testid="info-card">
        <h2>Your supervisor</h2>
        <p v-if="supervisors && !supervisors.length" class="muted">No supervisor at your company yet.</p>
        <dl v-for="(p, i) in supervisors ?? [{ name: 'Supervisor', email: '' }]" :key="i" class="facts">
          <dt>Name</dt><dd>{{ p.name }}</dd>
          <dt>Email</dt><dd>{{ dash(p.email) }}</dd>
          <dt>Company</dt><dd>{{ dash(s?.company) }}</dd>
        </dl>
      </section>
    </div>
  </div>
</template>
```

`src/styles.css`, appended:

```css
.mode-switch { margin-bottom: 16px; }
.segmented { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.segmented label { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; }
.segmented label:has(input:checked) { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.segmented strong { display: block; }
.info-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: start; }
@media (max-width: 800px) { .info-grid { grid-template-columns: minmax(0, 1fr); } }
.info-side { display: grid; gap: 16px; }
.facts { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px 16px; margin: 0 0 16px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
```

Check `src/styles.css` for an existing `.row` class (the Onboarding buttons use it). If there is none, add `.row { display: flex; gap: 8px; }` and ledger it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/internship.spec.ts tests/e2e/journal.spec.ts tests/e2e/flow.spec.ts tests/e2e/role-switch.spec.ts --reporter=line`
Expected: PASS. `flow.spec.ts` and `role-switch.spec.ts` must pass unchanged: a new intern starts on Logbook and lands on the Notepad after the first save.

- [ ] **Step 5: Commit**

```bash
git add src tests/e2e
git commit -m "feat: My internship cards with a Logbook/Journal switch"
```

---

### Task 5: Overview page

**Files:**
- Modify: `src/views/student/Overview.vue` (replaces Task 3's stub)
- Modify: `src/styles.css` (header progress, placement boxes, attention links)
- Test: `tests/e2e/overview.spec.ts`

**Interfaces:**
- Consumes:
  - `internshipProgress`, `needsAttention` (Task 2);
  - `journalWeeks` (`src/core/journal.ts`);
  - `useStudent().periods`, `statusOf(key)`, `notes`, `template`, `student`;
  - `useJournal().mode`, `entries`, `startDate`, `university`, `programme`, `position`.
- Produces these test ids: `ov-caption`, `ov-title`, `ov-progress`, `ov-attention` (one per item), `ov-open` (the notepad or journal button), `ov-box` (placement boxes).

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/overview.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { asRole, fixture, iso, lastWeekday, nav } from './helpers';

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);

test('Overview: week and progress, what needs attention, and a link to this week', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('period-select').selectOption('weekly');
  await page.getByTestId('save-template').click();

  await asRole(page, 'Aina Rahman');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-position').fill('Data Intern');
  await page.getByTestId('onb-save').click();
  await page.locator(`[data-testid="day-card"][data-date="${iso(lastWeekday())}"]`).click();
  await page.getByTestId('note-text').fill('Did things.');
  await expect(page.getByTestId('note-status')).toContainText('Saved');

  await nav(page, 'Overview');
  await expect(page.getByTestId('ov-caption')).toContainText(/WEEK \d+ OF \d+/);
  await expect(page.getByTestId('ov-title')).toHaveText('Data Intern');
  await expect(page.getByTestId('ov-progress')).toBeVisible();
  await expect(page.getByTestId('ov-box').first()).toContainText(UNIVERSITY);
  // Earlier weeks ended without being submitted.
  await expect(page.getByTestId('ov-attention').first()).toContainText('overdue, not submitted');

  await page.getByTestId('ov-attention').first().click();
  await expect(page).toHaveURL(/#\/student\/builder\//);

  await nav(page, 'Overview');
  await page.getByTestId('ov-open').click();
  await expect(page).toHaveURL(/#\/student\/notepad$/);
});

test('Overview for a journal intern: journal week, no attention box', async ({ page }) => {
  const s = new Date(); s.setDate(s.getDate() - 21);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Daniel Lim');
  await page.getByTestId('mode-journal').check();
  await page.getByTestId('onb-start').fill(iso(s));
  await page.getByTestId('onb-position').fill('QA Intern');
  await page.getByTestId('onb-save').click();
  await nav(page, 'Overview');
  await expect(page.getByTestId('ov-caption')).toHaveText('WEEK 4 OF YOUR JOURNAL');
  await expect(page.getByTestId('ov-title')).toHaveText('QA Intern');
  await expect(page.getByTestId('ov-attention')).toHaveCount(0);
  await page.getByTestId('ov-open').click();
  await expect(page).toHaveURL(/#\/journal$/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/overview.spec.ts --reporter=line`
Expected: FAIL (the stub page has no `ov-caption`).

- [ ] **Step 3: Write the view**

`src/views/student/Overview.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useStudent } from '../../stores/student';
import { useJournal } from '../../stores/journal';
import { addDays, eachDay, isWeekend, mondayOf, parseISO, todayISO } from '../../core/dates';
import { internshipProgress, needsAttention } from '../../core/overview';
import { journalWeeks } from '../../core/journal';

const st = useStudent();
const journal = useJournal();
const router = useRouter();
const today = todayISO();
const isJournal = computed(() => journal.mode === 'journal');
const s = computed(() => st.student);

const progress = computed(() => (!isJournal.value && s.value?.startDate && s.value.endDate ? internshipProgress(s.value.startDate, s.value.endDate, today) : null));
const caption = computed(() => {
  if (isJournal.value) return `WEEK ${journalWeeks(journal.startDate, Object.keys(journal.entries), today).length} OF YOUR JOURNAL`;
  const p = progress.value;
  if (!p) return '';
  return p.state === 'before' ? `STARTS IN ${p.daysToStart} DAY${p.daysToStart === 1 ? '' : 'S'}` : p.state === 'after' ? 'FINISHED' : `WEEK ${p.week} OF ${p.of}`;
});
const position = computed(() => (isJournal.value ? journal.position : s.value?.position) || '');
const university = computed(() => (isJournal.value ? journal.university : st.template?.university) || '');
const programme = computed(() => (isJournal.value ? journal.programme : s.value?.programme) || '');
const title = computed(() => position.value || (isJournal.value ? 'Intern' : university.value));
const long = (d: string) => parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// This week's writing.
const week = eachDay(mondayOf(today), addDays(mondayOf(today), 6));
const active = computed(() => !!progress.value && progress.value.state === 'during');
const countable = computed(() => week.filter(d => !isWeekend(d) && d <= today && d >= (s.value?.startDate ?? '') && d <= (s.value?.endDate ?? '')));
const logged = computed(() => countable.value.filter(d => st.notes[d]?.trim()).length);
const written = computed(() => week.filter(d => journal.entries[d]?.trim()).length);

const attention = computed(() => (isJournal.value ? [] : needsAttention(st.periods, st.statusOf, today)));
const supervisors = computed(() => s.value?.supervisors);
const open = () => router.push(isJournal.value ? '/journal' : '/student/notepad');
</script>

<template>
  <section class="card ov-head">
    <div class="ov-head-row">
      <div>
        <p class="caption" data-testid="ov-caption">{{ caption }}</p>
        <h1 data-testid="ov-title">{{ title }}</h1>
      </div>
      <p v-if="!isJournal && s?.startDate && s.endDate" class="mono">{{ long(s.startDate) }} → {{ long(s.endDate) }}</p>
    </div>
    <div v-if="progress" class="bar" data-testid="ov-progress" role="progressbar" :aria-valuenow="progress.percent" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${progress.percent}%` }" />
    </div>
  </section>

  <section class="card">
    <p class="caption">PLACEMENT</p>
    <div class="ov-boxes">
      <div class="ov-box" data-testid="ov-box"><p class="caption">UNIVERSITY</p><strong>{{ university || '—' }}</strong><span class="muted">{{ programme }}</span></div>
      <div class="ov-box" data-testid="ov-box"><p class="caption">COMPANY</p><strong>{{ s?.company || '—' }}</strong><span class="muted">{{ position }}</span></div>
      <div class="ov-box" data-testid="ov-box"><p class="caption">YOUR SUPERVISOR</p>
        <template v-if="supervisors && !supervisors.length"><span class="muted">No supervisor at your company yet.</span></template>
        <template v-for="(p, i) in supervisors ?? [{ name: 'Supervisor', email: '' }]" v-else :key="i"><strong>{{ p.name }}</strong><span class="muted">{{ p.email }}</span></template>
      </div>
    </div>
  </section>

  <div class="ov-bottom" :class="{ single: isJournal }">
    <section class="card">
      <h2>{{ isJournal ? 'Journal' : 'Notepad' }}</h2>
      <p v-if="isJournal">You've written on {{ written }} day{{ written === 1 ? '' : 's' }} this week.</p>
      <p v-else-if="active">You've logged {{ logged }} of {{ countable.length }} weekday{{ countable.length === 1 ? '' : 's' }} this week.</p>
      <p v-else>The placement isn't in an active week right now.</p>
      <button type="button" class="primary" data-testid="ov-open" @click="open">{{ isJournal ? "Open this week's journal" : "Open this week's notepad" }}</button>
    </section>
    <section v-if="!isJournal" class="card">
      <h2>Needs your attention</h2>
      <p v-if="!attention.length" class="muted">You're all caught up.</p>
      <RouterLink v-for="a in attention" :key="a.key" :to="{ name: 'builder', params: { periodKey: a.key } }" class="ov-attention" data-testid="ov-attention">{{ a.label }}</RouterLink>
    </section>
  </div>
</template>
```

`src/styles.css`, appended:

```css
.ov-head, .ov-boxes, .ov-bottom { margin-bottom: 16px; }
.ov-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.caption { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .06em; color: var(--muted); }
.bar { height: 10px; border-radius: 999px; background: var(--bg); overflow: hidden; margin-top: 12px; }
.bar span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
.ov-boxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.ov-box { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); min-width: 0; overflow-wrap: anywhere; }
.ov-bottom { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: start; }
.ov-bottom.single { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 800px) { .ov-bottom { grid-template-columns: minmax(0, 1fr); } }
.ov-attention { display: block; padding: 8px 12px; margin-top: 8px; border: 1px solid var(--danger); border-radius: var(--radius-md); color: var(--danger); text-decoration: none; font-weight: 600; }
```

`RouterLink` is globally registered by vue-router, as App.vue uses it without an import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/overview.spec.ts --reporter=line`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole prototype suite**

Run:
- `npx vitest run`
- `npx vue-tsc --noEmit`
- `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`
- `npx playwright test`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src tests/e2e
git commit -m "feat: intern Overview page"
```

---

### Task 6: Try it in server mode

- [ ] **Step 1:**
  - In `appv3/backend`, run `C:/Users/User/php84/php.exe artisan migrate`.
  - Start `fake-gateway`, `logbook-api` and `logbook-server-mode` from `.claude/launch.json` (stop the browser-only `intern-logbook` server first: both use port 5173).
- [ ] **Step 2:** As Aisha (`http://127.0.0.1:4301/switch?email=aisha.rahman%40student.example.edu`):
  - Overview shows "WEEK N OF M", Sarah Lim as supervisor, and the weeks sent back by the demo seed under Needs your attention.
  - My internship shows Nusantara Sdn Bhd and her email.
  - Switching to Journal and back keeps her notes.
- [ ] **Step 3:** Ledger what you saw. Any bug found gets a failing test first, in the task that owns the code.
