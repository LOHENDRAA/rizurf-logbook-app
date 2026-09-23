<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Correlates every request: honours an incoming X-Request-Id, otherwise mints
 * one. The id is echoed on the response and embedded in problem+json bodies.
 */
final class RequestIdMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $incoming = trim((string) $request->headers->get('X-Request-Id', ''));

        $id = $incoming !== '' && strlen($incoming) <= 128 ? $incoming : (string) Str::uuid();

        $request->attributes->set('requestId', $id);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Request-Id', $id);

        return $response;
    }
}
