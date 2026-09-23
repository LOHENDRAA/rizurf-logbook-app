<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Structured access log: method, path, status, latency, user, request id.
 * Bodies, credentials, and journal text are never logged.
 */
final class RequestLoggingMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $started = microtime(true);

        /** @var Response $response */
        $response = $next($request);

        $user = $request->user();

        Log::info(json_encode([
            'event' => 'portal.request',
            'method' => $request->getMethod(),
            'path' => '/'.ltrim((string) $request->path(), '/'),
            'status' => $response->getStatusCode(),
            'latency_ms' => (int) round((microtime(true) - $started) * 1000),
            'user_id' => $user?->getAuthIdentifier(),
            'request_id' => $request->attributes->get('requestId'),
        ], JSON_UNESCAPED_SLASHES));

        return $response;
    }
}
