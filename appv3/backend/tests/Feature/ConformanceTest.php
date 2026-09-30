<?php

namespace Tests\Feature;

use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * What the gateway's /conformance page probes from outside (RIZURF_API_TEMPLATE.md SS-4, SS-5, SS-25).
 */
class ConformanceTest extends TestCase
{
    public function test_unknown_path_returns_the_error_envelope(): void
    {
        $response = $this->getJson('/api/v1/nonexistent', ['X-Correlation-ID' => 'trace-1']);

        $response->assertNotFound();
        $response->assertHeader('X-Correlation-ID', 'trace-1');
        $response->assertExactJson(['error' => [
            'code' => 'RESOURCE_NOT_FOUND',
            'message' => 'The requested resource could not be found.',
            'correlation_id' => 'trace-1',
            'details' => null,
        ]]);
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));
    }

    public function test_wrong_method_is_405_with_allow_header(): void
    {
        $response = $this->deleteJson('/api/v1/me/logbook');

        $response->assertStatus(405);
        $response->assertJsonPath('error.code', 'METHOD_NOT_ALLOWED');
        $this->assertStringContainsString('GET', (string) $response->headers->get('Allow'));
        $this->assertNotEmpty($response->headers->get('X-Correlation-ID'));
    }

    public function test_anonymous_call_is_401_envelope(): void
    {
        $response = $this->getJson('/api/v1/me/logbook');

        $response->assertUnauthorized();
        $response->assertJsonPath('error.code', 'UNAUTHORIZED');
        $this->assertSame($response->headers->get('X-Correlation-ID'), $response->json('error.correlation_id'));
    }

    public function test_forged_identity_header_signs_nobody_in(): void
    {
        $this->getJson('/api/v1/me', ['X-Authenticated-User' => 'supervisor-1'])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHORIZED');
    }

    public function test_correlation_id_is_minted_when_absent_or_too_long(): void
    {
        $minted = $this->getJson('/api/v1/me')->headers->get('X-Correlation-ID');
        $this->assertTrue(Str::isUuid((string) $minted));

        $replaced = $this->getJson('/api/v1/me', ['X-Correlation-ID' => str_repeat('a', 129)])->headers->get('X-Correlation-ID');
        $this->assertTrue(Str::isUuid((string) $replaced));
    }

    public function test_validation_errors_list_the_fields_in_details(): void
    {
        $this->actingAs($this->user('student-1'))
            ->getJson('/api/v1/me/journal/weeks?page=0')
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_ERROR')
            ->assertJsonPath('error.details.page.0', 'Page must be an integer of 1 or more.');
    }

    public function test_deleting_a_missing_template_is_404_not_204(): void
    {
        $this->actingAs($this->user('supervisor-1'))
            ->portal('DELETE', '/api/v1/templates/missing', [], ['If-Match' => '"v-1"'])
            ->assertNotFound()
            ->assertJsonPath('error.code', 'RESOURCE_NOT_FOUND');
    }

    public function test_a_failed_csrf_check_is_401_unauthorized(): void
    {
        // The CSRF middleware skips itself under unit tests, so raise what it would throw.
        $this->app['router']->post('/api/v1/_csrf', fn () => throw new TokenMismatchException);

        $this->postJson('/api/v1/_csrf')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHORIZED');
    }

    public function test_reserved_codes_are_only_used_for_their_own_statuses(): void
    {
        foreach ([403 => 'FORBIDDEN', 503 => 'SERVICE_UNAVAILABLE', 415 => 'HTTP_415'] as $status => $code) {
            $this->app['router']->get("/api/v1/_status_{$status}", fn () => abort($status));

            $this->getJson("/api/v1/_status_{$status}")
                ->assertStatus($status)
                ->assertJsonPath('error.code', $code);
        }
    }

    public function test_upload_over_the_server_limit_is_413_payload_too_large(): void
    {
        $this->app['router']->post('/api/v1/_too_large', fn () => abort(413));

        $this->postJson('/api/v1/_too_large')
            ->assertStatus(413)
            ->assertJsonPath('error.code', 'PAYLOAD_TOO_LARGE');
    }
}
