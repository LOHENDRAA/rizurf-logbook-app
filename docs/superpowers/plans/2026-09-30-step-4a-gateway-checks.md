# Step 4a: Pass the Gateway's Checks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** appv3's API passes the Rizurf gateway's `/conformance` checks, so it can be registered with the gateway (step 4b's sign-in needs a registered address).

**Architecture:**
- The gateway reads two public documents under the service's base URL: `GET /health` and `GET /openapi.json`. The base URL is `https://api.company.com/api/v1`, so both live next to the existing API (`/api/v1/health`, `/api/v1/openapi.json`), and no route moves.
- Every error keeps going through `App\Support\Problem`. Only the body changes: `{"error": {"code", "message", "correlation_id", "details"}}`, with the reserved codes the template names.
- `RequestIdMiddleware` keeps its job but uses the `X-Correlation-ID` header.
- The OpenAPI document is one static JSON file. A test compares it against Laravel's route list, so a new route without documentation fails CI.

**Tech Stack:** Laravel 13 (PHP ≥ 8.4), MariaDB in CI / MySQL on the VPS, PHPUnit, Pint, Larastan. Prototype: Vue 3 + Vite + Vitest.

**Spec:** `../intern-logbook/docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` §3 "Step 4", plus the gateway's `RIZURF_API_TEMPLATE.md` (SS-1 to SS-27) and `MICROAPP_AUTH.md`. The user received both over WhatsApp. They are not in the repo; the rules this plan needs are quoted where they are used.

## Deviations from the template (decided, same result at `/conformance`)

- **No Bearer tokens (SS-6, SS-7, SS-26).** The API's callers are the logbook's own screens, which use a signed-in session cookie. The document declares that cookie as the security scheme. An anonymous call already gets `401` with the error body, which is what the checker probes. `ponytail:` add gateway access tokens and scopes when another program needs to call the logbook.
- **No route renames (SS-9, SS-12).** `/submit` and `/review` stay, and lists keep `page` / `per_page`. The checker only reads, and an unknown `?limit=` is ignored, not rejected. Rename them only if `/conformance` fails on them.
- **`/auth/login` and `/auth/logout` stay in 4a,** documented as temporary. Step 4b removes them.
- **The old React app (`appv3/frontend`) is not updated.** It has been out of date since step 2 (it still calls the removed mentor and weekly-draft endpoints). With the new error body it shows its generic error messages. Retiring it is a separate cleanup.
- **No `app_url` yet.** It is the screens' address as registered with the gateway. It arrives with step 4b's `PUBLIC_URL`.

## Global Constraints

- PHP ≥ 8.4, Laravel 13. Code passes `./vendor/bin/pint --test` and `./vendor/bin/phpstan analyse`. CI runs both, plus the tests on MariaDB.
- No PHP on this machine runs the test suite (XAMPP's PHP is 8.2). Backend tests run in CI: push the branch, then read both runs (push and pull_request).
- Error body, exactly (SS-5): `{"error": {"code": "...", "message": "...", "correlation_id": "...", "details": null}}`. `code` is `UPPER_SNAKE_CASE`. `message` never contains SQL, stack traces or secrets.
- Reserved codes (SS-5), never used for anything else: `UNAUTHORIZED` 401, `FORBIDDEN` 403, `RESOURCE_NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `CONFLICT` 409, `VALIDATION_ERROR` 422, `INTERNAL_ERROR` 500. Domain codes (`STALE_VERSION`, `TRANSITION_CONFLICT`, …) stay.
- `X-Correlation-ID` (SS-4): reuse the caller's value when present, otherwise mint one, and send it on every response, errors included.
- `/health` (SS-2): public, `200`, `{status: ok|degraded|down, service, version, checks}`. The service id is `intern-logbook`.
- `/openapi.json` (SS-3, SS-23, SS-27): public, OpenAPI 3.x, `info.title`, `info.description`, and a `summary` on every operation. `info.x-rizurf` has `domain`, `owner`, `category`, `industries`, `use_cases`, `capabilities`, `workflows` and `related_services`. Every operation has `x-rizurf` with `name`, `purpose`, `use_when`, `do_not_use_when`, `inputs`, `outputs`, `requires`, `related_endpoints` and `tags`. Keys whose value may be `[]` must still be present.
- Categories: `Identity & Authentication`, `Finance & Payments`, `Billing`, `Commerce`, `Customer Management`, `Notifications`, `Documents`, `Analytics`, `Reporting`, `Utilities`, `Operations`. Industries: `Main Database`, `Human Resources`, `Marketing`, `Sales`, `Finance`, `IT`, `Operations`, `Legal`, `Support`.
- The template forbids a conformance runner inside the service ("Do not add a conformance test runner to the service"). The tests below check our own behaviour; they don't reimplement the gateway's checker.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An upload over the size limit** (`413`) currently falls to the generic branch and would be labelled `INTERNAL_ERROR`. A person uploading a large template should get a clear "file too large" code. Task 1 maps `413` to `PAYLOAD_TOO_LARGE` and tests it.
2. **A proxy's HTML error page** (a 502 from nginx) reaches the prototype without the JSON body. It must still say "The server answered 502.", not crash. Task 4 tests it.
3. **The checker's forged `X-Authenticated-User` header** must not sign anyone in. Task 1 tests it.
4. **A POST without CSRF from an anonymous caller** (the checker has no session) becomes `419` inside Laravel. It must reach the caller as `401 UNAUTHORIZED`, not `419`. Task 3's "every protected operation refuses anonymous callers" test covers each route.
5. **A correlation id longer than 128 characters** is replaced by a fresh one rather than echoed, so logs can't be flooded. Task 1 tests it.

---

### Task 1: Error body, reserved codes and `X-Correlation-ID`

**Files:**
- Create: `appv3/backend/tests/Feature/ConformanceTest.php`
- Modify: `appv3/backend/app/Support/Problem.php`, `appv3/backend/app/Http/Middleware/RequestIdMiddleware.php`, `appv3/backend/app/Http/Middleware/RequestLoggingMiddleware.php`, `appv3/backend/config/cors.php`, `appv3/backend/tests/TestCase.php`, and every file the renames in Step 3 touch (`app/**`, `tests/Feature/*.php`)

**Interfaces:**
- Produces: `Problem::correlationId(Request): string` (replaces `Problem::requestId`); request attribute `correlationId`; error body `{"error": {"code", "message", "correlation_id", "details"}}`; header `X-Correlation-ID`. `Problem::throw(...)` keeps its signature.

- [ ] **Step 1: Create the branch.**

```bash
cd C:/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app
git checkout master && git pull --ff-only
git checkout -b feat/step-4a-gateway-checks
```

- [ ] **Step 2: Write the failing tests.** Create `appv3/backend/tests/Feature/ConformanceTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * What the gateway's /conformance page probes from outside (RIZURF_API_TEMPLATE.md SS-4, SS-5, SS-25).
 */
class ConformanceTest extends TestCase
{
    public function test_unknown_path_returns_the_error_envelope(): void
    {
        $response = $this->getJson('/api/v1/nonexistent', ['X-Correlation-ID' => 'trace-1']);

        $response->assertNotFound();
        $response->assertHeader('X-Correlation-ID', 'trace-1');
        $response->assertExactJson(['error' => [
            'code' => 'RESOURCE_NOT_FOUND',
            'message' => 'The requested resource could not be found.',
            'correlation_id' => 'trace-1',
            'details' => null,
        ]]);
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));
    }

    public function test_wrong_method_is_405_with_allow_header(): void
    {
        $response = $this->deleteJson('/api/v1/me/logbook');

        $response->assertStatus(405);
        $response->assertJsonPath('error.code', 'METHOD_NOT_ALLOWED');
        $this->assertStringContainsString('GET', (string) $response->headers->get('Allow'));
        $this->assertNotEmpty($response->headers->get('X-Correlation-ID'));
    }

    public function test_anonymous_call_is_401_envelope(): void
    {
        $response = $this->getJson('/api/v1/me/logbook');

        $response->assertUnauthorized();
        $response->assertJsonPath('error.code', 'UNAUTHORIZED');
        $this->assertSame($response->headers->get('X-Correlation-ID'), $response->json('error.correlation_id'));
    }

    public function test_forged_identity_header_signs_nobody_in(): void
    {
        $this->getJson('/api/v1/me', ['X-Authenticated-User' => 'supervisor-1'])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHORIZED');
    }

    public function test_correlation_id_is_minted_when_absent_or_too_long(): void
    {
        $minted = $this->getJson('/api/v1/me')->headers->get('X-Correlation-ID');
        $this->assertTrue(Str::isUuid((string) $minted));

        $replaced = $this->getJson('/api/v1/me', ['X-Correlation-ID' => str_repeat('a', 129)])->headers->get('X-Correlation-ID');
        $this->assertTrue(Str::isUuid((string) $replaced));
    }

    public function test_validation_errors_list_the_fields_in_details(): void
    {
        $this->actingAs($this->user('student-1'))
            ->getJson('/api/v1/me/journal/weeks?page=0')
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_ERROR')
            ->assertJsonPath('error.details.page.0', 'Page must be an integer of 1 or more.');
    }

    public function test_deleting_a_missing_template_is_404_not_204(): void
    {
        $this->actingAs($this->user('supervisor-1'))
            ->portal('DELETE', '/api/v1/templates/missing', [], ['If-Match' => '"v-1"'])
            ->assertNotFound()
            ->assertJsonPath('error.code', 'RESOURCE_NOT_FOUND');
    }

    public function test_upload_over_the_server_limit_is_413_payload_too_large(): void
    {
        $this->app['router']->post('/api/v1/_too_large', fn () => abort(413));

        $this->postJson('/api/v1/_too_large')
            ->assertStatus(413)
            ->assertJsonPath('error.code', 'PAYLOAD_TOO_LARGE');
    }
}
```

The 413 test registers a throwaway route in the test only, because the real limit is enforced by PHP and nginx before Laravel runs.

- [ ] **Step 3: Rename the codes and test paths across the backend.** This is mechanical and runs in Git Bash:

```bash
cd appv3/backend
sed -i "s/'UNAUTHENTICATED'/'UNAUTHORIZED'/g; s/'VALIDATION_FAILED'/'VALIDATION_ERROR'/g; s/'NOT_FOUND'/'RESOURCE_NOT_FOUND'/g; s/'INTERNAL'/'INTERNAL_ERROR'/g" $(grep -rlE "'(UNAUTHENTICATED|VALIDATION_FAILED|NOT_FOUND|INTERNAL)'" app tests)
sed -i "s/assertJsonPath('code', /assertJsonPath('error.code', /g; s/assertJsonPath('title', /assertJsonPath('error.message', /g; s/X-Request-Id/X-Correlation-ID/g" $(grep -rlE "assertJsonPath\('(code|title)'|X-Request-Id" tests app config)
```

Then fix these lines by hand:
- `tests/Feature/AuthTest.php:35` and `tests/Feature/JournalTest.php:62`: delete the line that asserts `'status', 401` / `'status', 422`. Those were the problem+json `status` field. The HTTP status is already asserted on the line above.
- `tests/Feature/AuthTest.php:36` and `tests/Feature/JournalTest.php:120`: replace `$this->assertArrayHasKey('requestId', $response->json());` with `$this->assertNotEmpty($response->json('error.correlation_id'));`.
- `tests/Feature/AuthTest.php:57`: replace `$this->assertArrayHasKey('errors', $response->json());` with `$this->assertNotEmpty($response->json('error.details'));`.
- `tests/Feature/TemplateTest.php:104`: `->assertJsonValidationErrors('file')` becomes `->assertJsonValidationErrors('file', 'error.details')`.
- `tests/Feature/TemplateTest.php:119`: `$response->json('errors.file')` becomes `$response->json('error.details.file')`.

- [ ] **Step 4: Rewrite the body in `app/Support/Problem.php`.** Replace the class docblock, `requestId()` and `response()` with:

```php
/**
 * The Rizurf error envelope (RIZURF_API_TEMPLATE.md SS-5):
 * {"error": {"code", "message", "correlation_id", "details"}}.
 *
 * Internal details are never leaked; unexpected failures collapse to INTERNAL_ERROR.
 */
final class Problem
{
    public static function correlationId(Request $request): string
    {
        $id = $request->attributes->get('correlationId');

        return is_string($id) && $id !== '' ? $id : (string) Str::uuid();
    }

    public static function response(
        int $status,
        string $code,
        string $title,
        ?string $detail = null,
        ?array $errors = null,
        ?Request $request = null,
    ): JsonResponse {
        return new JsonResponse(['error' => [
            'code' => $code,
            'message' => $detail !== null && $detail !== '' ? "{$title} {$detail}" : $title,
            'correlation_id' => $request ? self::correlationId($request) : (string) Str::uuid(),
            'details' => $errors !== null && $errors !== [] ? $errors : null,
        ]], $status);
    }
```

In `fromThrowable()`'s `HttpExceptionInterface` branch, replace the `$code = match` block and the final `return` with:

```php
            $code = match (true) {
                $status === 400, $status === 422 => 'VALIDATION_ERROR',
                $status === 405 => 'METHOD_NOT_ALLOWED',
                $status === 409 => 'CONFLICT',
                $status === 412 => 'STALE_VERSION',
                $status === 413 => 'PAYLOAD_TOO_LARGE',
                $status === 429 => 'RATE_LIMITED',
                default => 'INTERNAL_ERROR',
            };

            $title = $status >= 500
                ? 'Something went wrong on our side. Please try again.'
                : ($e->getMessage() !== '' ? $e->getMessage() : Response::$statusTexts[$status] ?? 'Request failed.');

            $response = self::response($status, $code, $title, null, null, $request);
            // A 405 carries Allow (SS-5); other HTTP errors may carry Retry-After and similar headers.
            $response->headers->add($e->getHeaders());

            return $response;
```

After Step 3's sed, the last fallback in `fromThrowable()` already reads `'INTERNAL_ERROR'`. Check it.

- [ ] **Step 5: Rename the header in the middleware.** In `app/Http/Middleware/RequestIdMiddleware.php`:
  - The docblock becomes `Correlates every request (SS-4): honours an incoming X-Correlation-ID, otherwise mints one. The id is echoed on every response and in error bodies.`
  - The attribute becomes `$request->attributes->set('correlationId', $id);`.
  - After Step 3's sed, both header names already read `X-Correlation-ID`.

In `RequestLoggingMiddleware.php`, `'request_id' => $request->attributes->get('requestId'),` becomes `'correlation_id' => $request->attributes->get('correlationId'),`. After Step 3's sed, `config/cors.php`'s `exposed_headers` already reads `['ETag', 'X-Correlation-ID']`.

- [ ] **Step 6: Check nothing uses the old names.**

Run: `grep -rnE "requestId|X-Request-Id|UNAUTHENTICATED|VALIDATION_FAILED|'NOT_FOUND'|'INTERNAL'|problem\+json" app config tests routes`
Expected: no output, apart from comments that still say "problem+json". Reword those to "error envelope".

- [ ] **Step 7: Run Pint locally, then commit, push and check CI.**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app tests config
git add -A appv3/backend
git commit -m "feat(backend): Rizurf error envelope, reserved codes and X-Correlation-ID"
git push -u origin feat/step-4a-gateway-checks
```

Expected: the `backend` job is green, and `ConformanceTest` shows 8 passing tests in the log.

---

### Task 2: `/health` in the gateway's shape

**Files:**
- Create: `appv3/backend/tests/Feature/HealthTest.php`
- Modify: `appv3/backend/app/Http/Controllers/HealthController.php`

**Interfaces:**
- Produces: `HealthController::SERVICE = 'intern-logbook'`, `HealthController::VERSION = '1.0.0'`. Task 3's document uses the same version.

- [ ] **Step 1: Write the failing tests.** Create `tests/Feature/HealthTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_names_the_service_and_its_database(): void
    {
        $this->getJson('/api/v1/health')->assertOk()->assertExactJson([
            'status' => 'ok',
            'service' => 'intern-logbook',
            'version' => HealthController::VERSION,
            'checks' => ['database' => true],
        ]);
    }

    public function test_health_is_degraded_but_still_200_when_the_database_is_down(): void
    {
        $default = config('database.default');
        config([
            'database.connections.broken' => ['driver' => 'sqlite', 'database' => '/nonexistent/dir/db.sqlite', 'prefix' => ''],
            'database.default' => 'broken',
        ]);

        try {
            $this->getJson('/api/v1/health')
                ->assertOk()
                ->assertJsonPath('status', 'degraded')
                ->assertJsonPath('checks.database', false);
        } finally {
            // RefreshDatabase rolls back on the default connection at teardown.
            config(['database.default' => $default]);
            DB::purge('broken');
        }
    }
}
```

- [ ] **Step 2: Implement.** Replace `app/Http/Controllers/HealthController.php` with:

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The gateway's health contract (RIZURF_API_TEMPLATE.md SS-2): public, 200, and
 * "degraded" rather than "ok" while the database is unreachable.
 */
final class HealthController extends Controller
{
    public const SERVICE = 'intern-logbook';

    public const VERSION = '1.0.0';

    public function health(): JsonResponse
    {
        try {
            DB::connection()->select('select 1');
            $database = true;
        } catch (Throwable) {
            $database = false;
        }

        return response()->json([
            'status' => $database ? 'ok' : 'degraded',
            'service' => self::SERVICE,
            'version' => self::VERSION,
            'checks' => ['database' => $database],
        ]);
    }
}
```

`ponytail:` a MySQL server that hangs instead of refusing makes this slower than the 1-second SHOULD. Add a PDO connect timeout if the checker flags it.

- [ ] **Step 3: Commit, push and check CI.**

```bash
git add -A appv3/backend
git commit -m "feat(backend): health reports the service id, version and database check"
git push
```

Expected: the `backend` job is green.

---

### Task 3: `/openapi.json` with the catalogue information

**Files:**
- Create: `appv3/backend/resources/openapi.json`, `appv3/backend/tests/Feature/OpenApiTest.php`
- Modify: `appv3/backend/app/Http/Controllers/HealthController.php` (adds `openapi()`), `appv3/backend/routes/portal.php`

**Interfaces:**
- Consumes: `HealthController::VERSION`, the error body from Task 1.
- Produces: `GET /api/v1/openapi.json`, public. Step 4b edits the same file (removes `/auth/*`, adds `app_url`).

- [ ] **Step 1: Write the failing tests.** Create `tests/Feature/OpenApiTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Http\Controllers\HealthController;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Keeps resources/openapi.json true to the routes and complete for the gateway's
 * catalogue (RIZURF_API_TEMPLATE.md SS-3, SS-23, SS-27).
 */
class OpenApiTest extends TestCase
{
    private const CATEGORIES = ['Identity & Authentication', 'Finance & Payments', 'Billing', 'Commerce', 'Customer Management',
        'Notifications', 'Documents', 'Analytics', 'Reporting', 'Utilities', 'Operations'];

    private const INDUSTRIES = ['Main Database', 'Human Resources', 'Marketing', 'Sales', 'Finance', 'IT', 'Operations', 'Legal', 'Support'];

    public function test_document_is_public_openapi_3_with_catalogue_info(): void
    {
        $doc = $this->doc();
        $operations = $this->operations($doc);

        $this->assertStringStartsWith('3.', $doc['openapi']);
        $this->assertNotEmpty($doc['info']['title']);
        $this->assertNotEmpty($doc['info']['description']);
        $this->assertSame(HealthController::VERSION, $doc['info']['version']);

        $meta = $doc['info']['x-rizurf'];
        $this->assertNotEmpty($meta['domain']);
        $this->assertNotEmpty($meta['owner']);
        $this->assertContains($meta['category'], self::CATEGORIES);
        $this->assertNotEmpty($meta['industries']);
        foreach ($meta['industries'] as $industry) {
            $this->assertContains($industry, self::INDUSTRIES);
        }
        $this->assertNotEmpty($meta['use_cases']);
        $this->assertIsArray($meta['related_services']);

        $this->assertNotEmpty($meta['capabilities']);
        foreach ($meta['capabilities'] as $capability) {
            foreach (['name', 'icon', 'description', 'best_for', 'does', 'endpoints'] as $key) {
                $this->assertNotEmpty($capability[$key] ?? null, "capability {$key}");
            }
            foreach ($capability['endpoints'] as $endpoint) {
                $this->assertContains($endpoint, $operations, "capability {$capability['name']}");
            }
        }

        $this->assertNotEmpty($meta['workflows']);
        foreach ($meta['workflows'] as $workflow) {
            $this->assertNotEmpty($workflow['name']);
            $this->assertNotEmpty($workflow['steps']);
            foreach ($workflow['steps'] as $step) {
                $this->assertContains($step, $operations, "workflow {$workflow['name']}");
            }
        }
    }

    public function test_every_route_is_documented_and_nothing_else(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RoutingRoute $route) => str_starts_with($route->uri(), 'api/v1/'))
            ->flatMap(fn (RoutingRoute $route) => collect($route->methods())
                ->reject(fn (string $method) => $method === 'HEAD')
                ->map(fn (string $method) => $method.' /'.substr($route->uri(), strlen('api/v1/'))))
            ->sort()
            ->values()
            ->all();

        $documented = $this->operations($this->doc());
        sort($documented);

        $this->assertSame($routes, $documented);
    }

    public function test_every_operation_carries_a_summary_and_discovery_metadata(): void
    {
        $doc = $this->doc();
        $operations = $this->operations($doc);

        foreach ($doc['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                $label = strtoupper($method).' '.$path;
                $this->assertNotEmpty($operation['summary'] ?? null, "{$label} summary");

                $meta = $operation['x-rizurf'] ?? [];
                foreach (['name', 'purpose', 'use_when', 'tags'] as $key) {
                    $this->assertNotEmpty($meta[$key] ?? null, "{$label} {$key}");
                }
                foreach (['do_not_use_when', 'inputs', 'outputs', 'requires', 'related_endpoints'] as $key) {
                    $this->assertIsArray($meta[$key] ?? null, "{$label} {$key}");
                }
                foreach ($meta['related_endpoints'] as $related) {
                    $this->assertContains($related, $operations, "{$label} related_endpoints");
                }
            }
        }
    }

    public function test_only_health_the_document_and_temporary_login_are_public(): void
    {
        $doc = $this->doc();
        $public = [];
        foreach ($doc['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                if (($operation['security'] ?? null) === []) {
                    $public[] = strtoupper($method).' '.$path;
                }
            }
        }
        sort($public);

        $this->assertSame(['GET /health', 'GET /openapi.json', 'POST /auth/login'], $public);
        $this->assertSame([['sessionCookie' => []]], $doc['security']);
        $this->assertSame(config('session.cookie'), $doc['components']['securitySchemes']['sessionCookie']['name']);
    }

    public function test_every_protected_operation_refuses_anonymous_callers(): void
    {
        $doc = $this->doc();

        foreach ($doc['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                if (($operation['security'] ?? null) === []) {
                    continue;
                }
                $uri = '/api/v1'.preg_replace('/\{[^}]+\}/', '1', $path);

                $this->flushHeaders()
                    ->json(strtoupper($method), $uri)
                    ->assertUnauthorized()
                    ->assertJsonPath('error.code', 'UNAUTHORIZED');
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function doc(): array
    {
        $response = $this->get('/api/v1/openapi.json')->assertOk();
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));

        return json_decode((string) $response->getContent(), true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array<string, mixed>  $doc
     * @return list<string> "METHOD /path" for every documented operation
     */
    private function operations(array $doc): array
    {
        $operations = [];
        foreach ($doc['paths'] as $path => $item) {
            foreach (array_keys($item) as $method) {
                $operations[] = strtoupper($method).' '.$path;
            }
        }

        return $operations;
    }
}
```

- [ ] **Step 2: Serve the file.** Add to `HealthController`:

```php
    /**
     * The API's own description, served as stored: decoding and re-encoding would turn {} into [].
     */
    public function openapi(): Response
    {
        return response((string) file_get_contents(resource_path('openapi.json')), 200, ['Content-Type' => 'application/json']);
    }
```

Add `use Illuminate\Http\Response;` to the imports. In `routes/portal.php`, add the route below the health route:

```php
    Route::get('openapi.json', [HealthController::class, 'openapi'])->withoutMiddleware('throttle:portal-api');
```

- [ ] **Step 3: Write `resources/openapi.json`.** It has the structure below. Paths are relative to the base URL `/api/v1`, and they match `routes/portal.php` exactly, including parameter names.

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Intern Logbook",
    "version": "1.0.0",
    "description": "Interns keep a daily notepad and fill in their university's weekly logbook; supervisors review, approve and export it.",
    "x-rizurf": {
      "domain": "Human Resources",
      "owner": "intern-logbook-team",
      "category": "Documents",
      "industries": ["Human Resources"],
      "use_cases": [
        "Interns logging what they did each day of an internship",
        "Filling in a university's weekly logbook form",
        "Supervisors approving or returning weekly logbooks",
        "Exporting a finished logbook for the university"
      ],
      "capabilities": [ …the five groups in the table below… ],
      "workflows": [
        { "name": "An intern's week", "steps": ["PUT /me/internship", "PUT /me/journal/weeks/{weekNumber}/daily", "PUT /me/journal/weeks/{weekNumber}/values", "POST /me/journal/weeks/{weekNumber}/submit"] },
        { "name": "Supervisor review", "steps": ["GET /supervisor/interns", "GET /supervisor/interns/{studentId}/logbook", "POST /supervisor/interns/{studentId}/weeks/{weekNumber}/review"] }
      ],
      "related_services": []
    }
  },
  "components": {
    "securitySchemes": {
      "sessionCookie": { "type": "apiKey", "in": "cookie", "name": "rizurf_logbook_session", "description": "The logbook's own signed-in session. Step 4b starts it from a gateway identity token." }
    }
  },
  "security": [{ "sessionCookie": [] }],
  "paths": {
    "/me/logbook": {
      "get": {
        "summary": "Return the signed-in intern's setup and every week with its answers, notes and history.",
        "x-rizurf": {
          "name": "Get My Logbook",
          "purpose": "Load an intern's whole logbook",
          "use_when": ["Opening the intern's screens", "Refreshing after a save"],
          "do_not_use_when": ["A supervisor viewing an intern (use GET /supervisor/interns/{studentId}/logbook)"],
          "inputs": [],
          "outputs": ["student", "weeks"],
          "requires": ["Signed-in intern"],
          "related_endpoints": ["PUT /me/internship", "PUT /me/journal/weeks/{weekNumber}/values"],
          "tags": ["logbook", "journal", "weeks", "my logbook"]
        }
      }
    }
  }
}
```

The `sessionCookie` name must equal `config('session.cookie')`. With `APP_NAME="Rizurf Logbook"` that is `rizurf_logbook_session`, and the test checks it.

**Capabilities** (`info.x-rizurf.capabilities`, in this order):

| name | icon | description | does | best_for | endpoints |
|---|---|---|---|---|---|
| Keep a Logbook | 📓 | Everything an intern does: set up, write notes, fill in weeks and submit them. | Set up an internship; Write daily notes; Fill in a week's form; Submit a week | Intern-facing screens. | GET /me; GET /me/internship; PUT /me/internship; GET /me/logbook; GET /me/template; GET /me/journal/weeks; GET /me/journal/weeks/{weekNumber}; PUT /me/journal/weeks/{weekNumber}/daily; PUT /me/journal/weeks/{weekNumber}/values; POST /me/journal/weeks/{weekNumber}/submit |
| Review Interns | ✅ | Supervisors read their interns' logbooks and approve or return weeks. | List interns; Read an intern's logbook; Approve a week; Send a week back with feedback | Supervisor screens and review dashboards. | GET /supervisor/interns; GET /supervisor/interns/{studentId}/weeks; GET /supervisor/interns/{studentId}/logbook; GET /supervisor/interns/{studentId}/weeks/{weekNumber}; POST /supervisor/interns/{studentId}/weeks/{weekNumber}/review |
| Manage Templates | 🗂️ | Upload and maintain each university's logbook template. | Upload a university template; Edit its placeholders; Download the original file; Delete a template | Supervisors preparing logbooks for a new university. | GET /templates; POST /templates; GET /templates/{id}; PUT /templates/{id}; DELETE /templates/{id}; GET /templates/{id}/file |
| Temporary Sign-In | 🔑 | Email-and-password sessions for testing, until gateway sign-in replaces them. | Sign in for testing; Sign out | Testing before gateway sign-in is connected. | POST /auth/login; POST /auth/logout |
| Service Status | 🩺 | Whether the logbook is up, and what its API can do. | Check the service is up; Read the API description | Monitoring and the gateway catalogue. | GET /health; GET /openapi.json |

**Operations.** One entry per row. `security` is `[]` only where the table says **public**; every other operation inherits the top-level `security`. List values are separated by `;`, and an empty cell means `[]`.

| operation | summary | name | purpose | use_when | do_not_use_when | inputs | outputs | requires | related_endpoints | tags |
|---|---|---|---|---|---|---|---|---|---|---|
| GET /health — **public** | Report whether the logbook service and its database are up. | Check Health | See if the logbook is running | Monitoring the service; Checking a deploy worked | | | status; service; version; checks | | GET /openapi.json | health; status; uptime; ping |
| GET /openapi.json — **public** | This OpenAPI document. | Describe API | Read what the logbook API can do | Connecting the service to the gateway; Generating a client | | | openapi; info; paths | | GET /health | openapi; docs; catalogue; schema |
| POST /auth/login — **public** | Start a session with an email and password (temporary, until gateway sign-in). | Sign In (Temporary) | Start a test session | Testing before gateway sign-in is connected | Production use once gateway sign-in is live | email; password | id; name; role | | GET /me; POST /auth/logout | login; sign in; session |
| POST /auth/logout | End the current session (temporary, until gateway sign-in). | Sign Out (Temporary) | End a test session | Ending a test session | Signing out of the gateway | | | Signed-in session | POST /auth/login | logout; sign out; session |
| GET /me | Return the signed-in person's id, name and role. | Get Current User | Find out who is signed in | Starting the app; Deciding which screens to show | Loading an intern's logbook | | id; name; role; capabilities | Signed-in session | GET /me/logbook; GET /supervisor/interns | me; profile; current user; whoami; role |
| GET /me/internship | Return the signed-in intern's placement: company, university and dates. | Get My Internship | Read an intern's placement details | Showing an intern's internship details | Loading the whole logbook at once | | university; startDate; endDate; company | Signed-in intern; Placement exists | PUT /me/internship; GET /me/logbook | internship; placement; dates; university |
| PUT /me/internship | Save the intern's university template, dates and cover-page answers. | Set Up Internship | Set or change an intern's university and dates | An intern starts their logbook; An intern corrects their dates before submitting | Saving a week's answers | templateId; startDate; endDate; coverValues; If-Match | student; weeks | Signed-in intern; Linked to a company; No week submitted yet when changing university or dates | GET /me/logbook; GET /templates | setup; onboarding; internship; dates; cover page |
| GET /me/logbook | *(as in the JSON example above)* | | | | | | | | | |
| GET /me/template | Return the university logbook template that matches the intern's university. | Get My Template | Get the form the intern fills in | Filling in or exporting the logbook | Listing every university | | id; universityName; placeholders; version | Signed-in intern; A template exists for their university | GET /templates/{id}/file; GET /me/logbook | template; university; form; logbook template |
| GET /me/journal/weeks | List the signed-in intern's weeks, a page at a time. | List My Weeks | See each week's status | Showing a list of weeks | Loading everything at once (use GET /me/logbook) | page; per_page | data; meta | Signed-in intern | GET /me/journal/weeks/{weekNumber} | weeks; journal; list; status |
| GET /me/journal/weeks/{weekNumber} | Return one of the intern's weeks with its notes, answers and history. | Get My Week | Open one week | Viewing a single week | Listing every week | weekNumber | weekNumber; values; dailyEntries; history; version | Signed-in intern | PUT /me/journal/weeks/{weekNumber}/daily; PUT /me/journal/weeks/{weekNumber}/values; POST /me/journal/weeks/{weekNumber}/submit | week; journal; entry |
| PUT /me/journal/weeks/{weekNumber}/daily | Save the intern's note for one day of a week. | Save Daily Note | Write down what happened on a day | An intern types in the daily notepad | Saving the university form's answers | weekNumber; date; body; If-Match | date; body; version | Signed-in intern; Week not submitted or approved | GET /me/logbook; PUT /me/journal/weeks/{weekNumber}/values | notepad; daily note; diary; log |
| PUT /me/journal/weeks/{weekNumber}/values | Save the intern's answers to their university template for one week. | Save Week Answers | Fill in the week's logbook form | An intern edits a week's form | Submitting the week for review | weekNumber; templateId; values; autofilled; If-Match | values; fillStatus; version | Signed-in intern; Week not submitted or approved | POST /me/journal/weeks/{weekNumber}/submit | answers; form; fill in; week |
| POST /me/journal/weeks/{weekNumber}/submit | Send a week's answers to the supervisor for review. | Submit Week | Hand a week in | An intern has finished a week | Saving work in progress | weekNumber; version; If-Match; Idempotency-Key | fillStatus; history; version | Signed-in intern; Week has started; At least one answer filled in | POST /supervisor/interns/{studentId}/weeks/{weekNumber}/review | submit; hand in; send for review |
| GET /supervisor/interns | List the interns in the supervisor's company, a page at a time. | List Interns | See who to review | Opening the supervisor's screens | Loading one intern's logbook | page; per_page | data; meta | Signed-in supervisor | GET /supervisor/interns/{studentId}/logbook | interns; students; team; review queue |
| GET /supervisor/interns/{studentId}/weeks | List one intern's weeks with their review status. | List Intern's Weeks | See an intern's progress | Checking which weeks await review | Loading everything at once (use the logbook endpoint) | studentId; page; per_page | data; meta | Signed-in supervisor; Intern in the same company | GET /supervisor/interns/{studentId}/weeks/{weekNumber} | weeks; progress; status |
| GET /supervisor/interns/{studentId}/logbook | Return one intern's setup and every week, for review and export. | Get Intern's Logbook | Load an intern's whole logbook | Reviewing or exporting an intern's logbook | An intern loading their own logbook | studentId | student; weeks | Signed-in supervisor; Intern in the same company | POST /supervisor/interns/{studentId}/weeks/{weekNumber}/review | logbook; review; intern; export |
| GET /supervisor/interns/{studentId}/weeks/{weekNumber} | Return one week of an intern's logbook. | Get Intern's Week | Open one week for review | Reviewing a single week | | studentId; weekNumber | values; dailyEntries; history; version | Signed-in supervisor; Intern in the same company | POST /supervisor/interns/{studentId}/weeks/{weekNumber}/review | week; review |
| POST /supervisor/interns/{studentId}/weeks/{weekNumber}/review | Approve a submitted week or send it back with feedback. | Review Week | Approve or return a week | A supervisor has read a submitted week | Editing the intern's answers | studentId; weekNumber; decision; feedback; If-Match; Idempotency-Key | fillStatus; history; version | Signed-in supervisor; Week is submitted; Feedback when requesting changes | GET /supervisor/interns/{studentId}/logbook | approve; review; request changes; feedback; sign off |
| GET /templates | List the university logbook templates (interns see names only). | List Templates | See which universities have a template | An intern picks their university; A supervisor manages templates | Downloading a template file | | data | Signed-in user | GET /templates/{id}; POST /templates | templates; universities; list |
| POST /templates | Upload a university's logbook file (DOCX or PDF) with its placeholders. | Upload Template | Add a university's logbook template | Interns from a new university join | Changing an existing template (use PUT /templates/{id}) | file; universityName; placeholders; pageRoles; unitStartBlock | id; version | Signed-in supervisor; No template for that university yet | PUT /templates/{id} | upload; template; university; docx; pdf |
| GET /templates/{id} | Return one template's settings and placeholders. | Get Template | Open a template | Editing a template | Downloading the file itself | id | universityName; placeholders; version | Signed-in supervisor | PUT /templates/{id}; GET /templates/{id}/file | template; settings |
| PUT /templates/{id} | Change a template's university name, placeholders or layout. | Update Template | Edit a template | Fixing a template's placeholders | Replacing the file | id; universityName; placeholders; pageRoles; unitStartBlock; If-Match | version | Signed-in supervisor | GET /templates/{id} | edit; template; placeholders |
| DELETE /templates/{id} | Delete a template and its file. | Delete Template | Remove a university's template | A template is no longer used | | id; If-Match | | Signed-in supervisor | GET /templates | delete; remove; template |
| GET /templates/{id}/file | Download the template's original DOCX or PDF. | Download Template File | Get the university's original file | Filling in or exporting a logbook | Reading the placeholder settings | id | file | Signed-in supervisor, or an intern of that university | GET /me/template | download; file; docx; pdf |

Validate the JSON: `node -e "JSON.parse(require('fs').readFileSync('appv3/backend/resources/openapi.json','utf8'))"` must print nothing.

- [ ] **Step 4: Commit, push and check CI.**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app tests
git add -A appv3/backend
git commit -m "feat(backend): /openapi.json with the gateway catalogue metadata, kept in step with the routes"
git push
```

Expected: the `backend` job is green, including all 5 `OpenApiTest` tests.

---

### Task 4: The prototype reads the new error body

**Repo:** `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook` (branch `master` tracks `origin/logbook-prototype`).

**Files:**
- Modify: `src/data/api.ts`, `tests/unit/api.test.ts`, `tests/unit/http.test.ts`

**Interfaces:**
- Consumes: Task 1's error body.
- Produces: `ApiError(status, code, message)` is unchanged, so no caller changes.

- [ ] **Step 1: Branch.**

```bash
cd C:/Users/User/Downloads/Rizurf_Logbook/intern-logbook
git checkout master && git pull --ff-only
git checkout -b feat/step-4a-error-envelope
```

- [ ] **Step 2: Update the tests to the new body (RED).** In `tests/unit/api.test.ts`, replace the `'turns problem+json into an ApiError…'` test and the `currentUser` 401 stub with:

```ts
  it('turns the error envelope into an ApiError with the most useful text', async () => {
    stub(c => (c.url.includes('invalid')
      ? json(422, { error: { code: 'VALIDATION_ERROR', message: 'Invalid', correlation_id: 'c1', details: { values: ['Fill in at least one field.'] } } })
      : c.url.includes('stale')
        ? json(412, { error: { code: 'STALE_VERSION', message: 'This item changed elsewhere. Compare and retry.', correlation_id: 'c2', details: null } })
        : json(403, { error: { code: 'FORBIDDEN', message: 'This intern is not in your company.', correlation_id: 'c3', details: null } })));
    const { api } = await load();

    await expect(api('invalid')).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR', message: 'Fill in at least one field.' });
    await expect(api('stale')).rejects.toMatchObject({
      status: 412,
      code: 'STALE_VERSION',
      message: 'This was changed in another tab or by someone else. Reload the page to see the latest; your text stays on screen until you do.',
    });
    await expect(api('other')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'This intern is not in your company.' });
  });

  it('a body that is not the envelope (a proxy error page) still gives a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })));
    const { api } = await load();

    await expect(api('me/logbook')).rejects.toMatchObject({ status: 502, code: 'HTTP_502', message: 'The server answered 502.' });
  });
```

and in the `currentUser` test:

```ts
    stub(() => json(401, { error: { code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.', correlation_id: 'c', details: null } }));
```

In `tests/unit/http.test.ts`:
- line 126: `json(404, { error: { code: 'RESOURCE_NOT_FOUND', message: 'Not found', correlation_id: 'c', details: null } })`
- line 195: `json(412, { error: { code: 'STALE_VERSION', message: 'This item changed elsewhere. Compare and retry.', correlation_id: 'c', details: null } })`

Run: `npx vitest run tests/unit/api.test.ts`
Expected: FAIL. `code` is `HTTP_422`, not `VALIDATION_ERROR`, and the 403 message is `The server answered 403.`

- [ ] **Step 3: Implement.** In `src/data/api.ts`:
  - Replace line 1 with `/** Thin client for appv3's /api/v1: cookie session, CSRF handshake, ETags and the Rizurf error envelope. */`.
  - Replace `interface Problem …` with:

```ts
/** The Rizurf error envelope (RIZURF_API_TEMPLATE.md SS-5). */
interface Envelope { error?: { code?: string; message?: string; details?: Record<string, unknown> | null } }
```

  - Replace `problemText` with:

```ts
function problemText(status: number, e: Envelope['error']): string {
  if (status === 412) return STALE;
  const first = e?.details ? Object.values(e.details).flat().find((x): x is string => typeof x === 'string') : undefined;
  return first ?? e?.message ?? `The server answered ${status}.`;
}
```

  - In `api()`, replace the `if (!res.ok)` block with:

```ts
  if (!res.ok) {
    const e = (payload as Envelope | undefined)?.error;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, problemText(res.status, e));
  }
```

- [ ] **Step 4: Run all tests and the build (GREEN).**

Run: `npx vitest run; npm run build`
Expected: 128/128 unit tests pass (127 before, plus the 502 test), and `vue-tsc` and the build pass.

- [ ] **Step 5: Commit.**

```bash
git add src/data/api.ts tests/unit/api.test.ts tests/unit/http.test.ts
git commit -m "feat: read the Rizurf error envelope from the logbook API"
```

---

### Task 5: Docs — gateway checks in the deploy guide, and the roadmap

**Files:**
- Modify: `rizurf-logbook-app/appv3/DEPLOY.md` (§6), `intern-logbook/docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` (Step 4 and §4)

- [ ] **Step 1: DEPLOY.md.** In §6, replace the paragraph from "This should return HTTP 200." to the end of that list with:

````markdown
This should return HTTP 200 with `"service": "intern-logbook"` and `"status": "ok"`. If `service` shows a different name, something else is answering on that address.

Also check:

```bash
curl https://api.company.com/api/v1/openapi.json   # 200, a JSON document
curl https://api.company.com/api/v1/nonexistent    # 404 with {"error": {"code": "RESOURCE_NOT_FOUND", ...}}
```

### Connecting to the Rizurf gateway

In the gateway console, open **Conformance**, paste the base URL below, and run it. Every check must pass. Then go to **Connect a service**, paste the same URL, and ask an administrator to approve it in **Connections**.

```
SERVICE READY

  Base URL     https://api.company.com/api/v1
  Service id   intern-logbook
  Domain       Human Resources
  Owner        intern-logbook-team
  Endpoints    25
  Start it     already running under the web server (section 5)
```

Send the developer:

- the API address (`https://api.company.com`);
- the screens' address (`https://logbook.company.com`);
- the conformance result (a screenshot, or the list of failed rules if any).
````

- [ ] **Step 2: Roadmap.** In `intern-logbook/docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md`, replace the `### Step 4` section with:

```markdown
### Step 4a: Pass the gateway's checks
- appv3 follows `RIZURF_API_TEMPLATE.md`'s checked rules: the `{"error": {...}}` body with the reserved codes, `X-Correlation-ID`, `/health` with the service id `intern-logbook`, and `/openapi.json` with the catalogue metadata.
- The prototype reads the new error body.
- **Done when:** the gateway's Conformance page shows 0 failures for `https://<api>/api/v1`.

### Step 4b: Sign in through the gateway
Follows `MICROAPP_AUTH.md`.
- The server swaps the gateway's one-time code for an identity token, verifies it (RS256 against the gateway's JWKS, then `token_use`, `iss`, `aud`, `exp`), and starts its own 15-minute session holding `sid` and `sub`.
- Every signed-in request asks the gateway's `/oauth/introspect` whether the session is still live (no cache; fail open on network errors), and answers `401` once it isn't.
- Roles are read from the logbook database's `users.role` column, matched by the gateway identity. The gateway's own `role` claim is ignored.
- Removed: passwords, `/auth/login`, `/auth/logout`, the sign-in form and the Sign out button. The gateway is the only place to sign in or out.
- `Cache-Control: no-store` on every API response.
- The **Viewing as** dropdown and the **Load / Reset demo data** buttons show only in builds without `VITE_API_URL`.
- On a `401`, the screens send the browser to the gateway's sign-in page (guarded in `sessionStorage` so it can't loop).
- **Done when:** people coming from the gateway land signed in with the right role; signing out at the gateway locks the logbook on its next request; someone who isn't signed in can't see any data.
```

In §4, replace question 1 with:

```markdown
1. **Answered:** `MICROAPP_AUTH.md` and `RIZURF_API_TEMPLATE.md` have been received. Still needed from the gateway admin for step 4b: the logbook's service id as registered (the token's `aud`), the gateway's address (`GATEWAY_URL`), and the screens' address as registered (`PUBLIC_URL`).
```

and question 2 with:

```markdown
2. **Answered:** roles come from the logbook database's `users.role` column. The gateway's `role` claim is its own console role and is not used.
```

- [ ] **Step 3: Commit both repos.**

```bash
cd C:/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app
git add appv3/DEPLOY.md
git commit -m "docs(deploy): check the gateway documents and connect to the gateway"
git push

cd ../intern-logbook
git add docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md
git commit -m "docs(roadmap): split step 4 into the gateway's checks (4a) and gateway sign-in (4b)"
```

---

## After the tasks

- Final whole-branch review of both branches, then fix its findings.
- The backend opens a PR to `master` and the prototype a PR to `logbook-prototype`. Both merge only when the user says so.
- **The real proof comes later:** once the VPS test server runs this, the gateway's Conformance page must show 0 failures. If it fails on the cookie security scheme or the route names (see Deviations), those are the follow-ups.
