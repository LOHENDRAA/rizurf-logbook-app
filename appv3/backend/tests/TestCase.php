<?php

namespace Tests;

use App\Models\LogbookTemplate;
use App\Models\User;
use Database\Seeders\PortalSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected const CSRF = 'test-csrf-token';

    protected function setUp(): void
    {
        parent::setUp();

        // The seeded programme and the test dates assume this "today"; without it the
        // tests start failing as the real calendar moves past the seeded weeks.
        Carbon::setTestNow(Carbon::parse('2026-09-21 12:00:00', 'Asia/Kuala_Lumpur'));

        $this->seed(PortalSeeder::class);
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
                'X-Request-Id' => (string) Str::uuid(),
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
}
