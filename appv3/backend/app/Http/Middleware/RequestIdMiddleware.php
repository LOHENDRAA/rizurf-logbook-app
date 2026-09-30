<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Correlates every request (SS-4): honours an incoming X-Correlation-ID, otherwise mints
 * one. The id is echoed on every response and in error bodies.
 */
final class RequestIdMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $incoming = trim((string) $request->headers->get('X-Correlation-ID', ''));

        $id = $incoming !== '' && strlen($incoming) <= 128 ? $incoming : (string) Str::uuid();

        $request->attributes->set('correlationId', $id);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Correlation-ID', $id);

        return $response;
    }
}
