# Step 5: AI Summaries on the Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the prototype's OpenAI fallback (`public/api/summarize.php`) into appv3 as `POST /api/v1/summaries`. Only signed-in people can use it, each person gets 20 requests a day, and the OpenAI key never leaves the server.

**Architecture:**
- **Server:** one controller, `SummaryController`, validates the answer boxes and sends each box that has notes to OpenAI in a single `Http::pool`, so several boxes take about as long as one. It returns `{summaries: [...]}`.
- **Limits and errors:** a named rate limiter (`summaries`, per user per day) returns the Rizurf error envelope. OpenAI's own error text is logged by status only and never passed to the browser.
- **Prototype:** `src/lib/summarize.ts` still tries Chrome's free built-in Summarizer first. When it isn't there, the prototype calls the new endpoint through the existing `api()` client. In builds without a server, it shows the "needs Chrome" message.

**Tech Stack:**
- Backend: Laravel 13 (PHP 8.4), Laravel HTTP client (`Http::pool`, `Http::fake`) and `RateLimiter`.
- Prototype: Vue 3, Vitest (`vi.stubEnv`, `vi.stubGlobal`).

**Spec:** `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook\docs\superpowers\specs\2026-09-29-go-live-roadmap-design.md` (Step 5).

**Repos and branches:**

| Repo | Folder | Branch | Base |
|---|---|---|---|
| Backend | `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app` (app in `appv3/backend`) | `feat/step-5-ai-summaries` | `master` |
| Prototype | `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook` | `feat/step-5-prototype-ai-summaries` | local `master` (tracks `origin/logbook-prototype`) |

Both folders push to the same GitHub repo, so the two branch names must stay different.

## Global Constraints

From the spec:
- "Move `public/api/summarize.php` into a Laravel endpoint, `POST /api/v1/summaries`."
- "It only works for signed-in users, and each user has a daily limit (20 requests)."
- "The OpenAI key lives only in the VPS's `.env`."
- "The prototype still tries Chrome's free built-in AI first."
- Done when: "signed-out calls get a 401, the limit returns a 429 with a friendly message, and the key never appears in the browser."
- The model stays `gpt-4o-mini`, as the spec's risk table says.

How to work:
- Errors use the Rizurf envelope `{"error": {code, message, correlation_id, details}}` via `App\Support\Problem`, with the reserved codes: 429 `RATE_LIMITED`, 503 `SERVICE_UNAVAILABLE`, 422 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`.
- Every route must be documented in `appv3/backend/resources/openapi.json` (`OpenApiTest` checks route parity and the metadata).
- **Backend tests run only in GitHub CI.** The local PHP is 8.2 and the app needs 8.4.
  - To see a test fail or pass: commit, `git push`, then read the run, e.g. `python <scratchpad>/webgate.py HEAD` or the Actions tab.
  - Format PHP locally with `php "$TEMP/pinttool/vendor/bin/pint" <paths>`.
- **Prototype:** `npm test` and `npm run e2e` must pass before calling a change done (`intern-logbook/CLAUDE.md`).
- Never put a real API key in a committed file. Tests use `sk-test-key`.

## Review Focus

1. **OpenAI error text could leak the key.** When OpenAI refuses the key, its message quotes part of it ("Incorrect API key provided: sk-tes***"). The intern must see a plain "try again" message, and no part of OpenAI's text. (Task 1: `test_openai_errors_never_reach_the_browser`)
2. **An answer box with no notes this week** should come back as `''` without costing an OpenAI call, while the other boxes are still summarized. (Task 1: `test_a_box_without_notes_stays_empty_and_is_not_sent`)
3. **The 21st request in a day** gets a 429 with a friendly sentence, and only for that person. Someone else at the same desk or IP can still summarize. (Task 1: `test_the_daily_limit_is_per_person_with_a_friendly_429`)
4. **OpenAI unreachable** gives a 503 with a friendly sentence, not a 500 stack trace. (Task 1: `test_an_unreachable_openai_is_503`)
5. **A browser-only build (no `VITE_API_URL`) without Chrome's AI** says what's needed and makes no network call. Before, it called `api/summarize.php`, which no longer exists. (Task 2: `without a server or built-in AI, says what is needed and calls nothing`)

---

### Task 1: `POST /api/v1/summaries` on the server

Work in `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app` on a new branch:

```bash
git checkout master && git pull && git checkout -b feat/step-5-ai-summaries
```

All paths below are relative to `appv3/backend` unless they start with `appv3/`.

**Files:**
- Modify: `phpunit.xml` (test key)
- Modify: `tests/TestCase.php` (fake OpenAI next to the fake gateway)
- Create: `tests/Feature/SummaryTest.php`
- Modify: `config/services.php` (the key)
- Modify: `config/portal.php` (the daily limit)
- Modify: `app/Providers/AppServiceProvider.php` (the `summaries` limiter)
- Create: `app/Http/Controllers/SummaryController.php`
- Modify: `routes/portal.php` (the route)
- Modify: `resources/openapi.json` (the operation plus the "Keep a Logbook" capability)
- Modify: `.env.example`, `appv3/DEPLOY.md`

**Interfaces:**
- Consumes: `App\Support\Problem::throw(int $status, string $code, string $title, ?string $detail = null, ?array $errors = null): never` and `Problem::response(int $status, string $code, string $title, ?string $detail, ?array $errors, ?Request $request): JsonResponse`; `TestCase::portal(string $method, string $uri, array $data = [])`; `TestCase::be()` (signs in with a live gateway session); `TestCase::user(string $id)`.
- Produces:
  - `POST /api/v1/summaries` with body `{"items": [{"label": string ≤300, "text": string|null}]}` (1–10 items).
  - Its answers:

    | Status | Body |
    |---|---|
    | 200 | `{"summaries": string[]}`, same order and length as `items` |
    | 401 | signed out |
    | 422 | bad items |
    | 429 `RATE_LIMITED` | the daily limit is used up |
    | 503 `SERVICE_UNAVAILABLE` | no key, or OpenAI failed |

  - Task 2 relies on the 200 shape and on the envelope's `message`.

- [ ] **Step 1: Give the tests a key and a fake OpenAI**

In `phpunit.xml`, next to `<env name="GATEWAY_URL" value="https://gateway.test"/>`, add:

```xml
        <env name="OPENAI_API_KEY" value="sk-test-key"/>
```

In `tests/TestCase.php`, add two properties under `protected bool $gatewayDown = false;`:

```php
    /** The fake OpenAI's HTTP status. Anything but 200 answers with an error that quotes the key, as OpenAI does. */
    protected int $openAiStatus = 200;

    /** Every connection to the fake OpenAI fails. */
    protected bool $openAiDown = false;
```

In `fakeGateway()`'s `match (true)`, add this arm before `default`:

```php
            str_starts_with($url, 'https://api.openai.com/') => $this->fakeOpenAi($request),
```

Add this method after `fakeGateway()`:

```php
    private function fakeOpenAi(ClientRequest $request): mixed
    {
        if ($this->openAiDown) {
            throw new ConnectException('OpenAI down', new GuzzleRequest('POST', $request->url()));
        }
        if ($this->openAiStatus !== 200) {
            return Http::response(['error' => ['message' => 'Incorrect API key provided: sk-tes*****key.']], $this->openAiStatus);
        }

        // Echo the section title back, so a test can tell which answer box each summary belongs to.
        preg_match('/^Logbook section: (.*)$/m', (string) $request['messages'][1]['content'], $m);

        return Http::response(['choices' => [['message' => ['content' => "  Summary for {$m[1]}\n"]]]]);
    }
```

- [ ] **Step 2: Write the failing tests**

Create `tests/Feature/SummaryTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class SummaryTest extends TestCase
{
    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function summarize(array $items): TestResponse
    {
        return $this->portal('POST', '/api/v1/summaries', ['items' => $items]);
    }

    private function openAiCalls(): int
    {
        return count(Http::recorded(fn (ClientRequest $request) => str_starts_with($request->url(), 'https://api.openai.com/')));
    }

    public function test_summarizes_each_answer_box_with_openai_using_the_server_key(): void
    {
        $this->be($this->user('student-1'));

        $this->summarize([
            ['label' => 'Tasks done', 'text' => "- set up the dev environment\n- fixed the login bug"],
            ['label' => 'Learnings', 'text' => '- Laravel queues'],
        ])->assertOk()->assertExactJson(['summaries' => ['Summary for Tasks done', 'Summary for Learnings']]);

        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://api.openai.com/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer sk-test-key')
            && $request['model'] === 'gpt-4o-mini'
            && str_contains($request['messages'][1]['content'], 'fixed the login bug'));
    }

    public function test_a_box_without_notes_stays_empty_and_is_not_sent(): void
    {
        $this->be($this->user('student-1'));

        $this->summarize([
            ['label' => 'Tasks done', 'text' => '   '],
            ['label' => 'Learnings', 'text' => '- Laravel queues'],
        ])->assertOk()->assertExactJson(['summaries' => ['', 'Summary for Learnings']]);

        $this->assertSame(1, $this->openAiCalls());
    }

    public function test_the_daily_limit_is_per_person_with_a_friendly_429(): void
    {
        config(['portal.summaries_per_day' => 2]);
        $items = [['label' => 'Tasks done', 'text' => '- fixed the login bug']];

        $this->be($this->user('student-1'));
        $this->summarize($items)->assertOk();
        $this->summarize($items)->assertOk();
        $this->summarize($items)
            ->assertStatus(429)
            ->assertJsonPath('error.code', 'RATE_LIMITED')
            ->assertJsonPath('error.message', "You've used today's AI summaries. Try again tomorrow, or write this week's answers yourself.");

        $this->be($this->user('student-2'));
        $this->summarize($items)->assertOk();
    }

    public function test_openai_errors_never_reach_the_browser(): void
    {
        $this->be($this->user('student-1'));
        $this->openAiStatus = 401;

        $response = $this->summarize([['label' => 'Tasks done', 'text' => '- fixed the login bug']]);

        $response->assertStatus(503)->assertJsonPath('error.code', 'SERVICE_UNAVAILABLE');
        $this->assertStringNotContainsString('sk-', (string) $response->getContent());
        $this->assertStringNotContainsString('Incorrect API key', (string) $response->getContent());
    }

    public function test_an_unreachable_openai_is_503(): void
    {
        $this->be($this->user('student-1'));
        $this->openAiDown = true;

        $this->summarize([['label' => 'Tasks done', 'text' => '- fixed the login bug']])
            ->assertStatus(503)
            ->assertJsonPath('error.message', "The AI service didn't answer. Try again in a minute, or write the summary yourself.");
    }

    public function test_without_a_key_the_server_says_so_and_calls_nothing(): void
    {
        $this->be($this->user('student-1'));
        config(['services.openai.key' => null]);

        $this->summarize([['label' => 'Tasks done', 'text' => '- fixed the login bug']])
            ->assertStatus(503)
            ->assertJsonPath('error.message', "AI summaries aren't set up on this server. Chrome 138+ on a desktop has free built-in summaries.");
        $this->assertSame(0, $this->openAiCalls());
    }

    public function test_the_answer_boxes_are_checked(): void
    {
        $this->be($this->user('student-1'));

        $this->summarize([])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION_ERROR');
        $this->summarize(array_fill(0, 11, ['label' => 'Tasks done', 'text' => '- notes']))->assertStatus(422);
        $this->summarize([['text' => '- notes']])->assertStatus(422);
        $this->assertSame(0, $this->openAiCalls());
    }

    public function test_signed_out_callers_get_401(): void
    {
        $this->summarize([['label' => 'Tasks done', 'text' => '- notes']])->assertUnauthorized();
    }
}
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
php "$TEMP/pinttool/vendor/bin/pint" tests
git add phpunit.xml tests && git commit -m "test(summaries): pin POST /api/v1/summaries (red)"
git push -u origin feat/step-5-ai-summaries
```

Expected: CI is red. Every `SummaryTest` case fails with 404 because the route doesn't exist yet. Every other test still passes.

- [ ] **Step 4: Add the key and the daily limit to config**

In `config/services.php`, add before the closing `];`:

```php
    'openai' => [
        'key' => env('OPENAI_API_KEY'),
    ],
```

In `config/portal.php`, next to `'login_rate_per_minute'`, add:

```php
    'summaries_per_day' => (int) env('AI_SUMMARIES_PER_DAY', 20),
```

- [ ] **Step 5: Add the `summaries` limiter**

In `app/Providers/AppServiceProvider.php`, after the `portal-api` limiter, add the code below. Then add `use App\Support\Problem;` and `use Symfony\Component\HttpFoundation\Response;` to the imports if they aren't there.

```php
        // Each person's AI summaries per day (roadmap step 5): OpenAI is billed per use.
        RateLimiter::for('summaries', function (Request $request): Limit {
            return Limit::perDay((int) config('portal.summaries_per_day', 20))
                ->by((string) $request->user()?->getAuthIdentifier())
                ->response(fn (Request $request, array $headers) => Problem::response(
                    Response::HTTP_TOO_MANY_REQUESTS,
                    'RATE_LIMITED',
                    "You've used today's AI summaries. Try again tomorrow, or write this week's answers yourself.",
                    null,
                    null,
                    $request,
                )->withHeaders($headers));
        });
```

- [ ] **Step 6: Write the controller**

Create `app/Http/Controllers/SummaryController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Support\Problem;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * AI summaries of a week's notes (roadmap step 5), for browsers without Chrome's free built-in AI.
 * The OpenAI key lives only in the server's .env, and nothing OpenAI says is passed back to the browser.
 */
final class SummaryController extends Controller
{
    private const URL = 'https://api.openai.com/v1/chat/completions';

    private const MODEL = 'gpt-4o-mini';

    private const SYSTEM = "You write entries for a university internship logbook from an intern's own daily work notes.\n"
        ."Write ONE flowing paragraph in past tense that walks through the week in order, e.g.:\n"
        .'"Got the ERP gateway dev environment running and the test suite passing, then fixed a login redirect bug with a unit test to back it up. '
        ."Mid-week, picked up the invoice export ticket at sprint planning and built and Postman-tested the export endpoint. "
        ."Closed the week by reviewing a teammate's PR and updating the API docs.\"\n"
        ."Use only what the notes say — never invent tasks, tools, or results.\n"
        ."Fit the paragraph to the section title you're given. Plain text only: no bullet points, headings or markdown.";

    public function store(Request $request): JsonResponse
    {
        /** @var array<int, array{label: string, text: ?string}> $items */
        $items = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:10'],
            'items.*.label' => ['required', 'string', 'max:300'],
            'items.*.text' => ['present', 'nullable', 'string'],
        ])['items'];

        $key = (string) config('services.openai.key');
        if ($key === '') {
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', "AI summaries aren't set up on this server. Chrome 138+ on a desktop has free built-in summaries.");
        }

        // Only boxes with notes go to OpenAI, all at once, so a week with several boxes answers about as fast as one.
        $notes = array_filter(
            array_map(fn (array $item): string => mb_substr(trim((string) $item['text']), 0, 20000), $items),
            fn (string $text): bool => $text !== '',
        );
        $replies = $notes === [] ? [] : Http::pool(fn (Pool $pool) => array_map(
            fn (int $i) => $pool->as((string) $i)->withToken($key)->acceptJson()->timeout(50)->post(self::URL, [
                'model' => self::MODEL,
                'max_tokens' => 800,
                'messages' => [
                    ['role' => 'system', 'content' => self::SYSTEM],
                    ['role' => 'user', 'content' => "Logbook section: {$items[$i]['label']}\n\nThis week's notes:\n{$notes[$i]}"],
                ],
            ]),
            array_keys($notes),
        ));

        $summaries = [];
        foreach (array_keys($items) as $i) {
            if (! isset($notes[$i])) {
                $summaries[] = '';

                continue;
            }
            $reply = $replies[(string) $i] ?? null;
            $text = $reply instanceof ClientResponse && $reply->successful() ? $reply->json('choices.0.message.content') : null;
            if (! is_string($text)) {
                // OpenAI's own message can quote part of the key: log the status only, never pass it on.
                Log::warning('AI summary failed', ['status' => $reply instanceof ClientResponse ? $reply->status() : 'unreachable']);
                Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', "The AI service didn't answer. Try again in a minute, or write the summary yourself.");
            }
            $summaries[] = trim($text);
        }

        return response()->json(['summaries' => $summaries]);
    }
}
```

- [ ] **Step 7: Add the route**

In `routes/portal.php`, add `use App\Http\Controllers\SummaryController;` to the imports. Then add the line below after the `me/...` routes:

```php
    Route::post('summaries', [SummaryController::class, 'store'])->middleware(['auth', 'throttle:summaries']);
```

- [ ] **Step 8: Document the operation**

`OpenApiTest` fails on any route missing from `resources/openapi.json`. Run this from `appv3/backend`. It keeps the file's two-space JSON format:

```bash
node -e '
const fs = require("fs"); const f = "resources/openapi.json";
const d = JSON.parse(fs.readFileSync(f, "utf8"));
d.paths["/summaries"] = { post: {
  summary: "Summarize a week of notes into one paragraph per logbook answer box.",
  responses: { "200": { description: "OK." }, default: { description: "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." } },
  "x-rizurf": {
    name: "Summarize Notes", purpose: "Turn a week of notes into logbook paragraphs",
    use_when: ["An intern wants a first draft of a week\u2019s answers", "The browser has no built-in AI"],
    do_not_use_when: ["Saving the answers (use PUT /me/journal/weeks/{weekNumber}/values)"],
    inputs: ["items[].label", "items[].text"], outputs: ["summaries"],
    requires: ["Signed-in session", "OPENAI_API_KEY on the server", "At most 20 requests per person per day"],
    related_endpoints: ["PUT /me/journal/weeks/{weekNumber}/values"],
    tags: ["ai", "summary", "summarize", "openai", "draft"] } } };
d.info["x-rizurf"].capabilities.find(c => c.name === "Keep a Logbook").endpoints.push("POST /summaries");
fs.writeFileSync(f, JSON.stringify(d, null, 2) + "\n");'
git diff --stat resources/openapi.json
```

Expected: only additions in `resources/openapi.json`, about 40 lines. If the whole file shows as changed, its original format differs: run `git checkout resources/openapi.json`, match its indent and final newline in the script, and run it again.

- [ ] **Step 9: Document the setting for the server admin**

In `.env.example`, after the `GATEWAY_URL`/`PUBLIC_URL` lines, add:

```ini
# Optional: AI summaries for browsers without Chrome's built-in AI (gpt-4o-mini, billed per use).
OPENAI_API_KEY=
AI_SUMMARIES_PER_DAY=20
```

In `appv3/DEPLOY.md`, in the section 4 `.env` block, after the `PUBLIC_URL=` line, add:

```ini

# Optional: AI summaries for browsers without Chrome's built-in AI (gpt-4o-mini, billed per use).
OPENAI_API_KEY=<the key from platform.openai.com>
```

Under the paragraph that starts "The API refuses to start without", add:

```markdown
`OPENAI_API_KEY` is optional. Without it, AI summaries only work in Chrome 138+ on a desktop (free, on the person's own computer). With it, other browsers get them through the server, up to 20 a day per person (`AI_SUMMARIES_PER_DAY`). The key stays in `.env`; the logbook never sends it to a browser.
```

In the "SERVICE READY" block, change `Endpoints    25` to `Endpoints    26`.

- [ ] **Step 10: Run the tests to see them pass**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app config routes tests
git add -A . ../DEPLOY.md && git commit -m "feat(summaries): POST /api/v1/summaries with a per-person daily limit"
git push
```

Expected: CI green. That means all `SummaryTest` cases pass, `OpenApiTest` passes with 26 operations (including "every protected operation refuses anonymous callers"), and PHPStan and Pint are clean.

If `test_an_unreachable_openai_is_503` gets a 500 instead, this Laravel version's `Http::pool` threw the `ConnectionException` instead of returning it. Wrap the `Http::pool(...)` call in `try { … } catch (ConnectionException) { Problem::throw(503, …same message…); }`, and record a ruling.

---

### Task 2: The prototype asks the server

Work in `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`:

```bash
git checkout master && git pull && git checkout -b feat/step-5-prototype-ai-summaries
```

**Files:**
- Create: `tests/unit/summarize.test.ts`
- Modify: `src/lib/summarize.ts`
- Delete: `public/api/summarize.php`, `public/api/config.example.php`
- Modify: `.gitignore` (drop `public/api/config.php`)
- Modify: `README.md`

**Interfaces:**
- Consumes: `api<T>(path, { method, body }): Promise<{ data: T; etag?: string }>` and `SERVER_MODE: boolean` from `src/data/api.ts`. A non-2xx answer throws `ApiError` whose `message` is the envelope's `message` (401 becomes the signed-out text). Also Task 1's `POST /api/v1/summaries`.
- Produces: `summarizeFields(items: { label: string; text: string }[]): Promise<string[]>`, unchanged for `src/views/student/Builder.vue`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/summarize.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ITEMS = [{ label: 'Tasks done', text: '- fixed the login bug' }];

/** A fresh module per test: SERVER_MODE is read from VITE_API_URL when api.ts loads. */
async function load(apiUrl: string) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiUrl);
  return import('../../src/lib/summarize');
}

let posted: { url: string; body: unknown }[];
function server(reply: Response) {
  posted = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    posted.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined });
    return reply;
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('summarizeFields', () => {
  it('asks the logbook server when the browser has no built-in AI', async () => {
    server(json(200, { summaries: ['Fixed the login bug.'] }));
    const { summarizeFields } = await load('https://api.test');

    expect(await summarizeFields(ITEMS)).toEqual(['Fixed the login bug.']);
    expect(posted).toEqual([{ url: 'https://api.test/api/v1/summaries', body: { items: ITEMS } }]);
  });

  it("shows the server's message when today's limit is used up", async () => {
    server(json(429, { error: { code: 'RATE_LIMITED', message: "You've used today's AI summaries. Try again tomorrow, or write this week's answers yourself.", correlation_id: 'c', details: null } }));
    const { summarizeFields } = await load('https://api.test');

    await expect(summarizeFields(ITEMS)).rejects.toThrow("You've used today's AI summaries.");
  });

  it('without a server or built-in AI, says what is needed and calls nothing', async () => {
    server(json(500, {}));
    const { summarizeFields } = await load('');

    await expect(summarizeFields(ITEMS)).rejects.toThrow('AI summaries need Chrome 138+ on a desktop');
    expect(posted).toEqual([]);
  });

  it("uses the browser's free built-in AI first", async () => {
    server(json(500, {}));
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async () => ({ summarize: async () => 'On-device summary.', destroy() {} }),
    });
    const { summarizeFields } = await load('https://api.test');

    expect(await summarizeFields(ITEMS)).toEqual(['On-device summary.']);
    expect(posted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/summarize.test.ts`

Expected:
- FAIL: "asks the logbook server" (the old code posts to `/api/summarize.php`).
- FAIL: "without a server or built-in AI" (the old code calls fetch).
- The 429 case may fail or pass by accident, depending on how the old code reads the body. Either is fine.
- PASS: "uses the browser's free built-in AI first".

- [ ] **Step 3: Call the endpoint through `api()`**

In `src/lib/summarize.ts`:

1. Replace the two header comment lines with:

```ts
// Free first: Chrome's built-in on-device Summarizer (Chrome 138+ desktop) — no key, no cost, notes stay on the machine.
// Otherwise, in server mode: POST /api/v1/summaries, where the server's OpenAI key (gpt-4o-mini) does it, up to 20 a day per person.
import { api, SERVER_MODE } from '../data/api';
```

2. Replace the whole `viaServer` function with:

```ts
const NEEDS_CHROME = 'AI summaries need Chrome 138+ on a desktop (free, built in). Your notes are kept as bullet points.';

async function viaServer(items: Item[]): Promise<string[]> {
  if (!SERVER_MODE) throw new Error(NEEDS_CHROME);
  return (await api<{ summaries: string[] }>('summaries', { method: 'POST', body: { items } })).data.summaries;
}
```

`onDevice` and `summarizeFields` stay as they are.

- [ ] **Step 4: Remove the old PHP endpoint**

```bash
git rm public/api/summarize.php public/api/config.example.php
```

In `.gitignore`, delete the line `public/api/config.php`. If someone has a local `public/api/config.php` with a key, leave it alone. It's git-ignored and no longer used; tell the user they can delete it.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: all unit tests pass (135 before plus 4 new = 139).

Run: `npm run build`, then `npm run e2e`.
Expected: the build succeeds and 11/11 end-to-end tests pass.

- [ ] **Step 6: Tell readers where summaries come from**

In `README.md`, in "Server mode", after the paragraph that ends "the logbook locks on its next request.", add:

```markdown
**✨ Summarize week** uses Chrome's free built-in AI when the browser has it (Chrome 138+ on a desktop). Other browsers ask the server, which uses its OpenAI key, up to 20 a day per person (see `OPENAI_API_KEY` in DEPLOY.md). A build without a server has only Chrome's AI.
```

- [ ] **Step 7: Commit**

```bash
git add -A src tests public .gitignore README.md
git commit -m "feat(summaries): ask the logbook server instead of summarize.php"
```

---

## Decisions this plan makes

- **A missing `OPENAI_API_KEY` doesn't stop the server from starting** (unlike `GATEWAY_URL`). Summaries are optional, since Chrome's AI comes first, so the endpoint answers 503 with a sentence instead.
- **The limit counts requests, not answer boxes**, as the spec says ("20 requests"). One request can hold up to 10 boxes. Failed and refused requests count too, because Laravel's throttle counts every hit.
- **Who can use it:** any signed-in person. The spec says "signed-in users", not "interns".
- **Notes longer than 20,000 characters per box are cut, not refused**, as `summarize.php` did. The intern gets a summary of most of the week instead of an error.
- **Browser-only builds (XAMPP demo) lose the OpenAI fallback.** The spec moves it to Laravel, and those builds have no server to call.
