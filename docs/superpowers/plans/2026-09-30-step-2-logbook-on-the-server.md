# Step 2: The Logbook on the Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** appv3's backend stores everything the prototype's screens keep today: the intern's setup and cover answers, daily notes, each week's answers, and the submit / request changes / approve history with a server-set signature.

**Architecture:**
- Reuse appv3's tables (`placements`, `weeks`, `daily_entries`, `submissions`, `review_actions`) and add only the columns the prototype needs.
- Two new read endpoints return a whole logbook at once (student + every week), so step 3's `HttpRepository` can fill the prototype's `Student`, `NotepadEntry`, `PeriodFill` and `ReviewAction` lists from one call per intern.
- Writes stay per week, under the existing ETag / If-Match versioning. The university-mentor stage is removed.

**Tech Stack:** Laravel 13 (PHP ≥ 8.4), MariaDB, PHPUnit, Pint, Larastan.

**Spec:** `../intern-logbook/docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md`, §3 "Step 2: The logbook on the server" (the sibling folder `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`).

**Prototype source for the shapes:** `../intern-logbook/src/core/model.ts` (`Student`, `NotepadEntry`, `PeriodFill`, `ReviewAction`), `src/core/periods.ts` (weekly periods run Monday–Sunday, key `w:<Monday>`), `src/core/workflow.ts` (status rules).

## Deviations from the spec (same behaviour for users)

- **The API is keyed by week number.** Every week in a response also carries `periodKey` (`w:<Monday of its first day>`), which is the prototype's key. Step 3 maps between them.
- **Weeks now run Monday to Sunday,** like the prototype, instead of 7-day chunks from the start date. The first and last weeks are trimmed to the internship. For internships that start on a Monday (all seeded ones), nothing changes.
- **The answers column is `weeks.answers`,** because `VALUES` is a reserved word in SQL. The API still calls it `values`.
- **Week answers replace the weekly draft text.** The `weekly-draft` endpoint and the `weekly_draft*` columns are removed. Submit takes only `{version}` and snapshots the answers as JSON into `submitted_body`.
- **Notes follow the prototype:** weekends are allowed, and a week's notes are locked while it is submitted or approved. Before this, the server did the opposite on both counts.
- **Answers can be saved for a week that hasn't started,** as the prototype allows. Submitting still waits for the week's start date.
- **No supervisor-wide queue endpoint.** Step 3 lists the interns (`GET /supervisor/interns`), then loads each one's logbook. `ponytail:` one call per intern; add a queue endpoint if a company has more than a few dozen interns.
- **`frontend/openapi/portal.yaml` is not updated.** It describes the parked React app. This plan is the reference for step 3.
- **No `Idempotency-Key` on the new `PUT`s.** Replaying a `PUT` stores the same thing twice, which is harmless, and If-Match already stops a stale save.

## Global Constraints

- PHP ≥ 8.4, Laravel 13, MariaDB. Code passes `./vendor/bin/pint --test` and `./vendor/bin/phpstan analyse` (Larastan). CI runs both.
- **Running the tests:** the team PC has XAMPP's PHP 8.2, which is too old for `composer install`, so tests run in GitHub Actions. Commit, `git push origin feat/step-2-logbook`, then open the run under the repo's **Actions** tab (the `backend` job). Failures show as annotations on the run page. If a PHP ≥ 8.4 is available, the local command from `appv3/backend` is `DB_HOST=127.0.0.1 DB_SOCKET= DB_USERNAME=root DB_PASSWORD= php artisan test`.
- Errors are RFC 9457 problem+json via `App\Support\Problem::throw(status, code, title, ...)`. New codes: `NO_COMPANY` (409), `SETUP_LOCKED` (409), `SETUP_DROPS_WORK` (409), `TEMPLATE_CHANGED` (409). Reused codes: `PRECONDITION_REQUIRED` (428), `STALE_VERSION` (412), `TRANSITION_CONFLICT` (409), `VALIDATION_FAILED` (422), `FORBIDDEN` (403).
- The new `PUT /me/internship` (when updating) and `PUT /me/journal/weeks/{n}/values` require `If-Match`: missing → 428, stale → 412. The daily and review endpoints keep their current optional If-Match.
- Limits: `values`, `autofilled` and `coverValues` have at most 500 entries, each a string of at most 5000 characters. A note is at most 20000 characters. An internship is at most 366 days long.
- Only the `student` role uses `me/logbook`, `me/internship` and `me/journal/*`. Only a `supervisor` whose `company_id` matches the placement uses `supervisor/interns/*`.
- **Approval signatures come from the signed-in supervisor's `name`.** Any `signature` field in a request body is ignored.
- The week status the prototype uses is `fillStatus`: `draft | submitted | changes_requested | approved`. It is derived, never stored. The existing `status` field stays as it is.
- Push to `feat/step-2-logbook` only. Never push to `master`; merging happens through a PR when the user says so.

## Review Focus

1. **A forged signature.** An approve request carrying `"signature": "Someone Else"` must store and show the supervisor's own name. → Task 4, `test_approval_is_signed_by_the_signed_in_supervisor`.
2. **Changing dates after writing notes.** Moving the start date past a day with a note must be refused, not delete the note silently. → Task 2, `test_changing_dates_keeps_notes_and_refuses_to_drop_them`.
3. **The template replaced mid-week** (step 1's Replace = delete + create). Submitting answers that were saved for the old template must be refused. → Task 3, `test_submit_rejects_answers_for_a_replaced_template`.
4. **Two tabs saving the same week.** The second save carries an old ETag and must get a 412. → Task 3, `test_values_need_a_current_if_match`.
5. **Reading someone else's logbook.** A supervisor from another company, or an intern, asking for an intern's logbook must get a 403. → Task 4, `test_logbooks_stay_inside_the_company_and_the_intern`.

---

### Task 1: Remove the university-mentor stage

**Files:**
- Create: `appv3/backend/database/migrations/2026_09_30_000001_remove_mentor_stage.php`
- Delete: `appv3/backend/app/Http/Controllers/MentorController.php`, `appv3/backend/app/Models/MentorAssignment.php`
- Modify: `appv3/backend/routes/portal.php`, `app/Models/User.php`, `app/Models/Placement.php`, `app/Models/Week.php`, `app/Models/ReviewAction.php`, `app/Policies/WeekPolicy.php`, `app/Policies/PlacementPolicy.php`, `app/Services/CapabilityService.php`, `app/Http/Controllers/StudentWeekController.php`, `app/Http/Resources/PortalResources.php`, `database/factories/UserFactory.php`, `database/seeders/PortalSeeder.php`
- Test: `appv3/backend/tests/Feature/ReviewTest.php`, `tests/Feature/AuthTest.php`, `tests/Feature/TemplateTest.php`

(All paths below are relative to `appv3/backend` unless they start with `appv3/`.)

**Interfaces:**
- Produces: `CapabilityService::studentEditable(Week): bool` = "not submitted, or changes requested". Tasks 3 and 4 rely on it.

- [ ] **Step 1: Write the failing test.** Add to `tests/Feature/ReviewTest.php` (add `use Illuminate\Support\Facades\Schema;`):

```php
    public function test_the_mentor_stage_is_gone(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/mentor/mentees')->assertNotFound();
        $this->assertFalse(Schema::hasTable('mentor_assignments'));
        $this->assertFalse(Schema::hasColumn('weeks', 'mentor_status'));
    }
```

- [ ] **Step 2: Write the migration** `database/migrations/2026_09_30_000001_remove_mentor_stage.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Supervisors are the only reviewers: drop the university-mentor stage.
     */
    public function up(): void
    {
        Schema::dropIfExists('mentor_assignments');

        Schema::table('weeks', function (Blueprint $table) {
            $table->dropColumn(['mentor_status', 'mentor_feedback', 'mentor_reviewed_by', 'mentor_reviewed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('weeks', function (Blueprint $table) {
            $table->string('mentor_status', 32)->nullable();
            $table->mediumText('mentor_feedback')->nullable();
            $table->string('mentor_reviewed_by')->nullable();
            $table->timestamp('mentor_reviewed_at')->nullable();
        });

        Schema::create('mentor_assignments', function (Blueprint $table) {
            $table->id();
            $table->string('mentor_id');
            $table->foreign('mentor_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('student_id');
            $table->foreign('student_id')->references('id')->on('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['mentor_id', 'student_id']);
            $table->index('student_id');
        });
    }
};
```

- [ ] **Step 3: Remove the mentor code.**
  - `git rm app/Http/Controllers/MentorController.php app/Models/MentorAssignment.php`
  - `routes/portal.php`: delete `use App\Http\Controllers\MentorController;` and the four `mentor/mentees…` routes.
  - `app/Models/User.php`: delete `ROLE_MENTOR`, `isMentor()`, `mentorAssignments()` and the now-unused `use …\HasMany;`. `ROLES` becomes `[self::ROLE_STUDENT, self::ROLE_SUPERVISOR]`.
  - `app/Models/Placement.php`: delete `mentorAssignments()`.
  - `app/Models/Week.php`: delete the four `mentor_*` entries from `$fillable`, `'mentor_reviewed_at' => 'datetime'` from `casts()`, and `@property Carbon|null $mentor_reviewed_at`.
  - `app/Models/ReviewAction.php`: delete `STAGE_MENTOR`.
  - `app/Policies/WeekPolicy.php`: delete `viewAsMentor`, `reviewAsMentor` and `use App\Models\MentorAssignment;`.
  - `app/Policies/PlacementPolicy.php`: delete `viewInternAsMentor` and `use App\Models\MentorAssignment;`.
  - `database/factories/UserFactory.php`: delete `mentor()`.
  - `app/Http/Resources/PortalResources.php`: delete `$payload['mentorStatus'] = $week->mentor_status;` from `weekSummary` and the `if ($week->mentor_status !== null) { … mentorReview … }` block from `weekDetail`.
  - `database/seeders/PortalSeeder.php`: delete `use App\Models\MentorAssignment;`, the `mentor-1` user, the `foreach (['student-1', 'student-3'] …) MentorAssignment::firstOrCreate(…)` loop, and ", and mentor assignments" from the class docblock.

- [ ] **Step 4: Simplify the edit rule.** In `app/Services/CapabilityService.php`, delete `forMentorWeek()` and replace `studentEditable()` with:

```php
    /**
     * Interns edit a week until they submit it, and again once changes are requested.
     */
    public function studentEditable(Week $week): bool
    {
        return $week->status !== Week::STATUS_SUBMITTED
            || $week->company_status === Week::REVIEW_CHANGES;
    }
```

- [ ] **Step 5: Drop the mentor branches from submit.** In `StudentWeekController::submit()` (Task 3 rewrites this method; this step only keeps it compiling):
  - replace both `$resubmittable = … || …->mentor_status === Week::REVIEW_CHANGES;` expressions with `$resubmittable = $this->capabilities->studentEditable($week);` and, inside the transaction, `$this->capabilities->studentEditable($locked);`;
  - replace the `if ($firstSubmit) { … } elseif … { … }` block and the `$firstSubmit = …` line with:

```php
            // First submit and every resubmit go back to the supervisor; the last feedback is kept.
            $locked->company_status = Week::REVIEW_PENDING;
```

- [ ] **Step 6: Update the tests that used the mentor.**
  - `tests/Feature/ReviewTest.php`: delete the `mentorReview()` helper and these tests: `test_mentor_mentees_lists_assignments`, `test_mentor_endpoints_forbid_supervisors`, `test_mentor_cannot_reach_unassigned_mentee`, `test_mentor_review_requires_company_approval_with_409`, `test_mentor_can_view_but_not_review_before_company_approval`, `test_mentor_approve_after_company_approval`, `test_mentor_cannot_review_twice_with_409`, `test_mentor_request_changes_requires_feedback`, `test_mentor_rejection_restarts_company_review_on_resubmit`. Keep `test_review_history_is_immutable`.
  - `tests/Feature/AuthTest.php`, `test_me_returns_session_user_with_capabilities`: use `supervisor-1`, and assert `'id', 'supervisor-1'` and `'role', 'supervisor'`.
  - `tests/Feature/TemplateTest.php`, `test_file_is_served_to_supervisors_and_matching_students_only`: delete the two `mentor-1` lines.

- [ ] **Step 7: Check that nothing else mentions the mentor.**

Run: `grep -rni mentor app database/seeders database/factories routes tests`
Expected: only `test_the_mentor_stage_is_gone`. The old and new migrations are in `database/migrations`, which this grep skips.

- [ ] **Step 8: Commit, push, and check CI.**

```bash
git add -A appv3/backend
git commit -m "feat(backend): remove the university-mentor review stage"
git push -u origin feat/step-2-logbook
```

Expected: the `backend` job is green (Pint, PHPStan, tests).

---

### Task 2: Monday weeks, logbook fields, `GET /me/logbook`, `PUT /me/internship`

**Files:**
- Create: `database/migrations/2026_09_30_000002_add_logbook_fields.php`, `app/Http/Controllers/LogbookController.php`, `app/Http/Requests/InternshipRequest.php`, `tests/Feature/LogbookTest.php`
- Modify: `app/Services/WeekService.php`, `app/Services/ConcurrencyService.php`, `app/Http/Controllers/TemplateController.php`, `app/Http/Resources/PortalResources.php`, `app/Models/Placement.php`, `app/Models/Week.php`, `app/Models/ReviewAction.php`, `routes/portal.php`, `database/seeders/PortalSeeder.php`, `tests/TestCase.php`

**Interfaces:**
- Consumes: `CapabilityService::studentEditable` and `forStudentWeek` (Task 1).
- Produces:
  - `WeekService::mondayOf(string $date): string` and `WeekService::periodKey(string $startDate): string` (`'w:'.mondayOf`).
  - `WeekService::ensureWeeks(Placement): Illuminate\Database\Eloquent\Collection<int, Week>`.
  - `WeekService::syncWeeks(Placement): void`, which throws 409 `SETUP_DROPS_WORK`.
  - `ConcurrencyService::requireIfMatch(?string $ifMatch, string $title): void` (428).
  - `Placement::setupLocked(): bool`.
  - `PortalResources::fillStatus(Week): string`.
  - `PortalResources::logbook(User $student, ?Placement, EloquentCollection<int, Week>, callable(Week): array $capabilities): array`.
  - `weekSummary` gains `periodKey`, `fillStatus`, `templateId`, `values` and `autofilled`.
  - `TestCase::template(string $university = 'Universiti Teknologi Malaysia'): LogbookTemplate`.
  - Columns: `placements.cover_values` (json), `placements.version`, `weeks.template_id`, `weeks.answers` (json), `weeks.autofilled` (json), `review_actions.signature`.
  - The logbook JSON shape is `{ student: { id, name, templateId|null, startDate|null, endDate|null, coverValues: {}, version|null, canChangeSetup }, weeks: [weekDetail…] }`.

- [ ] **Step 1: Add the `template()` test helper** to `tests/TestCase.php` (add `use App\Models\LogbookTemplate;`):

```php
    /**
     * A stored template row, without a file, for tests that only need the university match.
     */
    protected function template(string $university = 'Universiti Teknologi Malaysia'): LogbookTemplate
    {
        return LogbookTemplate::query()->create([
            'university_name' => $university,
            'university_key' => LogbookTemplate::keyFor($university),
            'format' => 'docx',
            'file_name' => 'logbook.docx',
            'file_path' => 'templates/test/original.docx',
            'placeholders' => [],
            'version' => 'v-1',
            'created_by' => 'supervisor-1',
            'updated_by' => 'supervisor-1',
        ]);
    }
```

- [ ] **Step 2: Write the failing tests** in `tests/Feature/LogbookTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\WeekService;
use Tests\TestCase;

class LogbookTest extends TestCase
{
    private function newIntern(?string $companyId = 'company-nusantara'): User
    {
        $intern = User::factory()->student()->create(['company_id' => $companyId]);
        $this->be($intern);

        return $intern;
    }

    /**
     * @return array<string, mixed>
     */
    private function setupBody(string $templateId, string $start, string $end, array $cover = []): array
    {
        return ['templateId' => $templateId, 'startDate' => $start, 'endDate' => $end, 'coverValues' => $cover];
    }

    public function test_weeks_run_monday_to_sunday(): void
    {
        $this->assertSame([
            ['week_number' => 1, 'start_date' => '2026-09-23', 'end_date' => '2026-09-27'],
            ['week_number' => 2, 'start_date' => '2026-09-28', 'end_date' => '2026-10-04'],
            ['week_number' => 3, 'start_date' => '2026-10-05', 'end_date' => '2026-10-06'],
        ], app(WeekService::class)->buildWeeks('2026-09-23', '2026-10-06'));
    }

    public function test_an_intern_without_a_placement_gets_an_empty_logbook(): void
    {
        $intern = $this->newIntern();

        $this->portal('GET', '/api/v1/me/logbook')
            ->assertOk()
            ->assertJsonPath('student.id', $intern->id)
            ->assertJsonPath('student.name', $intern->name)
            ->assertJsonPath('student.templateId', null)
            ->assertJsonPath('student.startDate', null)
            ->assertJsonPath('student.canChangeSetup', true)
            ->assertJsonPath('weeks', []);
    }

    public function test_only_interns_have_a_logbook(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/me/logbook')->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_an_intern_sets_up_their_internship(): void
    {
        $template = $this->template("Taylor's University");
        $intern = $this->newIntern();

        $response = $this->portal('PUT', '/api/v1/me/internship',
            $this->setupBody($template->id, '2026-09-23', '2026-10-06', ['ph-name' => 'Nur Aina']));

        $response->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('student.templateId', $template->id)
            ->assertJsonPath('student.coverValues', ['ph-name' => 'Nur Aina'])
            ->assertJsonPath('weeks.0.periodKey', 'w:2026-09-21')
            ->assertJsonPath('weeks.0.startDate', '2026-09-23')
            ->assertJsonPath('weeks.0.fillStatus', 'draft')
            ->assertJsonPath('weeks.2.endDate', '2026-10-06');
        $this->assertCount(3, $response->json('weeks'));
        $this->assertDatabaseHas('placements', [
            'student_id' => $intern->id,
            'company_id' => 'company-nusantara',
            'university_name' => "Taylor's University",
        ]);
    }

    public function test_setup_needs_a_company_on_the_account(): void
    {
        $template = $this->template();
        $this->newIntern(null);

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-09-23', '2026-10-06'))
            ->assertStatus(409)
            ->assertJsonPath('code', 'NO_COMPANY');
    }

    public function test_setup_rejects_an_internship_longer_than_a_year(): void
    {
        $template = $this->template();
        $this->newIntern();

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-01-01', '2027-01-03'))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_changing_an_existing_setup_needs_a_current_if_match(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $body = $this->setupBody($template->id, '2026-08-03', '2026-09-27');

        $this->portal('PUT', '/api/v1/me/internship', $body)->assertStatus(428);
        $this->portal('PUT', '/api/v1/me/internship', $body, ['If-Match' => '"stale"'])
            ->assertStatus(412)
            ->assertJsonPath('code', 'STALE_VERSION');
    }

    public function test_university_and_dates_lock_after_a_submission_but_cover_answers_do_not(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')
            ->assertJsonPath('student.canChangeSetup', false)
            ->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-08-03', '2026-09-20'), ['If-Match' => $etag])
            ->assertStatus(409)
            ->assertJsonPath('code', 'SETUP_LOCKED');

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-08-03', '2026-09-27', ['ph-name' => 'Aisha']), ['If-Match' => $etag])
            ->assertOk()
            ->assertJsonPath('student.coverValues', ['ph-name' => 'Aisha']);
    }

    public function test_changing_dates_keeps_notes_and_refuses_to_drop_them(): void
    {
        $template = $this->template("Taylor's University");
        $this->newIntern();
        $body = $this->setupBody($template->id, '2026-09-14', '2026-09-30');

        $this->portal('PUT', '/api/v1/me/internship', $body)->assertOk();
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-09-15', 'body' => 'Set up my laptop.'])->assertOk();
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-16'], ['If-Match' => $etag])
            ->assertStatus(409)
            ->assertJsonPath('code', 'SETUP_DROPS_WORK');

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-15'], ['If-Match' => $etag])
            ->assertOk()
            ->assertJsonPath('weeks.0.startDate', '2026-09-15')
            ->assertJsonPath('weeks.0.dailyEntries.0.body', 'Set up my laptop.');
    }
}
```

- [ ] **Step 3: Write the migration** `database/migrations/2026_09_30_000002_add_logbook_fields.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What the logbook screens keep: cover answers per intern, answers per week
     * (tagged with the template they were written for), and the approver's signature.
     */
    public function up(): void
    {
        Schema::table('placements', function (Blueprint $table) {
            $table->json('cover_values')->nullable();
            $table->string('version', 64)->default('p-1');
        });

        Schema::table('weeks', function (Blueprint $table) {
            $table->uuid('template_id')->nullable();
            $table->json('answers')->nullable();
            $table->json('autofilled')->nullable();
        });

        Schema::table('review_actions', function (Blueprint $table) {
            $table->string('signature')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('review_actions', fn (Blueprint $table) => $table->dropColumn('signature'));
        Schema::table('weeks', fn (Blueprint $table) => $table->dropColumn(['template_id', 'answers', 'autofilled']));
        Schema::table('placements', fn (Blueprint $table) => $table->dropColumn(['cover_values', 'version']));
    }
};
```

`template_id` has no foreign key on purpose: when a template is deleted, the week keeps the old id, so the week reads as "written for another template", which is what the prototype shows.

- [ ] **Step 4: Update the models.**
  - `app/Models/Placement.php`: add `'cover_values'` and `'version'` to `$fillable`. Add `casts()` returning `['cover_values' => 'array']`, the docblock `@property array<string, string|null>|null $cover_values`, and:

```php
    /**
     * University and dates are fixed once any week has been submitted, unless the
     * university's template was removed (the screens then ask the intern to pick again).
     */
    public function setupLocked(): bool
    {
        return LogbookTemplate::forUniversity($this->university_name) !== null
            && Week::query()->where('placement_id', $this->id)->whereNotNull('submitted_at')->exists();
    }
```

  - `app/Models/Week.php`: add `'template_id'`, `'answers'` and `'autofilled'` to `$fillable`, and `'answers' => 'array'` and `'autofilled' => 'array'` to `casts()`. Add the docblock lines `@property array<string, string|null>|null $answers` and `@property array<string, string|null>|null $autofilled`.
  - `app/Models/ReviewAction.php`: add `'signature'` to `$fillable`.

- [ ] **Step 5: Make weeks run Monday to Sunday, and re-cut them when the dates change.** In `app/Services/WeekService.php`:
  - replace `use Illuminate\Support\Collection;` with `use Illuminate\Database\Eloquent\Collection;`, and add `use App\Models\DailyEntry;`, `use App\Support\Problem;`, `use Illuminate\Support\Facades\DB;` and `use Symfony\Component\HttpFoundation\Response;`;
  - in `buildWeeks`, replace `$weekEnd = self::addDays($cursor, 6);` with:

```php
            // Monday to Sunday, like the logbook screens; the first and last weeks are trimmed to the internship.
            $weekEnd = self::addDays(self::mondayOf($cursor), 6);
```

  - update the class docblock's second paragraph to: "Weeks run Monday to Sunday; the first and last are trimmed to the placement's start and end dates."
  - add:

```php
    public static function mondayOf(string $date): string
    {
        return self::addDays($date, 1 - (int) Carbon::createFromFormat('Y-m-d', $date, 'UTC')->dayOfWeekIso);
    }

    /**
     * The prototype's period key for the week that starts on this date: 'w:<Monday>'.
     */
    public static function periodKey(string $startDate): string
    {
        return 'w:'.self::mondayOf($startDate);
    }

    /**
     * Re-cut the weeks after the internship dates change. A week keeps its notes and
     * answers while its Monday is still inside the internship. Refuses (409) rather
     * than drop a note or an answer.
     */
    public function syncWeeks(Placement $placement): void
    {
        $start = substr((string) $placement->start_date, 0, 10);
        $end = substr((string) $placement->end_date, 0, 10);
        $specs = collect($this->buildWeeks($start, $end))
            ->keyBy(fn (array $spec): string => self::mondayOf($spec['start_date']));
        $existing = Week::query()->where('placement_id', $placement->id)->get();
        $mondayOf = fn (Week $week): string => self::mondayOf(substr((string) $week->start_date, 0, 10));

        $dropsNotes = DailyEntry::query()
            ->whereIn('week_id', $existing->modelKeys())
            ->where(fn ($query) => $query->where('date', '<', $start)->orWhere('date', '>', $end))
            ->exists();
        $dropsAnswers = $existing->contains(
            fn (Week $week): bool => ! $specs->has($mondayOf($week)) && ! empty($week->answers)
        );

        if ($dropsNotes || $dropsAnswers) {
            Problem::throw(
                Response::HTTP_CONFLICT,
                'SETUP_DROPS_WORK',
                'Some of your notes or answers fall outside the new dates. Clear them first, or keep the old dates.'
            );
        }

        // Park every number out of the way so renumbering can't hit the (placement_id, week_number) unique key.
        Week::query()->where('placement_id', $placement->id)->update(['week_number' => DB::raw('week_number + 10000')]);

        foreach ($existing as $week) {
            $spec = $specs->get($mondayOf($week));

            if ($spec === null) {
                $week->delete();

                continue;
            }

            Week::query()->whereKey($week->id)->update([...$spec, 'version' => ConcurrencyService::bump($week->version)]);
        }

        $this->ensureWeeks($placement);
    }
```

  - change `ensureWeeks`'s `@return` to `Collection<int, Week>`. With the new import, that is the Eloquent collection `get()` already returns.

The kept weeks are updated with a query rather than `$week->save()`. Eloquent only writes attributes that changed in memory, so it would skip a `week_number` that equals the old one and leave the parked `+10000` value in the database.

- [ ] **Step 6: Share the 428 check.** In `app/Services/ConcurrencyService.php` add:

```php
    /**
     * Changing an existing item must name the version it changes: a missing If-Match is a 428.
     */
    public static function requireIfMatch(?string $ifMatch, string $title): void
    {
        if (self::normalize($ifMatch) === null) {
            Problem::throw(Response::HTTP_PRECONDITION_REQUIRED, 'PRECONDITION_REQUIRED', $title);
        }
    }
```

Also widen `assertMatch`'s first parameter to `Week|LogbookTemplate|Placement $model`, with `use App\Models\Placement;`.

In `app/Http/Controllers/TemplateController.php`, delete the private `requireIfMatch()`. Replace both `$this->requireIfMatch($request);` calls with `ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload the template and try again.');`.

- [ ] **Step 7: Add the logbook presenter.** In `app/Http/Resources/PortalResources.php` (add `use App\Models\LogbookTemplate;`, `use App\Services\WeekService;` and `use Illuminate\Database\Eloquent\Collection as EloquentCollection;`), add these keys to `weekSummary`'s `$payload` array, after `'status'`:

```php
            'periodKey' => WeekService::periodKey(substr((string) $week->start_date, 0, 10)),
            'fillStatus' => self::fillStatus($week),
            'templateId' => $week->template_id,
            'values' => (object) ($week->answers ?? []),
            'autofilled' => (object) ($week->autofilled ?? []),
```

and add:

```php
    /**
     * The prototype's four-state status, derived from the stored workflow columns.
     */
    public static function fillStatus(Week $week): string
    {
        return match (true) {
            $week->status !== Week::STATUS_SUBMITTED => 'draft',
            $week->company_status === Week::REVIEW_APPROVED => 'approved',
            $week->company_status === Week::REVIEW_CHANGES => 'changes_requested',
            default => 'submitted',
        };
    }

    /**
     * One intern's whole logbook: who they are, their setup, and every week.
     *
     * @param  EloquentCollection<int, Week>  $weeks
     * @param  callable(Week): array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function logbook(User $student, ?Placement $placement, EloquentCollection $weeks, callable $capabilities): array
    {
        $weeks->load(['dailyEntries']);

        return [
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
                'templateId' => LogbookTemplate::forUniversity($placement?->university_name)?->id,
                'startDate' => $placement === null ? null : substr((string) $placement->start_date, 0, 10),
                'endDate' => $placement === null ? null : substr((string) $placement->end_date, 0, 10),
                'coverValues' => (object) ($placement?->cover_values ?? []),
                'version' => $placement?->version,
                'canChangeSetup' => $placement === null || ! $placement->setupLocked(),
            ],
            'weeks' => $weeks->map(fn (Week $week): array => self::weekDetail($week, $capabilities($week)))->values()->all(),
        ];
    }
```

- [ ] **Step 8: Write the request** `app/Http/Requests/InternshipRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Services\WeekService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class InternshipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'templateId' => ['required', 'string', 'exists:logbook_templates,id'],
            'startDate' => ['required', 'date_format:Y-m-d'],
            'endDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:startDate'],
            'coverValues' => ['present', 'array', 'max:500'],
            'coverValues.*' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $start = $this->input('startDate');
            $end = $this->input('endDate');

            if (is_string($start) && is_string($end) && WeekService::isValidDate($start) && WeekService::isValidDate($end)
                && WeekService::addDays($start, 366) < $end) {
                $validator->errors()->add('endDate', 'An internship can be at most one year long.');
            }
        }];
    }
}
```

- [ ] **Step 9: Write the controller** `app/Http/Controllers/LogbookController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\InternshipRequest;
use App\Http\Resources\PortalResources;
use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\User;
use App\Models\Week;
use App\Services\CapabilityService;
use App\Services\ConcurrencyService;
use App\Services\WeekService;
use App\Support\Problem;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class LogbookController extends Controller
{
    // ponytail: one timezone for interns who set themselves up; take it from the gateway if interns span zones.
    private const TIMEZONE = 'Asia/Kuala_Lumpur';

    public function __construct(
        private readonly WeekService $weeks,
        private readonly CapabilityService $capabilities,
    ) {}

    private function requireStudent(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns have a logbook.');
        }

        return $user;
    }

    private function respond(User $student): JsonResponse
    {
        $placement = Placement::query()->where('student_id', $student->id)->first();
        $weeks = $placement === null ? new Collection : $this->weeks->ensureWeeks($placement);
        $today = $placement === null ? '' : $this->weeks->programmeToday($placement);

        $response = response()->json(PortalResources::logbook(
            $student,
            $placement,
            $weeks,
            fn (Week $week): array => $this->capabilities->forStudentWeek($week, $today, $this->weeks)
        ));

        return $placement === null ? $response : $response->header('ETag', ConcurrencyService::etagFor($placement->version));
    }

    public function mine(Request $request): JsonResponse
    {
        return $this->respond($this->requireStudent($request));
    }

    public function setup(InternshipRequest $request): JsonResponse
    {
        $user = $this->requireStudent($request);
        $template = LogbookTemplate::query()->findOrFail($request->validated('templateId'));
        $fields = [
            'university_name' => $template->university_name,
            'start_date' => (string) $request->validated('startDate'),
            'end_date' => (string) $request->validated('endDate'),
            'cover_values' => $request->validated('coverValues'),
        ];

        DB::transaction(function () use ($request, $user, $fields): void {
            $placement = Placement::query()->where('student_id', $user->id)->lockForUpdate()->first();

            if ($placement === null) {
                if ($user->company_id === null) {
                    Problem::throw(Response::HTTP_CONFLICT, 'NO_COMPANY', 'Your account is not linked to a company yet. Ask your supervisor.');
                }

                $placement = new Placement([
                    ...$fields,
                    'id' => (string) Str::uuid(),
                    'student_id' => $user->id,
                    'company_id' => $user->company_id,
                    'programme_name' => '',
                    'position' => '',
                    'programme_timezone' => self::TIMEZONE,
                    'version' => 'p-1',
                ]);
                $placement->save();
                $this->weeks->syncWeeks($placement);

                return;
            }

            ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload your internship and try again.');
            ConcurrencyService::assertMatch($placement, $request->header('If-Match'));

            $datesChanged = substr((string) $placement->start_date, 0, 10) !== $fields['start_date']
                || substr((string) $placement->end_date, 0, 10) !== $fields['end_date'];

            if (($datesChanged || $placement->university_name !== $fields['university_name']) && $placement->setupLocked()) {
                Problem::throw(Response::HTTP_CONFLICT, 'SETUP_LOCKED', 'You can only change your university or dates before any week is submitted.');
            }

            $placement->fill([...$fields, 'version' => ConcurrencyService::bump($placement->version)])->save();

            if ($datesChanged) {
                $this->weeks->syncWeeks($placement);
            }
        });

        return $this->respond($user);
    }
}
```

Weeks are re-cut only when the dates change. Re-cutting bumps every week's version, and a cover-only save must not make the screen's week ETags stale.

- [ ] **Step 10: Add the routes** to `routes/portal.php` (add `use App\Http\Controllers\LogbookController;`), next to `me/internship`:

```php
    Route::get('me/logbook', [LogbookController::class, 'mine'])->middleware('auth');
    Route::put('me/internship', [LogbookController::class, 'setup'])->middleware('auth');
```

- [ ] **Step 11: Give the seeded interns their company.** In `database/seeders/PortalSeeder.php`, add `'company_id' => $nusantara->id` to `student-1` and `student-3`, and `'company_id' => $merlion->id` to `student-2`. The gateway will supply this in step 4; `PUT /me/internship` uses it to create a placement.

- [ ] **Step 12: Commit, push, check CI.**

```bash
git add -A appv3/backend
git commit -m "feat(backend): logbook read and internship setup on Monday-to-Sunday weeks"
git push
```

Expected: green. The existing JournalTest and ReviewTest week dates are unchanged, because the seeded internships start on a Monday.

---

### Task 3: Week answers replace the weekly draft; notes follow the prototype's rules

**Files:**
- Create: `database/migrations/2026_09_30_000003_drop_weekly_draft.php`, `app/Http/Requests/WeekValuesRequest.php`
- Delete: `app/Http/Requests/WeeklyDraftRequest.php`
- Modify: `app/Http/Controllers/StudentWeekController.php`, `app/Http/Requests/SubmitRequest.php`, `app/Http/Requests/DailyUpdateRequest.php`, `app/Services/CapabilityService.php`, `app/Services/WeekService.php`, `app/Http/Resources/PortalResources.php`, `app/Models/Week.php`, `routes/portal.php`, `database/seeders/PortalSeeder.php`, `tests/TestCase.php`, `tests/Feature/JournalTest.php`, `tests/Feature/ReviewTest.php`

**Interfaces:**
- Consumes: `TestCase::template()`, `weeks.answers/autofilled/template_id`, `ConcurrencyService::requireIfMatch`, `studentEditable`.
- Produces:
  - `PUT /api/v1/me/journal/weeks/{n}/values` `{templateId, values: {id: string}, autofilled: {id: string}}` → weekDetail + ETag;
  - `POST …/submit` `{version}`;
  - `TestCase::fillWeek(int $weekNumber, array $values = ['summary' => 'Final weekly report.']): string` (signs in as student-1, returns the new version).

- [ ] **Step 1: Add the `fillWeek()` test helper** to `tests/TestCase.php`:

```php
    /**
     * Saves answers on one of student-1's weeks, as student-1, and returns the new version.
     *
     * @param  array<string, string>  $values
     */
    protected function fillWeek(int $weekNumber, array $values = ['summary' => 'Final weekly report.']): string
    {
        $this->be($this->user('student-1'));
        $template = LogbookTemplate::forUniversity('Universiti Teknologi Malaysia') ?? $this->template();
        $etag = (string) $this->portal('GET', "/api/v1/me/journal/weeks/{$weekNumber}")->headers->get('ETag');

        return (string) $this->portal('PUT', "/api/v1/me/journal/weeks/{$weekNumber}/values", [
            'templateId' => $template->id,
            'values' => $values,
            'autofilled' => [],
        ], ['If-Match' => $etag])->assertOk()->json('version');
    }
```

- [ ] **Step 2: Rewrite the JournalTest cases that change** (add `use App\Models\LogbookTemplate;` and `use Illuminate\Testing\TestResponse;`):
  - `test_show_submitted_week_is_read_only_for_student`: replace the `submittedBody` assertion with `$response->assertJsonPath('fillStatus', 'submitted');`.
  - Replace `test_update_daily_stays_editable_after_submission` with:

```php
    public function test_notes_are_locked_while_the_week_is_with_the_supervisor(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-08-05', 'body' => 'Sneaky edit.'])
            ->assertConflict()
            ->assertJsonPath('code', 'TRANSITION_CONFLICT');

        // Week 3 has changes requested, so its notes are open again.
        $this->portal('PUT', '/api/v1/me/journal/weeks/3/daily', ['date' => '2026-08-18', 'body' => 'Added examples.'])
            ->assertOk();
    }
```

  - Replace `test_update_daily_rejects_weekend_with_422` with:

```php
    public function test_update_daily_accepts_weekends(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', ['date' => '2026-08-15', 'body' => 'Weekend work.'])
            ->assertOk()
            ->assertJsonPath('body', 'Weekend work.');
    }
```

  - Replace `test_locked_week_blocks_daily_draft_and_submit` with:

```php
    public function test_a_week_that_has_not_started_takes_answers_but_not_notes_or_submit(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));

        Carbon::setTestNow(Carbon::parse('2026-08-05 12:00:00', 'Asia/Kuala_Lumpur'));

        try {
            $detail = $this->portal('GET', '/api/v1/me/journal/weeks/2');
            $detail->assertOk()
                ->assertJsonPath('capabilities.canEdit', true)
                ->assertJsonPath('capabilities.canSubmit', false);

            $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', ['date' => '2026-08-12', 'body' => 'Too early.'])
                ->assertForbidden()
                ->assertJsonPath('code', 'FORBIDDEN');

            $version = $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
                'templateId' => $template->id,
                'values' => ['summary' => 'Plan for next week.'],
                'autofilled' => [],
            ], ['If-Match' => (string) $detail->headers->get('ETag')])->assertOk()->json('version');

            $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', ['version' => $version], ['Idempotency-Key' => $this->idemKey()])
                ->assertForbidden()
                ->assertJsonPath('code', 'FORBIDDEN');
        } finally {
            Carbon::setTestNow(null);
        }
    }
```

  - Replace the four `test_update_draft_*` tests with:

```php
    public function test_values_save_answers_and_bump_version(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        [$version, $etag] = $this->weekVersion(2);

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
            'templateId' => $template->id,
            'values' => ['ph-1' => 'Built the login form.', 'ph-2' => ''],
            'autofilled' => ['ph-1' => 'Built the login form.'],
        ], ['If-Match' => $etag]);

        $response->assertOk()
            ->assertJsonPath('values', ['ph-1' => 'Built the login form.', 'ph-2' => ''])
            ->assertJsonPath('autofilled', ['ph-1' => 'Built the login form.'])
            ->assertJsonPath('templateId', $template->id)
            ->assertJsonPath('status', 'draft');
        $this->assertNotSame($version, $response->json('version'));
        $this->assertSame('"'.$response->json('version').'"', $response->headers->get('ETag'));
    }

    public function test_values_need_a_current_if_match(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $body = ['templateId' => $template->id, 'values' => ['ph-1' => 'x'], 'autofilled' => []];

        $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', $body)
            ->assertStatus(428)
            ->assertJsonPath('code', 'PRECONDITION_REQUIRED');
        $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', $body, ['If-Match' => '"stale-version"'])
            ->assertStatus(412)
            ->assertJsonPath('code', 'STALE_VERSION');
    }

    public function test_values_are_locked_while_submitted_and_open_after_changes_requested(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $body = ['templateId' => $template->id, 'values' => ['ph-1' => 'x'], 'autofilled' => []];

        [, $etag] = $this->weekVersion(1);
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/values', $body, ['If-Match' => $etag])
            ->assertConflict()
            ->assertJsonPath('code', 'TRANSITION_CONFLICT');

        [, $etag] = $this->weekVersion(3);
        $this->portal('PUT', '/api/v1/me/journal/weeks/3/values', $body, ['If-Match' => $etag])->assertOk();
    }

    public function test_values_must_be_for_the_interns_current_template(): void
    {
        $this->template();
        $other = $this->template('University of Melbourne');
        $this->be($this->user('student-1'));
        [, $etag] = $this->weekVersion(2);

        $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
            'templateId' => $other->id,
            'values' => ['ph-1' => 'x'],
            'autofilled' => [],
        ], ['If-Match' => $etag])->assertConflict()->assertJsonPath('code', 'TEMPLATE_CHANGED');
    }

    public function test_values_reject_oversized_or_nested_answers(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        [, $etag] = $this->weekVersion(2);

        foreach ([['ph-1' => str_repeat('x', 5001)], ['ph-1' => ['nested']]] as $values) {
            $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
                'templateId' => $template->id,
                'values' => $values,
                'autofilled' => [],
            ], ['If-Match' => $etag])->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_FAILED');
        }
    }
```

  - Replace every submit test, from `test_submit_transitions_draft_to_submitted` through `test_resubmit_after_changes_requested_reopens_company_review`, with:

```php
    private function submit(int $weekNumber, string $version, ?string $key = null): TestResponse
    {
        return $this->portal('POST', "/api/v1/me/journal/weeks/{$weekNumber}/submit", ['version' => $version], [
            'Idempotency-Key' => $key ?? $this->idemKey(),
        ]);
    }

    private function week(int $weekNumber): Week
    {
        return Week::query()->where('placement_id', 'placement-a')->where('week_number', $weekNumber)->firstOrFail();
    }

    public function test_submit_transitions_draft_to_submitted(): void
    {
        $version = $this->fillWeek(2);

        $this->submit(2, $version)
            ->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('status', 'submitted')
            ->assertJsonPath('fillStatus', 'submitted')
            ->assertJsonPath('review.status', 'pending')
            ->assertJsonPath('capabilities.canEdit', false);

        $submission = Submission::query()->where('week_id', $this->week(2)->id)->sole();
        $this->assertSame(['summary' => 'Final weekly report.'], json_decode($submission->submitted_body, true));
    }

    public function test_submit_rejects_an_unfilled_week_with_422(): void
    {
        $this->template();
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(4);

        $this->submit(4, $version)->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_submit_rejects_answers_for_a_replaced_template(): void
    {
        $version = $this->fillWeek(2);

        // Step 1's "Replace" deletes the template and creates a new one for the same university.
        LogbookTemplate::query()->delete();
        $this->template();

        $this->submit(2, $version)->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_submit_requires_idempotency_key_with_422(): void
    {
        $version = $this->fillWeek(2);

        $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', ['version' => $version])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_submit_rejects_stale_version_with_412(): void
    {
        $this->fillWeek(2);

        $this->submit(2, 'stale-version')->assertStatus(412)->assertJsonPath('code', 'STALE_VERSION');
    }

    public function test_double_submit_conflicts_with_409(): void
    {
        $this->submit(2, $this->fillWeek(2))->assertOk();
        [$newVersion] = $this->weekVersion(2);

        $this->submit(2, $newVersion)->assertConflict()->assertJsonPath('code', 'TRANSITION_CONFLICT');
    }

    public function test_submit_replays_identical_idempotent_retry(): void
    {
        $version = $this->fillWeek(2);
        $key = $this->idemKey();

        $first = $this->submit(2, $version, $key)->assertOk();
        $second = $this->submit(2, $version, $key)->assertOk();

        $this->assertSame($first->json('version'), $second->json('version'));
        $this->assertSame(1, Submission::query()->where('week_id', $this->week(2)->id)->count());
    }

    public function test_submit_rejects_reused_key_with_different_payload_with_409(): void
    {
        $version = $this->fillWeek(4);
        $key = $this->idemKey();

        $this->submit(4, $version, $key)->assertOk();
        $this->submit(4, 'another-version', $key)->assertConflict()->assertJsonPath('code', 'VERSION_CONFLICT');
    }

    public function test_resubmit_after_changes_requested_reopens_company_review(): void
    {
        $original = Submission::query()->where('week_id', $this->week(3)->id)->firstOrFail();
        $version = $this->fillWeek(3, ['summary' => 'Needs work, now with concrete examples.']);

        $this->submit(3, $version)
            ->assertOk()
            ->assertJsonPath('status', 'submitted')
            ->assertJsonPath('review.status', 'pending');

        // Immutable history: the original snapshot row is untouched, a new one is appended.
        $this->assertSame(2, Submission::query()->where('week_id', $this->week(3)->id)->count());
        $this->assertSame('Needs work.', $original->refresh()->submitted_body);
    }
```

- [ ] **Step 3: Update ReviewTest.**
  - Replace the `studentSubmit()` helper with:

```php
    private function studentSubmit(int $weekNumber, string $answer): void
    {
        $version = $this->fillWeek($weekNumber, ['summary' => $answer]);

        $this->portal('POST', "/api/v1/me/journal/weeks/{$weekNumber}/submit", ['version' => $version], [
            'Idempotency-Key' => $this->idemKey(),
        ])->assertOk();
    }
```

  - In `test_supervisor_week_detail_derives_review_capability`, replace the `submittedBody` assertion with `$response->assertJsonPath('fillStatus', 'submitted');`.

- [ ] **Step 4: Drop the weekly draft.** Write `database/migrations/2026_09_30_000003_drop_weekly_draft.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A week's content is now its template answers (weeks.answers), not free draft text.
     */
    public function up(): void
    {
        Schema::table('weeks', function (Blueprint $table) {
            $table->dropColumn(['weekly_draft', 'weekly_draft_updated_at']);
        });
    }

    public function down(): void
    {
        Schema::table('weeks', function (Blueprint $table) {
            $table->mediumText('weekly_draft')->nullable();
            $table->timestamp('weekly_draft_updated_at')->nullable();
        });
    }
};
```

Then remove the draft everywhere else:
  - `app/Models/Week.php`: remove `weekly_draft` and `weekly_draft_updated_at` from `$fillable` and `casts()`, and the `@property … $weekly_draft_updated_at` line.
  - `app/Services/WeekService.php` `ensureWeeks`: delete `'weekly_draft' => '',`.
  - `app/Http/Resources/PortalResources.php` `weekDetail`: delete the `weeklyDraft`, `weeklyDraftUpdatedAt` and `submittedBody` lines.
  - `database/seeders/PortalSeeder.php`: in the three `seedWeekState` calls, replace each `'weekly_draft' => 'X',` with `'answers' => ['summary' => 'X'],`. Keep `submitted_body`.
  - `routes/portal.php`: replace the `weekly-draft` route with:

```php
    Route::put('me/journal/weeks/{weekNumber}/values', [StudentWeekController::class, 'updateValues'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
```

  - `git rm app/Http/Requests/WeeklyDraftRequest.php`.

- [ ] **Step 5: Write the requests.** Create `app/Http/Requests/WeekValuesRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class WeekValuesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'templateId' => ['required', 'string', 'max:64'],
            'values' => ['present', 'array', 'max:500'],
            'values.*' => ['nullable', 'string', 'max:5000'],
            'autofilled' => ['present', 'array', 'max:500'],
            'autofilled.*' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
```

In `SubmitRequest::rules()`, delete the `'draft'` rule. In `DailyUpdateRequest::rules()`, make `'body'` `['present', 'string', 'max:20000']`.

- [ ] **Step 6: Let interns fill a week before it starts.** In `CapabilityService::forStudentWeek()`:

```php
        $editable = $this->studentEditable($week);

        return [
            'canEdit' => $editable,
            'canSubmit' => $editable && $weeks->availability($week, $today) !== 'locked',
            'canReview' => false,
        ];
```

- [ ] **Step 7: Rework StudentWeekController** (add `use App\Http\Requests\WeekValuesRequest;` and `use App\Models\LogbookTemplate;`; remove `use App\Http\Requests\WeeklyDraftRequest;`):
  - delete `updateDraft()`;
  - add the edit guard:

```php
    private function assertEditable(Week $week): void
    {
        if (! $this->capabilities->studentEditable($week)) {
            Problem::throw(
                Response::HTTP_CONFLICT,
                'TRANSITION_CONFLICT',
                "This week is with your supervisor or already approved, so it can't be changed."
            );
        }
    }
```

  - in `updateDaily()`'s transaction, right after `ConcurrencyService::assertMatch($locked, $ifMatch);`, add `$this->assertEditable($locked);`;
  - in `assertDailyAvailable()`, delete the `if (! WeekService::isWeekday($date)) { … }` block;
  - add:

```php
    public function updateValues(WeekValuesRequest $request, int $weekNumber): JsonResponse
    {
        $user = $request->user();
        $placement = $this->placementFor($user);
        $week = $this->weekFor($placement, $weekNumber);

        Gate::authorize('mutateAsStudent', $week);
        ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload the week and try again.');

        $templateId = (string) $request->validated('templateId');

        if ($templateId !== LogbookTemplate::forUniversity($placement->university_name)?->id) {
            Problem::throw(Response::HTTP_CONFLICT, 'TEMPLATE_CHANGED', 'Your university template changed. Reload the page.');
        }

        $today = $this->weeks->programmeToday($placement);

        $detail = DB::transaction(function () use ($request, $week, $templateId, $today): array {
            /** @var Week $locked */
            $locked = Week::query()->whereKey($week->id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'));
            $this->assertEditable($locked);

            /** @var array<string, string|null> $values */
            $values = $request->validated('values');
            $locked->template_id = $templateId;
            $locked->answers = $values;
            $locked->autofilled = $request->validated('autofilled');

            if ($locked->status !== Week::STATUS_SUBMITTED) {
                $filled = array_filter($values, fn (?string $value): bool => trim((string) $value) !== '');
                $locked->status = $filled === [] ? Week::STATUS_NOT_STARTED : Week::STATUS_DRAFT;
            }

            $locked->version = ConcurrencyService::bump($locked->version);
            $locked->save();
            $locked->load(['dailyEntries', 'placement']);

            return PortalResources::weekDetail($locked, $this->capabilities->forStudentWeek($locked, $today, $this->weeks));
        });

        return response()->json($detail)->header('ETag', ConcurrencyService::etagFor($detail['version']));
    }
```

  - replace `submit()` with:

```php
    public function submit(SubmitRequest $request, int $weekNumber): JsonResponse
    {
        $user = $request->user();
        $placement = $this->placementFor($user);
        $week = $this->weekFor($placement, $weekNumber);

        Gate::authorize('mutateAsStudent', $week);

        $key = $this->idempotency->requireKey($request->header('Idempotency-Key'));
        $scope = "submit:u:{$user->id}:w:{$week->id}";
        $validated = $request->validated();
        $hash = IdempotencyService::hash('POST', $request->path(), $validated);

        $replay = $this->idempotency->replay($scope, $key, $hash);
        if ($replay !== null) {
            return $this->idempotency->replayResponse($replay);
        }

        ConcurrencyService::assertMatch($week, $request->header('If-Match'), (string) $validated['version']);

        $today = $this->weeks->programmeToday($placement);

        if ($week->start_date > $today) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'This week is locked until its start date.');
        }

        $templateId = LogbookTemplate::forUniversity($placement->university_name)?->id;

        $detail = DB::transaction(function () use ($request, $week, $user, $templateId, $today): array {
            /** @var Week $locked */
            $locked = Week::query()->whereKey($week->id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'), (string) $request->input('version'));
            $this->assertEditable($locked);

            $answers = array_filter($locked->answers ?? [], fn (?string $value): bool => trim((string) $value) !== '');

            // Answers written for a template that has since been replaced don't count.
            if ($answers === [] || $templateId === null || $locked->template_id !== $templateId) {
                Problem::throw(
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                    'VALIDATION_FAILED',
                    'Fill in this week before you submit it.',
                    null,
                    ['values' => ["Fill in at least one field of your university's current template."]]
                );
            }

            $now = Carbon::now();
            $body = (string) json_encode($locked->answers, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $locked->submitted_body = $body;
            $locked->submitted_at = $now;
            $locked->status = Week::STATUS_SUBMITTED;
            // First submit and every resubmit go back to the supervisor; the last feedback is kept.
            $locked->company_status = Week::REVIEW_PENDING;
            $locked->version = ConcurrencyService::bump($locked->version);
            $locked->save();

            Submission::query()->create([
                'week_id' => $locked->id,
                'submitted_body' => $body,
                'version' => $locked->version,
                'submitted_by' => $user->id,
                'created_at' => $now,
            ]);

            $locked->load(['dailyEntries', 'placement']);

            return PortalResources::weekDetail($locked, $this->capabilities->forStudentWeek($locked, $today, $this->weeks));
        });

        $etag = ConcurrencyService::etagFor($detail['version']);
        $this->idempotency->store($scope, $key, $hash, 200, $detail, $etag);

        return response()->json($detail)->header('ETag', $etag);
    }
```

- [ ] **Step 8: Check for leftovers.**

Run: `grep -rn "weekly_draft\|weeklyDraft\|updateDraft\|'draft' =>" app database/seeders routes tests`
Expected: no matches. The status constant `STATUS_DRAFT` is fine.

- [ ] **Step 9: Commit, push, check CI.**

```bash
git add -A appv3/backend
git commit -m "feat(backend): weeks store template answers; notes and submit follow the logbook screens"
git push
```

---

### Task 4: Server-signed approval, history, supervisor logbook, university list for interns

**Files:**
- Modify: `app/Http/Controllers/SupervisorController.php`, `app/Http/Controllers/TemplateController.php`, `app/Http/Resources/PortalResources.php`, `app/Models/Submission.php`, `app/Models/ReviewAction.php`, `routes/portal.php`
- Test: `tests/Feature/ReviewTest.php`, `tests/Feature/TemplateTest.php`

**Interfaces:**
- Consumes: `PortalResources::logbook` (Task 2), `fillWeek` (Task 3), `review_actions.signature` (Task 2).
- Produces:
  - `weekDetail.history: [{id, action: 'submit'|'approve'|'request_changes', by, signature?, comment?, at}]`, oldest first. This is the prototype's `ReviewAction` shape, minus `studentId` and `periodKey`, which come from the enclosing logbook and week.
  - `GET /api/v1/supervisor/interns/{studentId}/logbook`.
  - `GET /api/v1/templates` for interns returns `{data: [{id, universityName}]}`.

- [ ] **Step 1: Write the failing tests.** Add to `tests/Feature/ReviewTest.php` (add `use App\Models\LogbookTemplate;`):

```php
    public function test_approval_is_signed_by_the_signed_in_supervisor(): void
    {
        $response = $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
            'signature' => 'Someone Else',
        ], ['Idempotency-Key' => $this->idemKey()]);

        $response->assertOk();
        $approval = collect($response->json('history'))->firstWhere('action', 'approve');
        $this->assertSame('Sarah Lim', $approval['signature']);
        $this->assertSame('Sarah Lim', $approval['by']);
        $this->assertDatabaseHas('review_actions', ['decision' => 'approve', 'signature' => 'Sarah Lim']);
    }

    public function test_a_full_review_cycle_is_recorded_in_the_history(): void
    {
        $this->studentSubmit(4, 'First go.');
        $this->supervisorReview('student-1', 4, ['decision' => 'request_changes', 'feedback' => 'Add examples.'], [
            'Idempotency-Key' => $this->idemKey(),
        ])->assertOk();

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/me/journal/weeks/4')
            ->assertJsonPath('fillStatus', 'changes_requested')
            ->assertJsonPath('capabilities.canEdit', true);

        $this->studentSubmit(4, 'Second go, with examples.');
        $approved = $this->supervisorReview('student-1', 4, ['decision' => 'approve'], ['Idempotency-Key' => $this->idemKey()]);

        $approved->assertOk()->assertJsonPath('fillStatus', 'approved');
        $this->assertEqualsCanonicalizing(
            ['submit', 'request_changes', 'submit', 'approve'],
            array_column($approved->json('history'), 'action')
        );
        $this->assertSame('Add examples.', collect($approved->json('history'))->firstWhere('action', 'request_changes')['comment']);
        $this->assertSame('Aisha Rahman', collect($approved->json('history'))->firstWhere('action', 'submit')['by']);

        // Approved weeks are read-only for the intern.
        $this->be($this->user('student-1'));
        $etag = (string) $this->portal('GET', '/api/v1/me/journal/weeks/4')->headers->get('ETag');
        $this->portal('PUT', '/api/v1/me/journal/weeks/4/values', [
            'templateId' => LogbookTemplate::forUniversity('Universiti Teknologi Malaysia')?->id,
            'values' => ['summary' => 'Edit after approval.'],
            'autofilled' => [],
        ], ['If-Match' => $etag])->assertConflict()->assertJsonPath('code', 'TRANSITION_CONFLICT');
    }

    public function test_supervisor_reads_an_interns_whole_logbook(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook');

        $response->assertOk()
            ->assertJsonPath('student.name', 'Aisha Rahman')
            ->assertJsonPath('weeks.0.periodKey', 'w:2026-08-03')
            ->assertJsonPath('weeks.0.capabilities.canReview', true)
            ->assertJsonPath('weeks.2.fillStatus', 'changes_requested');
        $this->assertCount(8, $response->json('weeks'));
        $this->assertSame(
            'Add concrete examples.',
            collect($response->json('weeks.2.history'))->firstWhere('action', 'request_changes')['comment']
        );
    }

    public function test_logbooks_stay_inside_the_company_and_the_intern(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-2/logbook')->assertForbidden();

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertForbidden();
        $this->portal('GET', '/api/v1/me/logbook')->assertOk()->assertJsonPath('student.id', 'student-1');
    }
```

In `tests/Feature/TemplateTest.php`, delete the last line of `test_only_supervisors_manage_templates` (`$this->portal('GET', '/api/v1/templates')->assertForbidden();`) and add:

```php
    public function test_interns_list_universities_without_counts(): void
    {
        $id = $this->createDocx()->json('id');

        $this->be($this->user('student-3'));
        $this->portal('GET', '/api/v1/templates')
            ->assertOk()
            ->assertExactJson(['data' => [['id' => $id, 'universityName' => 'Universiti Teknologi Malaysia']]]);
    }
```

The history test uses `assertEqualsCanonicalizing` because tests freeze the clock, so every entry has the same `at` and their order isn't meaningful.

- [ ] **Step 2: Add the relations.**

`app/Models/Submission.php`:

```php
    /**
     * @return BelongsTo<User, $this>
     */
    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
```

`app/Models/ReviewAction.php`:

```php
    /**
     * @return BelongsTo<User, $this>
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }
```

- [ ] **Step 3: Add the history to every week.** In `app/Http/Resources/PortalResources.php` (add `use App\Models\ReviewAction;` and `use App\Models\Submission;`):
  - in `weekDetail`, before `return $payload;`, add `$payload['history'] = self::history($week);`;
  - in `logbook`, change the eager load to `$weeks->load(['dailyEntries', 'submissions.submitter', 'reviewActions.reviewer']);`;
  - add:

```php
    /**
     * Submits and review decisions, oldest first, in the prototype's ReviewAction shape.
     *
     * @return array<int, array<string, string>>
     */
    public static function history(Week $week): array
    {
        $submits = $week->submissions->map(fn (Submission $submission): array => [
            'id' => "s{$submission->id}",
            'action' => 'submit',
            'by' => $submission->submitter?->name ?? $submission->submitted_by,
            'at' => (string) $submission->created_at?->toJSON(),
        ]);

        $reviews = $week->reviewActions->map(fn (ReviewAction $action): array => array_filter([
            'id' => "r{$action->id}",
            'action' => $action->decision,
            'by' => $action->reviewer?->name ?? $action->reviewer_id,
            'signature' => $action->signature,
            'comment' => $action->feedback,
            'at' => (string) $action->created_at?->toJSON(),
        ], fn (?string $value): bool => $value !== null));

        return $submits->concat($reviews)->sortBy('at')->values()->all();
    }
```

- [ ] **Step 4: Sign approvals on the server.** In `SupervisorController::review()`, add this to the `ReviewAction::query()->create([...])` array:

```php
                // The name comes from the signed-in supervisor, never from the request, so an approval can't be forged.
                'signature' => $decision === 'approve' ? $supervisor->name : null,
```

`ReviewRequest` stays as it is. It has no `signature` rule, so `validated()` drops the field.

- [ ] **Step 5: Add the supervisor's logbook read** to `SupervisorController`:

```php
    public function logbook(Request $request, string $studentId): JsonResponse
    {
        $supervisor = $this->requireSupervisor($request);
        $placement = $this->placementInScope($supervisor, $studentId);
        /** @var User $student */
        $student = $placement->student;

        return response()->json(PortalResources::logbook(
            $student,
            $placement,
            $this->weeks->ensureWeeks($placement),
            fn (Week $week): array => $this->capabilities->forSupervisorWeek($week)
        ));
    }
```

and its route in `routes/portal.php`, after `supervisor/interns/{studentId}/weeks`:

```php
    Route::get('supervisor/interns/{studentId}/logbook', [SupervisorController::class, 'logbook'])->middleware('auth');
```

- [ ] **Step 6: Let interns list the universities.** At the top of `TemplateController::index()`, replace `$this->requireSupervisor($request);` with:

```php
        /** @var User $user */
        $user = $request->user();

        if (! $user->isSupervisor()) {
            // Interns pick their university from this list under "My internship"; they don't need the counts.
            return response()->json(['data' => LogbookTemplate::query()
                ->orderBy('university_name')
                ->get()
                ->map(fn (LogbookTemplate $template): array => ['id' => $template->id, 'universityName' => $template->university_name])
                ->all()]);
        }
```

- [ ] **Step 7: Commit, push, check CI.**

```bash
git add -A appv3/backend
git commit -m "feat(backend): server-signed approvals, week history and the supervisor's logbook view"
git push
```

Expected: green.

---

### Task 5: Check the roadmap's "done when" and hand over

**Files:** none.

- [ ] **Step 1: Check each roadmap rule against a test.** Each rule must have at least one passing test in the green CI run:

| Roadmap rule | Test |
|---|---|
| Only a supervisor approves or requests changes, only for their own company | `test_supervisor_endpoints_forbid_students`, `test_supervisor_cannot_reach_out_of_company_intern` |
| The approval signature and time come from the server | `test_approval_is_signed_by_the_signed_in_supervisor` |
| Interns edit only draft or changes-requested weeks | `test_values_are_locked_while_submitted_and_open_after_changes_requested`, `test_notes_are_locked_while_the_week_is_with_the_supervisor`, `test_a_full_review_cycle_is_recorded_in_the_history` |
| Interns see only their own data | `test_logbooks_stay_inside_the_company_and_the_intern`, `test_only_interns_have_a_logbook`, `test_index_forbids_non_students` |
| Saving over a newer change is refused | `test_values_need_a_current_if_match`, `test_changing_an_existing_setup_needs_a_current_if_match`, `test_update_daily_rejects_stale_version_with_412` |
| The mentor stage is removed | `test_the_mentor_stage_is_gone` |

- [ ] **Step 2: Give the user a prefilled PR link.** Point it at `master...feat/step-2-logbook`, as for steps 0 and 1. Merge only when the user says so.
