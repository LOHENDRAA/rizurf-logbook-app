<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_login_returns_session_user(): void
    {
        $response = $this->portal('POST', '/api/v1/auth/login', [
            'email' => 'aisha.rahman@student.example.edu',
            'password' => 'test-password',
        ]);

        $response->assertOk();
        $response->assertJsonPath('id', 'student-1');
        $response->assertJsonPath('role', 'student');
        $response->assertJsonPath('capabilities', ['canEdit' => true, 'canSubmit' => true, 'canReview' => false]);
        $response->assertHeader('X-Correlation-ID');

        $this->assertAuthenticatedAs($this->user('student-1'));
    }

    public function test_login_rejects_bad_password_with_401_problem(): void
    {
        $response = $this->portal('POST', '/api/v1/auth/login', [
            'email' => 'aisha.rahman@student.example.edu',
            'password' => 'wrong',
        ]);

        $response->assertUnauthorized();
        $response->assertJsonPath('error.code', 'UNAUTHORIZED');
        $this->assertNotEmpty($response->json('error.correlation_id'));
        $this->assertGuest();
    }

    public function test_login_rejects_unknown_email_with_401(): void
    {
        $response = $this->portal('POST', '/api/v1/auth/login', [
            'email' => 'nobody@example.edu',
            'password' => 'test-password',
        ]);

        $response->assertUnauthorized();
        $response->assertJsonPath('error.code', 'UNAUTHORIZED');
    }

    public function test_login_validates_input_with_422(): void
    {
        $response = $this->portal('POST', '/api/v1/auth/login', ['email' => 'not-an-email']);

        $response->assertUnprocessable();
        $response->assertJsonPath('error.code', 'VALIDATION_ERROR');
        $this->assertNotEmpty($response->json('error.details'));
    }

    public function test_login_is_rate_limited(): void
    {
        config(['portal.login_rate_per_minute' => 2]);
        RateLimiter::clear('aisha.rahman@student.example.edu|127.0.0.1');

        $payload = ['email' => 'aisha.rahman@student.example.edu', 'password' => 'wrong'];
        $this->portal('POST', '/api/v1/auth/login', $payload)->assertUnauthorized();
        $this->portal('POST', '/api/v1/auth/login', $payload)->assertUnauthorized();

        $limited = $this->portal('POST', '/api/v1/auth/login', $payload);
        $limited->assertStatus(429);
        $limited->assertJsonPath('error.code', 'RATE_LIMITED');
    }

    public function test_csrf_cookie_returns_204_and_sets_cookies(): void
    {
        $response = $this->get('/sanctum/csrf-cookie');

        $response->assertNoContent();
        $response->assertCookie('XSRF-TOKEN');
    }

    public function test_me_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/me');

        $response->assertUnauthorized();
        $response->assertJsonPath('error.code', 'UNAUTHORIZED');
        $response->assertJsonPath('error.message', 'Your session has expired. Please sign in again.');
    }

    public function test_me_returns_session_user_with_capabilities(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/me');

        $response->assertOk();
        $response->assertJsonPath('id', 'supervisor-1');
        $response->assertJsonPath('role', 'supervisor');
        $response->assertJsonPath('capabilities.canReview', true);
    }

    public function test_logout_invalidates_session(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('POST', '/api/v1/auth/logout')->assertNoContent();

        $this->assertGuest();
        $this->getJson('/api/v1/me')->assertUnauthorized();
    }
}
