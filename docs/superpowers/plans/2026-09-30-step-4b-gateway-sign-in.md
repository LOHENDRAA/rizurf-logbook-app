# Step 4b: Sign In Through the Gateway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People sign in to the logbook only through the Rizurf gateway, and the logbook locks on the request after they sign out there.

**Architecture:**
- The gateway sends people back to the **screens** (`PUBLIC_URL/?code=…`). The screens post the one-time code to `POST /api/v1/auth/gateway`. The server swaps it for an identity token (server to server), verifies the RS256 signature against the gateway's JWKS, then checks `token_use`, `iss`, `aud` and `exp`. It looks the person up in `users` by email and starts its normal Laravel session, which holds the gateway's `sid` and `sub`.
- A middleware on every `/api/v1` route asks the gateway's `/oauth/introspect` whether that session is still live, on every request, with no cache. A "no" signs the person out and returns `401`. It fails open when the gateway can't be reached, but only for 15 minutes after the last good answer. It also sets `Cache-Control: no-store` on every response.
- Passwords, `/auth/login`, `/auth/logout`, the sign-in form and the Sign out button are removed. People are added to `users` with an artisan command that sets their role and company.

**Tech Stack:** Laravel 13 (PHP ≥ 8.4) plus `firebase/php-jwt` (JWT/JWKS verification; `MICROAPP_AUTH.md` §3 asks for a maintained library over hand-rolled code). Vue 3 + Vite prototype.

**Spec:** `../intern-logbook/docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` "Step 4b", and the gateway's `MICROAPP_AUTH.md` and `RIZURF_API_TEMPLATE.md` (SS-24, SS-25). The user received both over WhatsApp; the rules used are quoted below.

## Decisions (made while planning)

- **The service id is `intern-logbook`**, the `service` field of `/health`. SS-26: "`audience` … is a service id — the `service` field from its `/health`". So the token's `aud` is checked against `HealthController::SERVICE`, and no env variable is needed.
- **Two env values, both required:** `GATEWAY_URL` (the gateway) and `PUBLIC_URL` (the screens, as registered with the gateway). `/openapi.json` publishes `PUBLIC_URL` as `app_url`, which is how the gateway learns where to send people back.
- **Two public routes besides `/health` and `/openapi.json`:** `GET /auth/sign-in` redirects the browser to the gateway, and `POST /auth/gateway` finishes a sign-in. Both must work before anyone is signed in. SS-8 lists only the two documents as public, so `/conformance` may flag these. If it does, the follow-up is to let the screens build the gateway URL themselves.
- **People who aren't in `users` get `403`** ("…isn't set up in the logbook yet"). They are not created automatically, because the role must come from the database.
- **A `401` in the middle of a session doesn't redirect automatically.** A redirect would throw away text the person hasn't saved. The screens say "You're signed out. Copy anything you haven't saved, then reload the page to sign in again." Reloading goes through the gateway. The roadmap is updated to match.
- **No absolute session expiry beyond the backstop.** The gateway check on every request is what locks the logbook. The 15-minute limit (`MICROAPP_AUTH.md` §6) applies only while the gateway can't be reached. The Laravel session cookie keeps its encrypted, 120-minute idle lifetime.
- **The `users` table stays as the local role table** (SS-24 allows "a table of local roles … keyed by the identity the gateway asserts"). Only `password` and `password_reset_tokens` go.

## Global Constraints

- PHP ≥ 8.4, Laravel 13. Pint and PHPStan (level 5) pass. Backend tests run in GitHub CI (MariaDB); this machine's PHP is 8.2.
- Error body: `{"error": {"code", "message", "correlation_id", "details"}}` via `App\Support\Problem` (step 4a).
- The token checks, from `MICROAPP_AUTH.md` §3/§9: "signature, `token_use`, `iss`, `aud`, `exp` … failing closed on any of them". `token_use` must be `identity` on sign-in.
- `iss` must equal the configured `GATEWAY_URL`: "never inferred from an incoming request" (§8).
- Introspection: `POST {GATEWAY_URL}/oauth/introspect` with `{sid, sub}` gives `{active}`. It runs on "every authenticated request, **no cache**, failing open on a network error only" (§9).
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `Pragma: no-cache`, `Expires: 0` go on every authenticated response and every auth redirect (§7).
- Code exchange: `POST {GATEWAY_URL}/oauth/token` with `{code, redirect_uri}` gives `{token, token_type, expires_in}`. The server does it, never the browser, and no client secret is involved (§4).
- `redirect_uri` is `{PUBLIC_URL}/` exactly (§4, SS-24).
- No sign-out button anywhere (§5).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The gateway is down during sign-in** (the token endpoint refuses connections). The person should get a clear `503` saying the gateway can't be reached, not a `500`. Task 1 tests it.
2. **The gateway rotated its signing key** (the token's `kid` isn't in the cached key set). The logbook should fetch the key set once more and succeed, not lock everyone out until the cache is cleared. Task 1 tests it.
3. **The email case differs between the gateway and `users`** (`Sarah.Lim@…` vs `sarah.lim@…`). It is the same person and must sign in. Task 2 tests it.
4. **The screens loop between the gateway and the logbook** (the gateway returns without a code, or the session cookie is blocked). After one attempt the screens must stop and explain, not redirect forever. Task 5 tests it.
5. **A one-time code left in the address bar** could be bookmarked or shared. The screens must remove `?code=` before doing anything else. Task 5 tests it.

---

### Task 1: The `Gateway` service — verify tokens, swap codes, ask whether a session is live

**Files:**
- Create: `appv3/backend/app/Services/Gateway.php`, `appv3/backend/tests/Feature/GatewayServiceTest.php`
- Modify: `appv3/backend/composer.json`, `appv3/backend/composer.lock`, `appv3/backend/config/portal.php`, `appv3/backend/phpunit.xml`, `appv3/backend/.env.example`, `appv3/backend/app/Providers/AppServiceProvider.php`, `appv3/backend/tests/TestCase.php`

**Interfaces:**
- Produces:
  - `App\Services\Gateway` with:
    - `authorizeUrl(): string`
    - `redirectUri(): string`
    - `exchange(string $code): array{sid: string, sub: string, email: string, name: string}`, which throws an `ApiProblemException` (401 `UNAUTHORIZED`, or 503 `GATEWAY_UNAVAILABLE`)
    - `verify(string $token, string $expectedUse): array{sid, sub, email, name}`
    - `isLive(string $sid, string $sub): ?bool`, which returns `null` when the gateway can't be asked
  - Config: `portal.gateway_url`, `portal.public_url`.
  - `TestCase` members:
    - `protected ?string $gatewayToken`: what `/oauth/token` returns; `null` makes it answer 400.
    - `protected ?bool $gatewayLive`: what `/oauth/introspect` answers; `null` makes the connection fail.
    - `protected bool $gatewayDown`: every connection to the fake gateway fails.
    - `protected function identityToken(array $claims = [], ?string $privateKey = null): string`
    - `protected static function newRsaKey(): array{private: string, jwk: array<string, string>}`

- [ ] **Step 1: Branch and add the dependency.**

```bash
cd C:/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app
git checkout master && git pull --ff-only && git checkout -b feat/step-4b-gateway-sign-in
cd appv3/backend
composer require firebase/php-jwt --ignore-platform-req=php
```

Expected: `composer.json` gains `"firebase/php-jwt": "^6.x"` (or whatever major is current), and `composer.lock` changes only by that package. `--ignore-platform-req=php` is needed only because this machine runs PHP 8.2; CI installs on 8.5.

- [ ] **Step 2: Config.** Add to `config/portal.php`, above `'allow_seed_production'`:

```php
    /*
    | The Rizurf gateway (MICROAPP_AUTH.md): where people sign in, and the screens'
    | address as registered with it. Both come from .env, never from a request.
    */
    'gateway_url' => rtrim((string) env('GATEWAY_URL', ''), '/'),

    'public_url' => rtrim((string) env('PUBLIC_URL', ''), '/'),
```

In `phpunit.xml`, add `<env name="GATEWAY_URL" value="https://gateway.test"/>` and `<env name="PUBLIC_URL" value="https://logbook.test/intern-logbook"/>`.

In `.env.example`, add below `SANCTUM_STATEFUL_DOMAINS`:

```ini
# The Rizurf gateway, and these screens' address as registered with it (DEPLOY.md).
GATEWAY_URL=http://127.0.0.1:4301
PUBLIC_URL=http://localhost:5173/intern-logbook
```

In `AppServiceProvider::boot()`, add at the top (SS-20: "Fail at startup with a message naming the missing variable"):

```php
        if (! $this->app->runningInConsole()) {
            foreach (['portal.gateway_url' => 'GATEWAY_URL', 'portal.public_url' => 'PUBLIC_URL'] as $key => $variable) {
                if (config($key) === '') {
                    throw new RuntimeException("{$variable} is not set. Add it to .env (see DEPLOY.md).");
                }
            }
        }
```

(`use RuntimeException;`.) Artisan commands are exempt, so `migrate` still runs before `.env` is complete.

- [ ] **Step 3: A fake gateway for every test.** In `tests/TestCase.php`:
  - Add these imports: `use Firebase\JWT\JWT; use GuzzleHttp\Exception\ConnectException; use GuzzleHttp\Psr7\Request as GuzzleRequest; use Illuminate\Http\Client\Request as ClientRequest; use Illuminate\Support\Facades\Http;`.
  - Add these members:

```php
    /** What the fake gateway's /oauth/token returns; null answers 400 (code refused). */
    protected ?string $gatewayToken = null;

    /** What the fake gateway's /oauth/introspect answers; null fails that connection. */
    protected ?bool $gatewayLive = true;

    /** Every connection to the fake gateway fails. */
    protected bool $gatewayDown = false;

    /** @var array{private: string, jwk: array<string, string>}|null */
    private static ?array $gatewayKey = null;

    /**
     * A fresh RSA key pair: the private key in PEM, the public one as a JWK.
     *
     * @return array{private: string, jwk: array<string, string>}
     */
    protected static function newRsaKey(string $kid = 'test-key'): array
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048]);
        openssl_pkey_export($key, $private);
        $rsa = openssl_pkey_get_details($key)['rsa'];
        $b64 = fn (string $bytes): string => rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');

        return ['private' => $private, 'jwk' => [
            'kty' => 'RSA', 'kid' => $kid, 'use' => 'sig', 'alg' => 'RS256', 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e']),
        ]];
    }

    /**
     * @return array{private: string, jwk: array<string, string>}
     */
    protected static function gatewayKey(): array
    {
        return self::$gatewayKey ??= self::newRsaKey();
    }

    /**
     * An identity token as the gateway issues it (MICROAPP_AUTH.md §2). A claim set to null is left out.
     *
     * @param  array<string, mixed>  $claims
     */
    protected function identityToken(array $claims = [], ?string $privateKey = null): string
    {
        $payload = array_filter([
            'token_use' => 'identity',
            'sid' => 'sid-1',
            'sub' => 'gateway-user-1',
            'email' => 'sarah.lim@nusantara.example.com',
            'name' => 'Sarah Lim',
            'role' => 'viewer',
            'iss' => 'https://gateway.test',
            'aud' => 'intern-logbook',
            'exp' => time() + 300,
            ...$claims,
        ], fn ($value) => $value !== null);

        return JWT::encode($payload, $privateKey ?? self::gatewayKey()['private'], 'RS256', 'test-key');
    }

    private function fakeGateway(ClientRequest $request): mixed
    {
        $url = $request->url();
        if ($this->gatewayDown) {
            throw new ConnectException('Gateway down', new GuzzleRequest($request->method(), $url));
        }

        return match (true) {
            str_ends_with($url, '/.well-known/jwks.json') => Http::response(['keys' => [self::gatewayKey()['jwk']]]),
            str_ends_with($url, '/oauth/token') => $this->gatewayToken === null
                ? Http::response(['error' => 'invalid_grant'], 400)
                : Http::response(['token' => $this->gatewayToken, 'token_type' => 'Bearer', 'expires_in' => 300]),
            str_ends_with($url, '/oauth/introspect') => $this->gatewayLive === null
                ? throw new ConnectException('Gateway down', new GuzzleRequest('POST', $url))
                : Http::response(['active' => $this->gatewayLive]),
            default => Http::response('Unexpected call to '.$url, 500),
        };
    }
```

  - In `setUp()`, after `parent::setUp();`:

```php
        // Nothing leaves the test run; the gateway is the fake above.
        Http::preventStrayRequests();
        Http::fake(fn (ClientRequest $request) => $this->fakeGateway($request));
```

- [ ] **Step 4: Write the failing tests.** Create `tests/Feature/GatewayServiceTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Services\Gateway;
use App\Support\ApiProblemException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GatewayServiceTest extends TestCase
{
    private function gateway(): Gateway
    {
        return $this->app->make(Gateway::class);
    }

    public function test_authorize_url_sends_people_back_to_the_registered_screens(): void
    {
        $this->assertSame(
            'https://gateway.test/oauth/authorize?redirect_uri='.urlencode('https://logbook.test/intern-logbook/'),
            $this->gateway()->authorizeUrl(),
        );
    }

    public function test_exchange_posts_the_code_server_to_server_and_returns_the_verified_identity(): void
    {
        $this->gatewayToken = $this->identityToken();

        $identity = $this->gateway()->exchange('code-1');

        $this->assertSame(['sid' => 'sid-1', 'sub' => 'gateway-user-1', 'email' => 'sarah.lim@nusantara.example.com', 'name' => 'Sarah Lim'], $identity);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/oauth/token')
            && $request['code'] === 'code-1'
            && $request['redirect_uri'] === 'https://logbook.test/intern-logbook/');
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function badClaims(): array
    {
        return [
            'an access token, not an identity token' => [['token_use' => 'access']],
            'another issuer' => [['iss' => 'https://evil.test']],
            'minted for another service' => [['aud' => 'payments-api']],
            'expired' => [['exp' => time() - 10]],
            'no expiry' => [['exp' => null]],
            'no session id' => [['sid' => null]],
        ];
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('badClaims')]
    public function test_verify_fails_closed(array $claims): void
    {
        $this->expectException(ApiProblemException::class);

        $this->gateway()->verify($this->identityToken($claims), 'identity');
    }

    public function test_verify_rejects_a_token_signed_by_another_key(): void
    {
        $this->expectException(ApiProblemException::class);

        $this->gateway()->verify($this->identityToken([], self::newRsaKey()['private']), 'identity');
    }

    public function test_verify_fetches_the_key_set_again_after_the_gateway_rotates_its_key(): void
    {
        Cache::forever('gateway.jwks', ['keys' => [self::newRsaKey('old-key')['jwk']]]);

        $this->assertSame('sid-1', $this->gateway()->verify($this->identityToken(), 'identity')['sid']);
    }

    public function test_a_refused_code_is_401(): void
    {
        $this->gatewayToken = null;

        try {
            $this->gateway()->exchange('used-twice');
            $this->fail('Expected a refused code to throw.');
        } catch (ApiProblemException $e) {
            $this->assertSame(401, $e->status);
        }
    }

    public function test_a_gateway_that_cannot_be_reached_at_sign_in_is_503(): void
    {
        $this->gatewayDown = true;

        try {
            $this->gateway()->exchange('code-1');
            $this->fail('Expected an unreachable gateway to throw.');
        } catch (ApiProblemException $e) {
            $this->assertSame(503, $e->status);
            $this->assertSame('GATEWAY_UNAVAILABLE', $e->errorCode);
        }
    }

    public function test_is_live_asks_the_gateway_every_time(): void
    {
        $this->assertTrue($this->gateway()->isLive('sid-1', 'gateway-user-1'));
        $this->gatewayLive = false;
        $this->assertFalse($this->gateway()->isLive('sid-1', 'gateway-user-1'));

        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/oauth/introspect')
            && $request['sid'] === 'sid-1' && $request['sub'] === 'gateway-user-1');
    }

    public function test_is_live_is_null_when_the_gateway_cannot_be_reached(): void
    {
        $this->gatewayLive = null;

        $this->assertNull($this->gateway()->isLive('sid-1', 'gateway-user-1'));
    }
}
```

- [ ] **Step 5: Commit the tests and push.** CI must fail because `App\Services\Gateway` doesn't exist.

```bash
git add -A appv3/backend
git commit -m "test(backend): the gateway service verifies tokens, swaps codes and asks about sessions"
git push -u origin feat/step-4b-gateway-sign-in
```

Expected: PHPStan or the tests fail because the `Gateway` class isn't found.

- [ ] **Step 6: Implement** `app/Services/Gateway.php`:

```php
<?php

namespace App\Services;

use App\Http\Controllers\HealthController;
use App\Support\Problem;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;
use Throwable;
use UnexpectedValueException;

/**
 * The Rizurf gateway (MICROAPP_AUTH.md), the only place anyone signs in. The logbook verifies the
 * gateway's identity token itself, and asks on every request whether the gateway session is still live.
 */
final class Gateway
{
    private const JWKS_CACHE_KEY = 'gateway.jwks';

    private const UNVERIFIED = 'The sign-in could not be verified. Open the logbook from the gateway again.';

    public function authorizeUrl(): string
    {
        return $this->url().'/oauth/authorize?'.http_build_query(['redirect_uri' => $this->redirectUri()]);
    }

    /** Where the gateway sends people back with a one-time code: the screens' registered address. */
    public function redirectUri(): string
    {
        return (string) config('portal.public_url').'/';
    }

    /**
     * Swaps a one-time code for an identity token, server to server, and verifies it (§4).
     *
     * @return array{sid: string, sub: string, email: string, name: string}
     */
    public function exchange(string $code): array
    {
        try {
            $response = Http::timeout(10)->acceptJson()->post($this->url().'/oauth/token', [
                'code' => $code,
                'redirect_uri' => $this->redirectUri(),
            ]);
        } catch (ConnectionException) {
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'GATEWAY_UNAVAILABLE', "Can't reach the Rizurf gateway. Try again in a minute.");
        }

        $token = $response->json('token');
        if (! $response->successful() || ! is_string($token)) {
            Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', 'The gateway did not accept this sign-in. Open the logbook from the gateway again.');
        }

        return $this->verify($token, 'identity');
    }

    /**
     * Signature (with exp) first, then token_use, iss and aud; fails closed on any of them (§3).
     *
     * @return array{sid: string, sub: string, email: string, name: string}
     */
    public function verify(string $token, string $expectedUse): array
    {
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
            && is_int($claims['exp'] ?? null) // JWT::decode rejects an expired token but accepts a missing exp.
            && is_string($claims['sid'] ?? null) && $claims['sid'] !== ''
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

    /**
     * Whether the gateway session behind this sign-in is still live (§5). Asked every time, never cached.
     * Null when the gateway can't be asked; the caller decides how long to fail open.
     */
    public function isLive(string $sid, string $sub): ?bool
    {
        try {
            $response = Http::timeout(3)->acceptJson()->post($this->url().'/oauth/introspect', ['sid' => $sid, 'sub' => $sub]);
        } catch (ConnectionException) {
            return null;
        }

        return $response->successful() ? $response->json('active') === true : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeOrFail(string $token): array
    {
        try {
            return (array) JWT::decode($token, $this->keys());
        } catch (Throwable) {
            Problem::throw(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', self::UNVERIFIED);
        }
    }

    /**
     * The gateway's public keys, fetched once and kept until a token names a key they don't have.
     *
     * @return array<string, Key>
     */
    private function keys(): array
    {
        /** @var array<string, mixed> $jwks */
        $jwks = Cache::rememberForever(self::JWKS_CACHE_KEY, function (): array {
            $response = Http::timeout(10)->acceptJson()->get($this->url().'/.well-known/jwks.json');
            if (! $response->successful() || ! is_array($response->json('keys'))) {
                Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'GATEWAY_UNAVAILABLE', "Can't read the Rizurf gateway's signing keys. Try again in a minute.");
            }

            return $response->json();
        });

        return JWK::parseKeySet($jwks, 'RS256');
    }

    private function url(): string
    {
        return (string) config('portal.gateway_url');
    }
}
```

Note: `ApiProblemException` extends `Throwable`, so the `catch (Throwable)` in `verify` would also catch a 503 from `keys()` and relabel it 401. That's acceptable: an unreadable key set means the sign-in can't be verified. The 503 test only exercises the unreachable token endpoint.

- [ ] **Step 7: Pint, commit, push, and check CI.**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app tests config
git add -A appv3/backend
git commit -m "feat(backend): gateway service: verify identity tokens, swap codes, introspect sessions"
git push
```

Expected: `GatewayServiceTest` is green (14 tests including the 6 data-provider cases), and the rest of the suite stays green.

---

### Task 2: Sign-in endpoints; passwords removed

**Files:**
- Create: `appv3/backend/app/Http/Controllers/GatewayController.php`, `appv3/backend/database/migrations/2026_09_30_000004_remove_passwords.php`, `appv3/backend/tests/Feature/GatewaySignInTest.php`
- Delete: `appv3/backend/app/Http/Controllers/AuthController.php`, `appv3/backend/app/Http/Requests/LoginRequest.php`
- Modify: `appv3/backend/routes/portal.php`, `appv3/backend/app/Providers/AppServiceProvider.php` (the `login` limiter), `appv3/backend/app/Models/User.php`, `appv3/backend/database/factories/UserFactory.php`, `appv3/backend/database/seeders/PortalSeeder.php`, `appv3/backend/config/portal.php`, `appv3/backend/phpunit.xml`, `appv3/backend/app/Http/Controllers/HealthController.php` (`openapi()` adds `app_url`), `appv3/backend/resources/openapi.json`, `appv3/backend/tests/Feature/AuthTest.php`, `appv3/backend/tests/Feature/OpenApiTest.php`

**Interfaces:**
- Consumes: `Gateway::authorizeUrl()`, `Gateway::exchange()`.
- Produces:
  - `GET /api/v1/auth/sign-in`: a 302 to the gateway.
  - `POST /api/v1/auth/gateway` with `{code}`: returns the session user (`{id, name, role, capabilities}`, as `GET /me`), or 401/403/503.
  - Session key `gateway` = `['sid' => string, 'sub' => string, 'checked_at' => int]`.

- [ ] **Step 1: Write the failing tests.** Create `tests/Feature/GatewaySignInTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class GatewaySignInTest extends TestCase
{
    public function test_sign_in_sends_the_browser_to_the_gateway(): void
    {
        $response = $this->get('/api/v1/auth/sign-in');

        $response->assertRedirect('https://gateway.test/oauth/authorize?redirect_uri='.urlencode('https://logbook.test/intern-logbook/'));
    }

    public function test_a_verified_code_starts_a_session_for_the_matching_user(): void
    {
        $this->gatewayToken = $this->identityToken(['email' => 'Sarah.Lim@Nusantara.Example.com']);

        $response = $this->portal('POST', '/api/v1/auth/gateway', ['code' => 'code-1']);

        $response->assertOk()->assertJsonPath('id', 'supervisor-1')->assertJsonPath('role', 'supervisor');
        $this->assertAuthenticatedAs($this->user('supervisor-1'));
        $this->assertSame('sid-1', session('gateway.sid'));
        $this->assertSame('gateway-user-1', session('gateway.sub'));
    }

    public function test_the_role_comes_from_the_logbook_not_the_gateway(): void
    {
        $this->gatewayToken = $this->identityToken(['email' => 'aisha.rahman@student.example.edu', 'role' => 'admin']);

        $this->portal('POST', '/api/v1/auth/gateway', ['code' => 'code-1'])->assertOk()->assertJsonPath('role', 'student');
    }

    public function test_someone_not_in_the_logbook_is_403_and_not_signed_in(): void
    {
        $this->gatewayToken = $this->identityToken(['email' => 'stranger@example.com']);

        $this->portal('POST', '/api/v1/auth/gateway', ['code' => 'code-1'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
        $this->assertGuest();
    }

    public function test_an_unverifiable_token_is_401_and_not_signed_in(): void
    {
        $this->gatewayToken = $this->identityToken(['aud' => 'payments-api']);

        $this->portal('POST', '/api/v1/auth/gateway', ['code' => 'code-1'])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHORIZED');
        $this->assertGuest();
    }

    public function test_a_code_is_required(): void
    {
        $this->portal('POST', '/api/v1/auth/gateway', [])->assertUnprocessable()->assertJsonPath('error.code', 'VALIDATION_ERROR');
    }

    public function test_the_logbook_has_no_password_sign_in_left(): void
    {
        $this->portal('POST', '/api/v1/auth/login', ['email' => 'sarah.lim@nusantara.example.com', 'password' => 'x'])->assertNotFound();
        $this->portal('POST', '/api/v1/auth/logout')->assertNotFound();
        $this->assertFalse(Schema::hasColumn('users', 'password'));
        $this->assertFalse(Schema::hasTable('password_reset_tokens'));
    }
}
```

In `tests/Feature/OpenApiTest.php`:
- In `test_only_health_the_document_and_temporary_login_are_public`, rename it to `test_only_health_the_document_and_the_sign_in_routes_are_public`. The expected list becomes `['GET /auth/sign-in', 'GET /health', 'GET /openapi.json', 'POST /auth/gateway']`.
- In `test_document_is_public_openapi_3_with_catalogue_info`, add `$this->assertSame('https://logbook.test/intern-logbook/', $meta['app_url']);`.

In `tests/Feature/AuthTest.php`, delete these tests:
- `test_login_returns_session_user`
- `test_login_rejects_bad_password_with_401_problem`
- `test_login_rejects_unknown_email_with_401`
- `test_login_validates_input_with_422`
- `test_login_is_rate_limited`
- `test_logout_invalidates_session`

Remove imports that are now unused (`RateLimiter`).

- [ ] **Step 2: Commit the tests and push (RED).**

```bash
git add -A appv3/backend/tests
git commit -m "test(backend): sign-in through the gateway replaces passwords"
git push
```

Expected: `GatewaySignInTest` fails (404 on the new routes, the password column still present). `OpenApiTest` fails on the public list and `app_url`.

- [ ] **Step 3: Controller.** Create `app/Http/Controllers/GatewayController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Resources\PortalResources;
use App\Models\User;
use App\Services\CapabilityService;
use App\Services\Gateway;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sign-in through the Rizurf gateway (MICROAPP_AUTH.md §4). There is no password and no sign-out here:
 * the gateway is the only place for either.
 */
final class GatewayController extends Controller
{
    public function __construct(
        private readonly Gateway $gateway,
        private readonly CapabilityService $capabilities,
    ) {}

    public function start(): RedirectResponse
    {
        return redirect()->away($this->gateway->authorizeUrl());
    }

    public function finish(Request $request): JsonResponse
    {
        $code = (string) $request->validate(['code' => ['required', 'string', 'max:2048']])['code'];
        $identity = $this->gateway->exchange($code);

        // The role comes from the logbook's own users table (SS-24), never from the gateway's claim.
        /** @var User|null $user */
        $user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($identity['email'])])->first();
        if ($user === null) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', "{$identity['email']} isn't set up in the logbook yet. Ask the logbook admin to add you.");
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('gateway', [
            'sid' => $identity['sid'],
            'sub' => $identity['sub'],
            'checked_at' => now()->getTimestamp(),
        ]);

        return response()->json(PortalResources::sessionUser($user, $this->capabilities->forSession($user)));
    }
}
```

- [ ] **Step 4: Routes.** In `routes/portal.php`:
  - Replace the `auth/login` and `auth/logout` routes with:

```php
    Route::get('auth/sign-in', [GatewayController::class, 'start'])
        ->middleware('throttle:login')
        ->withoutMiddleware('throttle:portal-api');
    Route::post('auth/gateway', [GatewayController::class, 'finish'])
        ->middleware('throttle:login')
        ->withoutMiddleware('throttle:portal-api');
```

  - Replace `use App\Http\Controllers\AuthController;` with `use App\Http\Controllers\GatewayController;`.

In `AppServiceProvider`, the `login` limiter's key becomes `$request->ip()`; there's no email any more.

Delete `app/Http/Controllers/AuthController.php` and `app/Http/Requests/LoginRequest.php`.

- [ ] **Step 5: Passwords out.**
  - Create `database/migrations/2026_09_30_000004_remove_passwords.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * People sign in only through the Rizurf gateway (RIZURF_API_TEMPLATE.md SS-24): the logbook stores no passwords.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password');
        });
        Schema::dropIfExists('password_reset_tokens');
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->default('');
        });
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }
};
```

  - `app/Models/User.php`:
    - Remove `'password'` from `$fillable` and from `$hidden`.
    - `casts()` returns only `['email_verified_at' => 'datetime']`.
  - `database/factories/UserFactory.php`:
    - Remove the `$password` property, its docblock, and the `'password' =>` line.
    - Remove `use Illuminate\Support\Facades\Hash;` if unused.
  - `database/seeders/PortalSeeder.php`:
    - Remove `$password = Hash::make(...)`.
    - `[...$attributes, 'password' => $password]` becomes `$attributes`.
    - Remove the `Hash` import.
  - `config/portal.php`:
    - Remove `'demo_password'`.
    - The header comment becomes `Rate limits, the idempotency horizon, and the Rizurf gateway.`
  - `phpunit.xml`: remove the `DEMO_PASSWORD` line.

- [ ] **Step 6: `/openapi.json`.**
  - In `resources/openapi.json`, remove the `/auth/login` and `/auth/logout` paths, and the `Temporary Sign-In` capability.
  - Add these two paths:

```json
    "/auth/sign-in": {
      "get": {
        "summary": "Send the browser to the Rizurf gateway's sign-in page.",
        "responses": {
          "302": { "description": "Redirect to the gateway's /oauth/authorize." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "security": [],
        "x-rizurf": {
          "name": "Start Sign-In",
          "purpose": "Send someone to the gateway to sign in",
          "use_when": ["Someone opens the logbook without a session"],
          "do_not_use_when": ["Calling the API from a program (use a gateway access token)"],
          "inputs": [],
          "outputs": ["Location"],
          "requires": [],
          "related_endpoints": ["POST /auth/gateway"],
          "tags": ["sign in", "login", "gateway", "oauth"]
        }
      }
    },
    "/auth/gateway": {
      "post": {
        "summary": "Swap the gateway's one-time sign-in code for a logbook session.",
        "responses": {
          "200": { "description": "OK." },
          "default": { "description": "An error, as {\"error\": {\"code\", \"message\", \"correlation_id\", \"details\"}}." }
        },
        "security": [],
        "x-rizurf": {
          "name": "Finish Sign-In",
          "purpose": "Start a logbook session from a gateway sign-in",
          "use_when": ["The gateway has sent someone back to the logbook with a code"],
          "do_not_use_when": ["Checking who is signed in (use GET /me)"],
          "inputs": ["code"],
          "outputs": ["id", "name", "role", "capabilities"],
          "requires": ["A one-time code from the gateway", "The person is in the logbook's users table"],
          "related_endpoints": ["GET /auth/sign-in", "GET /me"],
          "tags": ["sign in", "gateway", "session", "oauth callback"]
        }
      }
    },
```

  - Add the capability `{ "name": "Sign In", "icon": "🔑", "description": "Sign-in through the Rizurf gateway; the logbook stores no passwords.", "does": ["Send someone to the gateway to sign in", "Start a session from the gateway's code"], "best_for": "The logbook's own screens.", "endpoints": ["GET /auth/sign-in", "POST /auth/gateway"] }`.
  - No other operation's `related_endpoints` names `/auth/login` or `/auth/logout`, so nothing else changes. `OpenApiTest` would catch a dangling reference.

In `HealthController::openapi()`, publish `app_url` from `PUBLIC_URL`:

```php
    /**
     * The API's own description. Decoded to objects (not arrays) so {} stays {}; app_url comes from PUBLIC_URL.
     */
    public function openapi(): JsonResponse
    {
        /** @var \stdClass $doc */
        $doc = json_decode((string) file_get_contents(resource_path('openapi.json')), flags: JSON_THROW_ON_ERROR);
        // Where the gateway's "Open app" button, and its sign-in, send people (SS-23).
        $doc->info->{'x-rizurf'}->app_url = (string) config('portal.public_url').'/';

        return response()->json($doc, 200, [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
```

Remove the now-unused `use Illuminate\Http\Response;`.

Validate the document: `node -e "require('@apidevtools/swagger-parser').validate('appv3/backend/resources/openapi.json').then(()=>console.log('VALID'))"`. Run it from the scratchpad folder that has swagger-parser installed.
Expected: `VALID`.

- [ ] **Step 7: Check nothing mentions passwords or the old routes.**

Run: `grep -rnE "password|auth/login|auth/logout|AuthController|LoginRequest" app config routes database/seeders database/factories tests resources`
Expected: only the migrations (the old `create_users_table` and the new one) and `GatewaySignInTest`'s "no password sign-in left" test.

- [ ] **Step 8: Pint, commit, push, and check CI.**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app tests config routes database
git add -A appv3/backend
git commit -m "feat(backend): sign in through the Rizurf gateway; no passwords"
git push
```

Expected: green, including `GatewaySignInTest` (7 tests) and `OpenApiTest`.

---

### Task 3: Lock on gateway sign-out; `no-store` everywhere

**Files:**
- Create: `appv3/backend/app/Http/Middleware/GatewaySession.php`, `appv3/backend/tests/Feature/GatewaySessionTest.php`
- Modify: `appv3/backend/routes/portal.php`, `appv3/backend/tests/TestCase.php`

**Interfaces:**
- Consumes: `Gateway::isLive()`, session key `gateway` (Task 2).
- Produces: `GatewaySession::BACKSTOP_SECONDS = 900`. `TestCase::actingAs()` also puts a live gateway session in the session, so every existing test keeps passing through the check.

- [ ] **Step 1: Write the failing tests.** Create `tests/Feature/GatewaySessionTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Http\Middleware\GatewaySession;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GatewaySessionTest extends TestCase
{
    public function test_every_request_asks_the_gateway_with_no_cache(): void
    {
        $this->actingAs($this->user('supervisor-1'));

        $this->getJson('/api/v1/me')->assertOk();
        $this->getJson('/api/v1/me')->assertOk();

        $this->assertCount(2, Http::recorded(fn ($request) => str_ends_with($request->url(), '/oauth/introspect')));
    }

    public function test_signing_out_at_the_gateway_locks_the_logbook_on_the_next_request(): void
    {
        $this->actingAs($this->user('supervisor-1'));
        $this->gatewayLive = false;

        $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('error.code', 'UNAUTHORIZED');

        $this->gatewayLive = true; // even if the gateway says yes now, this session is gone
        $this->getJson('/api/v1/me')->assertUnauthorized();
        $this->assertGuest();
    }

    public function test_a_gateway_that_cannot_be_reached_fails_open_for_a_recent_session(): void
    {
        $this->actingAs($this->user('supervisor-1'));
        $this->gatewayLive = null;

        $this->getJson('/api/v1/me')->assertOk();
    }

    public function test_the_backstop_locks_once_the_gateway_has_been_unreachable_too_long(): void
    {
        $this->actingAs($this->user('supervisor-1'));
        session()->put('gateway.checked_at', now()->getTimestamp() - GatewaySession::BACKSTOP_SECONDS - 1);
        $this->gatewayLive = null;

        $this->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_a_session_without_a_gateway_sign_in_is_locked(): void
    {
        $this->actingAs($this->user('supervisor-1'));
        session()->forget('gateway');

        $this->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_every_response_says_no_store(): void
    {
        $this->actingAs($this->user('supervisor-1'));

        foreach ([$this->getJson('/api/v1/me'), $this->getJson('/api/v1/nonexistent'), $this->get('/api/v1/auth/sign-in')] as $response) {
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        }
        $this->gatewayLive = false;
        $this->assertStringContainsString('no-store', (string) $this->getJson('/api/v1/me')->headers->get('Cache-Control'));
    }
}
```

Note: `/api/v1/nonexistent` is unrouted, so route middleware never runs on it, and that assertion may fail. If it does, rule: `no-store` goes on routed responses only. An unrouted 404 carries no data worth caching. Drop that URL from the loop and record the ruling.

In `tests/TestCase.php`, override `actingAs` so existing tests carry a live gateway session:

```php
    /**
     * Signed in as the gateway would leave it (GatewaySession checks this on every request).
     */
    public function actingAs(UserContract $user, $guard = null)
    {
        $this->withSession(['gateway' => ['sid' => 'sid-test', 'sub' => 'sub-test', 'checked_at' => now()->getTimestamp()]]);

        return parent::actingAs($user, $guard);
    }
```

Add `use Illuminate\Contracts\Auth\Authenticatable as UserContract;`. The signature matches `InteractsWithAuthentication::actingAs`.

- [ ] **Step 2: Commit the tests and push (RED).**

```bash
git add -A appv3/backend/tests
git commit -m "test(backend): the logbook locks when the gateway session ends"
git push
```

Expected: the lock, backstop, no-gateway-session and no-store tests fail; no introspection happens yet.

- [ ] **Step 3: Implement** `app/Http/Middleware/GatewaySession.php`:

```php
<?php

namespace App\Http\Middleware;

use App\Services\Gateway;
use App\Support\Problem;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Auto-lock (MICROAPP_AUTH.md §5-§7): on every request from someone signed in, ask the gateway whether
 * their session there is still live. No cache. Fail open when the gateway can't be asked, but only for
 * BACKSTOP_SECONDS after its last good answer. Every response says no-store, so Back and refresh ask again.
 */
final class GatewaySession
{
    public const BACKSTOP_SECONDS = 15 * 60;

    private const NO_STORE = [
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
        'Expires' => '0',
    ];

    public function __construct(private readonly Gateway $gateway) {}

    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $this->lockIfSignedOut($request)
            ? Problem::response(Response::HTTP_UNAUTHORIZED, 'UNAUTHORIZED', 'You were signed out at the Rizurf gateway. Reload the page to sign in again.', null, null, $request)
            : $next($request);

        $response->headers->add(self::NO_STORE);

        return $response;
    }

    /** True when someone was signed in here but the gateway no longer vouches for them; signs them out. */
    private function lockIfSignedOut(Request $request): bool
    {
        if (! Auth::guard('web')->check()) {
            return false;
        }

        $gateway = $request->session()->get('gateway');
        $live = is_array($gateway) && is_string($gateway['sid'] ?? null) && is_string($gateway['sub'] ?? null)
            ? $this->gateway->isLive($gateway['sid'], $gateway['sub'])
            : false;

        if ($live === null) {
            // The gateway can't be asked: stay open only while its last good answer is recent.
            $checkedAt = is_array($gateway) ? (int) ($gateway['checked_at'] ?? 0) : 0;
            $live = now()->getTimestamp() - $checkedAt <= self::BACKSTOP_SECONDS;
        } elseif ($live) {
            $request->session()->put('gateway.checked_at', now()->getTimestamp());
        }

        if ($live) {
            return false;
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return true;
    }
}
```

In `routes/portal.php`, the group line becomes:

```php
Route::prefix('api/v1')->middleware(['throttle:portal-api', GatewaySession::class])->group(function (): void {
```

(`use App\Http\Middleware\GatewaySession;`.)

- [ ] **Step 4: Pint, commit, push, and check CI.**

```bash
php "$TEMP/pinttool/vendor/bin/pint" app tests routes
git add -A appv3/backend
git commit -m "feat(backend): lock on gateway sign-out, checked on every request; no-store on every response"
git push
```

Expected: the whole suite is green. Every older test signs in with `actingAs`, which now carries a live gateway session, and the fake gateway answers `active: true`.

---

### Task 4: `php artisan logbook:user` — who may use the logbook, and as what

**Files:**
- Modify: `appv3/backend/routes/console.php`
- Create: `appv3/backend/tests/Feature/UserCommandTest.php`

**Interfaces:**
- Produces: `php artisan logbook:user {email} {name} {role} {--company=}`. It adds or updates a row in `users`, matching email case-insensitively.

- [ ] **Step 1: Write the failing tests.** Create `tests/Feature/UserCommandTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class UserCommandTest extends TestCase
{
    public function test_adds_a_supervisor_to_a_new_company(): void
    {
        $this->artisan('logbook:user', ['email' => 'New.Person@Acme.com', 'name' => 'New Person', 'role' => 'supervisor', '--company' => 'Acme'])
            ->assertSuccessful();

        $user = User::query()->where('email', 'new.person@acme.com')->firstOrFail();
        $this->assertSame('supervisor', $user->role);
        $this->assertSame('New Person', $user->name);
        $this->assertSame('Acme', $user->company?->name);
    }

    public function test_updates_an_existing_person_matched_by_email_in_any_case(): void
    {
        $this->artisan('logbook:user', ['email' => 'AISHA.RAHMAN@student.example.edu', 'name' => 'Aisha Rahman', 'role' => 'supervisor', '--company' => 'Nusantara Digital'])
            ->assertSuccessful();

        $this->assertSame('supervisor', $this->user('student-1')->role);
        $this->assertSame(1, User::query()->whereRaw('LOWER(email) = ?', ['aisha.rahman@student.example.edu'])->count());
    }

    public function test_rejects_an_unknown_role(): void
    {
        $this->artisan('logbook:user', ['email' => 'x@acme.com', 'name' => 'X', 'role' => 'admin', '--company' => 'Acme'])
            ->assertFailed();
        $this->assertNull(User::query()->where('email', 'x@acme.com')->first());
    }

    public function test_asks_which_company_when_there_is_more_than_one(): void
    {
        // The seed has two companies (Nusantara Digital and Merlion Systems).
        $this->artisan('logbook:user', ['email' => 'x@acme.com', 'name' => 'X', 'role' => 'student'])
            ->expectsOutputToContain('--company')
            ->assertFailed();
    }
}
```

- [ ] **Step 2: Commit the tests and push (RED).** Expected: every test fails with "The command "logbook:user" does not exist."

- [ ] **Step 3: Implement.** In `routes/console.php`, add these imports: `use App\Models\Company; use App\Models\User; use Illuminate\Support\Str;`. Then add:

```php
Artisan::command(
    'logbook:user {email} {name} {role : student or supervisor} {--company= : The company name; created if new. Defaults to the only company}',
    function (string $email, string $name, string $role): int {
        if (! in_array($role, User::ROLES, true)) {
            $this->error('The role must be student or supervisor.');

            return 1;
        }

        $companyName = trim((string) $this->option('company'));
        if ($companyName !== '') {
            $company = Company::query()->firstOrCreate(['name' => $companyName], ['id' => (string) Str::uuid()]);
        } else {
            $companies = Company::query()->limit(2)->get();
            if ($companies->count() !== 1) {
                $this->error('Say which company with --company="Company name".');

                return 1;
            }
            $company = $companies->first();
        }

        $email = strtolower(trim($email));
        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first()
            ?? new User(['id' => (string) Str::uuid(), 'email' => $email]);
        $user->fill(['name' => $name, 'role' => $role, 'company_id' => $company->id])->save();

        $this->info("{$email} can now sign in through the gateway as a {$role} at {$company->name}.");

        return 0;
    }
)->purpose('Add or update someone who may use the logbook (they sign in through the Rizurf gateway)');
```

- [ ] **Step 4: Pint, commit, push, and check CI.** Expected: green, with 4 `UserCommandTest` tests.

---

### Task 5: The screens sign in through the gateway

**Repo:** `C:\Users\User\Downloads\Rizurf_Logbook\intern-logbook`, branch `feat/step-4b-gateway-sign-in` from `master` (which tracks `origin/logbook-prototype`).

**Files:**
- Create: `src/data/signin.ts`, `tests/unit/signin.test.ts`
- Delete: `src/views/SignIn.vue`
- Modify: `src/data/api.ts`, `src/main.ts`, `src/router.ts`, `src/stores/session.ts`, `src/components/RoleSwitcher.vue`, `tests/unit/api.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/auth/sign-in`, `POST /api/v1/auth/gateway {code}` → `Me`.
- Produces:
  - `signInThroughGateway(go?: (url: string) => void): Promise<Me | null>`
  - `finishSignIn(code: string): Promise<Me>`
  - `SIGN_IN_URL: string`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/signin.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ME = { id: 'supervisor-1', name: 'Sarah Lim', role: 'supervisor' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const load = async () => { vi.resetModules(); return import('../../src/data/signin'); };

let posted: unknown[];
function server(opts: { signedIn: boolean; exchange?: Response }) {
  let signedIn = opts.signedIn;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/gateway')) {
      posted.push(JSON.parse(init.body as string));
      const res = opts.exchange ?? json(200, ME);
      if (res.ok) signedIn = true;
      return res;
    }
    if (url.endsWith('/api/v1/me')) return signedIn ? json(200, ME) : json(401, { error: { code: 'UNAUTHORIZED', message: 'No session', correlation_id: 'c', details: null } });
    return json(404, {});
  }));
}

beforeEach(() => { posted = []; sessionStorage.clear(); history.replaceState(null, '', '/intern-logbook/#/student/notepad'); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('signInThroughGateway', () => {
  it('finishes a sign-in the gateway sent back, and removes the code from the address first', async () => {
    history.replaceState(null, '', '/intern-logbook/?code=one-time#/student/notepad');
    server({ signedIn: false });
    const { signInThroughGateway } = await load();

    const me = await signInThroughGateway(() => { throw new Error('should not redirect'); });

    expect(me).toEqual(ME);
    expect(posted).toEqual([{ code: 'one-time' }]);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/student/notepad');
  });

  it('sends someone without a session to the gateway', async () => {
    server({ signedIn: false });
    const { signInThroughGateway, } = await load();
    const go = vi.fn();

    expect(await signInThroughGateway(go)).toBeNull();
    expect(go).toHaveBeenCalledWith('/api/v1/auth/sign-in');
  });

  it('stops after one trip to the gateway instead of looping', async () => {
    server({ signedIn: false });
    const { signInThroughGateway } = await load();
    await signInThroughGateway(vi.fn());

    await expect(signInThroughGateway(vi.fn())).rejects.toThrow("Couldn't sign you in through the Rizurf gateway.");
  });

  it("shows the server's reason when the logbook refuses the sign-in", async () => {
    history.replaceState(null, '', '/intern-logbook/?code=one-time');
    server({ signedIn: false, exchange: json(403, { error: { code: 'FORBIDDEN', message: "stranger@example.com isn't set up in the logbook yet.", correlation_id: 'c', details: null } }) });
    const { signInThroughGateway } = await load();

    await expect(signInThroughGateway(vi.fn())).rejects.toThrow("stranger@example.com isn't set up in the logbook yet.");
    expect(location.search).toBe('');
  });

  it('an existing session needs no trip to the gateway', async () => {
    server({ signedIn: true });
    const { signInThroughGateway } = await load();
    const go = vi.fn();

    expect(await signInThroughGateway(go)).toEqual(ME);
    expect(go).not.toHaveBeenCalled();
  });
});
```

In `tests/unit/api.test.ts`, add:

```ts
  it('a 401 in the middle of a session says how to keep unsaved text', async () => {
    stub(() => json(401, { error: { code: 'UNAUTHORIZED', message: 'You were signed out at the Rizurf gateway.', correlation_id: 'c', details: null } }));
    const { api } = await load();

    await expect(api('me/logbook')).rejects.toMatchObject({
      status: 401,
      message: "You're signed out. Copy anything you haven't saved, then reload the page to sign in again.",
    });
  });
```

Run: `npx vitest run tests/unit/signin.test.ts tests/unit/api.test.ts`
Expected: FAIL, because `src/data/signin` doesn't exist and the 401 message is the server's.

- [ ] **Step 2: `src/data/api.ts`.**
  - Delete `signIn` and `signOut`.
  - Below `quote`, add:

```ts
const SIGNED_OUT = "You're signed out. Copy anything you haven't saved, then reload the page to sign in again.";

/** Sends the browser to the Rizurf gateway, which sends it back to these screens with a one-time code. */
export const SIGN_IN_URL = `${API_URL}/api/v1/auth/sign-in`;
```

  - In `problemText`, after the 412 line, add: `if (status === 401) return SIGNED_OUT;`.
  - At the end of the file, add:

```ts
/** Swaps the gateway's one-time code for a logbook session (the server verifies it with the gateway). */
export async function finishSignIn(code: string): Promise<Me> {
  return (await api<Me>('auth/gateway', { method: 'POST', body: { code } })).data;
}
```

`finishSignIn`'s own errors are 403 (not in the logbook), 401 (the gateway refused) and 503. The 401 override replaces the server's text for a refused code too. That's acceptable: reloading starts a fresh sign-in, which is the right advice.

- [ ] **Step 3: Create `src/data/signin.ts`.**

```ts
import { currentUser, finishSignIn, SIGN_IN_URL, type Me } from './api';

const KEY = 'il.signin';
/** A second trip to the gateway this soon means the first one didn't stick (blocked cookies, a refused code). */
const LOOP_MS = 60_000;

const tried = (): boolean => { try { return Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < LOOP_MS; } catch { return false; } };
const remember = () => { try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked: no loop guard */ } };
const forget = () => { try { sessionStorage.removeItem(KEY); } catch { /* nothing to forget */ } };

/**
 * Server mode start-up (MICROAPP_AUTH.md §4). Finishes a sign-in the gateway just sent back, or sends the
 * browser to the gateway. Returns who is signed in, or null when the browser is on its way to the gateway.
 */
export async function signInThroughGateway(go: (url: string) => void = url => location.assign(url)): Promise<Me | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    // The one-time code must not stay in the address bar, history or a bookmark.
    params.delete('code');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    await finishSignIn(code);
  }

  const me = await currentUser();
  if (me) { forget(); return me; }
  if (tried()) {
    forget();
    throw new Error("Couldn't sign you in through the Rizurf gateway. Open the logbook from the gateway again.");
  }
  remember();
  go(SIGN_IN_URL);
  return null;
}
```

- [ ] **Step 4: Wire it in; remove the sign-in form.**
  - `src/main.ts`:
    - Replace `import { SERVER_MODE, currentUser } from './data/api';` with `import { SERVER_MODE } from './data/api';` and `import { signInThroughGateway } from './data/signin';`.
    - The server-mode block becomes:

```ts
  if (SERVER_MODE) {
    const me = await signInThroughGateway();
    if (!me) return; // on the way to the gateway
    setRepository(new HttpRepository(me));
    session.signedIn(me);
    await session.loadStudents();
  } else {
```

  - `src/router.ts`:
    - Delete the `/sign-in` route.
    - Delete the two `sign-in` lines in `beforeEach`.
    - Delete the `SERVER_MODE` import.
  - `src/stores/session.ts`:
    - Delete `signIn` and `signOut`, their import, and their entries in the returned object.
  - `src/components/RoleSwitcher.vue`:
    - Delete `leave()` and the Sign out button.
    - The server-mode block keeps only `<span v-if="session.me" class="muted">Signed in as <strong>{{ session.me.name }}</strong></span>`.
  - Delete `src/views/SignIn.vue`.

Run: `grep -rn "SignIn.vue\|sign-in'\|signOut\|signIn(" src tests e2e`
Expected: no output. (`signInThroughGateway` and `SIGN_IN_URL` don't match.)

- [ ] **Step 5: Run everything (GREEN).**

Run: `npx vitest run; npm run build; npm run e2e`
Expected: every unit test passes (128 + 6 = 134), the build passes, and 11/11 e2e pass. The e2e tests run in browser mode, which doesn't touch sign-in.

- [ ] **Step 6: Commit.**

```bash
git add -A src tests
git commit -m "feat: sign in through the Rizurf gateway; no sign-in form or sign-out button"
```

---

### Task 6: Docs

**Files:**
- Modify: `rizurf-logbook-app/appv3/DEPLOY.md`, `intern-logbook/README.md` ("Server mode"), `intern-logbook/docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md` (Step 4b)

- [ ] **Step 1: DEPLOY.md.**
  - In §4's `.env` block, add:

```ini
GATEWAY_URL=https://gateway.company.com      # the Rizurf gateway
PUBLIC_URL=https://logbook.company.com       # these screens, exactly as registered with the gateway
```

  - Add a paragraph: "The API refuses to start without both. `PUBLIC_URL` is published as the app's address in `/api/v1/openapi.json`, and the gateway sends people back there after they sign in."
  - Add a new section after §6:

````markdown
## 7. Who may use the logbook

Everyone signs in through the Rizurf gateway; the logbook stores no passwords. It only needs to know who is an intern and who is a supervisor, and at which company:

```bash
php artisan logbook:user sarah.lim@company.com "Sarah Lim" supervisor --company="Company Sdn Bhd"
php artisan logbook:user aisha@student.edu "Aisha Rahman" student
```

The email must be the one the person uses at the gateway. Run the command again to change someone's role. Someone who isn't added sees "…isn't set up in the logbook yet".
````

  - In "Test server", add: "The test server needs its own gateway registration. For testing the screens from a PC (the README's dev proxy), set its `PUBLIC_URL=http://localhost:5173/intern-logbook`. The seeded demo people only sign in if the gateway has accounts with the same emails; add real test accounts with `logbook:user`."
  - In "Updating", add a line: "Updating to this version signs everyone out once (the session cookie is renamed)."

- [ ] **Step 2: README "Server mode".** Replace "Sign in with a test-server account: …" (through the end of that list) with:

```markdown
Opening the page sends you to the Rizurf gateway to sign in, then back here. For that to work from your PC, the test server's `PUBLIC_URL` must be `http://localhost:5173/intern-logbook` and your gateway email must be in its logbook (`php artisan logbook:user`, see DEPLOY.md). There is no sign-out button: sign out at the gateway, and the logbook locks on its next request.
```

- [ ] **Step 3: Roadmap Step 4b.** Replace the line "On a `401`, the screens send the browser to the gateway's sign-in page (guarded in `sessionStorage` so it can't loop)." with:

```markdown
- Opening the screens without a session sends the browser to the gateway (once; a second failure within a minute shows an error instead of looping). A `401` in the middle of a session tells the person to copy unsaved text and reload, rather than redirecting and losing it.
- People are added with `php artisan logbook:user` (email, name, role, company).
```

- [ ] **Step 4: Commit both repos.**

```bash
cd C:/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app && git add appv3/DEPLOY.md && git commit -m "docs(deploy): gateway settings and adding people" && git push
cd ../intern-logbook && git add README.md docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md && git commit -m "docs: sign-in through the gateway"
```

---

## After the tasks

- Final whole-branch review of both branches; one fix pass.
- PRs: backend → `master`, prototype → `logbook-prototype`. They merge together, when the user says so.
- **Live proof, on the VPS test server with the real gateway** (MICROAPP_AUTH.md §9, last line): sign in, open the logbook in one tab, sign out at the gateway in another, refresh the logbook tab. It must lock with no delay. Also check that pressing Back after signing out doesn't show logbook data.
