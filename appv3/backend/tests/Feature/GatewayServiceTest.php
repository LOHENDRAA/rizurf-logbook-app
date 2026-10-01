<?php

namespace Tests\Feature;

use App\Services\Gateway;
use App\Support\ApiProblemException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
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
            'expired' => [['exp' => time() - 120]],
            'no expiry' => [['exp' => null]],
            'no session id' => [['sid' => null]],
        ];
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    #[DataProvider('badClaims')]
    public function test_verify_fails_closed(array $claims): void
    {
        $this->expectException(ApiProblemException::class);

        $this->gateway()->verify($this->identityToken($claims), 'identity');
    }

    public function test_verify_allows_for_the_gateway_clock_running_a_little_ahead(): void
    {
        $this->assertSame('sid-1', $this->gateway()->verify($this->identityToken(['iat' => time() + 20, 'nbf' => time() + 20]), 'identity')['sid']);
    }

    public function test_a_bad_key_set_is_not_kept(): void
    {
        $this->gatewayJwks = ['keys' => []];
        try {
            $this->gateway()->verify($this->identityToken(), 'identity');
            $this->fail('A token checked against an empty key set must be refused.');
        } catch (ApiProblemException) {
        }

        $this->gatewayJwks = null; // the gateway serves its keys again
        $this->assertSame('sid-1', $this->gateway()->verify($this->identityToken(), 'identity')['sid']);
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
