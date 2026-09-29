# appv3 Logbook Templates (Part 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supervisors upload one Word/PDF logbook template per university into appv3, correct the detected placeholders on a highlight overlay, and save it. Students can fetch their university's template, which part 2 uses.

**Architecture:**
- Laravel stores the original file on the private `local` disk, and stores the placeholder JSON in a new `logbook_templates` table.
- Seven endpoints are added under `/api/v1`, reusing `Problem`, `ConcurrencyService` and the existing `auth` routes.
- Detection runs in the browser using the prototype's pure-TypeScript core, copied unchanged into `src/features/templates/core/`.
- The prototype's Vue overlay and editor are ported to React, in edit mode only; fill mode comes in part 2.

**Tech Stack:**
- Backend: Laravel 13 (PHP ≥ 8.4), MariaDB, PHPUnit.
- Frontend: React 19, TanStack Query, zod, Vitest, MSW.
- New frontend dependencies: `jszip`, `pdfjs-dist@4.10.38`, `pdf-lib` and `docx-preview`.

**Spec:** `docs/superpowers/specs/2026-09-28-appv3-logbook-templates-design.md`

**Prototype source (copy from here):** `../intern-logbook`, the sibling folder of this repo (`C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`).

## Deviations from the spec (smaller, same behaviour for users)

- **409 has no `existingId`, and Replace = delete + create.**
  - The editor already has the template list, so it finds the clash itself.
  - `PUT` can't carry a new file, so "Replace" deletes the old template and then creates the new one.
  - Students are matched by university name, not id, so they follow the new template automatically.
- **No `Idempotency-Key` on `POST /templates`.** The unique `university_key` index turns a repeated create into a 409, never a duplicate.
- **No list ETag.** Nothing reads it. List rows carry `version` instead, so Delete can send `If-Match`.
- **A 412 on save asks "Load their version?" through `ask()` rather than `ConflictDialog`.** That dialog compares two text bodies, which doesn't fit a placeholder list.
- **The unsaved-changes guard covers only closing the tab and the editor's "Back to templates" button.**
  - A `beforeunload` listener handles closing the tab.
  - Sidebar links are not guarded: appv3 uses `<BrowserRouter>`, which has no `useBlocker`.
- **`core/fill/*` moves in part 2 with `autofill`,** because `fill/docx.ts` imports `autofill.ts`. Part 1 copies only what detection and the editor use.
- **No Playwright e2e.**
  - `@playwright/test` isn't installed in appv3, and its README says the e2e suite isn't runnable here.
  - The page tests in Task 7 cover the same flow.

## Global Constraints

- Backend PHP ≥ 8.4 (`composer.json` requires `^8.4`). Laravel 13, MariaDB.
- `pdfjs-dist` pinned to exactly `4.10.38` (legacy build). The worker is served via a Vite `?url` import.
- Template file ≤ 10 MB, extension `docx` or `pdf`, and the content must match: a docx is a ZIP containing `word/document.xml`; a pdf starts with `%PDF-`.
- `universityName` is 1–200 characters. `university_key` = `mb_strtolower` of the trimmed name with runs of whitespace collapsed to one space. The TS twin is `normalizeUniversity`.
- `placeholders`: at most 500 items. Each is `id` ≤ 64, `label` ≤ 300 (required), `binding` ∈ {cover, daily, period, date, free, signature}, `source` ∈ {marker, label, manual}, `region` ∈ {cover, unit}, optional `dayIndex` 0–31, `dayMode` ∈ {weekday, nth}, `dateRole` ∈ {day, start, end, range, number}, and an `anchor` of kind `pdf` | `docx-cell` | `docx-text`. There must be at least one placeholder with `region: unit`.
- `pageRoles` (`cover|unit|ignore`) is required for pdf. `unitStartBlock` (int ≥ 0) is required for docx.
- `PUT` and `DELETE` require `If-Match`: missing → **428**, stale → **412**.
- Only the `supervisor` role writes templates. Students read only their own university's file.
- Errors are RFC 9457 problem+json via `App\Support\Problem`.
- `src/features/templates/core/**` must not import React. It stays a verbatim copy of the prototype core.
- The template pages are lazy-loaded routes, so pdf.js and docx-preview never enter the entry bundle (`npm run bundle:check`).
- Copy is weekly only: "Repeats every week", "Week start", "Week number".
- **Backend test command (BT)**, run from `appv3/backend` in Git Bash, using XAMPP's MariaDB:
  `DB_HOST=127.0.0.1 DB_SOCKET= DB_USERNAME=root DB_PASSWORD= php artisan test`
  Append `--filter=TemplateTest` to run just the new file.
- **Frontend test command (FT)**, run from `appv3/frontend`: `npx vitest run`

## Review Focus

1. **A 5–10 MB upload in Docker.**
   - Without a fix, nginx's default 1 MB limit and PHP's 2 MB limit reject it before Laravel runs, so the user sees a bare 413.
   - Expected: files up to 10 MB go through.
   - Fixed in Task 1 (nginx `client_max_body_size`, PHP ini), and checked there with a grep step.
2. **A file over 10 MB.**
   - Expected: the upload screen says so before the supervisor spends time correcting placeholders.
   - Task 7 adds a client-side size check, with a test.
3. **Rebuilding the containers.**
   - Expected: saved templates survive `docker compose up --build`.
   - Task 1 adds a named volume for `storage/app/private`.
4. **A 422 on save** (for example a cleared label, or content that doesn't match its extension).
   - Expected: the editor shows the server's field message, not only "Some details need attention".
   - Task 5 carries `errors` on `ApiError`, with a test; Task 7's `errorText` shows them, with a test.
5. **Replace-then-create failing** (the old template is already deleted).
   - Expected: the editor stays open with the file and the error shown, so pressing Save again restores it.
   - Task 7 has a test.
6. **Users with no placement, or no matching university, calling `/me/template` or `/templates/{id}/file`** (supervisors, mentors).
   - Expected: 404 or 403, never a 500.
   - Task 3 has a test.

---

## Task 0: Toolchain (no code)

The backend can't run on this machine yet: XAMPP ships PHP 8.2.12, there is no Docker, and `vendor/` and `node_modules/` are absent. **The user decides how to get PHP 8.4.** Either install Docker Desktop and use `docker compose`, or install a standalone PHP 8.4 for Windows. Ask them, and do not run any installer yourself.

- [ ] **Step 1: Frontend dependencies**

Run: `cd appv3/frontend && npm ci`
Expected: completes; `npx vitest run` passes on the untouched tree.

- [ ] **Step 2: Backend dependencies (after PHP 8.4 is available)**

Run: `cd appv3/backend && php -v && composer install`
Expected: `PHP 8.4.x` or newer; composer finishes. Needs these extensions: pdo_mysql, mbstring, intl, zip, fileinfo, bcmath.

- [ ] **Step 3: Test database in XAMPP MariaDB**

Start MySQL in the XAMPP control panel, then run:
`C:/xampp/mysql/bin/mysql -uroot -e "CREATE DATABASE IF NOT EXISTS test_logbook_testing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"`

- [ ] **Step 4: Baseline**

Run BT (from Global Constraints).
Expected: all existing tests (Auth, Journal, Review) pass. If they don't, stop and report — don't build on a red baseline.

---

## Task 1: Templates table, create/list/show, upload limits

**Files:**
- Create: `appv3/backend/database/migrations/2026_09_28_000001_create_logbook_templates_table.php`
- Create: `appv3/backend/app/Models/LogbookTemplate.php`
- Create: `appv3/backend/app/Http/Requests/TemplateRequest.php`
- Create: `appv3/backend/app/Http/Controllers/TemplateController.php`
- Modify: `appv3/backend/routes/portal.php` (inside the `api/v1` group)
- Modify: `appv3/docker/nginx/default.conf`, `appv3/docker/php/Dockerfile`, `appv3/compose.yaml`
- Test: `appv3/backend/tests/Feature/TemplateTest.php`

**Interfaces:**
- Produces:
  - `LogbookTemplate::keyFor(string $name): string` and `LogbookTemplate::forUniversity(?string $name): ?LogbookTemplate`.
  - On the controller: the private helpers `requireSupervisor(Request): User`, `assertUniversityFree(string $key, ?string $exceptId = null): void`, `fields(TemplateRequest, User): array`, `detail(LogbookTemplate): array` and `respond(LogbookTemplate, int): JsonResponse`.
  - JSON shapes:
    - list row: `{id, universityName, format, placeholderCount, studentCount, version, updatedAt}`;
    - detail: `{id, universityName, format, fileName, placeholders, pageRoles, unitStartBlock, version, updatedAt}`, with an `ETag` header of `"<version>"`.

- [ ] **Step 1: Write the failing tests**

`appv3/backend/tests/Feature/TemplateTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;
use ZipArchive;

class TemplateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    private function docx(string $name = 'taylors.docx'): UploadedFile
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'docx');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('word/document.xml', '<w:document/>');
        $zip->close();

        return new UploadedFile($path, $name, null, null, true);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function cellPlaceholders(): array
    {
        return [[
            'id' => 'ph-1',
            'label' => 'Tasks this week',
            'binding' => 'period',
            'source' => 'marker',
            'region' => 'unit',
            'anchor' => ['kind' => 'docx-cell', 'table' => [0], 'row' => 1, 'col' => 1],
        ]];
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $placeholders
     */
    private function createDocx(string $university = 'Universiti Teknologi Malaysia', ?array $placeholders = null): TestResponse
    {
        $this->be($this->user('supervisor-1'));

        return $this->portal('POST', '/api/v1/templates', [
            'file' => $this->docx(),
            'universityName' => $university,
            'placeholders' => json_encode($placeholders ?? $this->cellPlaceholders()),
            'unitStartBlock' => 0,
        ]);
    }

    public function test_supervisor_creates_a_docx_template(): void
    {
        $response = $this->createDocx();

        $response->assertCreated()
            ->assertHeader('ETag')
            ->assertJsonPath('universityName', 'Universiti Teknologi Malaysia')
            ->assertJsonPath('format', 'docx')
            ->assertJsonPath('placeholders.0.anchor.kind', 'docx-cell')
            ->assertJsonPath('unitStartBlock', 0);
        Storage::disk('local')->assertExists('templates/'.$response->json('id').'/original.docx');

        $this->portal('GET', '/api/v1/templates/'.$response->json('id'))
            ->assertOk()
            ->assertHeader('ETag', $response->headers->get('ETag'))
            ->assertJsonPath('fileName', 'taylors.docx');
    }

    public function test_supervisor_creates_a_pdf_template(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('POST', '/api/v1/templates', [
            'file' => UploadedFile::fake()->createWithContent('apu.pdf', "%PDF-1.4\n%%EOF"),
            'universityName' => 'Asia Pacific University',
            'placeholders' => json_encode([[
                'id' => 'ph-1', 'label' => 'Week', 'binding' => 'date', 'source' => 'label', 'region' => 'unit', 'dateRole' => 'number',
                'anchor' => ['kind' => 'pdf', 'page' => 0, 'x' => 72, 'y' => 700, 'w' => 120, 'h' => 14],
            ]]),
            'pageRoles' => json_encode(['unit']),
        ])->assertCreated()->assertJsonPath('pageRoles', ['unit']);
    }

    public function test_rejects_content_that_does_not_match_the_extension(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('POST', '/api/v1/templates', [
            'file' => UploadedFile::fake()->createWithContent('fake.pdf', 'just some text'),
            'universityName' => 'Asia Pacific University',
            'placeholders' => json_encode($this->cellPlaceholders()),
            'pageRoles' => json_encode(['unit']),
        ])->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_rejects_files_over_10_mb(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('POST', '/api/v1/templates', [
            'file' => UploadedFile::fake()->create('big.pdf', 10241),
            'universityName' => 'Asia Pacific University',
            'placeholders' => json_encode($this->cellPlaceholders()),
            'pageRoles' => json_encode(['unit']),
        ]);

        $response->assertUnprocessable();
        $this->assertStringContainsString('10240', implode(' ', $response->json('errors.file')));
    }

    public function test_duplicate_university_is_a_conflict_after_normalising_the_name(): void
    {
        $this->createDocx("Taylor's University")->assertCreated();

        $this->createDocx("  taylor's   UNIVERSITY ")
            ->assertStatus(409)
            ->assertJsonPath('code', 'UNIVERSITY_TAKEN');
    }

    public function test_rejects_malformed_placeholders(): void
    {
        $good = $this->cellPlaceholders()[0];
        $cases = [
            'bad binding' => [array_merge($good, ['binding' => 'secret'])],
            'cell anchor without row' => [array_merge($good, ['anchor' => ['kind' => 'docx-cell', 'table' => [0], 'col' => 1]])],
            'text anchor without end' => [array_merge($good, ['anchor' => ['kind' => 'docx-text', 'paragraph' => 3, 'start' => 0]])],
            'unknown key' => [array_merge($good, ['evil' => 'x'])],
            'empty label' => [array_merge($good, ['label' => ''])],
            'no unit placeholder' => [array_merge($good, ['region' => 'cover'])],
            'too many' => array_fill(0, 501, $good),
        ];

        foreach ($cases as $name => $placeholders) {
            $status = $this->createDocx("Uni {$name}", $placeholders)->status();
            $this->assertSame(422, $status, "case '{$name}' should be rejected");
        }
    }

    public function test_only_supervisors_manage_templates(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('POST', '/api/v1/templates', [
            'file' => $this->docx(),
            'universityName' => 'Universiti Teknologi Malaysia',
            'placeholders' => json_encode($this->cellPlaceholders()),
            'unitStartBlock' => 0,
        ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');

        $this->portal('GET', '/api/v1/templates')->assertForbidden();
    }

    public function test_list_counts_students_by_normalised_university(): void
    {
        $this->createDocx('  universiti teknologi MALAYSIA')->assertCreated();

        $this->portal('GET', '/api/v1/templates')
            ->assertOk()
            ->assertJsonPath('data.0.studentCount', 1)
            ->assertJsonPath('data.0.placeholderCount', 1)
            ->assertJsonStructure(['data' => [['id', 'universityName', 'format', 'version', 'updatedAt']]]);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: BT `--filter=TemplateTest`
Expected: FAIL, with 404s on `/api/v1/templates` (the route doesn't exist yet).

- [ ] **Step 3: Migration**

`appv3/backend/database/migrations/2026_09_28_000001_create_logbook_templates_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One university logbook template (Word or PDF) per university, with the
     * placeholder overlay the supervisor corrected in the browser.
     */
    public function up(): void
    {
        Schema::create('logbook_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('university_name', 200);
            $table->string('university_key', 200)->unique();
            $table->string('format', 8);
            $table->string('file_name');
            $table->string('file_path');
            $table->json('placeholders');
            $table->json('page_roles')->nullable();
            $table->unsignedInteger('unit_start_block')->nullable();
            $table->string('version', 64);
            $table->string('created_by');
            $table->foreign('created_by')->references('id')->on('users');
            $table->string('updated_by');
            $table->foreign('updated_by')->references('id')->on('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('logbook_templates');
    }
};
```

- [ ] **Step 4: Model**

`appv3/backend/app/Models/LogbookTemplate.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LogbookTemplate extends Model
{
    use HasUuids;

    protected $fillable = [
        'university_name',
        'university_key',
        'format',
        'file_name',
        'file_path',
        'placeholders',
        'page_roles',
        'unit_start_block',
        'version',
        'created_by',
        'updated_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'placeholders' => 'array',
            'page_roles' => 'array',
            'unit_start_block' => 'integer',
        ];
    }

    /**
     * Matching key for a university name: " Taylor's  University " and
     * "taylor's university" are the same university.
     */
    public static function keyFor(string $name): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', ' ', trim($name)));
    }

    public static function forUniversity(?string $name): ?self
    {
        if ($name === null || trim($name) === '') {
            return null;
        }

        return self::query()->where('university_key', self::keyFor($name))->first();
    }
}
```

- [ ] **Step 5: Form request (the trust boundary)**

`appv3/backend/app/Http/Requests/TemplateRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Models\LogbookTemplate;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use ZipArchive;

class TemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Multipart create sends the JSON parts as strings; decode them so both
     * create (multipart) and update (JSON) validate the same shape.
     */
    protected function prepareForValidation(): void
    {
        foreach (['placeholders', 'pageRoles'] as $key) {
            $value = $this->input($key);
            if (is_string($value)) {
                $this->merge([$key => json_decode($value, true)]);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $kind = 'placeholders.*.anchor.kind';

        return [
            'file' => [$this->isMethod('post') ? 'required' : 'prohibited', 'file', 'max:10240', 'extensions:docx,pdf'],
            'universityName' => ['required', 'string', 'max:200'],
            'placeholders' => ['required', 'array', 'max:500'],
            'placeholders.*' => ['array:id,label,binding,source,region,dayIndex,dayMode,dateRole,anchor'],
            'placeholders.*.id' => ['required', 'string', 'max:64'],
            'placeholders.*.label' => ['required', 'string', 'max:300'],
            'placeholders.*.binding' => ['required', Rule::in(['cover', 'daily', 'period', 'date', 'free', 'signature'])],
            'placeholders.*.source' => ['required', Rule::in(['marker', 'label', 'manual'])],
            'placeholders.*.region' => ['required', Rule::in(['cover', 'unit'])],
            'placeholders.*.dayIndex' => ['nullable', 'integer', 'between:0,31'],
            'placeholders.*.dayMode' => ['nullable', Rule::in(['weekday', 'nth'])],
            'placeholders.*.dateRole' => ['nullable', Rule::in(['day', 'start', 'end', 'range', 'number'])],
            'placeholders.*.anchor' => ['required', 'array:kind,page,x,y,w,h,whiteout,table,row,col,paragraph,start,end'],
            $kind => ['required', Rule::in(['pdf', 'docx-cell', 'docx-text'])],
            'placeholders.*.anchor.page' => ["required_if:{$kind},pdf", 'integer', 'min:0'],
            'placeholders.*.anchor.x' => ["required_if:{$kind},pdf", 'numeric'],
            'placeholders.*.anchor.y' => ["required_if:{$kind},pdf", 'numeric'],
            'placeholders.*.anchor.w' => ["required_if:{$kind},pdf", 'numeric', 'min:0'],
            'placeholders.*.anchor.h' => ["required_if:{$kind},pdf", 'numeric', 'min:0'],
            'placeholders.*.anchor.whiteout' => ['boolean'],
            'placeholders.*.anchor.table' => ["required_if:{$kind},docx-cell", 'array', 'min:1', 'max:2'],
            'placeholders.*.anchor.table.*' => ['integer', 'min:0'],
            'placeholders.*.anchor.row' => ["required_if:{$kind},docx-cell", 'integer', 'min:0'],
            'placeholders.*.anchor.col' => ["required_if:{$kind},docx-cell", 'integer', 'min:0'],
            'placeholders.*.anchor.paragraph' => ["required_if:{$kind},docx-text", 'integer', 'min:0'],
            'placeholders.*.anchor.start' => ["required_if:{$kind},docx-text", 'integer', 'min:0'],
            'placeholders.*.anchor.end' => ["required_if:{$kind},docx-text", 'integer', 'min:0'],
            'pageRoles' => ['nullable', 'array'],
            'pageRoles.*' => [Rule::in(['cover', 'unit', 'ignore'])],
            'unitStartBlock' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $placeholders = $this->input('placeholders');
            if (is_array($placeholders) && ! collect($placeholders)->contains(fn ($p) => is_array($p) && ($p['region'] ?? null) === 'unit')) {
                $validator->errors()->add('placeholders', 'Add at least one placeholder to the part that repeats every week.');
            }

            $file = $this->file('file');
            if ($file instanceof UploadedFile && ! self::contentMatches($file)) {
                $validator->errors()->add('file', 'This file is not a real .docx or .pdf. Upload the original logbook file.');
            }

            $format = $file instanceof UploadedFile
                ? strtolower($file->getClientOriginalExtension())
                : LogbookTemplate::query()->find($this->route('id'))?->format;
            if ($format === 'pdf' && ! in_array('unit', (array) $this->input('pageRoles'), true)) {
                $validator->errors()->add('pageRoles', 'Mark at least one page as "Repeats every week".');
            }
            if ($format === 'docx' && $this->input('unitStartBlock') === null) {
                $validator->errors()->add('unitStartBlock', 'Choose where the repeating part starts.');
            }
        }];
    }

    private static function contentMatches(UploadedFile $file): bool
    {
        $path = $file->getRealPath();
        if ($path === false) {
            return false;
        }

        if (strtolower($file->getClientOriginalExtension()) === 'pdf') {
            return file_get_contents($path, false, null, 0, 5) === '%PDF-';
        }

        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            return false;
        }
        $isWord = $zip->locateName('word/document.xml') !== false;
        $zip->close();

        return $isWord;
    }
}
```

- [ ] **Step 6: Controller (index, store, show)**

`appv3/backend/app/Http/Controllers/TemplateController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\TemplateRequest;
use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\User;
use App\Services\ConcurrencyService;
use App\Support\Problem;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class TemplateController extends Controller
{
    private function requireSupervisor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->isSupervisor()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only supervisors can manage logbook templates.');
        }

        return $user;
    }

    private function assertUniversityFree(string $key, ?string $exceptId = null): void
    {
        $taken = LogbookTemplate::query()
            ->where('university_key', $key)
            ->when($exceptId !== null, fn ($query) => $query->whereKeyNot($exceptId))
            ->exists();

        if ($taken) {
            Problem::throw(Response::HTTP_CONFLICT, 'UNIVERSITY_TAKEN', 'This university already has a template. Edit or replace that one instead.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function fields(TemplateRequest $request, User $user): array
    {
        $name = $request->string('universityName')->trim()->toString();
        $unitStartBlock = $request->validated('unitStartBlock');

        return [
            'university_name' => $name,
            'university_key' => LogbookTemplate::keyFor($name),
            'placeholders' => $request->validated('placeholders'),
            'page_roles' => $request->validated('pageRoles'),
            'unit_start_block' => $unitStartBlock === null ? null : (int) $unitStartBlock,
            'updated_by' => $user->id,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(LogbookTemplate $template): array
    {
        return [
            'id' => $template->id,
            'universityName' => $template->university_name,
            'format' => $template->format,
            'fileName' => $template->file_name,
            'placeholders' => $template->placeholders,
            'pageRoles' => $template->page_roles,
            'unitStartBlock' => $template->unit_start_block,
            'version' => $template->version,
            'updatedAt' => $template->updated_at?->toIso8601String(),
        ];
    }

    private function respond(LogbookTemplate $template, int $status = Response::HTTP_OK): JsonResponse
    {
        return response()
            ->json($this->detail($template), $status)
            ->header('ETag', ConcurrencyService::etagFor($template->version));
    }

    public function index(Request $request): JsonResponse
    {
        $this->requireSupervisor($request);

        // ponytail: normalises every placement's university in PHP; store a university_key on placements if this list gets slow.
        $students = Placement::query()
            ->pluck('university_name')
            ->countBy(fn (?string $name): string => LogbookTemplate::keyFor((string) $name));

        $data = LogbookTemplate::query()
            ->orderBy('university_name')
            ->get()
            ->map(fn (LogbookTemplate $template): array => [
                'id' => $template->id,
                'universityName' => $template->university_name,
                'format' => $template->format,
                'placeholderCount' => count($template->placeholders),
                'studentCount' => $students->get($template->university_key, 0),
                'version' => $template->version,
                'updatedAt' => $template->updated_at?->toIso8601String(),
            ])
            ->all();

        return response()->json(['data' => $data]);
    }

    public function store(TemplateRequest $request): JsonResponse
    {
        $user = $this->requireSupervisor($request);
        $fields = $this->fields($request, $user);
        $this->assertUniversityFree($fields['university_key']);

        /** @var UploadedFile $file */
        $file = $request->file('file');
        $format = strtolower($file->getClientOriginalExtension());
        $id = (string) Str::uuid();
        $file->storeAs("templates/{$id}", "original.{$format}", 'local');

        $template = new LogbookTemplate([
            ...$fields,
            'format' => $format,
            'file_name' => $file->getClientOriginalName(),
            'file_path' => "templates/{$id}/original.{$format}",
            'version' => 'v-1',
            'created_by' => $user->id,
        ]);
        $template->id = $id;

        try {
            $template->save();
        } catch (UniqueConstraintViolationException) {
            // Two supervisors created the same university at the same moment.
            Storage::disk('local')->deleteDirectory("templates/{$id}");
            $this->assertUniversityFree($fields['university_key']);
        }

        return $this->respond($template, Response::HTTP_CREATED);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->requireSupervisor($request);

        return $this->respond(LogbookTemplate::query()->findOrFail($id));
    }
}
```

- [ ] **Step 7: Routes**

In `appv3/backend/routes/portal.php`, add `use App\Http\Controllers\TemplateController;` to the imports. Add these lines inside the `Route::prefix('api/v1')` group, after the mentor routes:

```php
    Route::get('templates', [TemplateController::class, 'index'])->middleware('auth');
    Route::post('templates', [TemplateController::class, 'store'])->middleware('auth');
    Route::get('templates/{id}', [TemplateController::class, 'show'])->middleware('auth');
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: BT `--filter=TemplateTest`
Expected: PASS (8 tests).

- [ ] **Step 9: Docker upload limits and file persistence**

In `appv3/docker/nginx/default.conf`, inside `server { … }` after `index index.html;`:

```nginx
    # Logbook templates can be up to 10 MB (Laravel enforces the real limit).
    client_max_body_size 12m;
```

In `appv3/docker/php/Dockerfile`, directly after the `docker-php-ext-install` RUN block:

```dockerfile
# Logbook template uploads are up to 10 MB (Laravel enforces the real limit).
RUN printf 'upload_max_filesize=12M\npost_max_size=13M\n' > /usr/local/etc/php/conf.d/uploads.ini
```

In `appv3/compose.yaml`, give the `app` service a volume (after its `environment:` block), and declare the volume at the bottom:

```yaml
    volumes:
      - template-files:/var/www/storage/app/private
```

```yaml
volumes:
  db-data:
  template-files:
```

Check that the private disk root matches:
- Run: `grep -n "storage_path('app/private')" appv3/backend/config/filesystems.php`. Expected: one match for the `local` disk.
- If there is no match, change the mount target to the root that `local` uses.

- [ ] **Step 10: Lint and commit**

Run: `cd appv3/backend && ./vendor/bin/pint && ./vendor/bin/phpstan analyse --no-progress --memory-limit=1G`
Expected: pint fixes style only; phpstan reports no errors.

```bash
git add appv3/backend appv3/docker appv3/compose.yaml
git commit -m "feat(templates): store university logbook templates with validated placeholders"
```

---

## Task 2: Update and delete with If-Match

**Files:**
- Modify: `appv3/backend/app/Services/ConcurrencyService.php` (the `assertMatch` signature)
- Modify: `appv3/backend/app/Http/Controllers/TemplateController.php` (add `requireIfMatch`, `update`, `destroy`)
- Modify: `appv3/backend/routes/portal.php`
- Test: `appv3/backend/tests/Feature/TemplateTest.php`

**Interfaces:**
- Consumes (Task 1): `requireSupervisor`, `assertUniversityFree`, `fields`, `respond`, `LogbookTemplate`.
- Produces: `PUT /api/v1/templates/{id}` (JSON body, like create but without `file`) and `DELETE /api/v1/templates/{id}` → 204.

- [ ] **Step 1: Write the failing tests** (append to `TemplateTest`, and add `use App\Models\LogbookTemplate;` at the top)

```php
    public function test_update_requires_a_current_if_match(): void
    {
        $created = $this->createDocx();
        $id = $created->json('id');
        $etag = (string) $created->headers->get('ETag');
        $body = ['universityName' => 'Universiti Teknologi Malaysia', 'placeholders' => $this->cellPlaceholders(), 'unitStartBlock' => 2];

        $this->portal('PUT', "/api/v1/templates/{$id}", $body)->assertStatus(428);
        $this->portal('PUT', "/api/v1/templates/{$id}", $body, ['If-Match' => '"stale"'])->assertStatus(412);

        $updated = $this->portal('PUT', "/api/v1/templates/{$id}", $body, ['If-Match' => $etag]);
        $updated->assertOk()->assertJsonPath('unitStartBlock', 2);
        $this->assertNotSame($etag, $updated->headers->get('ETag'));
    }

    public function test_renaming_onto_another_university_is_a_conflict(): void
    {
        $a = $this->createDocx('University A');
        $this->createDocx('University B')->assertCreated();

        $this->portal('PUT', '/api/v1/templates/'.$a->json('id'), [
            'universityName' => 'university  b',
            'placeholders' => $this->cellPlaceholders(),
            'unitStartBlock' => 0,
        ], ['If-Match' => (string) $a->headers->get('ETag')])->assertStatus(409)->assertJsonPath('code', 'UNIVERSITY_TAKEN');
    }

    public function test_delete_requires_if_match_and_removes_the_file(): void
    {
        $created = $this->createDocx();
        $id = $created->json('id');

        $this->portal('DELETE', "/api/v1/templates/{$id}")->assertStatus(428);
        $this->portal('DELETE', "/api/v1/templates/{$id}", [], ['If-Match' => (string) $created->headers->get('ETag')])->assertNoContent();

        Storage::disk('local')->assertMissing("templates/{$id}/original.docx");
        $this->assertNull(LogbookTemplate::query()->find($id));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: BT `--filter=TemplateTest`
Expected: the 3 new tests FAIL with 405/404 (no PUT/DELETE route yet); the 8 from Task 1 still pass.

- [ ] **Step 3: Let `assertMatch` accept templates**

In `appv3/backend/app/Services/ConcurrencyService.php`:
- add `use App\Models\LogbookTemplate;`;
- change the signature and its first line:

```php
    public static function assertMatch(Week|LogbookTemplate $model, ?string $ifMatch, ?string $bodyVersion = null): void
    {
        $current = $model->version;
```

(The rest of the method body is unchanged.)

- [ ] **Step 4: Controller methods**

Add these to `TemplateController`. Also add `use Illuminate\Http\Response as HttpResponse;` and `use Illuminate\Support\Facades\DB;` to the imports.

```php
    private function requireIfMatch(Request $request): void
    {
        if (ConcurrencyService::normalize($request->header('If-Match')) === null) {
            Problem::throw(Response::HTTP_PRECONDITION_REQUIRED, 'PRECONDITION_REQUIRED', 'Reload the template and try again.');
        }
    }

    public function update(TemplateRequest $request, string $id): JsonResponse
    {
        $user = $this->requireSupervisor($request);
        $this->requireIfMatch($request);
        $fields = $this->fields($request, $user);

        $template = DB::transaction(function () use ($request, $id, $fields): LogbookTemplate {
            $locked = LogbookTemplate::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'));
            $this->assertUniversityFree($fields['university_key'], $locked->id);

            $locked->fill([...$fields, 'version' => ConcurrencyService::bump($locked->version)])->save();

            return $locked;
        });

        return $this->respond($template);
    }

    public function destroy(Request $request, string $id): HttpResponse
    {
        $this->requireSupervisor($request);
        $this->requireIfMatch($request);

        $template = LogbookTemplate::query()->findOrFail($id);
        ConcurrencyService::assertMatch($template, $request->header('If-Match'));
        $template->delete();
        Storage::disk('local')->deleteDirectory("templates/{$template->id}");

        return response()->noContent();
    }
```

- [ ] **Step 5: Routes** (after the Task 1 template routes)

```php
    Route::put('templates/{id}', [TemplateController::class, 'update'])->middleware('auth');
    Route::delete('templates/{id}', [TemplateController::class, 'destroy'])->middleware('auth');
```

- [ ] **Step 6: Run to verify they pass**

Run: BT `--filter=TemplateTest` → PASS (11). Then run all of BT → PASS, which confirms the `assertMatch` change didn't break journal/review.

- [ ] **Step 7: Lint and commit**

Run: `./vendor/bin/pint && ./vendor/bin/phpstan analyse --no-progress --memory-limit=1G`

```bash
git add appv3/backend
git commit -m "feat(templates): update and delete templates with If-Match"
```

---

## Task 3: Template file download and the student's own template

**Files:**
- Modify: `appv3/backend/app/Http/Controllers/TemplateController.php` (add `file`, `mine`)
- Modify: `appv3/backend/routes/portal.php`
- Test: `appv3/backend/tests/Feature/TemplateTest.php`

**Interfaces:**
- Consumes: `LogbookTemplate::forUniversity`, `detail`, `User::placement()`.
- Produces:
  - `GET /api/v1/templates/{id}/file` streams the original file.
  - `GET /api/v1/me/template` returns the detail plus `fileUrl: "/api/v1/templates/{id}/file"`. Part 2 uses it.

- [ ] **Step 1: Write the failing tests** (append to `TemplateTest`)

```php
    public function test_file_is_served_to_supervisors_and_matching_students_only(): void
    {
        $id = $this->createDocx()->json('id');

        $this->portal('GET', "/api/v1/templates/{$id}/file")->assertOk();

        $this->be($this->user('student-1'));
        $this->portal('GET', "/api/v1/templates/{$id}/file")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        $this->be($this->user('student-3'));
        $this->portal('GET', "/api/v1/templates/{$id}/file")->assertForbidden();

        $this->be($this->user('mentor-1'));
        $this->portal('GET', "/api/v1/templates/{$id}/file")->assertForbidden();
    }

    public function test_me_template_matches_the_students_university(): void
    {
        $id = $this->createDocx()->json('id');

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/me/template')
            ->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('id', $id)
            ->assertJsonPath('fileUrl', "/api/v1/templates/{$id}/file");

        $this->be($this->user('student-3'));
        $this->portal('GET', '/api/v1/me/template')->assertNotFound();

        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/me/template')->assertNotFound();
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: BT `--filter=TemplateTest`
Expected: the 2 new tests FAIL with 404 on the file route.

- [ ] **Step 3: Controller methods**

Add `use Symfony\Component\HttpFoundation\StreamedResponse;` to the imports.

```php
    public function file(Request $request, string $id): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $template = LogbookTemplate::query()->findOrFail($id);

        if (! $user->isSupervisor() && LogbookTemplate::forUniversity($user->placement?->university_name)?->id !== $template->id) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'This template belongs to another university.');
        }

        return Storage::disk('local')->download($template->file_path, $template->file_name, [
            'Content-Type' => $template->format === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]);
    }

    public function mine(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $template = LogbookTemplate::forUniversity($user->placement?->university_name);

        if ($template === null) {
            Problem::throw(Response::HTTP_NOT_FOUND, 'NOT_FOUND', 'Your university has no logbook template yet. Ask your supervisor.');
        }

        return response()
            ->json([...$this->detail($template), 'fileUrl' => "/api/v1/templates/{$template->id}/file"])
            ->header('ETag', ConcurrencyService::etagFor($template->version));
    }
```

- [ ] **Step 4: Routes** (put `me/template` next to the other `me/*` routes; put the file route after the Task 2 routes)

```php
    Route::get('me/template', [TemplateController::class, 'mine'])->middleware('auth');
```

```php
    Route::get('templates/{id}/file', [TemplateController::class, 'file'])->middleware('auth');
```

- [ ] **Step 5: Run to verify they pass**

Run: BT → all PASS (13 in `TemplateTest`, plus the existing suites).

- [ ] **Step 6: Lint and commit**

Run: `./vendor/bin/pint && ./vendor/bin/phpstan analyse --no-progress --memory-limit=1G`

```bash
git add appv3/backend
git commit -m "feat(templates): serve template files and the student's own template"
```

---

## Task 4: Copy the detection core into appv3

**Files:**
- Create (copied verbatim): under `appv3/frontend/src/features/templates/core/`:
  - `model.ts`, `ids.ts` and `template.ts`;
  - `detect/{labels,markers,docx,pdf}.ts`;
  - `docx/xml.ts`;
  - `pdf/text.ts`.
- Create (copied, imports rewritten): `core/__tests__/{detect-docx,detect-pdf,markers,template,xml}.test.ts`
- Create: `core/__tests__/pdfWorker.ts`
- Create (copied): `core/fixtures/{apu,pmu,taylors}.{docx,pdf}` and `core/fixtures/pmu_extra.docx`
- Modify: `appv3/frontend/package.json` and `package-lock.json` (dependencies)

**Interfaces:**
- Produces (used by Tasks 6–7, exact prototype signatures):
  - from `template.ts`:
    - `detectFromFile(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Detected>`;
    - `validateTemplate(t: Template): string[]`;
    - `normalizeUniversity(name: string): string`;
    - `class UserError extends Error`.
  - from `detect/docx.ts`:
    - `readDocxXml(bytes)` and `docxContext(xml): DocxContext`, where `DocxContext` has `paraTexts: string[]`;
    - `regionOfDocxAnchor(ctx, anchor, unitStartBlock): 'cover' | 'unit'`;
    - `blockIndexOfTable(ctx, ti): number | null` and `tableIndexAtBlock(ctx, bi): number | null`.
  - `newId(prefix)` from `ids.ts`.
  - The types `Anchor`, `DocxAnchor`, `PdfAnchor`, `Placeholder`, `PageRole`, `Binding`, `DateRole`, `DayMode`, `Format` and `Template` from `model.ts`.

- [ ] **Step 1: Add dependencies**

Run: `cd appv3/frontend && npm install jszip pdfjs-dist@4.10.38 pdf-lib docx-preview`
Expected: all four are in `dependencies`, and `pdfjs-dist` is exactly `4.10.38`. Pin it by editing `package.json` to `"pdfjs-dist": "4.10.38"` if npm wrote `^4.10.38`, then run `npm install` again.

- [ ] **Step 2: Copy the core, tests and fixtures** (Git Bash, from `appv3/frontend`)

```bash
P=../../../intern-logbook
C=src/features/templates/core
mkdir -p $C/detect $C/docx $C/pdf $C/__tests__ $C/fixtures
cp $P/src/core/model.ts $P/src/core/ids.ts $P/src/core/template.ts $C/
cp $P/src/core/detect/labels.ts $P/src/core/detect/markers.ts $P/src/core/detect/docx.ts $P/src/core/detect/pdf.ts $C/detect/
cp $P/src/core/docx/xml.ts $C/docx/
cp $P/src/core/pdf/text.ts $C/pdf/
cp $P/tests/unit/detect-docx.test.ts $P/tests/unit/detect-pdf.test.ts $P/tests/unit/markers.test.ts $P/tests/unit/template.test.ts $P/tests/unit/xml.test.ts $C/__tests__/
cp $P/tests/fixtures/apu.docx $P/tests/fixtures/apu.pdf $P/tests/fixtures/pmu.docx $P/tests/fixtures/pmu.pdf $P/tests/fixtures/pmu_extra.docx $P/tests/fixtures/taylors.docx $P/tests/fixtures/taylors.pdf $C/fixtures/
sed -i "s#'\.\./\.\./src/core/#'../#g" $C/__tests__/*.test.ts
sed -i "1i import './pdfWorker';" $C/__tests__/detect-pdf.test.ts $C/__tests__/template.test.ts
sed -i '1i // @vitest-environment node' $C/__tests__/*.test.ts
```

The fixture URLs (`new URL('../fixtures/…', import.meta.url)`) already resolve to `core/fixtures/`, so no rewrite is needed.

- [ ] **Step 3: pdf.js worker for Node tests**

`appv3/frontend/src/features/templates/core/__tests__/pdfWorker.ts` (the prototype's `tests/unit/setup.ts`, scoped to the two PDF test files):

```ts
// pdf.js needs to know where its worker module is, even in Node, where it
// runs the worker in-process ("fake worker").
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href
```

- [ ] **Step 4: Confirm the core stays pure and only what's needed came over**

Run: `grep -rn "from 'react\|from 'vue\|autofill\|periods\|workflow" src/features/templates/core --include=*.ts`
Expected: no output. (If `template.ts` or a detector imported `autofill`, `periods` or `workflow`, stop and copy that module too.)

- [ ] **Step 5: Run the ported tests**

Run: FT `src/features/templates/core`
Expected: all PASS, with the same counts as the prototype's detect-docx, detect-pdf, markers, template and xml suites.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: clean. If a lint rule fires in a copied file, fix it with the smallest in-place edit, and make the same edit in `../intern-logbook/src/core` so the two copies don't drift.

- [ ] **Step 7: Commit**

```bash
git add appv3/frontend/package.json appv3/frontend/package-lock.json appv3/frontend/src/features/templates/core
git commit -m "feat(templates): bring the prototype's placeholder detection core into appv3"
```

---

## Task 5: API client, contract, mocks

**Files:**
- Modify: `appv3/frontend/src/api/client.ts` (FormData bodies, raw byte responses)
- Modify: `appv3/frontend/src/api/errors.ts` (carry 422 field errors)
- Test: `appv3/frontend/src/api/client.test.ts`, `appv3/frontend/src/api/errors.test.ts` (append)
- Create: `appv3/frontend/src/features/templates/api.ts`
- Modify: `appv3/frontend/openapi/portal.yaml`, `appv3/frontend/scripts/openapi-lint.mjs`, `appv3/frontend/src/api/generated.d.ts` (regenerated)
- Modify: `appv3/frontend/src/mocks/handlers.ts`

**Interfaces:**
- Produces:
  - `RequestOptions.raw?: boolean`: resolves `data` as an `ArrayBuffer`.
  - `ApiError.errors?: Record<string, string[]>`.
  - From `features/templates/api.ts`:
    - `TemplateSummary` = `{ id, universityName, format: 'docx' | 'pdf', placeholderCount, studentCount, version, updatedAt: string | null }`;
    - `TemplateDetail` = `{ id, universityName, format, fileName, placeholders: Placeholder[], pageRoles: PageRole[] | null, unitStartBlock: number | null, version, updatedAt }`;
    - `TemplateInput` = `{ universityName: string; placeholders: Placeholder[]; pageRoles?: PageRole[]; unitStartBlock?: number }`;
    - the functions `listTemplates()`, `getTemplate(id)`, `getTemplateFile(id): Promise<ArrayBuffer>`, `createTemplate(file: File, input)`, `updateTemplate(id, version, input)` and `deleteTemplate(id, version)`;
    - `errorText(e: unknown): string`.

- [ ] **Step 1: Write the failing client and error tests**

Append to `appv3/frontend/src/api/client.test.ts` (add `vi` to its vitest import if it's missing):

```ts
describe('apiRequest bodies', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends FormData as multipart, without a JSON content type', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.append('universityName', 'APU')

    await apiRequest('/api/v1/templates', { method: 'POST', body: form })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe(form)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('returns raw bytes when asked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })))

    const res = await apiRequest<ArrayBuffer>('/api/v1/templates/t/file', { raw: true })

    expect(res.data.byteLength).toBe(3)
  })
})
```

Append to `appv3/frontend/src/api/errors.test.ts`:

```ts
it('keeps 422 field messages so forms can show them', () => {
  const error = toApiError(422, { code: 'VALIDATION_FAILED', errors: { file: ['This file is not a real .docx or .pdf.'] } })
  expect(error.errors).toEqual({ file: ['This file is not a real .docx or .pdf.'] })
  expect(toApiError(500, { errors: { x: ['y'] } }).errors).toBeUndefined()
})
```

(Match these files' existing imports: `apiRequest` from `./client`, `toApiError` from `./errors`, plus `afterEach`, `describe`, `expect`, `it`, `vi` from `vitest`.)

- [ ] **Step 2: Run to verify they fail**

Run: FT `src/api`
Expected: the 3 new tests FAIL: the body is a JSON string, `raw` is ignored, and `errors` is undefined.

- [ ] **Step 3: Client changes**

In `appv3/frontend/src/api/client.ts`:
- Add to `RequestOptions`:

```ts
  /** Resolve the body as bytes instead of JSON (file downloads). */
  raw?: boolean
```

- In `apiRequest`, replace the Content-Type line with:

```ts
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
```

- Replace the `body:` line of the `fetch` call with:

```ts
        body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
```

- Replace `const payload = await parseBody(response)` with:

```ts
      const payload = options.raw && response.ok ? await response.arrayBuffer() : await parseBody(response)
```

In `appv3/frontend/src/api/errors.ts`:
- Add `readonly errors?: Record<string, string[]>` to `ApiError`.
- Add `errors?: Record<string, string[]>` to its constructor's `init` type, and assign `this.errors = init.errors` in the constructor.
- Add `errors?: unknown` to `ProblemPayload`.
- In `toApiError`, pass the errors into `new ApiError({ … })`:

```ts
    errors: status === 422 && problem.errors && typeof problem.errors === 'object' ? (problem.errors as Record<string, string[]>) : undefined,
```

- [ ] **Step 4: Run to verify they pass**

Run: FT `src/api` → PASS.

- [ ] **Step 5: Templates API module**

`appv3/frontend/src/features/templates/api.ts`:

```ts
import { z } from 'zod'
import { API_PREFIX, apiRequest } from '../../api/client'
import { ApiError, formatErrorForDisplay } from '../../api/errors'
import type { PageRole, Placeholder } from './core/model'
import { UserError } from './core/template'

const format = z.enum(['docx', 'pdf'])

const summarySchema = z.object({
  id: z.string(),
  universityName: z.string(),
  format,
  placeholderCount: z.number(),
  studentCount: z.number(),
  version: z.string(),
  updatedAt: z.string().nullable(),
})
export type TemplateSummary = z.infer<typeof summarySchema>

// Placeholders are validated field by field on the server; here we only check the envelope.
const detailSchema = z.object({
  id: z.string(),
  universityName: z.string(),
  format,
  fileName: z.string(),
  placeholders: z.array(z.custom<Placeholder>((value) => typeof value === 'object' && value !== null)),
  pageRoles: z.array(z.enum(['cover', 'unit', 'ignore'])).nullable(),
  unitStartBlock: z.number().nullable(),
  version: z.string(),
  updatedAt: z.string().nullable(),
})
export type TemplateDetail = z.infer<typeof detailSchema>

export interface TemplateInput {
  universityName: string
  placeholders: Placeholder[]
  pageRoles?: PageRole[]
  unitStartBlock?: number
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error('The server returned an unexpected response. Please try again.')
  return result.data
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const res = await apiRequest<unknown>(`${API_PREFIX}/templates`)
  return parse(z.object({ data: z.array(summarySchema) }), res.data).data
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  return parse(detailSchema, (await apiRequest<unknown>(`${API_PREFIX}/templates/${id}`)).data)
}

export async function getTemplateFile(id: string): Promise<ArrayBuffer> {
  return (await apiRequest<ArrayBuffer>(`${API_PREFIX}/templates/${id}/file`, { raw: true })).data
}

export async function createTemplate(file: File, input: TemplateInput): Promise<TemplateDetail> {
  const form = new FormData()
  form.append('file', file)
  form.append('universityName', input.universityName)
  form.append('placeholders', JSON.stringify(input.placeholders))
  if (input.pageRoles) form.append('pageRoles', JSON.stringify(input.pageRoles))
  if (input.unitStartBlock != null) form.append('unitStartBlock', String(input.unitStartBlock))
  return parse(detailSchema, (await apiRequest<unknown>(`${API_PREFIX}/templates`, { method: 'POST', body: form })).data)
}

export async function updateTemplate(id: string, version: string, input: TemplateInput): Promise<TemplateDetail> {
  const res = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}`, {
    method: 'PUT',
    ifMatch: `"${version}"`,
    body: { ...input, pageRoles: input.pageRoles ?? null, unitStartBlock: input.unitStartBlock ?? null },
  })
  return parse(detailSchema, res.data)
}

export async function deleteTemplate(id: string, version: string): Promise<void> {
  await apiRequest<unknown>(`${API_PREFIX}/templates/${id}`, { method: 'DELETE', ifMatch: `"${version}"` })
}

/** A message for the person: server field messages, or a detection error written for users. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return [formatErrorForDisplay(e), ...Object.values(e.errors ?? {}).flat()].join(' ')
  if (e instanceof UserError) return e.message
  return formatErrorForDisplay(e)
}
```

- [ ] **Step 6: OpenAPI contract**

In `appv3/frontend/openapi/portal.yaml`, add these paths directly before the `components:` line:

```yaml
  /templates:
    get:
      tags: [templates]
      summary: University logbook templates (supervisor)
      operationId: listTemplates
      responses:
        '200':
          description: Every university template
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TemplateList'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
    post:
      tags: [templates]
      summary: Upload a university template with its corrected placeholders
      operationId: createTemplate
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              $ref: '#/components/schemas/TemplateCreate'
      responses:
        '201':
          description: Created template
          headers:
            ETag:
              $ref: '#/components/headers/ETag'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Template'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '422':
          $ref: '#/components/responses/Unprocessable'
  /templates/{templateId}:
    get:
      tags: [templates]
      summary: One template (without the file)
      operationId: getTemplate
      parameters:
        - $ref: '#/components/parameters/TemplateId'
      responses:
        '200':
          description: Template
          headers:
            ETag:
              $ref: '#/components/headers/ETag'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Template'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
    put:
      tags: [templates]
      summary: Save corrected placeholders (If-Match required)
      operationId: updateTemplate
      parameters:
        - $ref: '#/components/parameters/TemplateId'
        - $ref: '#/components/parameters/IfMatchRequired'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TemplateUpdate'
      responses:
        '200':
          description: Updated template
          headers:
            ETag:
              $ref: '#/components/headers/ETag'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Template'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          $ref: '#/components/responses/Conflict'
        '412':
          $ref: '#/components/responses/PreconditionFailed'
        '422':
          $ref: '#/components/responses/Unprocessable'
        '428':
          $ref: '#/components/responses/PreconditionRequired'
    delete:
      tags: [templates]
      summary: Delete a template and its file (If-Match required)
      operationId: deleteTemplate
      parameters:
        - $ref: '#/components/parameters/TemplateId'
        - $ref: '#/components/parameters/IfMatchRequired'
      responses:
        '204':
          description: Deleted
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '412':
          $ref: '#/components/responses/PreconditionFailed'
        '428':
          $ref: '#/components/responses/PreconditionRequired'
  /templates/{templateId}/file:
    get:
      tags: [templates]
      summary: The original uploaded file (supervisors, or students of that university)
      operationId: getTemplateFile
      parameters:
        - $ref: '#/components/parameters/TemplateId'
      responses:
        '200':
          description: The .docx or .pdf file
          content:
            application/pdf:
              schema:
                type: string
                format: binary
            application/vnd.openxmlformats-officedocument.wordprocessingml.document:
              schema:
                type: string
                format: binary
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
  /me/template:
    get:
      tags: [student]
      summary: The template for the student's placement university
      operationId: getMyTemplate
      responses:
        '200':
          description: Template plus a file URL
          headers:
            ETag:
              $ref: '#/components/headers/ETag'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MyTemplate'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
```

Under `components.parameters`:

```yaml
    TemplateId:
      name: templateId
      in: path
      required: true
      schema:
        type: string
    IfMatchRequired:
      name: If-Match
      in: header
      required: true
      description: Version from the last GET/list; missing is 428, stale is 412.
      schema:
        type: string
```

Under `components.responses`:

```yaml
    PreconditionRequired:
      description: If-Match missing (428) — a client bug.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
```

Under `components.schemas`:

```yaml
    Placeholder:
      type: object
      required: [id, label, binding, source, region, anchor]
      properties:
        id:
          type: string
          maxLength: 64
        label:
          type: string
          maxLength: 300
        binding:
          type: string
          enum: [cover, daily, period, date, free, signature]
        source:
          type: string
          enum: [marker, label, manual]
        region:
          type: string
          enum: [cover, unit]
        dayIndex:
          type: integer
          minimum: 0
          maximum: 31
        dayMode:
          type: string
          enum: [weekday, nth]
        dateRole:
          type: string
          enum: [day, start, end, range, number]
        anchor:
          type: object
          required: [kind]
          description: 'pdf: page,x,y,w,h,whiteout? — docx-cell: table[1-2],row,col — docx-text: paragraph,start,end'
          properties:
            kind:
              type: string
              enum: [pdf, docx-cell, docx-text]
          additionalProperties: true
    TemplateSummary:
      type: object
      required: [id, universityName, format, placeholderCount, studentCount, version, updatedAt]
      properties:
        id:
          type: string
        universityName:
          type: string
        format:
          type: string
          enum: [docx, pdf]
        placeholderCount:
          type: integer
        studentCount:
          type: integer
        version:
          type: string
        updatedAt:
          type: string
          nullable: true
    TemplateList:
      type: object
      required: [data]
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/TemplateSummary'
    Template:
      type: object
      required: [id, universityName, format, fileName, placeholders, pageRoles, unitStartBlock, version, updatedAt]
      properties:
        id:
          type: string
        universityName:
          type: string
        format:
          type: string
          enum: [docx, pdf]
        fileName:
          type: string
        placeholders:
          type: array
          maxItems: 500
          items:
            $ref: '#/components/schemas/Placeholder'
        pageRoles:
          type: array
          nullable: true
          items:
            type: string
            enum: [cover, unit, ignore]
        unitStartBlock:
          type: integer
          nullable: true
        version:
          type: string
        updatedAt:
          type: string
          nullable: true
    MyTemplate:
      allOf:
        - $ref: '#/components/schemas/Template'
        - type: object
          required: [fileUrl]
          properties:
            fileUrl:
              type: string
    TemplateUpdate:
      type: object
      required: [universityName, placeholders]
      properties:
        universityName:
          type: string
          maxLength: 200
        placeholders:
          type: array
          maxItems: 500
          items:
            $ref: '#/components/schemas/Placeholder'
        pageRoles:
          type: array
          nullable: true
          items:
            type: string
            enum: [cover, unit, ignore]
        unitStartBlock:
          type: integer
          nullable: true
    TemplateCreate:
      type: object
      required: [file, universityName, placeholders]
      properties:
        file:
          type: string
          format: binary
          description: .docx or .pdf, at most 10 MB, content must match the extension.
        universityName:
          type: string
          maxLength: 200
        placeholders:
          type: string
          description: JSON-encoded Placeholder[].
        pageRoles:
          type: string
          description: JSON-encoded PageRole[] (PDF only).
        unitStartBlock:
          type: integer
          description: Word only.
```

(Match the file's existing `nullable` style. If it uses OpenAPI 3.1 `type: [string, 'null']` instead, use that form.)

In `appv3/frontend/scripts/openapi-lint.mjs`, add `'/templates:'`, `'/templates/{templateId}:'`, `'/templates/{templateId}/file:'` and `'/me/template:'` to `requiredPaths`, and add `'Template:'` to the schema list.

Run: `npm run openapi:types && npm run openapi:lint`
Expected: `generated.d.ts` is rewritten; the lint prints `openapi lint ok: 22 paths…`.

- [ ] **Step 7: MSW dev handlers**

In `appv3/frontend/src/mocks/handlers.ts`, add this at the top of `createHandlers`, after `seenIdempotency`:

```ts
  // Dev-only template store (VITE_ENABLE_MSW). Mirrors /templates in openapi/portal.yaml.
  const templates = new Map<string, { detail: Record<string, unknown> & { universityName: string; version: string; placeholders: unknown[] }; file: ArrayBuffer }>()
  const universityKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()
  const ifMatchOf = (request: Request) => request.headers.get('If-Match')?.replace(/^W\//, '').replace(/"/g, '')
```

Then add these entries to the returned handler array:

```ts
    http.get('*/api/v1/templates', () =>
      HttpResponse.json({
        data: [...templates.values()].map(({ detail }) => ({
          id: detail.id, universityName: detail.universityName, format: detail.format, placeholderCount: detail.placeholders.length,
          studentCount: 0, version: detail.version, updatedAt: detail.updatedAt,
        })),
      }),
    ),
    http.post('*/api/v1/templates', async ({ request }) => {
      const form = await request.formData()
      const file = form.get('file') as File
      const universityName = String(form.get('universityName') ?? '')
      if ([...templates.values()].some(({ detail }) => universityKey(detail.universityName) === universityKey(universityName))) {
        return problem(409, 'UNIVERSITY_TAKEN', 'This university already has a template.')
      }
      const id = `tpl-${templates.size + 1}-${Date.now()}`
      const detail = {
        id, universityName, format: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx', fileName: file.name,
        placeholders: JSON.parse(String(form.get('placeholders') ?? '[]')) as unknown[],
        pageRoles: form.has('pageRoles') ? JSON.parse(String(form.get('pageRoles'))) : null,
        unitStartBlock: form.has('unitStartBlock') ? Number(form.get('unitStartBlock')) : null,
        version: 'v-1', updatedAt: new Date().toISOString(),
      }
      templates.set(id, { detail, file: await file.arrayBuffer() })
      return HttpResponse.json(detail, { status: 201, headers: { ETag: '"v-1"' } })
    }),
    http.get('*/api/v1/templates/:id', ({ params }) => {
      const found = templates.get(String(params.id))
      return found ? HttpResponse.json(found.detail, { headers: { ETag: `"${found.detail.version}"` } }) : problem(404, 'NOT_FOUND', 'Not found')
    }),
    http.get('*/api/v1/templates/:id/file', ({ params }) => {
      const found = templates.get(String(params.id))
      return found ? new HttpResponse(found.file) : problem(404, 'NOT_FOUND', 'Not found')
    }),
    http.put('*/api/v1/templates/:id', async ({ params, request }) => {
      const found = templates.get(String(params.id))
      if (!found) return problem(404, 'NOT_FOUND', 'Not found')
      const ifMatch = ifMatchOf(request)
      if (!ifMatch) return problem(428, 'PRECONDITION_REQUIRED', 'Reload the template and try again.')
      if (ifMatch !== found.detail.version) return problem(412, 'STALE_VERSION', 'This item changed elsewhere.')
      const body = (await request.json()) as Record<string, unknown>
      const version = `v-${Number(found.detail.version.split('-')[1]) + 1}`
      found.detail = { ...found.detail, ...body, universityName: String(body.universityName), placeholders: body.placeholders as unknown[], version, updatedAt: new Date().toISOString() }
      return HttpResponse.json(found.detail, { headers: { ETag: `"${version}"` } })
    }),
    http.delete('*/api/v1/templates/:id', ({ params, request }) => {
      const found = templates.get(String(params.id))
      if (!found) return problem(404, 'NOT_FOUND', 'Not found')
      const ifMatch = ifMatchOf(request)
      if (!ifMatch) return problem(428, 'PRECONDITION_REQUIRED', 'Reload the template and try again.')
      if (ifMatch !== found.detail.version) return problem(412, 'STALE_VERSION', 'This item changed elsewhere.')
      templates.delete(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
```

(`/templates/:id/file` must come before any catch-all; MSW matches the literal `/file` segment, so the order among these handlers doesn't matter.)

- [ ] **Step 8: Full frontend check**

Run: FT, then `npm run lint`, then `npx tsc -b`
Expected: all green, including the existing `contract.test.ts` and `contract-integration.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add appv3/frontend
git commit -m "feat(templates): API client, OpenAPI contract and dev mocks for templates"
```

---

## Task 6: `ask()` dialog, the React overlay and inspector, styles

**Files:**
- Create: `appv3/frontend/src/components/ask.ts`
- Create: under `appv3/frontend/src/features/templates/overlay/`:
  - `bindingColors.ts`, `docxAnchors.ts` and `pdfjs.ts`;
  - `PlaceholderBox.tsx`, `PdfPageLayer.tsx`, `DocxLayer.tsx`, `TemplateOverlay.tsx` and `PlaceholderInspector.tsx`.
- Create: `appv3/frontend/src/features/templates/templates.css`
- Test: `appv3/frontend/src/features/templates/overlay/PlaceholderInspector.test.tsx`

**Interfaces:**
- Consumes (Task 4): the `model.ts` types; `docxContext`, `readDocxXml` and `tableIndexAtBlock` from `core/detect/docx`.
- Produces:
  - `ask(message: string, okLabel?: string): Promise<boolean>`.
  - `BINDING_META: Record<Binding, { label: string; color: string }>`.
  - `<TemplateOverlay>`, with props:
    - `template: OverlayTemplate`, where `OverlayTemplate` = `{ format; fileBytes; placeholders; pageRoles?; unitStartBlock? }`;
    - `selectedId: string | null`, `adding: boolean`, `pickingUnit: boolean`;
    - `onSelect(id)`, `onUpdate(ph)`, `onAdd(anchor)`, `onResolved(missingIds)`, `onPickTable(tableIndex)` and `onPageRole(page, role)`.
  - `<PlaceholderInspector ph unresolved onUpdate onRemove />`.

- [ ] **Step 1: Write the failing inspector test**

`appv3/frontend/src/features/templates/overlay/PlaceholderInspector.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Placeholder } from '../core/model'
import { PlaceholderInspector } from './PlaceholderInspector'

const ph: Placeholder = { id: 'ph-1', label: 'Monday', binding: 'daily', dayIndex: 0, source: 'label', region: 'unit', anchor: { kind: 'docx-cell', table: [1], row: 1, col: 1 } }

describe('PlaceholderInspector', () => {
  it('switching to Date defaults the date role from the day index', () => {
    const onUpdate = vi.fn()
    render(<PlaceholderInspector ph={ph} unresolved={false} onUpdate={onUpdate} onRemove={() => {}} />)
    fireEvent.change(screen.getByTestId('insp-binding'), { target: { value: 'date' } })
    expect(onUpdate).toHaveBeenCalledWith({ ...ph, binding: 'date', dateRole: 'day' })
  })

  it('day number is 1-based on screen, 0-based in data, and capped at 31', () => {
    const onUpdate = vi.fn()
    render(<PlaceholderInspector ph={ph} unresolved={false} onUpdate={onUpdate} onRemove={() => {}} />)
    fireEvent.change(screen.getByTestId('insp-dayindex'), { target: { value: '3' } })
    expect(onUpdate).toHaveBeenLastCalledWith({ ...ph, dayIndex: 2 })
    fireEvent.change(screen.getByTestId('insp-dayindex'), { target: { value: '99' } })
    expect(onUpdate).toHaveBeenLastCalledWith({ ...ph, dayIndex: 31 })
  })

  it('warns when the placeholder cannot be shown on the page', () => {
    render(<PlaceholderInspector ph={ph} unresolved onUpdate={() => {}} onRemove={() => {}} />)
    expect(screen.getByText(/Can't show this one on the page/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: FT `src/features/templates/overlay`
Expected: FAIL, "Cannot find module './PlaceholderInspector'".

- [ ] **Step 3: `ask()`, colours, anchors, pdf.js**

`appv3/frontend/src/components/ask.ts`:

```ts
/**
 * In-page replacement for window.confirm(). Embedded browsers (e.g. app preview panes) often block
 * native dialogs, making confirm() return false instantly — which silently cancels every action.
 */
export function ask(message: string, okLabel = 'OK'): Promise<boolean> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog')
    d.className = 'ask-dialog'
    const p = document.createElement('p')
    p.textContent = message
    const row = document.createElement('div')
    row.className = 'ask-row'
    const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancel', className: 'button secondary' })
    const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: okLabel, className: 'button primary' })
    ok.dataset.testid = 'ask-ok'
    row.append(cancel, ok)
    d.append(p, row)
    document.body.append(d)
    const done = (v: boolean) => {
      d.close()
      d.remove()
      resolve(v)
    }
    cancel.onclick = () => done(false)
    ok.onclick = () => done(true)
    d.addEventListener('cancel', () => done(false)) // Esc key
    d.showModal()
    ok.focus()
  })
}
```

`overlay/bindingColors.ts` and `overlay/docxAnchors.ts`: copy them from the prototype, then fix the imports and the weekly wording:

```bash
cd appv3/frontend
cp ../../../intern-logbook/src/components/overlay/bindingColors.ts ../../../intern-logbook/src/components/overlay/docxAnchors.ts src/features/templates/overlay/
sed -i "s#'\.\./\.\./core/model'#'../core/model'#" src/features/templates/overlay/bindingColors.ts src/features/templates/overlay/docxAnchors.ts
sed -i "s#label: 'Period answer'#label: 'Weekly answer'#" src/features/templates/overlay/bindingColors.ts
```

`overlay/pdfjs.ts`:

```ts
/// <reference types="vite/client" />
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// Detection (core/pdf/text.ts) also relies on this: the editor imports the overlay before detecting.
GlobalWorkerOptions.workerSrc = workerUrl

export function openPdf(bytes: ArrayBuffer) {
  return getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise
}

export type PdfDoc = Awaited<ReturnType<typeof openPdf>>
```

- [ ] **Step 4: `PlaceholderBox.tsx`**

```tsx
import { useState, type PointerEvent } from 'react'

export interface Box { left: number; top: number; width: number; height: number }
export interface Delta { dx: number; dy: number; dw: number; dh: number }

/** One highlight on the document. Editable boxes (PDF) drag to move and resize from the corner. */
export function PlaceholderBox({ id, box, color, label, selected, dashed, pinned, editable, onSelect, onChange }: {
  id: string; box: Box; color: string; label: string; selected: boolean; dashed: boolean; pinned: boolean; editable: boolean
  onSelect: () => void; onChange?: (d: Delta) => void
}) {
  const [drag, setDrag] = useState<{ kind: 'move' | 'resize'; sx: number; sy: number; dx: number; dy: number } | null>(null)
  const mv = drag?.kind === 'move' ? drag : null
  const rs = drag?.kind === 'resize' ? drag : null

  const start = (kind: 'move' | 'resize', e: PointerEvent<HTMLElement>) => {
    onSelect()
    if (!editable) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 })
  }
  const move = (e: PointerEvent) => {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.sx, dy: e.clientY - drag.sy })
  }
  const end = () => {
    setDrag(null)
    if (!drag || (drag.dx === 0 && drag.dy === 0)) return
    onChange?.(drag.kind === 'move' ? { dx: drag.dx, dy: drag.dy, dw: 0, dh: 0 } : { dx: 0, dy: 0, dw: drag.dx, dh: drag.dy })
  }

  return (
    <div
      className={`ph-box${selected ? ' selected' : ''}`}
      data-testid="ph-box"
      data-id={id}
      title={label}
      style={{
        left: box.left + (mv?.dx ?? 0),
        top: box.top + (mv?.dy ?? 0),
        width: Math.max(4, box.width + (rs?.dx ?? 0)),
        height: Math.max(4, box.height + (rs?.dy ?? 0)),
        borderColor: color,
        borderStyle: dashed ? 'dashed' : 'solid',
        background: `${color}${selected ? '33' : '14'}`,
      }}
      onPointerDown={(e) => start('move', e)}
      onPointerMove={move}
      onPointerUp={end}
    >
      <span className="ph-tag" style={{ background: color }}>{pinned ? '✎ ' : ''}{label}</span>
      {editable && selected ? <span className="ph-resize" onPointerDown={(e) => start('resize', e)} onPointerMove={move} onPointerUp={end} /> : null}
    </div>
  )
}
```

- [ ] **Step 5: `PdfPageLayer.tsx`**

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PdfAnchor, Placeholder } from '../core/model'
import { BINDING_META } from './bindingColors'
import { PlaceholderBox, type Delta } from './PlaceholderBox'
import type { PdfDoc } from './pdfjs'

/** One rendered PDF page with draggable boxes; drag on empty space to draw a new one when adding. */
export function PdfPageLayer({ pdf, pageIndex, scale, placeholders, selectedId, adding, onSelect, onUpdate, onAdd }: {
  pdf: PdfDoc; pageIndex: number; scale: number; placeholders: Placeholder[]; selectedId: string | null; adding: boolean
  onSelect: (id: string) => void; onUpdate: (ph: Placeholder) => void; onAdd: (a: PdfAnchor) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<number[]>([0, 0, 612, 792])
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel(): void } | null = null
    void pdf.getPage(pageIndex + 1).then((page) => {
      const c = canvas.current
      if (cancelled || !c) return
      setView(page.view)
      const vp = page.getViewport({ scale })
      c.width = Math.ceil(vp.width)
      c.height = Math.ceil(vp.height)
      const render = page.render({ canvasContext: c.getContext('2d')!, viewport: vp })
      task = render
      render.promise.catch(() => { /* superseded by a newer render */ })
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageIndex, scale])

  const s = scale
  const box = (a: PdfAnchor) => ({ left: (a.x - view[0]) * s, top: (view[3] - a.y - a.h) * s, width: a.w * s, height: a.h * s })
  const change = (ph: Placeholder, d: Delta) => {
    const a = ph.anchor as PdfAnchor
    const h = Math.max(4, a.h + d.dh / s)
    // Origin is bottom-left: moving down or growing downward lowers y.
    onUpdate({ ...ph, anchor: { ...a, x: a.x + d.dx / s, y: a.y - d.dy / s - (h - a.h), w: Math.max(4, a.w + d.dw / s), h } })
  }

  const pos = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!adding) return
    const p = pos(e)
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!draft) return
    const p = pos(e)
    setDraft({ ...draft, x1: p.x, y1: p.y })
  }
  const up = () => {
    const d = draft
    setDraft(null)
    if (!d) return
    const l = Math.min(d.x0, d.x1)
    const t = Math.min(d.y0, d.y1)
    const w = Math.abs(d.x1 - d.x0)
    const h = Math.abs(d.y1 - d.y0)
    if (w < 6 || h < 6) return
    onAdd({ kind: 'pdf', page: pageIndex, x: view[0] + l / s, y: view[3] - (t + h) / s, w: w / s, h: h / s })
  }

  const width = (view[2] - view[0]) * s
  const height = (view[3] - view[1]) * s
  return (
    <div className="pdf-page" data-testid="pdf-page" data-index={pageIndex} style={{ width, height }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <canvas ref={canvas} className="pdf-canvas" style={{ width, height }} />
      {placeholders.map((ph) => (
        <PlaceholderBox
          key={ph.id}
          id={ph.id}
          box={box(ph.anchor as PdfAnchor)}
          color={BINDING_META[ph.binding].color}
          label={ph.label}
          selected={ph.id === selectedId}
          dashed={ph.source === 'label'}
          pinned={ph.source === 'manual'}
          editable={!adding}
          onSelect={() => onSelect(ph.id)}
          onChange={(d) => change(ph, d)}
        />
      ))}
      {draft ? (
        <div className="draw-box" style={{ left: Math.min(draft.x0, draft.x1), top: Math.min(draft.y0, draft.y1), width: Math.abs(draft.x1 - draft.x0), height: Math.abs(draft.y1 - draft.y0) }} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: `DocxLayer.tsx`**

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { renderAsync } from 'docx-preview'
import type { DocxAnchor, Placeholder } from '../core/model'
import { BINDING_META } from './bindingColors'
import { anchorAtParagraphEnd, anchorFromCell, anchorFromSelection, indexDocxDom, resolveAnchor, topTableIndexOf, type DocxDomIndex } from './docxAnchors'
import { PlaceholderBox, type Box } from './PlaceholderBox'

/** The Word file rendered by docx-preview with fixed highlight boxes; click a cell or select text to add. */
export function DocxLayer({ bytes, paraTexts, placeholders, selectedId, adding, pickingUnit, unitTableIndex, onSelect, onAdd, onResolved, onPickTable }: {
  bytes: ArrayBuffer; paraTexts: string[]; placeholders: Placeholder[]; selectedId: string | null; adding: boolean; pickingUnit: boolean
  unitTableIndex: number | null; onSelect: (id: string) => void; onAdd: (a: DocxAnchor) => void; onResolved: (missing: string[]) => void
  onPickTable: (tableIndex: number) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const doc = useRef<HTMLDivElement>(null)
  const index = useRef<DocxDomIndex | null>(null)
  const [rendered, setRendered] = useState(0)
  const [resized, setResized] = useState(0)
  const [boxes, setBoxes] = useState<{ ph: Placeholder; box: Box }[]>([])
  const [unitLineTop, setUnitLineTop] = useState<number | null>(null)

  useEffect(() => {
    const el = doc.current
    if (!el) return
    let cancelled = false
    index.current = null
    el.innerHTML = ''
    void renderAsync(new Blob([bytes]), el, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true })
      .then(() => {
        if (cancelled) return
        index.current = indexDocxDom(el, paraTexts)
        setRendered((n) => n + 1)
      })
    return () => {
      cancelled = true
    }
  }, [bytes, paraTexts])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const observer = new ResizeObserver(() => setResized((n) => n + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const ix = index.current
    if (!ix || !host.current || !doc.current) return
    const origin = host.current.getBoundingClientRect()
    const out: { ph: Placeholder; box: Box }[] = []
    const missing: string[] = []
    for (const ph of placeholders) {
      const r = resolveAnchor(ix, ph.anchor as DocxAnchor)
      if (!r) {
        missing.push(ph.id)
        continue
      }
      const rect = r.rect()
      out.push({ ph, box: { left: rect.left - origin.left, top: rect.top - origin.top, width: Math.max(rect.width, 10), height: Math.max(rect.height, 14) } })
    }
    setBoxes(out)
    onResolved(missing)
    const table = unitTableIndex != null ? ix.tables[unitTableIndex] : null
    const first = doc.current.querySelector('section.docx article')
    setUnitLineTop(table ? table.getBoundingClientRect().top - origin.top - 4 : first ? first.getBoundingClientRect().top - origin.top : null)
  }, [placeholders, unitTableIndex, rendered, resized, onResolved])

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const ix = index.current
    if (!ix) return
    const target = e.target as HTMLElement
    if (pickingUnit) {
      const ti = topTableIndexOf(ix, target)
      if (ti != null) onPickTable(ti)
      return
    }
    if (!adding) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      const a = anchorFromSelection(ix, sel)
      sel.removeAllRanges()
      if (a) {
        onAdd(a)
        return
      }
    }
    const td = target.closest('td')
    if (td) {
      const a = anchorFromCell(ix, td)
      if (a) onAdd(a)
      return
    }
    const p = target.closest('p')
    if (p) {
      const a = anchorAtParagraphEnd(ix, p)
      if (a) onAdd(a)
    }
  }

  return (
    <div ref={host} className={`docx-host${pickingUnit ? ' picking' : ''}${adding ? ' adding' : ''}`} onClick={onClick}>
      <div ref={doc} />
      {unitLineTop != null ? <div className="unit-line" style={{ top: unitLineTop }}><span>Repeats every week ↓</span></div> : null}
      {boxes.map(({ ph, box }) => (
        <PlaceholderBox
          key={ph.id}
          id={ph.id}
          box={box}
          color={BINDING_META[ph.binding].color}
          label={ph.label}
          selected={ph.id === selectedId}
          dashed={ph.source === 'label'}
          pinned={ph.source === 'manual'}
          editable={false}
          onSelect={() => onSelect(ph.id)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 7: `TemplateOverlay.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Anchor, Format, PageRole, Placeholder } from '../core/model'
import { docxContext, readDocxXml, tableIndexAtBlock, type DocxContext } from '../core/detect/docx'
import { DocxLayer } from './DocxLayer'
import { PdfPageLayer } from './PdfPageLayer'
import { openPdf, type PdfDoc } from './pdfjs'

export interface OverlayTemplate { format: Format; fileBytes: ArrayBuffer; placeholders: Placeholder[]; pageRoles?: PageRole[]; unitStartBlock?: number }

const SCALE = 1.3

/** The uploaded document with every placeholder highlighted. Edit mode only; part 2 adds fill mode. */
export function TemplateOverlay({ template, selectedId, adding, pickingUnit, onSelect, onUpdate, onAdd, onResolved, onPickTable, onPageRole }: {
  template: OverlayTemplate; selectedId: string | null; adding: boolean; pickingUnit: boolean
  onSelect: (id: string) => void; onUpdate: (ph: Placeholder) => void; onAdd: (a: Anchor) => void
  onResolved: (missing: string[]) => void; onPickTable: (tableIndex: number) => void; onPageRole: (page: number, role: PageRole) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PdfDoc | null>(null)
  const [ctx, setCtx] = useState<DocxContext | null>(null)
  const [loadError, setLoadError] = useState('')
  const { format, fileBytes, placeholders } = template

  useEffect(() => {
    let cancelled = false
    setPdf(null)
    setCtx(null)
    setLoadError('')
    const load = format === 'pdf'
      ? openPdf(fileBytes).then((d) => { if (!cancelled) setPdf(d) })
      : readDocxXml(fileBytes).then((xml) => { if (!cancelled) setCtx(docxContext(xml)) })
    load.catch((e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)) })
    return () => {
      cancelled = true
    }
  }, [format, fileBytes])

  useEffect(() => {
    // 'nearest' so selecting a box already on screen doesn't scroll it out from under the pointer.
    if (selectedId) root.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const byPage = useMemo(() => {
    const m = new Map<number, Placeholder[]>()
    for (const ph of placeholders) if (ph.anchor.kind === 'pdf') m.set(ph.anchor.page, [...(m.get(ph.anchor.page) ?? []), ph])
    return m
  }, [placeholders])
  const unitTableIndex = ctx ? tableIndexAtBlock(ctx, template.unitStartBlock ?? 0) : null

  return (
    <div ref={root} className={`overlay${adding ? ' adding' : ''}`}>
      {loadError ? <p className="banner error" role="alert">Couldn't show this file: {loadError}</p> : null}
      {format === 'pdf' && pdf
        ? Array.from({ length: pdf.numPages }, (_, i) => (
            <div key={i} className="page-wrap">
              <div className="page-head">
                <span>Page {i + 1}</span>
                <select aria-label={`Page ${i + 1} role`} data-testid={`page-role-${i}`} value={template.pageRoles?.[i] ?? 'unit'} onChange={(e) => onPageRole(i, e.target.value as PageRole)}>
                  <option value="cover">Cover (filled once)</option>
                  <option value="unit">Repeats every week</option>
                  <option value="ignore">Ignore</option>
                </select>
              </div>
              <PdfPageLayer pdf={pdf} pageIndex={i} scale={SCALE} placeholders={byPage.get(i) ?? []} selectedId={selectedId} adding={adding} onSelect={onSelect} onUpdate={onUpdate} onAdd={onAdd} />
            </div>
          ))
        : null}
      {format === 'docx' && ctx ? (
        <DocxLayer
          bytes={fileBytes}
          paraTexts={ctx.paraTexts}
          placeholders={placeholders}
          selectedId={selectedId}
          adding={adding}
          pickingUnit={pickingUnit}
          unitTableIndex={unitTableIndex}
          onSelect={onSelect}
          onAdd={onAdd}
          onResolved={onResolved}
          onPickTable={onPickTable}
        />
      ) : null}
      {!loadError && !pdf && !ctx ? <p className="muted">Loading document…</p> : null}
    </div>
  )
}
```

- [ ] **Step 8: `PlaceholderInspector.tsx`**

```tsx
import type { Binding, DateRole, DayMode, Placeholder } from '../core/model'
import { BINDING_META } from './bindingColors'

const DATE_ROLES: [DateRole, string][] = [['day', 'That day'], ['start', 'Week start'], ['end', 'Week end'], ['range', 'Start – end'], ['number', 'Week number']]
const SOURCE_TEXT = { marker: 'a marker in the file', label: 'a label in the file', manual: 'you' } as const

export function PlaceholderInspector({ ph, unresolved, onUpdate, onRemove }: {
  ph: Placeholder; unresolved: boolean; onUpdate: (ph: Placeholder) => void; onRemove: () => void
}) {
  const set = (patch: Partial<Placeholder>) => onUpdate({ ...ph, ...patch })
  const onBinding = (binding: Binding) =>
    set(binding === 'date' && !ph.dateRole ? { binding, dateRole: ph.dayIndex != null ? 'day' : 'range' } : { binding })
  const showDay = ph.binding === 'daily' || (ph.binding === 'date' && (ph.dateRole ?? 'day') === 'day')

  return (
    <section className="card inspector" aria-label="Placeholder">
      <h3>Placeholder</h3>
      {unresolved ? <p className="banner">Can't show this one on the page. Delete it and add it again manually.</p> : null}
      <label>Label<input data-testid="insp-label" value={ph.label} maxLength={300} onChange={(e) => set({ label: e.target.value })} /></label>
      <label>Filled with
        <select data-testid="insp-binding" value={ph.binding} onChange={(e) => onBinding(e.target.value as Binding)}>
          {Object.entries(BINDING_META).map(([b, m]) => <option key={b} value={b}>{m.label}</option>)}
        </select>
      </label>
      {ph.binding === 'date' ? (
        <label>Shows
          <select data-testid="insp-daterole" value={ph.dateRole ?? (ph.dayIndex != null ? 'day' : 'range')} onChange={(e) => set({ dateRole: e.target.value as DateRole })}>
            {DATE_ROLES.map(([r, t]) => <option key={r} value={r}>{t}</option>)}
          </select>
        </label>
      ) : null}
      {showDay ? (
        <>
          <label>Day number
            <input
              data-testid="insp-dayindex"
              type="number"
              min={1}
              max={32}
              value={ph.dayIndex != null ? ph.dayIndex + 1 : ''}
              onChange={(e) => set({ dayIndex: e.target.value === '' ? undefined : Math.min(31, Math.max(0, Number(e.target.value) - 1)) })}
            />
          </label>
          <label>Counting
            <select value={ph.dayMode ?? 'nth'} onChange={(e) => set({ dayMode: e.target.value as DayMode })}>
              <option value="nth">Nth working day of the week</option>
              <option value="weekday">Weekday (1 = Monday)</option>
            </select>
          </label>
        </>
      ) : null}
      <p className="muted">Part: {ph.region === 'cover' ? 'Cover (filled once)' : 'Repeats every week'} · Found by {SOURCE_TEXT[ph.source]}</p>
      <button type="button" className="button danger" data-testid="insp-delete" onClick={onRemove}>Delete placeholder</button>
    </section>
  )
}
```

- [ ] **Step 9: Styles**

`appv3/frontend/src/features/templates/templates.css` (the prototype's overlay rules, on appv3 tokens):

```css
.template-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: 12px; }
.template-toolbar label, .template-upload label, .inspector label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: var(--text-sm); }
.template-toolbar .spacer { flex: 1; }
.tool-group { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.tool-group .button[aria-pressed='true'] { border-color: var(--brand-teal); background: var(--brand-ice); }
.button.danger { background: var(--status-danger-ink); }
.muted { color: var(--muted); font-size: var(--text-sm); }
.banner { padding: 8px 12px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--status-warning) 14%, transparent); border: 1px solid var(--status-warning); margin: 0 0 12px; }
.banner.error { background: color-mix(in srgb, var(--status-danger) 10%, transparent); border-color: var(--status-danger); }
.row-actions { display: flex; gap: 8px; justify-content: flex-end; }

.editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
@media (max-width: 900px) { .editor-grid { grid-template-columns: minmax(0, 1fr); } }
.editor-side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 32px); overflow: auto; }
.editor-side .card + .card { margin-top: 0; }
.doc-pane { overflow: auto; padding: 16px; border-radius: var(--radius-md); background: var(--neutral-bg); }
.ph-list { display: flex; flex-direction: column; gap: 4px; }
.ph-item { display: flex; gap: 8px; align-items: center; text-align: left; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; }
.ph-item[aria-pressed='true'] { border-color: var(--brand-teal); background: var(--brand-ice); }
.ph-item .ph-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-item small { color: var(--muted); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; display: inline-block; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: var(--text-xs); }
.legend span { display: flex; gap: 4px; align-items: center; }

.overlay { display: flex; flex-direction: column; gap: 16px; align-items: center; }
.page-wrap { display: flex; flex-direction: column; gap: 6px; }
.page-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; font-size: var(--text-sm); }
.pdf-page { position: relative; background: #fff; box-shadow: 0 1px 4px #0003; touch-action: none; }
.pdf-canvas { display: block; }
.adding .pdf-page { cursor: crosshair; }
.adding .ph-box { pointer-events: none; }
.ph-box { position: absolute; border: 2px solid; border-radius: 2px; cursor: move; }
.ph-box.selected { outline: 2px solid var(--brand-teal); outline-offset: 1px; z-index: 2; }
.ph-tag { position: absolute; left: -2px; top: -17px; display: none; max-width: 240px; padding: 0 4px; overflow: hidden; border-radius: 3px 3px 0 0; color: #fff; font-size: 10px; line-height: 15px; white-space: nowrap; text-overflow: ellipsis; }
.ph-box.selected .ph-tag, .ph-box:hover .ph-tag { display: block; }
.ph-resize { position: absolute; right: -5px; bottom: -5px; width: 10px; height: 10px; background: var(--brand-teal); cursor: nwse-resize; }
.draw-box { position: absolute; border: 2px dashed var(--brand-teal); background: color-mix(in srgb, var(--brand-teal) 10%, transparent); pointer-events: none; }
.docx-host { position: relative; color: #000; }
.docx-host.adding, .docx-host.picking { cursor: crosshair; }
.docx-host.adding .ph-box, .docx-host.picking .ph-box { pointer-events: none; }
.unit-line { position: absolute; left: 0; right: 0; border-top: 2px dashed #9333ea; pointer-events: none; }
.unit-line span { position: absolute; right: 8px; top: -18px; padding: 0 6px; border-radius: 3px; background: #9333ea; color: #fff; font-size: 11px; }

.ask-dialog { max-width: 420px; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
.ask-dialog::backdrop { background: color-mix(in srgb, var(--brand-dark) 40%, transparent); }
.ask-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
```

- [ ] **Step 10: Run tests, typecheck, lint**

Run: FT `src/features/templates`, then `npx tsc -b && npm run lint`
Expected: the inspector tests (3) and the core tests PASS; tsc and lint are clean. If `page.render` or `getViewport` typing complains, keep the prototype's runtime behaviour and narrow the type with a local cast at that one line.

- [ ] **Step 11: Commit**

```bash
git add appv3/frontend/src/components/ask.ts appv3/frontend/src/features/templates
git commit -m "feat(templates): React placeholder overlay, inspector and ask dialog"
```

---

## Task 7: Supervisor pages, routes and navigation

**Files:**
- Create: `appv3/frontend/src/features/templates/TemplatesPage.tsx`
- Create: `appv3/frontend/src/features/templates/TemplateEditorPage.tsx`
- Modify: `appv3/frontend/src/App.tsx` (lazy routes under `RequireSupervisor`)
- Modify: `appv3/frontend/src/components/AppShell.tsx` (the Templates nav link)
- Test: `appv3/frontend/src/features/templates/TemplatesPage.test.tsx`, `appv3/frontend/src/features/templates/TemplateEditorPage.test.tsx`

**Interfaces:**
- Consumes (Task 5): `listTemplates`, `getTemplate`, `getTemplateFile`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `errorText` and `TemplateSummary`. From Task 6: `TemplateOverlay`, `PlaceholderInspector`, `BINDING_META` and `ask`. From Task 4: `detectFromFile`, `validateTemplate`, `normalizeUniversity`, `regionOfDocxAnchor`, `blockIndexOfTable`, `docxContext`, `readDocxXml` and `newId`.
- Produces: the routes `/supervisor/templates`, `/supervisor/templates/new` and `/supervisor/templates/:id`.

- [ ] **Step 1: Write the failing list-page test**

`appv3/frontend/src/features/templates/TemplatesPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createQueryClient } from '../../queryClient'
import { ask } from '../../components/ask'
import { deleteTemplate, listTemplates } from './api'
import { TemplatesPage } from './TemplatesPage'

vi.mock('../../components/ask', () => ({ ask: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  listTemplates: vi.fn(),
  deleteTemplate: vi.fn(),
}))

const row = { id: 'tpl-1', universityName: "Taylor's University", format: 'docx' as const, placeholderCount: 42, studentCount: 2, version: 'v-3', updatedAt: '2026-09-28T10:00:00+08:00' }

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter><TemplatesPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.mocked(listTemplates).mockResolvedValue([row])
    vi.mocked(deleteTemplate).mockResolvedValue()
  })

  it('lists templates with their counts and an edit link', async () => {
    renderPage()
    expect(await screen.findByText("Taylor's University")).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/supervisor/templates/tpl-1')
  })

  it('asks before deleting, warns about students, and sends the row version', async () => {
    vi.mocked(ask).mockResolvedValue(true)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith('tpl-1', 'v-3'))
    expect(vi.mocked(ask).mock.calls[0][0]).toMatch(/2 student/)
  })

  it('does nothing when the supervisor cancels', async () => {
    vi.mocked(ask).mockResolvedValue(false)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(ask).toHaveBeenCalled())
    expect(deleteTemplate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Write the failing editor test**

`appv3/frontend/src/features/templates/TemplateEditorPage.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createQueryClient } from '../../queryClient'
import { ApiError } from '../../api/errors'
import { ask } from '../../components/ask'
import { createTemplate, deleteTemplate, getTemplate, getTemplateFile, listTemplates, updateTemplate } from './api'
import { TemplateEditorPage } from './TemplateEditorPage'

vi.mock('./overlay/TemplateOverlay', () => ({ TemplateOverlay: () => <div data-testid="overlay" /> }))
vi.mock('../../components/ask', () => ({ ask: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  getTemplateFile: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}))

const taylors = readFileSync(new URL('./core/fixtures/taylors.docx', import.meta.url))
const taylorsBuffer = () => taylors.buffer.slice(taylors.byteOffset, taylors.byteOffset + taylors.byteLength) as ArrayBuffer

function taylorsFile(): File {
  const file = new File([taylors], 'taylors.docx')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => taylorsBuffer() })
  return file
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/supervisor/templates" element={<p>Templates list</p>} />
          <Route path="/supervisor/templates/new" element={<TemplateEditorPage />} />
          <Route path="/supervisor/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function detectTaylors() {
  renderAt('/supervisor/templates/new')
  fireEvent.change(screen.getByTestId('university-input'), { target: { value: "Taylor's University" } })
  fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [taylorsFile()] } })
  fireEvent.click(screen.getByTestId('detect-btn'))
  await screen.findByTestId('save-template')
}

const saved = { id: 'tpl-9', universityName: "Taylor's University", format: 'docx' as const, fileName: 'taylors.docx', placeholders: [], pageRoles: null, unitStartBlock: 0, version: 'v-1', updatedAt: null }

describe('TemplateEditorPage', () => {
  beforeEach(() => {
    vi.mocked(listTemplates).mockResolvedValue([])
    vi.mocked(createTemplate).mockResolvedValue(saved)
    vi.mocked(deleteTemplate).mockResolvedValue()
  })

  it('refuses files over 10 MB before detecting', async () => {
    renderAt('/supervisor/templates/new')
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [big] } })
    fireEvent.click(screen.getByTestId('detect-btn'))
    expect(await screen.findByText(/over 10 MB/)).toBeInTheDocument()
  })

  it('detects placeholders in the browser, then POSTs the file with them', async () => {
    await detectTaylors()
    expect(screen.getAllByTestId('ph-item').length).toBeGreaterThan(5)
    fireEvent.click(screen.getByTestId('save-template'))
    await waitFor(() => expect(createTemplate).toHaveBeenCalledTimes(1))
    const [file, input] = vi.mocked(createTemplate).mock.calls[0]
    expect(file.name).toBe('taylors.docx')
    expect(input.universityName).toBe("Taylor's University")
    expect(input.unitStartBlock).toEqual(expect.any(Number))
    expect(input.placeholders.some((p) => p.region === 'unit')).toBe(true)
    expect(await screen.findByText('Templates list')).toBeInTheDocument()
  })

  it('offers to replace an existing template for the same university', async () => {
    vi.mocked(listTemplates).mockResolvedValue([{ id: 'tpl-1', universityName: "  taylor's university", format: 'pdf', placeholderCount: 3, studentCount: 1, version: 'v-4', updatedAt: null }])
    vi.mocked(ask).mockResolvedValue(true)
    await detectTaylors()
    fireEvent.click(screen.getByTestId('save-template'))
    await waitFor(() => expect(createTemplate).toHaveBeenCalled())
    expect(vi.mocked(ask).mock.calls[0][0]).toMatch(/already exists\. Replace it\?/)
    expect(deleteTemplate).toHaveBeenCalledWith('tpl-1', 'v-4')
  })

  it('keeps the editor open with the error when create fails after replacing', async () => {
    vi.mocked(listTemplates).mockResolvedValue([{ id: 'tpl-1', universityName: "Taylor's University", format: 'docx', placeholderCount: 3, studentCount: 1, version: 'v-4', updatedAt: null }])
    vi.mocked(ask).mockResolvedValue(true)
    vi.mocked(createTemplate).mockRejectedValue(new ApiError({ code: 'VALIDATION_FAILED', status: 422, message: 'Some details need attention before saving.', errors: { file: ['This file is not a real .docx or .pdf.'] } }))
    await detectTaylors()
    fireEvent.click(screen.getByTestId('save-template'))
    expect(await screen.findByText(/not a real \.docx/)).toBeInTheDocument()
    expect(screen.getByTestId('save-template')).toBeEnabled()
  })

  it('on a stale save, offers to load the newer version', async () => {
    vi.mocked(getTemplate).mockResolvedValue({
      ...saved, id: 'tpl-1', version: 'v-2',
      placeholders: [{ id: 'ph-1', label: 'Tasks', binding: 'period', source: 'marker', region: 'unit', anchor: { kind: 'docx-cell', table: [0], row: 0, col: 0 } }],
    })
    vi.mocked(getTemplateFile).mockImplementation(async () => taylorsBuffer())
    vi.mocked(updateTemplate).mockRejectedValue(new ApiError({ code: 'STALE_VERSION', status: 412, message: 'This item changed elsewhere. Compare and retry.' }))
    vi.mocked(ask).mockResolvedValue(true)
    renderAt('/supervisor/templates/tpl-1')
    fireEvent.click(await screen.findByTestId('save-template'))
    await waitFor(() => expect(updateTemplate).toHaveBeenCalledWith('tpl-1', 'v-2', expect.objectContaining({ unitStartBlock: 0 })))
    await waitFor(() => expect(getTemplate).toHaveBeenCalledTimes(2))
    expect(vi.mocked(ask).mock.calls[0][0]).toMatch(/Load their version\?/)
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: FT `src/features/templates`
Expected: FAIL, "Cannot find module './TemplatesPage'" and "Cannot find module './TemplateEditorPage'".

- [ ] **Step 4: `TemplatesPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeading } from '../../components/PageHeading'
import { ask } from '../../components/ask'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { deleteTemplate, errorText, listTemplates, type TemplateSummary } from './api'
import './templates.css'

export function TemplatesPage() {
  useDocumentTitle('Logbook templates')
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['templates'], queryFn: listTemplates })
  const remove = useMutation({
    mutationFn: (t: TemplateSummary) => deleteTemplate(t.id, t.version),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  })

  const onDelete = async (t: TemplateSummary) => {
    const warn = t.studentCount > 0 ? ` ${t.studentCount} student(s) use it and will have no template until you upload a new one.` : ''
    if (await ask(`Delete the ${t.universityName} template?${warn}`, 'Delete')) remove.mutate(t)
  }

  return (
    <>
      <PageHeading eyebrow="SUPERVISOR" title="Logbook templates" description="One Word or PDF logbook per university. Students fill it in every week.">
        <Link className="button primary" to="/supervisor/templates/new"><Plus size={16} aria-hidden="true" /> New template</Link>
      </PageHeading>
      {remove.isError ? <p className="banner error" role="alert">{errorText(remove.error)}</p> : null}
      {list.isPending ? (
        <p className="muted">Loading templates…</p>
      ) : list.isError ? (
        <p className="banner error" role="alert">{errorText(list.error)}</p>
      ) : list.data.length === 0 ? (
        <section className="card">
          <h3><FileText size={16} aria-hidden="true" /> No templates yet</h3>
          <p className="empty-copy">Upload a university's logbook to get started.</p>
        </section>
      ) : (
        <div className="intern-table-wrap">
          <table className="intern-table">
            <thead>
              <tr>
                <th>University</th>
                <th>Format</th>
                <th>Placeholders</th>
                <th>Students</th>
                <th>Last updated</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.universityName}</strong></td>
                  <td>{t.format.toUpperCase()}</td>
                  <td>{t.placeholderCount}</td>
                  <td>{t.studentCount}</td>
                  <td>{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}</td>
                  <td className="row-actions">
                    <Link className="button secondary small" to={`/supervisor/templates/${t.id}`}>Edit</Link>
                    <button type="button" className="button secondary small" disabled={remove.isPending} onClick={() => void onDelete(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 5: `TemplateEditorPage.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import { PageHeading } from '../../components/PageHeading'
import { ask } from '../../components/ask'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { createTemplate, deleteTemplate, errorText, getTemplate, getTemplateFile, listTemplates, updateTemplate } from './api'
import { blockIndexOfTable, docxContext, readDocxXml, regionOfDocxAnchor, type DocxContext } from './core/detect/docx'
import { newId } from './core/ids'
import type { Anchor, PageRole, Placeholder, Template } from './core/model'
import { detectFromFile, normalizeUniversity, validateTemplate } from './core/template'
import { BINDING_META } from './overlay/bindingColors'
import { PlaceholderInspector } from './overlay/PlaceholderInspector'
import { TemplateOverlay } from './overlay/TemplateOverlay'
import './templates.css'

const MAX_BYTES = 10 * 1024 * 1024

/** `id` is '' until saved; `file` is set for a new upload; `version` for a saved template. */
type Draft = Template & { file?: File; version?: string }

export function TemplateEditorPage() {
  const { id } = useParams()
  useDocumentTitle(id ? 'Edit template' : 'New template')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [ctx, setCtx] = useState<DocxContext | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<'select' | 'add' | 'unit'>('select')
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [upload, setUpload] = useState<{ file: File | null; university: string }>({ file: null, university: '' })

  const load = useCallback(async (templateId: string) => {
    const [t, bytes] = await Promise.all([getTemplate(templateId), getTemplateFile(templateId)])
    setCtx(t.format === 'docx' ? docxContext(await readDocxXml(bytes)) : null)
    setDraft({
      id: t.id, university: t.universityName, format: t.format, fileName: t.fileName, fileBytes: bytes, period: 'weekly',
      pageRoles: t.pageRoles ?? undefined, unitStartBlock: t.unitStartBlock ?? undefined, placeholders: t.placeholders,
      updatedAt: t.updatedAt ?? '', version: t.version,
    })
    setDirty(false)
    setError('')
  }, [])

  useEffect(() => {
    if (id) load(id).catch((e: unknown) => setError(errorText(e)))
  }, [id, load])

  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const regionFor = (t: Draft, anchor: Anchor): 'cover' | 'unit' => {
    if (anchor.kind === 'pdf') return t.pageRoles?.[anchor.page] === 'cover' ? 'cover' : 'unit'
    return ctx ? regionOfDocxAnchor(ctx, anchor, t.unitStartBlock ?? 0) : 'unit'
  }
  const withRegions = (t: Draft): Draft => ({ ...t, placeholders: t.placeholders.map((p) => ({ ...p, region: regionFor(t, p.anchor) })) })
  const edit = (fn: (t: Draft) => Draft) => {
    setDraft((t) => (t ? fn(t) : t))
    setDirty(true)
  }

  const runDetect = async () => {
    const file = upload.file
    if (!file) return setError('Choose a .docx or .pdf file first.')
    if (file.size > MAX_BYTES) return setError('This file is over 10 MB. Upload a smaller copy.')
    setBusy(true)
    setError('')
    try {
      const r = await detectFromFile(file)
      setCtx(r.docx ?? null)
      setDraft({
        id: '', university: upload.university.trim(), format: r.format, fileName: file.name, fileBytes: r.bytes, period: 'weekly',
        pageRoles: r.pageRoles, unitStartBlock: r.unitStartBlock, placeholders: r.placeholders, updatedAt: '', file,
      })
      setWarnings(r.placeholders.length === 0 ? [...r.warnings, 'No text found — place placeholders manually.'] : r.warnings)
      setDirty(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const updatePh = (ph: Placeholder) =>
    edit((t) => ({ ...t, placeholders: t.placeholders.map((p) => (p.id === ph.id ? { ...ph, region: regionFor(t, ph.anchor) } : p)) }))
  const addPh = (anchor: Anchor) => {
    const phId = newId('ph')
    edit((t) => ({ ...t, placeholders: [...t.placeholders, { id: phId, label: 'New field', binding: 'free', source: 'manual', region: regionFor(t, anchor), anchor }] }))
    setSelectedId(phId)
    setTool('select')
  }
  const removePh = (phId: string) => {
    edit((t) => ({ ...t, placeholders: t.placeholders.filter((p) => p.id !== phId) }))
    setSelectedId(null)
  }
  const setPageRole = (page: number, role: PageRole) =>
    edit((t) => {
      const pageRoles = [...(t.pageRoles ?? [])]
      pageRoles[page] = role
      return withRegions({ ...t, pageRoles })
    })
  const pickTable = (tableIndex: number) => {
    const block = ctx ? blockIndexOfTable(ctx, tableIndex) : null
    if (block == null) return setError("That table isn't at the top level of the document.")
    edit((t) => withRegions({ ...t, unitStartBlock: block }))
    setTool('select')
  }
  const wholeDocRepeats = () => edit((t) => withRegions({ ...t, unitStartBlock: 0 }))

  const save = async () => {
    if (!draft) return
    const t = { ...draft, university: draft.university.trim() }
    const problems = validateTemplate(t)
    if (problems.length) return setError(problems.join(' '))
    const input = { universityName: t.university, placeholders: t.placeholders, pageRoles: t.pageRoles, unitStartBlock: t.unitStartBlock }
    setBusy(true)
    setError('')
    try {
      if (t.id && t.version) {
        await updateTemplate(t.id, t.version, input)
      } else {
        const clash = (await listTemplates()).find((x) => normalizeUniversity(x.universityName) === normalizeUniversity(t.university))
        if (clash) {
          if (!(await ask(`A template for "${clash.universityName}" already exists. Replace it?`, 'Replace'))) return
          // ponytail: delete-then-create is not atomic; if create fails the editor keeps the file, and Save again restores it.
          await deleteTemplate(clash.id, clash.version)
        }
        await createTemplate(t.file!, input)
      }
      setDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate('/supervisor/templates')
    } catch (e) {
      if (e instanceof ApiError && e.status === 412 && t.id) {
        if (await ask('Someone else saved this template after you opened it. Load their version? Your changes here will be lost.', 'Load theirs')) {
          await load(t.id).catch((err: unknown) => setError(errorText(err)))
        }
        return
      }
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const back = async () => {
    if (!dirty || (await ask('Discard your unsaved changes to this template?', 'Discard'))) navigate('/supervisor/templates')
  }

  const groups = useMemo(() => {
    const list = draft?.placeholders ?? []
    return [
      { title: 'Cover (filled once)', items: list.filter((p) => p.region === 'cover') },
      { title: 'Repeats every week', items: list.filter((p) => p.region === 'unit') },
    ].filter((g) => g.items.length)
  }, [draft?.placeholders])

  const errorBanner = error ? <p className="banner error" role="alert">{error}</p> : null

  if (!draft) {
    if (id) return <><PageHeading eyebrow="SUPERVISOR" title="Edit template" />{errorBanner ?? <p className="muted">Loading template…</p>}</>
    return (
      <>
        <PageHeading eyebrow="SUPERVISOR" title="New university template" description="Upload the university's Word or PDF logbook. The blanks are found for you to check." />
        <section className="card template-upload">
          <label>University name
            <input data-testid="university-input" value={upload.university} maxLength={200} placeholder="e.g. Taylor's University" onChange={(e) => setUpload({ ...upload, university: e.target.value })} />
          </label>
          <label>Template file (.docx or .pdf, up to 10 MB)
            <input data-testid="upload-input" type="file" accept=".docx,.pdf" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })} />
          </label>
          {errorBanner}
          <button type="button" className="button primary" data-testid="detect-btn" disabled={busy} onClick={() => void runDetect()}>
            {busy ? 'Detecting…' : 'Detect placeholders'}
          </button>
        </section>
      </>
    )
  }

  const selected = draft.placeholders.find((p) => p.id === selectedId) ?? null
  const hint = tool === 'add'
    ? draft.format === 'pdf' ? 'Drag on the page to draw a new placeholder.' : 'Click a table cell, or select some text, to add a placeholder.'
    : tool === 'unit' ? 'Click the table where one week of the logbook starts.'
    : 'Click a highlight or a list item to edit it. Dashed boxes are guesses from labels: check them.'

  return (
    <>
      <PageHeading eyebrow="SUPERVISOR" title={draft.university || 'New template'} description={draft.fileName}>
        <button type="button" className="button secondary" onClick={() => void back()}>Back to templates</button>
      </PageHeading>
      <div className="card template-toolbar">
        <label>University
          <input data-testid="university-input" value={draft.university} maxLength={200} onChange={(e) => { const v = e.target.value; edit((t) => ({ ...t, university: v })) }} />
        </label>
        <div className="tool-group" role="group" aria-label="Tool">
          <button type="button" className="button secondary small" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>Select</button>
          <button type="button" className="button secondary small" data-testid="mode-add-btn" aria-pressed={tool === 'add'} onClick={() => setTool('add')}>Add placeholder</button>
          {draft.format === 'docx' ? (
            <>
              <button type="button" className="button secondary small" data-testid="mode-unit-btn" aria-pressed={tool === 'unit'} onClick={() => setTool('unit')}>Set repeating start</button>
              <button type="button" className="button secondary small" onClick={wholeDocRepeats}>Whole document repeats</button>
            </>
          ) : null}
        </div>
        <span className="spacer" />
        <button type="button" className="button primary" data-testid="save-template" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save template'}</button>
      </div>
      <p className="muted">{hint}</p>
      {warnings.map((w) => <p key={w} className="banner">{w}</p>)}
      {errorBanner}
      <div className="editor-grid">
        <div className="doc-pane">
          <TemplateOverlay
            template={draft}
            selectedId={selectedId}
            adding={tool === 'add'}
            pickingUnit={tool === 'unit'}
            onSelect={setSelectedId}
            onUpdate={updatePh}
            onAdd={addPh}
            onResolved={setUnresolved}
            onPickTable={pickTable}
            onPageRole={setPageRole}
          />
        </div>
        <aside className="editor-side">
          <div className="card legend">
            {Object.entries(BINDING_META).map(([b, m]) => <span key={b}><i className="dot" style={{ background: m.color }} />{m.label}</span>)}
          </div>
          {selected ? <PlaceholderInspector ph={selected} unresolved={unresolved.includes(selected.id)} onUpdate={updatePh} onRemove={() => removePh(selected.id)} /> : null}
          <section className="card">
            <h3>{draft.placeholders.length} placeholders</h3>
            {groups.map((g) => (
              <div key={g.title}>
                <p className="muted">{g.title}</p>
                <div className="ph-list">
                  {g.items.map((ph) => (
                    <button key={ph.id} type="button" className="ph-item" data-testid="ph-item" aria-pressed={ph.id === selectedId} onClick={() => setSelectedId(ph.id)}>
                      <i className="dot" style={{ background: BINDING_META[ph.binding].color }} />
                      <span className="ph-name">{ph.label}</span>
                      <small>{BINDING_META[ph.binding].label}</small>
                      {unresolved.includes(ph.id) ? <span title="Can't show this on the page">⚠</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Routes and navigation**

In `appv3/frontend/src/App.tsx`, next to the other lazy pages:

```tsx
const TemplatesPage = lazy(() => import('./features/templates/TemplatesPage').then((module) => ({ default: module.TemplatesPage })))
const TemplateEditorPage = lazy(() =>
  import('./features/templates/TemplateEditorPage').then((module) => ({ default: module.TemplateEditorPage })),
)
```

Inside `<Route element={<RequireSupervisor />}>`, after the review route:

```tsx
        <Route path="supervisor/templates" element={<TemplatesPage />} />
        <Route path="supervisor/templates/new" element={<TemplateEditorPage />} />
        <Route path="supervisor/templates/:id" element={<TemplateEditorPage />} />
```

In `appv3/frontend/src/components/AppShell.tsx`:
- Add `FileText` to the `lucide-react` import.
- Replace the single supervisor `NavLink` with:

```tsx
            <>
              <NavLink to="/supervisor/dashboard" className={({ isActive }) => isActive ? 'active' : ''}><Users size={19} aria-hidden="true" /><span>Interns</span></NavLink>
              <NavLink to="/supervisor/templates" className={({ isActive }) => isActive ? 'active' : ''}><FileText size={19} aria-hidden="true" /><span>Templates</span></NavLink>
            </>
```

- [ ] **Step 7: Run to verify everything passes**

Run: FT (the whole suite), then `npx tsc -b && npm run lint && npm run build && npm run bundle:check`
Expected:
- all tests PASS, including the 3 list and 5 editor tests plus the existing `AppShell` tests. If an AppShell test counts supervisor nav links, update that count to 2.
- the build succeeds.
- `bundle:check` passes: pdf.js and docx-preview sit only in the lazy template chunks.

- [ ] **Step 8: Commit**

```bash
git add appv3/frontend/src
git commit -m "feat(templates): supervisor pages to upload, correct and manage university templates"
```

---

## Task 8: End-to-end check in the running app

**Files:** none (verification only).

- [ ] **Step 1: Full suites**

Run: BT, then `cd ../frontend && npx vitest run && npm run lint && npm run openapi:drift && npm run build && npm run bundle:check`
Expected: all green. (`openapi:drift` writes to `/tmp/opencode/`; on Windows, run it from Git Bash, or run `mkdir -p /tmp/opencode` first.)

- [ ] **Step 2: Manual run against the real API**

Pick one of these:
- With Docker: `cd appv3 && docker compose up --build`, then open `http://localhost:8080`.
- Without Docker: `php artisan serve` in `backend` and `npm run dev` in `frontend`, with the Vite proxy the README describes.

Sign in as the seeded supervisor, then:
1. Open Templates, then New template.
2. Enter "Taylor's University", upload `src/features/templates/core/fixtures/taylors.docx`, and detect.
3. Change one binding, then add a manual cell placeholder with Add placeholder → click a cell.
4. Save. The template appears in the list with its placeholder count.
5. Edit it again. The boxes appear where you left them.
6. Upload `apu.pdf` for "Asia Pacific University" and drag one box. It moves, and saving keeps it.
7. Upload a `.pdf` that is really a renamed `.txt`. The editor shows the "not a real .docx or .pdf" message.

- [ ] **Step 3: Record the result**

In the PR or handoff note, record what passed and anything that didn't. Don't claim the manual steps passed without running them.
