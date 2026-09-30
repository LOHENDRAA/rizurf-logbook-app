<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The gateway's health contract (RIZURF_API_TEMPLATE.md SS-2): public, 200, and
 * "degraded" rather than "ok" while the database is unreachable.
 */
final class HealthController extends Controller
{
    public const SERVICE = 'intern-logbook';

    public const VERSION = '1.0.0';

    public function health(): JsonResponse
    {
        // ponytail: a MySQL server that hangs instead of refusing makes this slower than the 1s SHOULD; add a PDO connect timeout if the checker flags it.
        try {
            DB::connection()->select('select 1');
            $database = true;
        } catch (Throwable) {
            $database = false;
        }

        return response()->json([
            'status' => $database ? 'ok' : 'degraded',
            'service' => self::SERVICE,
            'version' => self::VERSION,
            'checks' => ['database' => $database],
        ]);
    }

    /**
     * The API's own description, served as stored: decoding and re-encoding would turn {} into [].
     */
    public function openapi(): Response
    {
        return response((string) file_get_contents(resource_path('openapi.json')), 200, ['Content-Type' => 'application/json']);
    }
}
