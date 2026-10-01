# Step 6 (without the gateway connection): Counts and Backups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything in step 6 that doesn't need the live gateway:
- the badge endpoint the gateway reads for the logbook's icon;
- the same count on the prototype's **Review** link;
- the VPS's daily backups.

**Architecture:**
- **Badge endpoint:** appv3 serves `GET /api/v1/gateway/badges` (MICROAPP_BADGES.md). It is guarded by a gateway-signed access token, which `Gateway` verifies with the same keys and checks as sign-in, plus `token_use: access` and the `gateway:badges:read` scope.
- **What it counts:** one SQL union returns, per email:
  - **supervisors:** weeks waiting for review at their company;
  - **interns:** weeks sent back to them with changes requested.
- **Review link:** the prototype shows the supervisor's waiting count on **Review**, taken from the review store it already has.
- **Backups:** a cron file and a short script in DEPLOY.md, with a restore test.

**Tech Stack:**
- Backend: Laravel 13 (PHP 8.4), firebase/php-jwt 7.
- Prototype: Vue 3 + Pinia, Playwright.
- Server: POSIX `sh`, `mysqldump`, cron.

**Spec:** `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook\docs\superpowers\specs\2026-09-29-go-live-roadmap-design.md` (Step 6). The gateway contract is `MICROAPP_BADGES.md`, received over WhatsApp at `C:\Users\User\AppData\Local\Packages\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\LocalState\sessions\C5EE69E6692FB116A8A78DC04B8BFCC462CE8BED\transfers\2026-39\MICROAPP_BADGES (1).md`. The count's look comes from `RIZURF_UI_STANDARD.md` in the same folder ("Counts and badges").

**Repos and branches:**

| Repo | Folder | Branch | Base |
|---|---|---|---|
| Backend | `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app` (app in `appv3/backend`) | `feat/step-6-counts-and-backups` | `master` |
| Prototype | `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook` | `feat/step-6-prototype-review-count` | local `master` (tracks `origin/logbook-prototype`) |

Both folders push to the same GitHub repo, so the branch names must stay different.

**Not in this plan (it stays last, by the user's choice):** connecting to the real gateway, its **App badges** check, and the full run-through on the VPS.

## Global Constraints

From the spec:
- Counts: "the number on the logbook's icon in the gateway's **Your apps** (`MICROAPP_BADGES.md`): weeks waiting for this supervisor, or weeks sent back to this intern; the same count on the **Review** link."
- Backups: "the MySQL database (`mysqldump`) and `storage/app/private`, kept for 14 days, with one restore test."

From MICROAPP_BADGES.md:
- The route is `GET /gateway/badges` at the base URL, which for this app is `https://<api>/api/v1`.
- It answers `{"badges": [{"email", "count"}]}`, listing only people whose count is above 0. Counts only, at most 5,000 people, `cache-control: no-store`.
- The token is checked like the sign-in token (RS256 via JWKS, `iss`, `exp`), with `aud` = `intern-logbook`, `token_use` = `access`, and `scope` containing `gateway:badges:read`. Anything else gets 401.
- The route must not be behind the app's sign-in.

From RIZURF_UI_STANDARD.md:
- The count is a red `#E5484D` pill (`--count`) with white bold 11px text, hidden at 0, one per section.
- With the sidebar collapsed, it sits on the icon's corner.

How to work:
- Errors use the Rizurf envelope via `App\Support\Problem`, with the reserved code 401 `UNAUTHORIZED`.
- Every route is documented in `appv3/backend/resources/openapi.json`. `OpenApiTest` checks that routes and documentation match, and that only `GET /auth/sign-in`, `GET /health`, `GET /openapi.json` and `POST /auth/gateway` have `security: []`.
- **Backend tests run only in GitHub CI** (local PHP is 8.2):
  - to run them, commit, `git push`, then read the run (`python <scratchpad>/webgate.py HEAD` or the Actions tab);
  - format with `php "$TEMP/pinttool/vendor/bin/pint" <paths>`.
- **Prototype:** `npm test` and `npm run e2e` must pass. `npm run build` writes into `C:\xampp\htdocs`, so check the build with `npx vue-tsc --noEmit` and `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.

## Review Focus

1. **A gateway token that isn't for badges must not read counts.** That covers:
   - the sign-in (identity) token;
   - an access token minted for another service;
   - an access token without the `gateway:badges:read` scope;
   - a token signed by another key.

   Every one gets 401 with no `badges` key. (Task 1: `test_only_the_gateways_badge_token_reads_counts`)
2. **Company boundaries.** A supervisor counts only their own company's waiting weeks. A company with no supervisor adds nobody. Two supervisors at one company each see the full count. (Task 1: `test_supervisors_count_only_their_own_company`)
3. **A sent-back week the intern resubmits moves from the intern's count to the supervisor's.** Drafts and approved weeks count for nobody. (Task 1: `test_a_resubmitted_week_moves_from_the_intern_to_the_supervisor`)
4. **The gateway calls with no browser session.** It must get 200 and no-store, not a redirect or a 401 from the sign-in checks. (Task 1: `test_the_gateway_reads_waiting_and_sent_back_weeks_per_person`)
5. **The Review link count matches the queue.** It goes down when the supervisor decides a week, comes back when the intern resubmits, and is hidden at 0. (Task 3: the e2e flow assertions)

---

### Task 1: `GET /api/v1/gateway/badges`

Work in `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app`:

```bash
git checkout master && git pull && git checkout -b feat/step-6-counts-and-backups
```

Paths are relative to `appv3/backend` unless they start with `appv3/`.

**Files:**
- Create: `tests/Feature/BadgeTest.php`
- Modify: `app/Services/Gateway.php` (shared claim checks; new `verifyBadgeReader`)
- Modify: `app/Http/Controllers/GatewayController.php` (new `badges` action)
- Modify: `routes/portal.php`
- Modify: `resources/openapi.json` (the operation and a `gatewayToken` security scheme)
- Modify: `appv3/DEPLOY.md` (endpoint count; what the gateway reads)

**Interfaces:**
- Consumes:
  - `TestCase::identityToken(array $claims = [], ?string $privateKey = null): string`. It signs with the fake gateway's key, and a claim set to `null` is left out.
  - `TestCase::newRsaKey(string $kid = …): array{private: string, jwk: array}`.
  - `Gateway::verify(string $token, string $expectedUse): array{sid, sub, email, name}`. Its behaviour must not change; `GatewayServiceTest` pins it.
  - `HealthController::SERVICE` (`'intern-logbook'`).
- Produces:
  - `Gateway::verifyBadgeReader(string $token): void`. It throws `ApiProblemException` (401 `UNAUTHORIZED`) on any failure.
  - `GET /api/v1/gateway/badges` → 200 `{"badges": [{"email": string, "count": int}]}`, or a 401 envelope.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/BadgeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Placement;
use App\Models\User;
use App\Models\Week;
use App\Services\WeekService;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class BadgeTest extends TestCase
{
    /**
     * An access token the gateway signs for reading badges (MICROAPP_BADGES.md §2). No person in it.
     *
     * @param  array<string, mixed>  $claims
     */
    private function badgeToken(array $claims = [], ?string $privateKey = null): string
    {
        return $this->identityToken([
            'token_use' => 'access',
            'scope' => 'gateway:badges:read',
            'sub' => 'gateway',
            'sid' => null,
            'email' => null,
            'name' => null,
            'role' => null,
            ...$claims,
        ], $privateKey);
    }

    private function readBadges(?string $token): TestResponse
    {
        return $this->flushHeaders()->getJson('/api/v1/gateway/badges', $token === null ? [] : ['Authorization' => "Bearer {$token}"]);
    }

    /**
     * @return array<string, int>
     */
    private function counts(TestResponse $response): array
    {
        $counts = [];
        foreach ($response->assertOk()->json('badges') as $badge) {
            $counts[$badge['email']] = $badge['count'];
        }
        ksort($counts);

        return $counts;
    }

    private function seededWeek(int $number): Week
    {
        return Week::query()->where('placement_id', 'placement-a')->where('week_number', $number)->firstOrFail();
    }

    public function test_the_gateway_reads_waiting_and_sent_back_weeks_per_person(): void
    {
        // Seeded: Aisha's week 1 waits for review at Nusantara, her week 3 was sent back, week 2 is a draft.
        $response = $this->readBadges($this->badgeToken());

        $this->assertSame([
            'aisha.rahman@student.example.edu' => 1,
            'sarah.lim@nusantara.example.com' => 1,
        ], $this->counts($response));
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertGuest();
    }

    public function test_supervisors_count_only_their_own_company(): void
    {
        User::query()->create(['id' => 'supervisor-2', 'name' => 'Ravi Kumar', 'email' => 'ravi.kumar@nusantara.example.com', 'role' => User::ROLE_SUPERVISOR, 'company_id' => 'company-nusantara']);
        // Daniel's company (Merlion) has no supervisor: his waiting week counts for nobody.
        $this->app->make(WeekService::class)->ensureWeeks(Placement::query()->findOrFail('placement-b'));
        Week::query()->where('placement_id', 'placement-b')->where('week_number', 1)
            ->update(['status' => Week::STATUS_SUBMITTED, 'company_status' => Week::REVIEW_PENDING]);

        $this->assertSame([
            'aisha.rahman@student.example.edu' => 1,
            'ravi.kumar@nusantara.example.com' => 1,
            'sarah.lim@nusantara.example.com' => 1,
        ], $this->counts($this->readBadges($this->badgeToken())));
    }

    public function test_a_resubmitted_week_moves_from_the_intern_to_the_supervisor(): void
    {
        $this->seededWeek(3)->update(['status' => Week::STATUS_SUBMITTED, 'company_status' => Week::REVIEW_PENDING]);
        $this->seededWeek(1)->update(['company_status' => Week::REVIEW_APPROVED]);
        $this->seededWeek(2)->update(['status' => Week::STATUS_SUBMITTED, 'company_status' => Week::REVIEW_PENDING]);

        $this->assertSame(['sarah.lim@nusantara.example.com' => 2], $this->counts($this->readBadges($this->badgeToken())));
    }

    /**
     * @return array<string, array{0: string|null}>
     */
    public static function wrongTokens(): array
    {
        return [
            'no token' => [null],
            'not a token' => ['not-a-token'],
            'the sign-in token' => ['identity'],
            'for another service' => ['other-service'],
            'without the badge scope' => ['no-scope'],
            'signed by another key' => ['other-key'],
        ];
    }

    #[DataProvider('wrongTokens')]
    public function test_only_the_gateways_badge_token_reads_counts(?string $kind): void
    {
        $token = match ($kind) {
            'identity' => $this->identityToken(),
            'other-service' => $this->badgeToken(['aud' => 'payments-api']),
            'no-scope' => $this->badgeToken(['scope' => 'gateway:apps:read']),
            'other-key' => $this->badgeToken([], self::newRsaKey()['private']),
            default => $kind,
        };

        $this->readBadges($token)
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHORIZED')
            ->assertJsonMissingPath('badges');
    }
}
```

- [ ] **Step 2: Run them to see them fail**

```bash
php "$TEMP/pinttool/vendor/bin/pint" tests
git add tests && git commit -m "test(badges): pin GET /api/v1/gateway/badges (red)"
git push -u origin feat/step-6-counts-and-backups
```

Expected: CI is red, and every `BadgeTest` case fails because the route doesn't exist yet:
- most fail with 404;
- `assertGuest` and the `counts()` cases fail on `assertOk`;
- the 401 cases get 404 instead of 401.

Every other test still passes.

- [ ] **Step 3: Share the claim checks in `Gateway`**

In `app/Services/Gateway.php`, replace the whole `verify()` method with the three methods below. `verify()` keeps its signature and behaviour.

```php
    /**
     * Signature (with exp) first, then token_use, iss and aud; fails closed on any of them (§3).
     *
     * @return array{sid: string, sub: string, email: string, name: string}
     */
    public function verify(string $token, string $expectedUse): array
    {
        $claims = $this->claims($token, $expectedUse);

        $valid = is_string($claims['sid'] ?? null) && $claims['sid'] !== ''
            && is_string($claims['sub'] ?? null) && $claims['sub'] !== ''
            && is_string($claims['email'] ?? null) && $claims['email'] !== '';
        if (! $valid) {
            Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', self::UNVERIFIED);
        }

        return [
            'sid' => $claims['sid'],
            'sub' => $claims['sub'],
            'email' => $claims['email'],
            'name' => is_string($claims['name'] ?? null) ? $claims['name'] : $claims['email'],
        ];
    }

    /** Only the gateway's own badge reader may read counts (MICROAPP_BADGES.md §2). */
    public function verifyBadgeReader(string $token): void
    {
        $scopes = explode(' ', (string) ($this->claims($token, 'access')['scope'] ?? ''));
        if (! in_array('gateway:badges:read', $scopes, true)) {
            Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', self::UNVERIFIED);
        }
    }

    /**
     * A token the gateway signed for this service and this use, still in date.
     *
     * @return array<string, mixed>
     */
    private function claims(string $token, string $expectedUse): array
    {
        JWT::$leeway = self::LEEWAY_SECONDS;
        try {
            $claims = (array) JWT::decode($token, $this->keys());
        } catch (UnexpectedValueException $e) {
            if (! str_contains($e->getMessage(), '"kid"')) {
                Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', self::UNVERIFIED);
            }
            // An unknown key id means the gateway rotated its key: fetch the key set once more.
            Cache::forget(self::JWKS_CACHE_KEY);
            $claims = $this->decodeOrFail($token);
        } catch (Throwable) {
            Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', self::UNVERIFIED);
        }

        $valid = ($claims['token_use'] ?? null) === $expectedUse
            && ($claims['iss'] ?? null) === $this->url()
            && ($claims['aud'] ?? null) === HealthController::SERVICE
            && is_int($claims['exp'] ?? null); // JWT::decode rejects an expired token but accepts a missing exp.
        if (! $valid) {
            Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', self::UNVERIFIED);
        }

        return $claims;
    }
```

Before you replace it, compare against the current `verify()`. If it has changed since this plan was written (for example, a different leeway line), keep the current lines and move them into `claims()` unchanged.

- [ ] **Step 4: Add the `badges` action**

In `app/Http/Controllers/GatewayController.php`, add `use App\Models\Week;` and `use Illuminate\Support\Facades\DB;`, then add this method:

```php
    /**
     * The counts on the logbook's icon in the gateway's Your apps (MICROAPP_BADGES.md): weeks waiting for each
     * supervisor at their company, and weeks sent back to each intern. Only people with something are listed.
     */
    public function badges(Request $request): JsonResponse
    {
        $this->gateway->verifyBadgeReader((string) $request->bearerToken());

        $waiting = DB::table('users')
            ->join('placements', 'placements.company_id', '=', 'users.company_id')
            ->join('weeks', 'weeks.placement_id', '=', 'placements.id')
            ->where('users.role', User::ROLE_SUPERVISOR)
            ->where('weeks.status', Week::STATUS_SUBMITTED)
            ->where('weeks.company_status', Week::REVIEW_PENDING)
            ->groupBy('users.email')
            ->select('users.email', DB::raw('COUNT(*) AS count'));
        $sentBack = DB::table('weeks')
            ->join('placements', 'placements.id', '=', 'weeks.placement_id')
            ->join('users', 'users.id', '=', 'placements.student_id')
            ->where('weeks.company_status', Week::REVIEW_CHANGES)
            ->groupBy('users.email')
            ->select('users.email', DB::raw('COUNT(*) AS count'));

        return response()->json(['badges' => $waiting->unionAll($sentBack)->limit(5000)->get()
            ->map(fn (object $row): array => ['email' => (string) $row->email, 'count' => (int) $row->count])
            ->all()]);
    }
```

- [ ] **Step 5: Add the route**

In `routes/portal.php`, after the `auth/gateway` route, add:

```php
    // The gateway's badge reader (MICROAPP_BADGES.md): its own bearer token, never a browser session.
    Route::get('gateway/badges', [GatewayController::class, 'badges']);
```

No `auth` middleware is needed. `GatewaySession` does nothing for a request without a signed-in session, and it still adds no-store.

- [ ] **Step 6: Document it**

From `appv3/backend`, run this. It keeps the file's two-space format:

```bash
node -e '
const fs = require("fs"); const f = "resources/openapi.json";
const d = JSON.parse(fs.readFileSync(f, "utf8"));
d.paths["/gateway/badges"] = { get: {
  summary: "Counts for the logbook icon in the gateway: weeks waiting for each supervisor, weeks sent back to each intern.",
  security: [{ gatewayToken: [] }],
  responses: { "200": { description: "OK." }, default: { description: "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." } },
  "x-rizurf": {
    name: "Read Badges", purpose: "Show who has logbook work waiting",
    use_when: ["The gateway refreshes the counts on Your apps"],
    do_not_use_when: ["Listing the weeks themselves (use GET /supervisor/interns)"],
    inputs: ["Authorization: Bearer <gateway access token, scope gateway:badges:read>"], outputs: ["badges[].email", "badges[].count"],
    requires: ["A gateway-signed access token for intern-logbook with scope gateway:badges:read"],
    related_endpoints: ["GET /supervisor/interns", "GET /me/journal/weeks"],
    tags: ["badges", "counts", "notifications", "gateway"] } } };
d.components.securitySchemes.gatewayToken = { type: "http", scheme: "bearer", bearerFormat: "JWT",
  description: "An access token the Rizurf gateway signs for this service (token_use access, scope gateway:badges:read)." };
d.info["x-rizurf"].capabilities.find(c => c.name === "Review Interns").endpoints.push("GET /gateway/badges");
fs.writeFileSync(f, JSON.stringify(d, null, 2) + "\n");'
git diff --stat resources/openapi.json
```

Expected: only additions (plus one comma) in `resources/openapi.json`.
- If the capability is named differently, print the names first with `node -e 'console.log(require("./resources/openapi.json").info["x-rizurf"].capabilities.map(c=>c.name))'` and use the reviewing one.
- If `GET /me/journal/weeks` isn't a documented operation, drop it from `related_endpoints`.

In `appv3/DEPLOY.md`:
- In the "SERVICE READY" block, change `Endpoints    26` to `Endpoints    27`.
- Under "Connecting to the Rizurf gateway", after the paragraph that ends "approve it in **Connections**.", add:

```markdown
Once it's connected, the gateway also reads `https://api.company.com/api/v1/gateway/badges` about once a minute and shows each person's count on the logbook's icon in **Your apps**: weeks waiting for a supervisor, or weeks sent back to an intern. There's nothing to set up for this. In the gateway's **App badges** page the logbook should show **Working**. Opening that address in a browser must answer 401 (JSON), not 404.
```

- [ ] **Step 7: Run the tests to see them pass**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app routes tests
git add -A . ../DEPLOY.md && git commit -m "feat(badges): GET /api/v1/gateway/badges for the gateway's app icon"
git push
```

Expected: CI is green.
- All `BadgeTest` cases pass, and `GatewayServiceTest` and `GatewaySignInTest` are unchanged and green.
- `OpenApiTest` passes: the new route is documented. It isn't public (`security` isn't `[]`), so it is also checked in "every protected operation refuses anonymous callers", and gets 401 `UNAUTHORIZED` without a token.
- PHPStan and Pint are clean.

---

### Task 2: Daily backups and the scheduler on the VPS

Same backend branch. This task changes only `appv3/DEPLOY.md`. Its check is a syntax check of the script.

**Files:**
- Modify: `appv3/DEPLOY.md` (the "Backups" section, plus the scheduler cron that DEPLOY.md never had)

**Interfaces:**
- Consumes: the app's paths from DEPLOY.md §3 (`/var/www/logbook/appv3/backend`) and the database name `logbook` from §2.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the script and check it fails without the docs**

Write the backup script to a scratch file, then syntax-check it:

```bash
cat > "$TEMP/logbook-backup" <<'EOF'
#!/bin/sh
# Nightly logbook backup: the database and the uploaded templates, kept 14 days.
set -eu
DIR=/var/backups/logbook
STAMP=$(date +%F)
mkdir -p "$DIR"
chmod 700 "$DIR"
mysqldump --defaults-extra-file=/root/.logbook-backup.cnf --single-transaction --routines logbook | gzip > "$DIR/db-$STAMP.sql.gz"
tar -czf "$DIR/files-$STAMP.tar.gz" -C /var/www/logbook/appv3/backend/storage/app private
find "$DIR" -type f -name '*.gz' -mtime +14 -delete
EOF
sh -n "$TEMP/logbook-backup" && echo SYNTAX-OK
grep -c "logbook-backup" appv3/DEPLOY.md
```

Expected: `SYNTAX-OK`, then `0`. The script is valid, and DEPLOY.md doesn't have it yet, which is the "red" for a docs task.

- [ ] **Step 2: Replace the "Backups" section**

In `appv3/DEPLOY.md`, replace everything from `## Backups` to the end of the file with:

````markdown
## Scheduled jobs

The app clears old idempotency keys once a day through Laravel's scheduler. Add this cron entry for the web server user:

```bash
echo '* * * * * www-data cd /var/www/logbook/appv3/backend && php artisan schedule:run >> /dev/null 2>&1' | sudo tee /etc/cron.d/logbook-scheduler
```

## Backups

Every night, back up the `logbook` database and the uploaded templates (`storage/app/private`), and keep 14 days.

1. Give the backup its own read-only database login, so the script holds no password:

```sql
CREATE USER 'logbook_backup'@'localhost' IDENTIFIED BY '<another strong password>';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON logbook.* TO 'logbook_backup'@'localhost';
```

```bash
sudo sh -c 'printf "[client]\nuser=logbook_backup\npassword=<that password>\n" > /root/.logbook-backup.cnf && chmod 600 /root/.logbook-backup.cnf'
```

2. Save this as `/usr/local/bin/logbook-backup`, then run `sudo chmod 700 /usr/local/bin/logbook-backup`:

```sh
#!/bin/sh
# Nightly logbook backup: the database and the uploaded templates, kept 14 days.
set -eu
DIR=/var/backups/logbook
STAMP=$(date +%F)
mkdir -p "$DIR"
chmod 700 "$DIR"
mysqldump --defaults-extra-file=/root/.logbook-backup.cnf --single-transaction --routines logbook | gzip > "$DIR/db-$STAMP.sql.gz"
tar -czf "$DIR/files-$STAMP.tar.gz" -C /var/www/logbook/appv3/backend/storage/app private
find "$DIR" -type f -name '*.gz' -mtime +14 -delete
```

3. Run it at 02:30 every night:

```bash
echo '30 2 * * * root /usr/local/bin/logbook-backup' | sudo tee /etc/cron.d/logbook-backup
```

Run it once by hand (`sudo /usr/local/bin/logbook-backup`) and check that `/var/backups/logbook` has today's two files.

These backups sit on the same VPS. If the company already copies the server's disks somewhere else, include `/var/backups/logbook`. If not, copy that folder off the machine regularly.

### Test a restore (once, before go-live)

Restore into a scratch database, never over `logbook`:

```bash
sudo mysql -e "CREATE DATABASE logbook_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gunzip -c /var/backups/logbook/db-$(date +%F).sql.gz | sudo mysql logbook_restore_test
sudo mysql -e "SELECT COUNT(*) AS weeks FROM logbook_restore_test.weeks; SELECT COUNT(*) AS weeks FROM logbook.weeks"
tar -tzf /var/backups/logbook/files-$(date +%F).tar.gz | head
sudo mysql -e "DROP DATABASE logbook_restore_test"
```

The two counts must match, and the file list must show the templates under `private/`. Tell the developer the restore test passed.
````

- [ ] **Step 3: Check the docs carry the same script**

```bash
grep -c "logbook-backup" appv3/DEPLOY.md
awk '/^```sh$/{f=1;next} /^```$/{f=0} f' appv3/DEPLOY.md > "$TEMP/deploy-backup.sh" && sh -n "$TEMP/deploy-backup.sh" && diff "$TEMP/deploy-backup.sh" "$TEMP/logbook-backup" && echo SAME-SCRIPT
```

Expected: a count of 4 or more, then `SAME-SCRIPT`. The script in DEPLOY.md parses and matches the checked one. If `awk` also picks up another `sh` block from elsewhere in DEPLOY.md, compare by eye instead and record a ruling.

- [ ] **Step 4: Commit**

```bash
git add appv3/DEPLOY.md && git commit -m "docs(deploy): nightly backups, a restore test, and the scheduler cron"
git push
```

---

### Task 3: The count on the prototype's Review link

Work in `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`:

```bash
git checkout master && git pull && git checkout -b feat/step-6-prototype-review-count
```

**Files:**
- Modify: `tests/e2e/flow.spec.ts` (the request-changes/resubmit/approve test)
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Modify: `docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` (open question 3 answered)

**Interfaces:**
- Consumes:
  - `useReview()` from `src/stores/review.ts`: `load(): Promise<void>` and `queue` (a computed list of submitted rows).
  - `useSession().isSupervisor`.

  Both work the same in browser mode (IndexedDB) and server mode (`HttpRepository`).
- Produces: a `<span class="nav-count" data-testid="nav-count">` inside the Review nav link, shown only when the count is above 0.

- [ ] **Step 1: Write the failing e2e assertions**

In `tests/e2e/flow.spec.ts`, in the test `'supervisor requests changes, student fixes and resubmits, supervisor approves'`, add the assertions marked `// count` (the other lines are already there):

```ts
test('supervisor requests changes, student fixes and resubmits, supervisor approves', async () => {
  const reviewCount = page.getByRole('link', { name: 'Review' }).getByTestId('nav-count');
  await asRole(page, 'Supervisor');
  await expect(reviewCount).toHaveText('1'); // count: the submitted week waits
  await nav(page, 'Review');
  await page.getByTestId('queue-row').first().click();
  await expect(page.getByTestId('preview')).toContainText('Configured the ERP gateway');
  await page.getByTestId('changes-comment').fill('Please describe the sandbox setup in more detail.');
  await page.getByTestId('changes-btn').click();
  await expect(page.getByTestId('history')).toContainText('Changes requested');
  await expect(reviewCount).toBeHidden(); // count: nothing waits now
```

Then, after the second `await asRole(page, 'Supervisor');` (the one after the resubmit):

```ts
  await expect(reviewCount).toHaveText('1'); // count: the resubmitted week waits again
```

And after `await expect(page.getByTestId('history')).toContainText('Approved');`:

```ts
  await expect(reviewCount).toBeHidden(); // count: approved, nothing waits
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test tests/e2e/flow.spec.ts`
Expected: FAIL in "supervisor requests changes…", waiting for `nav-count` to have text "1" (the element doesn't exist). The tests before it pass. The tests after it may fail too because they depend on this one; that's fine.

- [ ] **Step 3: Show the count**

In `src/App.vue`, `<script setup>`:

1. Add `import { useReview } from './stores/review';` with the other store imports.
2. Below `const route = useRoute();`, add:

```ts
// The Review link's count: weeks waiting for this supervisor (roadmap step 6), the same number as on the gateway's icon.
const review = useReview();
watch(() => session.isSupervisor, s => { if (s) review.load().catch(() => { /* the Review page shows the error */ }); }, { immediate: true });
const counts = computed<Record<string, number>>(() => (session.isSupervisor ? { '/supervisor/review': review.queue.length } : {}));
```

In the template, change the nav link to:

```html
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="nav-item" :title="l.label">
        <NavIcon :name="l.icon" /><span class="nav-label">{{ l.label }}</span>
        <span v-if="counts[l.to]" class="nav-count" data-testid="nav-count" :aria-label="`${counts[l.to]} waiting`">{{ counts[l.to] > 99 ? '99+' : counts[l.to] }}</span>
      </RouterLink>
```

`watch` and `computed` are already imported in `App.vue`.

In `src/styles.css`:

1. After the `.nav-item.router-link-active` rule (line 41), add:

```css
.nav-count { margin-left: auto; min-width: 18px; padding: 0 6px; border-radius: 999px; background: var(--count); color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
```

2. Inside the media query that collapses the sidebar (the block containing `.sidebar { width: 56px; …}` and `.nav-label { opacity: 0; … }`), add:

```css
  /* Collapsed: the count sits on the icon's corner instead of at the end of the row (UI standard). */
  .sidebar:not(:hover):not(:has(:focus-visible)) .nav-count { position: absolute; top: 2px; left: 24px; padding: 0 5px; font-size: 0.62rem; }
```

The decisions already update the count: `useReview().approve` and `.requestChanges` call `load()`, and this is the same Pinia store. Switching to the Supervisor role triggers the `watch`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test`
Expected: 139/139 unit tests pass (no unit test changes).

Run: `npx vue-tsc --noEmit`, then `npx vite build --outDir "$TEMP/il-build" --emptyOutDir`.
Expected: both are clean.

Run: `npm run e2e`
Expected: 11/11 pass, including the new count assertions.

- [ ] **Step 5: Record the answered question in the roadmap**

In `docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md`, replace open question 3 with:

```markdown
3. **Answered:** `MICROAPP_BADGES.md` and `RIZURF_UI_STANDARD.md` have been received. The badge endpoint is `GET /api/v1/gateway/badges`; `RIZURF_DESIGN_SYSTEM.md` is still not received and nothing waits on it.
```

- [ ] **Step 6: Commit**

```bash
git add src/App.vue src/styles.css tests/e2e/flow.spec.ts docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md
git commit -m "feat(review): show the waiting count on the Review link"
```

---

## Decisions this plan makes

- **Interns get a count on the gateway icon only.** The spec names the Review link, which only supervisors have, so interns get no in-app count.
- **Every supervisor at a company sees all of its waiting weeks.** The logbook has no "assigned supervisor" per intern; any supervisor at the company can review.
- **The badge route uses its own OpenAPI security scheme (`gatewayToken`), not `security: []`.** This keeps the "only health, docs and sign-in are public" rule (SS-8) true, and lets `OpenApiTest` check that it refuses anonymous callers.
- **Backups are commands in DEPLOY.md, not app code.** They run as root on the VPS, which the app has no business doing. The scheduler cron is added because DEPLOY.md never had it, so the existing daily `idempotency:prune` has never run on a server.
- **The count doesn't flash when it goes up.** It only changes when the app loads or the supervisor makes a decision, so there's no live increase to flash. Add the flash if the count ever updates live.
