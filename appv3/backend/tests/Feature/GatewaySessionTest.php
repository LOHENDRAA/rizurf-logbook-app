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

    public function test_a_stale_session_does_not_block_signing_in_again(): void
    {
        $this->actingAs($this->user('supervisor-1'));
        $this->gatewayLive = false; // signed out at the gateway, then back in, then "Open app"
        $this->gatewayToken = $this->identityToken(['sid' => 'sid-2']);

        $this->portal('POST', '/api/v1/auth/gateway', ['code' => 'code-2'])->assertOk()->assertJsonPath('id', 'supervisor-1');
        $this->assertSame('sid-2', session('gateway.sid'));
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

        // Routed responses only: an unrouted 404 never reaches route middleware, and carries no data to cache.
        foreach ([$this->getJson('/api/v1/me'), $this->get('/api/v1/auth/sign-in')] as $response) {
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        }
        $this->gatewayLive = false;
        $this->assertStringContainsString('no-store', (string) $this->getJson('/api/v1/me')->headers->get('Cache-Control'));
    }
}
