# AI organising Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interns press ✦ Organize on a journal entry, review AI suggestions (project, activities, learning, skills), and see what they accepted on new Projects, Learning and Skills pages.

**Architecture:** The server stores the reviewed state on each journal row (`project_id`, `items` JSON) and a per-person `projects` table. Its organize endpoint only asks OpenAI and returns raw suggestions. One TypeScript merge (`mergeSuggestions`) in the browser turns suggestions into items, and the page saves the result. The three pages are computed in the browser from the loaded journal. The browser-only demo uses a no-AI stand-in through the same Repository seam.

**Tech Stack:** Vue 3, Pinia, vue-router (hash), idb, Vitest + fake-indexeddb, Playwright. Laravel 12 on PHP 8.4, Sanctum, Pint, PHPStan, `resources/openapi.json` enforced by OpenApiTest.

**Spec:** `docs/superpowers/specs/2026-10-07-ai-organising-design.md`

## Global Constraints

- **Who and what:**
  - Interns only. Supervisors get 403 from the new endpoints, have no Organize button, and no Projects/Learning/Skills links; a direct URL redirects to `/today`.
  - Private: only the signed-in person's own projects and items are ever read or written.
- **AI calls:**
  - Model `gpt-4o-mini`, using the server key `config('services.openai.key')`.
  - Nothing is sent to OpenAI unless Organize is pressed.
  - Limited to 30 organizes a day per user (`config('portal.organizes_per_day', 30)`, env `AI_ORGANIZES_PER_DAY`), separate from summaries.
- **Limits:**
  - Item `kind` ∈ `project|activity|learning|skill`; `status` ∈ `suggested|accepted|rejected`.
  - Item text 1–300 characters; at most 40 items per entry.
  - Suggestion lists cut to 4 activities, 3 learning points and 3 skills.
  - Project name 1–120 characters, unique per person ignoring case and outer spaces; description at most 500.
- **Copy:**
  - Failure: `Your entry is saved. I couldn't organize it right now. Try again`
  - Over the limit: `You've organized 30 times today. Try again tomorrow.` (the number comes from config)
  - Delete in use: `Entries still use this project. Move them first.`
  - Clearing: `This entry has accepted items. Clearing it removes them from your Projects, Learning and Skills. Clear it?`
  - Demo label: `Demo suggestions (no AI)`
  - Empty states: `Projects appear when you accept one from an entry, or add one here.`, `Learning points appear here when you accept them from your entries.`, `Skills appear only when your journal supports them.`
  - Unknown pages: `That project doesn't exist.`, `You haven't been seen using that skill yet.`
- **Commands:**
  - Never run `npm run build`. Type-check with `npx vue-tsc --noEmit`; check a build with `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
  - Server tests:

    ```bash
    cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app/appv3/backend && OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=sqlite DB_DATABASE=:memory: C:/Users/User/php84/php.exe artisan test
    ```

    Add `--filter=<Class>` to run one test class; write large output to a file and grep `Tests:`.
  - Lint the server with `C:/Users/User/php84/php.exe vendor/bin/pint --test` and `C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --no-progress --memory-limit=1G`.
- **Branches:**
  - Server repo (`rizurf-logbook-app`): branch `ai-organize-api`, cut from `master`.
  - Prototype repo (`intern-logbook`): branch `ai-organising`, which already exists with the spec.
- **Editing:** use the Edit tool, not heredocs or sed, for anything containing `\n` or `\\`; Git Bash mangles them.

## Review Focus

1. **Many re-organizes on one entry.** Rejected items pile up past 40 and the server would refuse the save. `mergeSuggestions` drops the oldest rejected items first. Tested in Task 5.
2. **AI suggests an existing project in a different case** ("erp gateway" vs "ERP gateway"). This must reuse the project, never create a second one. Tested on the server in Task 2 and in the store in Task 8.
3. **Editing an entry's text after organizing keeps its items,** both on the server and in IndexedDB. Tested in Tasks 1 and 7.
4. **Switching role in the browser demo.** Aina's projects never show for Daniel. Tested in Task 7 (projects per owner).
5. **Deleting a project that entries still use** is refused in both storages and the page shows why. Tested in Tasks 1, 7 and 10.

---

### Task 1: Projects table, project endpoints, and the journal's new fields (server)

**Files:**
- Create:
  - `rizurf-logbook-app/appv3/backend/database/migrations/2026_10_08_000001_add_projects_and_organizing.php`
  - `rizurf-logbook-app/appv3/backend/app/Models/Project.php`
  - `rizurf-logbook-app/appv3/backend/app/Http/Controllers/ProjectController.php`
  - `rizurf-logbook-app/appv3/backend/tests/Feature/ProjectsTest.php`
- Modify:
  - `app/Models/JournalEntry.php`
  - `app/Http/Controllers/JournalController.php` (`show`)
  - `routes/portal.php`
  - `tests/Feature/PersonalJournalTest.php`, and any other test that `assertExactJson`s `GET /api/v1/journal` (find them with grep)

**Interfaces:**
- Produces:
  - `Project` model with `toApi(): array{id: string, name: string, description: ?string}`, `static listFor(string $userId): list<array>` (sorted by name) and `static keyOf(string $name): string` (lower-cased and trimmed).
  - `ProjectController::intern(Request): User`, which throws 403 for non-students.
  - `JournalEntry` gains `project_id` and `items` (cast to an array).
  - `GET /journal`: each entry gets `projectId: ?string` and `items: array`; the top level gets `projects` (`[]` for supervisors).
  - Routes `POST /projects`, `PATCH /projects/{id}` and `DELETE /projects/{id}`.

- [ ] **Step 1: Branch the server repo**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git switch master && git pull --ff-only && git switch -c ai-organize-api
```

- [ ] **Step 2: Write the failing test** `tests/Feature/ProjectsTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\JournalEntry;
use Tests\TestCase;

/** An intern's own projects (AI organising, piece 2). TestCase pins "today" to 2026-09-21 in Kuala Lumpur. */
class ProjectsTest extends TestCase
{
    private function create(string $name, ?string $description = null): string
    {
        return (string) $this->portal('POST', '/api/v1/projects', ['name' => $name, 'description' => $description])
            ->assertCreated()->json('id');
    }

    public function test_an_intern_creates_renames_and_deletes_a_project(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway', 'Auth work');

        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'ERP Gateway v2'])
            ->assertOk()->assertExactJson(['id' => $id, 'name' => 'ERP Gateway v2', 'description' => 'Auth work']);
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('projects', [['id' => $id, 'name' => 'ERP Gateway v2', 'description' => 'Auth work']]);

        $this->portal('DELETE', "/api/v1/projects/{$id}")->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('projects', []);
    }

    public function test_names_are_unique_per_person_ignoring_case(): void
    {
        $this->be($this->user('student-1'));
        $this->create('ERP gateway');
        $this->portal('POST', '/api/v1/projects', ['name' => ' erp GATEWAY '])->assertUnprocessable();
        $this->portal('POST', '/api/v1/projects', ['name' => str_repeat('a', 121)])->assertUnprocessable();
        $this->portal('POST', '/api/v1/projects', ['name' => 'Ok', 'description' => str_repeat('a', 501)])->assertUnprocessable();
        $this->portal('POST', '/api/v1/projects', ['name' => '   '])->assertUnprocessable();

        $this->be($this->user('student-2'));
        $this->create('ERP gateway'); // someone else may use the same name
    }

    public function test_renaming_onto_another_of_your_projects_is_refused(): void
    {
        $this->be($this->user('student-1'));
        $this->create('ERP gateway');
        $id = $this->create('Invoices');
        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'erp gateway'])->assertUnprocessable();
        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'INVOICES'])->assertOk(); // its own name, new case
    }

    public function test_someone_elses_project_is_not_found(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway');

        $this->be($this->user('student-2'));
        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'Mine now'])->assertNotFound();
        $this->portal('DELETE', "/api/v1/projects/{$id}")->assertNotFound();
    }

    public function test_a_project_in_use_cannot_be_deleted(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway');
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page.'])->assertNoContent();
        JournalEntry::query()->where('user_id', 'student-1')->update(['project_id' => $id]);

        $this->portal('DELETE', "/api/v1/projects/{$id}")->assertStatus(409)
            ->assertJsonPath('error.message', 'Entries still use this project. Move them first.');
    }

    public function test_supervisors_have_no_projects(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('POST', '/api/v1/projects', ['name' => 'Mine'])->assertForbidden();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('projects', []);
    }

    public function test_the_journal_carries_each_entrys_project_and_items_and_typing_keeps_them(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway');
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page.'])->assertNoContent();
        $items = [['id' => 'i1', 'kind' => 'activity', 'text' => 'Built the login page', 'status' => 'accepted']];
        JournalEntry::query()->where('user_id', 'student-1')->first()?->forceFill(['project_id' => $id, 'items' => $items])->save();

        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page, then tested it.'])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries', [[
            'date' => '2026-09-21', 'text' => 'Built the login page, then tested it.', 'projectId' => $id, 'items' => $items,
        ]]);

        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => ' '])->assertNoContent();
        $this->assertSame(0, JournalEntry::query()->count());
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: the server test command with `--filter=ProjectsTest`
Expected: FAIL. The routes 404 (`/api/v1/projects`) and the `projects` key is missing.

- [ ] **Step 4: Write the migration** `database/migrations/2026_10_08_000001_add_projects_and_organizing.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** AI organising: an intern's own projects, and on each journal day its project and reviewed suggestions. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('name_key', 120); // lower-cased and trimmed: names are unique per person ignoring case
            $table->string('description', 500)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'name_key']);
        });

        Schema::table('journal_entries', function (Blueprint $table) {
            // Deleting a project in use is refused by ProjectController; null-on-delete only keeps a user's cascade simple.
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->json('items')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('project_id');
            $table->dropColumn('items');
        });
        Schema::dropIfExists('projects');
    }
};
```

- [ ] **Step 5: Write the models**

`app/Models/Project.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One of an intern's own projects; a journal day points at it once its project suggestion is accepted. */
class Project extends Model
{
    protected $fillable = ['user_id', 'name', 'name_key', 'description'];

    public static function keyOf(string $name): string
    {
        return mb_strtolower(trim($name));
    }

    /** @return array{id: string, name: string, description: ?string} */
    public function toApi(): array
    {
        return ['id' => (string) $this->id, 'name' => (string) $this->name, 'description' => $this->description];
    }

    /** @return list<array{id: string, name: string, description: ?string}> */
    public static function listFor(string $userId): array
    {
        return self::query()->where('user_id', $userId)->orderBy('name')->get()
            ->map(fn (self $p): array => $p->toApi())->values()->all();
    }
}
```

In `app/Models/JournalEntry.php`, replace the `$fillable` line with:

```php
    protected $fillable = ['user_id', 'date', 'body', 'project_id', 'items'];

    protected $casts = ['items' => 'array'];
```

- [ ] **Step 6: Write `app/Http/Controllers/ProjectController.php`**

```php
<?php

namespace App\Http\Controllers;

use App\Models\JournalEntry;
use App\Models\Project;
use App\Models\User;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/** An intern's own projects. Someone else's project is simply not found. */
final class ProjectController extends Controller
{
    /** Projects and organizing are for interns; supervisors keep a plain journal. */
    public static function intern(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns organize their journal into projects.');
        }

        return $user;
    }

    public function store(Request $request): JsonResponse
    {
        $user = self::intern($request);
        $data = $this->valid($request, $user, null);
        $project = Project::query()->create([
            'user_id' => $user->id,
            'name' => $data['name'],
            'name_key' => Project::keyOf($data['name']),
            'description' => $data['description'] ?? null,
        ]);

        return response()->json($project->toApi(), Response::HTTP_CREATED);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = self::intern($request);
        $project = Project::query()->where('user_id', $user->id)->findOrFail($id);
        $data = $this->valid($request, $user, $project);
        $project->update([
            'name' => $data['name'],
            'name_key' => Project::keyOf($data['name']),
            'description' => array_key_exists('description', $data) ? $data['description'] : $project->description,
        ]);

        return response()->json($project->toApi());
    }

    public function destroy(Request $request, string $id): Response
    {
        $user = self::intern($request);
        $project = Project::query()->where('user_id', $user->id)->findOrFail($id);
        if (JournalEntry::query()->where('project_id', $project->id)->exists()) {
            Problem::throw(Response::HTTP_CONFLICT, 'CONFLICT', 'Entries still use this project. Move them first.');
        }
        $project->delete();

        return response()->noContent();
    }

    /** @return array{name: string, description?: ?string} */
    private function valid(Request $request, User $user, ?Project $self): array
    {
        /** @var array{name: string, description?: ?string} $data */
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);
        $data['name'] = trim($data['name']);
        $taken = Project::query()->where('user_id', $user->id)->where('name_key', Project::keyOf($data['name']))
            ->when($self !== null, fn ($q) => $q->whereKeyNot($self?->id))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['name' => "You already have a project called {$data['name']}."]);
        }

        return $data;
    }
}
```

- [ ] **Step 7: Add the journal's new fields** in `JournalController::show`

Replace the `'entries' => ...` element so the response becomes:

```php
            'entries' => JournalEntry::query()->where('user_id', $user->id)->orderBy('date')->get()
                ->map(fn (JournalEntry $e): array => [
                    'date' => substr((string) $e->date, 0, 10),
                    'text' => (string) $e->body,
                    'projectId' => $e->project_id === null ? null : (string) $e->project_id,
                    'items' => $e->items ?? [],
                ])
                ->all(),
            'projects' => $user->isStudent() ? Project::listFor($user->id) : [],
```

Add `use App\Models\Project;`. `save()` already uses `updateOrCreate($key, ['body' => $text])`, so it keeps `project_id`/`items`; the test pins that.

- [ ] **Step 8: Add the routes** in `routes/portal.php`, after `Route::put('journal/{date}', ...)`

```php
    // An intern's own projects (AI organising): supervisors get 403.
    Route::post('projects', [ProjectController::class, 'store'])->middleware('auth');
    Route::patch('projects/{id}', [ProjectController::class, 'update'])->whereNumber('id')->middleware('auth');
    Route::delete('projects/{id}', [ProjectController::class, 'destroy'])->whereNumber('id')->middleware('auth');
```

Add `use App\Http\Controllers\ProjectController;` at the top with the other imports.

- [ ] **Step 9: Update the exact-JSON journal tests**

Run `grep -rn "api/v1/journal')" tests/Feature | grep -n assertExactJson` and fix every hit. In `PersonalJournalTest`:
- `test_you_can_write_and_read_your_own_journal` becomes:

```php
        $this->portal('GET', '/api/v1/journal')->assertOk()->assertExactJson([
            'startDate' => null, 'university' => null, 'programme' => null, 'position' => null,
            'entries' => [
                ['date' => '2026-09-18', 'text' => 'Planned the sprint.', 'projectId' => null, 'items' => []],
                ['date' => '2026-09-21', 'text' => 'Met the new interns twice.', 'projectId' => null, 'items' => []],
            ],
            'projects' => [],
        ]);
```

- in `test_nobody_else_can_read_it`, the expected JSON becomes `['startDate' => null, 'university' => null, 'programme' => null, 'position' => null, 'entries' => [], 'projects' => []]`.

- [ ] **Step 10: Run the tests**

Run: the server test command with `--filter="ProjectsTest|PersonalJournalTest|NotesIntoJournalTest"`
Expected: PASS. Then run the whole suite (all green except OpenApiTest, which fails on undocumented routes until Task 4). Write the output to a file and grep `Tests:`.

- [ ] **Step 11: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git add -A appv3/backend && git commit -m "feat(api): an intern's own projects; the journal returns each day's project and items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Save an entry's reviewed organization (server)

**Files:**
- Create:
  - `appv3/backend/app/Http/Controllers/OrganizeController.php` (`save` only; Task 3 adds `organize`)
  - `appv3/backend/tests/Feature/OrganizationTest.php`
- Modify: `routes/portal.php`

**Interfaces:**
- Consumes (from Task 1): `ProjectController::intern`, `Project::keyOf`, `Project::listFor`, and the `JournalEntry` `project_id`/`items` fields.
- Produces:
  - `PUT /journal/{date}/organization`, body `{projectId?: ?string, newProjectName?: ?string, items: Item[]}`.
  - It returns `{projectId: ?string, items: Item[], projects: Project[]}`.

- [ ] **Step 1: Write the failing test** `tests/Feature/OrganizationTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\Project;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OrganizationTest extends TestCase
{
    /** @param array<string, mixed> $body */
    private function organization(array $body, string $date = '2026-09-21'): TestResponse
    {
        return $this->portal('PUT', "/api/v1/journal/{$date}/organization", $body);
    }

    /** @return array<string, string> */
    private function item(string $kind, string $text, string $status = 'accepted', string $id = 'i1'): array
    {
        return ['id' => $id, 'kind' => $kind, 'text' => $text, 'status' => $status];
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page.'])->assertNoContent();
    }

    public function test_saves_the_items_and_an_existing_project(): void
    {
        $id = (string) $this->portal('POST', '/api/v1/projects', ['name' => 'ERP gateway'])->json('id');
        $items = [$this->item('project', 'ERP gateway'), $this->item('activity', 'Built the login page', 'suggested', 'i2')];

        $this->organization(['projectId' => $id, 'items' => $items])->assertOk()->assertExactJson([
            'projectId' => $id, 'items' => $items, 'projects' => [['id' => $id, 'name' => 'ERP gateway', 'description' => null]],
        ]);
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.projectId', $id)->assertJsonPath('entries.0.items', $items);
    }

    public function test_a_new_project_name_creates_it_and_the_same_name_in_another_case_reuses_it(): void
    {
        $first = $this->organization(['newProjectName' => 'Invoice export', 'items' => [$this->item('project', 'Invoice export')]])
            ->assertOk()->json('projectId');
        $again = $this->organization(['newProjectName' => '  invoice EXPORT ', 'items' => [$this->item('project', 'invoice EXPORT')]])
            ->assertOk()->json('projectId');

        $this->assertSame($first, $again);
        $this->assertSame(1, Project::query()->where('user_id', 'student-1')->count());
    }

    public function test_clearing_the_project(): void
    {
        $this->organization(['newProjectName' => 'Invoice export', 'items' => []])->assertOk();
        $this->organization(['projectId' => null, 'items' => []])->assertOk()->assertJsonPath('projectId', null);
    }

    public function test_someone_elses_project_is_refused(): void
    {
        $this->be($this->user('student-2'));
        $theirs = (string) $this->portal('POST', '/api/v1/projects', ['name' => 'Theirs'])->json('id');

        $this->be($this->user('student-1'));
        $this->organization(['projectId' => $theirs, 'items' => []])->assertUnprocessable();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.projectId', null);
    }

    public function test_bad_items_are_refused(): void
    {
        $this->organization(['items' => [$this->item('feeling', 'Happy')]])->assertUnprocessable();
        $this->organization(['items' => [$this->item('skill', 'Testing', 'maybe')]])->assertUnprocessable();
        $this->organization(['items' => [$this->item('skill', str_repeat('a', 301))]])->assertUnprocessable();
        $this->organization(['items' => [$this->item('skill', '   ')]])->assertUnprocessable();
        $this->organization(['items' => array_map(fn (int $i) => $this->item('skill', "S{$i}", 'rejected', "i{$i}"), range(1, 41))])->assertUnprocessable();
        $this->organization(['items' => array_map(fn (int $i) => $this->item('skill', "S{$i}", 'rejected', "i{$i}"), range(1, 40))])->assertOk();
        $this->organization(['newProjectName' => str_repeat('a', 121), 'items' => []])->assertUnprocessable();
    }

    public function test_a_day_without_an_entry_is_not_found(): void
    {
        $this->organization(['items' => []], '2026-09-18')->assertNotFound();
    }

    public function test_supervisors_cannot_organize(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the interns.'])->assertNoContent();
        $this->organization(['items' => []])->assertForbidden();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: the server test command with `--filter=OrganizationTest`
Expected: FAIL with 404s on `/organization`.

- [ ] **Step 3: Write `app/Http/Controllers/OrganizeController.php`**

```php
<?php

namespace App\Http\Controllers;

use App\Models\JournalEntry;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

/**
 * AI organising of an intern's own journal days. The browser merges suggestions with what was already
 * reviewed (src/core/organize.ts) and saves the result here; this class stores it and checks it.
 */
final class OrganizeController extends Controller
{
    public function save(Request $request, string $date): JsonResponse
    {
        $user = ProjectController::intern($request);
        $entry = JournalEntry::query()->where('user_id', $user->id)->where('date', $date)->firstOrFail();
        /** @var array{projectId?: ?string, newProjectName?: ?string, items: list<array<string, string>>} $data */
        $data = $request->validate([
            'projectId' => ['sometimes', 'nullable', 'string'],
            'newProjectName' => ['sometimes', 'nullable', 'string', 'max:120'],
            'items' => ['present', 'array', 'max:40'],
            'items.*.id' => ['required', 'string', 'max:64'],
            'items.*.kind' => ['required', 'in:project,activity,learning,skill'],
            'items.*.text' => ['required', 'string', 'max:300'],
            'items.*.status' => ['required', 'in:suggested,accepted,rejected'],
        ]);

        $name = trim((string) ($data['newProjectName'] ?? ''));
        $projectId = null;
        if ($name !== '') {
            $projectId = Project::query()->firstOrCreate(
                ['user_id' => $user->id, 'name_key' => Project::keyOf($name)],
                ['name' => $name],
            )->id;
        } elseif (($data['projectId'] ?? null) !== null) {
            $project = Project::query()->where('user_id', $user->id)->find($data['projectId']);
            if ($project === null) {
                throw ValidationException::withMessages(['projectId' => "That project isn't one of yours."]);
            }
            $projectId = $project->id;
        }

        $items = array_map(fn (array $i): array => Arr::only($i, ['id', 'kind', 'text', 'status']), $data['items']);
        $entry->forceFill(['project_id' => $projectId, 'items' => $items])->save();

        return response()->json([
            'projectId' => $projectId === null ? null : (string) $projectId,
            'items' => $items,
            'projects' => Project::listFor($user->id),
        ]);
    }
}
```

- [ ] **Step 4: Add the route** after the projects routes in `routes/portal.php`

```php
    Route::put('journal/{date}/organization', [OrganizeController::class, 'save'])->middleware('auth');
```

Add `use App\Http\Controllers\OrganizeController;`.

- [ ] **Step 5: Run it to verify it passes**

Run: the server test command with `--filter=OrganizationTest`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git add -A appv3/backend && git commit -m "feat(api): save a journal day's reviewed suggestions and project

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The organize endpoint: OpenAI suggestions with a daily limit (server)

**Files:**
- Modify:
  - `app/Http/Controllers/OrganizeController.php` (add `organize`, `shape` and constants)
  - `app/Providers/AppServiceProvider.php` (`organize` limiter)
  - `config/portal.php`
  - `routes/portal.php`
  - `tests/TestCase.php` (fake OpenAI reply override)
- Create: `appv3/backend/tests/Feature/OrganizeTest.php`

**Interfaces:**
- Consumes: `ProjectController::intern` and `JournalEntry`.
- Produces: `POST /journal/{date}/organize`, which returns `{project: ?string, activities: string[], learning: string[], skills: string[]}`. It returns 503 on no key, an OpenAI failure or a malformed reply; 429 over the limit; 404 for no entry; 403 for supervisors.

- [ ] **Step 1: Let tests choose the fake OpenAI reply**

In `tests/TestCase.php`, add next to `$openAiDown`:

```php
    /** When set, the fake OpenAI answers with exactly this message content (the organize tests' JSON). */
    protected ?string $openAiReply = null;
```

In `fakeOpenAi`, before the `// Echo the section title back` comment:

```php
        if ($this->openAiReply !== null) {
            return Http::response(['choices' => [['message' => ['content' => $this->openAiReply]]]]);
        }
```

- [ ] **Step 2: Write the failing test** `tests/Feature/OrganizeTest.php`

```php
<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OrganizeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page. Learned about CSRF.'])->assertNoContent();
        $this->portal('POST', '/api/v1/projects', ['name' => 'ERP gateway'])->assertCreated();
        $this->openAiReply = (string) json_encode([
            'project' => 'ERP gateway', 'activities' => ['Built the login page'], 'learning' => ['How CSRF tokens work'], 'skills' => ['Web security'],
        ]);
    }

    private function organize(string $date = '2026-09-21'): TestResponse
    {
        return $this->portal('POST', "/api/v1/journal/{$date}/organize");
    }

    public function test_returns_suggestions_from_openai_and_saves_nothing(): void
    {
        $this->organize()->assertOk()->assertExactJson([
            'project' => 'ERP gateway', 'activities' => ['Built the login page'], 'learning' => ['How CSRF tokens work'], 'skills' => ['Web security'],
        ]);

        Http::assertSent(fn (ClientRequest $r) => $r->url() === 'https://api.openai.com/v1/chat/completions'
            && $r->hasHeader('Authorization', 'Bearer sk-test-key')
            && $r['model'] === 'gpt-4o-mini'
            && $r['response_format'] === ['type' => 'json_object']
            && str_contains($r['messages'][1]['content'], 'Learned about CSRF.')
            && str_contains($r['messages'][1]['content'], 'ERP gateway'));
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.items', []);
    }

    public function test_long_lists_and_texts_are_cut(): void
    {
        $this->openAiReply = (string) json_encode([
            'project' => null,
            'activities' => ['a1', 'a2', 'a3', 'a4', 'a5', str_repeat('x', 400)],
            'learning' => ['l1', ' ', 'l2', 'l3', 'l4'],
            'skills' => ['s1', 's2', 's3', 's4'],
        ]);
        $this->organize()->assertOk()->assertExactJson([
            'project' => null, 'activities' => ['a1', 'a2', 'a3', 'a4'], 'learning' => ['l1', 'l2', 'l3'], 'skills' => ['s1', 's2', 's3'],
        ]);
    }

    public function test_a_malformed_reply_is_a_503(): void
    {
        foreach (['not json', '{"project": 3, "activities": []}', '{"activities": "one"}', '[]'] as $reply) {
            $this->openAiReply = $reply;
            $this->organize()->assertStatus(503)
                ->assertJsonPath('error.message', "Your entry is saved. I couldn't organize it right now. Try again");
        }
    }

    public function test_no_key_or_openai_down_is_a_503(): void
    {
        $this->openAiStatus = 500;
        $this->openAiReply = null;
        $this->organize()->assertStatus(503)->assertDontSee('sk-tes');

        $this->openAiStatus = 200;
        $this->openAiDown = true;
        $this->organize()->assertStatus(503);

        config(['services.openai.key' => '']);
        $this->organize()->assertStatus(503);
    }

    public function test_a_day_without_an_entry_is_not_found(): void
    {
        $this->organize('2026-09-18')->assertNotFound();
    }

    public function test_supervisors_cannot_organize(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the interns.'])->assertNoContent();
        $this->organize()->assertForbidden();
    }

    public function test_the_daily_limit_is_per_person_and_separate_from_summaries(): void
    {
        config(['portal.organizes_per_day' => 2, 'portal.summaries_per_day' => 1]);
        $this->organize()->assertOk();
        $this->organize()->assertOk();
        $this->organize()->assertStatus(429)->assertJsonPath('error.message', "You've organized 2 times today. Try again tomorrow.");

        $this->portal('POST', '/api/v1/summaries', ['items' => [['label' => 'Tasks', 'text' => 'Built it']]])->assertOk();
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: the server test command with `--filter=OrganizeTest`
Expected: FAIL with 404 on `/organize`.

- [ ] **Step 4: Add the limiter and config**

`config/portal.php`, after `summaries_per_day`:

```php
    'organizes_per_day' => (int) env('AI_ORGANIZES_PER_DAY', 30),
```

`app/Providers/AppServiceProvider.php`, after the `summaries` limiter:

```php
        // Each intern's AI organizing per day (AI organising): separate from summaries, also billed per use.
        RateLimiter::for('organize', function (Request $request): Limit {
            $perDay = (int) config('portal.organizes_per_day', 30);

            return Limit::perDay($perDay)
                ->by($request->user()?->getAuthIdentifier().'|organize|'.today()->toDateString())
                ->response(fn (Request $request, array $headers) => Problem::response(
                    Response::HTTP_TOO_MANY_REQUESTS,
                    'RATE_LIMITED',
                    "You've organized {$perDay} times today. Try again tomorrow.",
                    null,
                    null,
                    $request,
                )->withHeaders($headers));
        });
```

- [ ] **Step 5: Add `organize` to `OrganizeController`**

Add these imports: `App\Support\Problem`, `Illuminate\Http\Client\ConnectionException`, `Illuminate\Support\Facades\Http`, `Illuminate\Support\Facades\Log`, `Symfony\Component\HttpFoundation\Response`. Then add:

```php
    private const URL = 'https://api.openai.com/v1/chat/completions';

    private const MODEL = 'gpt-4o-mini';

    private const FAILED = "Your entry is saved. I couldn't organize it right now. Try again";

    private const SYSTEM = <<<'TXT'
        You organize one day of an intern's private work journal.
        Reply with JSON only, exactly this shape:
        {"project": string or null, "activities": [string], "learning": [string], "skills": [string]}

        Rules:
        - Use only what the entry states. Never invent tasks, tools, results or skills.
        - activities: 1 to 4 things the intern did, as short past-tense phrases ("Built the login page").
        - learning: 0 to 3 things the intern learned, as short phrases.
        - skills: 0 to 3 short skill names the entry clearly shows ("Data modelling", "Unit testing").
        - project: the work this entry belongs to. Prefer one of the existing projects when it fits, spelled exactly as listed; otherwise a short new name (2 to 4 words); null if the entry names no work.
        TXT;

    public function organize(Request $request, string $date): JsonResponse
    {
        $user = ProjectController::intern($request);
        $entry = JournalEntry::query()->where('user_id', $user->id)->where('date', $date)->firstOrFail();
        $key = (string) config('services.openai.key');
        if ($key === '') {
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', self::FAILED);
        }

        $names = array_column(Project::listFor($user->id), 'name');
        try {
            $reply = Http::withToken($key)->acceptJson()->timeout(50)->post(self::URL, [
                'model' => self::MODEL,
                'max_tokens' => 600,
                'response_format' => ['type' => 'json_object'],
                'messages' => [
                    ['role' => 'system', 'content' => self::SYSTEM],
                    ['role' => 'user', 'content' => 'Existing projects: '.($names === [] ? 'none' : implode('; ', $names))
                        ."\n\nEntry:\n".mb_substr((string) $entry->body, 0, 20000)],
                ],
            ]);
        } catch (ConnectionException) {
            $reply = null;
        }

        $content = $reply?->successful() ? $reply->json('choices.0.message.content') : null;
        $json = is_string($content) ? json_decode($content, true) : null;
        $out = is_array($json) ? $this->shape($json) : null;
        if ($out === null) {
            // OpenAI's own message can quote part of the key: log the status only, never pass it on.
            Log::warning('AI organize failed', ['status' => $reply?->status() ?? 'unreachable']);
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', self::FAILED);
        }

        return response()->json($out);
    }

    /**
     * OpenAI's JSON cut to the spec's limits, or null when it isn't the agreed shape.
     *
     * @param  array<mixed>  $json
     * @return array{project: ?string, activities: list<string>, learning: list<string>, skills: list<string>}|null
     */
    private function shape(array $json): ?array
    {
        $list = function (mixed $value, int $max): ?array {
            if (! is_array($value) || ! array_is_list($value)) {
                return null;
            }
            $out = [];
            foreach ($value as $text) {
                if (! is_string($text)) {
                    return null;
                }
                $text = mb_substr(trim($text), 0, 300);
                if ($text !== '') {
                    $out[] = $text;
                }
            }

            return array_slice($out, 0, $max);
        };
        $project = $json['project'] ?? null;
        if (array_is_list($json) || ($project !== null && ! is_string($project))) {
            return null;
        }
        $activities = $list($json['activities'] ?? null, 4);
        $learning = $list($json['learning'] ?? [], 3);
        $skills = $list($json['skills'] ?? [], 3);
        if ($activities === null || $learning === null || $skills === null) {
            return null;
        }
        $project = $project === null ? '' : mb_substr(trim($project), 0, 120);

        return ['project' => $project === '' ? null : $project, 'activities' => $activities, 'learning' => $learning, 'skills' => $skills];
    }
```

- [ ] **Step 6: Add the route** (next to the organization route)

```php
    Route::post('journal/{date}/organize', [OrganizeController::class, 'organize'])->middleware(['auth', 'throttle:organize']);
```

- [ ] **Step 7: Run it to verify it passes**

Run: the server test command with `--filter="OrganizeTest|SummaryTest"`
Expected: PASS. (`'[]'` decodes to an empty list: `array_is_list([])` is true, so the reply is refused.)

- [ ] **Step 8: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git add -A appv3/backend && git commit -m "feat(api): organize a journal day with OpenAI, 30 a day per intern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Document the new endpoints; lint (server)

**Files:**
- Modify: `appv3/backend/resources/openapi.json` (text edits with the Edit tool; never re-dump the JSON)

**Interfaces:**
- Consumes: the five routes from Tasks 1–3.

- [ ] **Step 1: Run OpenApiTest to see it fail**

Run: the server test command with `--filter=OpenApiTest`
Expected: FAIL in `test_every_route_is_documented_and_nothing_else`, listing `DELETE /projects/{id}`, `PATCH /projects/{id}`, `POST /journal/{date}/organize`, `POST /projects` and `PUT /journal/{date}/organization`.

- [ ] **Step 2: Extend `GET /journal`'s outputs**

In the `"Read Journal"` block, replace
`"outputs": ["startDate", "university", "programme", "position", "entries[].date", "entries[].text"],`
with
`"outputs": ["startDate", "university", "programme", "position", "entries[].date", "entries[].text", "entries[].projectId", "entries[].items", "projects"],`

- [ ] **Step 3: Insert the new paths** right after the closing `},` of the `"/journal/{date}"` path item, before `"/gateway/badges"`.

```json
    "/journal/{date}/organize": {
      "post": {
        "summary": "Ask the AI to suggest a project, activities, learning points and skills for one of the signed-in intern's journal days. Saves nothing.",
        "parameters": [
          { "name": "date", "in": "path", "required": true, "schema": { "type": "string", "format": "date" } }
        ],
        "responses": {
          "200": { "description": "Suggestions: {project, activities[], learning[], skills[]}." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Organize Journal Day",
          "purpose": "Turn a day's free-text entry into suggested projects, activities, learning points and skills",
          "use_when": ["An intern presses Organize on an entry"],
          "do_not_use_when": ["Saving what the intern accepted (use PUT /journal/{date}/organization)", "Supervisors (interns only)"],
          "inputs": ["date"],
          "outputs": ["project", "activities", "learning", "skills"],
          "requires": ["Signed-in intern", "An entry saved for that day", "30 a day per intern"],
          "related_endpoints": ["PUT /journal/{date}/organization", "GET /journal"],
          "tags": ["journal", "ai", "organize", "skills"]
        }
      }
    },
    "/journal/{date}/organization": {
      "put": {
        "summary": "Save the reviewed suggestions and the project of one of the signed-in intern's journal days.",
        "parameters": [
          { "name": "date", "in": "path", "required": true, "schema": { "type": "string", "format": "date" } }
        ],
        "responses": {
          "200": { "description": "Saved: {projectId, items[], projects[]}." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Save Journal Organization",
          "purpose": "Keep which suggestions an intern accepted, edited or rejected, and the day's project",
          "use_when": ["An intern accepts, edits or rejects a suggestion"],
          "do_not_use_when": ["Changing the entry's text (use PUT /journal/{date})"],
          "inputs": ["date", "projectId", "newProjectName", "items[].id", "items[].kind", "items[].text", "items[].status"],
          "outputs": ["projectId", "items", "projects"],
          "requires": ["Signed-in intern", "An entry saved for that day"],
          "related_endpoints": ["POST /journal/{date}/organize", "GET /journal", "POST /projects"],
          "tags": ["journal", "organize", "projects", "skills"]
        }
      }
    },
    "/projects": {
      "post": {
        "summary": "Add a project to the signed-in intern's own list.",
        "responses": {
          "201": { "description": "The project: {id, name, description}." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Create Project",
          "purpose": "Group an intern's journal days by the work they belong to",
          "use_when": ["An intern adds a project by hand"],
          "do_not_use_when": ["Accepting a suggested new project (PUT /journal/{date}/organization creates it)"],
          "inputs": ["name", "description"],
          "outputs": ["id", "name", "description"],
          "requires": ["Signed-in intern", "A name not already used by this intern, ignoring case"],
          "related_endpoints": ["PATCH /projects/{id}", "DELETE /projects/{id}", "GET /journal"],
          "tags": ["projects", "journal", "organize"]
        }
      }
    },
    "/projects/{id}": {
      "patch": {
        "summary": "Rename a project or change its description.",
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": { "description": "The project: {id, name, description}." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Update Project",
          "purpose": "Keep a project's name and description right",
          "use_when": ["An intern renames a project or edits its description"],
          "do_not_use_when": ["Someone else's project (not found)"],
          "inputs": ["id", "name", "description"],
          "outputs": ["id", "name", "description"],
          "requires": ["Signed-in intern who owns the project"],
          "related_endpoints": ["POST /projects", "DELETE /projects/{id}"],
          "tags": ["projects", "rename"]
        }
      },
      "delete": {
        "summary": "Delete a project that no journal day uses.",
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "204": { "description": "Deleted." },
          "409": { "description": "Entries still use this project." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "x-rizurf": {
          "name": "Delete Project",
          "purpose": "Remove a project nobody's entries use any more",
          "use_when": ["An intern deletes an unused project"],
          "do_not_use_when": ["A project entries still use (409)"],
          "inputs": ["id"],
          "outputs": [],
          "requires": ["Signed-in intern who owns the project", "No journal day uses it"],
          "related_endpoints": ["POST /projects", "PATCH /projects/{id}"],
          "tags": ["projects", "delete"]
        }
      }
    },
```

- [ ] **Step 4: Run OpenApiTest and the whole suite**

Run: the server test command (whole suite, output to a file, grep `Tests:`)
Expected: all pass.

- [ ] **Step 5: Lint**

Run (in `appv3/backend`): `C:/Users/User/php84/php.exe vendor/bin/pint` then `C:/Users/User/php84/php.exe vendor/bin/pint --test` and `C:/Users/User/php84/php.exe vendor/bin/phpstan analyse --no-progress --memory-limit=1G`
Expected: Pint clean; PHPStan `[OK] No errors`. Fix any PHPStan finding in the new code (typically the `@var` shapes) and rerun.

- [ ] **Step 6: Check the migration on MariaDB**

Run the four new test classes against MariaDB:

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app/appv3/backend && OPENSSL_CONF=C:/Users/User/php84/extras/ssl/openssl.cnf DB_CONNECTION=mysql DB_DATABASE=test_logbook_testing DB_USERNAME=root C:/Users/User/php84/php.exe artisan test --filter="ProjectsTest|OrganizationTest|OrganizeTest|PersonalJournalTest"
```

Expected: PASS. If MariaDB isn't running, start XAMPP's MySQL first.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git add -A appv3/backend && git commit -m "docs(api): document organizing and projects in openapi.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Types, the merge rule and the demo stand-in (prototype)

**Files:**
- Modify: `intern-logbook/src/core/model.ts`
- Create:
  - `intern-logbook/src/core/organize.ts`
  - `intern-logbook/tests/unit/organize.test.ts`

**Interfaces:**
- Produces (in `model.ts`):

```ts
export type ItemKind = 'project' | 'activity' | 'learning' | 'skill';
export type ItemStatus = 'suggested' | 'accepted' | 'rejected';
export interface Item { id: string; kind: ItemKind; text: string; status: ItemStatus }
export interface Project { id: string; name: string; description: string | null }
export interface ProjectInput { name: string; description?: string | null }
export interface Suggestions { project: string | null; activities: string[]; learning: string[]; skills: string[] }
export interface Organized { projectId: string | null; items: Item[] }
export interface OrganizationInput extends Organized { newProjectName?: string }
export interface Organization extends Organized { projects: Project[] }
export interface JournalEntry { date: string; text: string; projectId?: string | null; items?: Item[] }
// Journal.entries becomes JournalEntry[]; Journal gains `projects?: Project[]`.
```

- Produces (in `organize.ts`):
  - `MAX_ITEMS = 40`
  - `nameKey(s: string): string`
  - `mergeSuggestions(items: Item[], fresh: Suggestions): Item[]`
  - `reviewItem(items: Item[], id: string, action: 'accept' | 'reject', text?: string): Item[]`
  - `standIn(text: string, projects: Project[], org: Record<string, { projectId: string | null }>): Suggestions`

- [ ] **Step 1: Write the failing test** `tests/unit/organize.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { MAX_ITEMS, mergeSuggestions, reviewItem, standIn } from '../../src/core/organize';
import type { Item, Suggestions } from '../../src/core/model';

const it_ = (kind: Item['kind'], text: string, status: Item['status'], id = `${kind}-${text}`): Item => ({ id, kind, text, status });
const none: Suggestions = { project: null, activities: [], learning: [], skills: [] };
const view = (items: Item[]) => items.map(i => `${i.status}:${i.kind}:${i.text}`);

describe('mergeSuggestions', () => {
  it('turns fresh suggestions into waiting items', () => {
    const out = mergeSuggestions([], { project: 'ERP gateway', activities: ['Built the login page'], learning: ['CSRF'], skills: ['Web security'] });
    expect(view(out)).toEqual(['suggested:project:ERP gateway', 'suggested:activity:Built the login page', 'suggested:learning:CSRF', 'suggested:skill:Web security']);
    expect(new Set(out.map(i => i.id)).size).toBe(4);
  });
  it('replaces waiting suggestions, keeps accepted ones, and never repeats accepted or rejected ones (ignoring case)', () => {
    const before = [it_('activity', 'Old waiting', 'suggested'), it_('activity', 'Built the login page', 'accepted'), it_('skill', 'Web security', 'rejected')];
    const out = mergeSuggestions(before, { ...none, activities: ['built the LOGIN page ', 'Tested it'], skills: ['web security', 'Testing'] });
    expect(view(out)).toEqual(['accepted:activity:Built the login page', 'rejected:skill:Web security', 'suggested:activity:Tested it', 'suggested:skill:Testing']);
  });
  it('the same text under another kind is not a repeat, and blanks are skipped', () => {
    const out = mergeSuggestions([it_('activity', 'Testing', 'accepted')], { ...none, activities: ['  '], skills: ['Testing'] });
    expect(view(out)).toEqual(['accepted:activity:Testing', 'suggested:skill:Testing']);
  });
  it('over the cap, the oldest rejected items make room first', () => {
    const rejected = Array.from({ length: MAX_ITEMS - 1 }, (_, i) => it_('skill', `R${i}`, 'rejected'));
    const out = mergeSuggestions([it_('activity', 'Kept', 'accepted'), ...rejected], { ...none, activities: ['New 1', 'New 2'] });
    expect(out).toHaveLength(MAX_ITEMS);
    expect(view(out)).toContain('accepted:activity:Kept');
    expect(view(out).slice(-2)).toEqual(['suggested:activity:New 1', 'suggested:activity:New 2']);
    expect(view(out)).not.toContain('rejected:skill:R0');
    expect(view(out)).not.toContain('rejected:skill:R1');
  });
});

describe('reviewItem', () => {
  const items = [it_('project', 'ERP gateway', 'accepted', 'p1'), it_('project', 'Invoices', 'suggested', 'p2'), it_('activity', 'Built it', 'suggested', 'a1')];
  it('accepts, with edited text when given; the original wording is kept as reviewed so it is not suggested again', () => {
    const edited = reviewItem(items, 'a1', 'accept', '  Built the login page ');
    expect(edited.find(i => i.id === 'a1')).toEqual(it_('activity', 'Built the login page', 'accepted', 'a1'));
    expect(view(edited).at(-1)).toBe('rejected:activity:Built it');
    expect(view(mergeSuggestions(edited, { ...none, activities: ['Built it'] }))).not.toContain('suggested:activity:Built it');
    expect(reviewItem(items, 'a1', 'accept', '   ')).toHaveLength(3);
    expect(reviewItem(items, 'a1', 'accept', '   ').find(i => i.id === 'a1')?.text).toBe('Built it');
  });
  it('rejects', () => {
    expect(reviewItem(items, 'a1', 'reject').find(i => i.id === 'a1')?.status).toBe('rejected');
  });
  it('accepting another project replaces the accepted one', () => {
    expect(view(reviewItem(items, 'p2', 'accept'))).toEqual(['accepted:project:Invoices', 'suggested:activity:Built it']);
  });
});

describe('standIn (the browser demo, no AI)', () => {
  const projects = [{ id: 'p1', name: 'ERP gateway', description: null }, { id: 'p2', name: 'Invoices', description: null }];
  it('makes each sentence an activity (at most 4) and picks the most recently used project', () => {
    const s = standIn('Built the login page. Fixed a bug!\nWrote tests? Met the team. Planned more.', projects, {
      '2026-09-18': { projectId: 'p1' }, '2026-09-21': { projectId: 'p2' }, '2026-09-22': { projectId: null },
    });
    expect(s).toEqual({ project: 'Invoices', activities: ['Built the login page', 'Fixed a bug', 'Wrote tests', 'Met the team'], learning: [], skills: [] });
  });
  it('falls back to the first project, or none', () => {
    expect(standIn('Did it.', projects, {}).project).toBe('ERP gateway');
    expect(standIn('Did it.', [], {}).project).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/organize.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/core/organize".

- [ ] **Step 3: Add the types to `src/core/model.ts`**

Replace the two journal lines (`export interface JournalDetails ...` stays) so that block reads:

```ts
/** A person's private journal (supervisors, and interns whose university has no logbook). */
export interface JournalDetails { university?: string | null; programme?: string | null; position?: string | null }
/** One day; interns' days can carry their project and the AI suggestions they reviewed. */
export interface JournalEntry { date: string; text: string; projectId?: string | null; items?: Item[] }
export interface Journal extends JournalDetails { startDate: string | null; entries: JournalEntry[]; projects?: Project[] }

export type ItemKind = 'project' | 'activity' | 'learning' | 'skill';
export type ItemStatus = 'suggested' | 'accepted' | 'rejected';
export interface Item { id: string; kind: ItemKind; text: string; status: ItemStatus }
export interface Project { id: string; name: string; description: string | null }
export interface ProjectInput { name: string; description?: string | null }
/** What the AI (or the demo stand-in) found in one entry, before the intern reviews it. */
export interface Suggestions { project: string | null; activities: string[]; learning: string[]; skills: string[] }
export interface Organized { projectId: string | null; items: Item[] }
/** `newProjectName` creates the project, or reuses one with the same name ignoring case. */
export interface OrganizationInput extends Organized { newProjectName?: string }
export interface Organization extends Organized { projects: Project[] }
```

- [ ] **Step 4: Write `src/core/organize.ts`**

```ts
import type { Item, ItemKind, Project, Suggestions } from './model';
import { newId } from './ids';

/** The most items one entry keeps (the server refuses more). */
export const MAX_ITEMS = 40;

/** Names and texts compare trimmed and ignoring case. */
export const nameKey = (s: string): string => s.trim().toLowerCase();

/** Organizing again: waiting suggestions are replaced, accepted ones stay, and nothing accepted or rejected comes back. */
export function mergeSuggestions(items: Item[], fresh: Suggestions): Item[] {
  const out = items.filter(i => i.status !== 'suggested');
  const seen = new Set(out.map(i => `${i.kind}|${nameKey(i.text)}`));
  const add = (kind: ItemKind, text: string) => {
    const k = `${kind}|${nameKey(text)}`;
    if (!text.trim() || seen.has(k)) return;
    seen.add(k);
    out.push({ id: newId('item'), kind, text: text.trim(), status: 'suggested' });
  };
  if (fresh.project) add('project', fresh.project);
  for (const t of fresh.activities) add('activity', t);
  for (const t of fresh.learning) add('learning', t);
  for (const t of fresh.skills) add('skill', t);
  // Rejected items only exist to stop repeats, so the oldest make room first.
  while (out.length > MAX_ITEMS) {
    const i = out.findIndex(x => x.status === 'rejected');
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out.slice(0, MAX_ITEMS);
}

/** Accept (with edited text, if any) or reject one suggestion. Only one project is accepted at a time. */
export function reviewItem(items: Item[], id: string, action: 'accept' | 'reject', text?: string): Item[] {
  const target = items.find(i => i.id === id);
  if (!target) return items;
  const accept = action === 'accept';
  const edited = accept && text?.trim() && text.trim() !== target.text ? text.trim() : null;
  const out = items
    .filter(i => !(accept && target.kind === 'project' && i.kind === 'project' && i.status === 'accepted' && i.id !== id))
    .map(i => (i.id !== id ? i : { ...i, status: accept ? 'accepted' as const : 'rejected' as const, text: edited ?? i.text }));
  // The original wording counts as reviewed too, so organizing again doesn't suggest it a second time.
  return edited ? [...out, { id: newId('item'), kind: target.kind, text: target.text, status: 'rejected' }] : out;
}

/** The browser demo's organizer, no AI: each sentence becomes an activity; the project is the one used most recently. */
export function standIn(text: string, projects: Project[], org: Record<string, { projectId: string | null }>): Suggestions {
  const activities = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim().replace(/[.!?]+$/, '')).filter(Boolean).slice(0, 4);
  const recent = Object.entries(org).filter(([, o]) => o.projectId).sort(([a], [b]) => b.localeCompare(a))[0]?.[1].projectId;
  const project = projects.find(p => p.id === recent) ?? projects[0];
  return { project: project?.name ?? null, activities, learning: [], skills: [] };
}
```

- [ ] **Step 5: Run it to verify it passes; type-check**

Run: `npx vitest run tests/unit/organize.test.ts` then `npx vue-tsc --noEmit`
Expected: PASS. vue-tsc clean. `Journal.entries` widened, so existing readers still compile.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/core/model.ts src/core/organize.ts tests/unit/organize.test.ts && git commit -m "feat: suggestion types, the merge rule and the no-AI demo stand-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The page calculations (prototype)

**Files:**
- Create:
  - `intern-logbook/src/core/records.ts`
  - `intern-logbook/tests/unit/records.test.ts`

**Interfaces:**
- Consumes: `Item`, `Project` from model, and `nameKey` from organize.
- Produces:
  - `type Org = Record<string, Organized>`
  - `interface Row { date: string; kind: 'activity' | 'learning' | 'skill'; text: string; projectId: string | null }`
  - `acceptedRows(org): Row[]`, newest day first.
  - `interface ProjectStats { project: Project; activities: number; learning: number; skills: number; last: string | null }` and `projectStats(projects, org): ProjectStats[]`.
  - `interface SkillStats { key: string; name: string; projectIds: string[]; activities: number; learning: number; first: string; dates: string[] }` and `skillStats(org): SkillStats[]`.
  - `learningRows(org, filter: string): Row[]`, where `filter` is `'all'`, `'none'` or a project id.
  - `shortDate(iso): string`, for example "5 Aug".

- [ ] **Step 1: Write the failing test** `tests/unit/records.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { acceptedRows, learningRows, projectStats, shortDate, skillStats, type Org } from '../../src/core/records';
import type { Item } from '../../src/core/model';

let n = 0;
const item = (kind: Item['kind'], text: string, status: Item['status'] = 'accepted'): Item => ({ id: `i${++n}`, kind, text, status });
const projects = [{ id: 'p1', name: 'ERP gateway', description: null }, { id: 'p2', name: 'Invoices', description: null }, { id: 'p3', name: 'Archive', description: null }];
const org: Org = {
  '2026-08-05': { projectId: 'p1', items: [item('project', 'ERP gateway'), item('activity', 'Set up the env'), item('skill', 'data modelling'), item('learning', 'Gateway tests')] },
  '2026-08-06': { projectId: 'p1', items: [item('activity', 'Fixed a bug'), item('activity', 'Waiting', 'suggested'), item('skill', 'Data Modelling ')] },
  '2026-08-07': { projectId: 'p2', items: [item('activity', 'Built export'), item('skill', 'Data modelling'), item('learning', 'Postman'), item('skill', 'Rejected', 'rejected')] },
  '2026-08-08': { projectId: null, items: [item('learning', 'Loose end')] },
};

describe('records', () => {
  it('lists accepted activities, learning and skills newest first, without project items or waiting ones', () => {
    expect(acceptedRows(org).map(r => `${r.date} ${r.kind} ${r.text}`)).toEqual([
      '2026-08-08 learning Loose end',
      '2026-08-07 activity Built export', '2026-08-07 skill Data modelling', '2026-08-07 learning Postman',
      '2026-08-06 activity Fixed a bug', '2026-08-06 skill Data Modelling ',
      '2026-08-05 activity Set up the env', '2026-08-05 skill data modelling', '2026-08-05 learning Gateway tests',
    ]);
  });
  it('counts each project and orders by newest activity, unused projects last by name', () => {
    expect(projectStats(projects, org).map(s => [s.project.name, s.activities, s.learning, s.skills, s.last])).toEqual([
      ['Invoices', 1, 1, 1, '2026-08-07'],
      ['ERP gateway', 2, 1, 1, '2026-08-06'],
      ['Archive', 0, 0, 0, null],
    ]);
  });
  it('merges skills ignoring case, newest spelling, counting the same entries\' accepted items', () => {
    expect(skillStats(org)).toEqual([{
      key: 'data modelling', name: 'Data modelling', projectIds: ['p2', 'p1'], activities: 3, learning: 2, first: '2026-08-05',
      dates: ['2026-08-07', '2026-08-06', '2026-08-05'],
    }]);
  });
  it('filters learning by project, including "No project"', () => {
    expect(learningRows(org, 'all').map(r => r.text)).toEqual(['Loose end', 'Postman', 'Gateway tests']);
    expect(learningRows(org, 'p1').map(r => r.text)).toEqual(['Gateway tests']);
    expect(learningRows(org, 'none').map(r => r.text)).toEqual(['Loose end']);
  });
  it('writes short dates', () => {
    expect(shortDate('2026-08-05')).toBe('5 Aug');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/records.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write `src/core/records.ts`**

```ts
import type { Organized, Project } from './model';
import { nameKey } from './organize';
import { parseISO } from './dates';

/** Each day's reviewed suggestions, by date. */
export type Org = Record<string, Organized>;
export interface Row { date: string; kind: 'activity' | 'learning' | 'skill'; text: string; projectId: string | null }

const newestFirst = (org: Org) => Object.entries(org).sort(([a], [b]) => b.localeCompare(a));

/** Every accepted activity, learning point and skill, newest day first. */
export function acceptedRows(org: Org): Row[] {
  return newestFirst(org).flatMap(([date, o]) => o.items
    .filter(i => i.status === 'accepted' && i.kind !== 'project')
    .map(i => ({ date, kind: i.kind as Row['kind'], text: i.text, projectId: o.projectId })));
}

export interface ProjectStats { project: Project; activities: number; learning: number; skills: number; last: string | null }

/** Newest accepted activity first; projects without one go last, by name. */
export function projectStats(projects: Project[], org: Org): ProjectStats[] {
  const rows = acceptedRows(org);
  return projects.map(project => {
    const mine = rows.filter(r => r.projectId === project.id);
    const activities = mine.filter(r => r.kind === 'activity');
    return {
      project,
      activities: activities.length,
      learning: mine.filter(r => r.kind === 'learning').length,
      skills: new Set(mine.filter(r => r.kind === 'skill').map(r => nameKey(r.text))).size,
      last: activities[0]?.date ?? null,
    };
  }).sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '') || a.project.name.localeCompare(b.project.name));
}

export interface SkillStats { key: string; name: string; projectIds: string[]; activities: number; learning: number; first: string; dates: string[] }

/** Skills merged by name ignoring case (newest spelling shown); counts come from the accepted items of the same entries. */
export function skillStats(org: Org): SkillStats[] {
  const map = new Map<string, SkillStats>();
  for (const [date, o] of newestFirst(org)) {
    const accepted = o.items.filter(i => i.status === 'accepted');
    const skills = new Map(accepted.filter(i => i.kind === 'skill').map(i => [nameKey(i.text), i.text.trim()]));
    for (const [key, name] of skills) {
      const s = map.get(key) ?? { key, name, projectIds: [], activities: 0, learning: 0, first: date, dates: [] };
      if (o.projectId && !s.projectIds.includes(o.projectId)) s.projectIds.push(o.projectId);
      s.activities += accepted.filter(i => i.kind === 'activity').length;
      s.learning += accepted.filter(i => i.kind === 'learning').length;
      s.first = date; // walking newest to oldest, so the last day seen is the first
      s.dates.push(date);
      map.set(key, s);
    }
  }
  return [...map.values()].sort((a, b) => b.dates.length - a.dates.length || a.name.localeCompare(b.name));
}

/** Accepted learning points; `filter` is 'all', 'none' (no project) or a project id. */
export function learningRows(org: Org, filter: string): Row[] {
  return acceptedRows(org).filter(r => r.kind === 'learning'
    && (filter === 'all' || (filter === 'none' ? !r.projectId : r.projectId === filter)));
}

export const shortDate = (iso: string): string =>
  parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/records.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/core/records.ts tests/unit/records.test.ts && git commit -m "feat: project, learning and skill counts from accepted items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Storage: IndexedDB v4 and the HTTP calls (prototype)

**Files:**
- Modify:
  - `intern-logbook/src/data/repository.ts`
  - `intern-logbook/src/data/idb.ts`
  - `intern-logbook/src/data/http.ts`
  - `tests/unit/data.test.ts`
  - `tests/unit/http.test.ts`

**Interfaces:**
- Consumes: the types from Task 5 and `standIn`/`nameKey` from `organize.ts`.
- Produces these `Repository` methods:

```ts
organize(owner: string, date: string): Promise<Suggestions>;
putOrganization(owner: string, date: string, input: OrganizationInput): Promise<Organization>;
createProject(owner: string, p: ProjectInput): Promise<Project>;
updateProject(owner: string, id: string, p: ProjectInput): Promise<Project>;
deleteProject(owner: string, id: string): Promise<void>;
```

  `getJournal` now always returns `projects` (sorted by name). Entries carry `projectId`/`items` only once organized.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/data.test.ts`, change the three existing `getJournal` expectations that compare whole journals so they include `projects: []`:
- `{ startDate: null, entries: [] }` → `{ startDate: null, entries: [], projects: [] }` (twice);
- the supervisor's two-entry journal and Aina's one-entry journal gain `projects: []`;
- `{ startDate: '2026-08-03', university: 'Sunway', programme: 'BSc IT', position: 'QA', entries: [] }` gains `projects: []`.

The upgrade test compares only `.entries`, so it stays. Then add this test and the upgrade test inside the `describe`:

```ts
  it('keeps projects and reviewed suggestions per owner; typing keeps them; projects in use are not deleted', async () => {
    const r = fresh();
    await r.putJournalEntry('student-aina', '2026-09-21', 'Built the login page.');
    const erp = await r.createProject('student-aina', { name: 'ERP gateway', description: ' Auth ' });
    await expect(r.createProject('student-aina', { name: ' erp GATEWAY' })).rejects.toThrow('You already have a project called erp GATEWAY.');
    await r.createProject('student-daniel', { name: 'ERP gateway' }); // someone else may use the name

    const items = [{ id: 'i1', kind: 'activity' as const, text: 'Built the login page', status: 'accepted' as const }];
    const saved = await r.putOrganization('student-aina', '2026-09-21', { projectId: null, newProjectName: 'erp gateway', items });
    expect(saved).toEqual({ projectId: erp.id, items, projects: [{ id: erp.id, name: 'ERP gateway', description: 'Auth' }] });
    await expect(r.putOrganization('student-aina', '2026-09-18', { projectId: null, items: [] })).rejects.toThrow("There's no entry for that day yet.");
    await expect(r.putOrganization('student-aina', '2026-09-21', { projectId: 'nope', items: [] })).rejects.toThrow("That project isn't one of yours.");

    await r.putJournalEntry('student-aina', '2026-09-21', 'Built the login page, then tested it.');
    expect((await r.getJournal('student-aina')).entries).toEqual([{ date: '2026-09-21', text: 'Built the login page, then tested it.', projectId: erp.id, items }]);
    expect((await r.getJournal('student-daniel')).projects?.map(p => p.name)).toEqual(['ERP gateway']);
    expect((await r.getJournal('student-daniel')).projects?.[0].id).not.toBe(erp.id);

    await expect(r.deleteProject('student-aina', erp.id)).rejects.toThrow('Entries still use this project. Move them first.');
    expect(await r.updateProject('student-aina', erp.id, { name: 'ERP Gateway v2' })).toEqual({ id: erp.id, name: 'ERP Gateway v2', description: 'Auth' });
    await r.putJournalEntry('student-aina', '2026-09-21', ' ');
    await r.deleteProject('student-aina', erp.id);
    expect((await r.getJournal('student-aina')).projects).toEqual([]);
  });
  it('the demo organizer reads the saved entry and the projects', async () => {
    const r = fresh();
    await r.putJournalEntry('student-aina', '2026-09-21', 'Built it. Tested it.');
    await r.createProject('student-aina', { name: 'ERP gateway' });
    expect(await r.organize('student-aina', '2026-09-21')).toEqual({ project: 'ERP gateway', activities: ['Built it', 'Tested it'], learning: [], skills: [] });
    await expect(r.organize('student-aina', '2026-09-18')).rejects.toThrow("There's no entry for that day yet.");
  });
  it('upgrading from version 3 keeps the journal and adds projects', async () => {
    const name = `test-${Math.random()}`;
    const old = await openDB(name, 3, {
      upgrade(db) {
        for (const s of ['templates', 'students']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
        db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
      },
    });
    await old.put('journal', { owner: 'a', date: '2026-09-21', text: 'Kept.' });
    old.close();
    const r = new IdbRepository(name);
    expect(await r.getJournal('a')).toEqual({ startDate: null, entries: [{ date: '2026-09-21', text: 'Kept.' }], projects: [] });
    await r.createProject('a', { name: 'New' });
  });
```

In `tests/unit/http.test.ts`, add:

```ts
describe('HttpRepository organizing', () => {
  it('calls the organize, organization and project endpoints', async () => {
    const r = intern();
    const sugg = { project: 'ERP gateway', activities: ['Built it'], learning: [], skills: [] };
    const org = { projectId: '7', items: [], projects: [{ id: '7', name: 'ERP gateway', description: null }] };
    routes['POST journal/2026-09-21/organize'] = () => json(200, sugg);
    routes['PUT journal/2026-09-21/organization'] = () => json(200, org);
    routes['POST projects'] = () => json(201, { id: '8', name: 'New', description: null });
    routes['PATCH projects/8'] = () => json(200, { id: '8', name: 'Renamed', description: null });
    routes['DELETE projects/8'] = () => new Response(null, { status: 204 });

    expect(await r.organize('ignored', '2026-09-21')).toEqual(sugg);
    expect(await r.putOrganization('ignored', '2026-09-21', { projectId: null, newProjectName: 'ERP gateway', items: [] })).toEqual(org);
    expect(await r.createProject('ignored', { name: 'New' })).toEqual({ id: '8', name: 'New', description: null });
    expect(await r.updateProject('ignored', '8', { name: 'Renamed' })).toEqual({ id: '8', name: 'Renamed', description: null });
    await r.deleteProject('ignored', '8');
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'POST journal/2026-09-21/organize', 'PUT journal/2026-09-21/organization', 'POST projects', 'PATCH projects/8', 'DELETE projects/8',
    ]);
    expect(JSON.parse(String(calls[1].body))).toEqual({ projectId: null, newProjectName: 'ERP gateway', items: [] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/data.test.ts tests/unit/http.test.ts`
Expected: FAIL. The methods are missing (`r.createProject is not a function`) and the `projects: []` comparisons don't match.

- [ ] **Step 3: Extend the `Repository` interface** in `src/data/repository.ts`, after `setJournalStart`

```ts
  /** AI suggestions for one saved day of an intern's journal (the browser demo uses a no-AI stand-in). Saves nothing. */
  organize(owner: string, date: string): Promise<Suggestions>;
  /** Saves the reviewed suggestions and the day's project; `newProjectName` creates (or reuses, ignoring case) a project. */
  putOrganization(owner: string, date: string, input: OrganizationInput): Promise<Organization>;
  createProject(owner: string, p: ProjectInput): Promise<Project>;
  updateProject(owner: string, id: string, p: ProjectInput): Promise<Project>;
  /** Refused while any day uses the project. */
  deleteProject(owner: string, id: string): Promise<void>;
```

Then widen the type import to include `Organization, OrganizationInput, Project, ProjectInput, Suggestions`.

- [ ] **Step 4: Implement in `src/data/idb.ts`**

- Change `STORES` to `['templates', 'students', 'fills', 'actions', 'journal', 'projects'] as const;` and the version from `3` to `4`.
- In `upgrade`, after the version-3 block, add:

```ts
        // Version 4: an intern's own projects (AI organising). Journal rows simply gain projectId/items when organized.
        if (oldVersion < 4) db.createObjectStore('projects', { keyPath: ['owner', 'id'] }).createIndex('byOwner', 'owner');
```

- Add the row types near the top:

```ts
type JournalRow = { owner: string; date: string; text: string; details?: JournalDetails; projectId?: string | null; items?: Item[] };
type ProjectRow = Project & { owner: string };
const NO_ENTRY = "There's no entry for that day yet.";
```

- Replace `getJournal` and `putJournalEntry`, and add the new methods:

```ts
  async getJournal(owner: string): Promise<Journal> {
    const db = await this.db();
    const rows: JournalRow[] = await db.getAllFromIndex('journal', 'byOwner', owner);
    const projects: ProjectRow[] = await db.getAllFromIndex('projects', 'byOwner', owner);
    const start = rows.find(r => r.date === 'start');
    return {
      startDate: start?.text ?? null,
      ...(start?.details ?? {}),
      entries: rows.filter(r => r.date !== 'start')
        .map(r => ({ date: r.date, text: r.text, ...(r.items ? { projectId: r.projectId ?? null, items: r.items } : {}) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      projects: projects.map(({ id, name, description }) => ({ id, name, description })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  async putJournalEntry(owner: string, date: string, text: string): Promise<void> {
    const db = await this.db();
    if (!text.trim()) { await db.delete('journal', [owner, date]); return; }
    const old: JournalRow | undefined = await db.get('journal', [owner, date]);
    await db.put('journal', plain({ ...old, owner, date, text })); // typing keeps the day's project and items
  }
  async organize(owner: string, date: string): Promise<Suggestions> {
    const j = await this.getJournal(owner);
    const entry = j.entries.find(e => e.date === date);
    if (!entry) throw new Error(NO_ENTRY);
    return standIn(entry.text, j.projects ?? [], Object.fromEntries(j.entries.map(e => [e.date, { projectId: e.projectId ?? null }])));
  }
  async putOrganization(owner: string, date: string, input: OrganizationInput): Promise<Organization> {
    const db = await this.db();
    const old: JournalRow | undefined = await db.get('journal', [owner, date]);
    if (!old) throw new Error(NO_ENTRY);
    const name = input.newProjectName?.trim();
    let projectId = input.projectId;
    if (name) projectId = (await this.findProject(owner, name))?.id ?? (await this.createProject(owner, { name })).id;
    else if (projectId && !(await db.get('projects', [owner, projectId]))) throw new Error("That project isn't one of yours.");
    await db.put('journal', plain({ ...old, projectId, items: input.items }));
    return { projectId, items: input.items, projects: (await this.getJournal(owner)).projects ?? [] };
  }
  private async findProject(owner: string, name: string): Promise<ProjectRow | undefined> {
    const all: ProjectRow[] = await (await this.db()).getAllFromIndex('projects', 'byOwner', owner);
    return all.find(p => nameKey(p.name) === nameKey(name));
  }
  private async checkName(owner: string, name: string, self?: string): Promise<string> {
    const n = name.trim();
    if (!n) throw new Error('Give the project a name.');
    const clash = await this.findProject(owner, n);
    if (clash && clash.id !== self) throw new Error(`You already have a project called ${n}.`);
    return n;
  }
  async createProject(owner: string, p: ProjectInput): Promise<Project> {
    const project = { id: newId('project'), name: await this.checkName(owner, p.name), description: p.description?.trim() || null };
    await (await this.db()).put('projects', { owner, ...project });
    return project;
  }
  async updateProject(owner: string, id: string, p: ProjectInput): Promise<Project> {
    const db = await this.db();
    const old: ProjectRow | undefined = await db.get('projects', [owner, id]);
    if (!old) throw new Error("That project doesn't exist.");
    const project = { id, name: await this.checkName(owner, p.name, id), description: p.description === undefined ? old.description : p.description?.trim() || null };
    await db.put('projects', { owner, ...project });
    return project;
  }
  async deleteProject(owner: string, id: string): Promise<void> {
    const db = await this.db();
    const rows: JournalRow[] = await db.getAllFromIndex('journal', 'byOwner', owner);
    if (rows.some(r => r.projectId === id)) throw new Error('Entries still use this project. Move them first.');
    await db.delete('projects', [owner, id]);
  }
```

- Add the imports: `Item, Organization, OrganizationInput, Project, ProjectInput, Suggestions` from model, `newId` from `../core/ids`, and `nameKey, standIn` from `../core/organize`.

- [ ] **Step 5: Implement in `src/data/http.ts`**, after `setJournalStart`

```ts
  // Organizing and projects: always the signed-in intern's own, so the owner arguments are unused.
  async organize(_owner: string, date: string): Promise<Suggestions> {
    return (await api<Suggestions>(`journal/${date}/organize`, { method: 'POST' })).data;
  }
  async putOrganization(_owner: string, date: string, input: OrganizationInput): Promise<Organization> {
    return (await api<Organization>(`journal/${date}/organization`, { method: 'PUT', body: input })).data;
  }
  async createProject(_owner: string, p: ProjectInput): Promise<Project> {
    return (await api<Project>('projects', { method: 'POST', body: p })).data;
  }
  async updateProject(_owner: string, id: string, p: ProjectInput): Promise<Project> {
    return (await api<Project>(`projects/${id}`, { method: 'PATCH', body: p })).data;
  }
  async deleteProject(_owner: string, id: string): Promise<void> {
    await api(`projects/${id}`, { method: 'DELETE' });
  }
```

Widen the model import with `Organization, OrganizationInput, Project, ProjectInput, Suggestions`.

- [ ] **Step 6: Run them to verify they pass; type-check**

Run: `npx vitest run` then `npx vue-tsc --noEmit`
Expected: all unit tests pass; vue-tsc clean.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/data tests/unit/data.test.ts tests/unit/http.test.ts && git commit -m "feat: store projects and reviewed suggestions (IndexedDB v4 and the server API)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The journal store and asking before clearing (prototype)

**Files:**
- Modify:
  - `intern-logbook/src/stores/journal.ts`
  - `intern-logbook/src/components/EntryEditor.vue`
  - `tests/unit/stores.test.ts`

**Interfaces:**
- Consumes: the Task 7 repository methods and `mergeSuggestions`/`reviewItem`/`nameKey`.
- Produces on `useJournal()`:
  - state: `org: Record<string, Organized>`, `projects: Project[]`, `reviewing: string | null` (the date whose review panel is open), `organizeError: string`;
  - `organizeEntry(date): Promise<void>`;
  - `review(date, id, action: 'accept' | 'reject', text?): Promise<void>`;
  - `saveOrganization(date, input: OrganizationInput): Promise<void>`;
  - `createProject(p: ProjectInput): Promise<Project>`, `updateProject(id, p)`, `deleteProject(id)`.

- [ ] **Step 1: Write the failing test** in `tests/unit/stores.test.ts`, in a new `describe('journal store organizing', ...)`

```ts
describe('journal store organizing', () => {
  it('organizes with the demo stand-in, accepts a new project and an activity, and a cleared day drops them', async () => {
    const j = useJournal();
    await j.load('student-aina');
    await j.save('2026-09-21', 'Built the login page. Tested it.');
    await j.organizeEntry('2026-09-21');
    expect(j.org['2026-09-21'].items.map(i => `${i.status}:${i.kind}:${i.text}`)).toEqual(['suggested:activity:Built the login page', 'suggested:activity:Tested it']);

    const [first] = j.org['2026-09-21'].items;
    await j.review('2026-09-21', first.id, 'accept');
    await j.organizeEntry('2026-09-21'); // again: the accepted one stays, no duplicate
    expect(j.org['2026-09-21'].items.map(i => `${i.status}:${i.text}`)).toEqual(['accepted:Built the login page', 'suggested:Tested it']);

    // A project suggestion, accepted in another case than an existing project, reuses it.
    const erp = await j.createProject({ name: 'ERP gateway' });
    await j.saveOrganization('2026-09-21', { projectId: null, items: [...j.org['2026-09-21'].items, { id: 'p', kind: 'project', text: 'erp GATEWAY', status: 'suggested' }] });
    await j.review('2026-09-21', 'p', 'accept');
    expect(j.org['2026-09-21'].projectId).toBe(erp.id);
    expect(j.projects).toHaveLength(1);

    // An edited name that matches nothing creates the project.
    await j.saveOrganization('2026-09-21', { ...j.org['2026-09-21'], items: [...j.org['2026-09-21'].items, { id: 'q', kind: 'project', text: 'x', status: 'suggested' }] });
    await j.review('2026-09-21', 'q', 'accept', 'Mobile app');
    expect(j.projects.map(p => p.name)).toEqual(['ERP gateway', 'Mobile app']);
    expect(j.org['2026-09-21'].items.filter(i => i.kind === 'project').map(i => `${i.status}:${i.text}`)).toEqual(['accepted:Mobile app', 'rejected:x']);

    await j.save('2026-09-21', '');
    expect(j.org['2026-09-21']).toBeUndefined();
    await j.load('student-aina');
    expect(j.org).toEqual({});
  });
  it('project changes update the list', async () => {
    const j = useJournal();
    await j.load('student-aina');
    const p = await j.createProject({ name: 'B' });
    await j.createProject({ name: 'A' });
    expect(j.projects.map(x => x.name)).toEqual(['A', 'B']);
    await j.updateProject(p.id, { name: 'C' });
    expect(j.projects.map(x => x.name)).toEqual(['A', 'C']);
    await j.deleteProject(p.id);
    expect(j.projects.map(x => x.name)).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/stores.test.ts`
Expected: FAIL, `j.organizeEntry is not a function`.

- [ ] **Step 3: Extend `src/stores/journal.ts`**

Add the state after `loadFailed`:

```ts
  /** Each day's project and reviewed suggestions (interns only). */
  const org = ref<Record<string, Organized>>({});
  const projects = ref<Project[]>([]);
  /** The day whose "Review what I found" panel is open, and why organizing it last failed. */
  const reviewing = ref<string | null>(null);
  const organizeError = ref('');
```

In `load`, after `entries.value = ...`:

```ts
    org.value = Object.fromEntries(j.entries.filter(e => e.items).map(e => [e.date, { projectId: e.projectId ?? null, items: e.items ?? [] }]));
    projects.value = j.projects ?? [];
```

In `save`, after `entries.value = next;`:

```ts
    if (!text.trim() && org.value[date]) { const o = { ...org.value }; delete o[date]; org.value = o; }
```

Add the actions:

```ts
  const byName = (list: Project[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  function who(): string {
    if (!owner.value) throw new Error('No journal loaded.');
    return owner.value;
  }
  async function saveOrganization(date: string, input: OrganizationInput) {
    const o = await repo().putOrganization(who(), date, plain(input));
    org.value = { ...org.value, [date]: { projectId: o.projectId, items: o.items } };
    projects.value = o.projects;
  }
  /** Asks for suggestions and merges them with what's already been reviewed. */
  async function organizeEntry(date: string) {
    const fresh = await repo().organize(who(), date);
    const cur = org.value[date] ?? { projectId: null, items: [] };
    await saveOrganization(date, { projectId: cur.projectId, items: mergeSuggestions(cur.items, fresh) });
  }
  /** Accepting a project assigns the day to it: an existing one by name (ignoring case), or a new one. */
  async function review(date: string, id: string, action: 'accept' | 'reject', text?: string) {
    const cur = org.value[date];
    if (!cur) return;
    const items = reviewItem(cur.items, id, action, text);
    const item = items.find(i => i.id === id);
    let input: OrganizationInput = { projectId: cur.projectId, items };
    if (action === 'accept' && item?.kind === 'project') {
      const match = projects.value.find(p => nameKey(p.name) === nameKey(item.text));
      input = match ? { projectId: match.id, items } : { projectId: null, newProjectName: item.text, items };
    }
    await saveOrganization(date, input);
  }
  async function createProject(p: ProjectInput) {
    const made = await repo().createProject(who(), p);
    projects.value = byName([...projects.value, made]);
    return made;
  }
  async function updateProject(id: string, p: ProjectInput) {
    const made = await repo().updateProject(who(), id, p);
    projects.value = byName(projects.value.map(x => (x.id === id ? made : x)));
  }
  async function deleteProject(id: string) {
    await repo().deleteProject(who(), id);
    projects.value = projects.value.filter(x => x.id !== id);
  }
```

- Return the new names from the store: `org, projects, reviewing, organizeError, organizeEntry, review, saveOrganization, createProject, updateProject, deleteProject`.
- Add the imports: `Organized, OrganizationInput, Project, ProjectInput` from model, `mergeSuggestions, nameKey, reviewItem` from `../core/organize`, and `plain` from `../data/plain`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/stores.test.ts`
Expected: PASS.

- [ ] **Step 5: Ask before clearing an entry with accepted items** in `src/components/EntryEditor.vue`

In `persist()`, right after `pending = null;`:

```ts
  // Clearing a day deletes its accepted items too, so that's asked first; "Cancel" puts the saved text back.
  if (!p.text.trim() && journal.org[p.date]?.items.some(i => i.status === 'accepted')
    && !(await ask('This entry has accepted items. Clearing it removes them from your Projects, Learning and Skills. Clear it?', 'Clear'))) {
    if (props.date === p.date) text.value = journal.entries[p.date] ?? '';
    status.value = 'saved';
    return;
  }
```

The e2e test in Task 9 covers this (the dialog needs a browser).

- [ ] **Step 6: Run all unit tests and type-check**

Run: `npx vitest run` then `npx vue-tsc --noEmit`
Expected: all pass; vue-tsc clean.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/stores/journal.ts src/components/EntryEditor.vue tests/unit/stores.test.ts && git commit -m "feat: the journal store organizes, reviews and keeps projects; clearing asks first

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ✦ Organize, the review panel and "Connected to" (prototype)

**Files:**
- Create:
  - `intern-logbook/src/components/Organize.vue`
  - `intern-logbook/src/components/ReviewPanel.vue`
  - `intern-logbook/tests/e2e/organize.spec.ts`
- Modify:
  - `src/views/Today.vue`
  - `src/views/JournalEntry.vue`
  - `src/styles.css`

**Interfaces:**
- Consumes: the Task 8 store API, `EntryEditor`'s exposed `saved(): Promise<boolean>`, and `SERVER_MODE`/`ApiError` from `src/data/api.ts`.
- Produces these test ids:
  - `organize`, `organize-summary`, `organize-review`;
  - `review-panel`, `review-demo`, `organize-error`, `review-card` (with `data-kind`), `review-text`, `review-accept`, `review-edit`, `review-edit-text`, `review-save`, `review-reject`, `review-close`;
  - `connected`, `connected-project`, `connected-item`.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/organize.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { asRole, iso, lastWeekday, nav, writeEntry } from './helpers';

const day = iso(lastWeekday());

test('an intern organizes an entry, reviews the suggestions and sees what it is connected to', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await writeEntry(page, day, 'Built the login page. Fixed the redirect bug. Wrote a test.');

  await page.getByTestId('organize').click();
  const panel = page.getByTestId('review-panel');
  await expect(panel.getByTestId('review-demo')).toHaveText('Demo suggestions (no AI)');
  await expect(panel.getByTestId('review-card')).toHaveCount(3); // no projects yet, so no project card
  const cards = panel.getByTestId('review-card');
  await cards.nth(0).getByTestId('review-accept').click();
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByTestId('review-edit').click();
  await panel.getByTestId('review-edit-text').fill('Fixed the login redirect bug');
  await panel.getByTestId('review-save').click();
  await cards.nth(0).getByTestId('review-reject').click();
  await expect(panel.getByTestId('review-card')).toHaveCount(0);
  await expect(page.getByTestId('organize-summary')).toContainText('2 accepted · 0 waiting');

  // Organizing again keeps the accepted ones and doesn't bring back the rejected one.
  await page.getByTestId('organize').click();
  await expect(panel.getByTestId('review-card')).toHaveCount(0);

  await expect(page.getByTestId('connected-item')).toHaveText(['Activity Built the login page', 'Activity Fixed the login redirect bug']);
});

test('accepting an edited project name creates the project and connects the entry', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('ERP gateway');
  await page.getByTestId('project-save').click();

  await writeEntry(page, day, 'Built the mobile login screen.');
  await page.getByTestId('organize').click();
  const project = page.locator('[data-testid="review-card"][data-kind="project"]');
  await expect(project.getByTestId('review-text')).toHaveText('ERP gateway');
  await project.getByTestId('review-edit').click();
  await page.getByTestId('review-edit-text').fill('Mobile app');
  await page.getByTestId('review-save').click();
  await expect(page.getByTestId('connected-project')).toHaveText('Mobile app');
  await page.getByTestId('connected-project').click();
  await expect(page.getByTestId('project-title')).toHaveText('Mobile app');
});

test('clearing an entry with accepted items asks first', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await writeEntry(page, day, 'Built the login page.');
  await page.getByTestId('organize').click();
  await page.getByTestId('review-accept').first().click();

  await page.getByTestId('entry-text').fill('');
  await expect(page.getByRole('dialog')).toContainText('This entry has accepted items.');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('entry-text')).toHaveValue('Built the login page.');

  await page.getByTestId('entry-text').fill('');
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await expect(page.getByTestId('connected-item')).toHaveCount(0);
});

test('supervisors have no Organize button', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await page.getByTestId('entry-text').fill('Met the interns.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await expect(page.getByTestId('organize')).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/organize.spec.ts`
Expected: FAIL. `getByTestId('organize')` is not found (and `Projects` is not in the sidebar until Task 10; test 2 stays red until then, which is expected here).

- [ ] **Step 3: Write `src/components/Organize.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useJournal } from '../stores/journal';
import { ApiError } from '../data/api';

/** ✦ Organize under an entry, and the line saying what's been reviewed. The cards are in ReviewPanel. */
const props = defineProps<{ date: string; flush: () => Promise<boolean> }>();
const journal = useJournal();
const running = ref(false);
const items = computed(() => journal.org[props.date]?.items ?? []);
const accepted = computed(() => items.value.filter(i => i.status === 'accepted').length);
const waiting = computed(() => items.value.filter(i => i.status === 'suggested').length);
const FAILED = "Your entry is saved. I couldn't organize it right now. Try again";

async function run() {
  if (!(await props.flush())) return; // unsaved text: EntryEditor already said why
  running.value = true;
  journal.organizeError = '';
  try {
    await journal.organizeEntry(props.date);
  } catch (e) {
    journal.organizeError = e instanceof ApiError && e.status === 429 ? e.message : FAILED;
  } finally {
    running.value = false;
    journal.reviewing = props.date;
  }
}
</script>

<template>
  <p class="organize">
    <button type="button" data-testid="organize" :disabled="running || !journal.entries[date]?.trim()" @click="run">
      {{ running ? '✦ Organizing your entry…' : '✦ Organize' }}
    </button>
    <span v-if="items.length" class="muted" data-testid="organize-summary">
      {{ accepted }} accepted · {{ waiting }} waiting ·
      <button type="button" class="link" data-testid="organize-review" @click="journal.reviewing = date">Review</button>
    </span>
  </p>
</template>
```

- [ ] **Step 4: Write `src/components/ReviewPanel.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { errorText } from '../lib/errors';
import { SERVER_MODE } from '../data/api';
import { nameKey } from '../core/organize';
import type { Item } from '../core/model';

/** "Review what I found": one card per waiting suggestion, with Accept, Edit and Reject. */
const props = defineProps<{ date: string }>();
const journal = useJournal();
const toast = useToast();
const LABEL = { project: 'Project', activity: 'Activity', learning: 'Learning', skill: 'Skill' } as const;
const waiting = computed(() => (journal.org[props.date]?.items ?? []).filter(i => i.status === 'suggested'));
const isNew = (name: string) => !journal.projects.some(p => nameKey(p.name) === nameKey(name));
const editing = ref<string | null>(null);
const draft = ref('');
const busy = ref(false);

function edit(i: Item) { editing.value = i.id; draft.value = i.text; }
async function review(i: Item, action: 'accept' | 'reject', text?: string) {
  busy.value = true;
  try {
    await journal.review(props.date, i.id, action, text);
    editing.value = null;
  } catch (e) {
    toast.show(`Couldn't save that: ${errorText(e)}`, true);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="journal.reviewing === date" class="card review-panel" data-testid="review-panel" aria-live="polite">
    <header class="row">
      <h2>Review what I found</h2>
      <span class="spacer" />
      <button type="button" class="link" data-testid="review-close" @click="journal.reviewing = null">Close</button>
    </header>
    <p v-if="!SERVER_MODE" class="muted" data-testid="review-demo">Demo suggestions (no AI)</p>
    <p v-if="journal.organizeError" class="banner" data-testid="organize-error">{{ journal.organizeError }}</p>
    <p v-else-if="!waiting.length" class="muted">Nothing waiting. Everything found here has been reviewed.</p>
    <datalist id="project-names"><option v-for="p in journal.projects" :key="p.id" :value="p.name" /></datalist>
    <article v-for="i in waiting" :key="i.id" class="review-card" data-testid="review-card" :data-kind="i.kind">
      <p class="muted">{{ LABEL[i.kind] }}<template v-if="i.kind === 'project' && isNew(i.text)"> · new</template></p>
      <form v-if="editing === i.id" @submit.prevent="review(i, 'accept', draft)">
        <input v-model="draft" data-testid="review-edit-text" required :aria-label="`Edit ${LABEL[i.kind]}`"
          :list="i.kind === 'project' ? 'project-names' : undefined" :maxlength="i.kind === 'project' ? 120 : 300" />
        <div class="row">
          <button type="button" @click="editing = null">Cancel</button>
          <button class="primary" data-testid="review-save" :disabled="busy">Save</button>
        </div>
      </form>
      <template v-else>
        <p data-testid="review-text">{{ i.text }}</p>
        <div class="row">
          <button type="button" class="primary" data-testid="review-accept" :disabled="busy" @click="review(i, 'accept')">Accept</button>
          <button type="button" data-testid="review-edit" :disabled="busy" @click="edit(i)">Edit</button>
          <button type="button" data-testid="review-reject" :disabled="busy" @click="review(i, 'reject')">Reject</button>
        </div>
      </template>
    </article>
  </section>
</template>
```

- [ ] **Step 5: Put them on Today** (`src/views/Today.vue`)

- Import `Organize` and `ReviewPanel`.
- Add `const intern = computed(() => !session.isSupervisor);`.
- After the prompts `<p v-if="prompts" ...>` element:

```vue
      <Organize v-if="intern" :date="today" :flush="() => editor?.saved() ?? Promise.resolve(true)" />
```

- As the first child of `<aside class="today-side">`:

```vue
      <ReviewPanel v-if="intern" :date="today" />
```

- [ ] **Step 6: Rewrite `src/views/JournalEntry.vue`** with the panel and the Connected to card

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { isWritableDay } from '../core/journal';
import { parseISO, todayISO } from '../core/dates';
import { useJournal } from '../stores/journal';
import { useSession } from '../stores/session';
import EntryEditor from '../components/EntryEditor.vue';
import Organize from '../components/Organize.vue';
import ReviewPanel from '../components/ReviewPanel.vue';

const route = useRoute();
const journal = useJournal();
const session = useSession();
const editor = ref<InstanceType<typeof EntryEditor>>();
const date = computed(() => String(route.params.date));
const ok = computed(() => isWritableDay(date.value, todayISO()));
const title = computed(() => parseISO(date.value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
const LABEL = { activity: 'Activity', learning: 'Learning', skill: 'Skill' } as const;
const organized = computed(() => journal.org[date.value]);
const project = computed(() => journal.projects.find(p => p.id === organized.value?.projectId));
const connected = computed(() => (organized.value?.items ?? []).filter(i => i.status === 'accepted' && i.kind !== 'project'));
</script>

<template>
  <p><RouterLink to="/journal" data-testid="entry-back">← Journal</RouterLink></p>
  <p v-if="!ok" class="banner" data-testid="entry-error">You can't write for a day that hasn't happened yet.</p>
  <div v-else class="today">
    <div>
      <EntryEditor ref="editor" :date="date">
        <template #title><h1>{{ title }}</h1></template>
      </EntryEditor>
      <Organize v-if="!session.isSupervisor" :date="date" :flush="() => editor?.saved() ?? Promise.resolve(true)" />
    </div>
    <aside v-if="!session.isSupervisor" class="today-side">
      <ReviewPanel :date="date" />
      <section class="card" data-testid="connected">
        <h2>Connected to</h2>
        <p v-if="project"><RouterLink :to="`/projects/${project.id}`" data-testid="connected-project">{{ project.name }}</RouterLink></p>
        <ul v-if="connected.length" class="record-list">
          <li v-for="i in connected" :key="i.id" data-testid="connected-item"><span class="muted">{{ LABEL[i.kind as keyof typeof LABEL] }}</span> {{ i.text }}</li>
        </ul>
        <p v-if="!project && !connected.length" class="muted">Nothing yet. Use ✦ Organize to connect this entry.</p>
      </section>
    </aside>
  </div>
</template>
```

`writeEntry` leaves the browser on `/journal/<date>`, so the e2e tests use this page.

- [ ] **Step 7: Styles** (append to `src/styles.css`)

```css
.organize { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.review-panel header h2 { margin: 0; }
.review-card { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; }
.review-card p { margin: 0 0 8px; }
.review-card input { width: 100%; margin-bottom: 8px; }
.record-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
```

- [ ] **Step 8: Run the tests**

Run: `npx vue-tsc --noEmit` then `npx playwright test tests/e2e/organize.spec.ts`
Expected: tests 1, 3 and 4 PASS. Test 2 needs the Projects page from Task 10; it fails at `nav(page, 'Projects')`. Record that in the ledger and run it again at the end of Task 10.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/components/Organize.vue src/components/ReviewPanel.vue src/views/Today.vue src/views/JournalEntry.vue src/styles.css tests/e2e/organize.spec.ts && git commit -m "feat: Organize an entry and review what was found; Connected to on the entry page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The Projects, Learning and Skills pages (prototype)

**Files:**
- Create:
  - `intern-logbook/src/views/Projects.vue`
  - `intern-logbook/src/views/ProjectDetail.vue`
  - `intern-logbook/src/views/Learning.vue`
  - `intern-logbook/src/views/Skills.vue`
  - `intern-logbook/src/views/SkillDetail.vue`
  - `intern-logbook/tests/e2e/records.spec.ts`
- Modify:
  - `src/router.ts`
  - `src/App.vue`
  - `src/components/NavIcon.vue`
  - `src/styles.css`

**Interfaces:**
- Consumes: from Task 6, `projectStats`, `acceptedRows`, `skillStats`, `learningRows`, `shortDate`; from Task 8, the store `projects`/`org` and the create, update and delete project actions.
- Produces:
  - routes `/projects`, `/projects/:id`, `/learning`, `/skills`, `/skills/:name` (where `:name` is the skill key, URI-encoded);
  - test ids `project-new`, `project-name`, `project-description`, `project-save`, `project-card`, `project-counts`, `projects-empty`;
  - on the project page: `project-title`, `project-tab`, `project-rename`, `project-describe`, `project-delete`, `project-edit-text`, `project-edit-save`, `project-rows`, `project-missing`, `project-tile`;
  - on Learning: `learning-filter`, `learning-row`, `learning-empty`;
  - on Skills: `skill-card`, `skills-empty`, `skill-why`, `skill-day`, `skill-missing`.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/records.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { asRole, iso, lastWeekday, nav, writeEntry } from './helpers';

const day = iso(lastWeekday());

test('a fresh intern sees empty Projects, Learning and Skills pages', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await expect(page.getByTestId('projects-empty')).toHaveText('Projects appear when you accept one from an entry, or add one here.');
  await nav(page, 'Learning');
  await expect(page.getByTestId('learning-empty')).toHaveText('Learning points appear here when you accept them from your entries.');
  await nav(page, 'Skills');
  await expect(page.getByTestId('skills-empty')).toHaveText('Skills appear only when your journal supports them.');
  // In-app navigation: a reload would reset "Viewing as" to the supervisor.
  await page.evaluate(() => { location.hash = '#/projects/nope'; });
  await expect(page.getByTestId('project-missing')).toHaveText("That project doesn't exist.");
  await page.evaluate(() => { location.hash = '#/skills/nope'; });
  await expect(page.getByTestId('skill-missing')).toHaveText("You haven't been seen using that skill yet.");
});

test('a project with accepted items shows its counts, tabs, learning and skills; it can be renamed but not deleted while used', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('ERP gateway');
  await page.getByTestId('project-description').fill('Sign-in work');
  await page.getByTestId('project-save').click();
  await nav(page, 'Projects');
  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('Unused');
  await page.getByTestId('project-save').click();

  // The stand-in suggests the first project (no entry uses one yet) and one activity per sentence: accept all three.
  await writeEntry(page, day, 'Built the login page. Wrote a test.');
  await page.getByTestId('organize').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('review-accept').first().click();
  await expect(page.getByTestId('organize-summary')).toContainText('3 accepted');

  await nav(page, 'Projects');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByTestId('project-card').first()).toContainText('ERP gateway');
  await expect(page.getByTestId('project-card').first().getByTestId('project-counts')).toHaveText('2 activities · 0 learning points · 0 skills');
  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-title')).toHaveText('ERP gateway');
  await page.getByTestId('project-tab').filter({ hasText: 'Timeline' }).click();
  await expect(page.getByTestId('project-rows').getByRole('link')).toHaveCount(2);

  await page.getByTestId('project-tab').filter({ hasText: 'Overview' }).click();
  await page.getByTestId('project-delete').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('toast')).toContainText('Entries still use this project. Move them first.');

  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-edit-text').fill('ERP Gateway v2');
  await page.getByTestId('project-edit-save').click();
  await expect(page.getByTestId('project-title')).toHaveText('ERP Gateway v2');
});

test('supervisors have no Projects, Learning or Skills and are sent to Today', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  for (const name of ['Projects', 'Learning', 'Skills']) await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/skills'; });
  await expect(page).toHaveURL(/#\/today$/);
});
```

Before you run it, check the toast's test id in `src/components/ToastHost.vue`. If it isn't `toast`, use the one it has and ledger a ruling.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/records.spec.ts`
Expected: FAIL; the `Projects` link is not found.

- [ ] **Step 3: Routes and guard** (`src/router.ts`)

Add after the `journal-entry` route:

```ts
    { path: '/projects', name: 'projects', component: () => import('./views/Projects.vue') },
    { path: '/projects/:id', name: 'project', component: () => import('./views/ProjectDetail.vue') },
    { path: '/learning', name: 'learning', component: () => import('./views/Learning.vue') },
    { path: '/skills', name: 'skills', component: () => import('./views/Skills.vue') },
    { path: '/skills/:name', name: 'skill', component: () => import('./views/SkillDetail.vue') },
```

In the guard, replace the `const writing = ...` line with:

```ts
  // Projects, Learning and Skills are built from an intern's own journal: interns only, with or without a logbook.
  const records = /^\/(projects|learning|skills)(\/|$)/.test(to.path);
  if (records && session.isSupervisor) return '/today';
  const writing = to.path === '/today' || to.path.startsWith('/journal') || records;
```

- [ ] **Step 4: Sidebar and icons**

In `src/App.vue`, add above `const links`:

```ts
const RECORDS = [
  { to: '/projects', label: 'Projects', icon: 'projects' },
  { to: '/learning', label: 'Learning', icon: 'learning' },
  { to: '/skills', label: 'Skills', icon: 'skills' },
];
```

In both intern lists, put `...RECORDS,` right after the `{ to: '/journal', ... }` line.

In `src/components/NavIcon.vue` `PATHS`:

```ts
  projects: 'M3 7h18v13H3zM8 7V4h8v3',
  learning: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  skills: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
```

- [ ] **Step 5: Write `src/views/Projects.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { errorText } from '../lib/errors';
import { projectStats } from '../core/records';

const journal = useJournal();
const toast = useToast();
const stats = computed(() => projectStats(journal.projects, journal.org));
const adding = ref(false);
const name = ref('');
const description = ref('');
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function add() {
  try {
    await journal.createProject({ name: name.value, description: description.value });
    adding.value = false;
    name.value = '';
    description.value = '';
  } catch (e) {
    toast.show(`Couldn't add the project: ${errorText(e)}`, true);
  }
}
</script>

<template>
  <header class="row">
    <h1>Projects</h1>
    <span class="spacer" />
    <button type="button" class="primary" data-testid="project-new" @click="adding = !adding">+ New project</button>
  </header>
  <form v-if="adding" class="card stack" @submit.prevent="add">
    <label>Name <input v-model="name" data-testid="project-name" required maxlength="120" /></label>
    <label>Description (optional) <textarea v-model="description" data-testid="project-description" maxlength="500" /></label>
    <div class="row">
      <button type="button" @click="adding = false">Cancel</button>
      <button class="primary" data-testid="project-save">Add project</button>
    </div>
  </form>
  <p v-if="!stats.length" class="muted" data-testid="projects-empty">Projects appear when you accept one from an entry, or add one here.</p>
  <div class="card-grid">
    <RouterLink v-for="s in stats" :key="s.project.id" :to="`/projects/${s.project.id}`" class="card project-card" data-testid="project-card">
      <h2>{{ s.project.name }}</h2>
      <p v-if="s.project.description" class="muted">{{ s.project.description }}</p>
      <p data-testid="project-counts">{{ count(s.activities, 'activity', 'activities') }} · {{ count(s.learning, 'learning point', 'learning points') }} · {{ count(s.skills, 'skill', 'skills') }}</p>
    </RouterLink>
  </div>
</template>
```

- [ ] **Step 6: Write `src/views/ProjectDetail.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useJournal } from '../stores/journal';
import { useToast } from '../stores/toast';
import { errorText } from '../lib/errors';
import { ask } from '../lib/ask';
import { acceptedRows, projectStats, shortDate, skillStats } from '../core/records';

const route = useRoute();
const router = useRouter();
const journal = useJournal();
const toast = useToast();
const id = computed(() => String(route.params.id));
const stats = computed(() => projectStats(journal.projects, journal.org).find(s => s.project.id === id.value));
const rows = computed(() => acceptedRows(journal.org).filter(r => r.projectId === id.value));
const skills = computed(() => skillStats(Object.fromEntries(Object.entries(journal.org).filter(([, o]) => o.projectId === id.value))));
const TABS = ['Overview', 'Timeline', 'Learning', 'Skills'] as const;
const tab = ref<(typeof TABS)[number]>('Overview');
const listed = computed(() => rows.value.filter(r => r.kind === (tab.value === 'Timeline' ? 'activity' : 'learning')));
const editing = ref<'name' | 'description' | null>(null);
const draft = ref('');

function edit(what: 'name' | 'description') {
  editing.value = what;
  draft.value = (what === 'name' ? stats.value?.project.name : stats.value?.project.description) ?? '';
}
async function saveEdit() {
  const p = stats.value!.project;
  try {
    await journal.updateProject(p.id, editing.value === 'name' ? { name: draft.value, description: p.description } : { name: p.name, description: draft.value });
    editing.value = null;
  } catch (e) {
    toast.show(`Couldn't save: ${errorText(e)}`, true);
  }
}
async function remove() {
  const p = stats.value!.project;
  if (!(await ask(`Delete the project "${p.name}"?`, 'Delete'))) return;
  try {
    await journal.deleteProject(p.id);
    await router.push('/projects');
  } catch (e) {
    toast.show(errorText(e), true);
  }
}
</script>

<template>
  <p><RouterLink to="/projects">← Projects</RouterLink></p>
  <p v-if="!stats" class="banner" data-testid="project-missing">That project doesn't exist.</p>
  <template v-else>
    <h1 data-testid="project-title">{{ stats.project.name }}</h1>
    <p v-if="stats.project.description" class="muted">{{ stats.project.description }}</p>
    <div class="row" role="tablist">
      <button v-for="t in TABS" :key="t" type="button" role="tab" :aria-selected="tab === t" :aria-pressed="tab === t" data-testid="project-tab" @click="tab = t">{{ t }}</button>
    </div>
    <section v-if="tab === 'Overview'">
      <div class="tiles">
        <div class="card" data-testid="project-tile"><strong>{{ stats.activities }}</strong> <span class="muted">Activities</span></div>
        <div class="card" data-testid="project-tile"><strong>{{ stats.learning }}</strong> <span class="muted">Learning points</span></div>
        <div class="card" data-testid="project-tile"><strong>{{ stats.skills }}</strong> <span class="muted">Skills</span></div>
      </div>
      <form v-if="editing" class="card stack" @submit.prevent="saveEdit">
        <label v-if="editing === 'name'">Name <input v-model="draft" data-testid="project-edit-text" required maxlength="120" /></label>
        <label v-else>Description <textarea v-model="draft" data-testid="project-edit-text" maxlength="500" /></label>
        <div class="row">
          <button type="button" @click="editing = null">Cancel</button>
          <button class="primary" data-testid="project-edit-save">Save</button>
        </div>
      </form>
      <div class="row">
        <button type="button" data-testid="project-rename" @click="edit('name')">Rename</button>
        <button type="button" data-testid="project-describe" @click="edit('description')">Edit description</button>
        <button type="button" class="danger" data-testid="project-delete" @click="remove">Delete</button>
      </div>
    </section>
    <ul v-else-if="tab !== 'Skills'" class="record-list" data-testid="project-rows">
      <li v-for="(r, i) in listed" :key="i"><RouterLink :to="`/journal/${r.date}`"><span class="muted">{{ shortDate(r.date) }}</span> {{ r.text }}</RouterLink></li>
      <li v-if="!listed.length" class="muted">Nothing here yet.</li>
    </ul>
    <ul v-else class="record-list" data-testid="project-rows">
      <li v-for="s in skills" :key="s.key">
        <RouterLink :to="`/skills/${encodeURIComponent(s.key)}`">{{ s.name }}</RouterLink>
        <span class="muted"> · {{ s.dates.length }} entr{{ s.dates.length === 1 ? 'y' : 'ies' }}</span>
      </li>
      <li v-if="!skills.length" class="muted">Nothing here yet.</li>
    </ul>
  </template>
</template>
```

- [ ] **Step 7: Write `src/views/Learning.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { learningRows, shortDate } from '../core/records';

const journal = useJournal();
const filter = ref('all');
const any = computed(() => learningRows(journal.org, 'all').length > 0);
const rows = computed(() => learningRows(journal.org, filter.value));
const projectName = (id: string | null) => journal.projects.find(p => p.id === id)?.name ?? 'No project';
</script>

<template>
  <h1>Learning</h1>
  <p v-if="!any" class="muted" data-testid="learning-empty">Learning points appear here when you accept them from your entries.</p>
  <template v-else>
    <label class="inline">Project
      <select v-model="filter" data-testid="learning-filter">
        <option value="all">All projects</option>
        <option v-for="p in journal.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        <option value="none">No project</option>
      </select>
    </label>
    <ul class="record-list">
      <li v-for="(r, i) in rows" :key="i" class="card" data-testid="learning-row">
        <RouterLink :to="`/journal/${r.date}`">{{ r.text }}</RouterLink>
        <p class="muted">{{ projectName(r.projectId) }} · {{ shortDate(r.date) }}</p>
      </li>
    </ul>
    <p v-if="!rows.length" class="muted">No learning points for that project yet.</p>
  </template>
</template>
```

- [ ] **Step 8: Write `src/views/Skills.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournal } from '../stores/journal';
import { shortDate, skillStats } from '../core/records';

const journal = useJournal();
const skills = computed(() => skillStats(journal.org));
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<template>
  <h1>Skills</h1>
  <p v-if="!skills.length" class="muted" data-testid="skills-empty">Skills appear only when your journal supports them.</p>
  <div class="card-grid">
    <RouterLink v-for="s in skills" :key="s.key" :to="`/skills/${encodeURIComponent(s.key)}`" class="card project-card" data-testid="skill-card">
      <h2>{{ s.name }}</h2>
      <p>Seen in {{ count(s.projectIds.length, 'project', 'projects') }} · {{ count(s.activities, 'activity', 'activities') }} · {{ count(s.learning, 'learning point', 'learning points') }}</p>
      <p class="muted">First seen {{ shortDate(s.first) }}</p>
    </RouterLink>
  </div>
</template>
```

- [ ] **Step 9: Write `src/views/SkillDetail.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useJournal } from '../stores/journal';
import { shortDate, skillStats } from '../core/records';

const route = useRoute();
const journal = useJournal();
const skill = computed(() => skillStats(journal.org).find(s => s.key === String(route.params.name)));
const projectNames = computed(() => (skill.value?.projectIds ?? []).map(id => journal.projects.find(p => p.id === id)?.name ?? '').filter(Boolean).join(', '));
const activities = (date: string) => (journal.org[date]?.items ?? []).filter(i => i.status === 'accepted' && i.kind === 'activity');
</script>

<template>
  <p><RouterLink to="/skills">← Skills</RouterLink></p>
  <p v-if="!skill" class="banner" data-testid="skill-missing">You haven't been seen using that skill yet.</p>
  <template v-else>
    <h1>{{ skill.name }}</h1>
    <section class="card">
      <h2>Why this skill appears</h2>
      <p data-testid="skill-why">Accepted from {{ skill.dates.length }} entr{{ skill.dates.length === 1 ? 'y' : 'ies' }}<template v-if="projectNames"> in: {{ projectNames }}</template>.</p>
    </section>
    <ul class="record-list">
      <li v-for="d in skill.dates" :key="d" class="card" data-testid="skill-day">
        <RouterLink :to="`/journal/${d}`">{{ shortDate(d) }}</RouterLink>
        <ul><li v-for="a in activities(d)" :key="a.id">{{ a.text }}</li></ul>
      </li>
    </ul>
  </template>
</template>
```

- [ ] **Step 10: Styles** (append to `src/styles.css`)

```css
.stack { display: grid; gap: 12px; margin-bottom: 16px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.project-card { display: block; color: inherit; text-decoration: none; }
.project-card:hover { border-color: var(--primary); }
.project-card h2 { margin: 0 0 6px; }
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.tiles strong { font-size: 24px; display: block; }
@media (max-width: 700px) { .tiles { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 11: Run the tests**

Run: `npx vue-tsc --noEmit` then `npx playwright test tests/e2e/records.spec.ts tests/e2e/organize.spec.ts`
Expected: all PASS, including `organize.spec.ts` test 2 from Task 9.

Then run the whole e2e suite (`npx playwright test`). If a spec that lists sidebar links by exact name breaks, update it to include the three new links and ledger the ruling.

- [ ] **Step 12: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/views src/router.ts src/App.vue src/components/NavIcon.vue src/styles.css tests/e2e && git commit -m "feat: Projects, Learning and Skills pages for interns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Demo data with projects, learning and skills (prototype)

**Files:**
- Modify:
  - `intern-logbook/src/data/demo.ts`
  - `tests/e2e/records.spec.ts` (one more test)

**Interfaces:**
- Consumes: `Repository.createProject` and `Repository.putOrganization` (Task 7), and `Item` (Task 5).

- [ ] **Step 1: Write the failing e2e test** (append to `tests/e2e/records.spec.ts`)

```ts
test('the demo data comes with projects, learning and skills', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await nav(page, 'Skills');
  await expect(page.getByTestId('skill-card').filter({ hasText: 'Unit testing' })).toHaveCount(1);
  await nav(page, 'Learning');
  await page.getByTestId('learning-filter').selectOption({ label: 'Invoice export' });
  await expect(page.getByTestId('learning-row').first()).toContainText('Testing an API with Postman');
});
```

Check `smoke.spec.ts` lines 14–19 for the exact load-demo clicks and copy them if they differ.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/records.spec.ts -g "demo data"`
Expected: FAIL, 0 project cards.

- [ ] **Step 3: Seed in `src/data/demo.ts`**

Add the imports `newId` from `../core/ids` and `Item` from `../core/model`, and this above `loadDemoData`:

```ts
/** Reviewed suggestions for the matching NOTES line; null leaves that day for the intern to organize. */
const DEMO_ORG: ({ project: 0 | 1; activity: string; learning?: string; skill: string } | null)[] = [
  { project: 0, activity: 'Set up the ERP gateway dev environment', learning: 'How the gateway test suite is organised', skill: 'Environment setup' },
  { project: 0, activity: 'Fixed a login redirect bug', learning: 'Writing a failing test before the fix', skill: 'Unit testing' },
  { project: 1, activity: 'Joined sprint planning and took the invoice export ticket', skill: 'Agile planning' },
  { project: 1, activity: 'Built the invoice export endpoint', learning: 'Testing an API with Postman', skill: 'API development' },
  null,
];
```

In the per-student loop, replace

```ts
    eachDay(start, addDays(todayISO(), -1)).filter(d => !isWeekend(d)).forEach((d, i) => { notes[d] = NOTES[i % NOTES.length]; });
    for (const [date, text] of Object.entries(notes)) await r.putJournalEntry(id, date, text);
```

with

```ts
    const days = eachDay(start, addDays(todayISO(), -1)).filter(d => !isWeekend(d));
    days.forEach((d, i) => { notes[d] = NOTES[i % NOTES.length]; });
    for (const [date, text] of Object.entries(notes)) await r.putJournalEntry(id, date, text);

    const projects = [
      await r.createProject(id, { name: 'ERP gateway', description: 'Sign-in and shared services for the micro-apps.' }),
      await r.createProject(id, { name: 'Invoice export', description: null }),
    ];
    for (const [i, date] of days.entries()) {
      const o = DEMO_ORG[i % DEMO_ORG.length];
      if (!o) continue;
      const items: Item[] = [
        { kind: 'project' as const, text: projects[o.project].name },
        { kind: 'activity' as const, text: o.activity },
        ...(o.learning ? [{ kind: 'learning' as const, text: o.learning }] : []),
        { kind: 'skill' as const, text: o.skill },
      ].map(x => ({ ...x, id: newId('item'), status: 'accepted' as const }));
      await r.putOrganization(id, date, { projectId: projects[o.project].id, items });
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test tests/e2e/records.spec.ts`
Expected: PASS.

- [ ] **Step 5: Check the single-file preview**

Run: `npx vite build --mode single`, then open `dist-preview/index.html` in the browser pane. Check:
- the demo loads with no console errors;
- switch to Aina; Projects shows 2 cards; open a past entry, press ✦ Organize, and see "Demo suggestions (no AI)".

- [ ] **Step 6: Full verification**

Run: `npx vitest run`, `npx vue-tsc --noEmit`, `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`, `npx playwright test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/intern-logbook && git add src/data/demo.ts tests/e2e/records.spec.ts && git commit -m "feat: demo data with projects, learning and skills

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
