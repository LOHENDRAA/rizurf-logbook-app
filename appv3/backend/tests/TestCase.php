<?php

namespace Tests;

use App\Models\User;
use Database\Seeders\PortalSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected const CSRF = 'test-csrf-token';

    protected function setUp(): void
    {
        parent::setUp();

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
        return $this
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
}
