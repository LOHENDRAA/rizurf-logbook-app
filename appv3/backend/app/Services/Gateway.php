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

    /** Seconds of clock difference with the gateway tolerated on exp, iat and nbf. */
    private const LEEWAY_SECONDS = 30;

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

            JWK::parseKeySet($response->json(), 'RS256'); // throws on a set we can't use, so it isn't kept

            return $response->json();
        });

        return JWK::parseKeySet($jwks, 'RS256');
    }

    private function url(): string
    {
        return (string) config('portal.gateway_url');
    }
}
