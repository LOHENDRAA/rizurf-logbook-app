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

    public function test_sending_people_to_the_gateway_is_not_held_to_the_sign_in_limit(): void
    {
        config(['portal.login_rate_per_minute' => 1]);

        $this->get('/api/v1/auth/sign-in')->assertRedirect();
        $this->get('/api/v1/auth/sign-in')->assertRedirect();
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
