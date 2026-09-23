<?php

use App\Http\Middleware\RequestIdMiddleware;
use App\Http\Middleware\RequestLoggingMiddleware;
use App\Support\Problem;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');
        $middleware->prepend(RequestIdMiddleware::class);
        $middleware->append(RequestLoggingMiddleware::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->is('sanctum/*') || $request->expectsJson(),
        );

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*') && ! $request->is('sanctum/*') && ! $request->expectsJson()) {
                return null;
            }

            return Problem::fromThrowable($e, $request);
        });
    })->create();
