<?php

namespace Tests;

use App\Models\LogbookTemplate;
use App\Models\User;
use Database\Seeders\PortalSeeder;
use Firebase\JWT\JWT;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Psr7\Request as GuzzleRequest;
use Illuminate\Contracts\Auth\Authenticatable as UserContract;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected const CSRF = 'test-csrf-token';

    /** What the fake gateway's /oauth/token returns; null answers 400 (code refused). */
    protected ?string $gatewayToken = null;

    /** What the fake gateway's /oauth/introspect answers; null fails that connection. */
    protected ?bool $gatewayLive = true;

    /**
     * What the fake gateway's key set endpoint returns; null serves the real test key.
     *
     * @var array<string, mixed>|null
     */
    protected ?array $gatewayJwks = null;

    /** Every connection to the fake gateway fails. */
    protected bool $gatewayDown = false;

    /** The fake OpenAI's HTTP status. Anything but 200 answers with an error that quotes the key, as OpenAI does. */
    protected int $openAiStatus = 200;

    /** Every connection to the fake OpenAI fails. */
    protected bool $openAiDown = false;

    /** @var array{private: string, jwk: array<string, string>}|null */
    private static ?array $gatewayKey = null;

    protected function setUp(): void
    {
        parent::setUp();

        // Nothing leaves the test run; the gateway is the fake below.
        Http::preventStrayRequests();
        Http::fake(fn (ClientRequest $request) => $this->fakeGateway($request));

        // The seeded programme and the test dates assume this "today"; without it the
        // tests start failing as the real calendar moves past the seeded weeks.
        Carbon::setTestNow(Carbon::parse('2026-09-21 12:00:00', 'Asia/Kuala_Lumpur'));

        $this->seed(PortalSeeder::class);
    }

    /**
     * Signed in as the gateway would leave it: GatewaySession checks this on every request.
     * be() rather than actingAs(), because actingAs() calls be() and most tests call be() directly.
     */
    public function be(UserContract $user, $guard = null)
    {
        $this->withSession(['gateway' => ['sid' => 'sid-test', 'sub' => 'sub-test', 'checked_at' => now()->getTimestamp()]]);

        return parent::be($user, $guard);
    }

    protected function user(string $id): User
    {
        return User::query()->findOrFail($id);
    }

    /**
     * Authenticated JSON request with a valid CSRF pair (session + header).
     */
    protected function portal(string $method, string $uri, array $data = [], array $headers = []): TestResponse
    {
        // withHeaders() sticks for the rest of the test; start clean so one call's If-Match can't leak into the next.
        return $this
            ->flushHeaders()
            ->withSession(['_token' => self::CSRF])
            ->withHeaders(array_merge([
                'X-CSRF-TOKEN' => self::CSRF,
                'X-Correlation-ID' => (string) Str::uuid(),
            ], $headers))
            ->json($method, $uri, $data);
    }

    protected function idemKey(): string
    {
        return (string) Str::uuid();
    }

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
            str_ends_with($url, '/.well-known/jwks.json') => Http::response($this->gatewayJwks ?? ['keys' => [self::gatewayKey()['jwk']]]),
            str_ends_with($url, '/oauth/token') => $this->gatewayToken === null
                ? Http::response(['error' => 'invalid_grant'], 400)
                : Http::response(['token' => $this->gatewayToken, 'token_type' => 'Bearer', 'expires_in' => 300]),
            str_ends_with($url, '/oauth/introspect') => $this->gatewayLive === null
                ? throw new ConnectException('Gateway down', new GuzzleRequest('POST', $url))
                : Http::response(['active' => $this->gatewayLive]),
            str_starts_with($url, 'https://api.openai.com/') => $this->fakeOpenAi($request),
            default => Http::response('Unexpected call to '.$url, 500),
        };
    }

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
}
