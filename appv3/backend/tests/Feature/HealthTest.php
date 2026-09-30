<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_names_the_service_and_its_database(): void
    {
        $this->getJson('/api/v1/health')->assertOk()->assertExactJson([
            'status' => 'ok',
            'service' => 'intern-logbook',
            'version' => '1.0.0',
            'checks' => ['database' => true],
        ]);
    }

    public function test_health_is_degraded_but_still_200_when_the_database_is_down(): void
    {
        $default = config('database.default');
        config([
            'database.connections.broken' => ['driver' => 'sqlite', 'database' => '/nonexistent/dir/db.sqlite', 'prefix' => ''],
            'database.default' => 'broken',
        ]);

        try {
            $this->getJson('/api/v1/health')
                ->assertOk()
                ->assertJsonPath('status', 'degraded')
                ->assertJsonPath('checks.database', false);
        } finally {
            // RefreshDatabase rolls back on the default connection at teardown.
            config(['database.default' => $default]);
            DB::purge('broken');
        }
    }
}
