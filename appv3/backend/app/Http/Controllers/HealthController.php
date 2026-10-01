<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
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
     * The API's own description. Decoded to objects (not arrays) so {} stays {}; app_url comes from PUBLIC_URL.
     */
    public function openapi(): JsonResponse
    {
        /** @var \stdClass $doc */
        $doc = json_decode((string) file_get_contents(resource_path('openapi.json')), flags: JSON_THROW_ON_ERROR);
        // Where the gateway's "Open app" button, and its sign-in, send people (SS-23).
        $doc->info->{'x-rizurf'}->app_url = (string) config('portal.public_url').'/';

        return response()->json($doc, 200, [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
