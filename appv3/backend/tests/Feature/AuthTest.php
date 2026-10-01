<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Sessions as the screens see them. Sign-in itself is in GatewaySignInTest.
 */
class AuthTest extends TestCase
{
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

    public function test_a_session_row_keeps_its_signed_in_user(): void
    {
        // User ids are strings (UUIDs). In a numeric sessions.user_id column MySQL refuses the row, and Laravel's
        // database session handler then drops the session without an error: every request after sign-in is signed out.
        DB::table('sessions')->insert(['id' => 'session-1', 'user_id' => 'student-1', 'payload' => '', 'last_activity' => time()]);

        $this->assertSame('student-1', DB::table('sessions')->where('id', 'session-1')->value('user_id'));
    }
}
